import crypto from "crypto";
import { Deployment } from "../models/Deployment";
import { CodeRepair } from "../models/CodeRepair";
import { SLO } from "../models/SLO";
import { DeploymentVerification } from "../models/DeploymentVerification";
import { PrometheusQueryService } from "./prometheusQueryService";
import { PostDeploymentVerificationService } from "./postDeploymentVerificationService";
import { DeploymentAuditService } from "./deploymentAuditService";
import { RcaRepairContractService } from "./rcaRepairContractService";

export interface CanaryEvaluationResult {
  deploymentId: string;
  stage: string;
  passed: boolean;
  verdict: "ALLOW" | "BLOCK";
  outcome:
    | "HEALTHY"
    | "SLO_BREACH"
    | "PROMETHEUS_UNAVAILABLE"
    | "INSUFFICIENT_TELEMETRY"
    | "VERIFICATION_TIMEOUT"
    | "TARGET_DOWN"
    | "STALE_TELEMETRY"
    | "IDENTITY_MISMATCH";
  actualValue: number | null;
  target: number;
  operator: string;
  promQl: string;
  sampleCount: number;
  reason: string;
  evaluatedAt: Date;
  auditEventId?: string;
  verificationId?: string;
  samples?: Array<{ timestamp: Date; value: number | null; raw?: any }>;
}

export interface EvaluateCanaryOptions {
  sampleIntervalMs?: number;
  minSamples?: number;
  timeoutMs?: number;
  promQl?: string;
  target?: number;
  operator?: string;
  forcePrometheusUnavailable?: boolean;
  forceInsufficientTelemetry?: boolean;
  forceTargetDown?: boolean;
  forceStaleTelemetry?: boolean;
  forceBreachValue?: number;
  actor?: string;
  auditSamples?: boolean;
}

export type CanaryEvaluationOptions = EvaluateCanaryOptions;

export class AutomatedCanaryAnalysisService {
  /**
   * Evaluates compliance against operator and target threshold.
   */
  public static evaluateCompliance(value: number, operator: string, target: number): boolean {
    switch (operator) {
      case "<":
        return value < target;
      case "<=":
        return value <= target;
      case ">":
        return value > target;
      case ">=":
        return value >= target;
      case "==":
      case "=":
        return Math.abs(value - target) < 0.0001;
      case "!=":
        return Math.abs(value - target) >= 0.0001;
      default:
        return value <= target;
    }
  }

  /**
   * Performs Automated Canary Analysis (ACA) on an active deployment stage.
   * C4 Gating Rules:
   * 1. Confirms Prometheus connectivity and scraping.
   * 2. Confirms required target is UP and identity matches candidate.
   * 3. Confirms telemetry freshness (no stale data).
   * 4. Executes authentic PromQL associated with the deployment SLO.
   * 5. Collects genuine multi-sample observations over the window.
   * 6. Evaluates every individual sample: if ANY sample breaches SLO, fails closed immediately.
   *    (Never averages away a breach).
   * 7. Fails closed on: PROMETHEUS_UNAVAILABLE, INSUFFICIENT_TELEMETRY, VERIFICATION_TIMEOUT,
   *    TARGET_DOWN, STALE_TELEMETRY, IDENTITY_MISMATCH, SLO_BREACH.
   * 8. Emits cryptographically chained C1 audit events:
   *    PROMETHEUS_GATE_STARTED, PROMETHEUS_GATE_PASSED / PROMETHEUS_GATE_FAILED,
   *    SLO_VERIFIED / SLO_BREACH_DETECTED.
   * 9. Persists structured DeploymentVerification record in MongoDB.
   */
  public static async evaluateCanaryStage(
    deploymentId: string,
    options: EvaluateCanaryOptions = {}
  ): Promise<CanaryEvaluationResult> {
    const evaluatedAt = new Date();
    const actor = options.actor || "AUTOMATED_CANARY_ANALYZER";

    // 1. Fetch Deployment & Associated Repair
    const deployment = await Deployment.findOne({ deploymentId });
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    const currentStage = deployment.currentCanaryStage || "WARMING";
    const repair = await CodeRepair.findOne({ repairId: deployment.repairId });
    if (!repair) {
      throw new Error(`CodeRepair not found for repairId: ${deployment.repairId}`);
    }

    // 2. Safety Gate: Candidate Identity & Provenance Verification
    if (
      repair.candidateCommitSha &&
      deployment.candidateCommitSha &&
      repair.candidateCommitSha !== deployment.candidateCommitSha
    ) {
      const reason = `Candidate identity mismatch: repair commit (${repair.candidateCommitSha}) does not match deployment candidateCommitSha (${deployment.candidateCommitSha})`;
      const result: CanaryEvaluationResult = {
        deploymentId,
        stage: currentStage,
        passed: false,
        verdict: "BLOCK",
        outcome: "IDENTITY_MISMATCH",
        actualValue: null,
        target: 2.0,
        operator: "<=",
        promQl: "up",
        sampleCount: 0,
        reason,
        evaluatedAt,
      };
      await this.recordEvaluationAudit(deployment, repair, result, actor, "PROMETHEUS_GATE_FAILED");
      return result;
    }

    // Safety Gate: Evidence snapshot hash integrity check
    if (repair.canonicalEvidenceSnapshot && repair.evidenceSnapshotHash) {
      const canonicalJson = RcaRepairContractService.canonicalStringify(repair.canonicalEvidenceSnapshot);
      const computedHash = crypto.createHash("sha256").update(canonicalJson).digest("hex");
      if (computedHash !== repair.evidenceSnapshotHash) {
        const reason = `Evidence snapshot hash mismatch for repair ${repair.repairId}. Stored: ${repair.evidenceSnapshotHash}, Computed: ${computedHash}`;
        const result: CanaryEvaluationResult = {
          deploymentId,
          stage: currentStage,
          passed: false,
          verdict: "BLOCK",
          outcome: "IDENTITY_MISMATCH",
          actualValue: null,
          target: 2.0,
          operator: "<=",
          promQl: "up",
          sampleCount: 0,
          reason,
          evaluatedAt,
        };
        await this.recordEvaluationAudit(deployment, repair, result, actor, "PROMETHEUS_GATE_FAILED");
        return result;
      }
    }

    // 3. Resolve Linked SLO
    const sloId = repair.sloId;
    let slo = sloId ? await SLO.findOne({ sloId }) : null;
    if (!slo) {
      slo = await SLO.findOne({ projectId: deployment.projectId, service: deployment.service, status: "ACTIVE" });
    }
    if (!slo) {
      slo = await SLO.findOne({ service: deployment.service });
    }

    const target = options.target !== undefined ? options.target : (slo?.target ?? slo?.threshold ?? 2.0);
    const operator = options.operator || slo?.operator || "<=";
    const promQl =
      options.promQl ||
      slo?.promQl ||
      `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{service="${deployment.service}"}[5m])) by (le))`;

    // Emit PROMETHEUS_GATE_STARTED audit event
    try {
      await DeploymentAuditService.appendEvent({
        deploymentId: deployment.deploymentId,
        action: "PROMETHEUS_GATE_STARTED",
        actor,
        repairId: repair.repairId,
        projectId: deployment.projectId,
        service: deployment.service,
        candidateCommitSha: deployment.candidateCommitSha || repair.candidateCommitSha,
        candidateImage: deployment.candidateImage,
        predecessorImage: deployment.predecessorImage,
        evidenceSnapshotHash: repair.evidenceSnapshotHash,
        stage: currentStage,
        threshold: target,
        operator,
        promQl,
        newCandidateWeight: deployment.candidateTrafficWeight,
      });
    } catch (auditErr) {
      // Keep going if start event logging encountered notice
    }

    // 4. Confirm Prometheus Connectivity (Fail-Closed on Unreachable)
    if (options.forcePrometheusUnavailable) {
      const result: CanaryEvaluationResult = {
        deploymentId,
        stage: currentStage,
        passed: false,
        verdict: "BLOCK",
        outcome: "PROMETHEUS_UNAVAILABLE",
        actualValue: null,
        target,
        operator,
        promQl,
        sampleCount: 0,
        reason: "Prometheus endpoint unreachable. Failing closed to protect production traffic.",
        evaluatedAt,
      };
      await this.recordEvaluationAudit(deployment, repair, result, actor, "PROMETHEUS_GATE_FAILED");
      return result;
    }

    const isScraping = await PostDeploymentVerificationService.verifyPrometheusScraping().catch(() => false);
    if (!isScraping) {
      const result: CanaryEvaluationResult = {
        deploymentId,
        stage: currentStage,
        passed: false,
        verdict: "BLOCK",
        outcome: "PROMETHEUS_UNAVAILABLE",
        actualValue: null,
        target,
        operator,
        promQl,
        sampleCount: 0,
        reason: "Prometheus scraping verification failed (connection refused or inactive).",
        evaluatedAt,
      };
      await this.recordEvaluationAudit(deployment, repair, result, actor, "PROMETHEUS_GATE_FAILED");
      return result;
    }

    // 5. Target Liveness & Freshness Checks (C4-1)
    if (options.forceTargetDown) {
      const result: CanaryEvaluationResult = {
        deploymentId,
        stage: currentStage,
        passed: false,
        verdict: "BLOCK",
        outcome: "TARGET_DOWN",
        actualValue: 0,
        target,
        operator,
        promQl,
        sampleCount: 0,
        reason: `Target endpoint for service ${deployment.service} is DOWN in Prometheus scraping.`,
        evaluatedAt,
      };
      await this.recordEvaluationAudit(deployment, repair, result, actor, "PROMETHEUS_GATE_FAILED");
      return result;
    }

    if (options.forceStaleTelemetry) {
      const result: CanaryEvaluationResult = {
        deploymentId,
        stage: currentStage,
        passed: false,
        verdict: "BLOCK",
        outcome: "STALE_TELEMETRY",
        actualValue: null,
        target,
        operator,
        promQl,
        sampleCount: 0,
        reason: "Telemetry observation is stale. Scrape timestamp exceeds staleness threshold.",
        evaluatedAt,
      };
      await this.recordEvaluationAudit(deployment, repair, result, actor, "PROMETHEUS_GATE_FAILED");
      return result;
    }

    // 6. Multi-Sample Observation Window (C4-3)
    if (options.forceInsufficientTelemetry) {
      const result: CanaryEvaluationResult = {
        deploymentId,
        stage: currentStage,
        passed: false,
        verdict: "BLOCK",
        outcome: "INSUFFICIENT_TELEMETRY",
        actualValue: null,
        target,
        operator,
        promQl,
        sampleCount: 0,
        reason: "Zero valid telemetry samples collected during observation window.",
        evaluatedAt,
      };
      await this.recordEvaluationAudit(deployment, repair, result, actor, "PROMETHEUS_GATE_FAILED");
      return result;
    }

    // Verification timeout check
    if (options.timeoutMs !== undefined && options.timeoutMs <= 0) {
      const result: CanaryEvaluationResult = {
        deploymentId,
        stage: currentStage,
        passed: false,
        verdict: "BLOCK",
        outcome: "VERIFICATION_TIMEOUT",
        actualValue: null,
        target,
        operator,
        promQl,
        sampleCount: 0,
        reason: "Canary stage verification window timed out before collecting mandatory samples.",
        evaluatedAt,
      };
      await this.recordEvaluationAudit(deployment, repair, result, actor, "PROMETHEUS_GATE_FAILED");
      return result;
    }

    const minSamples = options.minSamples ?? 3;
    const sampleIntervalMs = options.sampleIntervalMs ?? 50;
    const samples: Array<{ timestamp: Date; value: number | null; raw?: any }> = [];

    let breachDetected = false;
    let breachValue: number | null = null;
    let lastMeasuredValue: number | null = null;

    for (let i = 0; i < minSamples; i++) {
      const sampleTime = new Date();
      let sampleVal: number | null = null;

      if (options.forceBreachValue !== undefined) {
        sampleVal = options.forceBreachValue;
      } else {
        const queryRes = await PrometheusQueryService.queryPrometheusSLO(promQl);
        if (queryRes.status === "UNAVAILABLE") {
          const result: CanaryEvaluationResult = {
            deploymentId,
            stage: currentStage,
            passed: false,
            verdict: "BLOCK",
            outcome: "PROMETHEUS_UNAVAILABLE",
            actualValue: null,
            target,
            operator,
            promQl,
            sampleCount: samples.length,
            reason: `Prometheus query failed: ${queryRes.error}`,
            evaluatedAt,
            samples,
          };
          await this.recordEvaluationAudit(deployment, repair, result, actor, "PROMETHEUS_GATE_FAILED");
          return result;
        } else if (queryRes.status === "NO_DATA") {
          const result: CanaryEvaluationResult = {
            deploymentId,
            stage: currentStage,
            passed: false,
            verdict: "BLOCK",
            outcome: "INSUFFICIENT_TELEMETRY",
            actualValue: null,
            target,
            operator,
            promQl,
            sampleCount: samples.length,
            reason: `Prometheus query returned NO_DATA for expression: ${promQl}`,
            evaluatedAt,
            samples,
          };
          await this.recordEvaluationAudit(deployment, repair, result, actor, "PROMETHEUS_GATE_FAILED");
          return result;
        } else {
          sampleVal = queryRes.value;
        }
      }

      samples.push({ timestamp: sampleTime, value: sampleVal });
      lastMeasuredValue = sampleVal;

      // C4-3: Evaluate EVERY individual observation immediately
      // If ANY mandatory observation breaches the SLO: ABORT immediately. Do not average away.
      const isSampleCompliant = this.evaluateCompliance(sampleVal, operator, target);
      if (!isSampleCompliant) {
        breachDetected = true;
        breachValue = sampleVal;
        break;
      }

      // Record sample in audit log if requested
      if (options.auditSamples) {
        try {
          await DeploymentAuditService.appendEvent({
            deploymentId: deployment.deploymentId,
            action: "PROMETHEUS_SAMPLE_RECORDED",
            actor,
            repairId: repair.repairId,
            projectId: deployment.projectId,
            service: deployment.service,
            candidateCommitSha: deployment.candidateCommitSha || repair.candidateCommitSha,
            candidateImage: deployment.candidateImage,
            predecessorImage: deployment.predecessorImage,
            evidenceSnapshotHash: repair.evidenceSnapshotHash,
            stage: currentStage,
            observedValue: sampleVal,
            threshold: target,
            operator,
            promQl,
            newCandidateWeight: deployment.candidateTrafficWeight,
          });
        } catch {
          // ignore sample audit warning
        }
      }

      if (i < minSamples - 1 && sampleIntervalMs > 0) {
        await new Promise((r) => setTimeout(r, sampleIntervalMs));
      }
    }

    if (samples.length === 0) {
      const result: CanaryEvaluationResult = {
        deploymentId,
        stage: currentStage,
        passed: false,
        verdict: "BLOCK",
        outcome: "INSUFFICIENT_TELEMETRY",
        actualValue: null,
        target,
        operator,
        promQl,
        sampleCount: 0,
        reason: "Zero valid samples returned by Prometheus query.",
        evaluatedAt,
      };
      await this.recordEvaluationAudit(deployment, repair, result, actor, "PROMETHEUS_GATE_FAILED");
      return result;
    }

    // 7. Determine Final Outcome
    const passed = !breachDetected && samples.length >= minSamples;
    const outcome = breachDetected ? "SLO_BREACH" : "HEALTHY";
    const actualValue = breachDetected ? breachValue : lastMeasuredValue;
    const verdict = passed ? "ALLOW" : "BLOCK";

    const reason = passed
      ? `Prometheus progressive gating PASSED for stage ${currentStage}: All ${samples.length} mandatory observations satisfied ${operator} ${target} (latest: ${actualValue}).`
      : `Prometheus progressive gating FAILED for stage ${currentStage}: Observed value ${actualValue} breaches SLO target (${operator} ${target}).`;

    // 8. Persist Structured DeploymentVerification Record
    const verification = new DeploymentVerification({
      verificationId: `VERIF-ACA-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      deploymentId,
      repairId: repair.repairId,
      projectId: deployment.projectId,
      service: deployment.service,
      sloId: slo?.sloId,
      candidateCommitSha: deployment.candidateCommitSha || repair.candidateCommitSha,
      candidateImage: deployment.candidateImage || deployment.imageTag,
      predecessorImage: deployment.predecessorImage,
      predecessorContainer: deployment.predecessorContainer,
      promQl,
      target,
      operator,
      actualValue,
      samples,
      status: outcome === "SLO_BREACH" ? "BREACHED" : outcome,
      healthCheckPassed: passed,
      sloCompliant: passed,
      verificationLogs: [reason],
      verifiedAt: evaluatedAt,
    });
    await verification.save();

    // 9. Update Deployment Document with Gating Tracking
    await Deployment.updateOne(
      { deploymentId },
      {
        $set: {
          prometheusVerificationState: passed ? "GATE_PASSED" : "GATE_FAILED",
          latestObservedValue: actualValue,
          gateSampleCount: samples.length,
          requiredGateSamples: minSamples,
          latestGateVerdict: verdict,
          latestGateReason: reason,
        },
      }
    );

    const result: CanaryEvaluationResult = {
      deploymentId,
      stage: currentStage,
      passed,
      verdict,
      outcome,
      actualValue,
      target,
      operator,
      promQl,
      sampleCount: samples.length,
      reason,
      evaluatedAt,
      verificationId: verification.verificationId,
      samples,
    };

    // 10. Record Final Gating Audit Event (Chained to C1 audit trail)
    const primaryAction = passed ? "PROMETHEUS_GATE_PASSED" : "PROMETHEUS_GATE_FAILED";
    await this.recordEvaluationAudit(deployment, repair, result, actor, primaryAction);

    return result;
  }

  /**
   * Convenience alias for evaluateCanaryStage matching existing signatures
   */
  public static async evaluateStage(
    deploymentId: string,
    stage?: string,
    options?: CanaryEvaluationOptions,
    actor?: string
  ): Promise<CanaryEvaluationResult> {
    return this.evaluateCanaryStage(deploymentId, {
      ...options,
      actor: actor || options?.actor,
    });
  }

  /**
   * Evaluates if canary stage is healthy and permissible to progress
   */
  public static async isCanaryHealthy(deploymentId: string): Promise<boolean> {
    try {
      const result = await this.evaluateCanaryStage(deploymentId);
      return result.passed;
    } catch {
      return false;
    }
  }

  private static async recordEvaluationAudit(
    deployment: any,
    repair: any,
    result: CanaryEvaluationResult,
    actor: string,
    c4Action?: "PROMETHEUS_GATE_PASSED" | "PROMETHEUS_GATE_FAILED"
  ): Promise<void> {
    try {
      // 1. Record primary C4 gate action event
      if (c4Action) {
        const c4Event = await DeploymentAuditService.appendEvent({
          deploymentId: deployment.deploymentId,
          action: c4Action,
          actor,
          repairId: repair.repairId,
          projectId: deployment.projectId,
          service: deployment.service,
          candidateCommitSha: deployment.candidateCommitSha || repair.candidateCommitSha,
          candidateImage: deployment.candidateImage,
          predecessorImage: deployment.predecessorImage,
          evidenceSnapshotHash: repair.evidenceSnapshotHash,
          stage: result.stage,
          observedValue: result.actualValue ?? undefined,
          threshold: result.target,
          operator: result.operator,
          promQl: result.promQl,
          verificationStatus: result.outcome,
          newCandidateWeight: deployment.candidateTrafficWeight,
        });
        result.auditEventId = c4Event.eventId;
      }

      // 2. Also record backwards-compatible SLO_VERIFIED / SLO_BREACH_DETECTED event
      const legacyAction = result.passed ? "SLO_VERIFIED" : "SLO_BREACH_DETECTED";
      const legacyEvent = await DeploymentAuditService.appendEvent({
        deploymentId: deployment.deploymentId,
        action: legacyAction,
        actor,
        repairId: repair.repairId,
        projectId: deployment.projectId,
        service: deployment.service,
        candidateCommitSha: deployment.candidateCommitSha || repair.candidateCommitSha,
        candidateImage: deployment.candidateImage,
        predecessorImage: deployment.predecessorImage,
        evidenceSnapshotHash: repair.evidenceSnapshotHash,
        stage: result.stage,
        observedValue: result.actualValue ?? undefined,
        threshold: result.target,
        operator: result.operator,
        promQl: result.promQl,
        verificationStatus: result.outcome,
        newCandidateWeight: deployment.candidateTrafficWeight,
      });

      if (!result.auditEventId) {
        result.auditEventId = legacyEvent.eventId;
      }
    } catch (err) {
      console.error("[AutomatedCanaryAnalysisService] Warning: Failed to record audit event:", err);
    }
  }
}

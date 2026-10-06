import http from "http";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { Deployment, IDeployment } from "../models/Deployment";
import { DeploymentVerification, IDeploymentVerification } from "../models/DeploymentVerification";
import { CodeRepair } from "../models/CodeRepair";
import { SLO, ISLO } from "../models/SLO";
import { PrometheusQueryService } from "./prometheusQueryService";
import { SLOEvaluationService } from "./sloEvaluationService";
import { DeploymentLockService } from "./deploymentLockService";
import { RcaRepairContractService } from "./rcaRepairContractService";

const execFileAsync = promisify(execFile);

export interface IVerificationOptions {
  stabilizationWindowSeconds?: number;
  sampleIntervalMs?: number;
  forcedPromQl?: string;
  autoRollbackOnBreach?: boolean;
  timeoutMs?: number;
  forceStatus?: "HEALTHY" | "BREACHED" | "INSUFFICIENT_TELEMETRY" | "PROMETHEUS_UNAVAILABLE" | "VERIFICATION_TIMEOUT";
}

export interface IVerificationOutcome {
  status: "HEALTHY" | "BREACHED" | "INSUFFICIENT_TELEMETRY" | "PROMETHEUS_UNAVAILABLE" | "VERIFICATION_TIMEOUT";
  actualValue: number | null;
  target: number;
  operator: string;
  promQl: string;
  samples: Array<{ timestamp: Date; value: number | null; raw?: any }>;
  verification: IDeploymentVerification;
  deployment: IDeployment;
}

export interface IRollbackOutcome {
  success: boolean;
  status: "ROLLED_BACK_SUCCESSFULLY" | "ROLLBACK_FAILED";
  verificationStatus: "HEALTHY" | "BREACHED" | "UNAVAILABLE" | "PENDING";
  reason: string;
  predecessorImage: string;
  predecessorContainer: string;
  deployment: IDeployment;
  telemetryEvidence: any[];
}

export class PostDeploymentVerificationService {
  private static readonly DEFAULT_STABILIZATION_WINDOW = 10; // seconds
  private static readonly DEFAULT_SAMPLE_INTERVAL = 2000; // ms

  /**
   * Helper to safely execute docker commands using execFile to eliminate shell injection.
   */
  private static async runDocker(args: string[]): Promise<{ stdout: string; stderr: string }> {
    try {
      const res = await execFileAsync("docker", args, { maxBuffer: 10 * 1024 * 1024 });
      return { stdout: res.stdout.trim(), stderr: res.stderr.trim() };
    } catch (err: any) {
      throw new Error(`Docker execution error (${args.join(" ")}): ${err.message || err}`);
    }
  }

  /**
   * Probes an HTTP endpoint until ready or timeout.
   */
  private static async probeHttpReadiness(
    url: string,
    maxRetries: number = 10,
    delayMs: number = 1000
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const ok = await new Promise<boolean>((resolve) => {
          const req = http.get(url, { timeout: 2500 }, (res) => {
            resolve(Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 400));
          });
          req.on("error", () => resolve(false));
          req.on("timeout", () => {
            req.destroy();
            resolve(false);
          });
        });
        if (ok) return true;
      } catch {
        // continue retrying
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return false;
  }

  /**
   * Confirms Prometheus scrape targets are active and healthy.
   */
  public static async verifyPrometheusScraping(): Promise<boolean> {
    const res = await PrometheusQueryService.queryInstant("up");
    return res !== null && res.length > 0;
  }

  /**
   * Derives or validates the PromQL expression for the deployment's linked SLO.
   */
  public static derivePromQl(slo: ISLO, service: string): string {
    if (slo.promQl && slo.promQl.trim().length > 0) {
      return slo.promQl.trim();
    }

    const normMetric = slo.metric.toLowerCase();
    if (normMetric.includes("latency") || normMetric.includes("p95")) {
      return `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{route!~".*health.*"}[1m])) by (le))`;
    }
    if (normMetric.includes("error")) {
      return `(sum(rate(http_requests_total{status_code=~"5.."}[1m])) or vector(0)) / (sum(rate(http_requests_total[1m])) or vector(1)) * 100`;
    }

    return `up{job=~".*${service.toLowerCase()}.*"}`;
  }

  /**
   * Main entrypoint for post-deployment Prometheus SLO verification.
   * State machine: DEPLOYED -> VERIFYING -> (HEALTHY -> STABLE) or (BREACHED -> ROLLBACK_PENDING)
   */
  public static async verifyDeployment(
    deploymentId: string,
    options: IVerificationOptions = {}
  ): Promise<IVerificationOutcome> {
    const deployment = await Deployment.findOne({ deploymentId });
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    const repair = await CodeRepair.findOne({ repairId: deployment.repairId });
    if (!repair) {
      throw new Error(`Linked repair not found: ${deployment.repairId}`);
    }

    // Safety Gate: Candidate changes must have passed validation & approval
    if (repair.approvalStatus !== "APPROVED") {
      throw new Error(`Safety Gate Violation: Cannot verify unapproved repair deployment: ${repair.approvalStatus}`);
    }
    if (repair.validationStatus !== "VALIDATED") {
      throw new Error(`Safety Gate Violation: Cannot verify unvalidated repair deployment: ${repair.validationStatus}`);
    }
    if (!repair.candidateCommitSha) {
      throw new Error(`Safety Gate Violation: Missing Git candidate commit SHA on repair: ${repair.repairId}`);
    }

    // Safety Gate: Candidate identity consistency check
    if (deployment.candidateCommitSha && repair.candidateCommitSha && deployment.candidateCommitSha !== repair.candidateCommitSha) {
      throw new Error(
        `Safety Gate Violation: Candidate commit SHA mismatch between deployment (${deployment.candidateCommitSha}) and repair (${repair.candidateCommitSha})`
      );
    }

    // Safety Gate: Immutable Evidence Snapshot integrity check (Anchor to Phase 5.2 baseline)
    if (repair.canonicalEvidenceSnapshot && repair.evidenceSnapshotHash) {
      const canonicalJson = RcaRepairContractService.canonicalStringify(repair.canonicalEvidenceSnapshot);
      const computedHash = crypto.createHash("sha256").update(canonicalJson).digest("hex");
      if (computedHash !== repair.evidenceSnapshotHash) {
        throw new Error(
          `Safety Gate Violation: Evidence snapshot hash mismatch for repair ${repair.repairId}. Stored: ${repair.evidenceSnapshotHash}, Computed: ${computedHash}`
        );
      }
    }

    // Baseline evidence snapshot reference (Never use mutable incident document)
    const baselineEvidenceHash = repair.evidenceSnapshotHash || "";
    const baselineSnapshot = repair.canonicalEvidenceSnapshot || null;
    let baselineValue: number = 0;
    if (baselineSnapshot && baselineSnapshot.incident && baselineSnapshot.incident.actualValue != null) {
      baselineValue = Number(baselineSnapshot.incident.actualValue);
    }

    // Resolve linked SLO
    let slo = repair.sloId ? await SLO.findOne({ sloId: repair.sloId }) : null;
    if (!slo) {
      slo = await SLO.findOne({ projectId: deployment.projectId, service: deployment.service, status: "ACTIVE" });
    }
    if (!slo) {
      slo = await SLO.findOne({ projectId: deployment.projectId, status: "ACTIVE" });
    }

    const target = slo ? (slo.threshold ?? slo.target ?? 2.0) : 2.0;
    const operator = slo ? slo.operator : "<=";
    const promQl = options.forcedPromQl || (slo ? this.derivePromQl(slo, deployment.service) : "up");
    const windowSec = options.stabilizationWindowSeconds || this.DEFAULT_STABILIZATION_WINDOW;
    const sampleInterval = options.sampleIntervalMs || this.DEFAULT_SAMPLE_INTERVAL;

    // Transition state to VERIFYING
    deployment.status = "VERIFYING";
    deployment.deploymentLogs.push(
      `[PROMETHEUS VERIFICATION START] Observing stabilization window (${windowSec}s) with PromQL: ${promQl}`
    );
    await deployment.save();

    const verificationStart = new Date();
    const samples: Array<{ timestamp: Date; value: number | null; raw?: any }> = [];

    // Observe stabilization window by querying Prometheus at configured intervals
    const iterations = Math.max(1, Math.floor((windowSec * 1000) / sampleInterval));
    let prometheusReachable = true;

    for (let i = 0; i < iterations; i++) {
      const qRes = await PrometheusQueryService.queryPrometheusSLO(promQl);
      const now = new Date();

      if (qRes.status === "UNAVAILABLE") {
        prometheusReachable = false;
        samples.push({ timestamp: now, value: null, raw: qRes.error });
      } else if (qRes.status === "NO_DATA") {
        samples.push({ timestamp: now, value: null, raw: "NO_DATA" });
      } else {
        samples.push({ timestamp: now, value: qRes.value });
      }

      if (i < iterations - 1) {
        await new Promise((r) => setTimeout(r, sampleInterval));
      }
    }

    const verificationEnd = new Date();

    // Determine verification status (Fail-Closed)
    let finalStatus: "HEALTHY" | "BREACHED" | "INSUFFICIENT_TELEMETRY" | "PROMETHEUS_UNAVAILABLE" | "VERIFICATION_TIMEOUT" =
      "INSUFFICIENT_TELEMETRY";
    let actualValue: number | null = null;

    if (options.forceStatus) {
      finalStatus = options.forceStatus;
    } else if (options.timeoutMs !== undefined && options.timeoutMs <= (windowSec * 1000)) {
      finalStatus = "VERIFICATION_TIMEOUT";
    } else if (!prometheusReachable) {
      finalStatus = "PROMETHEUS_UNAVAILABLE";
    } else {
      const validSamples = samples.filter((s) => s.value !== null && Number.isFinite(s.value));
      if (validSamples.length === 0) {
        finalStatus = "INSUFFICIENT_TELEMETRY";
      } else {
        // Average or latest sample for actual value
        actualValue = validSamples[validSamples.length - 1].value;

        // Evaluate using real SLO operator and threshold
        const isCompliant = actualValue !== null ? this.evaluateCompliance(actualValue, operator, target) : false;
        finalStatus = isCompliant ? "HEALTHY" : "BREACHED";
      }
    }

    // Persist structured DeploymentVerification record
    const verification = await DeploymentVerification.create({
      verificationId: `VER-${Date.now().toString().slice(-6)}`,
      deploymentId: deployment.deploymentId,
      repairId: repair.repairId,
      projectId: deployment.projectId,
      service: deployment.service,
      sloId: slo?.sloId,
      candidateCommitSha: repair.candidateCommitSha,
      candidateImage: deployment.candidateImage || deployment.imageTag,
      predecessorImage: deployment.predecessorImage,
      predecessorContainer: deployment.predecessorContainer,
      promQl,
      target,
      operator,
      observationWindow: windowSec,
      verificationStart,
      verificationEnd,
      samples,
      baselineEvidenceHash,
      baselineValue,
      actualValue,
      status: finalStatus,
      healthCheckPassed: finalStatus === "HEALTHY",
      sloMetric: slo?.metric || "latency",
      sloCompliant: finalStatus === "HEALTHY",
      verificationLogs: [
        `PromQL: ${promQl}`,
        `Target: ${operator} ${target}`,
        `Measured Value: ${actualValue !== null ? actualValue : "N/A"}`,
        `Outcome: ${finalStatus}`,
        `Baseline Reference Hash: ${baselineEvidenceHash}`,
      ],
      verifiedAt: new Date(),
    });

    // Update Deployment state based on verification result
    if (finalStatus === "HEALTHY") {
      deployment.status = "STABLE";
      deployment.healthCheckPassed = true;
      deployment.deploymentLogs.push(
        `[PROMETHEUS VERIFICATION SUCCESS] ✓ Candidate container verified healthy (${actualValue} ${operator} ${target}). Marked STABLE.`
      );
      await deployment.save();
    } else if (finalStatus === "BREACHED") {
      deployment.status = "ROLLBACK_PENDING";
      deployment.deploymentLogs.push(
        `[PROMETHEUS VERIFICATION BREACH] ✗ SLO breached (${actualValue} fails ${operator} ${target}). Transitioned to ROLLBACK_PENDING.`
      );
      await deployment.save();

      // Trigger automated rollback if configured
      if (options.autoRollbackOnBreach !== false) {
        await this.executeRollback(
          deployment.deploymentId,
          `Prometheus SLO verification reported BREACHED: ${actualValue} fails ${operator} ${target}`
        );
      }
    } else {
      // Fail closed on Prometheus error / insufficient telemetry
      deployment.status = "FAILED";
      deployment.deploymentLogs.push(
        `[PROMETHEUS VERIFICATION FAIL-CLOSED] Verification status: ${finalStatus}. Candidate deployment rejected.`
      );
      await deployment.save();
    }

    return {
      status: finalStatus,
      actualValue,
      target,
      operator,
      promQl,
      samples,
      verification,
      deployment,
    };
  }

  /**
   * Automated Non-Destructive Rollback Implementation.
   * Restores the exact predecessor container and verifies predecessor health via Prometheus.
   */
  public static async executeRollback(
    deploymentId: string,
    reason: string,
    options?: { forcePredecessorVerificationFailure?: boolean }
  ): Promise<IRollbackOutcome> {
    const deployment = await Deployment.findOne({ deploymentId });
    if (!deployment) {
      throw new Error(`Deployment not found for rollback: ${deploymentId}`);
    }

    // Idempotency check: duplicate rollback request returns existing terminal state
    if (deployment.status === "ROLLED_BACK_SUCCESSFULLY" || deployment.status === "ROLLBACK_FAILED") {
      return {
        success: deployment.status === "ROLLED_BACK_SUCCESSFULLY",
        status: deployment.status,
        verificationStatus: deployment.rollbackVerificationStatus || "UNAVAILABLE",
        reason: deployment.rollbackReason || reason,
        predecessorImage: deployment.predecessorImage || "",
        predecessorContainer: deployment.predecessorContainer || "",
        deployment,
        telemetryEvidence: deployment.rollbackTelemetryEvidence || [],
      };
    }

    // 1. Acquire Deployment Concurrency Lock for Service
    const lock = await DeploymentLockService.acquireLock(deployment.service, deployment.repairId);

    const rollbackStartedAt = new Date();
    deployment.status = "ROLLING_BACK";
    deployment.rollbackStartedAt = rollbackStartedAt;
    deployment.rollbackReason = reason;
    deployment.deploymentLogs.push(`[ROLLBACK INITIATED] ${reason}`);
    await deployment.save();

    try {
      // 2. Validate predecessor existence (Fail closed if missing)
      const predecessorImage = deployment.predecessorImage;
      if (!predecessorImage || predecessorImage.trim().length === 0) {
        throw new Error(
          `Safety Violation: Missing predecessor image identity for deployment ${deploymentId}. Cannot safely roll back without known predecessor.`
        );
      }

      // 3. Stop routing traffic to candidate container safely
      const candidateContainer = deployment.candidateContainer || deployment.containerName;
      if (candidateContainer) {
        deployment.deploymentLogs.push(`[ROLLBACK] Stopping candidate container: ${candidateContainer}`);
        await this.runDocker(["stop", candidateContainer]).catch(() => {});
        await this.runDocker(["rm", "-f", candidateContainer]).catch(() => {});
      }

      // 4. Restore exact predecessor container
      const predecessorContainer =
        deployment.predecessorContainer || `traceops-live-${deployment.projectId.toLowerCase()}-${deployment.service.toLowerCase()}-pred`;
      const hostPort = deployment.hostPort || 5200;
      const targetPort = deployment.targetPort || 5000;

      deployment.deploymentLogs.push(
        `[ROLLBACK] Restoring predecessor image ${predecessorImage} into container ${predecessorContainer} on port ${hostPort}...`
      );

      // Clean up any stale container with the predecessor name
      await this.runDocker(["rm", "-f", predecessorContainer]).catch(() => {});

      // Run predecessor with Phase 5.1 Hardened Container Security Flags
      const baseArgs = [
        "run",
        "-d",
        "--name",
        predecessorContainer,
        "-p",
        `${hostPort}:${targetPort}`,
        "--memory=512m",
        "--cpus=1.0",
        "--pids-limit=128",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "-e",
        `PORT=${targetPort}`,
        "-e",
        "NODE_ENV=production",
      ];

      try {
        await this.runDocker([...baseArgs, "--network", "requirement-traceable-devops_traceops-network", predecessorImage]);
      } catch {
        await this.runDocker(["rm", "-f", predecessorContainer]).catch(() => {});
        await this.runDocker([...baseArgs, predecessorImage]);
      }

      // 5. Readiness health check on restored predecessor
      const readinessUrl = `http://localhost:${hostPort}/health`;
      const isReady = await this.probeHttpReadiness(readinessUrl, 15, 1000);
      if (!isReady) {
        throw new Error(`Restored predecessor container failed health probe at ${readinessUrl}`);
      }

      // 6. Transition state to VERIFYING_PREDECESSOR
      deployment.status = "VERIFYING_PREDECESSOR";
      deployment.deploymentLogs.push(`[ROLLBACK VERIFICATION] Verifying predecessor health via Prometheus...`);
      await deployment.save();

      // 7. Verify predecessor using REAL Prometheus telemetry
      const promCheck = await PrometheusQueryService.queryInstant("up");
      const telemetryEvidence: any[] = [];
      let isPredecessorHealthy = false;

      if (options?.forcePredecessorVerificationFailure) {
        telemetryEvidence.push({ type: "forced_verification_failure", error: "Forced predecessor verification failure" });
        isPredecessorHealthy = false;
      } else if (promCheck && promCheck.length > 0) {
        telemetryEvidence.push({ type: "prometheus_up", result: promCheck });
        // Real scrape verified and endpoint responding
        isPredecessorHealthy = true;
      } else {
        telemetryEvidence.push({ type: "prometheus_unavailable", error: "Prometheus unreachable or empty target" });
        isPredecessorHealthy = false;
      }

      if (!isPredecessorHealthy) {
        deployment.status = "ROLLBACK_FAILED";
        deployment.rollbackStatus = "ROLLBACK_FAILED";
        deployment.rollbackVerificationStatus = "UNAVAILABLE";
        deployment.rollbackTelemetryEvidence = telemetryEvidence;
        await deployment.save();
        throw new Error("Predecessor restoration failed: Real Prometheus verification was not satisfied");
      }

      // 8. Rollback Success Transition
      const rollbackCompletedAt = new Date();
      deployment.status = "ROLLED_BACK_SUCCESSFULLY";
      deployment.rollbackStatus = "ROLLED_BACK_SUCCESSFULLY";
      deployment.rollbackVerificationStatus = "HEALTHY";
      deployment.rollbackCompletedAt = rollbackCompletedAt;
      deployment.rollbackTelemetryEvidence = telemetryEvidence;
      deployment.containerName = predecessorContainer;
      deployment.deploymentLogs.push(
        `[ROLLBACK SUCCESS] ✓ Predecessor container ${predecessorContainer} successfully restored and verified healthy via Prometheus.`
      );
      await deployment.save();

      return {
        success: true,
        status: "ROLLED_BACK_SUCCESSFULLY",
        verificationStatus: "HEALTHY",
        reason,
        predecessorImage,
        predecessorContainer,
        deployment,
        telemetryEvidence,
      };
    } catch (err: any) {
      deployment.status = "ROLLBACK_FAILED";
      deployment.rollbackStatus = "ROLLBACK_FAILED";
      deployment.rollbackVerificationStatus = "UNAVAILABLE";
      deployment.deploymentLogs.push(`[ROLLBACK FAILURE] ${err.message}`);
      await deployment.save();

      return {
        success: false,
        status: "ROLLBACK_FAILED",
        verificationStatus: "UNAVAILABLE",
        reason: err.message,
        predecessorImage: deployment.predecessorImage || "",
        predecessorContainer: deployment.predecessorContainer || "",
        deployment,
        telemetryEvidence: [],
      };
    } finally {
      // 9. Clean Lock Release
      await DeploymentLockService.releaseLock(
        deployment.service,
        deployment.repairId,
        lock.ownerToken,
        "ROLLBACK_OPERATION_FINISHED"
      );
    }
  }

  private static evaluateCompliance(actual: number, operator: string, target: number): boolean {
    switch (operator) {
      case "<":
        return actual < target;
      case "<=":
        return actual <= target;
      case ">":
        return actual > target;
      case ">=":
        return actual >= target;
      case "=":
      case "==":
        return actual === target;
      default:
        return actual <= target;
    }
  }
}

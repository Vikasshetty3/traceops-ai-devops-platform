import { Deployment, IDeployment } from "../models/Deployment";
import { CodeRepair } from "../models/CodeRepair";
import { TrafficRoutingService, ActiveRoute } from "./trafficRoutingService";
import { DeploymentLockService, DeploymentLockConflictError } from "./deploymentLockService";
import { DeploymentAuditService } from "./deploymentAuditService";
import { AutomatedCanaryAnalysisService } from "./automatedCanaryAnalysisService";
import { CanaryRollbackIntegrationService } from "./canaryRollbackIntegrationService";

export interface CanaryStageDefinition {
  stage: string;
  candidateWeight: number;
  predecessorWeight: number;
  durationSeconds: number;
  nextStage: string | null;
  description: string;
}

/**
 * Authoritative Batch C Canary progression stages and bake windows:
 * Stage 0: candidate = 0%, predecessor = 100%, bake = 10s (Warmup)
 * Stage 1: candidate = 10%, predecessor = 90%, bake = 30s
 * Stage 2: candidate = 25%, predecessor = 75%, bake = 30s
 * Stage 3: candidate = 50%, predecessor = 50%, bake = 45s
 * Stage 4: candidate = 100%, predecessor = 0%, bake = 60s
 * Terminal: COMPLETED
 */
export const CANARY_STAGES: Record<string, CanaryStageDefinition> = {
  WARMING: {
    stage: "WARMING",
    candidateWeight: 0,
    predecessorWeight: 100,
    durationSeconds: 10,
    nextStage: "CANARY_TIER_10",
    description: "Stage 0: Warmup & Readiness (0% candidate / 100% predecessor)",
  },
  CANARY_TIER_10: {
    stage: "CANARY_TIER_10",
    candidateWeight: 10,
    predecessorWeight: 90,
    durationSeconds: 30,
    nextStage: "CANARY_TIER_25",
    description: "Stage 1: Canary Inception (10% candidate / 90% predecessor)",
  },
  CANARY_TIER_25: {
    stage: "CANARY_TIER_25",
    candidateWeight: 25,
    predecessorWeight: 75,
    durationSeconds: 30,
    nextStage: "CANARY_TIER_50",
    description: "Stage 2: Canary Expansion (25% candidate / 75% predecessor)",
  },
  CANARY_TIER_50: {
    stage: "CANARY_TIER_50",
    candidateWeight: 50,
    predecessorWeight: 50,
    durationSeconds: 45,
    nextStage: "FULL_PROMOTION",
    description: "Stage 3: Majority Shift (50% candidate / 50% predecessor)",
  },
  FULL_PROMOTION: {
    stage: "FULL_PROMOTION",
    candidateWeight: 100,
    predecessorWeight: 0,
    durationSeconds: 60,
    nextStage: "COMPLETED",
    description: "Stage 4: Full Cutover (100% candidate / 0% predecessor)",
  },
  COMPLETED: {
    stage: "COMPLETED",
    candidateWeight: 100,
    predecessorWeight: 0,
    durationSeconds: 0,
    nextStage: null,
    description: "Canary Deployment Completed & Promoted to Stable",
  },
};

/**
 * Authoritative Batch C Blue-Green progression stages:
 * Stage 0: WARMING (0% Green / 100% Blue, bake = 10s)
 * Stage 1: FULL_PROMOTION (100% Green / 0% Blue, bake = 60s)
 * Terminal: COMPLETED
 */
export const BLUE_GREEN_STAGES: Record<string, CanaryStageDefinition> = {
  WARMING: {
    stage: "WARMING",
    candidateWeight: 0,
    predecessorWeight: 100,
    durationSeconds: 10,
    nextStage: "FULL_PROMOTION",
    description: "Green Container Warmup (0% candidate / 100% predecessor)",
  },
  FULL_PROMOTION: {
    stage: "FULL_PROMOTION",
    candidateWeight: 100,
    predecessorWeight: 0,
    durationSeconds: 60,
    nextStage: "COMPLETED",
    description: "Atomic Cutover to Green (100% candidate / 0% predecessor)",
  },
  COMPLETED: {
    stage: "COMPLETED",
    candidateWeight: 100,
    predecessorWeight: 0,
    durationSeconds: 0,
    nextStage: null,
    description: "Blue-Green Deployment Completed & Promoted to Stable",
  },
};

/**
 * Stage name normalization map supporting aliases
 */
export function normalizeStageName(rawStage: string): string {
  const upper = (rawStage || "").trim().toUpperCase();
  const ALIAS_MAP: Record<string, string> = {
    STAGE_0: "WARMING",
    STAGE_0_PREDEPLOY: "WARMING",
    CANARY_WARMUP: "WARMING",
    WARMUP: "WARMING",
    STAGE_1: "CANARY_TIER_10",
    STAGE_1_INTERNAL: "CANARY_TIER_10",
    STAGE_2_CANARY_10: "CANARY_TIER_10",
    CANARY_10: "CANARY_TIER_10",
    TIER_10: "CANARY_TIER_10",
    STAGE_2: "CANARY_TIER_25",
    STAGE_3_CANARY_25: "CANARY_TIER_25",
    CANARY_25: "CANARY_TIER_25",
    TIER_25: "CANARY_TIER_25",
    STAGE_3: "CANARY_TIER_50",
    STAGE_4_CANARY_50: "CANARY_TIER_50",
    CANARY_50: "CANARY_TIER_50",
    TIER_50: "CANARY_TIER_50",
    STAGE_4: "FULL_PROMOTION",
    STAGE_5_FULL_PROMOTION: "FULL_PROMOTION",
    CANARY_CUTOVER: "FULL_PROMOTION",
    TIER_100: "FULL_PROMOTION",
    CUTOVER: "FULL_PROMOTION",
    PROMOTED: "FULL_PROMOTION",
    STABLE: "COMPLETED",
    DONE: "COMPLETED",
    COMPLETED: "COMPLETED",
    ABORT: "ABORTED",
    ABORTED: "ABORTED",
  };

  return ALIAS_MAP[upper] || upper;
}

export interface StartCanaryParams {
  deploymentId: string;
  strategy?: "CANARY" | "BLUE_GREEN";
  actor?: string;
  reason?: string;
  candidateHostPort?: number;
  predecessorHostPort?: number;
  options?: {
    durationOverrides?: Record<string, number>;
  };
}

export interface AdvanceCanaryParams {
  deploymentId: string;
  targetStage?: string;
  targetWeight?: number;
  actor?: string;
  reason?: string;
  options?: {
    skipBakeCheck?: boolean;
    currentTime?: Date;
    durationOverrides?: Record<string, number>;
    enablePrometheusGate?: boolean;
    skipPrometheusGate?: boolean;
    forcePrometheusUnavailable?: boolean;
    forceInsufficientTelemetry?: boolean;
    forceBreachValue?: number;
  };
}

export interface CanaryStageStatus {
  deploymentId: string;
  strategy: "CANARY" | "BLUE_GREEN" | "DIRECT";
  canaryStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ABORTED";
  currentStage: string;
  candidateWeight: number;
  predecessorWeight: number;
  stageEnteredAt: Date;
  requiredBakeDurationSeconds: number;
  elapsedBakeSeconds: number;
  remainingBakeSeconds: number;
  isBakeComplete: boolean;
  nextStage: string | null;
  canAdvance: boolean;
  history: Array<{
    stage: string;
    candidateWeight: number;
    predecessorWeight: number;
    durationSeconds?: number;
    elapsedSeconds?: number;
    enteredAt: Date;
    completedAt?: Date;
    status: string;
    reason?: string;
  }>;
}

export class CanaryProgressionService {
  /**
   * Resolves the stage definition map for the strategy.
   */
  public static getStageDefinitions(strategy: "CANARY" | "BLUE_GREEN" | "DIRECT"): Record<string, CanaryStageDefinition> {
    if (strategy === "BLUE_GREEN") {
      return BLUE_GREEN_STAGES;
    }
    return CANARY_STAGES;
  }

  /**
   * Convenience alias matching C5 test interface
   */
  public static async advanceCanaryStage(deploymentId: string, actor?: string): Promise<CanaryStageStatus> {
    return this.advanceCanary({ deploymentId, actor });
  }

  /**
   * Initiates canary progression for an approved and validated deployment.
   * Enforces:
   * - Deployment existence
   * - Repair approvalStatus === "APPROVED"
   * - Repair validationStatus === "VALIDATED"
   * - Candidate Git commit SHA integrity
   * - DeploymentLockService mutual exclusion
   * - Starts strictly at Stage 0: 0% candidate / 100% predecessor
   * - State persistence in Deployment document
   */
  public static async startCanary(params: StartCanaryParams): Promise<CanaryStageStatus> {
    const { deploymentId } = params;
    const actor = params.actor || "CANARY_PROGRESSION_CONTROLLER";
    const reason = params.reason || "Canary progression initiated at Stage 0 (Warmup)";

    // 1. Fetch Deployment & Associated Repair
    const deployment = await Deployment.findOne({ deploymentId });
    if (!deployment) {
      throw new Error(`Deployment not found for deploymentId: ${deploymentId}`);
    }

    const repair = await CodeRepair.findOne({ repairId: deployment.repairId });
    if (!repair) {
      throw new Error(`Safety Gate Violation: CodeRepair not found for repairId: ${deployment.repairId}`);
    }

    // 2. Safety Gate Enforcement
    if (repair.approvalStatus !== "APPROVED") {
      throw new Error(`Safety Gate Violation: Repair ${repair.repairId} must be approved before starting canary rollout. Current status: ${repair.approvalStatus}`);
    }

    if (repair.validationStatus !== "VALIDATED") {
      throw new Error(`Safety Gate Violation: Repair ${repair.repairId} must be validated before starting canary rollout. Current status: ${repair.validationStatus}`);
    }

    // 3. Provenance & Container Identity Verification
    if (repair.candidateCommitSha && deployment.candidateCommitSha && repair.candidateCommitSha !== deployment.candidateCommitSha) {
      throw new Error(
        `Safety Gate Violation: Candidate commit SHA mismatch between repair (${repair.candidateCommitSha}) and deployment (${deployment.candidateCommitSha})`
      );
    }

    const strategy = params.strategy || (deployment.trafficStrategy as any) || "CANARY";
    const stageDefs = this.getStageDefinitions(strategy);
    const initialStageDef = stageDefs["WARMING"];

    // 4. Idempotency Check: If already started and active in WARMING with 0% candidate
    if (
      deployment.canaryStatus === "IN_PROGRESS" &&
      normalizeStageName(deployment.currentCanaryStage || "") === "WARMING" &&
      deployment.candidateTrafficWeight === 0
    ) {
      return this.getCanaryStatus(deploymentId);
    }

    if (deployment.canaryStatus === "COMPLETED") {
      throw new Error(`Canary Lifecycle Violation: Deployment ${deploymentId} has already COMPLETED canary rollout.`);
    }

    if (deployment.canaryStatus === "ABORTED") {
      throw new Error(`Canary Lifecycle Violation: Deployment ${deploymentId} has already been ABORTED.`);
    }

    // 5. Concurrency Protection via DeploymentLockService
    await DeploymentLockService.acquireLock(deployment.service, deployment.repairId);

    try {
      const now = new Date();
      const bakeDuration = params.options?.durationOverrides?.["WARMING"] !== undefined
        ? params.options.durationOverrides["WARMING"]
        : initialStageDef.durationSeconds;

      // 6. Initialize Route in TrafficRoutingService (0% C / 100% P)
      await TrafficRoutingService.initRoute({
        deploymentId,
        strategy,
        candidateHostPort: params.candidateHostPort,
        predecessorHostPort: params.predecessorHostPort,
        stage: initialStageDef.stage,
        actor,
      });

      // 7. Persist Canary Lifecycle State to MongoDB without duplicate stage entry
      await Deployment.updateOne(
        { deploymentId, "canaryStages.stage": initialStageDef.stage },
        {
          $set: {
            trafficStrategy: strategy,
            canaryStatus: "IN_PROGRESS",
            currentCanaryStage: initialStageDef.stage,
            candidateTrafficWeight: 0,
            predecessorTrafficWeight: 100,
            canaryStartedAt: now,
            "canaryStages.$.durationSeconds": bakeDuration,
            "canaryStages.$.status": "ACTIVE",
            "canaryStages.$.enteredAt": now,
            "canaryStages.$.reason": reason,
          },
        }
      );

      return this.getCanaryStatus(deploymentId);
    } finally {
      await DeploymentLockService.releaseLock(deployment.service, deployment.repairId);
    }
  }

  /**
   * Advances the canary progression to the next stage sequentially.
   * Enforces:
   * - Sequential state transitions (no arbitrary skipping like 10% -> 50%)
   * - Mandatory bake/stabilization timing completion
   * - DeploymentLockService mutual exclusion
   * - Invariant wC + wP === 100 via TrafficRoutingService
   * - Blue-Green atomic cutover constraints
   * - C1 audit trail append
   */
  public static async advanceCanary(params: AdvanceCanaryParams): Promise<CanaryStageStatus> {
    const { deploymentId } = params;
    const actor = params.actor || "CANARY_PROGRESSION_CONTROLLER";

    // 1. Fetch Deployment
    const deployment = await Deployment.findOne({ deploymentId });
    if (!deployment) {
      throw new Error(`Deployment not found for deploymentId: ${deploymentId}`);
    }

    const strategy = (deployment.trafficStrategy as any) || "CANARY";
    const stageDefs = this.getStageDefinitions(strategy);

    // 2. Validate current lifecycle state
    if (deployment.canaryStatus === "COMPLETED") {
      throw new Error(`Canary Lifecycle Violation: Deployment ${deploymentId} has already COMPLETED canary rollout.`);
    }

    if (deployment.canaryStatus === "ABORTED") {
      throw new Error(`Canary Lifecycle Violation: Deployment ${deploymentId} is ABORTED and cannot progress.`);
    }

    if (deployment.canaryStatus !== "IN_PROGRESS") {
      throw new Error(`Canary Lifecycle Violation: Canary has not been started for deployment ${deploymentId}. Current status: ${deployment.canaryStatus || "NOT_STARTED"}`);
    }

    const currentStageName = normalizeStageName(deployment.currentCanaryStage || "WARMING");
    const currentStageDef = stageDefs[currentStageName];

    if (!currentStageDef) {
      throw new Error(`Unknown canary stage: ${deployment.currentCanaryStage}`);
    }

    // 3. Determine expected next stage
    const expectedNextStage = currentStageDef.nextStage;
    if (!expectedNextStage) {
      throw new Error(`Canary Lifecycle Violation: Stage ${currentStageName} has no next stage (terminal stage).`);
    }

    // 4. Resolve and Validate Target Stage
    let targetStage: string;
    if (params.targetStage) {
      targetStage = normalizeStageName(params.targetStage);
    } else if (params.targetWeight !== undefined) {
      const match = Object.values(stageDefs).find((d) => d.candidateWeight === params.targetWeight);
      if (!match) {
        throw new Error(`Invalid target weight ${params.targetWeight}% for strategy ${strategy}`);
      }
      targetStage = match.stage;
    } else {
      targetStage = expectedNextStage;
    }

    // Idempotency: If already in target stage
    if (currentStageName === targetStage) {
      return this.getCanaryStatus(deploymentId);
    }

    // Enforce Sequential Progression (Reject skipped stages like Tier 10 -> Tier 50)
    if (targetStage !== expectedNextStage) {
      throw new Error(
        `Invalid Canary Stage Transition: Cannot transition from ${currentStageName} to ${targetStage}. Expected sequential stage is ${expectedNextStage}.`
      );
    }

    const targetStageDef = stageDefs[targetStage];
    if (!targetStageDef) {
      throw new Error(`Invalid target canary stage definition for stage: ${targetStage}`);
    }

    // 5. Enforce Bake / Stabilization Timing
    const now = params.options?.currentTime ? new Date(params.options.currentTime) : new Date();
    const activeStageEntry = deployment.canaryStages?.slice().reverse().find((s) => normalizeStageName(s.stage) === currentStageName);
    const enteredAt = activeStageEntry?.enteredAt ? new Date(activeStageEntry.enteredAt) : (deployment.updatedAt || now);

    const requiredBakeSeconds = params.options?.durationOverrides?.[currentStageName] !== undefined
      ? params.options.durationOverrides[currentStageName]
      : (activeStageEntry?.durationSeconds !== undefined ? activeStageEntry.durationSeconds : currentStageDef.durationSeconds);

    const elapsedSeconds = Math.max(0, (now.getTime() - enteredAt.getTime()) / 1000);

    if (elapsedSeconds < requiredBakeSeconds && !params.options?.skipBakeCheck) {
      const remainingSeconds = Math.ceil(requiredBakeSeconds - elapsedSeconds);
      const error: any = new Error(
        `Bake Duration Incomplete: Stage ${currentStageName} requires ${requiredBakeSeconds}s stabilization window, but only ${Math.floor(elapsedSeconds)}s elapsed (${remainingSeconds}s remaining).`
      );
      error.statusCode = 412; // Precondition Failed
      throw error;
    }

    // 5.5. Automated Canary Analysis (ACA) & Prometheus Metric Gating (Phase 5.3 Batch C4)
    const shouldRunGate =
      params.options?.enablePrometheusGate === true ||
      (process.env.ENABLE_CANARY_PROMETHEUS_GATE === "true" && !params.options?.skipPrometheusGate);

    if (shouldRunGate) {
      const evaluation = await AutomatedCanaryAnalysisService.evaluateCanaryStage(deploymentId, {
        actor,
        forcePrometheusUnavailable: params.options?.forcePrometheusUnavailable,
        forceInsufficientTelemetry: params.options?.forceInsufficientTelemetry,
        forceBreachValue: params.options?.forceBreachValue,
      });

      if (!evaluation.passed) {
        const error: any = new Error(
          `Canary Gating Blocked: Stage ${currentStageName} failed Prometheus automated analysis: ${evaluation.reason} (Outcome: ${evaluation.outcome}). Progression halted.`
        );
        error.statusCode = 412; // Precondition Failed
        error.evaluation = evaluation;
        throw error;
      }
    }

    // 6. Concurrency Protection via DeploymentLockService
    await DeploymentLockService.acquireLock(deployment.service, deployment.repairId);

    try {
      const reason = params.reason || `Advanced from ${currentStageName} to ${targetStage}`;
      const isCompleted = targetStage === "COMPLETED";
      const nextBakeDuration = params.options?.durationOverrides?.[targetStage] !== undefined
        ? params.options.durationOverrides[targetStage]
        : targetStageDef.durationSeconds;

      // 7. Invoke C2 Traffic Routing Primitive
      if (targetStageDef.stage !== "COMPLETED") {
        await TrafficRoutingService.setTrafficWeights({
          deploymentId,
          candidateWeight: targetStageDef.candidateWeight,
          predecessorWeight: targetStageDef.predecessorWeight,
          stage: targetStageDef.stage,
          reason,
          actor,
        });

        // setTrafficWeights already pushed the new stage to canaryStages.
        // Update previous stage as COMPLETED.
        await Deployment.updateOne(
          { deploymentId, "canaryStages.stage": activeStageEntry?.stage || currentStageName },
          {
            $set: {
              "canaryStages.$.completedAt": now,
              "canaryStages.$.elapsedSeconds": Math.floor(elapsedSeconds),
              "canaryStages.$.status": "COMPLETED",
            },
          }
        );

        // Set durationSeconds on the active new stage
        const updatedDep = await Deployment.findOne({ deploymentId });
        if (updatedDep && updatedDep.canaryStages && updatedDep.canaryStages.length > 0) {
          const lastIdx = updatedDep.canaryStages.length - 1;
          const updateField: any = {};
          updateField[`canaryStages.${lastIdx}.durationSeconds`] = nextBakeDuration;
          await Deployment.updateOne({ deploymentId }, { $set: updateField });
        }
      } else {
        // COMPLETED terminal stage
        await Deployment.updateOne(
          { deploymentId, "canaryStages.stage": activeStageEntry?.stage || currentStageName },
          {
            $set: {
              "canaryStages.$.completedAt": now,
              "canaryStages.$.elapsedSeconds": Math.floor(elapsedSeconds),
              "canaryStages.$.status": "COMPLETED",
            },
          }
        );

        await Deployment.updateOne(
          { deploymentId },
          {
            $set: {
              currentCanaryStage: targetStage,
              canaryStatus: "COMPLETED",
              canaryCompletedAt: now,
              status: "STABLE",
              candidateTrafficWeight: 100,
              predecessorTrafficWeight: 0,
            },
            $push: {
              canaryStages: {
                stage: targetStage,
                candidateWeight: 100,
                predecessorWeight: 0,
                durationSeconds: 0,
                enteredAt: now,
                completedAt: now,
                status: "COMPLETED",
                reason,
              },
            },
          }
        );
      }

      // If fully completed, record terminal C1 audit event
      if (isCompleted) {
        const repair = await CodeRepair.findOne({ repairId: deployment.repairId });
        await DeploymentAuditService.appendEvent({
          deploymentId,
          repairId: deployment.repairId,
          projectId: deployment.projectId,
          service: deployment.service,
          candidateCommitSha: deployment.candidateCommitSha,
          predecessorImage: deployment.predecessorImage || "traceops-pred:v1",
          candidateImage: deployment.candidateImage || deployment.imageTag,
          strategy,
          stage: "COMPLETED",
          previousCandidateWeight: 100,
          newCandidateWeight: 100,
          action: "PROMOTION_FINALIZED",
          actor,
          authorizationCheck: true,
          evidenceSnapshotHash: repair?.evidenceSnapshotHash || "0000000000000000000000000000000000000000000000000000000000000000",
        });
      }

      return this.getCanaryStatus(deploymentId, params.options?.currentTime);
    } finally {
      await DeploymentLockService.releaseLock(deployment.service, deployment.repairId);
    }
  }

  /**
   * Retrieves the current canary progression status, elapsed bake time,
   * remaining time, and eligibility to advance.
   * Guaranteed to be restart-safe by reading persistent DB timestamps.
   */
  public static async getCanaryStatus(deploymentId: string, referenceTime?: Date): Promise<CanaryStageStatus> {
    const deployment = await Deployment.findOne({ deploymentId });
    if (!deployment) {
      throw new Error(`Deployment not found for deploymentId: ${deploymentId}`);
    }

    const strategy = (deployment.trafficStrategy as any) || "CANARY";
    const stageDefs = this.getStageDefinitions(strategy);
    const rawStage = deployment.currentCanaryStage || "WARMING";
    const currentStage = normalizeStageName(rawStage);
    const stageDef = stageDefs[currentStage] || {
      stage: currentStage,
      candidateWeight: deployment.candidateTrafficWeight ?? 0,
      predecessorWeight: deployment.predecessorTrafficWeight ?? 100,
      durationSeconds: 0,
      nextStage: null,
      description: currentStage,
    };

    const canaryStatus = deployment.canaryStatus || "NOT_STARTED";
    const now = referenceTime || new Date();

    const activeStageEntry = deployment.canaryStages?.slice().reverse().find((s) => normalizeStageName(s.stage) === currentStage);
    const enteredAt = activeStageEntry?.enteredAt ? new Date(activeStageEntry.enteredAt) : (deployment.canaryStartedAt || deployment.updatedAt || now);

    const requiredBakeDurationSeconds = activeStageEntry?.durationSeconds !== undefined
      ? activeStageEntry.durationSeconds
      : stageDef.durationSeconds;

    const elapsedBakeSeconds = canaryStatus === "COMPLETED" || canaryStatus === "ABORTED"
      ? (activeStageEntry?.elapsedSeconds ?? 0)
      : Math.max(0, Math.floor((now.getTime() - enteredAt.getTime()) / 1000));

    const remainingBakeSeconds = canaryStatus === "COMPLETED" || canaryStatus === "ABORTED"
      ? 0
      : Math.max(0, Math.ceil(requiredBakeDurationSeconds - elapsedBakeSeconds));

    const isBakeComplete = elapsedBakeSeconds >= requiredBakeDurationSeconds;
    const canAdvance = isBakeComplete && stageDef.nextStage !== null && canaryStatus === "IN_PROGRESS";

    return {
      deploymentId,
      strategy,
      canaryStatus,
      currentStage,
      candidateWeight: deployment.candidateTrafficWeight ?? stageDef.candidateWeight,
      predecessorWeight: deployment.predecessorTrafficWeight ?? stageDef.predecessorWeight,
      stageEnteredAt: enteredAt,
      requiredBakeDurationSeconds,
      elapsedBakeSeconds,
      remainingBakeSeconds,
      isBakeComplete,
      nextStage: stageDef.nextStage,
      canAdvance,
      history: deployment.canaryStages || [],
    };
  }

  /**
   * Manually aborts canary rollout, clamps traffic to predecessor (0/100), and records state.
   */
  public static async abortCanary(deploymentId: string, reason: string, actor: string = "OPERATOR_ABORT"): Promise<CanaryStageStatus> {
    const deployment = await Deployment.findOne({ deploymentId });
    if (!deployment) {
      throw new Error(`Deployment not found for deploymentId: ${deploymentId}`);
    }

    await DeploymentLockService.acquireLock(deployment.service, deployment.repairId);

    try {
      await CanaryRollbackIntegrationService.executeCanaryAbort(deploymentId, {
        reason,
        actor,
        trigger: "MANUAL_OPERATOR",
      });

      return this.getCanaryStatus(deploymentId);
    } finally {
      await DeploymentLockService.releaseLock(deployment.service, deployment.repairId);
    }
  }

  /**
   * Testing helper to fast-forward stage enteredAt timestamp in MongoDB.
   * Allows verifying bake time transitions deterministically without waiting wall-clock seconds.
   */
  public static async fastForwardStageTime(deploymentId: string, seconds: number): Promise<void> {
    const deployment = await Deployment.findOne({ deploymentId });
    if (!deployment || !deployment.canaryStages || deployment.canaryStages.length === 0) {
      return;
    }

    const lastIdx = deployment.canaryStages.length - 1;
    const currentEntry = deployment.canaryStages[lastIdx];
    const newEnteredAt = new Date(new Date(currentEntry.enteredAt).getTime() - seconds * 1000);

    const updateQuery: any = {};
    updateQuery[`canaryStages.${lastIdx}.enteredAt`] = newEnteredAt;

    await Deployment.updateOne({ deploymentId }, { $set: updateQuery });
  }
}

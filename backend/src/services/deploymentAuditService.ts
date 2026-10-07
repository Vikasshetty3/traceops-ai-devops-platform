import crypto from "crypto";
import { DeploymentAuditEvent, IDeploymentAuditEvent } from "../models/DeploymentAuditEvent";
import { Deployment } from "../models/Deployment";
import { CodeRepair } from "../models/CodeRepair";

/**
 * Authoritative Genesis Hash for the first audit event in any deployment chain.
 * 64 hexadecimal zeros (256-bit null digest).
 */
export const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

export interface ChainVerificationResult {
  valid: boolean;
  eventCount: number;
  firstInvalidEventId: string | null;
  reason?: string;
}

export interface AppendAuditEventParams {
  eventId?: string;
  timestamp?: Date | string;
  sequenceNumber?: number;
  deploymentId: string;
  repairId: string;
  projectId?: string;
  service?: string;
  incidentId?: string;
  rcaId?: string;
  sloId?: string;
  requirementId?: string;
  candidateCommitSha?: string;
  predecessorImage?: string;
  candidateImage?: string;
  strategy?: "CANARY" | "BLUE_GREEN" | "DIRECT";
  stage: string;
  previousCandidateWeight?: number;
  newCandidateWeight?: number;
  action:
    | "CANARY_INITIALIZED"
    | "STAGE_ADVANCED"
    | "SLO_VERIFIED"
    | "SLO_BREACH_DETECTED"
    | "PROMETHEUS_GATE_STARTED"
    | "PROMETHEUS_SAMPLE_RECORDED"
    | "PROMETHEUS_GATE_PASSED"
    | "PROMETHEUS_GATE_FAILED"
    | "CANARY_ABORTED"
    | "TRAFFIC_ABORTED"
    | "ROLLBACK_INITIATED"
    | "ROLLBACK_COMPLETED"
    | "PROMOTION_FINALIZED"
    | "DEPLOY_START"
    | "DEPLOY_SUCCESS"
    // Phase 5.3 Batch D1: Model Governance Lifecycle Actions
    | "MODEL_REGISTERED"
    | "MODEL_EVALUATION_RECORDED"
    | "MODEL_VALIDATION_PASSED"
    | "MODEL_VALIDATION_FAILED"
    | "MODEL_APPROVAL_REQUESTED"
    | "MODEL_APPROVED"
    | "MODEL_REJECTED"
    // Phase 5.3 Batch D2: Model Promotion Lifecycle Actions
    | "MODEL_PROMOTION_VALIDATION_STARTED"
    | "MODEL_PROMOTION_GATE_PASSED"
    | "MODEL_PROMOTION_GATE_FAILED"
    | "MODEL_PROMOTION_APPROVED"
    | "MODEL_PROMOTION_STARTED"
    | "MODEL_PROMOTED"
    | "MODEL_PROMOTION_FAILED"
    // Phase 5.3 Batch D3: Model Rollback Lifecycle Actions
    | "MODEL_ROLLBACK_REQUESTED"
    | "MODEL_ROLLBACK_VALIDATION_STARTED"
    | "MODEL_ROLLBACK_VALIDATION_PASSED"
    | "MODEL_ROLLBACK_VALIDATION_FAILED"
    | "MODEL_ROLLBACK_STARTED"
    | "MODEL_ROLLED_BACK"
    | "MODEL_ROLLBACK_FAILED";
  promQl?: string;
  observedValue?: number | null;
  threshold?: number;
  operator?: string;
  verificationStatus?: string;
  actor: string;
  authorizationCheck?: boolean;
  evidenceSnapshotHash?: string;
  parentEventHash?: string;
  // Model optional fields
  modelId?: string;
  modelVersion?: string;
  artifactSHA256?: string;
  datasetId?: string;
  evaluationId?: string;
  approvalId?: string;
  validationSummary?: string;
}

export interface AppendModelAuditEventParams {
  eventId?: string;
  timestamp?: Date | string;
  sequenceNumber?: number;
  modelId: string;
  modelVersion: string;
  artifactSHA256: string;
  datasetId?: string;
  evaluationId?: string;
  approvalId?: string;
  validationSummary?: string;
  // Batch D2: Promotion fields
  predecessorModelId?: string;
  predecessorVersion?: string;
  predecessorArtifactSHA256?: string;
  promotionPolicyVersion?: string;
  // Batch D3: Rollback fields
  targetModelId?: string;
  targetModelVersion?: string;
  targetArtifactSHA256?: string;
  rollbackReason?: string;
  action:
    | "MODEL_REGISTERED"
    | "MODEL_EVALUATION_RECORDED"
    | "MODEL_VALIDATION_PASSED"
    | "MODEL_VALIDATION_FAILED"
    | "MODEL_APPROVAL_REQUESTED"
    | "MODEL_APPROVED"
    | "MODEL_REJECTED"
    | "MODEL_PROMOTION_VALIDATION_STARTED"
    | "MODEL_PROMOTION_GATE_PASSED"
    | "MODEL_PROMOTION_GATE_FAILED"
    | "MODEL_PROMOTION_APPROVED"
    | "MODEL_PROMOTION_STARTED"
    | "MODEL_PROMOTED"
    | "MODEL_PROMOTION_FAILED"
    | "MODEL_ROLLBACK_REQUESTED"
    | "MODEL_ROLLBACK_VALIDATION_STARTED"
    | "MODEL_ROLLBACK_VALIDATION_PASSED"
    | "MODEL_ROLLBACK_VALIDATION_FAILED"
    | "MODEL_ROLLBACK_STARTED"
    | "MODEL_ROLLED_BACK"
    | "MODEL_ROLLBACK_FAILED";
  actor: string;
  parentEventHash?: string;
}

export class DeploymentAuditService {
  /**
   * Deterministic recursive canonical JSON serializer that produces byte-identical strings
   * for identical objects by sorting keys alphabetically. Cycle protected.
   * Strips non-payload metadata (_id, __v, createdAt, updatedAt, eventHash).
   */
  public static canonicalStringify(obj: any, seen = new WeakSet()): string {
    if (obj === null || typeof obj !== "object") {
      return JSON.stringify(obj);
    }
    if (obj instanceof Date) {
      return JSON.stringify(obj.toISOString());
    }
    if (seen.has(obj)) {
      return '"[CIRCULAR]"';
    }
    seen.add(obj);

    if (Array.isArray(obj)) {
      return "[" + obj.map((item) => DeploymentAuditService.canonicalStringify(item, seen)).join(",") + "]";
    }

    const sortedKeys = Object.keys(obj)
      .filter((k) => !["_id", "__v", "createdAt", "updatedAt", "eventHash"].includes(k))
      .sort();

    const pairs = sortedKeys.map((key) => {
      return JSON.stringify(key) + ":" + DeploymentAuditService.canonicalStringify(obj[key], seen);
    });

    return "{" + pairs.join(",") + "}";
  }

  /**
   * Extracts and normalizes the standard canonical payload dictionary from an audit event.
   * Ensures all primitives and nullables are normalized so hashing is reproducible.
   */
  public static extractCanonicalPayload(event: any): Record<string, any> {
    const rawTs = event.timestamp || new Date();
    const ts = rawTs instanceof Date ? rawTs.toISOString() : new Date(rawTs).toISOString();

    // Batch D1: Model Governance canonical payload
    if (event.modelId) {
      const baseModelPayload: Record<string, any> = {
        action: String(event.action),
        actor: String(event.actor),
        approvalId: event.approvalId ? String(event.approvalId) : null,
        artifactSHA256: event.artifactSHA256 ? String(event.artifactSHA256) : null,
        datasetId: event.datasetId ? String(event.datasetId) : null,
        evaluationId: event.evaluationId ? String(event.evaluationId) : null,
        eventId: String(event.eventId),
        modelId: String(event.modelId),
        modelVersion: String(event.modelVersion || ""),
        parentEventHash: String(event.parentEventHash || event.previousEventHash || GENESIS_HASH),
        sequenceNumber: Number(event.sequenceNumber),
        timestamp: ts,
        validationSummary: event.validationSummary ? String(event.validationSummary) : null,
      };

      if (event.action && String(event.action).startsWith("MODEL_ROLLBACK_")) {
        baseModelPayload.rollbackReason = event.rollbackReason ? String(event.rollbackReason) : null;
        baseModelPayload.targetArtifactSHA256 = event.targetArtifactSHA256 ? String(event.targetArtifactSHA256) : null;
        baseModelPayload.targetModelId = event.targetModelId ? String(event.targetModelId) : null;
        baseModelPayload.targetModelVersion = event.targetModelVersion ? String(event.targetModelVersion) : null;
      }

      return baseModelPayload;
    }

    return {
      action: String(event.action),
      actor: String(event.actor),
      authorizationCheck: Boolean(event.authorizationCheck !== undefined ? event.authorizationCheck : true),
      candidateCommitSha: String(event.candidateCommitSha || ""),
      candidateImage: String(event.candidateImage || ""),
      deploymentId: String(event.deploymentId),
      eventId: String(event.eventId),
      evidenceSnapshotHash: String(event.evidenceSnapshotHash || ""),
      incidentId: event.incidentId ? String(event.incidentId) : null,
      newCandidateWeight: Number(event.newCandidateWeight || 0),
      observedValue:
        event.observedValue !== undefined && event.observedValue !== null
          ? Number(event.observedValue)
          : null,
      operator: event.operator ? String(event.operator) : null,
      parentEventHash: String(event.parentEventHash || event.previousEventHash || GENESIS_HASH),
      predecessorImage: String(event.predecessorImage || ""),
      previousCandidateWeight: Number(event.previousCandidateWeight || 0),
      projectId: String(event.projectId || ""),
      promQl: event.promQl ? String(event.promQl) : null,
      rcaId: event.rcaId ? String(event.rcaId) : null,
      repairId: String(event.repairId),
      requirementId: event.requirementId ? String(event.requirementId) : null,
      sequenceNumber: Number(event.sequenceNumber),
      service: String(event.service || ""),
      stage: String(event.stage),
      strategy: String(event.strategy || "DIRECT"),
      threshold:
        event.threshold !== undefined && event.threshold !== null ? Number(event.threshold) : null,
      timestamp: ts,
      verificationStatus: event.verificationStatus ? String(event.verificationStatus) : null,
    };
  }

  /**
   * Calculates SHA-256 hash chaining formula:
   * eventHash = SHA256(parentEventHash + ":" + canonicalPayload)
   */
  public static calculateEventHash(parentEventHash: string, canonicalPayload: string): string {
    return crypto.createHash("sha256").update(`${parentEventHash}:${canonicalPayload}`).digest("hex");
  }

  /**
   * Appends a new audit event to the deployment's cryptographic audit chain.
   * Enforces foreign key validity, immutable evidence snapshot matching,
   * deterministic sequential parent-hash linkage, and schema immutability.
   */
  public static async appendEvent(params: AppendAuditEventParams): Promise<IDeploymentAuditEvent> {
    const { deploymentId, repairId, action, stage, actor } = params;

    if (!deploymentId) {
      throw new Error("Audit Safety Violation: deploymentId is required");
    }
    if (!repairId) {
      throw new Error("Audit Safety Violation: repairId is required");
    }
    if (!actor) {
      throw new Error("Audit Safety Violation: actor is required");
    }
    if (!action) {
      throw new Error("Audit Safety Violation: action is required");
    }
    if (!stage) {
      throw new Error("Audit Safety Violation: stage is required");
    }

    // 1. Foreign Key Validation: Deployment
    const deployment = await Deployment.findOne({ deploymentId });
    if (!deployment) {
      throw new Error(`Audit Foreign Key Violation: Deployment record not found for deploymentId ${deploymentId}`);
    }
    if (deployment.repairId && deployment.repairId !== repairId) {
      throw new Error(
        `Audit Foreign Key Violation: Repair ID mismatch between event (${repairId}) and deployment (${deployment.repairId})`
      );
    }

    // 2. Foreign Key Validation: CodeRepair
    const repair = await CodeRepair.findOne({ repairId });
    if (!repair) {
      throw new Error(`Audit Foreign Key Violation: CodeRepair record not found for repairId ${repairId}`);
    }

    // 3. Evidence Snapshot Hash Verification (Phase 5.2 anchor)
    const expectedEvidenceHash = repair.evidenceSnapshotHash || "";
    const providedEvidenceHash = params.evidenceSnapshotHash || expectedEvidenceHash;
    if (expectedEvidenceHash && providedEvidenceHash !== expectedEvidenceHash) {
      throw new Error(
        `Audit Safety Violation: Evidence snapshot hash mismatch. Provided: ${providedEvidenceHash}, Expected: ${expectedEvidenceHash}`
      );
    }

    // 4. Resolve defaults from deployment/repair records
    const projectId = params.projectId || deployment.projectId || repair.projectId;
    const service = params.service || deployment.service || "PaymentGateway";
    const candidateCommitSha = params.candidateCommitSha || deployment.candidateCommitSha || repair.candidateCommitSha || "unknown-commit";
    const predecessorImage = params.predecessorImage || deployment.predecessorImage || "traceops-payment-service:predecessor";
    const candidateImage = params.candidateImage || deployment.candidateImage || deployment.imageTag || "traceops-payment-service:candidate";
    const strategy = params.strategy || "DIRECT";
    const incidentId = params.incidentId || repair.incidentId;
    const rcaId = params.rcaId || repair.rcaId;
    const sloId = params.sloId || repair.sloId;
    const requirementId = params.requirementId || repair.requirementId;

    // 5. Sequential Chain Linkage: Determine sequenceNumber and parentEventHash
    const latestEvent = await DeploymentAuditEvent.findOne({ deploymentId })
      .sort({ sequenceNumber: -1 })
      .lean();

    let sequenceNumber: number;
    let parentEventHash: string;

    if (!latestEvent) {
      sequenceNumber = 1;
      parentEventHash = GENESIS_HASH;
    } else {
      sequenceNumber = latestEvent.sequenceNumber + 1;
      parentEventHash = latestEvent.eventHash;
    }

    // Verify caller assertions if explicitly provided
    if (params.sequenceNumber !== undefined && params.sequenceNumber !== sequenceNumber) {
      throw new Error(
        `Audit Chain Violation: Sequence number mismatch. Expected: ${sequenceNumber}, Provided: ${params.sequenceNumber}`
      );
    }
    if (params.parentEventHash && params.parentEventHash !== parentEventHash) {
      throw new Error(
        `Audit Chain Violation: Parent event hash mismatch. Expected: ${parentEventHash}, Provided: ${params.parentEventHash}`
      );
    }

    // 6. Identifier and Timestamp Generation
    const eventId = params.eventId || `audit-${crypto.randomBytes(8).toString("hex")}`;
    const timestamp = params.timestamp ? new Date(params.timestamp) : new Date();

    // 7. Canonical Serialization and Cryptographic Event Hash
    const rawPayload = {
      action,
      actor,
      authorizationCheck: params.authorizationCheck !== undefined ? params.authorizationCheck : true,
      candidateCommitSha,
      candidateImage,
      deploymentId,
      eventId,
      evidenceSnapshotHash: providedEvidenceHash,
      incidentId,
      newCandidateWeight: params.newCandidateWeight !== undefined ? params.newCandidateWeight : 0,
      observedValue: params.observedValue !== undefined ? params.observedValue : null,
      operator: params.operator,
      parentEventHash,
      predecessorImage,
      previousCandidateWeight: params.previousCandidateWeight !== undefined ? params.previousCandidateWeight : 0,
      projectId,
      promQl: params.promQl,
      rcaId,
      repairId,
      requirementId,
      sequenceNumber,
      service,
      stage,
      strategy,
      threshold: params.threshold !== undefined ? params.threshold : null,
      timestamp,
      verificationStatus: params.verificationStatus,
    };

    const canonicalPayload = DeploymentAuditService.extractCanonicalPayload(rawPayload);
    const canonicalJson = DeploymentAuditService.canonicalStringify(canonicalPayload);
    const eventHash = DeploymentAuditService.calculateEventHash(parentEventHash, canonicalJson);

    // 8. Atomic Append-Only Persistence
    const auditDoc = new DeploymentAuditEvent({
      ...rawPayload,
      previousEventHash: parentEventHash,
      eventHash,
    });

    await auditDoc.save();

    // 9. Update Deployment latest audit reference
    await Deployment.updateOne(
      { deploymentId },
      { $set: { lastAuditEventId: eventId } }
    );

    return auditDoc;
  }

  /**
   * Loads all audit events for a deployment in strictly ascending sequence order.
   */
  public static async getDeploymentEvents(deploymentId: string): Promise<IDeploymentAuditEvent[]> {
    return DeploymentAuditEvent.find({ deploymentId }).sort({ sequenceNumber: 1 });
  }

  /**
   * Cryptographically verifies the integrity of the entire audit chain for a deployment.
   * Reconstructs every canonical payload and recomputes every SHA-256 hash.
   * Fails closed upon any discrepancy (tampered payload, parent mismatch, sequence gap).
   */
  public static async verifyChain(deploymentId: string): Promise<ChainVerificationResult> {
    const events = await DeploymentAuditEvent.find({ deploymentId }).sort({ sequenceNumber: 1 });

    if (events.length === 0) {
      return {
        valid: true,
        eventCount: 0,
        firstInvalidEventId: null,
      };
    }

    for (let i = 0; i < events.length; i++) {
      const current = events[i];
      const expectedSequence = i + 1;

      // 1. Sequence Continuity Verification
      if (current.sequenceNumber !== expectedSequence) {
        return {
          valid: false,
          eventCount: events.length,
          firstInvalidEventId: current.eventId,
          reason: `SEQUENCE_GAP_OR_REORDER: expected sequence ${expectedSequence}, found ${current.sequenceNumber}`,
        };
      }

      // 2. Parent Hash Linkage Verification
      const expectedParentHash = i === 0 ? GENESIS_HASH : events[i - 1].eventHash;
      if (current.parentEventHash !== expectedParentHash) {
        return {
          valid: false,
          eventCount: events.length,
          firstInvalidEventId: current.eventId,
          reason: `PARENT_HASH_MISMATCH: expected parent ${expectedParentHash}, found ${current.parentEventHash}`,
        };
      }

      // 3. Payload and Event Hash Integrity Verification
      const normalizedPayload = DeploymentAuditService.extractCanonicalPayload(current);
      const canonicalJson = DeploymentAuditService.canonicalStringify(normalizedPayload);
      const computedHash = DeploymentAuditService.calculateEventHash(current.parentEventHash, canonicalJson);

      if (computedHash !== current.eventHash) {
        return {
          valid: false,
          eventCount: events.length,
          firstInvalidEventId: current.eventId,
          reason: `EVENT_HASH_MISMATCH: computed hash ${computedHash} does not match stored hash ${current.eventHash}`,
        };
      }
    }

    return {
      valid: true,
      eventCount: events.length,
      firstInvalidEventId: null,
    };
  }

  /**
   * Appends a new model governance audit event to the model's cryptographic audit chain.
   * Enforces deterministic sequential parent-hash linkage, canonical serialization,
   * SHA-256 event hashing, and immutable append-only persistence.
   */
  public static async appendModelEvent(params: AppendModelAuditEventParams): Promise<IDeploymentAuditEvent> {
    const { modelId, modelVersion, artifactSHA256, action, actor } = params;

    if (!modelId) {
      throw new Error("Audit Safety Violation: modelId is required");
    }
    if (!modelVersion) {
      throw new Error("Audit Safety Violation: modelVersion is required");
    }
    if (!artifactSHA256) {
      throw new Error("Audit Safety Violation: artifactSHA256 is required");
    }
    if (!actor) {
      throw new Error("Audit Safety Violation: actor is required");
    }
    if (!action) {
      throw new Error("Audit Safety Violation: action is required");
    }

    // Determine sequenceNumber and parentEventHash for this model's audit chain
    const latestEvent = await DeploymentAuditEvent.findOne({ modelId })
      .sort({ sequenceNumber: -1 })
      .lean();

    let sequenceNumber: number;
    let parentEventHash: string;

    if (!latestEvent) {
      sequenceNumber = 1;
      parentEventHash = GENESIS_HASH;
    } else {
      sequenceNumber = latestEvent.sequenceNumber + 1;
      parentEventHash = latestEvent.eventHash;
    }

    if (params.sequenceNumber !== undefined && params.sequenceNumber !== sequenceNumber) {
      throw new Error(
        `Audit Chain Violation: Sequence number mismatch. Expected: ${sequenceNumber}, Provided: ${params.sequenceNumber}`
      );
    }
    if (params.parentEventHash && params.parentEventHash !== parentEventHash) {
      throw new Error(
        `Audit Chain Violation: Parent event hash mismatch. Expected: ${parentEventHash}, Provided: ${params.parentEventHash}`
      );
    }

    const eventId = params.eventId || `audit-mdl-${crypto.randomBytes(8).toString("hex")}`;
    const timestamp = params.timestamp ? new Date(params.timestamp) : new Date();

    const rawPayload = {
      action,
      actor,
      approvalId: params.approvalId,
      artifactSHA256,
      datasetId: params.datasetId,
      evaluationId: params.evaluationId,
      eventId,
      modelId,
      modelVersion,
      parentEventHash,
      sequenceNumber,
      timestamp,
      validationSummary: params.validationSummary,
      // Batch D2 promotion fields
      predecessorModelId: params.predecessorModelId,
      predecessorVersion: params.predecessorVersion,
      predecessorArtifactSHA256: params.predecessorArtifactSHA256,
      promotionPolicyVersion: params.promotionPolicyVersion,
      // Batch D3 rollback fields
      targetModelId: params.targetModelId,
      targetModelVersion: params.targetModelVersion,
      targetArtifactSHA256: params.targetArtifactSHA256,
      rollbackReason: params.rollbackReason,
      // Deployment compatibility fields
      deploymentId: modelId,
      repairId: "MODEL_GOVERNANCE",
      projectId: "TRACE-OPS-ML",
      service: "ml-service",
      candidateCommitSha: "HEAD",
      predecessorImage: "none",
      candidateImage: modelVersion,
      stage: "MODEL_GOVERNANCE",
      strategy: "DIRECT" as const,
      previousCandidateWeight: 0,
      newCandidateWeight: 0,
      evidenceSnapshotHash: artifactSHA256,
      authorizationCheck: true,
    };

    const canonicalPayload = DeploymentAuditService.extractCanonicalPayload(rawPayload);
    const canonicalJson = DeploymentAuditService.canonicalStringify(canonicalPayload);
    const eventHash = DeploymentAuditService.calculateEventHash(parentEventHash, canonicalJson);

    const auditDoc = new DeploymentAuditEvent({
      ...rawPayload,
      previousEventHash: parentEventHash,
      eventHash,
    });

    await auditDoc.save();

    // Update MLModelRegistry if record exists
    try {
      const { MLModelRegistry } = await import("../models/MLModelRegistry");
      await MLModelRegistry.updateOne({ modelId }, { $set: { lastAuditEventId: eventId } });
    } catch (_err) {
      // Non-blocking
    }

    return auditDoc;
  }

  /**
   * Loads all audit events for a model in strictly ascending sequence order.
   */
  public static async getModelEvents(modelId: string): Promise<IDeploymentAuditEvent[]> {
    return DeploymentAuditEvent.find({ modelId }).sort({ sequenceNumber: 1 });
  }

  /**
   * Cryptographically verifies the integrity of the entire audit chain for a model.
   * Reconstructs every canonical payload and recomputes every SHA-256 hash.
   * Fails closed upon any discrepancy (tampered payload, parent mismatch, sequence gap).
   */
  public static async verifyModelChain(modelId: string): Promise<ChainVerificationResult> {
    const events = await DeploymentAuditEvent.find({ modelId }).sort({ sequenceNumber: 1 });

    if (events.length === 0) {
      return {
        valid: true,
        eventCount: 0,
        firstInvalidEventId: null,
      };
    }

    for (let i = 0; i < events.length; i++) {
      const current = events[i];
      const expectedSequence = i + 1;

      // 1. Sequence Continuity Verification
      if (current.sequenceNumber !== expectedSequence) {
        return {
          valid: false,
          eventCount: events.length,
          firstInvalidEventId: current.eventId,
          reason: `SEQUENCE_GAP_OR_REORDER: expected sequence ${expectedSequence}, found ${current.sequenceNumber}`,
        };
      }

      // 2. Parent Hash Linkage Verification
      const expectedParentHash = i === 0 ? GENESIS_HASH : events[i - 1].eventHash;
      if (current.parentEventHash !== expectedParentHash) {
        return {
          valid: false,
          eventCount: events.length,
          firstInvalidEventId: current.eventId,
          reason: `PARENT_HASH_MISMATCH: expected parent ${expectedParentHash}, found ${current.parentEventHash}`,
        };
      }

      // 3. Payload and Event Hash Integrity Verification
      const normalizedPayload = DeploymentAuditService.extractCanonicalPayload(current);
      const canonicalJson = DeploymentAuditService.canonicalStringify(normalizedPayload);
      const computedHash = DeploymentAuditService.calculateEventHash(current.parentEventHash, canonicalJson);

      if (computedHash !== current.eventHash) {
        return {
          valid: false,
          eventCount: events.length,
          firstInvalidEventId: current.eventId,
          reason: `EVENT_HASH_MISMATCH: computed hash ${computedHash} does not match stored hash ${current.eventHash}`,
        };
      }
    }

    return {
      valid: true,
      eventCount: events.length,
      firstInvalidEventId: null,
    };
  }
}

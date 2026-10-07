import mongoose, { Document, Schema } from "mongoose";

export interface IDeploymentAuditEvent extends Document {
  eventId: string;                   // UUID v4
  timestamp: Date;                   // UTC Timestamp
  sequenceNumber: number;            // 1-indexed order within deployment chain
  deploymentId: string;              // FK to Deployment
  repairId: string;                  // FK to CodeRepair
  projectId: string;                 // Project scope
  service: string;                   // Microservice name
  incidentId?: string;               // Linked runtime incident
  rcaId?: string;                    // Linked Root Cause Analysis
  sloId?: string;                    // Evaluated Service Level Objective
  requirementId?: string;            // Business Requirement
  candidateCommitSha: string;        // Git Candidate Commit
  predecessorImage: string;          // Previous image tag
  candidateImage: string;            // Candidate image tag
  strategy: "CANARY" | "BLUE_GREEN" | "DIRECT";
  stage: string;                     // e.g. "INITIAL_DEPLOY", "WARMUP", "TIER_10", "ABORT"
  previousCandidateWeight: number;   // Prior weight (0..100)
  newCandidateWeight: number;        // Transitioned weight (0..100)
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
    | "MODEL_PROMOTION_FAILED";
  promQl?: string;                   // PromQL expression used
  observedValue?: number | null;     // Measured Prometheus metric
  threshold?: number;                // SLO threshold
  operator?: string;                 // Comparison operator
  verificationStatus?: string;       // HEALTHY, BREACHED, UNAVAILABLE, etc.
  actor: string;                     // Human operator or "AUTONOMOUS_TRAFFIC_ENGINE"
  authorizationCheck: boolean;       // True if approval gate verified
  evidenceSnapshotHash: string;      // Phase 5.2 canonical evidence hash
  parentEventHash: string;           // SHA-256 of preceding audit event in chain (genesis: 64 zeros)
  previousEventHash?: string;        // Alias for parentEventHash
  eventHash: string;                 // SHA-256(parentEventHash + ":" + canonicalPayload)

  // Phase 5.3 Batch D1: ML Model Governance Fields
  modelId?: string;
  modelVersion?: string;
  artifactSHA256?: string;
  datasetId?: string;
  evaluationId?: string;
  approvalId?: string;
  validationSummary?: string;

  // Phase 5.3 Batch D2: ML Model Promotion Fields
  predecessorModelId?: string;
  predecessorVersion?: string;
  predecessorArtifactSHA256?: string;
  promotionPolicyVersion?: string;

  createdAt: Date;
  updatedAt: Date;
}

const deploymentAuditEventSchema = new Schema<IDeploymentAuditEvent>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    sequenceNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    deploymentId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    repairId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    projectId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    service: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    incidentId: {
      type: String,
      trim: true,
    },
    rcaId: {
      type: String,
      trim: true,
    },
    sloId: {
      type: String,
      trim: true,
    },
    requirementId: {
      type: String,
      trim: true,
    },
    candidateCommitSha: {
      type: String,
      required: true,
      trim: true,
    },
    predecessorImage: {
      type: String,
      required: true,
      trim: true,
    },
    candidateImage: {
      type: String,
      required: true,
      trim: true,
    },
    strategy: {
      type: String,
      enum: ["CANARY", "BLUE_GREEN", "DIRECT"],
      default: "DIRECT",
      required: true,
    },
    stage: {
      type: String,
      required: true,
      trim: true,
    },
    previousCandidateWeight: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
    },
    newCandidateWeight: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
    },
    action: {
      type: String,
      enum: [
        "CANARY_INITIALIZED",
        "STAGE_ADVANCED",
        "SLO_VERIFIED",
        "SLO_BREACH_DETECTED",
        "PROMETHEUS_GATE_STARTED",
        "PROMETHEUS_SAMPLE_RECORDED",
        "PROMETHEUS_GATE_PASSED",
        "PROMETHEUS_GATE_FAILED",
        "CANARY_ABORTED",
        "TRAFFIC_ABORTED",
        "ROLLBACK_INITIATED",
        "ROLLBACK_COMPLETED",
        "PROMOTION_FINALIZED",
        "DEPLOY_START",
        "DEPLOY_SUCCESS",
        // Batch D1
        "MODEL_REGISTERED",
        "MODEL_EVALUATION_RECORDED",
        "MODEL_VALIDATION_PASSED",
        "MODEL_VALIDATION_FAILED",
        "MODEL_APPROVAL_REQUESTED",
        "MODEL_APPROVED",
        "MODEL_REJECTED",
        // Batch D2
        "MODEL_PROMOTION_VALIDATION_STARTED",
        "MODEL_PROMOTION_GATE_PASSED",
        "MODEL_PROMOTION_GATE_FAILED",
        "MODEL_PROMOTION_APPROVED",
        "MODEL_PROMOTION_STARTED",
        "MODEL_PROMOTED",
        "MODEL_PROMOTION_FAILED",
      ],
      required: true,
    },
    promQl: {
      type: String,
      trim: true,
    },
    observedValue: {
      type: Number,
    },
    threshold: {
      type: Number,
    },
    operator: {
      type: String,
      trim: true,
    },
    verificationStatus: {
      type: String,
      trim: true,
    },
    actor: {
      type: String,
      required: true,
      trim: true,
    },
    authorizationCheck: {
      type: Boolean,
      required: true,
      default: true,
    },
    evidenceSnapshotHash: {
      type: String,
      required: true,
      trim: true,
    },
    parentEventHash: {
      type: String,
      required: true,
      trim: true,
    },
    previousEventHash: {
      type: String,
      trim: true,
    },
    eventHash: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // Batch D1: Model Governance Fields
    modelId: {
      type: String,
      trim: true,
      index: true,
    },
    modelVersion: {
      type: String,
      trim: true,
    },
    artifactSHA256: {
      type: String,
      trim: true,
    },
    datasetId: {
      type: String,
      trim: true,
    },
    evaluationId: {
      type: String,
      trim: true,
    },
    approvalId: {
      type: String,
      trim: true,
    },
    validationSummary: {
      type: String,
      trim: true,
    },
    // Batch D2: Promotion Fields
    predecessorModelId: {
      type: String,
      trim: true,
    },
    predecessorVersion: {
      type: String,
      trim: true,
    },
    predecessorArtifactSHA256: {
      type: String,
      trim: true,
    },
    promotionPolicyVersion: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: "deployment_audit_events",
  }
);

// Compound Index for deterministic ordered queries
deploymentAuditEventSchema.index({ deploymentId: 1, sequenceNumber: 1 }, { unique: true });
deploymentAuditEventSchema.index({ modelId: 1, sequenceNumber: 1 });
deploymentAuditEventSchema.index({ service: 1, timestamp: -1 });

// Virtual for alias previousEventHash <-> parentEventHash
deploymentAuditEventSchema.virtual("aliasPreviousEventHash").get(function () {
  return this.parentEventHash;
});

// ============================================================================
// IMMUTABILITY GUARDS: Strictly append-only, reject all update/delete mutations
// ============================================================================
deploymentAuditEventSchema.pre("save", function (next) {
  if (!this.isNew) {
    return next(
      new Error("Immutability Violation: DeploymentAuditEvents are strictly append-only and cannot be mutated after creation.")
    );
  }
  // Synchronize alias
  if (!this.previousEventHash && this.parentEventHash) {
    this.previousEventHash = this.parentEventHash;
  }
  next();
});

deploymentAuditEventSchema.pre("updateOne", function () {
  throw new Error("Immutability Violation: DeploymentAuditEvents are strictly append-only and cannot be updated.");
});

deploymentAuditEventSchema.pre("updateMany", function () {
  throw new Error("Immutability Violation: DeploymentAuditEvents are strictly append-only and cannot be updated.");
});

deploymentAuditEventSchema.pre("findOneAndUpdate", function () {
  throw new Error("Immutability Violation: DeploymentAuditEvents are strictly append-only and cannot be updated.");
});

deploymentAuditEventSchema.pre("deleteOne", function () {
  throw new Error("Immutability Violation: DeploymentAuditEvents are strictly append-only and cannot be deleted.");
});

deploymentAuditEventSchema.pre("deleteMany", function () {
  throw new Error("Immutability Violation: DeploymentAuditEvents are strictly append-only and cannot be deleted.");
});

deploymentAuditEventSchema.pre("findOneAndDelete", function () {
  throw new Error("Immutability Violation: DeploymentAuditEvents are strictly append-only and cannot be deleted.");
});

export const DeploymentAuditEvent = mongoose.model<IDeploymentAuditEvent>(
  "DeploymentAuditEvent",
  deploymentAuditEventSchema
);

import mongoose, { Document, Schema } from "mongoose";

export interface IDeployment extends Document {
  deploymentId: string;
  repairId: string;
  projectId: string;
  service: string;
  version: string;
  imageTag: string;
  containerId?: string;
  containerName?: string;
  hostPort?: number;
  targetPort?: number;
  status:
    | "BUILDING"
    | "DEPLOYING"
    | "DEPLOYED"
    | "RUNNING"
    | "VERIFYING"
    | "HEALTHY"
    | "STABLE"
    | "BREACHED"
    | "ROLLBACK_PENDING"
    | "ROLLING_BACK"
    | "VERIFYING_PREDECESSOR"
    | "ROLLED_BACK_SUCCESSFULLY"
    | "ROLLBACK_FAILED"
    | "FAILED"
    | "ROLLED_BACK";
  healthCheckUrl?: string;
  healthCheckPassed: boolean;
  deploymentLogs: string[];
  deployedAt?: Date;
  rolledBackAt?: Date;
  rollbackReason?: string;
  previousDeploymentId?: string;

  // Phase 5.3 Batch A: Candidate & Predecessor Provenance
  candidateCommitSha?: string;
  candidateImage?: string;
  candidateContainer?: string;
  predecessorImage?: string;
  predecessorContainer?: string;
  lockId?: string;

  // Phase 5.3 Batch B: Rollback State Machine & Audit
  rollbackStartedAt?: Date;
  rollbackCompletedAt?: Date;
  rollbackStatus?: "ROLLBACK_PENDING" | "ROLLING_BACK" | "ROLLED_BACK_SUCCESSFULLY" | "ROLLBACK_FAILED";
  rollbackVerificationStatus?: "HEALTHY" | "BREACHED" | "UNAVAILABLE" | "PENDING";
  rollbackTelemetryEvidence?: any[];

  createdAt?: Date;
  updatedAt?: Date;
}

const deploymentSchema = new Schema<IDeployment>(
  {
    deploymentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
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
    },
    version: {
      type: String,
      required: true,
    },
    imageTag: {
      type: String,
      required: true,
    },
    containerId: { type: String },
    containerName: { type: String },
    hostPort: { type: Number },
    targetPort: { type: Number },
    status: {
      type: String,
      enum: [
        "BUILDING",
        "DEPLOYING",
        "DEPLOYED",
        "RUNNING",
        "VERIFYING",
        "HEALTHY",
        "STABLE",
        "BREACHED",
        "ROLLBACK_PENDING",
        "ROLLING_BACK",
        "VERIFYING_PREDECESSOR",
        "ROLLED_BACK_SUCCESSFULLY",
        "ROLLBACK_FAILED",
        "FAILED",
        "ROLLED_BACK",
      ],
      default: "BUILDING",
    },
    healthCheckUrl: { type: String },
    healthCheckPassed: { type: Boolean, default: false },
    deploymentLogs: [{ type: String }],
    deployedAt: { type: Date },
    rolledBackAt: { type: Date },
    rollbackReason: { type: String },
    previousDeploymentId: { type: String },
    // Phase 5.3 Batch A: Candidate & Predecessor Provenance
    candidateCommitSha: { type: String, trim: true, index: true },
    candidateImage: { type: String, trim: true },
    candidateContainer: { type: String, trim: true },
    predecessorImage: { type: String, trim: true },
    predecessorContainer: { type: String, trim: true },
    lockId: { type: String, trim: true },
    // Phase 5.3 Batch B: Rollback State Machine & Audit
    rollbackStartedAt: { type: Date },
    rollbackCompletedAt: { type: Date },
    rollbackStatus: {
      type: String,
      enum: ["ROLLBACK_PENDING", "ROLLING_BACK", "ROLLED_BACK_SUCCESSFULLY", "ROLLBACK_FAILED"],
    },
    rollbackVerificationStatus: {
      type: String,
      enum: ["HEALTHY", "BREACHED", "UNAVAILABLE", "PENDING"],
    },
    rollbackTelemetryEvidence: [{ type: Schema.Types.Mixed }],
  },
  {
    timestamps: true,
  }
);

export const Deployment = mongoose.model<IDeployment>("Deployment", deploymentSchema);

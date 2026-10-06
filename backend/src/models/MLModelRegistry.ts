import mongoose, { Document, Schema } from "mongoose";

export type ModelLifecycleStatus =
  | "CANDIDATE"
  | "EVALUATING"
  | "VALIDATED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "PROMOTING"
  | "PRODUCTION"
  | "REJECTED"
  | "INVALID"
  | "PROMOTION_FAILED";

export type ModelServingStatus = "OFFLINE" | "CANDIDATE_ONLY" | "LIVE_SERVING";

export interface IMLModelRegistry extends Document {
  modelId: string;
  modelVersion: string;
  modelType: string;
  artifactPath: string;
  artifactSHA256: string;
  status: ModelLifecycleStatus;
  servingStatus: ModelServingStatus;
  featureSchemaVersion: string;
  featureNames: string[];
  datasetVersion?: string;
  datasetSHA256?: string;
  trainingGitSHA?: string;
  trainingTimestamp?: Date;
  hyperparameters?: Record<string, any>;
  threshold: number;
  evaluationMetrics?: Record<string, any>;
  calibrationMetrics?: Record<string, any>;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: Date;
  promotedAt?: Date;
  predecessorModelId?: string;
  rejectionReason?: string;
  validationSummary?: string;
  lastAuditEventId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const mlModelRegistrySchema = new Schema<IMLModelRegistry>(
  {
    modelId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    modelVersion: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    modelType: {
      type: String,
      required: true,
      trim: true,
    },
    artifactPath: {
      type: String,
      required: true,
      trim: true,
    },
    artifactSHA256: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: [
        "CANDIDATE",
        "EVALUATING",
        "VALIDATED",
        "PENDING_APPROVAL",
        "APPROVED",
        "PROMOTING",
        "PRODUCTION",
        "REJECTED",
        "INVALID",
        "PROMOTION_FAILED",
      ],
      default: "CANDIDATE",
      index: true,
    },
    servingStatus: {
      type: String,
      required: true,
      enum: ["OFFLINE", "CANDIDATE_ONLY", "LIVE_SERVING"],
      default: "CANDIDATE_ONLY",
      index: true,
    },
    featureSchemaVersion: {
      type: String,
      required: true,
      trim: true,
      default: "v2-production-telemetry",
    },
    featureNames: {
      type: [String],
      required: true,
      default: [
        "cpuUsage",
        "memoryUsage",
        "p95Latency",
        "errorRate",
        "requestRate",
        "deploymentChanged",
      ],
    },
    datasetVersion: {
      type: String,
      trim: true,
    },
    datasetSHA256: {
      type: String,
      trim: true,
    },
    trainingGitSHA: {
      type: String,
      trim: true,
    },
    trainingTimestamp: {
      type: Date,
    },
    hyperparameters: {
      type: Schema.Types.Mixed,
      default: {},
    },
    threshold: {
      type: Number,
      required: true,
      default: 0.5,
    },
    evaluationMetrics: {
      type: Schema.Types.Mixed,
      default: {},
    },
    calibrationMetrics: {
      type: Schema.Types.Mixed,
      default: {},
    },
    createdBy: {
      type: String,
      required: true,
      default: "SYSTEM",
      trim: true,
    },
    approvedBy: {
      type: String,
      trim: true,
    },
    approvedAt: {
      type: Date,
    },
    promotedAt: {
      type: Date,
    },
    predecessorModelId: {
      type: String,
      trim: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
    validationSummary: {
      type: String,
      trim: true,
    },
    lastAuditEventId: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

mlModelRegistrySchema.index({ modelVersion: 1, artifactSHA256: 1 });
mlModelRegistrySchema.index({ status: 1, servingStatus: 1 });

export const MLModelRegistry = mongoose.model<IMLModelRegistry>(
  "MLModelRegistry",
  mlModelRegistrySchema
);

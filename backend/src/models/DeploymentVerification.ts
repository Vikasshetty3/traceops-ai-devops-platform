import mongoose, { Document, Schema } from "mongoose";

export interface IDeploymentVerification extends Document {
  verificationId: string;
  deploymentId: string;
  repairId?: string;
  projectId: string;
  service: string;
  sloId?: string;
  candidateCommitSha?: string;
  candidateImage?: string;
  predecessorImage?: string;
  predecessorContainer?: string;
  promQl?: string;
  target?: number;
  operator?: string;
  observationWindow?: number;
  verificationStart?: Date;
  verificationEnd?: Date;
  samples?: Array<{ timestamp: Date; value: number | null; raw?: any }>;
  baselineEvidenceHash?: string;
  baselineValue?: number;
  actualValue?: number | null;
  status:
    | "HEALTHY"
    | "BREACHED"
    | "INSUFFICIENT_TELEMETRY"
    | "PROMETHEUS_UNAVAILABLE"
    | "VERIFICATION_TIMEOUT"
    | "COMPLIANT"
    | "NON_COMPLIANT";
  healthCheckPassed: boolean;
  healthCheckLatencyMs?: number;
  sloMetric?: string;
  beforeValue?: number;
  afterValue?: number;
  targetValue?: number;
  targetUnit?: string;
  sloCompliant?: boolean;
  improvementPercentage?: number;
  verificationLogs: string[];
  verifiedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const deploymentVerificationSchema = new Schema<IDeploymentVerification>(
  {
    verificationId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    deploymentId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    repairId: {
      type: String,
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
    sloId: {
      type: String,
      trim: true,
    },
    candidateCommitSha: { type: String, trim: true },
    candidateImage: { type: String, trim: true },
    predecessorImage: { type: String, trim: true },
    predecessorContainer: { type: String, trim: true },
    promQl: { type: String },
    target: { type: Number },
    operator: { type: String, trim: true },
    observationWindow: { type: Number, default: 5 },
    verificationStart: { type: Date },
    verificationEnd: { type: Date },
    samples: [{ timestamp: { type: Date }, value: { type: Number }, raw: { type: Schema.Types.Mixed } }],
    baselineEvidenceHash: { type: String, trim: true },
    baselineValue: { type: Number },
    actualValue: { type: Number },
    status: {
      type: String,
      enum: [
        "HEALTHY",
        "BREACHED",
        "INSUFFICIENT_TELEMETRY",
        "PROMETHEUS_UNAVAILABLE",
        "VERIFICATION_TIMEOUT",
        "COMPLIANT",
        "NON_COMPLIANT",
      ],
      default: "HEALTHY",
    },
    healthCheckPassed: {
      type: Boolean,
      default: true,
    },
    healthCheckLatencyMs: {
      type: Number,
      default: 0,
    },
    sloMetric: {
      type: String,
      default: "latency",
    },
    beforeValue: {
      type: Number,
      default: 0,
    },
    afterValue: {
      type: Number,
      default: 0,
    },
    targetValue: {
      type: Number,
      default: 0,
    },
    targetUnit: {
      type: String,
      default: "ms",
    },
    sloCompliant: {
      type: Boolean,
      default: true,
    },
    improvementPercentage: {
      type: Number,
      default: 0,
    },
    verificationLogs: [{ type: String }],
    verifiedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export const DeploymentVerification = mongoose.model<IDeploymentVerification>(
  "DeploymentVerification",
  deploymentVerificationSchema
);

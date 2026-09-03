import mongoose, { Document, Schema } from "mongoose";

export interface IDeploymentVerification extends Document {
  verificationId: string;
  deploymentId: string;
  projectId: string;
  service: string;
  sloId?: string;
  healthCheckPassed: boolean;
  healthCheckLatencyMs: number;
  sloMetric: string;
  beforeValue: number;
  afterValue: number;
  targetValue: number;
  targetUnit: string;
  sloCompliant: boolean;
  improvementPercentage: number;
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
    healthCheckPassed: {
      type: Boolean,
      required: true,
    },
    healthCheckLatencyMs: {
      type: Number,
      default: 0,
    },
    sloMetric: {
      type: String,
      required: true,
    },
    beforeValue: {
      type: Number,
      required: true,
    },
    afterValue: {
      type: Number,
      required: true,
    },
    targetValue: {
      type: Number,
      required: true,
    },
    targetUnit: {
      type: String,
      default: "ms",
    },
    sloCompliant: {
      type: Boolean,
      required: true,
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

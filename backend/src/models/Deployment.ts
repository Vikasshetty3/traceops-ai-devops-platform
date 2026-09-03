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
  status: "BUILDING" | "DEPLOYING" | "RUNNING" | "HEALTHY" | "FAILED" | "ROLLED_BACK";
  healthCheckUrl?: string;
  healthCheckPassed: boolean;
  deploymentLogs: string[];
  deployedAt?: Date;
  rolledBackAt?: Date;
  rollbackReason?: string;
  previousDeploymentId?: string;
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
      enum: ["BUILDING", "DEPLOYING", "RUNNING", "HEALTHY", "FAILED", "ROLLED_BACK"],
      default: "BUILDING",
    },
    healthCheckUrl: { type: String },
    healthCheckPassed: { type: Boolean, default: false },
    deploymentLogs: [{ type: String }],
    deployedAt: { type: Date },
    rolledBackAt: { type: Date },
    rollbackReason: { type: String },
    previousDeploymentId: { type: String },
  },
  {
    timestamps: true,
  }
);

export const Deployment = mongoose.model<IDeployment>("Deployment", deploymentSchema);

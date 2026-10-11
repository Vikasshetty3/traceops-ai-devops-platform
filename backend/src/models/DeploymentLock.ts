import mongoose, { Document, Schema } from "mongoose";

export interface IDeploymentLock extends Document {
  service: string;
  repairId: string;
  ownerToken: string;
  acquiredAt: Date;
  expiresAt: Date;
  status: "HELD" | "RELEASED";
  releaseReason?: string;
  releasedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const deploymentLockSchema = new Schema<IDeploymentLock>(
  {
    service: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    repairId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    ownerToken: {
      type: String,
      required: true,
      trim: true,
    },
    acquiredAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["HELD", "RELEASED"],
      default: "HELD",
      required: true,
    },
    releaseReason: {
      type: String,
      trim: true,
    },
    releasedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

export const DeploymentLock = mongoose.model<IDeploymentLock>(
  "DeploymentLock",
  deploymentLockSchema
);

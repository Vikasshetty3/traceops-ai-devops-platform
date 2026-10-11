import mongoose, { Document, Schema } from "mongoose";

export interface IMLModelApproval extends Document {
  approvalId: string;
  modelId: string;
  requestedBy: string;
  reviewedBy?: string;
  decision: "PENDING" | "APPROVED" | "REJECTED";
  decisionReason?: string;
  evaluationId?: string;
  artifactSHA256: string;
  timestamp: Date;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: Date;
  updatedAt: Date;
}

const mlModelApprovalSchema = new Schema<IMLModelApproval>(
  {
    approvalId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    modelId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    requestedBy: {
      type: String,
      required: true,
      trim: true,
    },
    reviewedBy: {
      type: String,
      trim: true,
    },
    decision: {
      type: String,
      required: true,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    decisionReason: {
      type: String,
      trim: true,
    },
    evaluationId: {
      type: String,
      trim: true,
    },
    artifactSHA256: {
      type: String,
      required: true,
      trim: true,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    approvalStatus: {
      type: String,
      required: true,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

mlModelApprovalSchema.index({ modelId: 1, decision: 1 });

export const MLModelApproval = mongoose.model<IMLModelApproval>(
  "MLModelApproval",
  mlModelApprovalSchema
);

import mongoose, { Document, Schema } from "mongoose";

export interface IDevOpsAction extends Document {
  actionId: string;
  rcaId?: string;
  experimentId?: string;
  requirementId?: string;
  service: string;
  actionType: "SCALE_SERVICE" | "RESTART_POD" | "UPDATE_CONFIG" | "ROLLBACK";
  description: string;
  payload: Record<string, any>;
  status: "PROPOSED" | "APPROVED" | "EXECUTED" | "REJECTED";
  approvedBy?: string;
  approvedAt?: Date;
  executedAt?: Date;
  executionLogs: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

const devOpsActionSchema = new Schema<IDevOpsAction>(
  {
    actionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    rcaId: {
      type: String,
      trim: true,
    },
    experimentId: {
      type: String,
      trim: true,
    },
    requirementId: {
      type: String,
      trim: true,
    },
    service: {
      type: String,
      required: true,
      trim: true,
    },
    actionType: {
      type: String,
      enum: ["SCALE_SERVICE", "RESTART_POD", "UPDATE_CONFIG", "ROLLBACK"],
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ["PROPOSED", "APPROVED", "EXECUTED", "REJECTED"],
      default: "PROPOSED",
    },
    approvedBy: {
      type: String,
    },
    approvedAt: {
      type: Date,
    },
    executedAt: {
      type: Date,
    },
    executionLogs: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export const DevOpsAction = mongoose.model<IDevOpsAction>(
  "DevOpsAction",
  devOpsActionSchema
);

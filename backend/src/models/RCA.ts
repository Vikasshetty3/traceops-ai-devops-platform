import mongoose, { Document, Schema } from "mongoose";

export interface IRCA extends Document {
  rcaId: string;
  incidentId: string;
  requirementId: string;
  sloId?: string;
  service?: string;
  rootCause: string;
  evidence: string[];
  confidence: number;
  recommendedAction: string;
  metricsSnapshot?: {
    cpuUsage?: number;
    memoryUsage?: number;
    errorRate?: number;
    latency?: number;
    deploymentChanged?: boolean;
  };
  status: "GENERATED" | "APPROVED" | "REMEDIATED";
  createdAt?: Date;
  updatedAt?: Date;
}

const rcaSchema = new Schema<IRCA>(
  {
    rcaId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    incidentId: {
      type: String,
      required: true,
      trim: true,
    },
    requirementId: {
      type: String,
      required: true,
      trim: true,
    },
    sloId: {
      type: String,
      trim: true,
    },
    service: {
      type: String,
      trim: true,
    },
    rootCause: {
      type: String,
      required: true,
      trim: true,
    },
    evidence: {
      type: [String],
      required: true,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    recommendedAction: {
      type: String,
      required: true,
      trim: true,
    },
    metricsSnapshot: {
      cpuUsage: { type: Number },
      memoryUsage: { type: Number },
      errorRate: { type: Number },
      latency: { type: Number },
      deploymentChanged: { type: Boolean },
    },
    status: {
      type: String,
      enum: ["GENERATED", "APPROVED", "REMEDIATED"],
      default: "GENERATED",
    },
  },
  {
    timestamps: true,
  }
);

export const RCA = mongoose.model<IRCA>("RCA", rcaSchema);
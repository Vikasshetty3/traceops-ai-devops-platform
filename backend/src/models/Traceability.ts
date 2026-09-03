import mongoose, { Document, Schema } from "mongoose";

export interface ITraceability extends Document {
  traceId: string;
  projectId?: string;
  requirementId: string;
  sloId: string;
  service: string;
  metric: string;
  issueId?: string;
  repairId?: string;
  deploymentId?: string;
  prometheusMetric?: string;
  runtimeResource?: string;
  kubernetesNamespace?: string;
  recoveryPolicy?: string;
  status: "ACTIVE" | "INACTIVE";
}

const traceabilitySchema = new Schema<ITraceability>(
  {
    traceId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    projectId: {
      type: String,
      trim: true,
    },

    requirementId: {
      type: String,
      required: true,
      trim: true,
    },

    sloId: {
      type: String,
      required: true,
      trim: true,
    },

    service: {
      type: String,
      required: true,
      trim: true,
    },

    metric: {
      type: String,
      required: true,
      trim: true,
    },

    issueId: {
      type: String,
      trim: true,
    },

    repairId: {
      type: String,
      trim: true,
    },

    deploymentId: {
      type: String,
      trim: true,
    },

    prometheusMetric: {
      type: String,
      trim: true,
    },

    runtimeResource: {
      type: String,
      trim: true,
    },

    kubernetesNamespace: {
      type: String,
      trim: true,
    },

    recoveryPolicy: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
  },
  {
    timestamps: true,
  }
);

export const Traceability = mongoose.model<ITraceability>(
  "Traceability",
  traceabilitySchema
);
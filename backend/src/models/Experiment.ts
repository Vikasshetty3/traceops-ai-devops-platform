import mongoose, { Document, Schema } from "mongoose";

export interface IExperiment extends Document {
  experimentId: string;
  rcaId?: string;
  requirementId: string;
  service: string;
  hypothesis: string;
  remediationAction: string;
  parameters: {
    parameterName: string;
    currentValue: string | number;
    proposedValue: string | number;
  };
  metricsBefore: {
    latency: number;
    errorRate: number;
    cpuUsage: number;
    memoryUsage: number;
  };
  metricsAfter: {
    latency: number;
    errorRate: number;
    cpuUsage: number;
    memoryUsage: number;
  };
  sloThreshold: number;
  result: "PASS" | "FAIL";
  improvementPct: number;
  status: "COMPLETED" | "RUNNING";
  createdAt?: Date;
  updatedAt?: Date;
}

const experimentSchema = new Schema<IExperiment>(
  {
    experimentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    rcaId: {
      type: String,
      trim: true,
    },
    requirementId: {
      type: String,
      required: true,
      trim: true,
    },
    service: {
      type: String,
      required: true,
      trim: true,
    },
    hypothesis: {
      type: String,
      required: true,
    },
    remediationAction: {
      type: String,
      required: true,
    },
    parameters: {
      parameterName: { type: String, required: true },
      currentValue: { type: Schema.Types.Mixed, required: true },
      proposedValue: { type: Schema.Types.Mixed, required: true },
    },
    metricsBefore: {
      latency: { type: Number, required: true },
      errorRate: { type: Number, required: true },
      cpuUsage: { type: Number, required: true },
      memoryUsage: { type: Number, required: true },
    },
    metricsAfter: {
      latency: { type: Number, required: true },
      errorRate: { type: Number, required: true },
      cpuUsage: { type: Number, required: true },
      memoryUsage: { type: Number, required: true },
    },
    sloThreshold: {
      type: Number,
      required: true,
    },
    result: {
      type: String,
      enum: ["PASS", "FAIL"],
      required: true,
    },
    improvementPct: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["COMPLETED", "RUNNING"],
      default: "COMPLETED",
    },
  },
  {
    timestamps: true,
  }
);

export const Experiment = mongoose.model<IExperiment>(
  "Experiment",
  experimentSchema
);

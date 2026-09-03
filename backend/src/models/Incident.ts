import mongoose, { Document, Schema } from "mongoose";

export interface IIncidentMetrics {
  cpuUsage?: number;
  memoryUsage?: number;
  errorRate?: number;
  latency?: number;
  deploymentChanged?: boolean;
}

export interface IIncident extends Document {
  incidentId: string;
  requirementId: string;
  sloId: string;
  service: string;
  metric: string;
  actualValue: number;
  threshold: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "INVESTIGATING" | "RESOLVED";
  message: string;
  logs: string[];
  metrics: IIncidentMetrics;
  resolvedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const incidentSchema = new Schema<IIncident>(
  {
    incidentId: {
      type: String,
      required: true,
      unique: true,
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
    actualValue: {
      type: Number,
      required: true,
    },
    threshold: {
      type: Number,
      required: true,
    },
    severity: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "HIGH",
    },
    status: {
      type: String,
      enum: ["OPEN", "INVESTIGATING", "RESOLVED"],
      default: "OPEN",
    },
    message: {
      type: String,
      required: true,
    },
    logs: {
      type: [String],
      default: [],
    },
    metrics: {
      cpuUsage: { type: Number, default: 0 },
      memoryUsage: { type: Number, default: 0 },
      errorRate: { type: Number, default: 0 },
      latency: { type: Number, default: 0 },
      deploymentChanged: { type: Boolean, default: false },
    },
    resolvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

export const Incident = mongoose.model<IIncident>(
  "Incident",
  incidentSchema
);
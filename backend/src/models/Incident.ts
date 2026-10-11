import mongoose, { Document, Schema } from "mongoose";

export interface IIncidentMetrics {
  cpuUsage?: number;
  memoryUsage?: number;
  errorRate?: number;
  latency?: number;
  requestRate?: number;
  p50Latency?: number;
  p95Latency?: number;
  p99Latency?: number;
  rate4xx?: number;
  rate5xx?: number;
  activeRequests?: number;
  deploymentChanged?: boolean;
}

export type IncidentSource =
  | "PROMETHEUS_SLO_MONITOR"
  | "DEMO"
  | "TEST"
  | "HISTORICAL"
  | "MANUAL"
  | "DEPLOYMENT_ROLLBACK";

export interface IIncident extends Document {
  incidentId: string;
  projectId?: string;
  requirementId: string;
  sloId: string;
  service: string;
  metric: string;
  actualValue: number;
  threshold: number;
  targetValue?: number;
  operator?: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "INVESTIGATING" | "RESOLVED";
  message: string;
  logs: string[];
  metrics: IIncidentMetrics;
  telemetryEvidence?: Record<string, any>;
  source?: IncidentSource;
  promQl?: string;
  evaluationWindow?: string;
  evaluatedAt?: Date;
  recoveryValue?: number;
  recoveryEvaluatedAt?: Date;
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
    actualValue: {
      type: Number,
      required: true,
    },
    threshold: {
      type: Number,
      required: true,
    },
    targetValue: {
      type: Number,
    },
    operator: {
      type: String,
      default: "<",
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
    source: {
      type: String,
      enum: [
        "PROMETHEUS_SLO_MONITOR",
        "DEMO",
        "TEST",
        "HISTORICAL",
        "MANUAL",
        "DEPLOYMENT_ROLLBACK",
      ],
      default: "HISTORICAL",
    },
    promQl: {
      type: String,
    },
    evaluationWindow: {
      type: String,
      default: "5m",
    },
    evaluatedAt: {
      type: Date,
    },
    recoveryValue: {
      type: Number,
    },
    recoveryEvaluatedAt: {
      type: Date,
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
      cpuUsage: { type: Number },
      memoryUsage: { type: Number },
      errorRate: { type: Number },
      latency: { type: Number },
      requestRate: { type: Number },
      p50Latency: { type: Number },
      p95Latency: { type: Number },
      p99Latency: { type: Number },
      rate4xx: { type: Number },
      rate5xx: { type: Number },
      activeRequests: { type: Number },
      deploymentChanged: { type: Boolean, default: false },
    },
    telemetryEvidence: {
      type: Schema.Types.Mixed,
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
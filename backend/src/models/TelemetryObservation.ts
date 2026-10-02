import mongoose, { Document, Schema } from "mongoose";

export interface ITelemetryFeatures {
  cpuUsage: number | null;
  memoryUsage: number | null;
  p95Latency: number | null;
  errorRate: number | null;
  requestRate: number | null;
  deploymentChanged: number;
}

export interface ITelemetryProvenanceItem {
  source: string;
  promQl: string;
  unit: string;
  value: number | null;
  timestamp: string;
}

export interface ITelemetryProvenance {
  sources: Record<string, string>;
  queries: Record<string, string>;
  units: Record<string, string>;
  timestamps: Record<string, string>;
  details?: Record<string, ITelemetryProvenanceItem>;
}

export interface ITelemetryObservation extends Document {
  observationId: string;
  projectId?: string;
  sloId: string;
  requirementId: string | null;
  service: string;
  metric: string;
  operator: string;
  target: number;
  actualValue: number;
  evaluationStatus: "COMPLIANT" | "BREACHED" | "NO_DATA" | "ERROR";
  label: "NON_VIOLATION" | "VIOLATION";
  observedAt: Date;
  featureTimestamp: Date;
  features: ITelemetryFeatures;
  featuresComplete: boolean;
  provenance: ITelemetryProvenance;
  source: string;
  schemaVersion: string;
  evaluationWindow?: string;
  promQl?: string;
  deduplicationKey?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const telemetryFeaturesSchema = new Schema<ITelemetryFeatures>(
  {
    cpuUsage: { type: Number, default: null },
    memoryUsage: { type: Number, default: null },
    p95Latency: { type: Number, default: null },
    errorRate: { type: Number, default: null },
    requestRate: { type: Number, default: null },
    deploymentChanged: { type: Number, default: 0 },
  },
  { _id: false }
);

const telemetryObservationSchema = new Schema<ITelemetryObservation>(
  {
    observationId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    projectId: {
      type: String,
      trim: true,
    },
    sloId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    requirementId: {
      type: String,
      trim: true,
      default: null,
    },
    service: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    metric: {
      type: String,
      required: true,
      trim: true,
    },
    operator: {
      type: String,
      required: true,
      default: "<",
    },
    target: {
      type: Number,
      required: true,
    },
    actualValue: {
      type: Number,
      required: true,
    },
    evaluationStatus: {
      type: String,
      required: true,
      enum: ["COMPLIANT", "BREACHED", "NO_DATA", "ERROR"],
      index: true,
    },
    label: {
      type: String,
      required: true,
      enum: ["NON_VIOLATION", "VIOLATION"],
      index: true,
    },
    observedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    featureTimestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    features: {
      type: telemetryFeaturesSchema,
      required: true,
    },
    featuresComplete: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
    provenance: {
      type: Schema.Types.Mixed,
      required: true,
      default: () => ({ sources: {}, queries: {}, units: {}, timestamps: {} }),
    },
    source: {
      type: String,
      required: true,
      default: "PROMETHEUS_SLO_MONITOR",
    },
    schemaVersion: {
      type: String,
      required: true,
      default: "v2-production-telemetry",
    },
    evaluationWindow: {
      type: String,
      default: "5m",
    },
    promQl: {
      type: String,
    },
    deduplicationKey: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient lookup and deduplication
telemetryObservationSchema.index({ sloId: 1, deduplicationKey: 1 });
telemetryObservationSchema.index({ service: 1, label: 1, observedAt: -1 });

export const TelemetryObservation = mongoose.model<ITelemetryObservation>(
  "TelemetryObservation",
  telemetryObservationSchema
);

import mongoose, { Document, Schema } from "mongoose";

export type TelemetryAssociationStatus =
  | "PENDING"
  | "COLLECTING"
  | "COMPLETE"
  | "INSUFFICIENT_DATA"
  | "FAILED";

export interface IAssociatedTelemetryFeature {
  observationId?: string;
  timestamp: Date;
  cpuUsage: number;
  memoryUsage: number;
  p95Latency: number;
  errorRate: number;
  requestRate: number;
  deploymentChanged: number;
}

export interface IMLTelemetryAssociation extends Document {
  associationId: string;
  repairId: string;
  deploymentId: string;
  modelId: string;
  modelVersion: string;
  artifactSHA256: string;
  service: string;
  runtimeResource: string;
  startTime: Date;
  endTime: Date;
  firstObservationTime?: Date;
  lastObservationTime?: Date;
  observationCount: number;
  featureSchemaVersion: string;
  source: string;
  status: TelemetryAssociationStatus;
  collectedFeatures: IAssociatedTelemetryFeature[];
  errorMessage?: string;
  actor: string;
  createdAt: Date;
  updatedAt: Date;
}

const associatedTelemetryFeatureSchema = new Schema<IAssociatedTelemetryFeature>(
  {
    observationId: { type: String, trim: true },
    timestamp: { type: Date, required: true },
    cpuUsage: { type: Number, required: true },
    memoryUsage: { type: Number, required: true },
    p95Latency: { type: Number, required: true },
    errorRate: { type: Number, required: true },
    requestRate: { type: Number, required: true },
    deploymentChanged: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const mlTelemetryAssociationSchema = new Schema<IMLTelemetryAssociation>(
  {
    associationId: {
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
    deploymentId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    modelId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    modelVersion: {
      type: String,
      required: true,
      trim: true,
    },
    artifactSHA256: {
      type: String,
      required: true,
      trim: true,
    },
    service: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    runtimeResource: {
      type: String,
      required: true,
      trim: true,
      default: "container",
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    firstObservationTime: {
      type: Date,
    },
    lastObservationTime: {
      type: Date,
    },
    observationCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    featureSchemaVersion: {
      type: String,
      required: true,
      trim: true,
      default: "v2-production-telemetry",
    },
    source: {
      type: String,
      required: true,
      trim: true,
      default: "PROMETHEUS_RUNTIME",
    },
    status: {
      type: String,
      required: true,
      enum: ["PENDING", "COLLECTING", "COMPLETE", "INSUFFICIENT_DATA", "FAILED"],
      default: "PENDING",
      index: true,
    },
    collectedFeatures: {
      type: [associatedTelemetryFeatureSchema],
      default: [],
    },
    errorMessage: {
      type: String,
      trim: true,
    },
    actor: {
      type: String,
      required: true,
      trim: true,
      default: "SYSTEM",
    },
  },
  {
    timestamps: true,
    collection: "ml_telemetry_associations",
  }
);

mlTelemetryAssociationSchema.index({ modelId: 1, createdAt: -1 });
mlTelemetryAssociationSchema.index({ repairId: 1, deploymentId: 1 });

export const MLTelemetryAssociation = mongoose.model<IMLTelemetryAssociation>(
  "MLTelemetryAssociation",
  mlTelemetryAssociationSchema
);

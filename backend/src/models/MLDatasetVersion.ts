import mongoose, { Document, Schema } from "mongoose";

export interface IMLDatasetVersion extends Document {
  datasetId: string;
  datasetVersion: string;
  datasetSHA256: string;
  sampleCount: number;
  healthyCount: number;
  violationCount: number;
  featureSchemaVersion: string;
  sourceTypes: string[];
  temporalStart: Date;
  temporalEnd: Date;
  calendarDays: number;
  generationTimestamp: Date;
  builderVersion: string;
  sourceGitSHA?: string;
  leakageChecks: {
    hasLeakage: boolean;
    trainValOverlapCount: number;
    trainTestOverlapCount: number;
    valTestOverlapCount: number;
    chronologicalOrderValid: boolean;
  };
  historicalExclusion: {
    historicalIncidentsCount: number;
    nonPrometheusIncidentsCount: number;
    incompleteObservationsCount: number;
    incompleteIncidentsCount: number;
  };
  readinessStatus: {
    isReady: boolean;
    reasons: string[];
    totalSpanHours: number;
    distinctServicesCount: number;
    distinctSlosCount: number;
    distinctRequirementsCount: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const mlDatasetVersionSchema = new Schema<IMLDatasetVersion>(
  {
    datasetId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    datasetVersion: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    datasetSHA256: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    sampleCount: {
      type: Number,
      required: true,
      min: 0,
    },
    healthyCount: {
      type: Number,
      required: true,
      min: 0,
    },
    violationCount: {
      type: Number,
      required: true,
      min: 0,
    },
    featureSchemaVersion: {
      type: String,
      required: true,
      trim: true,
      default: "v2-production-telemetry",
    },
    sourceTypes: {
      type: [String],
      required: true,
      default: ["TELEMETRY_OBSERVATION", "PROMETHEUS_SLO_MONITOR"],
    },
    temporalStart: {
      type: Date,
      required: true,
    },
    temporalEnd: {
      type: Date,
      required: true,
    },
    calendarDays: {
      type: Number,
      required: true,
      min: 1,
    },
    generationTimestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    builderVersion: {
      type: String,
      required: true,
      trim: true,
      default: "3.3.0",
    },
    sourceGitSHA: {
      type: String,
      trim: true,
    },
    leakageChecks: {
      hasLeakage: { type: Boolean, required: true, default: false },
      trainValOverlapCount: { type: Number, required: true, default: 0 },
      trainTestOverlapCount: { type: Number, required: true, default: 0 },
      valTestOverlapCount: { type: Number, required: true, default: 0 },
      chronologicalOrderValid: { type: Boolean, required: true, default: true },
    },
    historicalExclusion: {
      historicalIncidentsCount: { type: Number, required: true, default: 0 },
      nonPrometheusIncidentsCount: { type: Number, required: true, default: 0 },
      incompleteObservationsCount: { type: Number, required: true, default: 0 },
      incompleteIncidentsCount: { type: Number, required: true, default: 0 },
    },
    readinessStatus: {
      isReady: { type: Boolean, required: true, default: true },
      reasons: { type: [String], default: [] },
      totalSpanHours: { type: Number, required: true, default: 0 },
      distinctServicesCount: { type: Number, required: true, default: 0 },
      distinctSlosCount: { type: Number, required: true, default: 0 },
      distinctRequirementsCount: { type: Number, required: true, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

mlDatasetVersionSchema.index({ datasetVersion: 1, datasetSHA256: 1 });

export const MLDatasetVersion = mongoose.model<IMLDatasetVersion>(
  "MLDatasetVersion",
  mlDatasetVersionSchema
);

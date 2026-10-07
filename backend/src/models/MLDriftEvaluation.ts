import mongoose, { Document, Schema } from "mongoose";

export type DriftOverallStatus =
  | "NO_SIGNIFICANT_DRIFT"
  | "MODERATE_DRIFT"
  | "SIGNIFICANT_DRIFT"
  | "INSUFFICIENT_DATA"
  | "FAILED";

export interface IFeatureDriftResult {
  feature: string;
  featureType: "CONTINUOUS" | "BINARY";
  referenceSampleCount: number;
  currentSampleCount: number;
  psi: number;
  psiStatus: "NO_DRIFT" | "MODERATE_DRIFT" | "SIGNIFICANT_DRIFT" | "INSUFFICIENT_DATA";
  ksStatistic?: number | null;
  ksPValue?: number | null;
  ksCriticalValue?: number | null;
  ksSignificant?: boolean;
  driftScore: number;
  threshold: number;
  status: "NO_SIGNIFICANT_DRIFT" | "MODERATE_DRIFT" | "SIGNIFICANT_DRIFT" | "INSUFFICIENT_DATA";
  distributionDetails?: Record<string, any>;
}

export interface IMLDriftEvaluation extends Document {
  driftEvaluationId: string;
  modelId: string;
  modelVersion: string;
  artifactSHA256: string;
  associationId: string;
  referenceDatasetId: string;
  referenceDatasetSHA256?: string;
  policyVersion: string;
  evaluationTimestamp: Date;
  sampleCounts: {
    reference: number;
    current: number;
  };
  featureResults: IFeatureDriftResult[];
  overallStatus: DriftOverallStatus;
  minimumSampleRequirement: number;
  isImmutable: boolean;
  evaluatedBy: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const featureDriftResultSchema = new Schema<IFeatureDriftResult>(
  {
    feature: { type: String, required: true },
    featureType: { type: String, required: true, enum: ["CONTINUOUS", "BINARY"] },
    referenceSampleCount: { type: Number, required: true },
    currentSampleCount: { type: Number, required: true },
    psi: { type: Number, required: true },
    psiStatus: {
      type: String,
      required: true,
      enum: ["NO_DRIFT", "MODERATE_DRIFT", "SIGNIFICANT_DRIFT", "INSUFFICIENT_DATA"],
    },
    ksStatistic: { type: Number, default: null },
    ksPValue: { type: Number, default: null },
    ksCriticalValue: { type: Number, default: null },
    ksSignificant: { type: Boolean, default: false },
    driftScore: { type: Number, required: true },
    threshold: { type: Number, required: true },
    status: {
      type: String,
      required: true,
      enum: ["NO_SIGNIFICANT_DRIFT", "MODERATE_DRIFT", "SIGNIFICANT_DRIFT", "INSUFFICIENT_DATA"],
    },
    distributionDetails: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const mlDriftEvaluationSchema = new Schema<IMLDriftEvaluation>(
  {
    driftEvaluationId: {
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
    associationId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    referenceDatasetId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    referenceDatasetSHA256: {
      type: String,
      trim: true,
    },
    policyVersion: {
      type: String,
      required: true,
      trim: true,
      default: "D4-DRIFT-POLICY-1.0.0",
    },
    evaluationTimestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    sampleCounts: {
      reference: { type: Number, required: true },
      current: { type: Number, required: true },
    },
    featureResults: {
      type: [featureDriftResultSchema],
      required: true,
      default: [],
    },
    overallStatus: {
      type: String,
      required: true,
      enum: [
        "NO_SIGNIFICANT_DRIFT",
        "MODERATE_DRIFT",
        "SIGNIFICANT_DRIFT",
        "INSUFFICIENT_DATA",
        "FAILED",
      ],
      index: true,
    },
    minimumSampleRequirement: {
      type: Number,
      required: true,
      default: 10,
    },
    isImmutable: {
      type: Boolean,
      required: true,
      default: false,
    },
    evaluatedBy: {
      type: String,
      required: true,
      trim: true,
      default: "SYSTEM",
    },
    errorMessage: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: "ml_drift_evaluations",
  }
);

mlDriftEvaluationSchema.index({ modelId: 1, evaluationTimestamp: -1 });

// Immutability Guard: Reject mutations once evaluation is finalized
mlDriftEvaluationSchema.pre("save", function (next) {
  if (!this.isNew && this.isImmutable) {
    return next(
      new Error(
        "Immutability Violation: Completed MLDriftEvaluation records are immutable and cannot be modified."
      )
    );
  }
  next();
});

export const MLDriftEvaluation = mongoose.model<IMLDriftEvaluation>(
  "MLDriftEvaluation",
  mlDriftEvaluationSchema
);

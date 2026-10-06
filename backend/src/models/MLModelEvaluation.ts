import mongoose, { Document, Schema } from "mongoose";

export interface IMLModelEvaluation extends Document {
  evaluationId: string;
  modelId: string;
  datasetId?: string;
  split: "TRAIN" | "VALIDATION" | "TEST";
  sampleCount: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  rocAuc: number;
  prAuc?: number;
  logLoss: number;
  brierScore?: number;
  confusionMatrix: {
    truePositive: number;
    falsePositive: number;
    trueNegative: number;
    falseNegative: number;
  };
  threshold: number;
  calibrationInfo?: Record<string, any>;
  evaluationTimestamp: Date;
  evaluatorVersion: string;
  resultStatus: "PASSED" | "FAILED" | "PENDING";
  summary?: string;
  createdAt: Date;
  updatedAt: Date;
}

const mlModelEvaluationSchema = new Schema<IMLModelEvaluation>(
  {
    evaluationId: {
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
    datasetId: {
      type: String,
      trim: true,
      index: true,
    },
    split: {
      type: String,
      required: true,
      enum: ["TRAIN", "VALIDATION", "TEST"],
      index: true,
    },
    sampleCount: {
      type: Number,
      required: true,
      min: 1,
    },
    accuracy: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    precision: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    recall: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    f1Score: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    rocAuc: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    prAuc: {
      type: Number,
      min: 0,
      max: 1,
    },
    logLoss: {
      type: Number,
      required: true,
      min: 0,
    },
    brierScore: {
      type: Number,
      min: 0,
      max: 1,
    },
    confusionMatrix: {
      truePositive: { type: Number, required: true, min: 0 },
      falsePositive: { type: Number, required: true, min: 0 },
      trueNegative: { type: Number, required: true, min: 0 },
      falseNegative: { type: Number, required: true, min: 0 },
    },
    threshold: {
      type: Number,
      required: true,
      default: 0.5,
    },
    calibrationInfo: {
      type: Schema.Types.Mixed,
      default: {},
    },
    evaluationTimestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    evaluatorVersion: {
      type: String,
      required: true,
      trim: true,
      default: "1.0.0",
    },
    resultStatus: {
      type: String,
      required: true,
      enum: ["PASSED", "FAILED", "PENDING"],
      default: "PASSED",
      index: true,
    },
    summary: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

mlModelEvaluationSchema.index({ modelId: 1, split: 1 });

export const MLModelEvaluation = mongoose.model<IMLModelEvaluation>(
  "MLModelEvaluation",
  mlModelEvaluationSchema
);

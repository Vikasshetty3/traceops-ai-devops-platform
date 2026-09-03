import mongoose, { Document, Schema } from "mongoose";

export interface IRequirement extends Document {
  requirementId: string;
  projectId?: string;
  title: string;
  description: string;
  service: string;
  category?: "performance" | "availability" | "reliability" | "security";
  metric?: string;
  operator?: "<" | "<=" | ">" | ">=" | "=";
  threshold?: number;
  unit?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "ACTIVE" | "INACTIVE";
  requirementType?: "EXPLICIT" | "INFERRED";
  sourceFile?: string;
  confidence?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const requirementSchema = new Schema<IRequirement>(
  {
    requirementId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    projectId: {
      type: String,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    service: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ["performance", "availability", "reliability", "security"],
      default: "performance",
    },
    metric: {
      type: String,
      trim: true,
      default: "p95_latency",
    },
    operator: {
      type: String,
      enum: ["<", "<=", ">", ">=", "="],
      default: "<",
    },
    threshold: {
      type: Number,
      default: 2,
    },
    unit: {
      type: String,
      trim: true,
      default: "seconds",
    },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "HIGH",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
    requirementType: {
      type: String,
      enum: ["EXPLICIT", "INFERRED"],
      default: "EXPLICIT",
    },
    sourceFile: {
      type: String,
      trim: true,
    },
    confidence: {
      type: Number,
      default: 1.0,
    },
  },
  {
    timestamps: true,
  }
);

export const Requirement = mongoose.model<IRequirement>(
  "Requirement",
  requirementSchema
);
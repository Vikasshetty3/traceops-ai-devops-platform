import mongoose, { Document, Schema } from "mongoose";

export interface IRequirement extends Document {
  requirementId: string;
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
  },
  {
    timestamps: true,
  }
);

export const Requirement = mongoose.model<IRequirement>(
  "Requirement",
  requirementSchema
);
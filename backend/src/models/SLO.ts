import mongoose, { Document, Schema } from "mongoose";

export interface ISLOEvaluationRecord {
  status: "COMPLIANT" | "BREACHED" | "NO_DATA" | "ERROR";
  actualValue: number | null;
  target: number;
  evaluatedAt: Date;
  promQl: string;
  errorMessage?: string;
}

export interface ISLO extends Document {
  sloId: string;
  projectId?: string;
  requirementId: string;
  service: string;
  metric: string;
  operator: "<" | "<=" | ">" | ">=" | "=";
  threshold: number;
  target?: number;
  unit: string;
  window: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "ACTIVE" | "INACTIVE";
  sloType?: "EXPLICIT" | "INFERRED";
  sourceFile?: string;
  confidence?: number;
  promQl?: string;
  latestEvaluation?: ISLOEvaluationRecord;
  createdAt?: Date;
  updatedAt?: Date;
}

const sloSchema = new Schema<ISLO>(
  {
    sloId: {
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
    operator: {
      type: String,
      enum: ["<", "<=", ">", ">=", "="],
      default: "<",
    },
    threshold: {
      type: Number,
      required: true,
    },
    target: {
      type: Number,
    },
    unit: {
      type: String,
      required: true,
      trim: true,
      default: "seconds",
    },
    window: {
      type: String,
      required: true,
      trim: true,
      default: "5m",
    },
    severity: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "CRITICAL",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
    sloType: {
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
    promQl: {
      type: String,
      trim: true,
    },
    latestEvaluation: {
      status: {
        type: String,
        enum: ["COMPLIANT", "BREACHED", "NO_DATA", "ERROR"],
      },
      actualValue: {
        type: Number,
        default: null,
      },
      target: {
        type: Number,
      },
      evaluatedAt: {
        type: Date,
      },
      promQl: {
        type: String,
      },
      errorMessage: {
        type: String,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to ensure target mirrors threshold if omitted
sloSchema.pre("save", function (next) {
  if (this.target === undefined && this.threshold !== undefined) {
    this.target = this.threshold;
  }
  next();
});

export const SLO = mongoose.model<ISLO>("SLO", sloSchema);
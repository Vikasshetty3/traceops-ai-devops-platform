import mongoose, { Document, Schema } from "mongoose";

export interface IValidationStageResult {
  stage: "SYNTAX" | "BUILD" | "LINT" | "TEST" | "DOCKER_BUILD";
  command: string;
  passed: boolean;
  output: string;
  durationMs: number;
}

export interface ICodeRepair extends Document {
  repairId: string;
  issueId: string;
  projectId: string;
  service: string;
  status: "GENERATED" | "VALIDATING" | "VALIDATED" | "REPAIR_FAILED" | "APPROVED" | "REJECTED" | "DEPLOYED";
  workspacePath: string;
  changedFiles: string[];
  diff: string;
  explanation: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  validationStatus: "PENDING" | "VALIDATED" | "FAILED";
  validationStages: IValidationStageResult[];
  validationLogs: string[];
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  approvedBy?: string;
  approvedAt?: Date;
  rejectionReason?: string;
  beforeHashes: Record<string, string>;
  afterHashes: Record<string, string>;
  createdAt?: Date;
  updatedAt?: Date;
}

const codeRepairSchema = new Schema<ICodeRepair>(
  {
    repairId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    issueId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    projectId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    service: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["GENERATED", "VALIDATING", "VALIDATED", "REPAIR_FAILED", "APPROVED", "REJECTED", "DEPLOYED"],
      default: "GENERATED",
    },
    workspacePath: {
      type: String,
      required: true,
    },
    changedFiles: [{ type: String }],
    diff: {
      type: String,
      required: true,
    },
    explanation: {
      type: String,
      required: true,
    },
    riskLevel: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      default: "LOW",
    },
    validationStatus: {
      type: String,
      enum: ["PENDING", "VALIDATED", "FAILED"],
      default: "PENDING",
    },
    validationStages: [
      {
        stage: { type: String, required: true },
        command: { type: String, required: true },
        passed: { type: Boolean, required: true },
        output: { type: String, default: "" },
        durationMs: { type: Number, default: 0 },
      },
    ],
    validationLogs: [{ type: String }],
    approvalStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
    approvedBy: { type: String },
    approvedAt: { type: Date },
    rejectionReason: { type: String },
    beforeHashes: { type: Schema.Types.Mixed, default: {} },
    afterHashes: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
  }
);

export const CodeRepair = mongoose.model<ICodeRepair>("CodeRepair", codeRepairSchema);

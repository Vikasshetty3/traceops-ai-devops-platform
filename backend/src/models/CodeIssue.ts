import mongoose, { Document, Schema } from "mongoose";

export interface ICodeIssue extends Document {
  issueId: string;
  projectId: string;
  service: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category:
    | "SYNTAX_ERROR"
    | "SECURITY_VULNERABILITY"
    | "RESOURCE_LEAK"
    | "MISSING_TIMEOUT"
    | "UNHANDLED_EXCEPTION"
    | "CONFIGURATION_ERROR"
    | "DOCKER_MISCONFIGURATION"
    | "SLO_RISK";
  file: string;
  line: number;
  evidence: string;
  description: string;
  rootCause: string;
  confidence: number;
  suggestedFix: string;
  sloImpact?: string;
  status: "OPEN" | "REPAIRING" | "REPAIRED" | "IGNORED";
  createdAt?: Date;
  updatedAt?: Date;
}

const codeIssueSchema = new Schema<ICodeIssue>(
  {
    issueId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
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
    severity: {
      type: String,
      enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
      required: true,
    },
    category: {
      type: String,
      enum: [
        "SYNTAX_ERROR",
        "SECURITY_VULNERABILITY",
        "RESOURCE_LEAK",
        "MISSING_TIMEOUT",
        "UNHANDLED_EXCEPTION",
        "CONFIGURATION_ERROR",
        "DOCKER_MISCONFIGURATION",
        "SLO_RISK",
      ],
      required: true,
    },
    file: {
      type: String,
      required: true,
      trim: true,
    },
    line: {
      type: Number,
      required: true,
    },
    evidence: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    rootCause: {
      type: String,
      required: true,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    suggestedFix: {
      type: String,
      required: true,
    },
    sloImpact: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["OPEN", "REPAIRING", "REPAIRED", "IGNORED"],
      default: "OPEN",
    },
  },
  {
    timestamps: true,
  }
);

export const CodeIssue = mongoose.model<ICodeIssue>("CodeIssue", codeIssueSchema);

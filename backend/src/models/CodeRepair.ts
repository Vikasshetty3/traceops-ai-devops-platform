import mongoose, { Document, Schema } from "mongoose";

export interface IValidationStageResult {
  stage: "SYNTAX" | "BUILD" | "LINT" | "TEST" | "DOCKER_BUILD" | "SOURCE_INTEGRITY" | "PATH_SAFETY" | "TYPESCRIPT";
  command: string;
  passed: boolean;
  output: string;
  durationMs: number;
}

export interface ICodeRepair extends Document {
  repairId: string;
  issueId?: string;
  projectId: string;
  service: string;
  status:
    | "GENERATED"
    | "VALIDATING"
    | "VALIDATED"
    | "REPAIR_FAILED"
    | "APPROVED"
    | "REJECTED"
    | "DEPLOYED"
    | "BLOCKED"
    | "ADVISORY_ONLY"
    | "UNSUPPORTED_REPAIR_ACTION";
  workspacePath: string;
  changedFiles: string[];
  diff: string;
  explanation: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  validationStatus: "PENDING" | "VALIDATED" | "FAILED" | "BLOCKED";
  validationStages: IValidationStageResult[];
  validationLogs: string[];
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  approvedBy?: string;
  approvedAt?: Date;
  rejectionReason?: string;
  beforeHashes: Record<string, string>;
  afterHashes: Record<string, string>;

  // Phase 5.2 Traceability & RCA Provenance
  incidentId?: string;
  rcaId?: string;
  sloId?: string;
  requirementId?: string;
  evidenceSnapshotHash?: string;
  canonicalEvidenceSnapshot?: Record<string, any>;
  rcaModel?: string;
  rcaAnalysisStatus?: string;
  repairSource?: "RUNTIME_INCIDENT" | "MANUAL" | "HISTORICAL" | "UNKNOWN";
  repairTrigger?: "PROMETHEUS_SLO_INCIDENT" | "MANUAL_INVOCATION";
  candidateAction?: string;
  candidateActionType?:
    | "MISSING_TIMEOUT"
    | "RESOURCE_LEAK"
    | "UNHANDLED_EXCEPTION"
    | "CONFIGURATION_ERROR"
    | "SECURITY_VULNERABILITY"
    | "DOCKER_MISCONFIGURATION"
    | "ADVISORY_ONLY"
    | "UNSUPPORTED_REPAIR_ACTION";
  evidenceReferences?: string[];

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
      required: false,
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
      enum: [
        "GENERATED",
        "VALIDATING",
        "VALIDATED",
        "REPAIR_FAILED",
        "APPROVED",
        "REJECTED",
        "DEPLOYED",
        "BLOCKED",
        "ADVISORY_ONLY",
        "UNSUPPORTED_REPAIR_ACTION",
      ],
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
      enum: ["PENDING", "VALIDATED", "FAILED", "BLOCKED"],
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

    // Phase 5.2 fields
    incidentId: {
      type: String,
      trim: true,
      index: true,
    },
    rcaId: {
      type: String,
      trim: true,
      index: true,
    },
    sloId: {
      type: String,
      trim: true,
      index: true,
    },
    requirementId: {
      type: String,
      trim: true,
      index: true,
    },
    evidenceSnapshotHash: {
      type: String,
      trim: true,
    },
    canonicalEvidenceSnapshot: {
      type: Schema.Types.Mixed,
    },
    rcaModel: {
      type: String,
      trim: true,
    },
    rcaAnalysisStatus: {
      type: String,
      trim: true,
    },
    repairSource: {
      type: String,
      enum: ["RUNTIME_INCIDENT", "MANUAL", "HISTORICAL", "UNKNOWN"],
      default: "MANUAL",
    },
    repairTrigger: {
      type: String,
      enum: ["PROMETHEUS_SLO_INCIDENT", "MANUAL_INVOCATION"],
      default: "MANUAL_INVOCATION",
    },
    candidateAction: {
      type: String,
      trim: true,
    },
    candidateActionType: {
      type: String,
      enum: [
        "MISSING_TIMEOUT",
        "RESOURCE_LEAK",
        "UNHANDLED_EXCEPTION",
        "CONFIGURATION_ERROR",
        "SECURITY_VULNERABILITY",
        "DOCKER_MISCONFIGURATION",
        "ADVISORY_ONLY",
        "UNSUPPORTED_REPAIR_ACTION",
      ],
    },
    evidenceReferences: [{ type: String }],
  },
  {
    timestamps: true,
  }
);

export const CodeRepair = mongoose.model<ICodeRepair>("CodeRepair", codeRepairSchema);

import mongoose, { Document, Schema } from "mongoose";

export interface IStructuredEvidenceItem {
  type: "PROMETHEUS" | "LOG" | "SLO" | "REQUIREMENT" | "DEPLOYMENT";
  source: string;
  timestamp: string;
  promQl?: string;
  value?: any;
  message?: string;
  observed: boolean;
}

export interface ITimelineEvent {
  timestamp: string;
  event: string;
  type: string;
}

export interface IRCAImpact {
  observed: string;
  metric: string;
  actualValue: number;
  target: number;
  operator?: string;
}

export interface IRCAConfidence {
  value: number;
  rationale: string;
}

export interface IRCAProvenance {
  collectedAt: Date;
  prometheusQueriesCount: number;
  logLinesCount: number;
  deploymentChecked: boolean;
  isHistorical: boolean;
  llmModel?: string;
}

export interface IRCA extends Document {
  rcaId: string;
  incidentId: string;
  requirementId: string;
  sloId?: string;
  service?: string;
  detectedAt?: Date;
  impact?: IRCAImpact;
  rootCause: string;
  rootCauseHypothesis?: string;
  observedFacts?: string[];
  causalChain?: string[];
  contributingFactors?: string[];
  remediation?: string[];
  recommendedAction: string;
  uncertainty?: string[];
  timeline?: ITimelineEvent[];
  confidence: number;
  confidenceDetails?: IRCAConfidence;
  evidence: string[];
  structuredEvidence?: IStructuredEvidenceItem[];
  analysisStatus:
    | "EVIDENCE_BACKED"
    | "INSUFFICIENT_EVIDENCE"
    | "ERROR"
    | "DETERMINISTIC_EVIDENCE_SUMMARY"
    | "AI_UNAVAILABLE";
  provenance?: IRCAProvenance;
  metricsSnapshot?: {
    cpuUsage?: number;
    memoryUsage?: number;
    errorRate?: number;
    latency?: number;
    deploymentChanged?: boolean;
  };
  status: "GENERATED" | "APPROVED" | "REMEDIATED";
  createdAt?: Date;
  updatedAt?: Date;
}

const rcaSchema = new Schema<IRCA>(
  {
    rcaId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    incidentId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    requirementId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    sloId: {
      type: String,
      trim: true,
    },
    service: {
      type: String,
      trim: true,
    },
    detectedAt: {
      type: Date,
    },
    impact: {
      observed: { type: String },
      metric: { type: String },
      actualValue: { type: Number },
      target: { type: Number },
      operator: { type: String },
    },
    rootCause: {
      type: String,
      required: true,
      trim: true,
    },
    rootCauseHypothesis: {
      type: String,
      trim: true,
    },
    observedFacts: {
      type: [String],
      default: [],
    },
    causalChain: {
      type: [String],
      default: [],
    },
    contributingFactors: {
      type: [String],
      default: [],
    },
    remediation: {
      type: [String],
      default: [],
    },
    recommendedAction: {
      type: String,
      required: true,
      trim: true,
    },
    uncertainty: {
      type: [String],
      default: [],
    },
    timeline: [
      {
        timestamp: { type: String },
        event: { type: String },
        type: { type: String },
      },
    ],
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    confidenceDetails: {
      value: { type: Number },
      rationale: { type: String },
    },
    evidence: {
      type: [String],
      required: true,
    },
    structuredEvidence: [
      {
        type: {
          type: String,
          enum: ["PROMETHEUS", "LOG", "SLO", "REQUIREMENT", "DEPLOYMENT"],
        },
        source: { type: String },
        timestamp: { type: String },
        promQl: { type: String },
        value: { type: Schema.Types.Mixed },
        message: { type: String },
        observed: { type: Boolean, default: true },
      },
    ],
    analysisStatus: {
      type: String,
      enum: [
        "EVIDENCE_BACKED",
        "INSUFFICIENT_EVIDENCE",
        "ERROR",
        "DETERMINISTIC_EVIDENCE_SUMMARY",
        "AI_UNAVAILABLE",
      ],
      default: "EVIDENCE_BACKED",
    },
    provenance: {
      collectedAt: { type: Date, default: Date.now },
      prometheusQueriesCount: { type: Number, default: 0 },
      logLinesCount: { type: Number, default: 0 },
      deploymentChecked: { type: Boolean, default: false },
      isHistorical: { type: Boolean, default: false },
      llmModel: { type: String },
    },
    metricsSnapshot: {
      cpuUsage: { type: Number },
      memoryUsage: { type: Number },
      errorRate: { type: Number },
      latency: { type: Number },
      deploymentChanged: { type: Boolean },
    },
    status: {
      type: String,
      enum: ["GENERATED", "APPROVED", "REMEDIATED"],
      default: "GENERATED",
    },
  },
  {
    timestamps: true,
  }
);

export const RCA = mongoose.model<IRCA>("RCA", rcaSchema);
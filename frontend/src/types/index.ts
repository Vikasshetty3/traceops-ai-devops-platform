export type Requirement = {
  _id?: string;
  requirementId: string;
  title: string;
  description: string;
  service: string;
  category?: string;
  metric?: string;
  operator?: string;
  threshold?: number;
  unit?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "ACTIVE" | "INACTIVE";
  createdAt?: string;
};

export type SLO = {
  _id?: string;
  sloId: string;
  requirementId: string;
  service: string;
  metric: string;
  operator: string;
  threshold: number;
  target?: number;
  unit: string;
  window: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "ACTIVE" | "INACTIVE";
  createdAt?: string;
};

export type Incident = {
  _id?: string;
  incidentId: string;
  requirementId: string;
  sloId: string;
  service: string;
  metric: string;
  actualValue: number;
  threshold: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "INVESTIGATING" | "RESOLVED";
  message: string;
  logs: string[];
  metrics: {
    cpuUsage?: number;
    memoryUsage?: number;
    errorRate?: number;
    latency?: number;
    deploymentChanged?: boolean;
  };
  createdAt?: string;
};

export type RCA = {
  _id?: string;
  rcaId: string;
  incidentId: string;
  requirementId: string;
  sloId?: string;
  service?: string;
  rootCause: string;
  evidence: string[];
  confidence: number;
  recommendedAction: string;
  metricsSnapshot?: {
    cpuUsage?: number;
    memoryUsage?: number;
    errorRate?: number;
    latency?: number;
    deploymentChanged?: boolean;
  };
  status: "GENERATED" | "APPROVED" | "REMEDIATED";
  createdAt?: string;
};

export type Experiment = {
  _id?: string;
  experimentId: string;
  rcaId?: string;
  requirementId: string;
  service: string;
  hypothesis: string;
  remediationAction: string;
  parameters: {
    parameterName: string;
    currentValue: string | number;
    proposedValue: string | number;
  };
  metricsBefore: {
    latency: number;
    errorRate: number;
    cpuUsage: number;
    memoryUsage: number;
  };
  metricsAfter: {
    latency: number;
    errorRate: number;
    cpuUsage: number;
    memoryUsage: number;
  };
  sloThreshold: number;
  result: "PASS" | "FAIL";
  improvementPct: number;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  createdAt?: string;
};

export type DevOpsAction = {
  _id?: string;
  actionId: string;
  rcaId?: string;
  experimentId?: string;
  requirementId?: string;
  service: string;
  actionType: "SCALE_SERVICE" | "RESTART_POD" | "UPDATE_CONFIG" | "ROLLBACK";
  description: string;
  payload: Record<string, unknown>;
  status: "PROPOSED" | "APPROVED" | "EXECUTED" | "REJECTED";
  approvedBy?: string;
  approvedAt?: string;
  executedAt?: string;
  executionLogs: string[];
  createdAt?: string;
};

export type TraceGraphNode = {
  requirement: Requirement;
  slos: SLO[];
  incidents: Incident[];
  rcas: RCA[];
  experiments: Experiment[];
  devopsActions: DevOpsAction[];
};

export type ServiceTelemetry = {
  service: string;
  status: "HEALTHY" | "DEGRADED" | "CRITICAL";
  p95Latency: number;
  cpuUsage: number;
  memoryUsage: number;
  errorRate: number;
  requestRate: number;
  deploymentChanged: boolean;
  lastUpdated: string;
};

export type MLPredictionData = {
  prediction: "VIOLATION" | "NO_VIOLATION";
  violationProbability: number;
  probability: number;
  confidence: number;
  model: string;
  modelVersion?: string;
  factors: {
    cpuFactor: number;
    memoryFactor: number;
    errorFactor: number;
    latencyFactor: number;
    deploymentFactor: number;
  };
  topRiskFactors?: string[];
  explanation?: string[];
};

export type ResearchResults = {
  mlAccuracy: number;
  mlPrecision: number;
  mlRecall: number;
  mlF1: number;
  mlRocAuc: number;
  mlAvgLatencyMs: number;
  rcaAccuracy: number;
  rcaConfidence: number;
  rcaAvgLatencyMs: number;
  validRemediationSuccess: number;
  unsafeRejectionRate: number;
  traceabilityCompletionRate: number;
};

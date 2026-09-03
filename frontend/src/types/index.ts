export type ProjectService = {
  name: string;
  type: string;
  path?: string;
  port?: number;
  description?: string;
};

export type ProjectTechStack = {
  languages: string[];
  frameworks: string[];
  buildTools: string[];
  databases?: string[];
  containerization: string[];
  cicd: string[];
};

export type ProjectAnalysisSummary = {
  totalFiles: number;
  totalLinesOfCode?: number;
  explicitRequirementsCount: number;
  inferredRequirementsCount: number;
  slosCount: number;
  servicesCount: number;
  dockerDetected: boolean;
  k8sDetected: boolean;
  cicdDetected: boolean;
  architectureType: "MONOLITH" | "MICROSERVICES" | "SERVERLESS" | "MODULAR_SERVICE";
};

export type Project = {
  _id?: string;
  projectId: string;
  name: string;
  description?: string;
  sourceType: "ZIP_UPLOAD" | "LOCAL_DIRECTORY" | "GIT_REPO" | "GITHUB";
  status: "UPLOADED" | "ANALYZING" | "ANALYZED" | "FAILED";
  archivePath?: string;
  sourcePath?: string;
  repositoryUrl?: string;
  repositoryOwner?: string;
  repositoryName?: string;
  repositoryBranch?: string;
  commitSha?: string;
  techStack: ProjectTechStack;
  services: ProjectService[];
  analysisSummary: ProjectAnalysisSummary;
  extractedRequirements: string[];
  generatedSLOs: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type Requirement = {
  _id?: string;
  requirementId: string;
  projectId?: string;
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
  requirementType?: "EXPLICIT" | "INFERRED";
  sourceFile?: string;
  confidence?: number;
  createdAt?: string;
};

export type SLO = {
  _id?: string;
  sloId: string;
  projectId?: string;
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
  sloType?: "EXPLICIT" | "INFERRED";
  sourceFile?: string;
  confidence?: number;
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
  codeIssues?: CodeIssue[];
  codeRepairs?: CodeRepair[];
  deployments?: Deployment[];
  verifications?: DeploymentVerification[];
};

export type CodeIssue = {
  _id?: string;
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
  createdAt?: string;
};

export type ValidationStageResult = {
  stage: "SYNTAX" | "BUILD" | "LINT" | "TEST" | "DOCKER_BUILD";
  command: string;
  passed: boolean;
  output: string;
  durationMs: number;
};

export type CodeRepair = {
  _id?: string;
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
  validationStages: ValidationStageResult[];
  validationLogs: string[];
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  beforeHashes?: Record<string, string>;
  afterHashes?: Record<string, string>;
  createdAt?: string;
};

export type Deployment = {
  _id?: string;
  deploymentId: string;
  repairId: string;
  projectId: string;
  service: string;
  version: string;
  imageTag: string;
  containerId?: string;
  containerName?: string;
  hostPort?: number;
  targetPort?: number;
  status: "BUILDING" | "DEPLOYING" | "RUNNING" | "HEALTHY" | "FAILED" | "ROLLED_BACK";
  healthCheckUrl?: string;
  healthCheckPassed: boolean;
  deploymentLogs: string[];
  deployedAt?: string;
  rolledBackAt?: string;
  rollbackReason?: string;
  createdAt?: string;
};

export type DeploymentVerification = {
  _id?: string;
  verificationId: string;
  deploymentId: string;
  projectId: string;
  service: string;
  sloId?: string;
  healthCheckPassed: boolean;
  healthCheckLatencyMs: number;
  sloMetric: string;
  beforeValue: number;
  afterValue: number;
  targetValue: number;
  targetUnit: string;
  sloCompliant: boolean;
  improvementPercentage: number;
  verificationLogs: string[];
  verifiedAt: string;
};

export type RepairHistory = {
  issues: CodeIssue[];
  repairs: CodeRepair[];
  deployments: Deployment[];
  verifications: DeploymentVerification[];
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

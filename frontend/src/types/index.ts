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

export type SLOEvaluationRecord = {
  status: "COMPLIANT" | "BREACHED" | "NO_DATA" | "ERROR";
  actualValue: number | null;
  target: number;
  evaluatedAt: string;
  promQl: string;
  errorMessage?: string;
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
  latestEvaluation?: SLOEvaluationRecord;
  createdAt?: string;
};

export type IncidentSource =
  | "PROMETHEUS_SLO_MONITOR"
  | "DEMO"
  | "TEST"
  | "HISTORICAL"
  | "MANUAL"
  | "DEPLOYMENT_ROLLBACK";

export type Incident = {
  _id?: string;
  incidentId: string;
  projectId?: string;
  requirementId: string;
  sloId: string;
  service: string;
  metric: string;
  actualValue: number;
  threshold: number;
  targetValue?: number;
  operator?: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "INVESTIGATING" | "RESOLVED";
  source?: IncidentSource;
  promQl?: string;
  evaluationWindow?: string;
  evaluatedAt?: string;
  recoveryValue?: number;
  recoveryEvaluatedAt?: string;
  resolvedAt?: string;
  message: string;
  logs: string[];
  metrics: {
    cpuUsage?: number;
    memoryUsage?: number;
    errorRate?: number;
    latency?: number;
    requestRate?: number;
    p50Latency?: number;
    p95Latency?: number;
    p99Latency?: number;
    rate4xx?: number;
    rate5xx?: number;
    activeRequests?: number;
    deploymentChanged?: boolean;
  };
  telemetryEvidence?: Record<string, any>;
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
  validationStages: ValidationStageResult[];
  validationLogs: string[];
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  beforeHashes?: Record<string, string>;
  afterHashes?: Record<string, string>;

  // Phase 5.2 Traceability & Provenance
  incidentId?: string;
  rcaId?: string;
  sloId?: string;
  requirementId?: string;
  evidenceSnapshotHash?: string;
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
  candidateImage?: string;
  predecessorImage?: string;
  candidateCommitSha?: string;
  candidateContainer?: string;
  predecessorContainer?: string;
  containerId?: string;
  containerName?: string;
  hostPort?: number;
  targetPort?: number;
  targetUrl?: string;
  strategy?: "DIRECT" | "CANARY" | "BLUE_GREEN";
  trafficStrategy?: "DIRECT" | "CANARY" | "BLUE_GREEN";
  candidateTrafficWeight?: number;
  predecessorTrafficWeight?: number;
  canaryStatus?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ABORTED";
  currentCanaryStage?: string;
  canaryStages?: Array<{
    stage: string;
    candidateWeight: number;
    predecessorWeight: number;
    durationSeconds?: number;
    elapsedSeconds?: number;
    enteredAt: string | Date;
    completedAt?: string | Date;
    status: string;
    reason?: string;
  }>;
  status: "BUILDING" | "DEPLOYING" | "RUNNING" | "HEALTHY" | "FAILED" | "ROLLED_BACK" | "DEPLOYED" | "STABLE";
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
  p95Latency: number | null;
  cpuUsage: number | null;
  memoryUsage: number | null;
  errorRate: number | null;
  requestRate: number | null;
  deploymentChanged?: boolean;
  lastUpdated?: string;
};

export type ApplicationTelemetry = {
  requestRate: number | null;
  p50Latency: number | null;
  p95Latency: number | null;
  p99Latency: number | null;
  errorRate: number | null;
  rate4xx: number | null;
  rate5xx: number | null;
  activeRequests: number | null;
  totalRequests: number | null;
};

export type HostTelemetry = {
  cpuUsage: number | null;
  memoryUsage: number | null;
  memoryTotalBytes: number | null;
  memoryAvailableBytes: number | null;
  diskUsage: number | null;
  diskIoBytesSec: number | null;
  networkThroughputBytesSec: number | null;
};

export type ContainerTelemetry = {
  name: string;
  id?: string;
  cpuUsage: number | null;
  memoryUsageBytes: number | null;
  memoryWorkingSetBytes: number | null;
  networkRxBytesSec: number | null;
  networkTxBytesSec: number | null;
  status: "HEALTHY" | "DEGRADED" | "CRITICAL" | "RUNNING";
};

export type TelemetryOverview = {
  timestamp: string;
  prometheusConnected: boolean;
  application: ApplicationTelemetry;
  host: HostTelemetry;
  containers: ContainerTelemetry[];
};

export type MLPredictionData = {
  status?: "SUCCESS" | "INSUFFICIENT_TELEMETRY" | "ERROR";
  prediction: "VIOLATION" | "NO_VIOLATION";
  violationProbability: number;
  probability: number;
  confidence: number;
  model: string;
  modelVersion?: string;
  schemaVersion?: string;
  incidentId?: string;
  sloId?: string;
  requirementId?: string | null;
  service?: string;
  featureTimestamp?: string;
  features?: Record<string, number | null>;
  featureSources?: Record<string, any>;
  missingFeatures?: string[];
  factors: {
    cpuFactor: number;
    memoryFactor: number;
    errorFactor: number;
    latencyFactor: number;
    deploymentFactor: number;
    requestRateFactor?: number;
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

export type User = {
  userId: string;
  username: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  createdAt?: string;
};

export type AuthState = {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
};

export type DeploymentAuditEvent = {
  _id?: string;
  eventId: string;
  timestamp: string;
  sequenceNumber: number;
  deploymentId: string;
  repairId: string;
  projectId: string;
  service: string;
  candidateCommitSha: string;
  predecessorImage: string;
  candidateImage: string;
  strategy: string;
  stage: string;
  previousCandidateWeight: number;
  newCandidateWeight: number;
  action: string;
  promQl?: string;
  observedValue?: number | null;
  threshold?: number;
  operator?: string;
  verificationStatus?: string;
  actor: string;
  authorizationCheck: boolean;
  evidenceSnapshotHash: string;
  parentEventHash: string;
  eventHash: string;
};

export type CanaryStageStatus = {
  deploymentId: string;
  strategy: "CANARY" | "BLUE_GREEN";
  canaryStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ABORTED";
  currentStage: string;
  candidateWeight: number;
  predecessorWeight: number;
  bakeTimeElapsedSeconds?: number;
  bakeTimeRemainingSeconds?: number;
  bakeWindowDurationSeconds?: number;
  canAdvance: boolean;
  isCompleted: boolean;
  isAborted: boolean;
  stages: Array<{
    stage: string;
    candidateWeight: number;
    predecessorWeight: number;
    durationSeconds?: number;
    elapsedSeconds?: number;
    enteredAt: string;
    completedAt?: string;
    status: string;
  }>;
};

export type AdminOverview = {
  totalUsers: number;
  totalProjects: number;
  totalRequirements: number;
  totalSLOs: number;
  activeIncidents: number;
  openRepairs: number;
  activeDeployments: number;
  totalAuditEvents: number;
  recentUsers: User[];
  recentAuditEvents: DeploymentAuditEvent[];
  systemHealth: {
    backend: string;
    database: string;
    mlService: string;
    prometheus: string;
  };
};

import type {
  Project,
  Requirement,
  SLO,
  Incident,
  RCA,
  Experiment,
  DevOpsAction,
  TraceGraphNode,
  ServiceTelemetry,
  TelemetryOverview,
  MLPredictionData,
  CodeIssue,
  CodeRepair,
  Deployment,
  DeploymentVerification,
  RepairHistory,
  User,
  DeploymentAuditEvent,
  CanaryStageStatus,
  AdminOverview,
} from "../types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL && String(import.meta.env.VITE_API_BASE_URL).trim())
  ? String(import.meta.env.VITE_API_BASE_URL).trim().replace(/\/+$/, "")
  : (import.meta.env.DEV ? "http://localhost:5000/api" : "/api");

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("traceops_token");
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.message || `HTTP ${res.status}: ${res.statusText}`);
  }
  const json = await res.json();
  return (json.data !== undefined ? json.data : json) as T;
}

export const api = {
  // Health
  getHealth: () => fetchJson<{ success: boolean; message: string }>(`${API_BASE}/health`),

  // Projects & Onboarding
  getProjects: () => fetchJson<Project[]>(`${API_BASE}/projects`),
  createProject: (data: { name: string; description?: string }) =>
    fetchJson<Project>(`${API_BASE}/projects`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  uploadAndAnalyzeProject: async (file: File, name?: string, projectId?: string) => {
    const formData = new FormData();
    formData.append("projectZip", file);
    if (name) formData.append("name", name);

    const url = projectId && projectId !== "new"
      ? `${API_BASE}/projects/${projectId}/upload`
      : `${API_BASE}/projects/upload`;

    const res = await fetch(url, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || `HTTP ${res.status}: ${res.statusText}`);
    }
    const json = await res.json();
    return json.data;
  },
  onboardGithubProject: (repositoryUrl: string, branch?: string, name?: string) =>
    fetchJson<{ project: Project; analysis: unknown }>(`${API_BASE}/projects/github`, {
      method: "POST",
      body: JSON.stringify({ repositoryUrl, branch, name }),
    }),
  checkGithubUpdates: (projectId: string) =>
    fetchJson<{
      projectId: string;
      currentCommitSha?: string;
      latestCommitSha: string;
      branch: string;
      hasNewCommit: boolean;
      status: string;
    }>(`${API_BASE}/projects/${projectId}/github-updates`),
  getProjectById: (id: string) =>
    fetchJson<{
      project: Project;
      requirements: Requirement[];
      slos: SLO[];
      traceability: unknown[];
    }>(`${API_BASE}/projects/${id}`),
  deleteProject: (id: string) =>
    fetchJson<{ message: string }>(`${API_BASE}/projects/${id}`, {
      method: "DELETE",
    }),

  // Requirements
  getRequirements: () => fetchJson<Requirement[]>(`${API_BASE}/requirements`),
  createRequirement: (data: Partial<Requirement>) =>
    fetchJson<Requirement>(`${API_BASE}/requirements`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteRequirement: (id: string) =>
    fetchJson<{ message: string }>(`${API_BASE}/requirements/${id}`, {
      method: "DELETE",
    }),

  // SLOs
  getSLOs: () => fetchJson<SLO[]>(`${API_BASE}/slos`),
  createSLO: (data: Partial<SLO>) =>
    fetchJson<SLO>(`${API_BASE}/slos`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteSLO: (id: string) =>
    fetchJson<{ message: string }>(`${API_BASE}/slos/${id}`, {
      method: "DELETE",
    }),

  // Incidents
  getIncidents: () => fetchJson<Incident[]>(`${API_BASE}/incidents`),
  createIncident: (data: Partial<Incident>) =>
    fetchJson<Incident>(`${API_BASE}/incidents`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  resolveIncident: (id: string) =>
    fetchJson<Incident>(`${API_BASE}/incidents/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status: "RESOLVED" }),
    }),

  // RCA
  getRCAs: () => fetchJson<RCA[]>(`${API_BASE}/rca`),
  analyzeRuleRCA: (data: Record<string, unknown>) =>
    fetchJson<RCA>(`${API_BASE}/rca/analyze`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  analyzeGeminiRCA: (data: Record<string, unknown>) =>
    fetchJson<RCA>(`${API_BASE}/gemini-rca/analyze`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ML
  predictML: (data: Record<string, unknown>) =>
    fetchJson<MLPredictionData>(`${API_BASE}/ml/predict`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Experiments
  getExperiments: () => fetchJson<Experiment[]>(`${API_BASE}/experiments`),
  runExperiment: (data: Record<string, unknown>) =>
    fetchJson<Experiment>(`${API_BASE}/experiments/run`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // DevOps Actions
  getDevOpsActions: () => fetchJson<DevOpsAction[]>(`${API_BASE}/devops`),
  proposeDevOpsAction: (data: Record<string, unknown>) =>
    fetchJson<DevOpsAction>(`${API_BASE}/devops/propose`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  approveDevOpsAction: (id: string, approvedBy = "DevOps Lead") =>
    fetchJson<DevOpsAction>(`${API_BASE}/devops/approve/${id}`, {
      method: "POST",
      body: JSON.stringify({ approvedBy }),
    }),
  rejectDevOpsAction: (id: string, reason = "Operator rejected") =>
    fetchJson<DevOpsAction>(`${API_BASE}/devops/reject/${id}`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  executeDevOpsAction: (id: string, dryRun = false) =>
    fetchJson<{ action: DevOpsAction; executionResult: Record<string, unknown> }>(
      `${API_BASE}/devops/execute/${id}`,
      {
        method: "POST",
        body: JSON.stringify({ dryRun }),
      }
    ),

  // Traceability Graph
  getTraceGraph: (requirementId?: string) =>
    fetchJson<TraceGraphNode[]>(
      `${API_BASE}/traceability/graph${requirementId ? `?requirementId=${requirementId}` : ""}`
    ),

  // Autonomous Code Repair & Real Deployment
  analyzeProjectIssues: (projectId: string) =>
    fetchJson<CodeIssue[]>(`${API_BASE}/projects/${projectId}/analyze-issues`, {
      method: "POST",
    }),
  getProjectIssues: (projectId: string) =>
    fetchJson<CodeIssue[]>(`${API_BASE}/projects/${projectId}/issues`),
  getIssueById: (issueId: string) =>
    fetchJson<CodeIssue>(`${API_BASE}/issues/${issueId}`),
  createRepair: (issueId: string) =>
    fetchJson<CodeRepair>(`${API_BASE}/issues/${issueId}/repair`, {
      method: "POST",
    }),
  getRepairById: (repairId: string) =>
    fetchJson<CodeRepair>(`${API_BASE}/repairs/${repairId}`),
  getRepairDiff: (repairId: string) =>
    fetchJson<{ repairId: string; diff: string; changedFiles: string[]; explanation: string }>(
      `${API_BASE}/repairs/${repairId}/diff`
    ),
  validateRepair: (repairId: string) =>
    fetchJson<CodeRepair>(`${API_BASE}/repairs/${repairId}/validate`, {
      method: "POST",
    }),
  approveRepair: (repairId: string, approvedBy = "DevOps Lead") =>
    fetchJson<CodeRepair>(`${API_BASE}/repairs/${repairId}/approve`, {
      method: "POST",
      body: JSON.stringify({ approvedBy }),
    }),
  rejectRepair: (repairId: string, reason = "Rejected by operator") =>
    fetchJson<CodeRepair>(`${API_BASE}/repairs/${repairId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  deployRepair: (repairId: string) =>
    fetchJson<{ deployment: Deployment; verification: DeploymentVerification }>(
      `${API_BASE}/repairs/${repairId}/deploy`,
      {
        method: "POST",
      }
    ),
  getDeploymentById: (deploymentId: string) =>
    fetchJson<{ deployment: Deployment; verification: DeploymentVerification }>(
      `${API_BASE}/deployments/${deploymentId}`
    ),
  rollbackDeployment: (deploymentId: string, reason = "Operator triggered rollback") =>
    fetchJson<Deployment>(`${API_BASE}/deployments/${deploymentId}/rollback`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  getRepairHistory: (projectId: string) =>
    fetchJson<RepairHistory>(`${API_BASE}/projects/${projectId}/repair-history`),

  downloadRepairedProjectZip: async (repairId: string, projectId?: string): Promise<{ success: boolean; fileName: string }> => {
    const url = projectId
      ? `${API_BASE}/projects/${projectId}/repairs/${repairId}/download`
      : `${API_BASE}/repairs/${repairId}/download`;

    const res = await fetch(url);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || `Download failed with HTTP ${res.status}`);
    }

    const disposition = res.headers.get("Content-Disposition");
    let fileName = `repaired-project-${repairId}.zip`;
    if (disposition && disposition.includes("filename=")) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) fileName = match[1];
    }

    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);

    return { success: true, fileName };
  },

  downloadLatestRepairedProjectZip: async (projectId: string): Promise<{ success: boolean; fileName: string }> => {
    const url = `${API_BASE}/projects/${projectId}/download-repaired`;

    const res = await fetch(url);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || `Download failed with HTTP ${res.status}`);
    }

    const disposition = res.headers.get("Content-Disposition");
    let fileName = `repaired-project-${projectId}.zip`;
    if (disposition && disposition.includes("filename=")) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) fileName = match[1];
    }

    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);

    return { success: true, fileName };
  },

  getProjectRequirements: (projectId: string) =>
    fetchJson<Requirement[]>(`${API_BASE}/projects/${projectId}/requirements`),

  getProjectSLOs: (projectId: string) =>
    fetchJson<SLO[]>(`${API_BASE}/projects/${projectId}/slos`),

  // Real Runtime Telemetry & Prometheus Queries
  getTelemetryOverview: () => fetchJson<TelemetryOverview>(`${API_BASE}/telemetry/overview`),
  executeLoadTest: (requests = 25, delayMs = 15, simulateError = false) =>
    fetchJson<{ success: boolean; mode: string; message: string; samplesExecuted: number }>(
      `${API_BASE}/telemetry/load-test`,
      {
        method: "POST",
        body: JSON.stringify({ requests, delayMs, simulateError }),
      }
    ),
  getTelemetry: () => fetchJson<ServiceTelemetry[]>(`${API_BASE}/metrics`),
  triggerSpike: (service = "traceops-backend") =>
    fetchJson<{ success: boolean; mode: string; message: string }>(`${API_BASE}/metrics/spike`, {
      method: "POST",
      body: JSON.stringify({ service }),
    }),
  normalizeMetrics: (service = "traceops-backend") =>
    fetchJson<{ success: boolean; mode: string; message: string }>(`${API_BASE}/metrics/normalize`, {
      method: "POST",
      body: JSON.stringify({ service }),
    }),

  // Authentication & User Management
  login: (credentials: { identifier?: string; username?: string; email?: string; password: string }) =>
    fetchJson<{ success: boolean; user: User; token: string; message: string }>(`${API_BASE}/auth/login`, {
      method: "POST",
      body: JSON.stringify(credentials),
    }),
  signup: (data: { username: string; email: string; password: string; name: string }) =>
    fetchJson<{ success: boolean; user: User; token: string; message: string }>(`${API_BASE}/auth/signup`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getAuthStatus: () =>
    fetchJson<{ success: boolean; adminInitialized: boolean; totalUsers: number }>(`${API_BASE}/auth/status`),
  initAdmin: (data: { username: string; email: string; password: string; name?: string; initSecret?: string }) =>
    fetchJson<{ success: boolean; user: User; token: string; message: string }>(`${API_BASE}/auth/init-admin`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getCurrentUser: () => fetchJson<{ success: boolean; user: User }>(`${API_BASE}/auth/me`),
  logout: () => fetchJson<{ success: boolean; message: string }>(`${API_BASE}/auth/logout`, { method: "POST" }),
  getAllUsers: () => fetchJson<User[]>(`${API_BASE}/auth/users`),
  getAdminOverview: () => fetchJson<AdminOverview>(`${API_BASE}/auth/admin/overview`),

  // Deployments & Canary Progression
  getDeployments: () => fetchJson<Deployment[]>(`${API_BASE}/deployments`),
  startCanary: (deploymentId: string, params: Record<string, unknown> = {}) =>
    fetchJson<CanaryStageStatus>(`${API_BASE}/deployments/${deploymentId}/canary/start`, {
      method: "POST",
      body: JSON.stringify(params),
    }),
  advanceCanary: (deploymentId: string, params: Record<string, unknown> = {}) =>
    fetchJson<CanaryStageStatus>(`${API_BASE}/deployments/${deploymentId}/canary/advance`, {
      method: "POST",
      body: JSON.stringify(params),
    }),
  getCanaryStatus: (deploymentId: string) =>
    fetchJson<CanaryStageStatus>(`${API_BASE}/deployments/${deploymentId}/canary/status`),
  abortCanary: (deploymentId: string, reason?: string, actor?: string) =>
    fetchJson<CanaryStageStatus>(`${API_BASE}/deployments/${deploymentId}/canary/abort`, {
      method: "POST",
      body: JSON.stringify({ reason, actor }),
    }),
  evaluateCanary: (deploymentId: string, options: Record<string, unknown> = {}) =>
    fetchJson<{
      passed: boolean;
      verdict: "ALLOW" | "BLOCK";
      outcome: string;
      actualValue: number;
      target: number;
      operator: string;
      reason: string;
    }>(`${API_BASE}/deployments/${deploymentId}/canary/evaluate`, {
      method: "POST",
      body: JSON.stringify(options),
    }),

  // Cryptographic Deployment Audit Trail
  getAuditEvents: (deploymentId?: string) => {
    const url = deploymentId ? `${API_BASE}/audit/events?deploymentId=${deploymentId}` : `${API_BASE}/audit/events`;
    return fetchJson<DeploymentAuditEvent[]>(url);
  },
  verifyAuditChain: (deploymentId: string) =>
    fetchJson<{ valid: boolean; totalEvents: number; firstInvalidEventId: string | null; reason?: string }>(
      `${API_BASE}/audit/verify/${deploymentId}`
    ),
};
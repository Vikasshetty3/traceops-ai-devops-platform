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
  MLPredictionData,
  CodeIssue,
  CodeRepair,
  Deployment,
  DeploymentVerification,
  RepairHistory,
} from "../types";

const API_BASE = "http://localhost:5000/api";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
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

  // Telemetry & Metrics
  getTelemetry: () => fetchJson<ServiceTelemetry[]>(`${API_BASE}/metrics`),
  triggerSpike: (service = "Checkout") =>
    fetchJson<ServiceTelemetry>(`${API_BASE}/metrics/spike`, {
      method: "POST",
      body: JSON.stringify({ service }),
    }),
  normalizeMetrics: (service = "Checkout") =>
    fetchJson<ServiceTelemetry>(`${API_BASE}/metrics/normalize`, {
      method: "POST",
      body: JSON.stringify({ service }),
    }),
};
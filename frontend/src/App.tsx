import React, { useState, useEffect, useCallback } from "react";
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
  Deployment,
  User,
} from "./types";
import { api } from "./services/api";
import { OverviewTab } from "./components/Dashboard/OverviewTab";
import { ServicesTab } from "./components/Services/ServicesTab";
import { ProjectsTab } from "./components/Projects/ProjectsTab";
import { RequirementsTab } from "./components/Requirements/RequirementsTab";
import { SLOsTab } from "./components/SLOs/SLOsTab";
import { IncidentsTab } from "./components/Incidents/IncidentsTab";
import { RCATab } from "./components/RCA/RCATab";
import { RepairTab } from "./components/Repair/RepairTab";
import { CanaryTab } from "./components/Canary/CanaryTab";
import { AuditTrailTab } from "./components/Audit/AuditTrailTab";
import { RemediationTab } from "./components/Remediation/RemediationTab";
import { TraceabilityTab } from "./components/Traceability/TraceabilityTab";
import { ResearchTab } from "./components/Research/ResearchTab";
import { AdminTab } from "./components/Admin/AdminTab";
import { AuthModal } from "./components/Auth/AuthModal";
import { LoadingState, ErrorState } from "./components/common/FeedbackStates";
import {
  FolderGit2,
  Activity,
  Layers,
  Zap,
  ShieldAlert,
  Sparkles,
  FlaskConical,
  GitMerge,
  BarChart3,
  RefreshCw,
  Server,
  Wrench,
  Lock,
  Shield,
  LogIn,
  LogOut,
  UserCheck,
} from "lucide-react";
import "./App.css";

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Authentication State
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem("traceops_user");
      return stored
        ? JSON.parse(stored)
        : {
            userId: "USR-001",
            username: "user",
            name: "DevOps Engineer",
            email: "user@traceops.io",
            role: "USER",
          };
    } catch {
      return null;
    }
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  // Core Data States
  const [projects, setProjects] = useState<Project[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [slos, setSlos] = useState<SLO[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [rcas, setRcas] = useState<RCA[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [devopsActions, setDevopsActions] = useState<DevOpsAction[]>([]);
  const [telemetry, setTelemetry] = useState<ServiceTelemetry[]>([]);
  const [telemetryOverview, setTelemetryOverview] = useState<TelemetryOverview | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState<boolean>(true);
  const [traceGraph, setTraceGraph] = useState<TraceGraphNode[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [selectedReqId, setSelectedReqId] = useState<string>("REQ-001");
  const [repairProjectId, setRepairProjectId] = useState<string>("");

  // Fetch all primary datasets
  const loadAllData = useCallback(async () => {
    try {
      setError(null);
      const [projs, reqs, slosData, incs, rcaData, exps, actions, telem, toverview, graph, deps] =
        await Promise.all([
          api.getProjects(),
          api.getRequirements(),
          api.getSLOs(),
          api.getIncidents(),
          api.getRCAs(),
          api.getExperiments(),
          api.getDevOpsActions(),
          api.getTelemetry(),
          api.getTelemetryOverview().catch(() => null),
          api.getTraceGraph(),
          api.getDeployments().catch(() => []),
        ]);

      setProjects(projs || []);
      setRequirements(reqs || []);
      setSlos(slosData || []);
      setIncidents(incs || []);
      setRcas(rcaData || []);
      setExperiments(exps || []);
      setDevopsActions(actions || []);
      setTelemetry(telem || []);
      if (toverview) {
        setTelemetryOverview(toverview);
      }
      setTraceGraph(graph || []);
      setDeployments(deps || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to sync state with backend API.");
    } finally {
      setLoading(false);
      setTelemetryLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const initLoad = async () => {
      if (isMounted) {
        await loadAllData();
      }
    };
    initLoad();

    // 5-second polling interval for real Prometheus telemetry
    const interval = setInterval(async () => {
      try {
        const [telem, toverview, deps] = await Promise.all([
          api.getTelemetry().catch(() => null),
          api.getTelemetryOverview().catch(() => null),
          api.getDeployments().catch(() => null),
        ]);
        if (isMounted) {
          if (telem) setTelemetry(telem);
          if (toverview) setTelemetryOverview(toverview);
          if (deps) setDeployments(deps);
        }
      } catch {
        // silent polling catch
      }
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [loadAllData]);

  // Auth Handlers
  const handleAuthSuccess = (authenticatedUser: User, authToken: string) => {
    setUser(authenticatedUser);
    localStorage.setItem("traceops_user", JSON.stringify(authenticatedUser));
    localStorage.setItem("traceops_token", authToken);
  };

  const handleLogout = async () => {
    try {
      await api.logout().catch(() => {});
    } finally {
      setUser(null);
      localStorage.removeItem("traceops_user");
      localStorage.removeItem("traceops_token");
      if (activeTab === "admin") {
        setActiveTab("overview");
      }
    }
  };

  const handleSwitchToAdminDemo = async () => {
    try {
      const res = await api.login({ identifier: "admin", password: "admin123" });
      handleAuthSuccess(res.user, res.token);
    } catch {
      // Fallback local switch
      const adminUser: User = {
        userId: "USR-002",
        username: "admin",
        name: "Platform Administrator",
        email: "admin@traceops.io",
        role: "ADMIN",
      };
      setUser(adminUser);
      localStorage.setItem("traceops_user", JSON.stringify(adminUser));
    }
  };

  const handleSwitchToUserDemo = async () => {
    try {
      const res = await api.login({ identifier: "user", password: "user123" });
      handleAuthSuccess(res.user, res.token);
    } catch {
      // Fallback local switch
      const normalUser: User = {
        userId: "USR-001",
        username: "user",
        name: "DevOps Engineer",
        email: "user@traceops.io",
        role: "USER",
      };
      setUser(normalUser);
      localStorage.setItem("traceops_user", JSON.stringify(normalUser));
      if (activeTab === "admin") {
        setActiveTab("overview");
      }
    }
  };

  // Business Action Handlers
  const handleCreateRequirement = async (data: Partial<Requirement>) => {
    await api.createRequirement(data);
    await loadAllData();
  };

  const handleDeleteRequirement = async (id: string) => {
    await api.deleteRequirement(id);
    await loadAllData();
  };

  const handleCreateSLO = async (data: Partial<SLO>) => {
    await api.createSLO(data);
    await loadAllData();
  };

  const handleDeleteSLO = async (id: string) => {
    await api.deleteSLO(id);
    await loadAllData();
  };

  const handleResolveIncident = async (id: string) => {
    await api.resolveIncident(id);
    await loadAllData();
  };

  const handlePredictML = async (metrics: Record<string, unknown>) => {
    return api.predictML(metrics);
  };

  const handleTriggerGeminiRCA = async (incident: Incident) => {
    await api.analyzeGeminiRCA({
      incidentId: incident.incidentId,
      requirementId: incident.requirementId,
      service: incident.service,
      slo: `${incident.metric} < ${incident.threshold}s`,
      metric: incident.metric,
      actualValue: incident.actualValue,
      threshold: incident.threshold,
      cpuUsage: incident.metrics?.cpuUsage,
      memoryUsage: incident.metrics?.memoryUsage,
      errorRate: incident.metrics?.errorRate,
      deploymentChanged: Boolean(incident.metrics?.deploymentChanged),
      logs: incident.logs,
    });
    await loadAllData();
    setActiveTab("rca");
  };

  const handleTriggerRuleRCA = async (incident: Incident) => {
    await api.analyzeRuleRCA({
      incidentId: incident.incidentId,
      requirementId: incident.requirementId,
      service: incident.service,
      slo: `${incident.metric} < ${incident.threshold}s`,
      metric: incident.metric,
      actualValue: incident.actualValue,
      threshold: incident.threshold,
      cpuUsage: incident.metrics?.cpuUsage,
      memoryUsage: incident.metrics?.memoryUsage,
      errorRate: incident.metrics?.errorRate,
      deploymentChanged: Boolean(incident.metrics?.deploymentChanged),
      logs: incident.logs,
    });
    await loadAllData();
    setActiveTab("rca");
  };

  const handleRunExperiment = async (data: Record<string, unknown>) => {
    await api.runExperiment(data);
    await loadAllData();
  };

  const handleApproveAction = async (id: string) => {
    await api.approveDevOpsAction(id);
    await loadAllData();
  };

  const handleRejectAction = async (id: string) => {
    await api.rejectDevOpsAction(id);
    await loadAllData();
  };

  const handleExecuteAction = async (id: string, dryRun: boolean) => {
    await api.executeDevOpsAction(id, dryRun);
    await loadAllData();
  };

  const handleTriggerSpike = async () => {
    await api.triggerSpike("Checkout");
    await loadAllData();
  };

  const handleNormalize = async () => {
    await api.normalizeMetrics("Checkout");
    await loadAllData();
  };

  // Navigation Tabs Configuration
  const tabs = [
    { id: "overview", label: "Dashboard", icon: <Activity className="w-4 h-4" /> },
    { id: "services", label: "Services", icon: <Server className="w-4 h-4" /> },
    { id: "requirements", label: "Requirements", icon: <Layers className="w-4 h-4" /> },
    { id: "slos", label: "SLOs", icon: <Zap className="w-4 h-4" /> },
    { id: "incidents", label: "Incidents & ML", icon: <ShieldAlert className="w-4 h-4" /> },
    { id: "rca", label: "Gemini RCA", icon: <Sparkles className="w-4 h-4" /> },
    { id: "repair", label: "Autonomous Repair", icon: <Wrench className="w-4 h-4" /> },
    { id: "canary", label: "Canary Progression", icon: <GitMerge className="w-4 h-4" /> },
    { id: "audit", label: "Audit Trail", icon: <Lock className="w-4 h-4" /> },
    { id: "projects", label: "Projects & Onboarding", icon: <FolderGit2 className="w-4 h-4" /> },
    { id: "traceability", label: "Traceability Graph", icon: <GitMerge className="w-4 h-4" /> },
    { id: "remediation", label: "Remediation & Chaos", icon: <FlaskConical className="w-4 h-4" /> },
    { id: "research", label: "Research Benchmarks", icon: <BarChart3 className="w-4 h-4" /> },
    ...(user?.role === "ADMIN" ? [{ id: "admin", label: "Admin Console", icon: <Shield className="w-4 h-4" /> }] : []),
  ];

  return (
    <div className="app-container">
      {/* 1. Header Bar */}
      <header className="app-header">
        <div className="header-left">
          <div className="brand-logo">
            <Server className="w-6 h-6 text-sky-400" />
            <div>
              <span className="brand-title">TraceOps</span>
              <span className="brand-subtitle">Requirement-Traceable Autonomous DevOps</span>
            </div>
          </div>
          <span className="badge-env">PRODUCTION READY</span>
        </div>

        <div className="header-right">
          {/* Quick Demo Switcher Buttons */}
          <div className="demo-btn-group" style={{ marginRight: "4px" }}>
            <button
              onClick={handleSwitchToUserDemo}
              className={`btn-demo-badge user ${user?.role === "USER" ? "active-role" : ""}`}
              title="Switch session to Demo User (normal workspace)"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>User View</span>
            </button>
            <button
              onClick={handleSwitchToAdminDemo}
              className={`btn-demo-badge admin ${user?.role === "ADMIN" ? "active-role" : ""}`}
              title="Switch session to Demo Admin (global visibility)"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Admin View</span>
            </button>
          </div>

          {/* User Profile / Auth Status */}
          {user ? (
            <div className="user-profile-menu">
              <div className="user-avatar-small">{user.name.charAt(0).toUpperCase()}</div>
              <div className="user-details-inline">
                <span className="user-name-text">{user.name}</span>
                <span className={`user-role-badge ${user.role.toLowerCase()}`}>{user.role}</span>
              </div>
              <button onClick={handleLogout} className="btn-logout" title="Sign Out">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button onClick={() => setIsAuthModalOpen(true)} className="btn-auth-header">
              <LogIn className="w-4 h-4" />
              <span>Sign In</span>
            </button>
          )}

          <button
            onClick={loadAllData}
            className="btn-sync"
            title="Sync all metrics & data from backend"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Sync</span>
          </button>
        </div>
      </header>

      {/* 2. Navigation Tab Bar */}
      <nav className="app-nav">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`nav-item ${activeTab === tab.id ? "active" : ""}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* 3. Main Body Container */}
      <main className="app-main">
        {error && <ErrorState error={error} onRetry={loadAllData} />}

        {loading ? (
          <LoadingState message="Synchronizing TraceOps platform telemetry and state..." />
        ) : (
          <>
            {activeTab === "overview" && (
              <OverviewTab
                requirements={requirements}
                slos={slos}
                incidents={incidents}
                devopsActions={devopsActions}
                telemetry={telemetry}
                telemetryOverview={telemetryOverview}
                telemetryLoading={telemetryLoading}
                onExecuteLoadTest={async (requests, delayMs, simulateError) => {
                  await api.executeLoadTest(requests, delayMs, simulateError);
                  const overview = await api.getTelemetryOverview().catch(() => null);
                  if (overview) setTelemetryOverview(overview);
                }}
                onTriggerSpike={handleTriggerSpike}
                onNormalize={handleNormalize}
                onNavigateTab={(tab) => setActiveTab(tab)}
              />
            )}

            {activeTab === "services" && (
              <ServicesTab
                projects={projects}
                requirements={requirements}
                slos={slos}
                incidents={incidents}
                deployments={deployments}
              />
            )}

            {activeTab === "projects" && (
              <ProjectsTab
                projects={projects}
                requirements={requirements}
                slos={slos}
                onRefresh={loadAllData}
                onSelectProjectTraceability={(_projectId) => {
                  setSelectedReqId("");
                  setActiveTab("traceability");
                }}
                onNavigateToRepair={(projectId) => {
                  setRepairProjectId(projectId);
                  setActiveTab("repair");
                }}
              />
            )}

            {activeTab === "repair" && <RepairTab initialProjectId={repairProjectId} />}

            {activeTab === "canary" && (
              <CanaryTab deployments={deployments} onRefresh={loadAllData} />
            )}

            {activeTab === "audit" && <AuditTrailTab deployments={deployments} />}

            {activeTab === "requirements" && (
              <RequirementsTab
                requirements={requirements}
                onCreateRequirement={handleCreateRequirement}
                onDeleteRequirement={handleDeleteRequirement}
              />
            )}

            {activeTab === "slos" && (
              <SLOsTab
                slos={slos}
                requirements={requirements}
                onCreateSLO={handleCreateSLO}
                onDeleteSLO={handleDeleteSLO}
              />
            )}

            {activeTab === "incidents" && (
              <IncidentsTab
                incidents={incidents}
                onTriggerRCA={(inc) => {
                  handleTriggerGeminiRCA(inc);
                }}
                onResolveIncident={handleResolveIncident}
                onPredictML={handlePredictML}
              />
            )}

            {activeTab === "rca" && (
              <RCATab
                rcas={rcas}
                incidents={incidents}
                onTriggerGeminiRCA={handleTriggerGeminiRCA}
                onTriggerRuleRCA={handleTriggerRuleRCA}
                onStartExperiment={() => {
                  setActiveTab("remediation");
                }}
              />
            )}

            {activeTab === "remediation" && (
              <RemediationTab
                experiments={experiments}
                devopsActions={devopsActions}
                onRunExperiment={handleRunExperiment}
                onApproveAction={handleApproveAction}
                onRejectAction={handleRejectAction}
                onExecuteAction={handleExecuteAction}
              />
            )}

            {activeTab === "traceability" && (
              <TraceabilityTab
                graph={traceGraph}
                requirements={requirements}
                selectedReqId={selectedReqId}
                onSelectRequirement={(id) => setSelectedReqId(id)}
              />
            )}

            {activeTab === "research" && <ResearchTab />}

            {activeTab === "admin" && <AdminTab />}
          </>
        )}
      </main>

      {/* Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
};

export default App;
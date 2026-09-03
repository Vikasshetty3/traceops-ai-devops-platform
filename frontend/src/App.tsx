import React, { useState, useEffect, useCallback } from "react";
import type {
  Requirement,
  SLO,
  Incident,
  RCA,
  Experiment,
  DevOpsAction,
  TraceGraphNode,
  ServiceTelemetry,
} from "./types";
import { api } from "./services/api";
import { OverviewTab } from "./components/Dashboard/OverviewTab";
import { RequirementsTab } from "./components/Requirements/RequirementsTab";
import { SLOsTab } from "./components/SLOs/SLOsTab";
import { IncidentsTab } from "./components/Incidents/IncidentsTab";
import { RCATab } from "./components/RCA/RCATab";
import { RemediationTab } from "./components/Remediation/RemediationTab";
import { TraceabilityTab } from "./components/Traceability/TraceabilityTab";
import { ResearchTab } from "./components/Research/ResearchTab";
import { LoadingState, ErrorState } from "./components/common/FeedbackStates";
import {
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
} from "lucide-react";
import "./App.css";

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Core Data States
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [slos, setSlos] = useState<SLO[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [rcas, setRcas] = useState<RCA[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [devopsActions, setDevopsActions] = useState<DevOpsAction[]>([]);
  const [telemetry, setTelemetry] = useState<ServiceTelemetry[]>([]);
  const [traceGraph, setTraceGraph] = useState<TraceGraphNode[]>([]);
  const [selectedReqId, setSelectedReqId] = useState<string>("REQ-001");

  // Fetch all primary datasets
  const loadAllData = useCallback(async () => {
    try {
      setError(null);
      const [reqs, slosData, incs, rcaData, exps, actions, telem, graph] =
        await Promise.all([
          api.getRequirements().catch(() => []),
          api.getSLOs().catch(() => []),
          api.getIncidents().catch(() => []),
          api.getRCAs().catch(() => []),
          api.getExperiments().catch(() => []),
          api.getDevOpsActions().catch(() => []),
          api.getTelemetry().catch(() => []),
          api.getTraceGraph().catch(() => []),
        ]);

      setRequirements(reqs || []);
      setSlos(slosData || []);
      setIncidents(incs || []);
      setRcas(rcaData || []);
      setExperiments(exps || []);
      setDevopsActions(actions || []);
      setTelemetry(telem || []);
      setTraceGraph(graph || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to sync state with backend API.");
    } finally {
      setLoading(false);
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

    // 5-second polling interval for telemetry
    const interval = setInterval(async () => {
      try {
        const telem = await api.getTelemetry();
        if (telem && isMounted) setTelemetry(telem);
      } catch {
        // silent polling catch
      }
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [loadAllData]);

  // Handler Actions
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
      cpuUsage: incident.metrics?.cpuUsage || 88,
      memoryUsage: incident.metrics?.memoryUsage || 64,
      errorRate: incident.metrics?.errorRate || 2.0,
      deploymentChanged: incident.metrics?.deploymentChanged || false,
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
      cpuUsage: incident.metrics?.cpuUsage || 88,
      memoryUsage: incident.metrics?.memoryUsage || 64,
      errorRate: incident.metrics?.errorRate || 2.0,
      deploymentChanged: incident.metrics?.deploymentChanged || false,
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

  const tabs = [
    { id: "overview", label: "Overview", icon: <Activity className="w-4 h-4" /> },
    { id: "requirements", label: "Requirements", icon: <Layers className="w-4 h-4" /> },
    { id: "slos", label: "SLO Registry", icon: <Zap className="w-4 h-4" /> },
    { id: "incidents", label: "Incidents & ML", icon: <ShieldAlert className="w-4 h-4" /> },
    { id: "rca", label: "Gemini RCA", icon: <Sparkles className="w-4 h-4" /> },
    { id: "remediation", label: "Remediation & DevOps", icon: <FlaskConical className="w-4 h-4" /> },
    { id: "traceability", label: "Traceability Graph", icon: <GitMerge className="w-4 h-4" /> },
    { id: "research", label: "Research Benchmarks", icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <div className="app-container">
      {/* 1. Professional Header Bar */}
      <header className="app-header">
        <div className="header-left">
          <div className="brand-logo">
            <Server className="w-6 h-6 text-sky-400" />
            <div>
              <span className="brand-title">TraceOps</span>
              <span className="brand-subtitle">Requirement-Traceable DevOps Platform</span>
            </div>
          </div>
          <span className="badge-env">RESEARCH v1.0</span>
        </div>

        <div className="header-right">
          <button
            onClick={loadAllData}
            className="btn-sync"
            title="Sync all metrics & data from backend"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Sync Telemetry</span>
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
          <LoadingState message="Synchronizing TraceOps platform telemetry..." />
        ) : (
          <>
            {activeTab === "overview" && (
              <OverviewTab
                requirements={requirements}
                slos={slos}
                incidents={incidents}
                devopsActions={devopsActions}
                telemetry={telemetry}
                onTriggerSpike={handleTriggerSpike}
                onNormalize={handleNormalize}
                onNavigateTab={(tab) => setActiveTab(tab)}
              />
            )}

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
          </>
        )}
      </main>
    </div>
  );
};

export default App;
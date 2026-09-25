import React, { useState } from "react";
import type { Incident, MLPredictionData } from "../../types";
import { StatusBadge } from "../common/StatusBadge";
import { SectionHeader, EmptyState } from "../common/FeedbackStates";
import {
  ShieldAlert,
  BrainCircuit,
  Sparkles,
  CheckCircle,
  Terminal,
} from "lucide-react";

interface IncidentsTabProps {
  incidents: Incident[];
  onTriggerRCA: (incident: Incident) => void;
  onResolveIncident: (id: string) => Promise<void>;
  onPredictML: (metrics: Record<string, unknown>) => Promise<MLPredictionData>;
}

export const IncidentsTab: React.FC<IncidentsTabProps> = ({
  incidents,
  onTriggerRCA,
  onResolveIncident,
  onPredictML,
}) => {
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(
    incidents[0] || null
  );
  const [mlResult, setMlResult] = useState<MLPredictionData | null>(null);
  const [loadingML, setLoadingML] = useState(false);

  const hasMetrics =
    selectedIncident?.metrics?.cpuUsage != null &&
    selectedIncident?.metrics?.memoryUsage != null &&
    selectedIncident?.metrics?.errorRate != null &&
    (selectedIncident?.actualValue != null ||
      selectedIncident?.metrics?.latency != null);

  const handleRunML = async (inc: Incident) => {
    if (
      inc.metrics?.cpuUsage == null ||
      inc.metrics?.memoryUsage == null ||
      inc.metrics?.errorRate == null ||
      (inc.actualValue == null && inc.metrics?.latency == null)
    ) {
      return;
    }
    setLoadingML(true);
    try {
      const res = await onPredictML({
        cpuUsage: inc.metrics.cpuUsage,
        memoryUsage: inc.metrics.memoryUsage,
        errorRate: inc.metrics.errorRate,
        latency: inc.actualValue ?? inc.metrics.latency,
        deploymentChanged: inc.metrics.deploymentChanged ? 1 : 0,
      });
      setMlResult(res);
    } catch (e) {
      console.error("ML prediction error:", e);
    } finally {
      setLoadingML(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <SectionHeader
        title="Active Incident Triage & ML Violation Forecast"
        subtitle="SLO threshold breaches linked to underlying telemetry dimensions and real-time logs"
      />

      {incidents.length === 0 ? (
        <EmptyState
          title="No incidents recorded"
          description="All telemetry feeds are within established SLO targets."
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "20px" }}>
          {/* Incidents Queue */}
          <div
            style={{
              borderRadius: "8px",
              background: "rgba(15, 23, 42, 0.65)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(148, 163, 184, 0.2)", fontWeight: 700, color: "#f8fafc" }}>
              Incident Queue ({incidents.length})
            </div>
            <div>
              {incidents.map((inc) => {
                const isSelected = selectedIncident?.incidentId === inc.incidentId;
                return (
                  <div
                    key={inc.incidentId}
                    onClick={() => {
                      setSelectedIncident(inc);
                      setMlResult(null);
                    }}
                    style={{
                      padding: "16px",
                      cursor: "pointer",
                      backgroundColor: isSelected ? "rgba(56, 189, 248, 0.1)" : "transparent",
                      borderLeft: isSelected ? "3px solid #38bdf8" : "3px solid transparent",
                      borderBottom: "1px solid rgba(148, 163, 184, 0.1)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <ShieldAlert className="w-4 h-4 text-rose-500" />
                        <span style={{ fontWeight: 700, color: "#f8fafc", fontSize: "15px" }}>{inc.incidentId}</span>
                        <span style={{ fontSize: "12px", color: "#94a3b8" }}>({inc.service})</span>
                      </div>
                      <StatusBadge status={inc.status} size="sm" />
                    </div>

                    <div style={{ fontSize: "13px", color: "#cbd5e1", marginBottom: "8px" }}>
                      {inc.message || `SLO breach on ${inc.metric}: observed ${inc.actualValue}s vs target ${inc.threshold}s`}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", color: "#64748b" }}>
                      <span>Requirement: {inc.requirementId}</span>
                      <StatusBadge status={inc.severity} size="sm" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Incident Detail & Action Panel */}
          {selectedIncident && (
            <div
              style={{
                borderRadius: "8px",
                background: "rgba(15, 23, 42, 0.65)",
                border: "1px solid rgba(148, 163, 184, 0.2)",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "18px", color: "#f8fafc" }}>
                    {selectedIncident.incidentId} Details
                  </h3>
                  <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "2px" }}>
                    Bound to Requirement <span style={{ color: "#38bdf8" }}>{selectedIncident.requirementId}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => onTriggerRCA(selectedIncident)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "7px 14px",
                      fontSize: "13px",
                      fontWeight: 600,
                      backgroundColor: "#8b5cf6",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                    }}
                  >
                    <Sparkles className="w-4 h-4" />
                    Diagnose with Gemini
                  </button>
                  {selectedIncident.status !== "RESOLVED" && (
                    <button
                      onClick={() => onResolveIncident(selectedIncident.incidentId)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "7px 14px",
                        fontSize: "13px",
                        fontWeight: 600,
                        backgroundColor: "#10b981",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                    >
                      <CheckCircle className="w-4 h-4" />
                      Resolve
                    </button>
                  )}
                </div>
              </div>

              {/* Telemetry Snapshot Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", fontSize: "13px" }}>
                <div style={{ padding: "10px", borderRadius: "6px", background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(148, 163, 184, 0.15)" }}>
                  <div style={{ color: "#94a3b8" }}>p95 Latency</div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#ef4444" }}>
                    {selectedIncident.actualValue != null ? `${selectedIncident.actualValue}s` : "No measurement available"}
                  </div>
                </div>
                <div style={{ padding: "10px", borderRadius: "6px", background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(148, 163, 184, 0.15)" }}>
                  <div style={{ color: "#94a3b8" }}>CPU Load</div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#f8fafc" }}>
                    {selectedIncident.metrics?.cpuUsage != null ? `${selectedIncident.metrics.cpuUsage}%` : "No measurement available"}
                  </div>
                </div>
                <div style={{ padding: "10px", borderRadius: "6px", background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(148, 163, 184, 0.15)" }}>
                  <div style={{ color: "#94a3b8" }}>Memory</div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#f8fafc" }}>
                    {selectedIncident.metrics?.memoryUsage != null ? `${selectedIncident.metrics.memoryUsage}%` : "No measurement available"}
                  </div>
                </div>
              </div>

              {/* Logs Stream */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#94a3b8", marginBottom: "6px" }}>
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Captured Incident System Logs</span>
                </div>
                <div
                  style={{
                    backgroundColor: "#020617",
                    borderRadius: "6px",
                    padding: "12px",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    color: "#38bdf8",
                    maxHeight: "130px",
                    overflowY: "auto",
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                  }}
                >
                  {selectedIncident.logs && selectedIncident.logs.length > 0 ? (
                    selectedIncident.logs.map((log, idx) => <div key={idx}>{log}</div>)
                  ) : (
                    <div style={{ color: "#64748b" }}>No logs recorded for this incident</div>
                  )}
                </div>
              </div>

              {/* ML Forecast Sub-card */}
              <div
                style={{
                  borderRadius: "6px",
                  padding: "14px",
                  background: "rgba(59, 130, 246, 0.08)",
                  border: "1px solid rgba(59, 130, 246, 0.25)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <BrainCircuit className="w-4 h-4 text-sky-400" />
                    <span style={{ fontWeight: 600, fontSize: "14px", color: "#f8fafc" }}>ML Predictive Risk Analysis</span>
                  </div>
                  <button
                    onClick={() => handleRunML(selectedIncident)}
                    disabled={loadingML || !hasMetrics}
                    style={{
                      padding: "4px 10px",
                      fontSize: "12px",
                      fontWeight: 600,
                      backgroundColor: hasMetrics ? "#3b82f6" : "#475569",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "4px",
                      cursor: hasMetrics ? "pointer" : "not-allowed",
                      opacity: hasMetrics ? 1 : 0.6,
                    }}
                    title={!hasMetrics ? "No measurement available" : undefined}
                  >
                    {loadingML ? "Predicting..." : "Run ML Forecast"}
                  </button>
                </div>

                {mlResult ? (
                  <div style={{ fontSize: "13px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ color: "#94a3b8" }}>Predicted Breach Probability:</span>
                      <span style={{ fontWeight: 700, color: mlResult.prediction === "VIOLATION" ? "#ef4444" : "#10b981" }}>
                        {(mlResult.violationProbability * 100).toFixed(1)}% ({mlResult.prediction})
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ color: "#94a3b8" }}>Model Architecture:</span>
                      <span style={{ color: "#f8fafc", fontFamily: "monospace" }}>Logistic Regression (L2)</span>
                    </div>
                    {mlResult.topRiskFactors && (
                      <div style={{ color: "#94a3b8", marginTop: "6px" }}>
                        Top Risk Drivers: <span style={{ color: "#f8fafc" }}>{mlResult.topRiskFactors.join(", ")}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: "13px", color: "#94a3b8" }}>
                    {hasMetrics
                      ? "Run the research ML classifier to compute violation probability and feature risk decomposition."
                      : "Telemetry measurements not available for ML forecast on this incident."}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

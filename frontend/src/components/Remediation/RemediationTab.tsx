import React, { useState } from "react";
import type { Experiment, DevOpsAction, RCA } from "../../types";
import { StatusBadge } from "../common/StatusBadge";
import { SectionHeader, EmptyState } from "../common/FeedbackStates";
import {
  FlaskConical,
  Play,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface RemediationTabProps {
  experiments: Experiment[];
  devopsActions: DevOpsAction[];
  rcas?: RCA[];
  onRunExperiment: (data: Record<string, unknown>) => Promise<void>;
  onProposeAction?: (data: Record<string, unknown>) => Promise<void>;
  onApproveAction: (id: string) => Promise<void>;
  onRejectAction: (id: string) => Promise<void>;
  onExecuteAction: (id: string, dryRun: boolean) => Promise<void>;
}

export const RemediationTab: React.FC<RemediationTabProps> = ({
  experiments,
  devopsActions,
  onRunExperiment,
  onApproveAction,
  onRejectAction,
  onExecuteAction,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<"experiments" | "devops">("devops");
  const [dryRunStates, setDryRunStates] = useState<Record<string, boolean>>({});
  const [executingId, setExecutingId] = useState<string | null>(null);

  // Experiment Form
  const [simForm, setSimForm] = useState({
    requirementId: "REQ-001",
    service: "Checkout",
    remediationAction: "Increase DB Connection Pool",
    parameterName: "DB Connection Pool",
    currentValue: 20,
    proposedValue: 40,
    currentLatency: 2.85,
    currentErrorRate: 2.0,
    currentCpu: 92,
    currentMemory: 64,
    sloThreshold: 2.0,
  });

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    await onRunExperiment(simForm as unknown as Record<string, unknown>);
  };

  const handleExecute = async (actionId: string) => {
    setExecutingId(actionId);
    try {
      const isDryRun = !!dryRunStates[actionId];
      await onExecuteAction(actionId, isDryRun);
    } finally {
      setExecutingId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <SectionHeader
        title="Remediation Engine, Safety Gate & DevOps Execution"
        subtitle="Sandboxed mathematical simulation and safe, verified infrastructure deployment"
        action={
          <div style={{ display: "flex", backgroundColor: "rgba(15, 23, 42, 0.8)", padding: "4px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.2)" }}>
            <button
              onClick={() => setActiveSubTab("devops")}
              style={{
                padding: "6px 14px",
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "6px",
                border: "none",
                backgroundColor: activeSubTab === "devops" ? "#3b82f6" : "transparent",
                color: activeSubTab === "devops" ? "#ffffff" : "#94a3b8",
                cursor: "pointer",
              }}
            >
              DevOps Actions & Safety Gate ({devopsActions.length})
            </button>
            <button
              onClick={() => setActiveSubTab("experiments")}
              style={{
                padding: "6px 14px",
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "6px",
                border: "none",
                backgroundColor: activeSubTab === "experiments" ? "#3b82f6" : "transparent",
                color: activeSubTab === "experiments" ? "#ffffff" : "#94a3b8",
                cursor: "pointer",
              }}
            >
              Experiment Sandbox ({experiments.length})
            </button>
          </div>
        }
      />

      {activeSubTab === "devops" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {devopsActions.length === 0 ? (
            <EmptyState
              title="No DevOps Actions Proposed"
              description="DevOps actions are proposed when root cause analyses and experiment simulations complete."
            />
          ) : (
            devopsActions.map((action) => {
              const isDryRun = !!dryRunStates[action.actionId];
              return (
                <div
                  key={action.actionId}
                  style={{
                    borderRadius: "8px",
                    background: "rgba(15, 23, 42, 0.65)",
                    border: `1px solid ${
                      action.status === "EXECUTED"
                        ? "rgba(16, 185, 129, 0.3)"
                        : action.status === "APPROVED"
                        ? "rgba(59, 130, 246, 0.3)"
                        : "rgba(148, 163, 184, 0.2)"
                    }`,
                    padding: "20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span style={{ fontWeight: 700, fontSize: "16px", color: "#f8fafc" }}>
                          {action.actionId}
                        </span>
                        <span
                          style={{
                            fontSize: "12px",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            backgroundColor: "rgba(56, 189, 248, 0.1)",
                            color: "#38bdf8",
                            fontFamily: "monospace",
                            fontWeight: 600,
                          }}
                        >
                          {action.actionType}
                        </span>
                        <StatusBadge status={action.status} size="sm" />
                      </div>
                      <div style={{ fontSize: "13px", color: "#94a3b8" }}>
                        Target Service: <span style={{ color: "#f8fafc", fontWeight: 600 }}>{action.service}</span> &bull; Requirement: <span style={{ color: "#38bdf8" }}>{action.requirementId || "REQ-001"}</span>
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      {action.status === "PROPOSED" && (
                        <>
                          <button
                            onClick={() => onApproveAction(action.actionId)}
                            style={{
                              padding: "6px 12px",
                              fontSize: "13px",
                              fontWeight: 600,
                              backgroundColor: "#10b981",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: "6px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Approve Action
                          </button>
                          <button
                            onClick={() => onRejectAction(action.actionId)}
                            style={{
                              padding: "6px 12px",
                              fontSize: "13px",
                              fontWeight: 600,
                              backgroundColor: "rgba(239, 68, 68, 0.2)",
                              color: "#ef4444",
                              border: "1px solid rgba(239, 68, 68, 0.4)",
                              borderRadius: "6px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <XCircle className="w-4 h-4" />
                            Reject
                          </button>
                        </>
                      )}

                      {(action.status === "APPROVED" || action.status === "PROPOSED") && (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <label style={{ fontSize: "12px", color: "#94a3b8", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={isDryRun}
                              onChange={(e) =>
                                setDryRunStates({
                                  ...dryRunStates,
                                  [action.actionId]: e.target.checked,
                                })
                              }
                            />
                            Dry-Run Mode
                          </label>

                          <button
                            onClick={() => handleExecute(action.actionId)}
                            disabled={executingId === action.actionId}
                            style={{
                              padding: "6px 14px",
                              fontSize: "13px",
                              fontWeight: 600,
                              backgroundColor: isDryRun ? "#6366f1" : action.status === "APPROVED" ? "#3b82f6" : "#64748b",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: "6px",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <Play className="w-4 h-4" />
                            {executingId === action.actionId
                              ? "Executing..."
                              : isDryRun
                              ? "Preview Dry-Run"
                              : "Execute Action"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: "14px", color: "#f1f5f9" }}>
                    {action.description}
                  </div>

                  {/* Execution Logs */}
                  {action.executionLogs && action.executionLogs.length > 0 && (
                    <div
                      style={{
                        backgroundColor: "#020617",
                        borderRadius: "6px",
                        padding: "12px",
                        fontFamily: "monospace",
                        fontSize: "12px",
                        color: "#a5f3fc",
                        border: "1px solid rgba(148, 163, 184, 0.2)",
                        maxHeight: "120px",
                        overflowY: "auto",
                      }}
                    >
                      {action.executionLogs.map((log, idx) => (
                        <div key={idx}>{log}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Experiment Engine Sandbox */
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "20px" }}>
          {/* Simulator Form */}
          <div
            style={{
              borderRadius: "8px",
              background: "rgba(15, 23, 42, 0.65)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              padding: "20px",
            }}
          >
            <h3 style={{ margin: "0 0 14px 0", fontSize: "16px", color: "#f8fafc" }}>
              Simulate Remediation in Sandboxed Queue Model
            </h3>

            <form onSubmit={handleSimulate} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>Action</label>
                <select
                  value={simForm.remediationAction}
                  onChange={(e) => setSimForm({ ...simForm, remediationAction: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(148, 163, 184, 0.2)", borderRadius: "6px", color: "#f8fafc" }}
                >
                  <option value="Increase DB Connection Pool">Increase DB Connection Pool</option>
                  <option value="Scale Pod Replicas">Scale Pod Replicas</option>
                  <option value="Tune Cache Timeout">Tune Cache Timeout</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>Current Val</label>
                  <input
                    type="number"
                    value={simForm.currentValue}
                    onChange={(e) => setSimForm({ ...simForm, currentValue: parseFloat(e.target.value) })}
                    style={{ width: "100%", padding: "8px 12px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(148, 163, 184, 0.2)", borderRadius: "6px", color: "#f8fafc" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>Proposed Val</label>
                  <input
                    type="number"
                    value={simForm.proposedValue}
                    onChange={(e) => setSimForm({ ...simForm, proposedValue: parseFloat(e.target.value) })}
                    style={{ width: "100%", padding: "8px 12px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(148, 163, 184, 0.2)", borderRadius: "6px", color: "#f8fafc" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>Observed Latency (s)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={simForm.currentLatency}
                    onChange={(e) => setSimForm({ ...simForm, currentLatency: parseFloat(e.target.value) })}
                    style={{ width: "100%", padding: "8px 12px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(148, 163, 184, 0.2)", borderRadius: "6px", color: "#f8fafc" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>SLO Target (s)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={simForm.sloThreshold}
                    onChange={(e) => setSimForm({ ...simForm, sloThreshold: parseFloat(e.target.value) })}
                    style={{ width: "100%", padding: "8px 12px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(148, 163, 184, 0.2)", borderRadius: "6px", color: "#f8fafc" }}
                  />
                </div>
              </div>

              <button
                type="submit"
                style={{
                  marginTop: "8px",
                  padding: "9px 16px",
                  backgroundColor: "#3b82f6",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "13px",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <FlaskConical className="w-4 h-4" />
                Run Simulation
              </button>
            </form>
          </div>

          {/* Experiment Log History */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {experiments.map((exp) => (
              <div
                key={exp.experimentId}
                style={{
                  borderRadius: "8px",
                  background: "rgba(15, 23, 42, 0.65)",
                  border: `1px solid ${exp.result === "PASS" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                  padding: "16px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <div style={{ fontWeight: 600, color: "#f8fafc" }}>{exp.experimentId} - {exp.remediationAction}</div>
                  <StatusBadge status={exp.result} size="sm" />
                </div>
                <div style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "8px" }}>
                  {exp.hypothesis}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", fontSize: "12px" }}>
                  <div>Before: <span style={{ color: "#ef4444", fontWeight: 700 }}>{exp.metricsBefore?.latency}s</span></div>
                  <div>After: <span style={{ color: "#10b981", fontWeight: 700 }}>{exp.metricsAfter?.latency}s</span></div>
                  <div>Gain: <span style={{ color: "#38bdf8", fontWeight: 700 }}>+{exp.improvementPct}%</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

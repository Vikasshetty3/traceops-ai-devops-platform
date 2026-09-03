import React, { useState, useEffect } from "react";
import { api } from "../../services/api";
import type {
  Project,
  CodeIssue,
  CodeRepair,
  Deployment,
  DeploymentVerification,
} from "../../types";

export const RepairTab: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [issues, setIssues] = useState<CodeIssue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<CodeIssue | null>(null);
  const [currentRepair, setCurrentRepair] = useState<CodeRepair | null>(null);
  const [currentDeployment, setCurrentDeployment] = useState<Deployment | null>(null);
  const [currentVerification, setCurrentVerification] = useState<DeploymentVerification | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Fetch all projects on mount
  useEffect(() => {
    fetchProjects();
  }, []);

  // 2. Fetch issues when project selected
  useEffect(() => {
    if (selectedProjectId) {
      fetchProjectIssues(selectedProjectId);
    }
  }, [selectedProjectId]);

  const fetchProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(data);
      if (data.length > 0 && !selectedProjectId) {
        setSelectedProjectId(data[0].projectId);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to load projects");
    }
  };

  const fetchProjectIssues = async (projectId: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await api.getProjectIssues(projectId);
      setIssues(data);
      if (data.length > 0) {
        setSelectedIssue(data[0]);
      } else {
        setSelectedIssue(null);
        setCurrentRepair(null);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to load project issues");
    } finally {
      setLoading(false);
    }
  };

  const handleScanIssues = async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    setActionMessage("Scanning project source and configuration files for issues...");
    setErrorMessage(null);
    try {
      const scannedIssues = await api.analyzeProjectIssues(selectedProjectId);
      setIssues(scannedIssues);
      if (scannedIssues.length > 0) {
        setSelectedIssue(scannedIssues[0]);
        setActionMessage(`Scan complete. Detected ${scannedIssues.length} issue(s).`);
      } else {
        setActionMessage("Scan complete. No open issues detected.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to scan project issues");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateRepair = async (issueId: string) => {
    setLoading(true);
    setActionMessage("Synthesizing context-aware code fix in isolated sandbox workspace...");
    setErrorMessage(null);
    try {
      const repair = await api.createRepair(issueId);
      setCurrentRepair(repair);
      setActionMessage("Autonomous fix generated! Running sandbox validation...");
      // Automatically trigger sandbox validation
      const validated = await api.validateRepair(repair.repairId);
      setCurrentRepair(validated);
      setActionMessage(
        validated.validationStatus === "VALIDATED"
          ? "Fix generated and validated successfully! Ready for human approval."
          : "Fix generated, but validation checks failed."
      );
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to generate code repair");
    } finally {
      setLoading(false);
    }
  };

  const handleApproveRepair = async (repairId: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const approved = await api.approveRepair(repairId, "DevOps Engineer");
      setCurrentRepair(approved);
      setActionMessage("Repair approved! Ready to deploy live Docker container.");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to approve repair");
    } finally {
      setLoading(false);
    }
  };

  const handleRejectRepair = async (repairId: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const rejected = await api.rejectRepair(repairId, "Rejected by user");
      setCurrentRepair(rejected);
      setActionMessage("Repair rejected.");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to reject repair");
    } finally {
      setLoading(false);
    }
  };

  const handleDeployRepair = async (repairId: string) => {
    setLoading(true);
    setActionMessage("Building Docker image, launching live container, and probing health checks...");
    setErrorMessage(null);
    try {
      const { deployment, verification } = await api.deployRepair(repairId);
      setCurrentDeployment(deployment);
      setCurrentVerification(verification);
      setActionMessage(
        `✓ Container deployed live on port ${deployment.hostPort}! SLO verification passed.`
      );
    } catch (err: any) {
      setErrorMessage(err.message || "Deployment failed and rollback was executed.");
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async (deploymentId: string) => {
    setLoading(true);
    setActionMessage("Executing rollback: removing container and restoring stable state...");
    setErrorMessage(null);
    try {
      const rolledBack = await api.rollbackDeployment(deploymentId, "Operator manual rollback");
      setCurrentDeployment(rolledBack);
      setActionMessage("Rollback completed successfully. System returned to stable baseline.");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to execute rollback");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "24px", maxWidth: "1400px", margin: "0 auto", color: "#e2e8f0" }}>
      {/* Header Banner */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
          paddingBottom: "16px",
          borderBottom: "1px solid #334155",
        }}
      >
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: "700", margin: 0, color: "#f8fafc" }}>
            Autonomous Code Repair & Live Docker Deployment
          </h1>
          <p style={{ margin: "6px 0 0 0", color: "#94a3b8", fontSize: "14px" }}>
            Statically detect real project defects, synthesize minimal patches in sandboxes, validate builds, and deploy live containers with automated SLO verification.
          </p>
        </div>

        {/* Project Selector & Actions */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            style={{
              padding: "10px 14px",
              background: "#1e293b",
              color: "#f8fafc",
              border: "1px solid #475569",
              borderRadius: "8px",
              fontSize: "14px",
              outline: "none",
            }}
          >
            {projects.map((p) => (
              <option key={p.projectId} value={p.projectId}>
                {p.name} ({p.projectId})
              </option>
            ))}
          </select>

          <button
            onClick={handleScanIssues}
            disabled={loading || !selectedProjectId}
            style={{
              padding: "10px 18px",
              background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
            }}
          >
            🔍 Scan for Issues
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionMessage && (
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(34, 197, 94, 0.15)",
            border: "1px solid #22c55e",
            borderRadius: "8px",
            color: "#4ade80",
            marginBottom: "20px",
            fontSize: "14px",
          }}
        >
          {actionMessage}
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid #ef4444",
            borderRadius: "8px",
            color: "#f87171",
            marginBottom: "20px",
            fontSize: "14px",
          }}
        >
          ⚠️ {errorMessage}
        </div>
      )}

      {/* Main Grid: Left Column Issues, Right Column Repair & Deployment Studio */}
      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: "24px" }}>
        {/* Left Column: Detected Issues */}
        <div style={{ background: "#1e293b", borderRadius: "12px", padding: "20px", border: "1px solid #334155" }}>
          <h2 style={{ fontSize: "18px", fontWeight: "600", margin: "0 0 16px 0", color: "#f8fafc" }}>
            Detected Issues ({issues.length})
          </h2>

          {issues.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 12px", color: "#64748b" }}>
              <p style={{ fontSize: "14px" }}>No issues currently detected.</p>
              <button
                onClick={handleScanIssues}
                style={{
                  marginTop: "8px",
                  padding: "8px 16px",
                  background: "#334155",
                  color: "#e2e8f0",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                Run Issue Scanner
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {issues.map((issue) => {
                const isSelected = selectedIssue?.issueId === issue.issueId;
                const sevColor =
                  issue.severity === "CRITICAL"
                    ? "#ef4444"
                    : issue.severity === "HIGH"
                    ? "#f97316"
                    : issue.severity === "MEDIUM"
                    ? "#eab308"
                    : "#3b82f6";

                return (
                  <div
                    key={issue.issueId}
                    onClick={() => {
                      setSelectedIssue(issue);
                      setCurrentRepair(null);
                      setCurrentDeployment(null);
                      setCurrentVerification(null);
                    }}
                    style={{
                      padding: "14px",
                      borderRadius: "8px",
                      background: isSelected ? "rgba(59, 130, 246, 0.15)" : "#0f172a",
                      border: isSelected ? "1px solid #3b82f6" : "1px solid #334155",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: "700",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background: `${sevColor}22`,
                          color: sevColor,
                          border: `1px solid ${sevColor}44`,
                        }}
                      >
                        {issue.severity}
                      </span>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>{issue.issueId}</span>
                    </div>

                    <h4 style={{ margin: "4px 0", fontSize: "14px", color: "#f1f5f9", fontWeight: "600" }}>
                      {issue.category.replace(/_/g, " ")}
                    </h4>

                    <p style={{ margin: "4px 0", fontSize: "12px", color: "#94a3b8", lineHeight: "1.4" }}>
                      {issue.description}
                    </p>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", fontSize: "11px", color: "#64748b" }}>
                      <span>📄 {issue.file}:{issue.line}</span>
                      <span style={{ color: issue.status === "OPEN" ? "#f59e0b" : "#22c55e" }}>
                        ● {issue.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Code Repair, Diff, Validation, and Deployment Console */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {selectedIssue ? (
            <>
              {/* Selected Issue Detail Card */}
              <div style={{ background: "#1e293b", borderRadius: "12px", padding: "20px", border: "1px solid #334155" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                  <div>
                    <span style={{ fontSize: "12px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Target Defect Breakdown
                    </span>
                    <h3 style={{ margin: "4px 0", fontSize: "18px", color: "#f8fafc" }}>
                      {selectedIssue.category.replace(/_/g, " ")} in <code style={{ color: "#38bdf8" }}>{selectedIssue.file}:{selectedIssue.line}</code>
                    </h3>
                  </div>

                  <button
                    onClick={() => handleGenerateRepair(selectedIssue.issueId)}
                    disabled={loading}
                    style={{
                      padding: "10px 20px",
                      background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "8px",
                      fontWeight: "600",
                      cursor: loading ? "not-allowed" : "pointer",
                      boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
                    }}
                  >
                    ⚡ Generate Autonomous Fix
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", background: "#0f172a", padding: "16px", borderRadius: "8px" }}>
                  <div>
                    <strong style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>
                      ROOT CAUSE
                    </strong>
                    <p style={{ margin: 0, fontSize: "13px", color: "#e2e8f0" }}>{selectedIssue.rootCause}</p>
                  </div>
                  <div>
                    <strong style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>
                      SLO IMPACT
                    </strong>
                    <p style={{ margin: 0, fontSize: "13px", color: "#fb7185" }}>{selectedIssue.sloImpact || "Direct operational latency risk"}</p>
                  </div>
                </div>

                <div style={{ marginTop: "12px" }}>
                  <strong style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>
                    EVIDENCE FROM SOURCE
                  </strong>
                  <pre style={{ margin: 0, padding: "10px", background: "#090d16", borderRadius: "6px", fontSize: "12px", color: "#fca5a5", overflowX: "auto" }}>
                    {selectedIssue.evidence}
                  </pre>
                </div>
              </div>

              {/* Code Repair Diff & Validation Card */}
              {currentRepair && (
                <div style={{ background: "#1e293b", borderRadius: "12px", padding: "20px", border: "1px solid #334155" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "18px", color: "#f8fafc" }}>
                        Synthesized Patch & Unified Diff
                      </h3>
                      <p style={{ margin: "4px 0 0 0", color: "#94a3b8", fontSize: "13px" }}>
                        {currentRepair.explanation}
                      </p>
                    </div>

                    <div style={{ display: "flex", gap: "8px" }}>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: "700",
                          padding: "4px 10px",
                          borderRadius: "6px",
                          background: currentRepair.validationStatus === "VALIDATED" ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)",
                          color: currentRepair.validationStatus === "VALIDATED" ? "#4ade80" : "#f87171",
                          border: `1px solid ${currentRepair.validationStatus === "VALIDATED" ? "#22c55e" : "#ef4444"}`,
                        }}
                      >
                        VALIDATION: {currentRepair.validationStatus}
                      </span>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: "700",
                          padding: "4px 10px",
                          borderRadius: "6px",
                          background: currentRepair.approvalStatus === "APPROVED" ? "rgba(59, 130, 246, 0.2)" : "rgba(245, 158, 11, 0.2)",
                          color: currentRepair.approvalStatus === "APPROVED" ? "#60a5fa" : "#fbbf24",
                          border: `1px solid ${currentRepair.approvalStatus === "APPROVED" ? "#3b82f6" : "#f59e0b"}`,
                        }}
                      >
                        APPROVAL: {currentRepair.approvalStatus}
                      </span>
                    </div>
                  </div>

                  {/* Unified Diff View */}
                  <div style={{ marginBottom: "20px" }}>
                    <div style={{ background: "#0f172a", borderRadius: "8px", overflow: "hidden", border: "1px solid #334155" }}>
                      <div style={{ background: "#1e293b", padding: "8px 12px", borderBottom: "1px solid #334155", fontSize: "12px", color: "#94a3b8", fontFamily: "monospace" }}>
                        Modified: {currentRepair.changedFiles.join(", ")}
                      </div>
                      <pre style={{ margin: 0, padding: "14px", fontSize: "13px", fontFamily: "monospace", overflowX: "auto", lineHeight: "1.5" }}>
                        {currentRepair.diff.split("\n").map((line, idx) => {
                          let bg = "transparent";
                          let color = "#e2e8f0";
                          if (line.startsWith("+") && !line.startsWith("+++")) {
                            bg = "rgba(34, 197, 94, 0.15)";
                            color = "#4ade80";
                          } else if (line.startsWith("-") && !line.startsWith("---")) {
                            bg = "rgba(239, 68, 68, 0.15)";
                            color = "#f87171";
                          } else if (line.startsWith("@@")) {
                            color = "#38bdf8";
                          }
                          return (
                            <div key={idx} style={{ background: bg, color, padding: "1px 4px", borderRadius: "2px" }}>
                              {line}
                            </div>
                          );
                        })}
                      </pre>
                    </div>
                  </div>

                  {/* Multi-Stage Validation Results */}
                  <div style={{ marginBottom: "20px" }}>
                    <strong style={{ fontSize: "14px", color: "#f8fafc", display: "block", marginBottom: "10px" }}>
                      Sandbox Validation Stages
                    </strong>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
                      {currentRepair.validationStages.map((stage, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: "#0f172a",
                            padding: "12px",
                            borderRadius: "8px",
                            border: `1px solid ${stage.passed ? "#22c55e44" : "#ef444444"}`,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                            <span style={{ fontSize: "12px", fontWeight: "700", color: "#f8fafc" }}>{stage.stage}</span>
                            <span style={{ fontSize: "14px" }}>{stage.passed ? "✓" : "✗"}</span>
                          </div>
                          <span style={{ fontSize: "11px", color: stage.passed ? "#4ade80" : "#f87171" }}>
                            {stage.passed ? "Passed" : "Failed"} ({stage.durationMs}ms)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Human Approval & Deployment Gate */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "16px", borderTop: "1px solid #334155" }}>
                    <div style={{ fontSize: "13px", color: "#94a3b8" }}>
                      {currentRepair.approvalStatus === "APPROVED" ? (
                        <span style={{ color: "#4ade80" }}>✓ Fix approved by {currentRepair.approvedBy}. Live deployment enabled.</span>
                      ) : (
                        <span>Mandatory safety approval required prior to live Docker container release.</span>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: "12px" }}>
                      {currentRepair.approvalStatus === "PENDING" && (
                        <>
                          <button
                            onClick={() => handleRejectRepair(currentRepair.repairId)}
                            disabled={loading}
                            style={{
                              padding: "8px 16px",
                              background: "#334155",
                              color: "#f87171",
                              border: "1px solid #475569",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontWeight: "600",
                            }}
                          >
                            Reject Fix
                          </button>
                          <button
                            onClick={() => handleApproveRepair(currentRepair.repairId)}
                            disabled={loading || currentRepair.validationStatus !== "VALIDATED"}
                            style={{
                              padding: "8px 18px",
                              background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontWeight: "600",
                            }}
                          >
                            ✓ Approve Fix
                          </button>
                        </>
                      )}

                      {currentRepair.approvalStatus === "APPROVED" && !currentDeployment && (
                        <button
                          onClick={() => handleDeployRepair(currentRepair.repairId)}
                          disabled={loading}
                          style={{
                            padding: "10px 22px",
                            background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "8px",
                            fontWeight: "700",
                            cursor: loading ? "not-allowed" : "pointer",
                            boxShadow: "0 4px 14px rgba(139, 92, 246, 0.4)",
                          }}
                        >
                          🚀 Deploy Fixed Container to Docker
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Live Deployment & SLO Verification Card */}
              {currentDeployment && (
                <div style={{ background: "#1e293b", borderRadius: "12px", padding: "20px", border: "1px solid #334155" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "18px", color: "#f8fafc" }}>
                        Live Container Deployment Status
                      </h3>
                      <p style={{ margin: "4px 0 0 0", color: "#94a3b8", fontSize: "13px" }}>
                        Image: <code style={{ color: "#c084fc" }}>{currentDeployment.imageTag}</code> | Container ID: <code style={{ color: "#38bdf8" }}>{currentDeployment.containerId || "active"}</code>
                      </p>
                    </div>

                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: "700",
                          padding: "4px 12px",
                          borderRadius: "6px",
                          background: currentDeployment.status === "HEALTHY" ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)",
                          color: currentDeployment.status === "HEALTHY" ? "#4ade80" : "#f87171",
                          border: `1px solid ${currentDeployment.status === "HEALTHY" ? "#22c55e" : "#ef4444"}`,
                        }}
                      >
                        STATUS: {currentDeployment.status}
                      </span>

                      {currentDeployment.status === "HEALTHY" && (
                        <button
                          onClick={() => handleRollback(currentDeployment.deploymentId)}
                          disabled={loading}
                          style={{
                            padding: "6px 14px",
                            background: "#450a0a",
                            color: "#fca5a5",
                            border: "1px solid #ef4444",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: "600",
                          }}
                        >
                          ↺ Rollback
                        </button>
                      )}
                    </div>
                  </div>

                  {/* SLO Before vs After Card */}
                  {currentVerification && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px", background: "#0f172a", padding: "16px", borderRadius: "8px", marginBottom: "16px" }}>
                      <div>
                        <span style={{ fontSize: "11px", color: "#94a3b8", display: "block" }}>PRE-REPAIR LATENCY</span>
                        <span style={{ fontSize: "20px", fontWeight: "700", color: "#f87171" }}>
                          {currentVerification.beforeValue}s
                        </span>
                        <span style={{ fontSize: "11px", color: "#ef4444", display: "block" }}>SLO VIOLATION</span>
                      </div>

                      <div>
                        <span style={{ fontSize: "11px", color: "#94a3b8", display: "block" }}>POST-REPAIR LATENCY</span>
                        <span style={{ fontSize: "20px", fontWeight: "700", color: "#4ade80" }}>
                          {currentVerification.afterValue}s
                        </span>
                        <span style={{ fontSize: "11px", color: "#22c55e", display: "block" }}>SLO COMPLIANT (Target &lt; {currentVerification.targetValue}s)</span>
                      </div>

                      <div>
                        <span style={{ fontSize: "11px", color: "#94a3b8", display: "block" }}>MEASURED IMPROVEMENT</span>
                        <span style={{ fontSize: "20px", fontWeight: "700", color: "#38bdf8" }}>
                          +{currentVerification.improvementPercentage}%
                        </span>
                        <span style={{ fontSize: "11px", color: "#60a5fa", display: "block" }}>Health Probes Verified</span>
                      </div>
                    </div>
                  )}

                  {/* Live Endpoint access */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: "#94a3b8" }}>
                    <span>
                      🌐 Live Container Endpoint:{" "}
                      <a
                        href={currentDeployment.healthCheckUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#38bdf8", textDecoration: "underline" }}
                      >
                        {currentDeployment.healthCheckUrl}
                      </a>
                    </span>
                    <span>Host Port: {currentDeployment.hostPort}</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ background: "#1e293b", borderRadius: "12px", padding: "60px 20px", textAlign: "center", color: "#64748b", border: "1px solid #334155" }}>
              <h3 style={{ fontSize: "18px", color: "#94a3b8", margin: "0 0 8px 0" }}>
                No Issue Selected
              </h3>
              <p style={{ fontSize: "14px", margin: 0 }}>
                Select an issue from the left panel or click "Scan for Issues" to inspect the project.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

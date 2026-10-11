import React, { useState, useEffect, useCallback } from "react";
import {
  GitMerge,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Play,
  CheckCircle2,
  Clock,
  Activity,
  Layers,
  Server,
} from "lucide-react";
import { api } from "../../services/api";
import type { Deployment, CanaryStageStatus } from "../../types";

interface CanaryTabProps {
  deployments: Deployment[];
  onRefresh: () => Promise<void>;
}

export const CanaryTab: React.FC<CanaryTabProps> = ({ deployments, onRefresh }) => {
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string>("");
  const [canaryStatus, setCanaryStatus] = useState<CanaryStageStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [evaluating, setEvaluating] = useState<boolean>(false);
  const [advancing, setAdvancing] = useState<boolean>(false);
  const [aborting, setAborting] = useState<boolean>(false);
  const [evaluationResult, setEvaluationResult] = useState<{
    passed: boolean;
    verdict: "ALLOW" | "BLOCK";
    outcome: string;
    actualValue: number;
    target: number;
    operator: string;
    reason: string;
  } | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Filter deployments that are CANARY or active
  const canaryDeployments = deployments.filter(
    (d) => d.strategy === "CANARY" || d.trafficStrategy === "CANARY" || d.canaryStatus !== undefined
  );

  // Set default selected deployment if none selected
  useEffect(() => {
    if (!selectedDeploymentId && canaryDeployments.length > 0) {
      setSelectedDeploymentId(canaryDeployments[0].deploymentId);
    }
  }, [canaryDeployments, selectedDeploymentId]);

  // Load canary status for selected deployment
  const loadCanaryStatus = useCallback(async (depId: string) => {
    if (!depId) return;
    try {
      setLoading(true);
      const status = await api.getCanaryStatus(depId);
      setCanaryStatus(status);
    } catch {
      // If deployment hasn't started canary yet, synthesize initial status from deployment object
      const dep = deployments.find((d) => d.deploymentId === depId);
      if (dep) {
        setCanaryStatus({
          deploymentId: dep.deploymentId,
          strategy: (dep.strategy as any) || "CANARY",
          canaryStatus: (dep.canaryStatus as any) || "NOT_STARTED",
          currentStage: dep.currentCanaryStage || "WARMING",
          candidateWeight: dep.candidateTrafficWeight ?? 0,
          predecessorWeight: dep.predecessorTrafficWeight ?? 100,
          canAdvance: true,
          isCompleted: dep.canaryStatus === "COMPLETED",
          isAborted: dep.canaryStatus === "ABORTED",
          stages: (dep.canaryStages as any) || [],
        });
      }
    } finally {
      setLoading(false);
    }
  }, [deployments]);

  useEffect(() => {
    if (selectedDeploymentId) {
      loadCanaryStatus(selectedDeploymentId);
    }
  }, [selectedDeploymentId, loadCanaryStatus]);

  // Auto-refresh canary status every 4 seconds
  useEffect(() => {
    if (!selectedDeploymentId) return;
    const interval = setInterval(() => {
      loadCanaryStatus(selectedDeploymentId);
    }, 4000);
    return () => clearInterval(interval);
  }, [selectedDeploymentId, loadCanaryStatus]);

  const handleStartCanary = async () => {
    if (!selectedDeploymentId) return;
    try {
      setActionMessage(null);
      setAdvancing(true);
      const res = await api.startCanary(selectedDeploymentId);
      setCanaryStatus(res);
      setActionMessage({ type: "success", text: "Canary progression initialized at Stage 0 (Warmup)!" });
      await onRefresh();
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to start canary progression." });
    } finally {
      setAdvancing(false);
    }
  };

  const handleEvaluate = async () => {
    if (!selectedDeploymentId) return;
    try {
      setEvaluating(true);
      setActionMessage(null);
      const res = await api.evaluateCanary(selectedDeploymentId);
      setEvaluationResult(res);
      if (res.passed) {
        setActionMessage({ type: "success", text: `Prometheus Gate Passed (${res.verdict}): ${res.reason}` });
      } else {
        setActionMessage({ type: "error", text: `Prometheus Gate Blocked (${res.verdict}): ${res.reason}` });
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Canary evaluation query failed." });
    } finally {
      setEvaluating(false);
    }
  };

  const handleAdvance = async () => {
    if (!selectedDeploymentId) return;
    try {
      setActionMessage(null);
      setAdvancing(true);
      const res = await api.advanceCanary(selectedDeploymentId, { actor: "TraceOps Web Operator" });
      setCanaryStatus(res);
      setActionMessage({
        type: "success",
        text: `Advanced canary to stage ${res.currentStage}! Candidate traffic is now ${res.candidateWeight}%.`,
      });
      await onRefresh();
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Stage advance rejected." });
    } finally {
      setAdvancing(false);
    }
  };

  const handleAbort = async () => {
    if (!selectedDeploymentId) return;
    const confirmed = window.confirm(
      "CONFIRM EMERGENCY ABORT: Are you sure you want to clamp all traffic to 100% Predecessor and trigger automated rollback?"
    );
    if (!confirmed) return;

    try {
      setActionMessage(null);
      setAborting(true);
      const res = await api.abortCanary(
        selectedDeploymentId,
        "Emergency abort triggered from TraceOps web console",
        "TraceOps SRE Operator"
      );
      setCanaryStatus(res);
      setActionMessage({
        type: "error",
        text: "EMERGENCY ABORT EXECUTED: Traffic clamped to 100% predecessor. Batch B rollback initiated.",
      });
      await onRefresh();
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Canary abort failed." });
    } finally {
      setAborting(false);
    }
  };

  const selectedDeployment = deployments.find((d) => d.deploymentId === selectedDeploymentId);

  // Stages definition
  const CANARY_PIPELINE = [
    { id: "WARMING", label: "Stage 0: Warmup", split: "0 / 100", bake: "10s", cand: 0, pred: 100 },
    { id: "CANARY_TIER_10", label: "Stage 1: Inception", split: "10 / 90", bake: "30s", cand: 10, pred: 90 },
    { id: "CANARY_TIER_25", label: "Stage 2: Expansion", split: "25 / 75", bake: "30s", cand: 25, pred: 75 },
    { id: "CANARY_TIER_50", label: "Stage 3: Parity", split: "50 / 50", bake: "45s", cand: 50, pred: 50 },
    { id: "FULL_PROMOTION", label: "Stage 4: Cutover", split: "100 / 0", bake: "60s", cand: 100, pred: 0 },
  ];

  const currentStageName = canaryStatus?.currentStage || selectedDeployment?.currentCanaryStage || "WARMING";
  const candidateWeight = canaryStatus?.candidateWeight ?? selectedDeployment?.candidateTrafficWeight ?? 0;
  const predecessorWeight = canaryStatus?.predecessorWeight ?? selectedDeployment?.predecessorTrafficWeight ?? 100;
  const canaryState = canaryStatus?.canaryStatus || selectedDeployment?.canaryStatus || "NOT_STARTED";

  const getStageIndex = (stage: string) => {
    const s = stage.toUpperCase();
    if (s.includes("WARM")) return 0;
    if (s.includes("10")) return 1;
    if (s.includes("25")) return 2;
    if (s.includes("50")) return 3;
    if (s.includes("FULL") || s.includes("100") || s.includes("CUTOVER") || s.includes("COMPLETED")) return 4;
    return 0;
  };

  const activeIndex = getStageIndex(currentStageName);

  return (
    <div className="tab-pane-container">
      {/* 1. Header & Deployment Selection */}
      <div className="section-card header-banner">
        <div className="banner-left">
          <div className="icon-badge canary">
            <GitMerge className="w-6 h-6 text-sky-400" />
          </div>
          <div>
            <h2>Canary Progression & Dynamic Traffic Controller</h2>
            <p className="subtitle">
              Phase 5.3 Batch C2-C5: Dynamic Reverse Proxy, Bake Timers, Automated Canary Analysis (ACA), and Emergency Abort
            </p>
          </div>
        </div>

        <div className="banner-right">
          <div className="deployment-selector-wrap">
            <label>Active Deployment: {loading ? "(syncing...)" : ""}</label>
            <select
              value={selectedDeploymentId}
              onChange={(e) => setSelectedDeploymentId(e.target.value)}
              className="select-deployment"
            >
              {canaryDeployments.length === 0 ? (
                <option value="">No Canary Deployments Found</option>
              ) : (
                canaryDeployments.map((d) => (
                  <option key={d.deploymentId} value={d.deploymentId}>
                    {d.service} ({d.deploymentId.slice(0, 16)}...) — {d.canaryStatus || "NOT_STARTED"}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      {actionMessage && (
        <div className={`action-alert-banner ${actionMessage.type}`}>
          {actionMessage.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* 2. Visual Multi-Stage Pipeline */}
      <div className="section-card">
        <div className="card-header-row">
          <div className="row-title">
            <Layers className="w-5 h-5 text-sky-400" />
            <h3>Sequential Multi-Stage Traffic Progression</h3>
          </div>
          <div className="status-badge-group">
            <span className={`status-pill ${canaryState.toLowerCase()}`}>
              Status: {canaryState}
            </span>
            <span className="stage-pill">
              Stage: {currentStageName}
            </span>
          </div>
        </div>

        <div className="canary-pipeline-track">
          {CANARY_PIPELINE.map((stage, idx) => {
            const isCompleted = activeIndex > idx || canaryState === "COMPLETED";
            const isCurrent = activeIndex === idx && canaryState !== "COMPLETED" && canaryState !== "ABORTED";
            const isAborted = canaryState === "ABORTED";

            return (
              <div
                key={stage.id}
                className={`pipeline-step ${isCompleted ? "completed" : ""} ${isCurrent ? "active" : ""} ${
                  isAborted ? "aborted" : ""
                }`}
              >
                <div className="step-number-bubble">
                  {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : idx}
                </div>
                <div className="step-content">
                  <div className="step-label">{stage.label}</div>
                  <div className="step-split">Candidate: {stage.cand}% / Predecessor: {stage.pred}%</div>
                  <div className="step-bake">
                    <Clock className="w-3 h-3 inline mr-1" />
                    Bake: {stage.bake}
                  </div>
                </div>
                {idx < CANARY_PIPELINE.length - 1 && <div className="step-arrow"><ArrowRight className="w-4 h-4" /></div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Live Traffic Distribution Gauges */}
      <div className="grid-2-col">
        <div className="section-card">
          <div className="card-header-row">
            <div className="row-title">
              <Activity className="w-5 h-5 text-emerald-400" />
              <h3>Real-Time Traffic Routing Split</h3>
            </div>
            <span className="live-pulse">LIVE C2 PROXY</span>
          </div>

          <div className="traffic-gauges-container">
            <div className="traffic-bar-item">
              <div className="bar-label-row">
                <span className="entity-name candidate">
                  <Server className="w-4 h-4 text-emerald-400 inline mr-1" />
                  Candidate Container (New Code)
                </span>
                <span className="percentage-badge candidate">{candidateWeight}%</span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill candidate"
                  style={{ width: `${candidateWeight}%` }}
                />
              </div>
              <div className="image-tag-info">
                Image: <code>{selectedDeployment?.candidateImage || "traceops/candidate:latest"}</code>
              </div>
            </div>

            <div className="traffic-bar-item">
              <div className="bar-label-row">
                <span className="entity-name predecessor">
                  <Server className="w-4 h-4 text-sky-400 inline mr-1" />
                  Predecessor Container (Baseline Stable)
                </span>
                <span className="percentage-badge predecessor">{predecessorWeight}%</span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill predecessor"
                  style={{ width: `${predecessorWeight}%` }}
                />
              </div>
              <div className="image-tag-info">
                Image: <code>{selectedDeployment?.predecessorImage || "traceops/stable:1.0.0"}</code>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Automated Canary Analysis (ACA) & Prometheus Gate */}
        <div className="section-card">
          <div className="card-header-row">
            <div className="row-title">
              <ShieldCheck className="w-5 h-5 text-sky-400" />
              <h3>Phase 5.3 Batch C4: Prometheus Telemetry Gate</h3>
            </div>
            <span className="aca-badge">ACA Watchdog</span>
          </div>

          <div className="aca-panel">
            <div className="gate-status-row">
              <span className="gate-title">Stage Progression Gate:</span>
              {evaluationResult ? (
                <span className={`gate-verdict-pill ${evaluationResult.verdict.toLowerCase()}`}>
                  {evaluationResult.verdict === "ALLOW" ? "APPROVED (ALLOW)" : "BLOCKED (BLOCK)"}
                </span>
              ) : (
                <span className="gate-verdict-pill pending">Awaiting Gate Evaluation</span>
              )}
            </div>

            <div className="gate-details-box">
              <div className="detail-item">
                <span className="label">Evaluation Rule:</span>
                <span className="value">P95 Latency &lt;= 2.0s &amp; Error Rate &lt; 1%</span>
              </div>
              <div className="detail-item">
                <span className="label">Observed Metric:</span>
                <span className="value">
                  {evaluationResult ? `${evaluationResult.actualValue}s (${evaluationResult.operator} ${evaluationResult.target})` : "Telemetry continuous sampling"}
                </span>
              </div>
              <div className="detail-item">
                <span className="label">Analysis Outcome:</span>
                <span className="value">
                  {evaluationResult ? evaluationResult.outcome : "Prometheus continuous monitoring active"}
                </span>
              </div>
              {evaluationResult?.reason && (
                <div className="reason-text">
                  <strong>Watchdog Report:</strong> {evaluationResult.reason}
                </div>
              )}
            </div>

            {/* Actions Toolbar */}
            <div className="canary-actions-toolbar">
              {canaryState === "NOT_STARTED" && (
                <button
                  onClick={handleStartCanary}
                  disabled={advancing}
                  className="btn-action primary"
                >
                  <Play className="w-4 h-4" />
                  <span>Start Canary (0/100)</span>
                </button>
              )}

              {canaryState === "IN_PROGRESS" && (
                <>
                  <button
                    onClick={handleEvaluate}
                    disabled={evaluating}
                    className="btn-action evaluate"
                  >
                    <Activity className="w-4 h-4" />
                    <span>{evaluating ? "Querying Prometheus..." : "Evaluate Gate (ACA)"}</span>
                  </button>

                  <button
                    onClick={handleAdvance}
                    disabled={advancing || canaryStatus?.canAdvance === false}
                    className="btn-action advance"
                  >
                    <ArrowRight className="w-4 h-4" />
                    <span>{advancing ? "Advancing..." : "Advance Canary Stage"}</span>
                  </button>
                </>
              )}

              {canaryState !== "COMPLETED" && canaryState !== "ABORTED" && (
                <button
                  onClick={handleAbort}
                  disabled={aborting}
                  className="btn-action abort"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>{aborting ? "Clamping & Rolling Back..." : "Emergency Abort & Rollback"}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

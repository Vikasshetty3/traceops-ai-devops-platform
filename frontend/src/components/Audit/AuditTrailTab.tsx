import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  AlertOctagon,
  Clock,
  RefreshCw,
  Lock,
} from "lucide-react";
import { api } from "../../services/api";
import type { DeploymentAuditEvent, Deployment } from "../../types";

interface AuditTrailTabProps {
  deployments: Deployment[];
}

export const AuditTrailTab: React.FC<AuditTrailTabProps> = ({ deployments }) => {
  const [events, setEvents] = useState<DeploymentAuditEvent[]>([]);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<{
    valid: boolean;
    totalEvents: number;
    firstInvalidEventId: string | null;
    reason?: string;
  } | null>(null);

  const loadAuditEvents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getAuditEvents(selectedDeploymentId || undefined);
      setEvents(data || []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDeploymentId]);

  useEffect(() => {
    loadAuditEvents();
  }, [loadAuditEvents]);

  const handleVerifyChain = async () => {
    const targetDepId = selectedDeploymentId || (events.length > 0 ? events[0].deploymentId : "");
    if (!targetDepId) return;

    try {
      setVerifying(true);
      const res = await api.verifyAuditChain(targetDepId);
      setVerificationResult(res);
    } catch (err: any) {
      setVerificationResult({
        valid: false,
        totalEvents: 0,
        firstInvalidEventId: "QUERY_FAILED",
        reason: err.message || "Failed to verify cryptographic chain.",
      });
    } finally {
      setVerifying(false);
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case "SLO_VERIFIED":
      case "DEPLOY_SUCCESS":
      case "PROMOTION_FINALIZED":
        return "badge-success";
      case "SLO_BREACH_DETECTED":
      case "TRAFFIC_ABORTED":
      case "ROLLBACK_INITIATED":
        return "badge-danger";
      case "STAGE_ADVANCED":
      case "CANARY_INITIALIZED":
        return "badge-info";
      default:
        return "badge-secondary";
    }
  };

  return (
    <div className="tab-pane-container">
      {/* 1. Header & Controls */}
      <div className="section-card header-banner">
        <div className="banner-left">
          <div className="icon-badge audit">
            <Lock className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h2>Cryptographic Deployment Audit Ledger</h2>
            <p className="subtitle">
              Phase 5.3 Batch C1: Append-Only Immutable Ledger with SHA-256 Parent Hashing, Git Provenance &amp; Non-Repudiation
            </p>
          </div>
        </div>

        <div className="banner-right">
          <div className="filter-group">
            <select
              value={selectedDeploymentId}
              onChange={(e) => {
                setSelectedDeploymentId(e.target.value);
                setVerificationResult(null);
              }}
              className="select-filter"
            >
              <option value="">All Deployments</option>
              {deployments.map((d) => (
                <option key={d.deploymentId} value={d.deploymentId}>
                  {d.service} ({d.deploymentId.slice(0, 14)}...)
                </option>
              ))}
            </select>

            <button
              onClick={handleVerifyChain}
              disabled={verifying || events.length === 0}
              className="btn-verify-chain"
              title="Verify cryptographic SHA-256 parent hash chain integrity"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{verifying ? "Verifying Hashes..." : "Verify Chain Integrity"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Cryptographic Integrity Verification Banner */}
      {verificationResult && (
        <div className={`chain-verification-banner ${verificationResult.valid ? "valid" : "tampered"}`}>
          <div className="banner-status-icon">
            {verificationResult.valid ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            ) : (
              <AlertOctagon className="w-6 h-6 text-rose-400" />
            )}
          </div>
          <div className="banner-status-info">
            <h4>
              {verificationResult.valid
                ? "Cryptographic Audit Chain Intact: Zero Tampering Detected"
                : "CRYPTOGRAPHIC CHAIN INTEGRITY FAILURE"}
            </h4>
            <p>
              {verificationResult.valid
                ? `Successfully verified ${verificationResult.totalEvents} contiguous audit events. Each event's parent hash strictly matches preceding eventHash.`
                : `Tampering or broken link detected at event: ${verificationResult.firstInvalidEventId}. Reason: ${verificationResult.reason}`}
            </p>
          </div>
        </div>
      )}

      {/* 3. Audit Timeline Stream */}
      <div className="section-card">
        <div className="card-header-row">
          <div className="row-title">
            <Clock className="w-5 h-5 text-sky-400" />
            <h3>Deployment Lifecycle Audit Timeline ({events.length} Events)</h3>
          </div>
          <button onClick={loadAuditEvents} className="btn-refresh" title="Refresh audit log">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="empty-state">Loading cryptographic audit events...</div>
        ) : events.length === 0 ? (
          <div className="empty-state">
            <Lock className="w-8 h-8 text-slate-500 mb-2" />
            <p>No deployment audit events recorded yet.</p>
            <span className="subtext">Audit events are automatically generated during canary deployments and rollbacks.</span>
          </div>
        ) : (
          <div className="audit-timeline-stream">
            {events.map((evt, idx) => (
              <div key={evt.eventId || idx} className="timeline-event-card">
                <div className="event-sequence-badge">#{evt.sequenceNumber}</div>

                <div className="event-details">
                  <div className="event-title-row">
                    <span className={`event-action-badge ${getActionColor(evt.action)}`}>
                      {evt.action}
                    </span>
                    <span className="event-stage-tag">{evt.stage}</span>
                    <span className="event-time">
                      <Clock className="w-3.5 h-3.5 inline mr-1" />
                      {new Date(evt.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <div className="event-meta-grid">
                    <div className="meta-col">
                      <span className="label">Service:</span>
                      <span className="val">{evt.service}</span>
                    </div>
                    <div className="meta-col">
                      <span className="label">Traffic Split:</span>
                      <span className="val">Candidate: {evt.newCandidateWeight}% / Predecessor: {100 - evt.newCandidateWeight}%</span>
                    </div>
                    <div className="meta-col">
                      <span className="label">Actor:</span>
                      <span className="val">{evt.actor}</span>
                    </div>
                    <div className="meta-col">
                      <span className="label">Candidate Commit:</span>
                      <span className="val font-mono">{evt.candidateCommitSha ? evt.candidateCommitSha.slice(0, 10) : "N/A"}</span>
                    </div>
                  </div>

                  {/* Cryptographic Hashes Box */}
                  <div className="crypto-hashes-box">
                    <div className="hash-row">
                      <span className="hash-label">Event Hash (SHA-256):</span>
                      <code className="hash-code">{evt.eventHash}</code>
                    </div>
                    <div className="hash-row">
                      <span className="hash-label">Parent Hash:</span>
                      <code className="hash-code">{evt.parentEventHash}</code>
                    </div>
                    {evt.evidenceSnapshotHash && (
                      <div className="hash-row">
                        <span className="hash-label">Evidence Hash:</span>
                        <code className="hash-code">{evt.evidenceSnapshotHash}</code>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

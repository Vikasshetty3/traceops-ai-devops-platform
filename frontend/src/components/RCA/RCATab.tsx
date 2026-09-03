import React, { useState } from "react";
import type { RCA, Incident } from "../../types";
import { StatusBadge } from "../common/StatusBadge";
import { SectionHeader, EmptyState } from "../common/FeedbackStates";
import {
  Sparkles,
  Bot,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

interface RCATabProps {
  rcas: RCA[];
  incidents: Incident[];
  onTriggerGeminiRCA: (incident: Incident) => Promise<void>;
  onTriggerRuleRCA: (incident: Incident) => Promise<void>;
  onStartExperiment: (rca: RCA) => void;
}

export const RCATab: React.FC<RCATabProps> = ({
  rcas,
  incidents,
  onTriggerGeminiRCA,
  onTriggerRuleRCA,
  onStartExperiment,
}) => {
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>(
    incidents[0]?.incidentId || ""
  );
  const [analyzing, setAnalyzing] = useState(false);

  const selectedIncident = incidents.find((i) => i.incidentId === selectedIncidentId) || incidents[0];

  const handleGeminiAnalyze = async () => {
    if (!selectedIncident) return;
    setAnalyzing(true);
    try {
      await onTriggerGeminiRCA(selectedIncident);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRuleAnalyze = async () => {
    if (!selectedIncident) return;
    setAnalyzing(true);
    try {
      await onTriggerRuleRCA(selectedIncident);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <SectionHeader
        title="Automated AI & SRE Root Cause Analysis (RCA)"
        subtitle="Multi-modal synthesis of telemetry metrics, error traces, and system logs via Google Gemini 2.5 Flash"
      />

      {/* Incident Trigger Card */}
      {incidents.length > 0 && (
        <div
          style={{
            borderRadius: "8px",
            padding: "18px 20px",
            background: "rgba(15, 23, 42, 0.65)",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Sparkles className="w-6 h-6 text-purple-400" />
            <div>
              <div style={{ fontWeight: 600, fontSize: "15px", color: "#f8fafc" }}>
                Generate Root Cause Diagnosis for Incident
              </div>
              <div style={{ fontSize: "13px", color: "#94a3b8" }}>
                Select an open incident to synthesize logs and discover actionable remediations
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <select
              value={selectedIncidentId}
              onChange={(e) => setSelectedIncidentId(e.target.value)}
              style={{
                padding: "8px 12px",
                backgroundColor: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(148, 163, 184, 0.3)",
                borderRadius: "6px",
                color: "#f8fafc",
                fontSize: "13px",
              }}
            >
              {incidents.map((inc) => (
                <option key={inc.incidentId} value={inc.incidentId}>
                  {inc.incidentId} - {inc.service} ({inc.actualValue}s vs {inc.threshold}s)
                </option>
              ))}
            </select>

            <button
              onClick={handleGeminiAnalyze}
              disabled={analyzing}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: 600,
                backgroundColor: "#8b5cf6",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              <Bot className="w-4 h-4" />
              {analyzing ? "Synthesizing..." : "Analyze with Gemini"}
            </button>

            <button
              onClick={handleRuleAnalyze}
              disabled={analyzing}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                fontSize: "13px",
                fontWeight: 600,
                backgroundColor: "rgba(148, 163, 184, 0.15)",
                color: "#cbd5e1",
                border: "1px solid rgba(148, 163, 184, 0.3)",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              <ShieldCheck className="w-4 h-4" />
              Rule-Based Fallback
            </button>
          </div>
        </div>
      )}

      {/* RCA Findings Feed */}
      {rcas.length === 0 ? (
        <EmptyState
          title="No Root Cause Analyses Generated Yet"
          description="Trigger an analysis above to generate AI root cause diagnosis from active incident telemetry."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {rcas.map((rca) => {
            const isGemini = rca.confidence >= 0.85;
            return (
              <div
                key={rca.rcaId}
                style={{
                  borderRadius: "8px",
                  background: "rgba(15, 23, 42, 0.65)",
                  border: "1px solid rgba(148, 163, 184, 0.2)",
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
                        {rca.rcaId}
                      </span>
                      <span
                        style={{
                          fontSize: "12px",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          backgroundColor: isGemini ? "rgba(139, 92, 246, 0.15)" : "rgba(59, 130, 246, 0.15)",
                          color: isGemini ? "#a78bfa" : "#60a5fa",
                          border: `1px solid ${isGemini ? "rgba(139, 92, 246, 0.3)" : "rgba(59, 130, 246, 0.3)"}`,
                          fontWeight: 600,
                        }}
                      >
                        {isGemini ? "Google Gemini 2.5 Flash" : "Deterministic SRE Rule Analyzer"}
                      </span>
                      <StatusBadge status={rca.status || "GENERATED"} size="sm" />
                    </div>
                    <div style={{ fontSize: "13px", color: "#94a3b8" }}>
                      Linked to Incident <span style={{ color: "#38bdf8" }}>{rca.incidentId}</span> &bull; Requirement <span style={{ color: "#38bdf8" }}>{rca.requirementId}</span>
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>Diagnostic Confidence</div>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: rca.confidence >= 0.9 ? "#10b981" : "#f59e0b" }}>
                      {(rca.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>

                {/* Root Cause Box */}
                <div
                  style={{
                    backgroundColor: "rgba(2, 6, 23, 0.6)",
                    border: "1px solid rgba(148, 163, 184, 0.15)",
                    borderRadius: "6px",
                    padding: "14px",
                  }}
                >
                  <div style={{ fontSize: "12px", textTransform: "uppercase", color: "#64748b", fontWeight: 700, letterSpacing: "0.05em", marginBottom: "4px" }}>
                    Diagnosed Root Cause
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: 600, color: "#f8fafc" }}>
                    {rca.rootCause}
                  </div>
                </div>

                {/* Evidence & Action */}
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "14px" }}>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#94a3b8", marginBottom: "6px" }}>
                      Evidence & Telemetry Corroboration:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "#cbd5e1" }}>
                      {rca.evidence.map((ev, idx) => (
                        <li key={idx} style={{ marginBottom: "3px" }}>{ev}</li>
                      ))}
                    </ul>
                  </div>

                  <div
                    style={{
                      backgroundColor: "rgba(16, 185, 129, 0.06)",
                      border: "1px solid rgba(16, 185, 129, 0.25)",
                      borderRadius: "6px",
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#10b981", textTransform: "uppercase", marginBottom: "4px" }}>
                        Recommended Remediation
                      </div>
                      <div style={{ fontSize: "14px", color: "#f1f5f9", fontWeight: 500 }}>
                        {rca.recommendedAction}
                      </div>
                    </div>

                    <button
                      onClick={() => onStartExperiment(rca)}
                      style={{
                        marginTop: "12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        padding: "7px 12px",
                        fontSize: "12px",
                        fontWeight: 600,
                        backgroundColor: "#10b981",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "5px",
                        cursor: "pointer",
                      }}
                    >
                      <span>Simulate in Experiment Engine</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

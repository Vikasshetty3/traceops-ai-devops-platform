import React, { useState } from "react";
import type { TraceGraphNode, Requirement } from "../../types";
import { StatusBadge } from "../common/StatusBadge";
import { SectionHeader, EmptyState } from "../common/FeedbackStates";
import {
  Layers,
  Zap,
  BrainCircuit,
  Sparkles,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";

interface TraceabilityTabProps {
  graph: TraceGraphNode[];
  requirements: Requirement[];
  selectedReqId?: string;
  onSelectRequirement: (reqId: string) => void;
}

export const TraceabilityTab: React.FC<TraceabilityTabProps> = ({
  graph,
  requirements,
  selectedReqId,
  onSelectRequirement,
}) => {
  const [activeReqId, setActiveReqId] = useState<string>(
    selectedReqId || graph[0]?.requirement?.requirementId || requirements[0]?.requirementId || ""
  );

  const activeNode =
    graph.find((g) => g.requirement?.requirementId === activeReqId) || graph[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <SectionHeader
        title="End-to-End Requirement Traceability Graph"
        subtitle="Unbroken chain linking business software requirements to runtime observability, ML prediction, AI RCA, and verified DevOps mutations"
        action={
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "13px", color: "#94a3b8" }}>Filter Requirement:</span>
            <select
              value={activeReqId}
              onChange={(e) => {
                setActiveReqId(e.target.value);
                onSelectRequirement(e.target.value);
              }}
              style={{
                padding: "6px 12px",
                backgroundColor: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(148, 163, 184, 0.3)",
                borderRadius: "6px",
                color: "#f8fafc",
                fontSize: "13px",
              }}
            >
              {requirements.map((r) => (
                <option key={r.requirementId} value={r.requirementId}>
                  {r.requirementId} - {r.title}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {!activeNode ? (
        <EmptyState
          title="No Traceability Records Found"
          description="Create requirements and trigger SLO evaluation to generate end-to-end traceability graphs."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Visual Step Pipeline Flow */}
          <div
            style={{
              borderRadius: "8px",
              background: "rgba(15, 23, 42, 0.7)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              padding: "24px",
              overflowX: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", minWidth: "900px", gap: "10px", flexWrap: "wrap" }}>
              {/* 1. Requirement Node */}
              {activeNode.requirement && (
                <div style={{ flex: "1 1 200px", padding: "14px", borderRadius: "8px", background: "rgba(56, 189, 248, 0.1)", border: "1px solid rgba(56, 189, 248, 0.3)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#38bdf8", fontWeight: 700 }}>
                    <Layers className="w-4 h-4" />
                    REQUIREMENT
                  </div>
                  <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: "14px", marginTop: "4px" }}>
                    {activeNode.requirement.requirementId}
                  </div>
                  <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                    {activeNode.requirement.title}
                  </div>
                  <div style={{ marginTop: "6px" }}>
                    <StatusBadge status={activeNode.requirement.status || "ACTIVE"} size="sm" />
                  </div>
                </div>
              )}

              {/* 2. SLO Target(s) */}
              {activeNode.slos && activeNode.slos.length > 0 && (
                <>
                  <ChevronRight className="w-5 h-5 text-slate-500 flex-shrink-0" />
                  <div style={{ flex: "1 1 200px", padding: "14px", borderRadius: "8px", background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#f59e0b", fontWeight: 700 }}>
                      <Zap className="w-4 h-4" />
                      SLO TARGET
                    </div>
                    <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: "14px", marginTop: "4px" }}>
                      {activeNode.slos[0].sloId}
                    </div>
                    <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                      {activeNode.slos[0].metric} {activeNode.slos[0].operator || ""} {activeNode.slos[0].threshold} {activeNode.slos[0].unit || ""}
                    </div>
                    <div style={{ marginTop: "6px" }}>
                      <StatusBadge status={activeNode.slos[0].status || "ACTIVE"} size="sm" />
                    </div>
                  </div>
                </>
              )}

              {/* 3. Incidents */}
              {activeNode.incidents && activeNode.incidents.length > 0 && (
                <>
                  <ChevronRight className="w-5 h-5 text-slate-500 flex-shrink-0" />
                  <div style={{ flex: "1 1 200px", padding: "14px", borderRadius: "8px", background: "rgba(139, 92, 246, 0.1)", border: "1px solid rgba(139, 92, 246, 0.3)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#a78bfa", fontWeight: 700 }}>
                      <BrainCircuit className="w-4 h-4" />
                      INCIDENT
                    </div>
                    <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: "14px", marginTop: "4px" }}>
                      {activeNode.incidents[0].incidentId}
                    </div>
                    <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                      {activeNode.incidents[0].service} &bull; {activeNode.incidents[0].actualValue != null ? `${activeNode.incidents[0].actualValue}s` : "No measurement available"} vs {activeNode.incidents[0].threshold != null ? `${activeNode.incidents[0].threshold}s` : "No target defined"}
                    </div>
                    <div style={{ marginTop: "6px" }}>
                      <StatusBadge status={activeNode.incidents[0].status} size="sm" />
                    </div>
                  </div>
                </>
              )}

              {/* 4. RCA Node */}
              {activeNode.rcas && activeNode.rcas.length > 0 && (
                <>
                  <ChevronRight className="w-5 h-5 text-slate-500 flex-shrink-0" />
                  <div style={{ flex: "1 1 200px", padding: "14px", borderRadius: "8px", background: "rgba(168, 85, 247, 0.1)", border: "1px solid rgba(168, 85, 247, 0.3)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#c084fc", fontWeight: 700 }}>
                      <Sparkles className="w-4 h-4" />
                      ROOT CAUSE ANALYSIS
                    </div>
                    <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: "14px", marginTop: "4px" }}>
                      {activeNode.rcas[0].rcaId}
                    </div>
                    <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {activeNode.rcas[0].rootCause}
                    </div>
                    <div style={{ marginTop: "6px" }}>
                      <StatusBadge status={activeNode.rcas[0].status || "GENERATED"} size="sm" />
                    </div>
                  </div>
                </>
              )}

              {/* 5. DevOps Action */}
              {activeNode.devopsActions && activeNode.devopsActions.length > 0 && (
                <>
                  <ChevronRight className="w-5 h-5 text-slate-500 flex-shrink-0" />
                  <div style={{ flex: "1 1 200px", padding: "14px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#34d399", fontWeight: 700 }}>
                      <ShieldCheck className="w-4 h-4" />
                      DEVOPS ACTION
                    </div>
                    <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: "14px", marginTop: "4px" }}>
                      {activeNode.devopsActions[0].actionType}
                    </div>
                    <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                      {activeNode.devopsActions[0].actionId}
                    </div>
                    <div style={{ marginTop: "6px" }}>
                      <StatusBadge status={activeNode.devopsActions[0].status} size="sm" />
                    </div>
                  </div>
                </>
              )}

              {/* Indicator if no downstream relationships exist */}
              {(!activeNode.slos || activeNode.slos.length === 0) &&
                (!activeNode.incidents || activeNode.incidents.length === 0) &&
                (!activeNode.rcas || activeNode.rcas.length === 0) &&
                (!activeNode.devopsActions || activeNode.devopsActions.length === 0) && (
                  <div style={{ color: "#64748b", fontSize: "13px", padding: "14px", fontStyle: "italic" }}>
                    No downstream SLO, incident, RCA, or DevOps action records linked to this requirement yet.
                  </div>
                )}
            </div>
          </div>

          {/* Trace Details Table */}
          <div
            style={{
              borderRadius: "8px",
              background: "rgba(15, 23, 42, 0.65)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              padding: "20px",
            }}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "#f8fafc" }}>
              Linked Stage Inventory for {activeNode.requirement?.requirementId}
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "13px" }}>
              <div>
                <div style={{ fontWeight: 600, color: "#94a3b8", marginBottom: "6px" }}>Associated Incidents:</div>
                {activeNode.incidents && activeNode.incidents.length > 0 ? (
                  activeNode.incidents.map((inc) => (
                    <div key={inc.incidentId} style={{ padding: "8px", borderRadius: "4px", backgroundColor: "rgba(15, 23, 42, 0.8)", marginBottom: "4px" }}>
                      <span style={{ fontWeight: 600, color: "#ef4444" }}>{inc.incidentId}</span> &bull; {inc.message}
                    </div>
                  ))
                ) : (
                  <div style={{ color: "#64748b" }}>No incidents registered</div>
                )}
              </div>

              <div>
                <div style={{ fontWeight: 600, color: "#94a3b8", marginBottom: "6px" }}>Executed Remediations:</div>
                {activeNode.devopsActions && activeNode.devopsActions.length > 0 ? (
                  activeNode.devopsActions.map((act) => (
                    <div key={act.actionId} style={{ padding: "8px", borderRadius: "4px", backgroundColor: "rgba(15, 23, 42, 0.8)", marginBottom: "4px" }}>
                      <span style={{ fontWeight: 600, color: "#10b981" }}>{act.actionId}</span> &bull; {act.description}
                    </div>
                  ))
                ) : (
                  <div style={{ color: "#64748b" }}>No actions registered</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

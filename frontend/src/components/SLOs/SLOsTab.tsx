import React, { useState } from "react";
import type { SLO, Requirement } from "../../types";
import { StatusBadge } from "../common/StatusBadge";
import { SectionHeader, EmptyState } from "../common/FeedbackStates";
import { Plus, Trash2, Zap, Target } from "lucide-react";

interface SLOsTabProps {
  slos: SLO[];
  requirements: Requirement[];
  onCreateSLO: (data: Partial<SLO>) => Promise<void>;
  onDeleteSLO: (id: string) => Promise<void>;
}

export const SLOsTab: React.FC<SLOsTabProps> = ({
  slos,
  requirements,
  onCreateSLO,
  onDeleteSLO,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Partial<SLO>>({
    sloId: "SLO-001",
    requirementId: requirements[0]?.requirementId || "REQ-001",
    service: "Checkout",
    metric: "p95_latency",
    operator: "<",
    threshold: 2.0,
    target: 99.9,
    unit: "seconds",
    window: "5m",
    severity: "CRITICAL",
    status: "ACTIVE",
  });

  const openNewModal = () => {
    setFormData({
      sloId: `SLO-${Math.floor(1000 + Math.random() * 9000)}`,
      requirementId: requirements[0]?.requirementId || "REQ-001",
      service: "Checkout",
      metric: "p95_latency",
      operator: "<",
      threshold: 2.0,
      target: 99.9,
      unit: "seconds",
      window: "5m",
      severity: "CRITICAL",
      status: "ACTIVE",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCreateSLO(formData);
    setShowModal(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <SectionHeader
        title="Service Level Objectives (SLO) Registry"
        subtitle="Technical telemetry targets bound directly to business requirements"
        action={
          <button
            onClick={openNewModal}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 600,
              backgroundColor: "#3b82f6",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            <Plus className="w-4 h-4" />
            New SLO Target
          </button>
        }
      />

      {slos.length === 0 ? (
        <EmptyState
          title="No SLOs defined"
          description="Register technical SLO targets mapped to business requirements."
          action={
            <button
              onClick={openNewModal}
              style={{
                padding: "8px 16px",
                backgroundColor: "#3b82f6",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Add SLO
            </button>
          }
        />
      ) : (
        <div
          style={{
            borderRadius: "8px",
            background: "rgba(15, 23, 42, 0.65)",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.2)", color: "#94a3b8", backgroundColor: "rgba(15, 23, 42, 0.4)" }}>
                <th style={{ padding: "12px 16px" }}>SLO ID</th>
                <th style={{ padding: "12px 16px" }}>Linked Requirement</th>
                <th style={{ padding: "12px 16px" }}>Service</th>
                <th style={{ padding: "12px 16px" }}>Target Formula</th>
                <th style={{ padding: "12px 16px" }}>Availability Goal</th>
                <th style={{ padding: "12px 16px" }}>Severity</th>
                <th style={{ padding: "12px 16px" }}>Status</th>
                <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {slos.map((slo) => (
                <tr key={slo.sloId} style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.1)" }}>
                  <td style={{ padding: "14px 16px", fontWeight: 600, color: "#38bdf8" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Zap className="w-4 h-4 text-amber-400" />
                      {slo.sloId}
                    </div>
                  </td>
                  <td style={{ padding: "14px 16px", color: "#e2e8f0" }}>
                    <span style={{ backgroundColor: "rgba(56, 189, 248, 0.1)", padding: "4px 8px", borderRadius: "4px", fontSize: "12px" }}>
                      {slo.requirementId}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px", color: "#f8fafc", fontWeight: 600 }}>{slo.service}</td>
                  <td style={{ padding: "14px 16px", fontFamily: "monospace", color: "#f1f5f9" }}>
                    {slo.metric} {slo.operator || ""} {slo.threshold != null ? slo.threshold : ""} {slo.unit || ""}
                  </td>
                  <td style={{ padding: "14px 16px", color: "#10b981", fontWeight: 600 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <Target className="w-3.5 h-3.5" />
                      {slo.target != null ? `${slo.target}%` : "No target defined"} {slo.window ? `(${slo.window})` : ""}
                    </div>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <StatusBadge status={slo.severity} size="sm" />
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <StatusBadge status={slo.status} size="sm" />
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "right" }}>
                    <button
                      onClick={() => onDeleteSLO(slo.sloId)}
                      style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", padding: "6px" }}
                      title="Delete SLO"
                    >
                      <Trash2 className="w-4 h-4 hover:text-red-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SLO Modal */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "#0f172a",
              border: "1px solid rgba(148, 163, 184, 0.3)",
              borderRadius: "10px",
              padding: "24px",
              width: "100%",
              maxWidth: "500px",
            }}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: "18px", color: "#f8fafc" }}>Create Technical SLO Target</h3>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "4px" }}>SLO ID</label>
                  <input
                    type="text"
                    required
                    value={formData.sloId || ""}
                    onChange={(e) => setFormData({ ...formData, sloId: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(148, 163, 184, 0.2)", borderRadius: "6px", color: "#f8fafc" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "4px" }}>Requirement</label>
                  <select
                    value={formData.requirementId || ""}
                    onChange={(e) => setFormData({ ...formData, requirementId: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(148, 163, 184, 0.2)", borderRadius: "6px", color: "#f8fafc" }}
                  >
                    {requirements.map((r) => (
                      <option key={r.requirementId} value={r.requirementId}>
                        {r.requirementId} - {r.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "4px" }}>Service</label>
                  <select
                    value={formData.service || "Checkout"}
                    onChange={(e) => setFormData({ ...formData, service: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(148, 163, 184, 0.2)", borderRadius: "6px", color: "#f8fafc" }}
                  >
                    <option value="Checkout">Checkout</option>
                    <option value="Payments">Payments</option>
                    <option value="Orders">Orders</option>
                    <option value="Authentication">Authentication</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "4px" }}>Metric</label>
                  <input
                    type="text"
                    value={formData.metric || "p95_latency"}
                    onChange={(e) => setFormData({ ...formData, metric: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(148, 163, 184, 0.2)", borderRadius: "6px", color: "#f8fafc" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "4px" }}>Threshold</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.threshold ?? 2.0}
                    onChange={(e) => setFormData({ ...formData, threshold: parseFloat(e.target.value) })}
                    style={{ width: "100%", padding: "8px 12px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(148, 163, 184, 0.2)", borderRadius: "6px", color: "#f8fafc" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "4px" }}>Availability Goal (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.target ?? 99.9}
                    onChange={(e) => setFormData({ ...formData, target: parseFloat(e.target.value) })}
                    style={{ width: "100%", padding: "8px 12px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(148, 163, 184, 0.2)", borderRadius: "6px", color: "#f8fafc" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{ padding: "8px 16px", backgroundColor: "transparent", border: "1px solid rgba(148, 163, 184, 0.3)", borderRadius: "6px", color: "#94a3b8", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: "8px 16px", backgroundColor: "#3b82f6", border: "none", borderRadius: "6px", color: "#ffffff", fontWeight: 600, cursor: "pointer" }}
                >
                  Save SLO Target
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

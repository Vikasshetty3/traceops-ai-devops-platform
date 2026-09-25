import React, { useState } from "react";
import type { Requirement } from "../../types";
import { StatusBadge } from "../common/StatusBadge";
import { SectionHeader, EmptyState } from "../common/FeedbackStates";
import { Plus, Trash2, Layers, Search } from "lucide-react";

interface RequirementsTabProps {
  requirements: Requirement[];
  onCreateRequirement: (data: Partial<Requirement>) => Promise<void>;
  onDeleteRequirement: (id: string) => Promise<void>;
}

export const RequirementsTab: React.FC<RequirementsTabProps> = ({
  requirements,
  onCreateRequirement,
  onDeleteRequirement,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [formData, setFormData] = useState<Partial<Requirement>>({
    requirementId: "REQ-001",
    title: "",
    description: "",
    service: "Checkout",
    metric: "p95_latency",
    threshold: 2.0,
    unit: "seconds",
    priority: "CRITICAL",
    status: "ACTIVE",
  });

  const filtered = requirements.filter(
    (r) =>
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.service.toLowerCase().includes(search.toLowerCase()) ||
      r.requirementId.toLowerCase().includes(search.toLowerCase())
  );

  const openNewModal = () => {
    setFormData({
      requirementId: `REQ-${Math.floor(1000 + Math.random() * 9000)}`,
      title: "",
      description: "",
      service: "Checkout",
      metric: "p95_latency",
      threshold: 2.0,
      unit: "seconds",
      priority: "CRITICAL",
      status: "ACTIVE",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCreateRequirement(formData);
    setShowModal(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <SectionHeader
        title="Business Software Requirements Registry"
        subtitle="SLA requirements mapped to measurable microservice technical contracts"
        action={
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <Search
                className="w-4 h-4"
                style={{ position: "absolute", left: "10px", top: "10px", color: "#64748b" }}
              />
              <input
                type="text"
                placeholder="Search requirements..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  padding: "8px 12px 8px 32px",
                  fontSize: "14px",
                  backgroundColor: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(148, 163, 184, 0.2)",
                  borderRadius: "6px",
                  color: "#f8fafc",
                  outline: "none",
                }}
              />
            </div>
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
              New Requirement
            </button>
          </div>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No requirements discovered"
          description="Create your first SLA requirement to bind microservices to verifiable SLO performance contracts."
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
              Add Requirement
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
                <th style={{ padding: "12px 16px" }}>Requirement ID</th>
                <th style={{ padding: "12px 16px" }}>Title & Description</th>
                <th style={{ padding: "12px 16px" }}>Service</th>
                <th style={{ padding: "12px 16px" }}>Metric Target</th>
                <th style={{ padding: "12px 16px" }}>Priority</th>
                <th style={{ padding: "12px 16px" }}>Status</th>
                <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((req) => (
                <tr key={req.requirementId} style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.1)" }}>
                  <td style={{ padding: "14px 16px", fontWeight: 600, color: "#38bdf8" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Layers className="w-4 h-4 text-sky-400" />
                      {req.requirementId}
                    </div>
                  </td>
                  <td style={{ padding: "14px 16px", maxWidth: "340px" }}>
                    <div style={{ fontWeight: 600, color: "#f8fafc" }}>{req.title}</div>
                    <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "2px" }}>{req.description}</div>
                  </td>
                  <td style={{ padding: "14px 16px", color: "#e2e8f0" }}>{req.service}</td>
                  <td style={{ padding: "14px 16px", fontWeight: 600, color: "#f1f5f9" }}>
                    {req.threshold != null ? (
                      <>
                        {req.metric || "Metric unspecified"} &lt; {req.threshold} {req.unit || ""}
                      </>
                    ) : (
                      "No threshold specified"
                    )}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <StatusBadge status={req.priority} size="sm" />
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <StatusBadge status={req.status} size="sm" />
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "right" }}>
                    <button
                      onClick={() => onDeleteRequirement(req.requirementId)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#64748b",
                        cursor: "pointer",
                        padding: "6px",
                      }}
                      title="Delete requirement"
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

      {/* Creation Modal */}
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
            <h3 style={{ margin: "0 0 16px 0", fontSize: "18px", color: "#f8fafc" }}>Create New SLA Requirement</h3>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "4px" }}>Requirement ID</label>
                <input
                  type="text"
                  required
                  value={formData.requirementId || ""}
                  onChange={(e) => setFormData({ ...formData, requirementId: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(148, 163, 184, 0.2)", borderRadius: "6px", color: "#f8fafc" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "4px" }}>Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Checkout Latency SLA"
                  value={formData.title || ""}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(148, 163, 184, 0.2)", borderRadius: "6px", color: "#f8fafc" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "4px" }}>Description</label>
                <textarea
                  rows={2}
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(148, 163, 184, 0.2)", borderRadius: "6px", color: "#f8fafc" }}
                />
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
                  <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "4px" }}>Priority</label>
                  <select
                    value={formData.priority || "CRITICAL"}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as Requirement["priority"] })}
                    style={{ width: "100%", padding: "8px 12px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(148, 163, 184, 0.2)", borderRadius: "6px", color: "#f8fafc" }}
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "4px" }}>Metric</label>
                  <input
                    type="text"
                    value={formData.metric || "p95_latency"}
                    onChange={(e) => setFormData({ ...formData, metric: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", backgroundColor: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(148, 163, 184, 0.2)", borderRadius: "6px", color: "#f8fafc" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "4px" }}>Max Threshold (s)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.threshold ?? 2.0}
                    onChange={(e) => setFormData({ ...formData, threshold: parseFloat(e.target.value) })}
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
                  Save Requirement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

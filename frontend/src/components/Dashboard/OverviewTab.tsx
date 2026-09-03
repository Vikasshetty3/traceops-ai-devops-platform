import React from "react";
import type {
  Requirement,
  SLO,
  Incident,
  DevOpsAction,
  ServiceTelemetry,
} from "../../types";
import { MetricCard } from "../common/MetricCard";
import { StatusBadge } from "../common/StatusBadge";
import { SectionHeader } from "../common/FeedbackStates";
import {
  ShieldAlert,
  Zap,
  CheckCircle2,
  Server,
  Layers,
  Flame,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface OverviewTabProps {
  requirements: Requirement[];
  slos: SLO[];
  incidents: Incident[];
  devopsActions: DevOpsAction[];
  telemetry: ServiceTelemetry[];
  onTriggerSpike: () => void;
  onNormalize: () => void;
  onNavigateTab: (tab: string) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  requirements,
  slos,
  incidents,
  devopsActions,
  telemetry,
  onTriggerSpike,
  onNormalize,
  onNavigateTab,
}) => {
  const openIncidents = incidents.filter((i) => i.status !== "RESOLVED");
  const executedActions = devopsActions.filter((a) => a.status === "EXECUTED");

  // Chart data formatting from live telemetry
  const chartData = telemetry.map((t) => ({
    name: t.service,
    latency: Number((t.p95Latency * 1000).toFixed(0)),
    cpu: t.cpuUsage,
    memory: t.memoryUsage,
    errors: Number((t.errorRate * 10).toFixed(1)),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* 1. Top Metrics Banner */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
        <MetricCard
          title="Total Requirements"
          value={requirements.length}
          subtitle="Governed under SLA"
          icon={<Layers className="w-5 h-5" />}
          color="indigo"
        />
        <MetricCard
          title="Active SLO Targets"
          value={slos.length}
          subtitle={`${slos.filter((s) => s.status === "ACTIVE").length} actively monitored`}
          icon={<Zap className="w-5 h-5" />}
          color="blue"
        />
        <MetricCard
          title="Open Incidents"
          value={openIncidents.length}
          subtitle={openIncidents.length > 0 ? "Requires SRE Triage" : "All services nominal"}
          icon={<ShieldAlert className="w-5 h-5" />}
          color={openIncidents.length > 0 ? "rose" : "emerald"}
          trend={openIncidents.length > 0 ? "down" : "up"}
          trendValue={openIncidents.length > 0 ? "BREACH" : "NOMINAL"}
        />
        <MetricCard
          title="Remediations Executed"
          value={executedActions.length}
          subtitle={`${executedActions.length} verified zero-downtime`}
          icon={<CheckCircle2 className="w-5 h-5" />}
          color="emerald"
        />
      </div>

      {/* 2. Service Telemetry Grid & Chaos Controls */}
      <div>
        <SectionHeader
          title="Live Microservice Telemetry & Infrastructure Health"
          subtitle="Real-time Prometheus scraping feed across target Kubernetes namespace"
          action={
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={onTriggerSpike}
                className="btn btn-danger"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  fontSize: "13px",
                  fontWeight: 600,
                  borderRadius: "6px",
                  backgroundColor: "rgba(239, 68, 68, 0.2)",
                  color: "#ef4444",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  cursor: "pointer",
                }}
              >
                <Flame className="w-4 h-4" />
                Inject Chaos Spike
              </button>
              <button
                onClick={onNormalize}
                className="btn btn-success"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  fontSize: "13px",
                  fontWeight: 600,
                  borderRadius: "6px",
                  backgroundColor: "rgba(16, 185, 129, 0.2)",
                  color: "#10b981",
                  border: "1px solid rgba(16, 185, 129, 0.4)",
                  cursor: "pointer",
                }}
              >
                <CheckCircle2 className="w-4 h-4" />
                Normalize Services
              </button>
            </div>
          }
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
          {telemetry.map((svc) => (
            <div
              key={svc.service}
              style={{
                borderRadius: "8px",
                padding: "16px 18px",
                background: "rgba(15, 23, 42, 0.65)",
                border: `1px solid ${
                  svc.status === "CRITICAL"
                    ? "rgba(239, 68, 68, 0.5)"
                    : svc.status === "DEGRADED"
                    ? "rgba(245, 158, 11, 0.5)"
                    : "rgba(148, 163, 184, 0.2)"
                }`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Server className="w-4 h-4" style={{ color: "#38bdf8" }} />
                  <span style={{ fontWeight: 700, fontSize: "16px", color: "#f8fafc" }}>{svc.service}</span>
                </div>
                <StatusBadge status={svc.status} size="sm" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "13px" }}>
                <div>
                  <div style={{ color: "#94a3b8" }}>p95 Latency</div>
                  <div style={{ fontSize: "17px", fontWeight: 700, color: svc.p95Latency > 2.0 ? "#ef4444" : "#f1f5f9" }}>
                    {(svc.p95Latency * 1000).toFixed(0)} ms
                  </div>
                </div>
                <div>
                  <div style={{ color: "#94a3b8" }}>CPU Utilization</div>
                  <div style={{ fontSize: "17px", fontWeight: 700, color: svc.cpuUsage > 85 ? "#ef4444" : "#f1f5f9" }}>
                    {svc.cpuUsage}%
                  </div>
                </div>
                <div>
                  <div style={{ color: "#94a3b8" }}>Memory Usage</div>
                  <div style={{ fontSize: "17px", fontWeight: 700, color: svc.memoryUsage > 85 ? "#ef4444" : "#f1f5f9" }}>
                    {svc.memoryUsage}%
                  </div>
                </div>
                <div>
                  <div style={{ color: "#94a3b8" }}>Error Rate</div>
                  <div style={{ fontSize: "17px", fontWeight: 700, color: svc.errorRate > 1.0 ? "#ef4444" : "#10b981" }}>
                    {svc.errorRate}%
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Performance Chart Comparison */}
      <div
        style={{
          borderRadius: "8px",
          padding: "20px",
          background: "rgba(15, 23, 42, 0.65)",
          border: "1px solid rgba(148, 163, 184, 0.2)",
        }}
      >
        <div style={{ marginBottom: "16px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#f8fafc" }}>
            Service Latency & Resource Utilization Profile
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#94a3b8" }}>
            Real-time multi-dimensional comparison across all registered microservice instances
          </p>
        </div>

        <div style={{ height: "240px", width: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
              <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderColor: "rgba(148, 163, 184, 0.3)",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              />
              <Area type="monotone" dataKey="latency" name="p95 Latency (ms)" stroke="#38bdf8" fill="url(#latencyGradient)" />
              <Area type="monotone" dataKey="cpu" name="CPU Usage (%)" stroke="#ef4444" fill="url(#cpuGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. Active Incident Triage Queue */}
      <div
        style={{
          borderRadius: "8px",
          padding: "20px",
          background: "rgba(15, 23, 42, 0.65)",
          border: "1px solid rgba(148, 163, 184, 0.2)",
        }}
      >
        <SectionHeader
          title="Active Incident Triage Stream"
          subtitle="Real-time violations detected by automated SLO evaluation engine"
          action={
            <button
              onClick={() => onNavigateTab("incidents")}
              style={{
                fontSize: "13px",
                color: "#38bdf8",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              View All Incidents →
            </button>
          }
        />

        {incidents.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}>
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" style={{ margin: "0 auto 8px auto", color: "#10b981" }} />
            <div>Zero open incidents. All service thresholds nominal.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.2)", color: "#94a3b8" }}>
                  <th style={{ padding: "10px 12px" }}>Incident ID</th>
                  <th style={{ padding: "10px 12px" }}>Service</th>
                  <th style={{ padding: "10px 12px" }}>Metric</th>
                  <th style={{ padding: "10px 12px" }}>Observed vs Threshold</th>
                  <th style={{ padding: "10px 12px" }}>Severity</th>
                  <th style={{ padding: "10px 12px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {incidents.slice(0, 5).map((inc) => (
                  <tr key={inc.incidentId} style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.1)" }}>
                    <td style={{ padding: "12px", fontWeight: 600, color: "#f8fafc" }}>{inc.incidentId}</td>
                    <td style={{ padding: "12px", color: "#e2e8f0" }}>{inc.service}</td>
                    <td style={{ padding: "12px", color: "#94a3b8" }}>{inc.metric}</td>
                    <td style={{ padding: "12px", fontWeight: 700, color: inc.actualValue > inc.threshold ? "#ef4444" : "#f1f5f9" }}>
                      {inc.actualValue}s (target: {inc.threshold}s)
                    </td>
                    <td style={{ padding: "12px" }}>
                      <StatusBadge status={inc.severity} size="sm" />
                    </td>
                    <td style={{ padding: "12px" }}>
                      <StatusBadge status={inc.status} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

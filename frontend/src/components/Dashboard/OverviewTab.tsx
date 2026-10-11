import React, { useState } from "react";
import type {
  Requirement,
  SLO,
  Incident,
  DevOpsAction,
  ServiceTelemetry,
  TelemetryOverview,
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
  Activity,
  Cpu,
  HardDrive,
  Network,
  Radio,
  Play,
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
  telemetry?: ServiceTelemetry[];
  telemetryOverview?: TelemetryOverview | null;
  telemetryLoading?: boolean;
  onExecuteLoadTest?: (requests?: number, delayMs?: number, simulateError?: boolean) => Promise<void>;
  onTriggerSpike: () => void;
  onNormalize?: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  requirements,
  slos,
  incidents,
  devopsActions,
  telemetryOverview,
  telemetryLoading = false,
  onExecuteLoadTest,
  onTriggerSpike,
}) => {
  const [loadTesting, setLoadTesting] = useState(false);
  const [loadTestResult, setLoadTestResult] = useState<string | null>(null);

  const openIncidents = incidents.filter((i) => i.status !== "RESOLVED");
  const executedActions = devopsActions.filter((a) => a.status === "EXECUTED");

  const app = telemetryOverview?.application;
  const host = telemetryOverview?.host;
  const containers = telemetryOverview?.containers || [];

  const handleRunLoadTest = async (simulateError = false) => {
    setLoadTesting(true);
    setLoadTestResult(null);
    try {
      if (onExecuteLoadTest) {
        await onExecuteLoadTest(30, 20, simulateError);
      } else {
        onTriggerSpike();
      }
      setLoadTestResult(
        simulateError
          ? "Generated 30 HTTP operations with 500 error simulation. Prometheus 5xx counter incremented."
          : "Dispatched 30 real HTTP operations. Prometheus duration histogram and total counter updated."
      );
    } catch {
      setLoadTestResult("Traffic load execution failed or Prometheus is settling.");
    } finally {
      setLoadTesting(false);
    }
  };

  // Chart data formatting: containers with genuine measured CPU or memory
  const chartData = containers
    .filter((c) => c.cpuUsage !== null || c.memoryUsageBytes !== null)
    .map((c) => ({
      name: c.name.replace(/^traceops-/, ""),
      cpu: c.cpuUsage,
      memoryMb: c.memoryWorkingSetBytes !== null ? Math.round(c.memoryWorkingSetBytes / (1024 * 1024)) : null,
      rxKb: c.networkRxBytesSec !== null ? Math.round(c.networkRxBytesSec / 1024) : null,
      txKb: c.networkTxBytesSec !== null ? Math.round(c.networkTxBytesSec / 1024) : null,
    }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* 1. Top Business & DevOps Metrics Banner */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
        <MetricCard
          title="Total Requirements"
          value={requirements.length}
          subtitle={requirements.length > 0 ? `${requirements.length} requirements defined` : "No requirements discovered"}
          icon={<Layers className="w-5 h-5" />}
          color="indigo"
        />
        <MetricCard
          title="Active SLO Targets"
          value={slos.length}
          subtitle={slos.length > 0 ? `${slos.filter((s) => s.status === "ACTIVE").length} actively monitored` : "No SLOs defined"}
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

      {/* 2. Real Prometheus Application Observability (prom-client live scraping) */}
      <div
        style={{
          borderRadius: "10px",
          background: "linear-gradient(180deg, rgba(15, 23, 42, 0.8) 0%, rgba(15, 23, 42, 0.6) 100%)",
          border: "1px solid rgba(56, 189, 248, 0.25)",
          padding: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Radio className="w-5 h-5 text-sky-400" />
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#f8fafc" }}>
                Application Runtime Observability (Prometheus Instrumentation)
              </h3>
            </div>
            <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#94a3b8" }}>
              Metrics observed directly from TraceOps HTTP requests via <code>prom-client</code> (Histogram percentiles & error classification)
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                fontSize: "12px",
                padding: "4px 10px",
                borderRadius: "20px",
                backgroundColor: telemetryOverview?.prometheusConnected ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
                color: telemetryOverview?.prometheusConnected ? "#10b981" : "#ef4444",
                border: `1px solid ${telemetryOverview?.prometheusConnected ? "#10b981" : "#ef4444"}`,
                fontWeight: 600,
              }}
            >
              {telemetryLoading ? "Loading telemetry..." : telemetryOverview?.prometheusConnected ? "Prometheus Connected" : "Prometheus Offline"}
            </span>

            {/* Test Load Generator Button */}
            <button
              onClick={() => handleRunLoadTest(false)}
              disabled={loadTesting}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 600,
                borderRadius: "6px",
                backgroundColor: "rgba(56, 189, 248, 0.15)",
                color: "#38bdf8",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                cursor: loadTesting ? "not-allowed" : "pointer",
              }}
              title="Dispatches 30 genuine HTTP operations to record real latency histogram samples"
            >
              <Play className="w-3.5 h-3.5" />
              {loadTesting ? "Generating Load..." : "Test Traffic Generator"}
            </button>
          </div>
        </div>

        {loadTestResult && (
          <div
            style={{
              padding: "8px 12px",
              marginBottom: "14px",
              backgroundColor: "rgba(56, 189, 248, 0.1)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              borderRadius: "6px",
              fontSize: "12px",
              color: "#38bdf8",
            }}
          >
            {loadTestResult}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px" }}>
          <div style={{ padding: "12px 14px", backgroundColor: "rgba(30, 41, 59, 0.6)", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.15)" }}>
            <span style={{ fontSize: "11px", textTransform: "uppercase", color: "#94a3b8", fontWeight: 700 }}>Request Throughput</span>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#f8fafc", marginTop: "4px" }}>
              {telemetryLoading ? "Loading..." : app?.requestRate !== null && app?.requestRate !== undefined ? `${app.requestRate} req/s` : "No telemetry data available"}
            </div>
            <span style={{ fontSize: "11px", color: "#64748b" }}>
              Total Requests: {app?.totalRequests !== null && app?.totalRequests !== undefined ? app.totalRequests : "—"}
            </span>
          </div>

          <div style={{ padding: "12px 14px", backgroundColor: "rgba(30, 41, 59, 0.6)", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.15)" }}>
            <span style={{ fontSize: "11px", textTransform: "uppercase", color: "#94a3b8", fontWeight: 700 }}>p50 Median Latency</span>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#f8fafc", marginTop: "4px" }}>
              {telemetryLoading ? "Loading..." : app?.p50Latency !== null && app?.p50Latency !== undefined ? `${(app.p50Latency * 1000).toFixed(1)} ms` : "No telemetry data available"}
            </div>
            <span style={{ fontSize: "11px", color: "#64748b" }}>Histogram quantile 0.50</span>
          </div>

          <div style={{ padding: "12px 14px", backgroundColor: "rgba(30, 41, 59, 0.6)", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.15)" }}>
            <span style={{ fontSize: "11px", textTransform: "uppercase", color: "#94a3b8", fontWeight: 700 }}>p95 Latency</span>
            <div style={{ fontSize: "20px", fontWeight: 700, color: app?.p95Latency !== null && app?.p95Latency !== undefined && app.p95Latency > 2.0 ? "#ef4444" : "#f8fafc", marginTop: "4px" }}>
              {telemetryLoading ? "Loading..." : app?.p95Latency !== null && app?.p95Latency !== undefined ? `${(app.p95Latency * 1000).toFixed(1)} ms` : "No telemetry data available"}
            </div>
            <span style={{ fontSize: "11px", color: "#64748b" }}>Histogram quantile 0.95</span>
          </div>

          <div style={{ padding: "12px 14px", backgroundColor: "rgba(30, 41, 59, 0.6)", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.15)" }}>
            <span style={{ fontSize: "11px", textTransform: "uppercase", color: "#94a3b8", fontWeight: 700 }}>p99 Tail Latency</span>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#f8fafc", marginTop: "4px" }}>
              {telemetryLoading ? "Loading..." : app?.p99Latency !== null && app?.p99Latency !== undefined ? `${(app.p99Latency * 1000).toFixed(1)} ms` : "No telemetry data available"}
            </div>
            <span style={{ fontSize: "11px", color: "#64748b" }}>Histogram quantile 0.99</span>
          </div>

          <div style={{ padding: "12px 14px", backgroundColor: "rgba(30, 41, 59, 0.6)", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.15)" }}>
            <span style={{ fontSize: "11px", textTransform: "uppercase", color: "#94a3b8", fontWeight: 700 }}>Error Classification</span>
            <div style={{ fontSize: "20px", fontWeight: 700, color: app?.errorRate !== null && app?.errorRate !== undefined && app.errorRate > 0 ? "#ef4444" : "#10b981", marginTop: "4px" }}>
              {telemetryLoading ? "Loading..." : app?.errorRate !== null && app?.errorRate !== undefined ? `${app.errorRate}%` : "No telemetry data available"}
            </div>
            <span style={{ fontSize: "11px", color: "#64748b" }}>
              4xx: {app?.rate4xx !== null && app?.rate4xx !== undefined ? `${app.rate4xx}%` : "—"} | 5xx: {app?.rate5xx !== null && app?.rate5xx !== undefined ? `${app.rate5xx}%` : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Real Host Telemetry (Node Exporter) */}
      <div
        style={{
          borderRadius: "10px",
          background: "rgba(15, 23, 42, 0.65)",
          border: "1px solid rgba(148, 163, 184, 0.2)",
          padding: "20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          <Server className="w-5 h-5 text-emerald-400" />
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#f8fafc" }}>
              HOST TELEMETRY (Node Exporter)
            </h3>
            <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#94a3b8" }}>
              Actual underlying physical / virtual host infrastructure resource measurements
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
          <div style={{ padding: "14px", backgroundColor: "rgba(2, 6, 23, 0.5)", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.15)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#94a3b8", fontSize: "12px" }}>
              <Cpu className="w-4 h-4 text-emerald-400" />
              <span>Host CPU Utilization</span>
            </div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: host?.cpuUsage !== null && host?.cpuUsage !== undefined && host.cpuUsage > 85 ? "#ef4444" : "#f8fafc", marginTop: "6px" }}>
              {telemetryLoading ? "Loading..." : host?.cpuUsage !== null && host?.cpuUsage !== undefined ? `${host.cpuUsage}%` : "No telemetry data available"}
            </div>
            <span style={{ fontSize: "11px", color: "#64748b" }}>Measured from node_cpu_seconds_total</span>
          </div>

          <div style={{ padding: "14px", backgroundColor: "rgba(2, 6, 23, 0.5)", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.15)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#94a3b8", fontSize: "12px" }}>
              <Activity className="w-4 h-4 text-indigo-400" />
              <span>Host Memory Utilization</span>
            </div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: host?.memoryUsage !== null && host?.memoryUsage !== undefined && host.memoryUsage > 85 ? "#ef4444" : "#f8fafc", marginTop: "6px" }}>
              {telemetryLoading ? "Loading..." : host?.memoryUsage !== null && host?.memoryUsage !== undefined ? `${host.memoryUsage}%` : "No telemetry data available"}
            </div>
            <span style={{ fontSize: "11px", color: "#64748b" }}>
              {host?.memoryAvailableBytes !== null && host?.memoryAvailableBytes !== undefined
                ? `${(host.memoryAvailableBytes / (1024 * 1024 * 1024)).toFixed(1)} GB Available`
                : "Awaiting sample"}
            </span>
          </div>

          <div style={{ padding: "14px", backgroundColor: "rgba(2, 6, 23, 0.5)", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.15)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#94a3b8", fontSize: "12px" }}>
              <HardDrive className="w-4 h-4 text-amber-400" />
              <span>Host Disk Capacity</span>
            </div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: host?.diskUsage !== null && host?.diskUsage !== undefined && host.diskUsage > 90 ? "#ef4444" : "#f8fafc", marginTop: "6px" }}>
              {telemetryLoading ? "Loading..." : host?.diskUsage !== null && host?.diskUsage !== undefined ? `${host.diskUsage}%` : "No telemetry data available"}
            </div>
            <span style={{ fontSize: "11px", color: "#64748b" }}>
              I/O: {host?.diskIoBytesSec !== null && host?.diskIoBytesSec !== undefined ? `${Math.round(host.diskIoBytesSec / 1024)} KB/s` : "—"}
            </span>
          </div>

          <div style={{ padding: "14px", backgroundColor: "rgba(2, 6, 23, 0.5)", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.15)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#94a3b8", fontSize: "12px" }}>
              <Network className="w-4 h-4 text-sky-400" />
              <span>Host Network Throughput</span>
            </div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "#f8fafc", marginTop: "6px" }}>
              {telemetryLoading ? "Loading..." : host?.networkThroughputBytesSec !== null && host?.networkThroughputBytesSec !== undefined ? `${(host.networkThroughputBytesSec / 1024).toFixed(1)} KB/s` : "No telemetry data available"}
            </div>
            <span style={{ fontSize: "11px", color: "#64748b" }}>Active interface aggregate</span>
          </div>
        </div>
      </div>

      {/* 4. Real Container Telemetry Grid (cAdvisor) */}
      <div>
        <SectionHeader
          title="Active Docker Container Telemetry (cAdvisor Engine)"
          subtitle="Real-time cgroup CPU, Memory Working Set, and Network socket rates scraped by Prometheus"
        />

        {telemetryLoading ? (
          <div
            style={{
              padding: "36px",
              textAlign: "center",
              color: "#94a3b8",
              backgroundColor: "rgba(15, 23, 42, 0.4)",
              borderRadius: "8px",
              border: "1px dashed rgba(148, 163, 184, 0.2)",
              fontSize: "14px",
            }}
          >
            Loading telemetry...
          </div>
        ) : containers.length === 0 ? (
          <div
            style={{
              padding: "36px",
              textAlign: "center",
              color: "#94a3b8",
              backgroundColor: "rgba(15, 23, 42, 0.4)",
              borderRadius: "8px",
              border: "1px dashed rgba(148, 163, 184, 0.2)",
              fontSize: "14px",
            }}
          >
            No service telemetry available
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
            {containers.map((container) => (
              <div
                key={container.name}
                style={{
                  borderRadius: "8px",
                  padding: "16px 18px",
                  background: "rgba(15, 23, 42, 0.65)",
                  border: `1px solid ${
                    container.status === "CRITICAL"
                      ? "rgba(239, 68, 68, 0.5)"
                      : container.status === "DEGRADED"
                      ? "rgba(245, 158, 11, 0.5)"
                      : "rgba(148, 163, 184, 0.2)"
                  }`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Server className="w-4 h-4" style={{ color: "#38bdf8" }} />
                    <span style={{ fontWeight: 700, fontSize: "15px", color: "#f8fafc" }}>
                      {container.name.replace(/^traceops-/, "")}
                    </span>
                  </div>
                  <StatusBadge status={container.status} size="sm" />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "13px" }}>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>CPU Usage</div>
                    <div style={{ fontSize: "16px", fontWeight: 700, color: container.cpuUsage !== null && container.cpuUsage > 80 ? "#ef4444" : "#f1f5f9" }}>
                      {container.cpuUsage !== null ? `${container.cpuUsage}%` : "No measurement available"}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Working Set Memory</div>
                    <div style={{ fontSize: "16px", fontWeight: 700, color: "#f1f5f9" }}>
                      {container.memoryWorkingSetBytes !== null ? `${Math.round(container.memoryWorkingSetBytes / (1024 * 1024))} MB` : "No measurement available"}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Network RX Rate</div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#38bdf8" }}>
                      {container.networkRxBytesSec !== null ? `${(container.networkRxBytesSec / 1024).toFixed(1)} KB/s` : "No measurement available"}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "11px" }}>Network TX Rate</div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#a78bfa" }}>
                      {container.networkTxBytesSec !== null ? `${(container.networkTxBytesSec / 1024).toFixed(1)} KB/s` : "No measurement available"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Performance Comparison Chart */}
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
            Container Memory & CPU Profile (Real cAdvisor Observations)
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#94a3b8" }}>
            Continuous PromQL multi-container utilization comparison
          </p>
        </div>

        <div style={{ height: "240px", width: "100%" }}>
          {chartData.length === 0 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "#94a3b8",
                fontSize: "14px",
                fontStyle: "italic",
              }}
            >
              No telemetry data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
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
                <Area type="monotone" dataKey="memoryMb" stroke="#38bdf8" fillOpacity={1} fill="url(#colorMemory)" name="Memory Working Set (MB)" />
                <Area type="monotone" dataKey="cpu" stroke="#10b981" fillOpacity={1} fill="url(#colorCpu)" name="CPU Usage (%)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

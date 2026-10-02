import { getPrometheusMetricsText } from "./telemetryInstrumentation";
import { PrometheusQueryService } from "./prometheusQueryService";

export interface ServiceMetricSnapshot {
  service: string;
  status: "HEALTHY" | "DEGRADED" | "CRITICAL";
  p95Latency: number | null; // in seconds
  cpuUsage: number | null; // in %
  memoryUsage: number | null; // in %
  errorRate: number | null; // in %
  requestRate: number | null; // req/sec
  deploymentChanged?: boolean;
  lastUpdated: Date;
}

export class MetricsService {
  /**
   * Fetches real live service snapshots derived from Prometheus cAdvisor & application instrumentation.
   * If Prometheus has no active data yet, returns an empty array.
   */
  public static async getMetricsAsync(): Promise<ServiceMetricSnapshot[]> {
    try {
      const overview = await PrometheusQueryService.getOverviewTelemetry();
      if (!overview.prometheusConnected || overview.containers.length === 0) {
        return [];
      }

      return overview.containers.map((c) => ({
        service: c.name.replace(/^traceops-/, ""),
        status: c.status === "RUNNING" ? "HEALTHY" : c.status,
        p95Latency: overview.application.p95Latency,
        cpuUsage: c.cpuUsage,
        memoryUsage: c.memoryUsageBytes != null ? Number(((c.memoryUsageBytes / (1024 * 1024 * 1024)) * 100).toFixed(1)) : null,
        errorRate: overview.application.errorRate,
        requestRate: overview.application.requestRate,
        lastUpdated: new Date(overview.timestamp),
      }));
    } catch {
      return [];
    }
  }

  public static async getAllServiceMetrics(): Promise<ServiceMetricSnapshot[]> {
    return this.getMetricsAsync();
  }

  public static async getMetrics(): Promise<ServiceMetricSnapshot[]> {
    return this.getMetricsAsync();
  }

  public static async getServiceMetric(service: string): Promise<ServiceMetricSnapshot | undefined> {
    const list = await this.getMetricsAsync();
    return list.find((s) => s.service.toLowerCase() === service.toLowerCase());
  }

  /**
   * Replaced: Returns Prometheus exposition text from real prom-client instrumentation.
   */
  public static async toPrometheusFormat(): Promise<string> {
    return getPrometheusMetricsText();
  }
}

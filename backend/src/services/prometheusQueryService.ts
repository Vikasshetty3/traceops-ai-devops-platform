export interface ApplicationTelemetry {
  requestRate: number | null; // requests/sec
  p50Latency: number | null; // seconds
  p95Latency: number | null; // seconds
  p99Latency: number | null; // seconds
  errorRate: number | null; // %
  rate4xx: number | null; // %
  rate5xx: number | null; // %
  activeRequests: number | null;
  totalRequests: number | null;
}

export interface HostTelemetry {
  cpuUsage: number | null; // %
  memoryUsage: number | null; // %
  memoryTotalBytes: number | null;
  memoryAvailableBytes: number | null;
  diskUsage: number | null; // %
  diskIoBytesSec: number | null;
  networkThroughputBytesSec: number | null;
}

export interface ContainerTelemetry {
  name: string;
  id?: string;
  cpuUsage: number | null; // %
  memoryUsageBytes: number | null;
  memoryWorkingSetBytes: number | null;
  networkRxBytesSec: number | null;
  networkTxBytesSec: number | null;
  status: "HEALTHY" | "DEGRADED" | "CRITICAL" | "RUNNING";
}

export interface TelemetryOverview {
  timestamp: string;
  prometheusConnected: boolean;
  application: ApplicationTelemetry;
  host: HostTelemetry;
  containers: ContainerTelemetry[];
}

import fs from "fs";

export class PrometheusQueryService {
  private static getPrometheusBaseUrl(): string {
    if (process.env.PROMETHEUS_URL) {
      return process.env.PROMETHEUS_URL;
    }
    if (process.platform === "win32" || !fs.existsSync("/.dockerenv")) {
      return "http://localhost:9090";
    }
    return "http://prometheus:9090";
  }

  /**
   * Performs an instant PromQL query against the Prometheus HTTP API.
   * Returns null if Prometheus is unreachable or query errors.
   */
  public static async queryInstant(
    promQl: string
  ): Promise<Array<{ metric: Record<string, string>; value: [number, string] }> | null> {
    const baseUrl = this.getPrometheusBaseUrl();
    const url = `${baseUrl}/api/v1/query?query=${encodeURIComponent(promQl)}`;

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(4000),
      });

      if (!response.ok) {
        return null;
      }

      const json = await response.json();
      if (json.status !== "success" || !json.data || !Array.isArray(json.data.result)) {
        return null;
      }

      return json.data.result;
    } catch {
      return null;
    }
  }

  /**
   * Extracts single scalar/vector numeric result from PromQL instant query.
   * STRICT: Returns null if missing, NaN, or non-finite.
   * Returns actual 0 if value is genuinely 0.
   */
  public static async querySingleValue(promQl: string): Promise<number | null> {
    const result = await this.queryInstant(promQl);
    if (!result || result.length === 0) {
      return null;
    }

    const rawStr = result[0]?.value?.[1];
    if (rawStr === undefined || rawStr === null || rawStr === "") {
      return null;
    }

    const parsed = Number(rawStr);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
      return null;
    }

    return parsed;
  }

  /**
   * Evaluates a PromQL expression for SLO continuous monitoring.
   * STRICT: Distinguishes measured zero from missing series and network unreachability.
   * Real Zero = SUCCESS (value: 0)
   * Missing series / NaN = NO_DATA
   * Prometheus connection error / timeout = UNAVAILABLE
   */
  public static async queryPrometheusSLO(
    promQl: string
  ): Promise<
    | { status: "SUCCESS"; value: number }
    | { status: "NO_DATA" }
    | { status: "UNAVAILABLE"; error: string }
  > {
    const baseUrl = this.getPrometheusBaseUrl();
    const url = `${baseUrl}/api/v1/query?query=${encodeURIComponent(promQl)}`;

    let response: any;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(4000),
      });
    } catch (err: any) {
      return {
        status: "UNAVAILABLE",
        error: err.message || "Failed to reach Prometheus endpoint",
      };
    }

    if (!response.ok) {
      return {
        status: "UNAVAILABLE",
        error: `Prometheus returned HTTP ${response.status}: ${response.statusText}`,
      };
    }

    let json: any;
    try {
      json = await response.json();
    } catch {
      return {
        status: "UNAVAILABLE",
        error: "Failed to parse Prometheus JSON response",
      };
    }

    if (json.status !== "success" || !json.data || !Array.isArray(json.data.result)) {
      return {
        status: "UNAVAILABLE",
        error: json.error || "Unexpected Prometheus response structure",
      };
    }

    if (json.data.result.length === 0) {
      return { status: "NO_DATA" };
    }

    const rawStr = json.data.result[0]?.value?.[1];
    if (rawStr === undefined || rawStr === null || rawStr === "") {
      return { status: "NO_DATA" };
    }

    const parsed = Number(rawStr);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
      return { status: "NO_DATA" };
    }

    return { status: "SUCCESS", value: parsed };
  }

  /**
   * Fetches the complete real telemetry overview across host, containers, and application.
   */
  public static async getOverviewTelemetry(): Promise<TelemetryOverview> {
    const timestamp = new Date().toISOString();

    // Check Prometheus reachability via target metadata or up query
    const upCheck = await this.queryInstant("up");
    const prometheusConnected = upCheck !== null;

    if (!prometheusConnected) {
      return {
        timestamp,
        prometheusConnected: false,
        application: {
          requestRate: null,
          p50Latency: null,
          p95Latency: null,
          p99Latency: null,
          errorRate: null,
          rate4xx: null,
          rate5xx: null,
          activeRequests: null,
          totalRequests: null,
        },
        host: {
          cpuUsage: null,
          memoryUsage: null,
          memoryTotalBytes: null,
          memoryAvailableBytes: null,
          diskUsage: null,
          diskIoBytesSec: null,
          networkThroughputBytesSec: null,
        },
        containers: [],
      };
    }

    // 1. Application Traffic & Latency PromQL Queries (from prom-client)
    const [
      totalReqs,
      reqRate,
      p50,
      p95,
      p99,
      rate4xx,
      rate5xx,
      inFlight,
    ] = await Promise.all([
      this.querySingleValue("sum(http_requests_total)"),
      this.querySingleValue("sum(rate(http_requests_total[1m]))"),
      this.querySingleValue("histogram_quantile(0.50, sum by (le) (rate(http_request_duration_seconds_bucket[1m])))"),
      this.querySingleValue("histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[1m])))"),
      this.querySingleValue("histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket[1m])))"),
      this.querySingleValue("(sum(rate(http_requests_total{status_class=\"4xx\"}[1m])) / sum(rate(http_requests_total[1m]))) * 100"),
      this.querySingleValue("(sum(rate(http_requests_total{status_class=\"5xx\"}[1m])) / sum(rate(http_requests_total[1m]))) * 100"),
      this.querySingleValue("sum(http_requests_in_flight)"),
    ]);

    // Calculate composite error rate: if 4xx and 5xx rates are null because no traffic, errorRate is null.
    // If request rate is observed and errors are 0, errorRate is genuinely 0.
    let compositeErrorRate: number | null = null;
    if (rate4xx !== null || rate5xx !== null) {
      compositeErrorRate = (rate4xx || 0) + (rate5xx || 0);
    } else if (reqRate !== null && reqRate > 0) {
      compositeErrorRate = 0;
    }

    const application: ApplicationTelemetry = {
      totalRequests: totalReqs !== null ? Math.round(totalReqs) : null,
      requestRate: reqRate !== null ? Number(reqRate.toFixed(2)) : null,
      p50Latency: p50 !== null ? Number(p50.toFixed(4)) : null,
      p95Latency: p95 !== null ? Number(p95.toFixed(4)) : null,
      p99Latency: p99 !== null ? Number(p99.toFixed(4)) : null,
      errorRate: compositeErrorRate !== null ? Number(compositeErrorRate.toFixed(2)) : null,
      rate4xx: rate4xx !== null ? Number(rate4xx.toFixed(2)) : null,
      rate5xx: rate5xx !== null ? Number(rate5xx.toFixed(2)) : null,
      activeRequests: inFlight !== null ? Math.max(0, Math.round(inFlight)) : null,
    };

    // 2. Host Metrics PromQL Queries (from Node Exporter)
    const [
      hostCpu,
      hostMemAvail,
      hostMemTotal,
      hostDiskFree,
      hostDiskTotal,
      hostDiskIo,
      hostNetRate,
    ] = await Promise.all([
      this.querySingleValue("100 - (avg(rate(node_cpu_seconds_total{mode=\"idle\"}[1m])) * 100)"),
      this.querySingleValue("node_memory_MemAvailable_bytes"),
      this.querySingleValue("node_memory_MemTotal_bytes"),
      this.querySingleValue("node_filesystem_avail_bytes{mountpoint=\"/rootfs\"} or node_filesystem_avail_bytes{mountpoint=\"/\"}"),
      this.querySingleValue("node_filesystem_size_bytes{mountpoint=\"/rootfs\"} or node_filesystem_size_bytes{mountpoint=\"/\"}"),
      this.querySingleValue("sum(rate(node_disk_read_bytes_total[1m])) + sum(rate(node_disk_written_bytes_total[1m]))"),
      this.querySingleValue("sum(rate(node_network_receive_bytes_total{device!~\"lo|veth.*|docker.*|br-.*\"}[1m])) + sum(rate(node_network_transmit_bytes_total{device!~\"lo|veth.*|docker.*|br-.*\"}[1m]))"),
    ]);

    let hostMemUsagePercent: number | null = null;
    if (hostMemAvail !== null && hostMemTotal !== null && hostMemTotal > 0) {
      hostMemUsagePercent = Number(((1 - hostMemAvail / hostMemTotal) * 100).toFixed(1));
    }

    let hostDiskUsagePercent: number | null = null;
    if (hostDiskFree !== null && hostDiskTotal !== null && hostDiskTotal > 0) {
      hostDiskUsagePercent = Number(((1 - hostDiskFree / hostDiskTotal) * 100).toFixed(1));
    }

    const host: HostTelemetry = {
      cpuUsage: hostCpu !== null ? Number(hostCpu.toFixed(1)) : null,
      memoryUsage: hostMemUsagePercent,
      memoryTotalBytes: hostMemTotal !== null ? Math.round(hostMemTotal) : null,
      memoryAvailableBytes: hostMemAvail !== null ? Math.round(hostMemAvail) : null,
      diskUsage: hostDiskUsagePercent,
      diskIoBytesSec: hostDiskIo !== null ? Math.round(hostDiskIo) : null,
      networkThroughputBytesSec: hostNetRate !== null ? Math.round(hostNetRate) : null,
    };

    // 3. Container Metrics PromQL Queries (from cAdvisor)
    const [
      containerCpuList,
      containerMemUsageList,
      containerWorkingSetList,
      containerRxList,
      containerTxList,
    ] = await Promise.all([
      this.queryInstant("sum by (name, id) (rate(container_cpu_usage_seconds_total[1m])) * 100"),
      this.queryInstant("sum by (name, id) (container_memory_usage_bytes)"),
      this.queryInstant("sum by (name, id) (container_memory_working_set_bytes)"),
      this.queryInstant("sum by (name, id) (rate(container_network_receive_bytes_total[1m]))"),
      this.queryInstant("sum by (name, id) (rate(container_network_transmit_bytes_total[1m]))"),
    ]);

    // Build container telemetry map indexed by container name
    const containerMap = new Map<string, ContainerTelemetry>();

    const parseMetricsList = (
      list: Array<{ metric: Record<string, string>; value: [number, string] }> | null,
      field: "cpu" | "mem" | "ws" | "rx" | "tx"
    ) => {
      if (!list) return;
      for (const item of list) {
        const rawName = item.metric?.name || item.metric?.id;
        if (!rawName || rawName === "/" || rawName === "/kubepods" || rawName === "/podruntime" || rawName === "/procd-paused") continue;
        const name = rawName.startsWith("/") ? rawName.slice(1) : rawName;

        if (!containerMap.has(name)) {
          containerMap.set(name, {
            name,
            cpuUsage: null,
            memoryUsageBytes: null,
            memoryWorkingSetBytes: null,
            networkRxBytesSec: null,
            networkTxBytesSec: null,
            status: "HEALTHY",
          });
        }

        const entry = containerMap.get(name)!;
        const val = Number(item.value?.[1]);
        if (!Number.isFinite(val) || Number.isNaN(val)) continue;

        if (field === "cpu") entry.cpuUsage = Number(val.toFixed(2));
        if (field === "mem") entry.memoryUsageBytes = Math.round(val);
        if (field === "ws") entry.memoryWorkingSetBytes = Math.round(val);
        if (field === "rx") entry.networkRxBytesSec = Math.round(val);
        if (field === "tx") entry.networkTxBytesSec = Math.round(val);
      }
    };

    parseMetricsList(containerCpuList, "cpu");
    parseMetricsList(containerMemUsageList, "mem");
    parseMetricsList(containerWorkingSetList, "ws");
    parseMetricsList(containerRxList, "rx");
    parseMetricsList(containerTxList, "tx");

    // Assign health status based on real thresholds
    for (const c of containerMap.values()) {
      if ((c.cpuUsage !== null && c.cpuUsage > 90) || (c.memoryWorkingSetBytes !== null && c.memoryWorkingSetBytes > 1024 * 1024 * 1024)) {
        c.status = "CRITICAL";
      } else if ((c.cpuUsage !== null && c.cpuUsage > 75) || (c.memoryWorkingSetBytes !== null && c.memoryWorkingSetBytes > 512 * 1024 * 1024)) {
        c.status = "DEGRADED";
      } else {
        c.status = "HEALTHY";
      }
    }

    const containers = Array.from(containerMap.values());

    return {
      timestamp,
      prometheusConnected,
      application,
      host,
      containers,
    };
  }
}

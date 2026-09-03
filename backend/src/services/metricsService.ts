export interface ServiceMetricSnapshot {
  service: string;
  status: "HEALTHY" | "DEGRADED" | "CRITICAL";
  p95Latency: number; // in seconds
  cpuUsage: number; // in %
  memoryUsage: number; // in %
  errorRate: number; // in %
  requestRate: number; // req/sec
  deploymentChanged: boolean;
  lastUpdated: Date;
}

const serviceTelemetry: Record<string, ServiceMetricSnapshot> = {
  Checkout: {
    service: "Checkout",
    status: "DEGRADED",
    p95Latency: 2.8,
    cpuUsage: 92,
    memoryUsage: 60,
    errorRate: 2.0,
    requestRate: 450,
    deploymentChanged: false,
    lastUpdated: new Date(),
  },
  Payments: {
    service: "Payments",
    status: "HEALTHY",
    p95Latency: 0.18,
    cpuUsage: 34,
    memoryUsage: 45,
    errorRate: 0.02,
    requestRate: 320,
    deploymentChanged: false,
    lastUpdated: new Date(),
  },
  Orders: {
    service: "Orders",
    status: "HEALTHY",
    p95Latency: 0.22,
    cpuUsage: 48,
    memoryUsage: 52,
    errorRate: 0.05,
    requestRate: 280,
    deploymentChanged: false,
    lastUpdated: new Date(),
  },
  Authentication: {
    service: "Authentication",
    status: "HEALTHY",
    p95Latency: 0.09,
    cpuUsage: 28,
    memoryUsage: 38,
    errorRate: 0.0,
    requestRate: 600,
    deploymentChanged: false,
    lastUpdated: new Date(),
  },
};

export class MetricsService {
  public static getAllServiceMetrics(): ServiceMetricSnapshot[] {
    return Object.values(serviceTelemetry);
  }

  public static getMetrics(): ServiceMetricSnapshot[] {
    return this.getAllServiceMetrics();
  }

  public static getServiceMetrics(service: string): ServiceMetricSnapshot | undefined {
    return serviceTelemetry[service];
  }

  public static getServiceMetric(service: string): ServiceMetricSnapshot | undefined {
    return serviceTelemetry[service];
  }

  public static updateServiceMetrics(
    service: string,
    updates: Partial<ServiceMetricSnapshot>
  ): ServiceMetricSnapshot {
    const existing = serviceTelemetry[service] || {
      service,
      status: "HEALTHY",
      p95Latency: 0.5,
      cpuUsage: 50,
      memoryUsage: 50,
      errorRate: 0.1,
      requestRate: 100,
      deploymentChanged: false,
      lastUpdated: new Date(),
    };

    serviceTelemetry[service] = {
      ...existing,
      ...updates,
      lastUpdated: new Date(),
    };

    return serviceTelemetry[service];
  }

  public static triggerSpike(service = "Checkout"): ServiceMetricSnapshot {
    return this.updateServiceMetrics(service, {
      status: "DEGRADED",
      p95Latency: 2.85,
      cpuUsage: 94,
      memoryUsage: 65,
      errorRate: 2.4,
      deploymentChanged: false,
    });
  }

  public static simulateSpike(service = "Checkout"): ServiceMetricSnapshot {
    return this.triggerSpike(service);
  }

  public static normalizeService(service = "Checkout"): ServiceMetricSnapshot {
    return this.updateServiceMetrics(service, {
      status: "HEALTHY",
      p95Latency: 0.85,
      cpuUsage: 45,
      memoryUsage: 48,
      errorRate: 0.02,
      deploymentChanged: false,
    });
  }

  public static normalize(service = "Checkout"): ServiceMetricSnapshot {
    return this.normalizeService(service);
  }

  public static toPrometheusFormat(): string {
    const metrics = this.getAllServiceMetrics();
    const lines: string[] = [
      "# HELP http_request_duration_seconds p95 latency in seconds",
      "# TYPE http_request_duration_seconds gauge",
    ];

    for (const m of metrics) {
      lines.push(
        `http_request_duration_seconds{service="${m.service}"} ${m.p95Latency}`
      );
    }

    lines.push("# HELP service_cpu_utilization_percent CPU utilization percentage");
    lines.push("# TYPE service_cpu_utilization_percent gauge");
    for (const m of metrics) {
      lines.push(
        `service_cpu_utilization_percent{service="${m.service}"} ${m.cpuUsage}`
      );
    }

    lines.push("# HELP service_error_rate_percent Service error rate percentage");
    lines.push("# TYPE service_error_rate_percent gauge");
    for (const m of metrics) {
      lines.push(
        `service_error_rate_percent{service="${m.service}"} ${m.errorRate}`
      );
    }

    return lines.join("\n") + "\n";
  }
}

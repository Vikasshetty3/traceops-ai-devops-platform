import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from "prom-client";
import { Request, Response, NextFunction } from "express";

// Create a dedicated Prometheus Registry for TraceOps
export const registry = new Registry();

// Collect real default process and Node.js runtime metrics
collectDefaultMetrics({
  register: registry,
  prefix: "traceops_",
});

// Real HTTP Request Counter
export const httpRequestCounter = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests processed by the TraceOps platform",
  labelNames: ["method", "route", "status_code", "status_class"],
  registers: [registry],
});

// Real HTTP Request Duration Histogram
export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds across percentiles p50, p95, p99",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

// Real Active Requests In Flight Gauge
export const httpRequestsInFlight = new Gauge({
  name: "http_requests_in_flight",
  help: "Number of active HTTP requests currently executing",
  labelNames: ["method", "route"],
  registers: [registry],
});

// Phase 5.3 Batch C2: Deployment Traffic Weight Gauge
export const deploymentTrafficWeightGauge = new Gauge({
  name: "traceops_deployment_traffic_weight",
  help: "Current traffic percentage assigned to container",
  labelNames: ["service", "version", "stage"],
  registers: [registry],
});

/**
 * Normalizes HTTP route paths to avoid high-cardinality Prometheus labels.
 * Strips dynamic project IDs, requirement IDs, SLO IDs, repair IDs, and Mongo ObjectIds.
 */
export function normalizeRoute(rawPath: string): string {
  if (!rawPath || rawPath === "/") return "/";

  let normalized = rawPath.split("?")[0].replace(/\/+$/, "") || "/";

  // Replace standard ID patterns
  normalized = normalized
    .replace(/[0-9a-fA-F]{24}/g, ":id")
    .replace(/PROJ-[A-Za-z0-9_-]+/gi, ":projectId")
    .replace(/REQ-[A-Za-z0-9_-]+/gi, ":requirementId")
    .replace(/SLO-[A-Za-z0-9_-]+/gi, ":sloId")
    .replace(/INC-[A-Za-z0-9_-]+/gi, ":incidentId")
    .replace(/RCA-[A-Za-z0-9_-]+/gi, ":rcaId")
    .replace(/ACT-[A-Za-z0-9_-]+/gi, ":actionId")
    .replace(/EXP-[A-Za-z0-9_-]+/gi, ":experimentId")
    .replace(/ISS-[A-Za-z0-9_-]+/gi, ":issueId")
    .replace(/REP-[A-Za-z0-9_-]+/gi, ":repairId")
    .replace(/DEP-[A-Za-z0-9_-]+/gi, ":deploymentId")
    .replace(/VER-[A-Za-z0-9_-]+/gi, ":verificationId");

  return normalized || "/";
}

/**
 * Express middleware to instrument incoming requests with real latency and throughput telemetry.
 */
export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // If the path is /metrics, do not track to avoid self-scraping telemetry distortion
  if (req.path === "/metrics" || req.path === "/api/metrics/prometheus") {
    next();
    return;
  }

  const start = process.hrtime();
  const method = req.method;
  const route = normalizeRoute(req.baseUrl ? `${req.baseUrl}${req.path}` : req.path);

  httpRequestsInFlight.inc({ method, route });

  res.on("finish", () => {
    const diff = process.hrtime(start);
    const durationSeconds = diff[0] + diff[1] / 1e9;
    const statusCode = String(res.statusCode);
    const statusClass = `${Math.floor(res.statusCode / 100)}xx`;

    httpRequestCounter.inc({
      method,
      route,
      status_code: statusCode,
      status_class: statusClass,
    });

    httpRequestDuration.observe(
      {
        method,
        route,
        status_code: statusCode,
      },
      durationSeconds
    );

    httpRequestsInFlight.dec({ method, route });
  });

  next();
}

/**
 * Returns formatted Prometheus exposition text.
 */
export async function getPrometheusMetricsText(): Promise<string> {
  return registry.metrics();
}

/**
 * Returns the Prometheus content type header string.
 */
export function getMetricsContentType(): string {
  return registry.contentType;
}

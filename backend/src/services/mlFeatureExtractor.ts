/**
 * ML Feature Extraction Service - Phase 3 Real-Telemetry Pipeline
 *
 * Sourcing Hierarchy:
 * 1. Incident Telemetry Evidence Snapshot (incident.telemetryEvidence)
 * 2. Incident Metrics Snapshot (incident.metrics)
 * 3. Live Prometheus Query (via PrometheusQueryService) if uncaptured
 *
 * STRICT DATA INTEGRITY RULES:
 * - REAL ZERO = 0 (preserved as valid measured number)
 * - MISSING DATA = null (strictly preserved; if a mandatory feature is null, returns INSUFFICIENT_TELEMETRY)
 * - NO DEFAULT SERVICE ("Checkout" is prohibited)
 * - NO DEFAULT REQUIREMENT ("REQ-001" is prohibited)
 * - NO HEURISTIC/FABRICATED FORMULAS
 */

import { Incident, IIncident } from "../models/Incident";
import { PrometheusQueryService } from "./prometheusQueryService";

export interface FeatureProvenance {
  source: string;
  promQl: string;
  unit: string;
  value: number;
  timestamp: string;
}

export interface ExtractedMLFeatures {
  status: "READY" | "INSUFFICIENT_TELEMETRY" | "ERROR";
  mode: "PRODUCTION" | "TEST";
  incidentId?: string;
  sloId?: string;
  requirementId: string | null;
  service: string;
  featureTimestamp: string;
  missingFeatures?: string[];
  error?: string;
  features?: {
    cpuUsage: number;
    memoryUsage: number;
    p95Latency: number;
    errorRate: number;
    requestRate: number;
    deploymentChanged: number;
  };
  featureSources?: Record<string, FeatureProvenance>;
}

export class MLFeatureExtractor {
  /**
   * Extracts verified real telemetry features for an active or historical incident.
   */
  public static async extractForIncident(
    incidentId: string
  ): Promise<ExtractedMLFeatures> {
    const incident: IIncident | null = await Incident.findOne({ incidentId });

    if (!incident) {
      return {
        status: "ERROR",
        mode: "PRODUCTION",
        incidentId,
        requirementId: null,
        service: "",
        featureTimestamp: new Date().toISOString(),
        error: `Incident not found: ${incidentId}`,
      };
    }

    // Rule 5: NO DEFAULT SERVICE. Must come from incident.
    const service = (incident.service || "").trim();
    if (!service) {
      return {
        status: "ERROR",
        mode: "PRODUCTION",
        incidentId: incident.incidentId,
        sloId: incident.sloId,
        requirementId: null,
        service: "",
        featureTimestamp: new Date().toISOString(),
        error: `Service is unavailable for incident ${incidentId}. No default service is permitted.`,
      };
    }

    // Rule 6: NO DEFAULT REQUIREMENT. Genuine requirement or null.
    const requirementId =
      incident.requirementId &&
      incident.requirementId !== "UNLINKED" &&
      incident.requirementId !== "undefined"
        ? incident.requirementId
        : null;

    const featureTimestamp = incident.evaluatedAt
      ? incident.evaluatedAt.toISOString()
      : incident.createdAt
      ? incident.createdAt.toISOString()
      : new Date().toISOString();

    const overview = incident.telemetryEvidence?.overview;
    const appTelem = overview?.application;
    const hostTelem = overview?.host;

    // Feature values: strictly preserve real zero (0 !== null)
    let cpuUsage: number | null = null;
    let memoryUsage: number | null = null;
    let p95Latency: number | null = null;
    let errorRate: number | null = null;
    let requestRate: number | null = null;
    const deploymentChanged = incident.metrics?.deploymentChanged ? 1 : 0;

    // 1. Resolve cpuUsage
    if (hostTelem?.cpuUsage !== undefined && hostTelem?.cpuUsage !== null) {
      cpuUsage = hostTelem.cpuUsage;
    } else if (
      incident.metrics?.cpuUsage !== undefined &&
      incident.metrics?.cpuUsage !== null
    ) {
      cpuUsage = incident.metrics.cpuUsage;
    }

    // 2. Resolve memoryUsage
    if (hostTelem?.memoryUsage !== undefined && hostTelem?.memoryUsage !== null) {
      memoryUsage = hostTelem.memoryUsage;
    } else if (
      incident.metrics?.memoryUsage !== undefined &&
      incident.metrics?.memoryUsage !== null
    ) {
      memoryUsage = incident.metrics.memoryUsage;
    }

    // 3. Resolve p95Latency (prioritize incident.actualValue if latency SLO)
    if (
      incident.metric &&
      incident.metric.includes("latency") &&
      incident.actualValue !== undefined &&
      incident.actualValue !== null
    ) {
      p95Latency = incident.actualValue;
    } else if (
      incident.metrics?.p95Latency !== undefined &&
      incident.metrics?.p95Latency !== null
    ) {
      p95Latency = incident.metrics.p95Latency;
    } else if (
      incident.metrics?.latency !== undefined &&
      incident.metrics?.latency !== null
    ) {
      p95Latency = incident.metrics.latency;
    } else if (appTelem?.p95Latency !== undefined && appTelem?.p95Latency !== null) {
      p95Latency = appTelem.p95Latency;
    }

    // 4. Resolve errorRate (prioritize incident.actualValue if error SLO)
    if (
      incident.metric &&
      incident.metric.includes("error") &&
      incident.actualValue !== undefined &&
      incident.actualValue !== null
    ) {
      errorRate = incident.actualValue;
    } else if (
      incident.metrics?.errorRate !== undefined &&
      incident.metrics?.errorRate !== null
    ) {
      errorRate = incident.metrics.errorRate;
    } else if (appTelem?.errorRate !== undefined && appTelem?.errorRate !== null) {
      errorRate = appTelem.errorRate;
    }

    // 5. Resolve requestRate
    if (appTelem?.requestRate !== undefined && appTelem?.requestRate !== null) {
      requestRate = appTelem.requestRate;
    } else if (
      incident.metrics?.requestRate !== undefined &&
      incident.metrics?.requestRate !== null
    ) {
      requestRate = incident.metrics.requestRate;
    }

    // Secondary fallback: If any required feature was not snapshotted in incident, query live Prometheus
    const needsLiveFallback =
      cpuUsage === null ||
      memoryUsage === null ||
      p95Latency === null ||
      errorRate === null ||
      requestRate === null;

    if (needsLiveFallback) {
      try {
        const liveOverview = await PrometheusQueryService.getOverviewTelemetry();
        if (liveOverview.prometheusConnected) {
          if (cpuUsage === null && liveOverview.host.cpuUsage !== null) {
            cpuUsage = liveOverview.host.cpuUsage;
          }
          if (memoryUsage === null && liveOverview.host.memoryUsage !== null) {
            memoryUsage = liveOverview.host.memoryUsage;
          }
          if (p95Latency === null && liveOverview.application.p95Latency !== null) {
            p95Latency = liveOverview.application.p95Latency;
          }
          if (errorRate === null && liveOverview.application.errorRate !== null) {
            errorRate = liveOverview.application.errorRate;
          }
          if (requestRate === null && liveOverview.application.requestRate !== null) {
            requestRate = liveOverview.application.requestRate;
          }
        }
      } catch (_err) {
        // Live fallback unavailable
      }
    }

    // Rule 7: MISSING DATA RULE. If any mandatory feature is missing, return INSUFFICIENT_TELEMETRY.
    const missingFeatures: string[] = [];
    if (cpuUsage === null || cpuUsage === undefined || !Number.isFinite(cpuUsage)) {
      missingFeatures.push("cpuUsage");
    }
    if (memoryUsage === null || memoryUsage === undefined || !Number.isFinite(memoryUsage)) {
      missingFeatures.push("memoryUsage");
    }
    if (p95Latency === null || p95Latency === undefined || !Number.isFinite(p95Latency)) {
      missingFeatures.push("p95Latency");
    }
    if (errorRate === null || errorRate === undefined || !Number.isFinite(errorRate)) {
      missingFeatures.push("errorRate");
    }
    if (requestRate === null || requestRate === undefined || !Number.isFinite(requestRate)) {
      missingFeatures.push("requestRate");
    }

    if (missingFeatures.length > 0) {
      return {
        status: "INSUFFICIENT_TELEMETRY",
        mode: "PRODUCTION",
        incidentId: incident.incidentId,
        sloId: incident.sloId,
        requirementId,
        service,
        featureTimestamp,
        missingFeatures,
      };
    }

    // Rule 10: MODEL INPUT VALIDATION
    const finalCpu = Number(cpuUsage);
    const finalMem = Number(memoryUsage);
    const finalLat = Number(p95Latency);
    const finalErr = Number(errorRate);
    const finalReqRate = Number(requestRate);

    if (finalCpu < 0 || finalCpu > 100) {
      return {
        status: "ERROR",
        mode: "PRODUCTION",
        incidentId: incident.incidentId,
        requirementId,
        service,
        featureTimestamp,
        error: `Invalid cpuUsage: ${finalCpu}% (out of bounds [0, 100])`,
      };
    }
    if (finalMem < 0 || finalMem > 100) {
      return {
        status: "ERROR",
        mode: "PRODUCTION",
        incidentId: incident.incidentId,
        requirementId,
        service,
        featureTimestamp,
        error: `Invalid memoryUsage: ${finalMem}% (out of bounds [0, 100])`,
      };
    }
    if (finalErr < 0 || finalErr > 100) {
      return {
        status: "ERROR",
        mode: "PRODUCTION",
        incidentId: incident.incidentId,
        requirementId,
        service,
        featureTimestamp,
        error: `Invalid errorRate: ${finalErr}% (out of bounds [0, 100])`,
      };
    }
    if (finalLat < 0) {
      return {
        status: "ERROR",
        mode: "PRODUCTION",
        incidentId: incident.incidentId,
        requirementId,
        service,
        featureTimestamp,
        error: `Invalid latency: ${finalLat}s (cannot be negative)`,
      };
    }
    if (finalReqRate < 0) {
      return {
        status: "ERROR",
        mode: "PRODUCTION",
        incidentId: incident.incidentId,
        requirementId,
        service,
        featureTimestamp,
        error: `Invalid requestRate: ${finalReqRate} req/s (cannot be negative)`,
      };
    }

    // Build Provenance for every single feature
    const featureSources: Record<string, FeatureProvenance> = {
      cpuUsage: {
        source: "node-exporter",
        promQl: '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)',
        unit: "%",
        value: finalCpu,
        timestamp: featureTimestamp,
      },
      memoryUsage: {
        source: "node-exporter",
        promQl: "(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100",
        unit: "%",
        value: finalMem,
        timestamp: featureTimestamp,
      },
      p95Latency: {
        source: "prom-client",
        promQl: "histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[1m])))",
        unit: "seconds",
        value: finalLat,
        timestamp: featureTimestamp,
      },
      errorRate: {
        source: "prom-client",
        promQl: '(sum(rate(http_requests_total{status_class=~"4xx|5xx"}[1m])) / sum(rate(http_requests_total[1m]))) * 100',
        unit: "%",
        value: finalErr,
        timestamp: featureTimestamp,
      },
      requestRate: {
        source: "prom-client",
        promQl: "sum(rate(http_requests_total[1m]))",
        unit: "req/s",
        value: finalReqRate,
        timestamp: featureTimestamp,
      },
      deploymentChanged: {
        source: "deployment-tracker",
        promQl: "N/A (operational event)",
        unit: "binary",
        value: deploymentChanged,
        timestamp: featureTimestamp,
      },
    };

    return {
      status: "READY",
      mode: "PRODUCTION",
      incidentId: incident.incidentId,
      sloId: incident.sloId,
      requirementId,
      service,
      featureTimestamp,
      features: {
        cpuUsage: finalCpu,
        memoryUsage: finalMem,
        p95Latency: finalLat,
        errorRate: finalErr,
        requestRate: finalReqRate,
        deploymentChanged,
      },
      featureSources,
    };
  }

  /**
   * Validates and extracts features submitted directly in TEST mode.
   */
  public static extractFromDirectInput(body: any): ExtractedMLFeatures {
    // Rule 5: NO DEFAULT SERVICE. Service is mandatory.
    const service = (body.service || "").trim();
    if (!service) {
      return {
        status: "ERROR",
        mode: "TEST",
        requirementId: null,
        service: "",
        featureTimestamp: new Date().toISOString(),
        error: "service is required. No default service is permitted.",
      };
    }

    // Rule 6: NO DEFAULT REQUIREMENT. Genuine requirement or null.
    const requirementId =
      body.requirementId &&
      body.requirementId !== "UNLINKED" &&
      body.requirementId !== "undefined"
        ? String(body.requirementId)
        : null;

    const featureTimestamp = body.featureTimestamp || new Date().toISOString();

    const missingFeatures: string[] = [];
    if (body.cpuUsage === undefined || body.cpuUsage === null) missingFeatures.push("cpuUsage");
    if (body.memoryUsage === undefined || body.memoryUsage === null) missingFeatures.push("memoryUsage");
    if (body.errorRate === undefined || body.errorRate === null) missingFeatures.push("errorRate");

    const latencyVal =
      body.p95Latency !== undefined && body.p95Latency !== null
        ? body.p95Latency
        : body.latency !== undefined && body.latency !== null
        ? body.latency
        : null;
    if (latencyVal === null) missingFeatures.push("p95Latency");

    if (body.requestRate === undefined || body.requestRate === null) missingFeatures.push("requestRate");

    if (missingFeatures.length > 0) {
      return {
        status: "INSUFFICIENT_TELEMETRY",
        mode: "TEST",
        incidentId: body.incidentId || undefined,
        sloId: body.sloId || undefined,
        requirementId,
        service,
        featureTimestamp,
        missingFeatures,
      };
    }

    const cpu = Number(body.cpuUsage);
    const mem = Number(body.memoryUsage);
    const err = Number(body.errorRate);
    const lat = Number(latencyVal);
    const reqRate = Number(body.requestRate);
    const deployment = body.deploymentChanged ? 1 : 0;

    // Validate finite numbers
    for (const [name, val] of Object.entries({
      cpuUsage: cpu,
      memoryUsage: mem,
      errorRate: err,
      p95Latency: lat,
      requestRate: reqRate,
    })) {
      if (!Number.isFinite(val) || Number.isNaN(val)) {
        return {
          status: "ERROR",
          mode: "TEST",
          requirementId,
          service,
          featureTimestamp,
          error: `Invalid telemetry value for ${name}: must be a finite number`,
        };
      }
    }

    // Validate physical bounds
    if (cpu < 0 || cpu > 100) {
      return {
        status: "ERROR",
        mode: "TEST",
        requirementId,
        service,
        featureTimestamp,
        error: `Invalid cpuUsage: ${cpu}% (out of bounds [0, 100])`,
      };
    }
    if (mem < 0 || mem > 100) {
      return {
        status: "ERROR",
        mode: "TEST",
        requirementId,
        service,
        featureTimestamp,
        error: `Invalid memoryUsage: ${mem}% (out of bounds [0, 100])`,
      };
    }
    if (err < 0 || err > 100) {
      return {
        status: "ERROR",
        mode: "TEST",
        requirementId,
        service,
        featureTimestamp,
        error: `Invalid errorRate: ${err}% (out of bounds [0, 100])`,
      };
    }
    if (lat < 0) {
      return {
        status: "ERROR",
        mode: "TEST",
        requirementId,
        service,
        featureTimestamp,
        error: `Invalid latency: ${lat}s (cannot be negative)`,
      };
    }
    if (reqRate < 0) {
      return {
        status: "ERROR",
        mode: "TEST",
        requirementId,
        service,
        featureTimestamp,
        error: `Invalid requestRate: ${reqRate} req/s (cannot be negative)`,
      };
    }

    const featureSources: Record<string, FeatureProvenance> = {
      cpuUsage: {
        source: "direct-test-input",
        promQl: "N/A (test submission)",
        unit: "%",
        value: cpu,
        timestamp: featureTimestamp,
      },
      memoryUsage: {
        source: "direct-test-input",
        promQl: "N/A (test submission)",
        unit: "%",
        value: mem,
        timestamp: featureTimestamp,
      },
      p95Latency: {
        source: "direct-test-input",
        promQl: "N/A (test submission)",
        unit: "seconds",
        value: lat,
        timestamp: featureTimestamp,
      },
      errorRate: {
        source: "direct-test-input",
        promQl: "N/A (test submission)",
        unit: "%",
        value: err,
        timestamp: featureTimestamp,
      },
      requestRate: {
        source: "direct-test-input",
        promQl: "N/A (test submission)",
        unit: "req/s",
        value: reqRate,
        timestamp: featureTimestamp,
      },
      deploymentChanged: {
        source: "direct-test-input",
        promQl: "N/A (test submission)",
        unit: "binary",
        value: deployment,
        timestamp: featureTimestamp,
      },
    };

    return {
      status: "READY",
      mode: "TEST",
      incidentId: body.incidentId || undefined,
      sloId: body.sloId || undefined,
      requirementId,
      service,
      featureTimestamp,
      features: {
        cpuUsage: cpu,
        memoryUsage: mem,
        p95Latency: lat,
        errorRate: err,
        requestRate: reqRate,
        deploymentChanged: deployment,
      },
      featureSources,
    };
  }
}

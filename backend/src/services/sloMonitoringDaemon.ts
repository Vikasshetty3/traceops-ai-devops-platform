import { SLO, ISLO } from "../models/SLO";
import { Incident, IIncidentMetrics } from "../models/Incident";
import { PrometheusQueryService, TelemetryOverview } from "./prometheusQueryService";

export interface SLOEvaluationCycleResult {
  sloId: string;
  service: string;
  metric: string;
  operator: string;
  target: number;
  promQl: string;
  status: "COMPLIANT" | "BREACHED" | "NO_DATA" | "ERROR";
  actualValue: number | null;
  unit: string;
  evaluatedAt: Date;
  incidentCreated?: string;
  incidentUpdated?: string;
  incidentResolved?: string;
  error?: string;
}

export class SLOMonitoringDaemon {
  private static instance: SLOMonitoringDaemon;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private isCycleInProgress: boolean = false;
  private lastEvaluationTime: Date | null = null;
  private lastResults: SLOEvaluationCycleResult[] = [];

  private constructor() {}

  public static getInstance(): SLOMonitoringDaemon {
    if (!SLOMonitoringDaemon.instance) {
      SLOMonitoringDaemon.instance = new SLOMonitoringDaemon();
    }
    return SLOMonitoringDaemon.instance;
  }

  public getIntervalMs(): number {
    const raw = process.env.SLO_MONITOR_INTERVAL_MS;
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed >= 1000) {
        return parsed;
      }
    }
    return 15000; // 15 seconds safe default
  }

  public getStatus(): {
    isRunning: boolean;
    intervalMs: number;
    lastEvaluationTime: Date | null;
    evaluatedCount: number;
    recentResults: SLOEvaluationCycleResult[];
  } {
    return {
      isRunning: this.isRunning,
      intervalMs: this.getIntervalMs(),
      lastEvaluationTime: this.lastEvaluationTime,
      evaluatedCount: this.lastResults.length,
      recentResults: this.lastResults,
    };
  }

  /**
   * Builds the appropriate PromQL query from an SLO model definition.
   */
  public buildPromQl(slo: ISLO): string {
    const rawWindow = (slo.window || "5m").trim();
    // Validate window format (e.g. 1m, 5m, 15m, 1h, 30s)
    const window = /^\d+[smhd]$/.test(rawWindow) ? rawWindow : "5m";
    const metric = (slo.metric || "").toLowerCase().trim();

    switch (metric) {
      case "p95_latency":
      case "latency":
      case "response_time":
        return `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[${window}])) by (le))`;

      case "p50_latency":
      case "median_latency":
        return `histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket[${window}])) by (le))`;

      case "p99_latency":
        return `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[${window}])) by (le))`;

      case "error_rate":
      case "5xx_error_rate":
        // Distinguishes genuine zero from missing data:
        // If total traffic > 0, returns (5xx / total) * 100.
        // If 5xx = 0, returns 0.
        // If no traffic at all, returns empty vector (NO_DATA).
        return `(sum(rate(http_requests_total{status_class="5xx"}[${window}])) or (sum(rate(http_requests_total[${window}])) * 0)) / sum(rate(http_requests_total[${window}])) * 100`;

      case "4xx_5xx_error_rate":
      case "error_rate_all":
        return `(sum(rate(http_requests_total{status_class=~"4xx|5xx"}[${window}])) or (sum(rate(http_requests_total[${window}])) * 0)) / sum(rate(http_requests_total[${window}])) * 100`;

      case "availability":
        return `(sum(rate(http_requests_total{status_class!="5xx"}[${window}])) / sum(rate(http_requests_total[${window}]))) * 100`;

      default:
        // Generic or custom metric queried directly
        return slo.promQl ? slo.promQl : (metric || "up");
    }
  }

  /**
   * Compares measured value against target using operator.
   */
  public evaluateCompliance(
    actualValue: number,
    operator: string,
    target: number
  ): boolean {
    switch (operator) {
      case "<":
        return actualValue < target;
      case "<=":
        return actualValue <= target;
      case ">":
        return actualValue > target;
      case ">=":
        return actualValue >= target;
      case "=":
      case "==":
        return Math.abs(actualValue - target) < 1e-6;
      default:
        return actualValue < target;
    }
  }

  /**
   * Evaluates a single active SLO against live Prometheus telemetry.
   */
  public async evaluateSLO(slo: ISLO): Promise<SLOEvaluationCycleResult> {
    const target = slo.target !== undefined ? slo.target : slo.threshold;
    const operator = slo.operator || "<";
    const promQl = this.buildPromQl(slo);
    const evaluatedAt = new Date();

    const queryResult = await PrometheusQueryService.queryPrometheusSLO(promQl);

    // 1. Prometheus Unavailable / Error
    if (queryResult.status === "UNAVAILABLE") {
      slo.latestEvaluation = {
        status: "ERROR",
        actualValue: null,
        target,
        evaluatedAt,
        promQl,
        errorMessage: queryResult.error,
      };
      await slo.save().catch(() => {});

      return {
        sloId: slo.sloId,
        service: slo.service,
        metric: slo.metric,
        operator,
        target,
        promQl,
        status: "ERROR",
        actualValue: null,
        unit: slo.unit || "",
        evaluatedAt,
        error: queryResult.error,
      };
    }

    // 2. Missing Prometheus Data
    if (queryResult.status === "NO_DATA") {
      slo.latestEvaluation = {
        status: "NO_DATA",
        actualValue: null,
        target,
        evaluatedAt,
        promQl,
      };
      await slo.save().catch(() => {});

      return {
        sloId: slo.sloId,
        service: slo.service,
        metric: slo.metric,
        operator,
        target,
        promQl,
        status: "NO_DATA",
        actualValue: null,
        unit: slo.unit || "",
        evaluatedAt,
      };
    }

    // 3. Real measured telemetry value (including real zero)
    const actualValue = queryResult.value;
    const isCompliant = this.evaluateCompliance(actualValue, operator, target);

    let incidentCreated: string | undefined;
    let incidentUpdated: string | undefined;
    let incidentResolved: string | undefined;

    if (!isCompliant) {
      // SLO BREACH DETECTED
      slo.latestEvaluation = {
        status: "BREACHED",
        actualValue,
        target,
        evaluatedAt,
        promQl,
      };
      await slo.save().catch(() => {});

      // Check for an existing open incident for this SLO (Deduplication)
      const existingIncident = await Incident.findOne({
        sloId: slo.sloId,
        status: { $ne: "RESOLVED" },
      });

      if (existingIncident) {
        // Update existing active incident with latest observation and real evidence
        existingIncident.actualValue = actualValue;
        existingIncident.evaluatedAt = evaluatedAt;
        if (existingIncident.metrics) {
          if (slo.metric.includes("latency")) {
            existingIncident.metrics.latency = actualValue;
          } else if (slo.metric.includes("error")) {
            existingIncident.metrics.errorRate = actualValue;
          }
        }
        existingIncident.logs.push(
          `[${evaluatedAt.toISOString()}] Ongoing SLO breach: measured ${actualValue} (target: ${operator} ${target})`
        );
        await existingIncident.save().catch(() => {});
        incidentUpdated = existingIncident.incidentId;
      } else {
        // Create new real incident with real telemetry snapshot
        const overview: TelemetryOverview = await PrometheusQueryService.getOverviewTelemetry().catch(() => ({
          timestamp: evaluatedAt.toISOString(),
          prometheusConnected: true,
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
        }));

        const appTelem = overview.application;
        const hostTelem = overview.host;

        const metricsSnapshot: IIncidentMetrics = {
          cpuUsage: hostTelem.cpuUsage ?? undefined,
          memoryUsage: hostTelem.memoryUsage ?? undefined,
          errorRate: appTelem.errorRate ?? (slo.metric.includes("error") ? actualValue : undefined),
          latency: appTelem.p95Latency ?? (slo.metric.includes("latency") ? actualValue : undefined),
          requestRate: appTelem.requestRate ?? undefined,
          p50Latency: appTelem.p50Latency ?? undefined,
          p95Latency: appTelem.p95Latency ?? undefined,
          p99Latency: appTelem.p99Latency ?? undefined,
          rate4xx: appTelem.rate4xx ?? undefined,
          rate5xx: appTelem.rate5xx ?? undefined,
          activeRequests: appTelem.activeRequests ?? undefined,
          deploymentChanged: false,
        };

        const newIncId = `INC-${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;
        try {
          const createdInc = await Incident.create({
            incidentId: newIncId,
            projectId: slo.projectId,
            requirementId: slo.requirementId || "UNLINKED",
            sloId: slo.sloId,
            service: slo.service,
            metric: slo.metric,
            actualValue,
            threshold: target,
            targetValue: target,
            operator,
            severity: slo.severity || "CRITICAL",
            status: "OPEN",
            source: "PROMETHEUS_SLO_MONITOR",
            promQl,
            evaluationWindow: slo.window || "5m",
            evaluatedAt,
            message: `SLO breach on ${slo.service}: ${slo.metric} is ${actualValue}${slo.unit || ""} (target: ${operator} ${target}${slo.unit || ""})`,
            logs: [
              `[${evaluatedAt.toISOString()}] SLO breach detected by Prometheus SLO Monitor for ${slo.sloId}.`,
              `[${evaluatedAt.toISOString()}] PromQL query: ${promQl}`,
              `[${evaluatedAt.toISOString()}] Measured value: ${actualValue}${slo.unit || ""} vs target: ${operator} ${target}${slo.unit || ""}`,
            ],
            metrics: metricsSnapshot,
            telemetryEvidence: {
              overview,
              promQl,
              measuredValue: actualValue,
              evaluatedAt: evaluatedAt.toISOString(),
            },
          });

          incidentCreated = createdInc.incidentId;
          console.log(
            `[SLO DAEMON] Real incident created: ${createdInc.incidentId} for ${slo.sloId} (${slo.service}) - Measured: ${actualValue} vs Target: ${operator} ${target}`
          );
        } catch (createErr: any) {
          console.error(
            `[SLO DAEMON] Error creating incident for ${slo.sloId}:`,
            createErr?.message || createErr
          );
        }
      }

      return {
        sloId: slo.sloId,
        service: slo.service,
        metric: slo.metric,
        operator,
        target,
        promQl,
        status: "BREACHED",
        actualValue,
        unit: slo.unit || "",
        evaluatedAt,
        incidentCreated,
        incidentUpdated,
      };
    } else {
      // SLO COMPLIANT
      slo.latestEvaluation = {
        status: "COMPLIANT",
        actualValue,
        target,
        evaluatedAt,
        promQl,
      };
      await slo.save().catch(() => {});

      // Check if an open incident exists that can now be marked RESOLVED
      const activeIncident = await Incident.findOne({
        sloId: slo.sloId,
        status: { $ne: "RESOLVED" },
      });

      if (activeIncident) {
        activeIncident.status = "RESOLVED";
        activeIncident.resolvedAt = evaluatedAt;
        activeIncident.recoveryValue = actualValue;
        activeIncident.recoveryEvaluatedAt = evaluatedAt;
        activeIncident.logs.push(
          `[${evaluatedAt.toISOString()}] SLO recovered to compliant state. Recovery measurement: ${actualValue}${slo.unit || ""}`
        );
        await activeIncident.save().catch(() => {});
        incidentResolved = activeIncident.incidentId;
        console.log(
          `[SLO DAEMON] Incident ${activeIncident.incidentId} RESOLVED: SLO ${slo.sloId} recovered (measured: ${actualValue} is compliant with target: ${operator} ${target})`
        );
      }

      // Record genuine NON_VIOLATION telemetry observation for Phase 3.2 training data collection
      try {
        const { TelemetryObservationService } = await import("./telemetryObservationService");
        await TelemetryObservationService.recordCompliantObservation(slo, actualValue, evaluatedAt);
      } catch (obsErr: any) {
        console.error(
          `[SLO DAEMON] Telemetry observation recording skipped/failed for ${slo.sloId}:`,
          obsErr?.message || obsErr
        );
      }

      return {
        sloId: slo.sloId,
        service: slo.service,
        metric: slo.metric,
        operator,
        target,
        promQl,
        status: "COMPLIANT",
        actualValue,
        unit: slo.unit || "",
        evaluatedAt,
        incidentResolved,
      };
    }
  }

  /**
   * Executes a full continuous monitoring evaluation cycle across all active SLOs.
   */
  public async evaluateAllSLOs(): Promise<SLOEvaluationCycleResult[]> {
    let waitCount = 0;
    while (this.isCycleInProgress && waitCount < 40) {
      await new Promise((r) => setTimeout(r, 100));
      waitCount++;
    }

    if (this.isCycleInProgress) {
      return this.lastResults;
    }

    this.isCycleInProgress = true;
    try {
      let activeSLOs: ISLO[] = [];
      try {
        activeSLOs = await SLO.find({ status: "ACTIVE" });
      } catch (err: any) {
        console.error("[SLO DAEMON] Failed to fetch active SLOs from MongoDB:", err.message);
        return [];
      }

      const results: SLOEvaluationCycleResult[] = [];
      for (const slo of activeSLOs) {
        try {
          const res = await this.evaluateSLO(slo);
          results.push(res);
        } catch (err: any) {
          console.error(`[SLO DAEMON] Error evaluating SLO ${slo.sloId}:`, err.message);
        }
      }

      this.lastEvaluationTime = new Date();
      this.lastResults = results;
      return results;
    } finally {
      this.isCycleInProgress = false;
    }
  }

  /**
   * Starts the continuous monitoring daemon.
   * Safe, idempotent, starts exactly once.
   */
  public start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    const intervalMs = this.getIntervalMs();
    console.log(
      `[SLO DAEMON] Starting continuous Prometheus SLO monitoring daemon (interval: ${intervalMs}ms)...`
    );

    // Run first evaluation cycle asynchronously
    this.evaluateAllSLOs().catch((err) => {
      console.error("[SLO DAEMON] Initial evaluation cycle encountered error:", err);
    });

    this.intervalTimer = setInterval(() => {
      this.evaluateAllSLOs().catch((err) => {
        console.error("[SLO DAEMON] Background evaluation cycle encountered error:", err);
      });
    }, intervalMs);
  }

  /**
   * Stops the monitoring daemon cleanly.
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    this.isRunning = false;
    console.log("[SLO DAEMON] Continuous Prometheus SLO monitoring daemon stopped.");
  }
}

export const sloMonitoringDaemon = SLOMonitoringDaemon.getInstance();

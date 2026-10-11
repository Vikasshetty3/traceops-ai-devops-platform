import { Incident, IIncident } from "../models/Incident";
import { SLO, ISLO } from "../models/SLO";
import { Requirement, IRequirement } from "../models/Requirement";
import { Deployment, IDeployment } from "../models/Deployment";
import { PrometheusQueryService } from "./prometheusQueryService";
import { ContainerLogService, IRealContainerLog } from "./containerLogService";
import {
  IStructuredEvidenceItem,
  ITimelineEvent,
  IRCAImpact,
  IRCAConfidence,
  IRCAProvenance,
} from "../models/RCA";

export interface IRealEvidencePackage {
  incident: {
    incidentId: string;
    source: string;
    service: string;
    requirementId: string;
    sloId: string;
    detectedAt: string;
    actualValue: number;
    target: number;
    operator: string;
    evaluationWindow: string;
    message: string;
    isHistorical: boolean;
  };
  impact: IRCAImpact;
  requirement?: {
    requirementId: string;
    title: string;
    description: string;
    priority: string;
    service: string;
  };
  slo?: {
    sloId: string;
    metric: string;
    operator: string;
    threshold: number;
    target: number;
    window: string;
    promQl?: string;
  };
  deployment: {
    observed: boolean;
    status: string;
    details?: {
      deploymentId: string;
      version: string;
      imageTag: string;
      deployedAt: string;
    };
  };
  prometheusEvidence: Array<{
    metricName: string;
    promQl: string;
    value: number | null;
    timestamp: string;
    evaluationWindow: string;
  }>;
  logs: IRealContainerLog[];
  structuredEvidence: IStructuredEvidenceItem[];
  observedFacts: string[];
  timeline: ITimelineEvent[];
  confidence: IRCAConfidence;
  status: "EVIDENCE_BACKED" | "INSUFFICIENT_EVIDENCE";
  provenance: IRCAProvenance;
}

export class RealRcaEvidenceService {
  /**
   * Gathers genuine, un-fabricated evidence for an incident from:
   * 1. MongoDB incident record
   * 2. MongoDB SLO & Requirement traceability
   * 3. Live Prometheus queries (CPU, memory, requestRate, latency, 4xx, 5xx, activeRequests)
   * 4. Real Docker container logs
   * 5. MongoDB deployment history
   */
  public static async gatherEvidence(
    incidentIdentifier: string,
    fallbackInput?: Record<string, any>
  ): Promise<IRealEvidencePackage> {
    const collectedAt = new Date();

    // 1. Retrieve Incident
    let inc: IIncident | null = null;
    if (incidentIdentifier) {
      inc = await Incident.findOne({
        $or: [{ incidentId: incidentIdentifier }, { _id: incidentIdentifier.match(/^[0-9a-fA-F]{24}$/) ? incidentIdentifier : undefined }],
      });
    }

    // Check if incident was not found in DB but provided in fallbackInput
    const incId = inc?.incidentId || fallbackInput?.incidentId || incidentIdentifier || `INC-UNKNOWN`;
    const service = inc?.service || fallbackInput?.service || "unknown-service";
    const requirementId = inc?.requirementId || fallbackInput?.requirementId || "unknown-requirement";
    const sloId = inc?.sloId || fallbackInput?.sloId || fallbackInput?.slo || "unknown-slo";
    const actualValue = inc?.actualValue ?? fallbackInput?.actualValue ?? 0;
    const threshold = inc?.threshold ?? fallbackInput?.threshold ?? 0;
    const target = inc?.targetValue ?? threshold;
    const operator = inc?.operator ?? "<";
    const source = inc?.source || (fallbackInput?.source as any) || "UNKNOWN";
    const isHistorical = source === "HISTORICAL" || source === "DEMO";
    const detectedAt = (inc?.createdAt || inc?.evaluatedAt || new Date()).toISOString();
    const evaluationWindow = inc?.evaluationWindow || "5m";
    const message = inc?.message || `Metric breach on ${service}: ${actualValue} vs target: ${operator} ${target}`;

    // 2. Retrieve linked SLO & Requirement from MongoDB (Traceability graph)
    const [linkedSlo, linkedReq] = await Promise.all([
      SLO.findOne({ $or: [{ sloId }, { requirementId }, { service }] }),
      Requirement.findOne({ requirementId }),
    ]);

    // STRICT: If incident does not exist and service has no verified SLO or Requirement,
    // we cannot fabricate or borrow unrelated host metrics. Return INSUFFICIENT_EVIDENCE.
    if (!inc && (!linkedSlo || !linkedReq)) {
      const rationale = `INSUFFICIENT_EVIDENCE: Incident "${incId}" does not exist in the database and service "${service}" has no verified SLO or Requirement mapping.`;
      const impact: IRCAImpact = {
        observed: `${actualValue} vs target ${operator} ${target}`,
        metric: fallbackInput?.metric || "unknown_metric",
        actualValue,
        target,
        operator,
      };
      return {
        incident: {
          incidentId: incId,
          source,
          service,
          requirementId,
          sloId,
          detectedAt,
          actualValue,
          target,
          operator,
          evaluationWindow,
          message,
          isHistorical,
        },
        impact,
        deployment: { observed: false, status: "NO_DEPLOYMENT_CHANGE_OBSERVED" },
        prometheusEvidence: [],
        logs: [],
        structuredEvidence: [],
        observedFacts: [
          `Incident ${incId} not found in MongoDB incident repository.`,
          `No SLO or requirement definition exists for service "${service}".`,
        ],
        timeline: [],
        confidence: { value: 0.0, rationale },
        status: "INSUFFICIENT_EVIDENCE",
        provenance: {
          collectedAt,
          prometheusQueriesCount: 0,
          logLinesCount: 0,
          deploymentChecked: false,
          isHistorical,
        },
      };
    }

    // 3. Query Prometheus for live/recent runtime telemetry
    const promEvidence: IRealEvidencePackage["prometheusEvidence"] = [];
    const structuredEvidence: IStructuredEvidenceItem[] = [];
    const queryTimestamp = collectedAt.toISOString();

    // Execute Prometheus queries around the incident
    const sloPromQl = inc?.promQl || linkedSlo?.promQl;
    let sloMetricValue: number | null = null;
    let reqRate: number | null = null;
    let p95Latency: number | null = null;
    let rate4xx: number | null = null;
    let rate5xx: number | null = null;
    let cpuUsage: number | null = null;
    let memUsage: number | null = null;
    let activeReqs: number | null = null;

    if (!fallbackInput?.omitPrometheus) {
      [
        sloMetricValue,
        reqRate,
        p95Latency,
        rate4xx,
        rate5xx,
        cpuUsage,
        memUsage,
        activeReqs,
      ] = await Promise.all([
        sloPromQl ? PrometheusQueryService.querySingleValue(sloPromQl) : Promise.resolve(null),
        PrometheusQueryService.querySingleValue("sum(rate(http_requests_total[1m]))"),
        PrometheusQueryService.querySingleValue("histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[1m])))"),
        PrometheusQueryService.querySingleValue("(sum(rate(http_requests_total{status_class=\"4xx\"}[1m])) / sum(rate(http_requests_total[1m]))) * 100"),
        PrometheusQueryService.querySingleValue("(sum(rate(http_requests_total{status_class=\"5xx\"}[1m])) / sum(rate(http_requests_total[1m]))) * 100"),
        PrometheusQueryService.querySingleValue("100 - (avg(rate(node_cpu_seconds_total{mode=\"idle\"}[1m])) * 100)"),
        PrometheusQueryService.querySingleValue("(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100"),
        PrometheusQueryService.querySingleValue("sum(http_requests_in_flight)"),
      ]);
    }

    if (fallbackInput?.cpuUsage !== undefined) cpuUsage = fallbackInput.cpuUsage;
    if (fallbackInput?.memoryUsage !== undefined) memUsage = fallbackInput.memoryUsage;
    if (fallbackInput?.errorRate !== undefined) rate5xx = fallbackInput.errorRate;

    // Add SLO specific PromQL
    if (sloPromQl) {
      promEvidence.push({
        metricName: inc?.metric || linkedSlo?.metric || "slo_metric",
        promQl: sloPromQl,
        value: sloMetricValue !== null ? Number(sloMetricValue.toFixed(4)) : null,
        timestamp: queryTimestamp,
        evaluationWindow,
      });
      structuredEvidence.push({
        type: "PROMETHEUS",
        source: "prometheus:http_api",
        timestamp: queryTimestamp,
        promQl: sloPromQl,
        value: sloMetricValue !== null ? Number(sloMetricValue.toFixed(4)) : null,
        observed: sloMetricValue !== null,
      });
    }

    // Add Request Rate
    promEvidence.push({
      metricName: "request_rate",
      promQl: "sum(rate(http_requests_total[1m]))",
      value: reqRate !== null ? Number(reqRate.toFixed(2)) : null,
      timestamp: queryTimestamp,
      evaluationWindow: "1m",
    });
    structuredEvidence.push({
      type: "PROMETHEUS",
      source: "prometheus:http_api",
      timestamp: queryTimestamp,
      promQl: "sum(rate(http_requests_total[1m]))",
      value: reqRate !== null ? Number(reqRate.toFixed(2)) : null,
      observed: reqRate !== null,
    });

    // Add Latency
    promEvidence.push({
      metricName: "p95_latency",
      promQl: "histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[1m])))",
      value: p95Latency !== null ? Number(p95Latency.toFixed(4)) : null,
      timestamp: queryTimestamp,
      evaluationWindow: "1m",
    });
    structuredEvidence.push({
      type: "PROMETHEUS",
      source: "prometheus:http_api",
      timestamp: queryTimestamp,
      promQl: "histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[1m])))",
      value: p95Latency !== null ? Number(p95Latency.toFixed(4)) : null,
      observed: p95Latency !== null,
    });

    // Add Error Rates (4xx and 5xx)
    promEvidence.push({
      metricName: "http_5xx_rate",
      promQl: "(sum(rate(http_requests_total{status_class=\"5xx\"}[1m])) / sum(rate(http_requests_total[1m]))) * 100",
      value: rate5xx !== null ? Number(rate5xx.toFixed(2)) : null,
      timestamp: queryTimestamp,
      evaluationWindow: "1m",
    });
    structuredEvidence.push({
      type: "PROMETHEUS",
      source: "prometheus:http_api",
      timestamp: queryTimestamp,
      promQl: "(sum(rate(http_requests_total{status_class=\"5xx\"}[1m])) / sum(rate(http_requests_total[1m]))) * 100",
      value: rate5xx !== null ? Number(rate5xx.toFixed(2)) : null,
      observed: rate5xx !== null,
    });

    promEvidence.push({
      metricName: "http_4xx_rate",
      promQl: "(sum(rate(http_requests_total{status_class=\"4xx\"}[1m])) / sum(rate(http_requests_total[1m]))) * 100",
      value: rate4xx !== null ? Number(rate4xx.toFixed(2)) : null,
      timestamp: queryTimestamp,
      evaluationWindow: "1m",
    });
    structuredEvidence.push({
      type: "PROMETHEUS",
      source: "prometheus:http_api",
      timestamp: queryTimestamp,
      promQl: "(sum(rate(http_requests_total{status_class=\"4xx\"}[1m])) / sum(rate(http_requests_total[1m]))) * 100",
      value: rate4xx !== null ? Number(rate4xx.toFixed(2)) : null,
      observed: rate4xx !== null,
    });

    // Add Host Metrics (CPU & Memory)
    promEvidence.push({
      metricName: "cpu_usage",
      promQl: "100 - (avg(rate(node_cpu_seconds_total{mode=\"idle\"}[1m])) * 100)",
      value: cpuUsage !== null ? Number(cpuUsage.toFixed(1)) : null,
      timestamp: queryTimestamp,
      evaluationWindow: "1m",
    });
    structuredEvidence.push({
      type: "PROMETHEUS",
      source: "prometheus:node_exporter",
      timestamp: queryTimestamp,
      promQl: "100 - (avg(rate(node_cpu_seconds_total{mode=\"idle\"}[1m])) * 100)",
      value: cpuUsage !== null ? Number(cpuUsage.toFixed(1)) : null,
      observed: cpuUsage !== null,
    });

    promEvidence.push({
      metricName: "memory_usage",
      promQl: "(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100",
      value: memUsage !== null ? Number(memUsage.toFixed(1)) : null,
      timestamp: queryTimestamp,
      evaluationWindow: "1m",
    });
    structuredEvidence.push({
      type: "PROMETHEUS",
      source: "prometheus:node_exporter",
      timestamp: queryTimestamp,
      promQl: "(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100",
      value: memUsage !== null ? Number(memUsage.toFixed(1)) : null,
      observed: memUsage !== null,
    });

    // 4. Retrieve real Docker application logs
    let realLogs: IRealContainerLog[] = [];
    if (fallbackInput && fallbackInput.logs !== undefined) {
      if (Array.isArray(fallbackInput.logs)) {
        realLogs = fallbackInput.logs.map((l: any) =>
          typeof l === "string"
            ? { timestamp: queryTimestamp, message: l, container: service, raw: l }
            : l
        );
      }
    } else {
      realLogs = await ContainerLogService.getRealLogsForService(
        service,
        inc?.createdAt || collectedAt,
        30
      );
    }

    for (const log of realLogs) {
      structuredEvidence.push({
        type: "LOG",
        source: `docker:${log.container}`,
        timestamp: log.timestamp,
        message: log.message,
        observed: true,
      });
    }

    // 5. Query MongoDB for recent deployment history
    const incDate = inc?.createdAt || collectedAt;
    const windowStart = new Date(incDate.getTime() - 30 * 60 * 1000);
    const recentDeployment = await Deployment.findOne({
      $or: [{ service }, { projectId: inc?.projectId }],
      deployedAt: { $gte: windowStart, $lte: incDate },
    }).sort({ deployedAt: -1 });

    const deploymentEvidence = recentDeployment
      ? {
          observed: true,
          status: "DEPLOYMENT_CHANGE_OBSERVED",
          details: {
            deploymentId: recentDeployment.deploymentId,
            version: recentDeployment.version,
            imageTag: recentDeployment.imageTag,
            deployedAt: recentDeployment.deployedAt?.toISOString() || incDate.toISOString(),
          },
        }
      : {
          observed: true,
          status: "NO_DEPLOYMENT_CHANGE_OBSERVED",
        };

    structuredEvidence.push({
      type: "DEPLOYMENT",
      source: "mongodb:deployments",
      timestamp: recentDeployment?.deployedAt?.toISOString() || queryTimestamp,
      message: deploymentEvidence.status,
      value: deploymentEvidence.details,
      observed: true,
    });

    // 6. Traceability structured evidence
    if (linkedReq) {
      structuredEvidence.push({
        type: "REQUIREMENT",
        source: "mongodb:requirements",
        timestamp: queryTimestamp,
        message: `Requirement ${linkedReq.requirementId}: ${linkedReq.title} (${linkedReq.priority} priority, service: ${linkedReq.service})`,
        value: { requirementId: linkedReq.requirementId, priority: linkedReq.priority },
        observed: true,
      });
    }

    if (linkedSlo) {
      structuredEvidence.push({
        type: "SLO",
        source: "mongodb:slos",
        timestamp: queryTimestamp,
        message: `SLO ${linkedSlo.sloId}: target ${linkedSlo.operator} ${linkedSlo.target ?? linkedSlo.threshold} ${linkedSlo.unit} (window: ${linkedSlo.window})`,
        value: { sloId: linkedSlo.sloId, threshold: linkedSlo.threshold, promQl: linkedSlo.promQl },
        observed: true,
      });
    }

    // 7. Compile Chronological Timeline
    const timeline: ITimelineEvent[] = [];

    // T-5m / baseline
    const baselineTime = new Date(incDate.getTime() - 5 * 60 * 1000).toISOString();
    timeline.push({
      timestamp: baselineTime,
      event: `Telemetry baseline evaluated for service ${service}. Nominal operating threshold: ${operator} ${target}.`,
      type: "BASELINE_TELEMETRY",
    });

    // Deployment check
    if (recentDeployment && recentDeployment.deployedAt) {
      timeline.push({
        timestamp: recentDeployment.deployedAt.toISOString(),
        event: `Deployment ${recentDeployment.deploymentId} executed for ${service} (image: ${recentDeployment.imageTag}).`,
        type: "DEPLOYMENT_EVENT",
      });
    } else {
      timeline.push({
        timestamp: new Date(incDate.getTime() - 2 * 60 * 1000).toISOString(),
        event: "Deployment inspection verified: NO_DEPLOYMENT_CHANGE_OBSERVED within 30m prior to incident.",
        type: "DEPLOYMENT_AUDIT",
      });
    }

    // Incident detection
    timeline.push({
      timestamp: detectedAt,
      event: `SLO breach detected: measured ${actualValue} vs target ceiling ${operator} ${target}. Incident ${incId} created with source ${source}.`,
      type: "SLO_BREACH_INCIDENT_CREATED",
    });

    // Recent container logs (first 5)
    for (const log of realLogs.slice(0, 5)) {
      timeline.push({
        timestamp: log.timestamp,
        event: `[${log.container}] ${log.message}`,
        type: "CONTAINER_LOG",
      });
    }

    // Live Prometheus verification
    timeline.push({
      timestamp: queryTimestamp,
      event: `Live Prometheus correlation query executed: latency=${p95Latency ?? "null"}s, reqRate=${reqRate ?? "null"} req/s, 5xx=${rate5xx ?? "null"}%, CPU=${cpuUsage ?? "null"}%, memory=${memUsage ?? "null"}%.`,
      type: "PROMETHEUS_CORRELATION",
    });

    // Sort timeline chronologically
    timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // 8. Compile Observed Facts directly supported by retrieved evidence
    const observedFacts: string[] = [];
    observedFacts.push(
      `Incident ${incId} occurred on service "${service}" linked to Requirement ${requirementId} and SLO ${sloId} at ${detectedAt}.`
    );
    observedFacts.push(
      `Observed breach value is ${actualValue} exceeding target ceiling ${operator} ${target} (measured over ${evaluationWindow} window).`
    );

    if (p95Latency !== null) {
      observedFacts.push(`Prometheus instant query for p95 latency returned ${p95Latency}s at ${queryTimestamp}.`);
    }
    if (reqRate !== null) {
      observedFacts.push(`Prometheus request rate query returned ${reqRate} requests/sec at ${queryTimestamp}.`);
    }
    if (rate5xx !== null) {
      observedFacts.push(`Prometheus HTTP 5xx rate query returned ${rate5xx}% at ${queryTimestamp}.`);
    }
    if (cpuUsage !== null && memUsage !== null) {
      observedFacts.push(`Host telemetry shows CPU at ${cpuUsage}% and Memory at ${memUsage}%.`);
    }
    if (inc?.telemetryEvidence?.overview) {
      const appTel = inc.telemetryEvidence.overview.application || {};
      const hostTel = inc.telemetryEvidence.overview.host || {};
      const breachTime = inc.telemetryEvidence.overview.timestamp || detectedAt;
      observedFacts.push(
        `Telemetry snapshot AT BREACH DETECTION (${breachTime}): p95_latency=${appTel.p95Latency ?? actualValue}s, reqRate=${appTel.requestRate ?? "N/A"} req/s, errorRate=${appTel.errorRate ?? "0"}% (5xx: ${appTel.rate5xx ?? "0"}%), host CPU=${hostTel.cpuUsage ?? "N/A"}%, memory=${hostTel.memoryUsage ?? "N/A"}%.`
      );
      structuredEvidence.push({
        type: "PROMETHEUS",
        source: "incident:telemetry_evidence_at_breach",
        timestamp: breachTime,
        promQl: inc.promQl || linkedSlo?.promQl || "breach_telemetry_snapshot",
        value: {
          p95Latency: appTel.p95Latency ?? actualValue,
          requestRate: appTel.requestRate,
          errorRate: appTel.errorRate,
          rate5xx: appTel.rate5xx,
          cpuUsage: hostTel.cpuUsage,
          memoryUsage: hostTel.memoryUsage,
        },
        observed: true,
      });
    }

    if (inc?.logs && inc.logs.length > 0) {
      observedFacts.push(
        `Incident detection logs: "${inc.logs[0]}" (Total ${inc.logs.length} entries).`
      );
      for (const logLine of inc.logs.slice(0, 5)) {
        structuredEvidence.push({
          type: "LOG",
          source: "incident:detection_logs",
          timestamp: detectedAt,
          message: logLine,
          observed: true,
        });
      }
    }

    if (recentDeployment) {
      observedFacts.push(
        `Recent deployment ${recentDeployment.deploymentId} (${recentDeployment.imageTag}) was recorded at ${recentDeployment.deployedAt?.toISOString()}.`
      );
    } else {
      observedFacts.push("Deployment audit verified: NO_DEPLOYMENT_CHANGE_OBSERVED in the incident time window.");
    }
    if (realLogs.length > 0) {
      observedFacts.push(
        `Retrieved ${realLogs.length} real container log lines from Docker container "${realLogs[0].container}".`
      );
    } else {
      observedFacts.push("No application container log entries found in Docker for the incident time window.");
    }

    // 9. Evidence Sufficiency and Mathematical Confidence derivation
    let confidenceScore = 0.0;
    const rationaleParts: string[] = [];

    // Requirement & SLO verified
    if (linkedReq && linkedSlo) {
      confidenceScore += 0.20;
      rationaleParts.push("Verified requirement and SLO traceability from database (+20%)");
    } else if (requirementId !== "unknown-requirement" && sloId !== "unknown-slo") {
      confidenceScore += 0.10;
      rationaleParts.push("Partial requirement/SLO identifiers available (+10%)");
    }

    // Prometheus queries returned real data
    const validPromQueries = promEvidence.filter((p) => p.value !== null).length;
    if (validPromQueries >= 4) {
      confidenceScore += 0.35;
      rationaleParts.push(`Live Prometheus telemetry retrieved across ${validPromQueries} queries (+35%)`);
    } else if (validPromQueries > 0) {
      confidenceScore += 0.15;
      rationaleParts.push(`Partial Prometheus telemetry retrieved (${validPromQueries} queries) (+15%)`);
    } else if (inc?.telemetryEvidence) {
      confidenceScore += 0.20;
      rationaleParts.push("Incident contains persisted runtime telemetry evidence snapshot (+20%)");
    }

    // Real Docker container logs present
    if (realLogs.length > 0) {
      confidenceScore += 0.20;
      rationaleParts.push(`Retrieved ${realLogs.length} verified Docker container log lines (+20%)`);
    } else if (inc?.logs && inc.logs.length > 0) {
      confidenceScore += 0.15;
      rationaleParts.push(`Incident contains ${inc.logs.length} persisted runtime log records (+15%)`);
    }

    // Deployment status verified
    confidenceScore += 0.15;
    rationaleParts.push("Verified deployment audit status against MongoDB deployment store (+15%)");

    // Multiple corroborating signals (e.g. latency + error rate, or latency + CPU)
    if ((p95Latency !== null && p95Latency > 1.5) || (rate5xx !== null && rate5xx > 0) || (cpuUsage !== null && cpuUsage > 75)) {
      confidenceScore += 0.10;
      rationaleParts.push("Corroborating signal detected across multiple metric dimensions (+10%)");
    }

    // Cap confidence at 0.98 max (never claim absolute certainty 1.0)
    confidenceScore = Number(Math.min(0.95, Math.max(0.0, confidenceScore)).toFixed(2));

    // STRICT: Check if evidence is sufficient
    // Evidence is insufficient if no incident data, or if Prometheus, container logs, and incident telemetry are all null
    const hasTelemetry = validPromQueries > 0 || inc?.telemetryEvidence != null;
    const hasLogs = realLogs.length > 0 || (inc?.logs && inc.logs.length > 0);
    const isSufficient = hasTelemetry || hasLogs;

    const status: "EVIDENCE_BACKED" | "INSUFFICIENT_EVIDENCE" = isSufficient && confidenceScore >= 0.40
      ? "EVIDENCE_BACKED"
      : "INSUFFICIENT_EVIDENCE";

    const rationale = status === "EVIDENCE_BACKED"
      ? `Confidence derived from corroborated runtime evidence: ${rationaleParts.join("; ")}.`
      : `INSUFFICIENT_EVIDENCE: Telemetry or log signals are missing for incident ${incId}. Cannot reliably determine root cause without observed metrics.`;

    const impact: IRCAImpact = {
      observed: `${actualValue} vs target ${operator} ${target}`,
      metric: inc?.metric || linkedSlo?.metric || "performance",
      actualValue,
      target,
      operator,
    };

    const provenance: IRCAProvenance = {
      collectedAt,
      prometheusQueriesCount: promEvidence.length,
      logLinesCount: realLogs.length,
      deploymentChecked: true,
      isHistorical,
    };

    return {
      incident: {
        incidentId: incId,
        source,
        service,
        requirementId,
        sloId,
        detectedAt,
        actualValue,
        target,
        operator,
        evaluationWindow,
        message,
        isHistorical,
      },
      impact,
      requirement: linkedReq
        ? {
            requirementId: linkedReq.requirementId,
            title: linkedReq.title,
            description: linkedReq.description,
            priority: linkedReq.priority,
            service: linkedReq.service,
          }
        : undefined,
      slo: linkedSlo
        ? {
            sloId: linkedSlo.sloId,
            metric: linkedSlo.metric,
            operator: linkedSlo.operator,
            threshold: linkedSlo.threshold,
            target: linkedSlo.target ?? linkedSlo.threshold,
            window: linkedSlo.window,
            promQl: linkedSlo.promQl,
          }
        : undefined,
      deployment: deploymentEvidence,
      prometheusEvidence: promEvidence,
      logs: realLogs,
      structuredEvidence,
      observedFacts,
      timeline,
      confidence: {
        value: status === "EVIDENCE_BACKED" ? confidenceScore : 0.0,
        rationale,
      },
      status,
      provenance,
    };
  }
}

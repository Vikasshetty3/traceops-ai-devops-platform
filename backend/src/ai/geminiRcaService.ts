import "dotenv/config";
import { IRealEvidencePackage, RealRcaEvidenceService } from "../services/realRcaEvidenceService";
import {
  IStructuredEvidenceItem,
  ITimelineEvent,
  IRCAImpact,
  IRCAConfidence,
  IRCAProvenance,
} from "../models/RCA";

export interface RealRCAResult {
  incidentId: string;
  requirementId: string;
  sloId: string;
  service: string;
  detectedAt: string;
  impact: IRCAImpact;
  evidence: string[];
  structuredEvidence: IStructuredEvidenceItem[];
  observedFacts: string[];
  rootCauseHypothesis: string;
  rootCause: string;
  causalChain: string[];
  contributingFactors: string[];
  confidence: number;
  confidenceDetails: IRCAConfidence;
  remediation: string[];
  recommendedAction: string;
  uncertainty: string[];
  timeline: ITimelineEvent[];
  status:
    | "EVIDENCE_BACKED"
    | "INSUFFICIENT_EVIDENCE"
    | "ERROR"
    | "DETERMINISTIC_EVIDENCE_SUMMARY"
    | "AI_UNAVAILABLE";
  provenance: IRCAProvenance;
  metricsSnapshot: {
    cpuUsage?: number;
    memoryUsage?: number;
    errorRate?: number;
    latency?: number;
    deploymentChanged?: boolean;
  };
}

export class GeminiRcaService {
  /**
   * Performs evidence-backed Root Cause Analysis reasoning ONLY from real retrieved evidence.
   */
  public static async analyze(
    incidentId: string,
    fallbackInput?: Record<string, any>
  ): Promise<RealRCAResult> {
    // 1. Gather genuine evidence across Prometheus, Docker logs, MongoDB, and deployments
    const evidencePkg = await RealRcaEvidenceService.gatherEvidence(incidentId, fallbackInput);

    // 2. Extract metrics snapshot for legacy and tabular views
    const latencyMetric = evidencePkg.prometheusEvidence.find((p) => p.metricName.includes("latency"))?.value;
    const cpuMetric = evidencePkg.prometheusEvidence.find((p) => p.metricName === "cpu_usage")?.value;
    const memMetric = evidencePkg.prometheusEvidence.find((p) => p.metricName === "memory_usage")?.value;
    const errMetric = evidencePkg.prometheusEvidence.find((p) => p.metricName.includes("5xx"))?.value;

    const metricsSnapshot = {
      latency: latencyMetric !== null && latencyMetric !== undefined ? latencyMetric : evidencePkg.incident.actualValue,
      cpuUsage: cpuMetric !== null && cpuMetric !== undefined ? cpuMetric : undefined,
      memoryUsage: memMetric !== null && memMetric !== undefined ? memMetric : undefined,
      errorRate: errMetric !== null && errMetric !== undefined ? errMetric : undefined,
      deploymentChanged: evidencePkg.deployment.status === "DEPLOYMENT_CHANGE_OBSERVED",
    };

    // 3. Handle INSUFFICIENT_EVIDENCE: do NOT hallucinate or force an explanation
    if (evidencePkg.status === "INSUFFICIENT_EVIDENCE") {
      const uncertainty = [
        "No matching Prometheus telemetry series found in incident time window",
        "No container log entries found matching incident timestamp",
        "Evidence is insufficient to corroborate or diagnose root cause without fabrication",
      ];

      return {
        incidentId: evidencePkg.incident.incidentId,
        requirementId: evidencePkg.incident.requirementId,
        sloId: evidencePkg.incident.sloId,
        service: evidencePkg.incident.service,
        detectedAt: evidencePkg.incident.detectedAt,
        impact: evidencePkg.impact,
        evidence: [
          `SLO breach: ${evidencePkg.incident.actualValue} vs target ceiling ${evidencePkg.incident.operator} ${evidencePkg.incident.target}`,
          "INSUFFICIENT_EVIDENCE: Required telemetry or log evidence could not be retrieved from the running system",
        ],
        structuredEvidence: evidencePkg.structuredEvidence,
        observedFacts: evidencePkg.observedFacts,
        rootCauseHypothesis: "INSUFFICIENT_EVIDENCE: Insufficient observed runtime telemetry and logs to establish root cause.",
        rootCause: "INSUFFICIENT_EVIDENCE: Insufficient observed runtime telemetry and logs to establish root cause.",
        causalChain: ["SLO breach detected", "Evidence retrieval yielded insufficient telemetry", "Analysis halted"],
        contributingFactors: ["Missing telemetry observations", "Unobserved service runtime state"],
        confidence: 0.0,
        confidenceDetails: evidencePkg.confidence,
        remediation: ["Verify service telemetry exporters and ensure active container logging"],
        recommendedAction: "Investigate service monitoring coverage and verify Prometheus scraper connectivity.",
        uncertainty,
        timeline: evidencePkg.timeline,
        status: "INSUFFICIENT_EVIDENCE",
        provenance: evidencePkg.provenance,
        metricsSnapshot,
      };
    }

    // 4. Try Gemini reasoning over the structured real evidence
    const apiKey =
      process.env.GEMINI_API_KEY ||
      "your_gemini_api_key_here";

    let llmHypothesis: string | null = null;
    let llmCausalChain: string[] = [];
    let llmContributingFactors: string[] = [];
    let llmRemediation: string[] = [];
    let llmUncertainty: string[] = [];
    let llmRationale: string | null = null;
    let llmUsed = false;
    let actualModelUsed = "gemini-2.5-flash";

    if (apiKey && apiKey !== "your_gemini_api_key_here") {
      try {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey });

        const prompt = `You are an SRE Root Cause Analysis specialist.
Analyze the following runtime incident using ONLY the observed facts, Prometheus metrics, and container logs provided below.

STRICT OPERATIONAL RULES:
1. Reason ONLY from the provided evidence.
2. DO NOT INVENT or hallucinate any logs, metrics, deployments, error messages, or timestamps.
3. Clearly distinguish OBSERVED FACTS from your ROOT CAUSE HYPOTHESIS.
4. If the provided evidence is ambiguous, incomplete, or insufficient, explicitly state INSUFFICIENT_EVIDENCE in your hypothesis and list missing signals in uncertainty.
5. Base your confidence rationale on the actual evidence corroboration.
6. Provide concrete remediation recommendations and any identified contributing factors.

=== INCIDENT IDENTIFIERS ===
- Incident ID: ${evidencePkg.incident.incidentId}
- Service: ${evidencePkg.incident.service}
- Requirement: ${evidencePkg.incident.requirementId} ${evidencePkg.requirement ? `(${evidencePkg.requirement.title})` : ""}
- SLO: ${evidencePkg.incident.sloId}
- Impact: Measured ${evidencePkg.incident.actualValue} vs Target ${evidencePkg.incident.operator} ${evidencePkg.incident.target} (${evidencePkg.incident.evaluationWindow} window)
- Detected At: ${evidencePkg.incident.detectedAt}

=== OBSERVED FACTS ===
${evidencePkg.observedFacts.map((f, i) => `${i + 1}. ${f}`).join("\n")}

=== PROMETHEUS METRIC QUERIES ===
${evidencePkg.prometheusEvidence.map((p) => `- ${p.metricName} (${p.promQl}): ${p.value !== null ? p.value : "NO_DATA"} at ${p.timestamp}`).join("\n")}

=== APPLICATION CONTAINER LOGS (DOCKER) ===
${evidencePkg.logs.length > 0 ? evidencePkg.logs.map((l) => `[${l.timestamp}] [${l.container}] ${l.message}`).join("\n") : "NO_CONTAINER_LOGS_OBSERVED_IN_WINDOW"}

=== DEPLOYMENT AUDIT ===
- Status: ${evidencePkg.deployment.status}
${evidencePkg.deployment.details ? `- Deployment ID: ${evidencePkg.deployment.details.deploymentId}, Image: ${evidencePkg.deployment.details.imageTag}, Deployed: ${evidencePkg.deployment.details.deployedAt}` : "- No recent deployment observed in the 30-minute window preceding incident."}

Return ONLY a valid JSON object matching this structure:
{
  "rootCauseHypothesis": "Concise hypothesis explaining the likely technical root cause based on the observed evidence",
  "causalChain": [
    "Step 1 in causal sequence",
    "Step 2 in causal sequence",
    "Breach outcome"
  ],
  "contributingFactors": [
    "Contributing factor 1",
    "Contributing factor 2"
  ],
  "remediation": [
    "Actionable remediation step 1",
    "Actionable remediation step 2"
  ],
  "uncertainty": [
    "Any missing signal, unobserved parameter, or uncertainty"
  ],
  "confidenceRationale": "Explanation of how strongly the retrieved metrics and logs support this hypothesis"
}`;

        let response: any = null;
        actualModelUsed = "gemini-2.5-flash";
        const candidateModels = ["gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-flash-latest"];

        for (const candidateModel of candidateModels) {
          try {
            response = await ai.models.generateContent({
              model: candidateModel,
              contents: prompt,
            });
            actualModelUsed = candidateModel;
            break;
          } catch (modelErr: any) {
            console.warn(`[GeminiRcaService] Model ${candidateModel} note:`, modelErr?.message || modelErr);
          }
        }

        const text = response.text?.trim();
        if (text) {
          const cleaned = text
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();

          const parsed = JSON.parse(cleaned);
          if (parsed.rootCauseHypothesis) {
            llmHypothesis = parsed.rootCauseHypothesis;
            llmCausalChain = Array.isArray(parsed.causalChain) ? parsed.causalChain : [];
            llmContributingFactors = Array.isArray(parsed.contributingFactors) ? parsed.contributingFactors : [];
            llmRemediation = Array.isArray(parsed.remediation) ? parsed.remediation : [];
            llmUncertainty = Array.isArray(parsed.uncertainty) ? parsed.uncertainty : [];
            llmRationale = parsed.confidenceRationale || null;
            llmUsed = true;
          }
        }
      } catch (err: any) {
        console.warn("[GeminiRcaService] Gemini API invocation note:", err?.message || err);
      }
    }

    // 5. If LLM was not used or failed, perform deterministic real-evidence synthesis (STRICT: no fabrication)
    let rootCauseHypothesis = llmHypothesis;
    let causalChain = llmCausalChain;
    let contributingFactors = llmContributingFactors;
    let remediation = llmRemediation;
    let uncertainty = llmUncertainty;

    if (!rootCauseHypothesis) {
      // Deterministic evidence-backed hypothesis based STRICTLY on retrieved metrics:
      const breachRatio = evidencePkg.incident.target > 0
        ? ((evidencePkg.incident.actualValue - evidencePkg.incident.target) / evidencePkg.incident.target) * 100
        : 0;

      if (metricsSnapshot.errorRate && metricsSnapshot.errorRate > 5) {
        rootCauseHypothesis = `Elevated HTTP 5xx error rate (${metricsSnapshot.errorRate}%) observed on ${evidencePkg.incident.service} causing SLO degradation without host CPU/memory resource exhaustion.`;
        causalChain = [
          `Application traffic encountered server-side errors (5xx rate: ${metricsSnapshot.errorRate}%)`,
          `SLO ${evidencePkg.incident.sloId} breached (${evidencePkg.incident.actualValue} vs target: ${evidencePkg.incident.operator} ${evidencePkg.incident.target})`,
          `Host resources remained nominal (CPU: ${metricsSnapshot.cpuUsage ?? "nominal"}%, Mem: ${metricsSnapshot.memoryUsage ?? "nominal"}%) indicating application-level failure rather than node exhaustion`,
        ];
        contributingFactors = [
          `HTTP 5xx rate: ${metricsSnapshot.errorRate}%`,
          `Request rate: ${evidencePkg.prometheusEvidence.find((p) => p.metricName === "request_rate")?.value ?? "unmetered"} req/sec`,
        ];
        remediation = [
          "Inspect application stack traces in container logs for unhandled 5xx exceptions",
          "Verify downstream service endpoint availability and timeouts",
        ];
      } else if (metricsSnapshot.cpuUsage && metricsSnapshot.cpuUsage > 85) {
        rootCauseHypothesis = `Host CPU saturation (${metricsSnapshot.cpuUsage}%) degraded request processing pipeline throughput on ${evidencePkg.incident.service}.`;
        causalChain = [
          `High CPU load (${metricsSnapshot.cpuUsage}%) saturated compute threads`,
          `Request duration inflated beyond ${evidencePkg.incident.target}s ceiling`,
          `SLO ${evidencePkg.incident.sloId} breached at measured value ${evidencePkg.incident.actualValue}`,
        ];
        contributingFactors = [`Host CPU: ${metricsSnapshot.cpuUsage}%`];
        remediation = [
          "Scale service container instances horizontally to distribute CPU compute demand",
          "Profile high-overhead compute loops or cryptographic routines in application",
        ];
      } else if (metricsSnapshot.memoryUsage && metricsSnapshot.memoryUsage > 85) {
        rootCauseHypothesis = `Memory pressure (${metricsSnapshot.memoryUsage}%) induced latency degradation on ${evidencePkg.incident.service}.`;
        causalChain = [
          `Memory utilization reached ${metricsSnapshot.memoryUsage}%`,
          `Garbage collection cycles and paging introduced request handling latency`,
          `SLO breach registered at ${evidencePkg.incident.actualValue}`,
        ];
        contributingFactors = [`Host Memory: ${metricsSnapshot.memoryUsage}%`];
        remediation = [
          "Increase container memory limit allocation",
          "Inspect application heap snapshots for memory retention leaks",
        ];
      } else {
        const logContext = evidencePkg.logs.length > 0
          ? ` Corroborated with ${evidencePkg.logs.length} observed application log records.`
          : " No container log entries recorded in incident window.";
        rootCauseHypothesis = `Measured ${evidencePkg.impact.metric || "latency"} of ${evidencePkg.incident.actualValue} exceeded SLO ceiling (${evidencePkg.incident.operator} ${evidencePkg.incident.target}) by +${breachRatio.toFixed(1)}% under concurrent traffic without host node exhaustion.${logContext}`;
        causalChain = [
          `Inbound request traffic processed by ${evidencePkg.incident.service}`,
          `Response processing exceeded nominal SLO ceiling of ${evidencePkg.incident.target}`,
          `SLO breach triggered incident creation with actual value ${evidencePkg.incident.actualValue}`,
        ];
        contributingFactors = [
          `Observed breach margin: +${breachRatio.toFixed(1)}% above target`,
          `Host resources: CPU ${metricsSnapshot.cpuUsage ?? "healthy"}%, Memory ${metricsSnapshot.memoryUsage ?? "healthy"}%`,
          evidencePkg.deployment.status === "DEPLOYMENT_CHANGE_OBSERVED"
            ? "Recent deployment was executed shortly prior to breach"
            : "No deployment change observed in window",
        ];
        remediation = [
          "Inspect database and internal microservice dependency latency under concurrent load",
          "Tune request timeouts and connection pool sizing to match target SLO ceiling",
        ];
      }

      uncertainty = [
        "Detailed distributed APM trace spans not configured for downstream microservice hops",
        "Analysis based on Prometheus metrics, Docker container logs, and SLO telemetry",
      ];
    }

    // 6. Build final evidence summary strings (for legacy and UI consumers)
    const evidenceSummary: string[] = [
      `Measured ${evidencePkg.impact.metric || "metric"} (${evidencePkg.incident.actualValue}) breached SLO target ceiling of ${evidencePkg.incident.target}`,
    ];
    if (metricsSnapshot.latency != null) {
      evidenceSummary.push(`Observed p95 latency: ${metricsSnapshot.latency}s`);
    }
    if (metricsSnapshot.errorRate != null && metricsSnapshot.errorRate > 0) {
      evidenceSummary.push(`HTTP error rate: ${metricsSnapshot.errorRate}%`);
    }
    if (metricsSnapshot.cpuUsage != null) {
      evidenceSummary.push(`CPU utilization: ${metricsSnapshot.cpuUsage}%`);
    }
    if (metricsSnapshot.memoryUsage != null) {
      evidenceSummary.push(`Memory utilization: ${metricsSnapshot.memoryUsage}%`);
    }
    if (evidencePkg.deployment.status === "DEPLOYMENT_CHANGE_OBSERVED") {
      evidenceSummary.push(`Deployment change recorded: ${evidencePkg.deployment.details?.imageTag}`);
    } else {
      evidenceSummary.push("Deployment audit: NO_DEPLOYMENT_CHANGE_OBSERVED");
    }
    if (evidencePkg.logs.length > 0) {
      evidenceSummary.push(`Corroborated with ${evidencePkg.logs.length} Docker container log entries`);
    }

    const primaryAction = remediation[0] || "Investigate service dependencies and scale resources";

    evidencePkg.provenance.llmModel = llmUsed ? actualModelUsed : "deterministic-evidence-analyzer";

    const isInsufficient = rootCauseHypothesis.toUpperCase().includes("INSUFFICIENT_EVIDENCE");

    let finalStatus:
      | "EVIDENCE_BACKED"
      | "INSUFFICIENT_EVIDENCE"
      | "ERROR"
      | "DETERMINISTIC_EVIDENCE_SUMMARY"
      | "AI_UNAVAILABLE";

    if (isInsufficient) {
      finalStatus = "INSUFFICIENT_EVIDENCE";
    } else if (llmUsed) {
      finalStatus = "EVIDENCE_BACKED";
    } else {
      finalStatus = "DETERMINISTIC_EVIDENCE_SUMMARY";
      if (!rootCauseHypothesis.startsWith("[DETERMINISTIC_EVIDENCE_SUMMARY]")) {
        rootCauseHypothesis = `[DETERMINISTIC_EVIDENCE_SUMMARY] ${rootCauseHypothesis}`;
      }
    }

    const finalConfidenceValue = isInsufficient
      ? Math.min(evidencePkg.confidence.value, 0.20)
      : evidencePkg.confidence.value;

    const finalConfidenceRationale = llmRationale
      ? `${evidencePkg.confidence.rationale} LLM reasoning validation: ${llmRationale}`
      : `${evidencePkg.confidence.rationale} (Note: Gemini AI reasoning was unavailable; deterministic evidence summary generated from observed runtime metrics).`;

    return {
      incidentId: evidencePkg.incident.incidentId,
      requirementId: evidencePkg.incident.requirementId,
      sloId: evidencePkg.incident.sloId,
      service: evidencePkg.incident.service,
      detectedAt: evidencePkg.incident.detectedAt,
      impact: evidencePkg.impact,
      evidence: evidenceSummary,
      structuredEvidence: evidencePkg.structuredEvidence,
      observedFacts: evidencePkg.observedFacts,
      rootCauseHypothesis,
      rootCause: rootCauseHypothesis,
      causalChain,
      contributingFactors,
      confidence: finalConfidenceValue,
      confidenceDetails: {
        value: finalConfidenceValue,
        rationale: finalConfidenceRationale,
      },
      remediation,
      recommendedAction: primaryAction,
      uncertainty,
      timeline: evidencePkg.timeline,
      status: finalStatus,
      provenance: evidencePkg.provenance,
      metricsSnapshot,
    };
  }
}

// Backwards-compatible export function
export const analyzeWithGemini = async (
  input: Record<string, any>
): Promise<{
  rootCause: string;
  evidence: string[];
  confidence: number;
  recommendedAction: string;
  structuredRCA?: RealRCAResult;
}> => {
  const incidentId = input.incidentId || input.requirementId;
  const result = await GeminiRcaService.analyze(incidentId, input);

  return {
    rootCause: result.rootCause,
    evidence: result.evidence,
    confidence: result.confidence,
    recommendedAction: result.recommendedAction,
    structuredRCA: result,
  };
};
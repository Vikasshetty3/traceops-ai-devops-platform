import { Request, Response } from "express";
import { analyzeRootCause, RCAInput } from "../ai/rcaService";
import { GeminiRcaService } from "../ai/geminiRcaService";
import { RCA } from "../models/RCA";
import { Incident } from "../models/Incident";

export const analyzeRCA = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const input: RCAInput = req.body || {};
    const incidentId = input.incidentId;

    // If an incident ID is provided, route through full real-evidence gathering pipeline
    if (incidentId) {
      const result = await GeminiRcaService.analyze(incidentId, input);

      const rcaId = `RCA-RULE-${Date.now().toString().slice(-6)}`;

      const rca = await RCA.create({
        rcaId,
        incidentId: result.incidentId,
        requirementId: result.requirementId,
        sloId: result.sloId,
        service: result.service,
        detectedAt: result.detectedAt ? new Date(result.detectedAt) : undefined,
        impact: result.impact,
        rootCause: result.rootCause,
        rootCauseHypothesis: result.rootCauseHypothesis,
        observedFacts: result.observedFacts,
        causalChain: result.causalChain,
        contributingFactors: result.contributingFactors,
        remediation: result.remediation,
        recommendedAction: result.recommendedAction,
        uncertainty: result.uncertainty,
        timeline: result.timeline,
        confidence: result.confidence,
        confidenceDetails: result.confidenceDetails,
        evidence: result.evidence,
        structuredEvidence: result.structuredEvidence,
        analysisStatus: result.status,
        provenance: result.provenance,
        metricsSnapshot: result.metricsSnapshot,
        status: "GENERATED",
      });

      if (result.incidentId && !result.incidentId.startsWith("INC-UNKNOWN")) {
        await Incident.findOneAndUpdate(
          { incidentId: result.incidentId },
          { $set: { status: "INVESTIGATING" } }
        );
      }

      res.status(200).json({
        success: true,
        data: rca,
      });
      return;
    }

    // Direct telemetry payload validation
    if (
      !input.service ||
      !input.requirementId ||
      input.actualValue === undefined ||
      input.threshold === undefined
    ) {
      res.status(400).json({
        success: false,
        message:
          "service, requirementId, actualValue and threshold are required",
      });
      return;
    }

    const result = analyzeRootCause(input);

    const rcaId = `RCA-RULE-${Date.now().toString().slice(-6)}`;
    const effectiveIncidentId = (input as any).incidentId || `INC-DIRECT-${Date.now().toString().slice(-6)}`;

    const rca = await RCA.create({
      rcaId,
      incidentId: effectiveIncidentId,
      requirementId: input.requirementId,
      sloId: (input as any).slo || `${input.metric || "metric"} < ${input.threshold}s`,
      service: input.service,
      rootCause: result.rootCause,
      rootCauseHypothesis: result.rootCause,
      observedFacts: result.observedFacts || [],
      evidence: result.evidence,
      confidence: result.confidence,
      confidenceDetails: {
        value: result.confidence,
        rationale: result.confidenceRationale || "Derived from supplied telemetry signals",
      },
      recommendedAction: result.recommendedAction,
      remediation: [result.recommendedAction],
      analysisStatus: result.status || "EVIDENCE_BACKED",
      metricsSnapshot: {
        cpuUsage: input.cpuUsage,
        memoryUsage: input.memoryUsage,
        errorRate: input.errorRate,
        latency: input.actualValue,
        deploymentChanged: input.deploymentChanged,
      },
      provenance: {
        collectedAt: new Date(),
        prometheusQueriesCount: 0,
        logLinesCount: (input.logs || []).length,
        deploymentChecked: input.deploymentChanged !== undefined,
        isHistorical: false,
        llmModel: "deterministic-evidence-analyzer",
      },
      status: "GENERATED",
    });

    res.status(200).json({
      success: true,
      data: rca,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "RCA analysis failed",
      error: error instanceof Error ? error.message : error,
    });
  }
};
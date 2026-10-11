import { Request, Response } from "express";
import { GeminiRcaService } from "../ai/geminiRcaService";
import { RCA } from "../models/RCA";
import { Incident } from "../models/Incident";

export const analyzeGeminiRCA = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const input = req.body || {};
    const incidentId = input.incidentId;

    // Validate request has either incidentId or sufficient requirement/metric context
    if (
      !incidentId &&
      (!input.requirementId ||
        !input.service ||
        input.actualValue === undefined ||
        input.threshold === undefined)
    ) {
      res.status(400).json({
        success: false,
        message:
          "Either valid incidentId, or requirementId, service, actualValue, and threshold are required",
      });
      return;
    }

    // Run genuine evidence gathering and AI RCA analysis
    const result = await GeminiRcaService.analyze(incidentId, input);

    const rcaId = `RCA-AI-${Date.now().toString().slice(-6)}`;

    // Persist full evidence-backed RCA to MongoDB
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

    // If genuine incident exists in MongoDB, transition status to INVESTIGATING
    if (result.incidentId && !result.incidentId.startsWith("INC-UNKNOWN")) {
      await Incident.findOneAndUpdate(
        { incidentId: result.incidentId },
        { $set: { status: "INVESTIGATING" } }
      );
    }

    res.status(201).json({
      success: true,
      message: result.status === "EVIDENCE_BACKED"
        ? "Genuine evidence-backed AI RCA generated and persisted"
        : result.status === "DETERMINISTIC_EVIDENCE_SUMMARY"
        ? "Deterministic evidence summary generated (Gemini AI unavailable)"
        : "RCA analysis completed: INSUFFICIENT_EVIDENCE observed",
      data: rca,
    });
  } catch (error) {
    console.error("Gemini RCA error:", error);

    res.status(500).json({
      success: false,
      message: "Gemini RCA analysis failed",
      error: error instanceof Error ? error.message : error,
    });
  }
};
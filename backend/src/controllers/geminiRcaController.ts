import { Request, Response } from "express";
import {
  analyzeWithGemini,
  GeminiRCAInput,
} from "../ai/geminiRcaService";
import { RCA } from "../models/RCA";
import { Incident } from "../models/Incident";

export const analyzeGeminiRCA = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const input: GeminiRCAInput = req.body;

    if (
      !input.requirementId ||
      !input.service ||
      !input.slo ||
      !input.metric ||
      input.actualValue === undefined ||
      input.threshold === undefined
    ) {
      res.status(400).json({
        success: false,
        message:
          "requirementId, service, slo, metric, actualValue and threshold are required",
      });
      return;
    }

    // Send incident evidence to Gemini
    const result = await analyzeWithGemini(input);

    const rcaId = `RCA-GEMINI-${Date.now().toString().slice(-6)}`;
    const incidentId = input.incidentId || input.requirementId;

    // Save the RCA to MongoDB
    const rca = await RCA.create({
      rcaId,
      incidentId,
      requirementId: input.requirementId,
      sloId: input.slo,
      service: input.service,
      rootCause: result.rootCause,
      evidence: result.evidence,
      confidence: result.confidence,
      recommendedAction: result.recommendedAction,
      metricsSnapshot: {
        cpuUsage: input.cpuUsage,
        memoryUsage: input.memoryUsage,
        errorRate: input.errorRate,
        latency: input.actualValue,
        deploymentChanged: input.deploymentChanged,
      },
      status: "GENERATED",
    });

    // If an incident exists, update its status
    if (input.incidentId) {
      await Incident.findOneAndUpdate(
        { incidentId: input.incidentId },
        { $set: { status: "INVESTIGATING" } }
      );
    }

    res.status(201).json({
      success: true,
      message: "Gemini RCA generated and saved successfully",
      data: {
        ...result,
        requirementId: input.requirementId,
        service: input.service,
        rcaId: rca.rcaId,
        savedToDatabase: true,
      },
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
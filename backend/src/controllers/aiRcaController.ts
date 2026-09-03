import { Request, Response } from "express";
import { analyzeRootCause, RCAInput } from "../ai/rcaService";
import { RCA } from "../models/RCA";
import { Incident } from "../models/Incident";

export const analyzeRCA = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const input: RCAInput = req.body;

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
    const incidentId = (input as any).incidentId || input.requirementId;

    const rca = await RCA.create({
      rcaId,
      incidentId,
      requirementId: input.requirementId,
      sloId: (input as any).slo || `${input.metric} < ${input.threshold}s`,
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

    if ((input as any).incidentId) {
      await Incident.findOneAndUpdate(
        { incidentId: (input as any).incidentId },
        { $set: { status: "INVESTIGATING" } }
      );
    }

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
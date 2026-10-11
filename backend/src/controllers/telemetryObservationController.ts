import { Request, Response } from "express";
import { TelemetryObservation } from "../models/TelemetryObservation";
import { TelemetryObservationService } from "../services/telemetryObservationService";

export const getTelemetryObservations = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const skip = (page - 1) * limit;

    const query: Record<string, any> = {};

    if (req.query.label) {
      query.label = String(req.query.label).toUpperCase();
    }
    if (req.query.service) {
      query.service = String(req.query.service);
    }
    if (req.query.sloId) {
      query.sloId = String(req.query.sloId);
    }
    if (req.query.evaluationStatus) {
      query.evaluationStatus = String(req.query.evaluationStatus).toUpperCase();
    }
    if (req.query.featuresComplete !== undefined) {
      query.featuresComplete = req.query.featuresComplete === "true";
    }

    const [total, compliantCount, completeCount, observations] = await Promise.all([
      TelemetryObservation.countDocuments(query),
      TelemetryObservation.countDocuments({ ...query, label: "NON_VIOLATION" }),
      TelemetryObservation.countDocuments({ ...query, featuresComplete: true }),
      TelemetryObservation.find(query)
        .sort({ observedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      total,
      page,
      limit,
      count: observations.length,
      compliantCount,
      featuresCompleteCount: completeCount,
      samplingIntervalSec: TelemetryObservationService.getSamplingIntervalSec(),
      data: observations,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to retrieve telemetry observations",
      error: error?.message || error,
    });
  }
};

export const getTelemetryObservationSummary = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const [
      total,
      nonViolationCount,
      violationCount,
      completeCount,
      incompleteCount,
      distinctServices,
      distinctSlos,
      distinctRequirements,
      earliestDoc,
      latestDoc,
    ] = await Promise.all([
      TelemetryObservation.countDocuments(),
      TelemetryObservation.countDocuments({ label: "NON_VIOLATION" }),
      TelemetryObservation.countDocuments({ label: "VIOLATION" }),
      TelemetryObservation.countDocuments({ featuresComplete: true }),
      TelemetryObservation.countDocuments({ featuresComplete: false }),
      TelemetryObservation.distinct("service"),
      TelemetryObservation.distinct("sloId"),
      TelemetryObservation.distinct("requirementId"),
      TelemetryObservation.findOne().sort({ observedAt: 1 }).select("observedAt").lean(),
      TelemetryObservation.findOne().sort({ observedAt: -1 }).select("observedAt").lean(),
    ]);

    res.status(200).json({
      success: true,
      summary: {
        totalObservations: total,
        nonViolationCount,
        violationCount,
        featuresCompleteCount: completeCount,
        featuresIncompleteCount: incompleteCount,
        distinctServicesCount: distinctServices.length,
        distinctServices,
        distinctSlosCount: distinctSlos.length,
        distinctSlos,
        distinctRequirementsCount: distinctRequirements.filter(Boolean).length,
        distinctRequirements: distinctRequirements.filter(Boolean),
        earliestObservation: earliestDoc ? (earliestDoc as any).observedAt : null,
        latestObservation: latestDoc ? (latestDoc as any).observedAt : null,
        samplingIntervalSec: TelemetryObservationService.getSamplingIntervalSec(),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to retrieve telemetry observation summary",
      error: error?.message || error,
    });
  }
};

export const getTelemetryObservationById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);
    const observation = await TelemetryObservation.findOne({
      $or: [
        { observationId: id },
        ...(id.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: id }] : []),
      ],
    }).lean();

    if (!observation) {
      res.status(404).json({
        success: false,
        message: `Telemetry observation not found: ${id}`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: observation,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to retrieve telemetry observation",
      error: error?.message || error,
    });
  }
};

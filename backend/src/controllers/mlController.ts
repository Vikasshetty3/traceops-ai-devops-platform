import { Request, Response } from "express";
import { MLClient } from "../services/mlClient";
import { MLFeatureExtractor } from "../services/mlFeatureExtractor";

export const getMLHealth = async (_req: Request, res: Response): Promise<void> => {
  try {
    const health = await MLClient.getHealth();
    res.status(200).json({
      success: true,
      data: health.data || health,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Handles ML SLO violation forecasting.
 *
 * PRODUCTION MODE (Preferred):
 * POST /api/ml/predict with { incidentId: "INC-..." }
 * Extracts authoritative runtime telemetry directly from MongoDB incident evidence
 * and Prometheus, guaranteeing zero synthetic metric fabrication.
 *
 * TEST MODE:
 * POST /api/ml/predict with direct features { service, cpuUsage, memoryUsage, ... }
 * Strict validation: requires explicit service (no Checkout default), explicit numeric
 * verification, and rejects missing features with INSUFFICIENT_TELEMETRY.
 */
export const predictViolation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { incidentId } = req.body || {};

    if (incidentId && typeof incidentId === "string" && incidentId.trim() !== "") {
      // 1. Production Incident-Based Inference Flow
      const extraction = await MLFeatureExtractor.extractForIncident(incidentId.trim());

      if (extraction.status === "ERROR") {
        res.status(404).json({
          success: false,
          status: "ERROR",
          message: extraction.error || `Failed to extract telemetry for incident ${incidentId}`,
        });
        return;
      }

      if (extraction.status === "INSUFFICIENT_TELEMETRY") {
        res.status(200).json({
          success: false,
          status: "INSUFFICIENT_TELEMETRY",
          message: "Insufficient telemetry for ML prediction",
          missingFeatures: extraction.missingFeatures,
          incidentId: extraction.incidentId,
          sloId: extraction.sloId,
          service: extraction.service,
          requirementId: extraction.requirementId,
        });
        return;
      }

      // Execute ML inference on verified real telemetry features
      const prediction = await MLClient.predict({
        incidentId: extraction.incidentId,
        sloId: extraction.sloId,
        requirementId: extraction.requirementId,
        service: extraction.service,
        featureTimestamp: extraction.featureTimestamp,
        mode: "PRODUCTION",
        features: extraction.features!,
        featureSources: extraction.featureSources,
      });

      res.status(200).json({
        success: true,
        data: prediction,
      });
      return;
    }

    // 2. Direct Feature Submission (TEST Mode)
    const extraction = MLFeatureExtractor.extractFromDirectInput(req.body || {});

    if (extraction.status === "ERROR") {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: extraction.error || "Invalid telemetry feature payload",
      });
      return;
    }

    if (extraction.status === "INSUFFICIENT_TELEMETRY") {
      res.status(200).json({
        success: false,
        status: "INSUFFICIENT_TELEMETRY",
        message: "Insufficient telemetry for ML prediction",
        missingFeatures: extraction.missingFeatures,
        service: extraction.service,
        requirementId: extraction.requirementId,
        incidentId: extraction.incidentId,
        sloId: extraction.sloId,
      });
      return;
    }

    const prediction = await MLClient.predict({
      incidentId: extraction.incidentId,
      sloId: extraction.sloId,
      requirementId: extraction.requirementId,
      service: extraction.service,
      featureTimestamp: extraction.featureTimestamp,
      mode: "TEST",
      features: extraction.features!,
      featureSources: extraction.featureSources,
    });

    res.status(200).json({
      success: true,
      data: prediction,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: "ML prediction failed",
      error: error instanceof Error ? error.message : error,
    });
  }
};
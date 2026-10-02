/**
 * ML Predictor - Production Telemetry Model Adapter
 * Replaces legacy synthetic scoring with genuine SLOViolationClassifier model inference.
 */

import { SLOViolationClassifier } from "../../../../ml-service/src/model";

export interface MLPrediction {
  violationProbability: number;
  prediction: "VIOLATION" | "NO_VIOLATION";
  factors?: Record<string, number>;
}

export const predictSLOViolation = (
  cpuUsage: number,
  memoryUsage: number,
  errorRate: number,
  latency: number,
  deploymentChanged = 0,
  requestRate = 0
): MLPrediction => {
  const result = SLOViolationClassifier.predict({
    cpuUsage,
    memoryUsage,
    errorRate,
    latency,
    requestRate,
    deploymentChanged,
  });

  if (result.status === "INSUFFICIENT_TELEMETRY") {
    throw new Error(
      `Insufficient telemetry for prediction: missing [${result.missingFeatures?.join(", ")}]`
    );
  }

  return {
    violationProbability: result.violationProbability,
    prediction: result.prediction,
    factors: result.factors,
  };
};
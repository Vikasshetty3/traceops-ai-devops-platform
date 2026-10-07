import { SLOViolationClassifier } from "../../../ml-service/src/model";

export interface MLInferencePayload {
  incidentId?: string;
  sloId?: string;
  requirementId: string | null;
  service: string;
  featureTimestamp: string;
  mode?: "PRODUCTION" | "TEST";
  features: {
    cpuUsage: number;
    memoryUsage: number;
    p95Latency: number;
    errorRate: number;
    requestRate: number;
    deploymentChanged: number;
  };
  featureSources?: Record<string, any>;
}

export class MLClient {
  private static mlServiceUrl =
    process.env.ML_SERVICE_URL || "http://localhost:5001";

  public static async predict(payload: MLInferencePayload) {
    try {
      const response = await fetch(`${this.mlServiceUrl}/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(2000),
      });

      if (response.ok) {
        const json: any = await response.json();
        if (json.data) {
          const expectedVersion = SLOViolationClassifier.getActiveModelVersion();
          if (!json.data.modelVersion || json.data.modelVersion === expectedVersion) {
            return json.data;
          }
        }
      }
    } catch (_err) {
      // Standalone ML container unreachable: fall back to embedded SLOViolationClassifier
    }

    // Embedded authoritative inference
    const fallbackPrediction = SLOViolationClassifier.predict({
      cpuUsage: payload.features.cpuUsage,
      memoryUsage: payload.features.memoryUsage,
      errorRate: payload.features.errorRate,
      p95Latency: payload.features.p95Latency,
      requestRate: payload.features.requestRate,
      deploymentChanged: payload.features.deploymentChanged,
    });

    if (fallbackPrediction.status === "INSUFFICIENT_TELEMETRY") {
      return {
        status: "INSUFFICIENT_TELEMETRY",
        mode: payload.mode || "PRODUCTION",
        incidentId: payload.incidentId,
        sloId: payload.sloId,
        requirementId: payload.requirementId,
        service: payload.service,
        modelVersion: SLOViolationClassifier.MODEL_VERSION,
        schemaVersion: SLOViolationClassifier.FEATURE_SCHEMA_VERSION,
        missingFeatures: fallbackPrediction.missingFeatures,
      };
    }

    return {
      mode: payload.mode || "PRODUCTION",
      service: payload.service,
      requirementId: payload.requirementId,
      incidentId: payload.incidentId,
      sloId: payload.sloId,
      featureTimestamp: payload.featureTimestamp,
      features: payload.features,
      featureSources: payload.featureSources,
      ...fallbackPrediction,
    };
  }
}
import { SLOViolationClassifier } from "../../../ml-service/src/model";

export class MLClient {
  private static mlServiceUrl =
    process.env.ML_SERVICE_URL || "http://localhost:5001";

  public static async predict(payload: {
    requirementId?: string;
    service?: string;
    cpuUsage: number;
    memoryUsage: number;
    errorRate: number;
    latency: number;
    requestRate?: number;
    dbPoolUsage?: number;
    deploymentChanged?: number | boolean;
  }) {
    try {
      const response = await fetch(`${this.mlServiceUrl}/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(1500),
      });

      if (response.ok) {
        const json: any = await response.json();

        if (json.success && json.data) {
          return json.data;
        }
      }
    } catch (_err) {
      // Standalone ML service unavailable: fall back to authoritative SLOViolationClassifier
    }

    const fallbackPrediction = SLOViolationClassifier.predict({
      cpuUsage: Number(payload.cpuUsage),
      memoryUsage: Number(payload.memoryUsage),
      errorRate: Number(payload.errorRate),
      latency: Number(payload.latency),
      requestRate:
        payload.requestRate !== undefined
          ? Number(payload.requestRate)
          : undefined,
      dbPoolUsage:
        payload.dbPoolUsage !== undefined
          ? Number(payload.dbPoolUsage)
          : undefined,
      deploymentChanged: payload.deploymentChanged,
    });

    return {
      requirementId: payload.requirementId,
      service: payload.service,
      ...fallbackPrediction,
    };
  }
}
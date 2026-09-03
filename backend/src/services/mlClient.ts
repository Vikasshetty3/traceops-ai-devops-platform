import { SLOViolationClassifier } from "../../../ml-service/src/model";

export class MLClient {
  private static mlServiceUrl = process.env.ML_SERVICE_URL || "http://localhost:5001";

  public static async predict(payload: {
    requirementId: string;
    service: string;
    cpuUsage: number;
    memoryUsage: number;
    errorRate: number;
    latency: number;
    deploymentChanged: number | boolean;
  }) {
    // Attempt to call standalone ML Microservice if accessible
    try {
      const response = await fetch(`${this.mlServiceUrl}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(1000), // Fast 1s timeout
      });

      if (response.ok) {
        const json: any = await response.json();
        if (json.success && json.data) {
          return json.data;
        }
      }
    } catch (_err) {
      // Standalone ML service is not active, evaluate directly via authoritative model
    }

    // Direct Authoritative Model Evaluation
    const prediction = SLOViolationClassifier.predict({
      cpuUsage: payload.cpuUsage,
      memoryUsage: payload.memoryUsage,
      errorRate: payload.errorRate,
      latency: payload.latency,
      deploymentChanged: payload.deploymentChanged,
    });

    return {
      requirementId: payload.requirementId,
      service: payload.service,
      ...prediction,
    };
  }
}

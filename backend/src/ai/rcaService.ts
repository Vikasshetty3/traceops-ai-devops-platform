export interface RCAInput {
  service: string;
  metric: string;
  actualValue: number;
  threshold: number;
  requirementId: string;
  incidentId?: string;
  logs?: string[];
  deploymentChanged?: boolean;
  cpuUsage?: number;
  memoryUsage?: number;
  errorRate?: number;
}

export interface RCAResult {
  rootCause: string;
  evidence: string[];
  confidence: number;
  recommendedAction: string;
  status?: "EVIDENCE_BACKED" | "INSUFFICIENT_EVIDENCE";
  confidenceRationale?: string;
  observedFacts?: string[];
}

export const analyzeRootCause = (
  input: RCAInput
): RCAResult => {
  // If essential telemetry signals are missing, return INSUFFICIENT_EVIDENCE
  if (
    input.actualValue === undefined ||
    input.threshold === undefined ||
    !input.service ||
    !input.metric
  ) {
    return {
      rootCause: "INSUFFICIENT_EVIDENCE: Required telemetry signals missing.",
      evidence: ["Missing telemetry values or service definition"],
      confidence: 0.0,
      recommendedAction: "Verify telemetry collection and scraper configuration",
      status: "INSUFFICIENT_EVIDENCE",
      confidenceRationale: "Cannot perform RCA without observed telemetry values.",
      observedFacts: [],
    };
  }

  const evidence: string[] = [];
  const observedFacts: string[] = [];
  const rationaleParts: string[] = [];
  let calculatedConfidence = 0.0;

  // 1. Observed metric breach
  const breach = input.actualValue > input.threshold;
  if (breach) {
    const diff = input.threshold > 0
      ? (((input.actualValue - input.threshold) / input.threshold) * 100).toFixed(1)
      : "0";
    evidence.push(`Observed ${input.metric} is ${input.actualValue}, exceeding threshold ${input.threshold} by +${diff}%`);
    observedFacts.push(`${input.metric} measured at ${input.actualValue} vs threshold ${input.threshold} (+${diff}% breach).`);
    calculatedConfidence += 0.35;
    rationaleParts.push("Metric threshold breach verified (+35%)");
  } else {
    evidence.push(`Observed ${input.metric} is ${input.actualValue}, within threshold ${input.threshold}`);
    observedFacts.push(`${input.metric} is within threshold.`);
  }

  // 2. Corroborating signals
  let rootCause = "";
  let recommendedAction = "";

  if (input.errorRate != null && input.errorRate > 5 && input.deploymentChanged) {
    rootCause = `Application error rate elevation (${input.errorRate}%) observed following recent deployment on ${input.service}.`;
    evidence.push(`Error rate observed at ${input.errorRate}%`);
    evidence.push("Recent deployment change was recorded");
    observedFacts.push(`Error rate is ${input.errorRate}%.`);
    observedFacts.push("Recent deployment change confirmed.");
    recommendedAction = "Roll back latest deployment to prior verified image and inspect release diff";
    calculatedConfidence += 0.40;
    rationaleParts.push("Error rate spike directly correlates with deployment change (+40%)");
  } else if (input.errorRate != null && input.errorRate > 5) {
    rootCause = `Elevated application error rate (${input.errorRate}%) observed on ${input.service}.`;
    evidence.push(`Error rate is ${input.errorRate}%`);
    observedFacts.push(`HTTP error rate is ${input.errorRate}%.`);
    recommendedAction = "Inspect application container logs for unhandled 5xx exceptions and downstream failures";
    calculatedConfidence += 0.30;
    rationaleParts.push("Application error rate elevated (+30%)");
  } else if (input.cpuUsage != null && input.cpuUsage > 85) {
    rootCause = `Compute CPU saturation (${input.cpuUsage}%) degraded request throughput on ${input.service}.`;
    evidence.push(`CPU usage observed at ${input.cpuUsage}%`);
    observedFacts.push(`CPU usage is ${input.cpuUsage}%.`);
    recommendedAction = "Scale service horizontally to distribute CPU compute demand";
    calculatedConfidence += 0.35;
    rationaleParts.push("CPU compute saturation observed (+35%)");
  } else if (input.memoryUsage != null && input.memoryUsage > 85) {
    rootCause = `Memory pressure (${input.memoryUsage}%) degraded performance on ${input.service}.`;
    evidence.push(`Memory usage observed at ${input.memoryUsage}%`);
    observedFacts.push(`Memory usage is ${input.memoryUsage}%.`);
    recommendedAction = "Increase container memory allocation and profile heap retention";
    calculatedConfidence += 0.35;
    rationaleParts.push("Memory pressure observed (+35%)");
  } else if (breach) {
    rootCause = `Service performance degradation: ${input.metric} (${input.actualValue}) breached threshold (${input.threshold}) under observed traffic.`;
    recommendedAction = "Inspect service dependency latency, database queries, and connection pool saturation";
    calculatedConfidence += 0.15;
    rationaleParts.push("Performance degradation verified without node resource saturation (+15%)");
  } else {
    return {
      rootCause: "INSUFFICIENT_EVIDENCE: Telemetry within nominal operational thresholds.",
      evidence: ["No SLO or metric breach observed"],
      confidence: 0.0,
      recommendedAction: "Continue continuous monitoring; no remediation required",
      status: "INSUFFICIENT_EVIDENCE",
      confidenceRationale: "Telemetry is healthy; no failure or breach detected.",
      observedFacts,
    };
  }

  // 3. Container logs verification
  if (input.logs && input.logs.length > 0) {
    evidence.push(`Corroborated by ${input.logs.length} application log entries`);
    observedFacts.push(`${input.logs.length} application log lines observed.`);
    calculatedConfidence += 0.15;
    rationaleParts.push(`Application logs corroborate event (+15%)`);
  }

  // 4. Traceability link
  if (input.requirementId) {
    observedFacts.push(`Linked to requirement ${input.requirementId}.`);
    calculatedConfidence += 0.10;
    rationaleParts.push("Requirement traceability confirmed (+10%)");
  }

  // Final confidence calculation (strictly evidence-derived, max 0.95)
  const finalConfidence = Number(Math.min(0.95, Math.max(0.1, calculatedConfidence)).toFixed(2));

  return {
    rootCause,
    evidence,
    confidence: finalConfidence,
    recommendedAction,
    status: "EVIDENCE_BACKED",
    confidenceRationale: `Evidence-derived confidence: ${rationaleParts.join("; ")}.`,
    observedFacts,
  };
};
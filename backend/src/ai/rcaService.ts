export interface RCAInput {
  service: string;
  metric: string;
  actualValue: number;
  threshold: number;
  requirementId: string;
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
}

export const analyzeRootCause = (
  input: RCAInput
): RCAResult => {
  const evidence: string[] = [];
  let rootCause = "Undetermined - telemetry within expected ranges";
  let recommendedAction = "Investigate service manually";
  let confidence = 0.5;

  if (input.errorRate != null && input.errorRate > 5 && input.deploymentChanged) {
    rootCause = "Recent deployment may have introduced application errors";
    evidence.push(
      `Error rate is ${input.errorRate}%`
    );
    evidence.push(
      "A recent deployment change was detected"
    );
    recommendedAction = "Consider rolling back the latest deployment";
    confidence = 0.9;
  } else if (input.cpuUsage != null && input.cpuUsage > 85) {
    rootCause = "High CPU utilization";
    evidence.push(
      `CPU usage is ${input.cpuUsage}%`
    );
    recommendedAction = "Scale the service horizontally";
    confidence = 0.88;
  } else if (input.memoryUsage != null && input.memoryUsage > 85) {
    rootCause = "High memory utilization";
    evidence.push(
      `Memory usage is ${input.memoryUsage}%`
    );
    recommendedAction = "Increase memory resources or scale the service";
    confidence = 0.86;
  } else if (input.errorRate != null && input.errorRate > 5) {
    rootCause = "High application error rate";
    evidence.push(
      `Error rate is ${input.errorRate}%`
    );
    recommendedAction = "Inspect application logs and recent changes";
    confidence = 0.82;
  } else if (input.actualValue > input.threshold) {
    rootCause = "Service performance degradation";
    evidence.push(
      `Observed ${input.metric} is ${input.actualValue}, exceeding threshold ${input.threshold}`
    );
    recommendedAction = "Investigate service dependencies and scale if necessary";
    confidence = 0.7;
  }

  if (input.logs && input.logs.length > 0) {
    evidence.push(
      `${input.logs.length} application log entries were provided`
    );
  }

  return {
    rootCause,
    evidence,
    confidence,
    recommendedAction,
  };
};
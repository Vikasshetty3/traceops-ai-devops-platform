export interface MLPrediction {
  violationProbability: number;
  prediction: "VIOLATION" | "NO_VIOLATION";
}

export const predictSLOViolation = (
  cpuUsage: number,
  memoryUsage: number,
  errorRate: number,
  latency: number,
  deploymentChanged: number
): MLPrediction => {
  let score = 0;

  if (cpuUsage > 80) {
    score += 0.25;
  }

  if (memoryUsage > 80) {
    score += 0.20;
  }

  if (errorRate > 5) {
    score += 0.25;
  }

  if (latency > 2) {
    score += 0.30;
  }

  if (deploymentChanged === 1) {
    score += 0.10;
  }

  const violationProbability = Math.min(score, 1);

  return {
    violationProbability,
    prediction:
      violationProbability >= 0.5
        ? "VIOLATION"
        : "NO_VIOLATION",
  };
};
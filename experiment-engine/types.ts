export interface ExperimentInput {
  rcaId?: string;
  requirementId: string;
  service: string;
  remediationAction: string;
  parameterName: string;
  currentValue: number | string;
  proposedValue: number | string;
  currentLatency: number;
  currentErrorRate: number;
  currentCpu: number;
  currentMemory: number;
  sloThreshold: number;
}

export interface MetricSnapshot {
  latency: number;
  errorRate: number;
  cpuUsage: number;
  memoryUsage: number;
}

export interface ExperimentOutput {
  experimentId: string;
  rcaId?: string;
  requirementId: string;
  service: string;
  hypothesis: string;
  remediationAction: string;
  parameters: {
    parameterName: string;
    currentValue: number | string;
    proposedValue: number | string;
  };
  metricsBefore: MetricSnapshot;
  metricsAfter: MetricSnapshot;
  sloThreshold: number;
  result: "PASS" | "FAIL";
  improvementPct: number;
  status: "COMPLETED";
}

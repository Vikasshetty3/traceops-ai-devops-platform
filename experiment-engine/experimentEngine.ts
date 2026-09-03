import { ExperimentInput, ExperimentOutput, MetricSnapshot } from "./types";
import { SimulationModels } from "./models/simulationModels";

export class ExperimentEngine {
  /**
   * Deterministically calculates before vs after performance metrics
   * and verifies whether the proposed remediation will satisfy the SLO.
   */
  public static simulate(input: ExperimentInput): ExperimentOutput {
    const experimentId = `EXP-${Date.now().toString().slice(-5)}`;
    
    const before: MetricSnapshot = {
      latency: Number(input.currentLatency),
      errorRate: Number(input.currentErrorRate),
      cpuUsage: Number(input.currentCpu),
      memoryUsage: Number(input.currentMemory),
    };

    let after: MetricSnapshot;
    const paramLower = input.parameterName.toLowerCase();
    const actionLower = input.remediationAction.toLowerCase();

    if (paramLower.includes("pool") || actionLower.includes("pool")) {
      const cur = Number(input.currentValue) || 20;
      const prop = Number(input.proposedValue) || 40;
      after = SimulationModels.simulateDatabasePool(cur, prop, before);
    } else if (paramLower.includes("replica") || actionLower.includes("scale")) {
      const cur = Number(input.currentValue) || 2;
      const prop = Number(input.proposedValue) || 4;
      after = SimulationModels.simulateReplicaScaling(cur, prop, before);
    } else {
      after = SimulationModels.simulateCacheTuning(before, input.parameterName);
    }

    const improvementPct = Number(
      (((before.latency - after.latency) / before.latency) * 100).toFixed(1)
    );

    const isPass = after.latency <= input.sloThreshold && after.errorRate <= 1.0;

    const hypothesis = `Increasing ${input.parameterName} from ${input.currentValue} to ${input.proposedValue} will reduce response latency from ${before.latency}s to ${after.latency}s (${improvementPct}% improvement) and satisfy SLO (${input.sloThreshold}s).`;

    return {
      experimentId,
      rcaId: input.rcaId,
      requirementId: input.requirementId,
      service: input.service,
      hypothesis,
      remediationAction: input.remediationAction,
      parameters: {
        parameterName: input.parameterName,
        currentValue: input.currentValue,
        proposedValue: input.proposedValue,
      },
      metricsBefore: before,
      metricsAfter: after,
      sloThreshold: input.sloThreshold,
      result: isPass ? "PASS" : "FAIL",
      improvementPct,
      status: "COMPLETED",
    };
  }
}

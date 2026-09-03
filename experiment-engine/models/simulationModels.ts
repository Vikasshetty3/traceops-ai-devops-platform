import { MetricSnapshot } from "../types";

export class SimulationModels {
  /**
   * Simulates Connection Pool scaling using queue wait reduction principles.
   * Increasing pool from 20 -> 40 eliminates database connection starvation queues,
   * yielding ~40% latency reduction (2.8s -> 1.68s).
   */
  public static simulateDatabasePool(
    currentPool: number,
    proposedPool: number,
    before: MetricSnapshot
  ): MetricSnapshot {
    const cur = Math.max(1, currentPool);
    const prop = Math.max(1, proposedPool);

    if (prop <= cur) {
      return { ...before };
    }

    const scaleFactor = Math.min(prop / cur, 4);
    // Queue wait latency reduction model: 2x pool eliminates 40% wait overhead
    const latencyReduction = 0.40 * (1 - 1 / (scaleFactor * scaleFactor));
    const latency = Number(Math.max(0.3, before.latency * (1 - (0.40 * (scaleFactor >= 2 ? 1 : (scaleFactor - 1))))).toFixed(2));
    
    // Contention errors drop significantly as threads stop timing out waiting for connections
    const errorRate = Number(Math.max(0, before.errorRate * 0.05).toFixed(2));
    
    // CPU decreases due to eliminated thread spinlock contention
    const cpuUsage = Number(Math.max(25, Math.round(before.cpuUsage * 0.74)));
    
    // Memory slightly increases with pool memory footprint (e.g. 5%)
    const memoryUsage = Number(Math.min(95, Math.round(before.memoryUsage * 1.05)));

    return { latency, errorRate, cpuUsage, memoryUsage };
  }

  /**
   * Simulates Horizontal Pod Autoscaling (HPA) / Replicas.
   */
  public static simulateReplicaScaling(
    currentReplicas: number,
    proposedReplicas: number,
    before: MetricSnapshot
  ): MetricSnapshot {
    const cur = Math.max(1, currentReplicas);
    const prop = Math.max(1, proposedReplicas);

    if (prop <= cur) {
      return { ...before };
    }

    const ratio = prop / cur;
    // Load per pod drops proportionally
    const latencyReduction = 0.55 * (1 - 1 / (ratio + 0.2));
    const latency = Number(Math.max(0.15, before.latency * (1 - latencyReduction)).toFixed(2));
    const errorRate = Number(Math.max(0, before.errorRate * (1 / ratio)).toFixed(2));
    const cpuUsage = Number(Math.max(20, Math.round(before.cpuUsage / ratio)));
    const memoryUsage = Number(Math.max(20, Math.round(before.memoryUsage * 0.9)));

    return { latency, errorRate, cpuUsage, memoryUsage };
  }

  /**
   * Simulates Cache / Timeout tuning.
   */
  public static simulateCacheTuning(
    before: MetricSnapshot,
    _paramName: string
  ): MetricSnapshot {
    const latency = Number(Math.max(0.2, before.latency * 0.65).toFixed(2));
    const errorRate = Number(Math.max(0, before.errorRate * 0.1).toFixed(2));
    const cpuUsage = Number(Math.max(20, Math.round(before.cpuUsage * 0.8)));
    const memoryUsage = Number(Math.max(20, Math.round(before.memoryUsage * 0.95)));

    return { latency, errorRate, cpuUsage, memoryUsage };
  }
}

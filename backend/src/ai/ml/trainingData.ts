export interface TrainingRecord {
  cpuUsage: number;
  memoryUsage: number;
  errorRate: number;
  latency: number;
  deploymentChanged: number;
  sloViolated: number;
}

export const trainingData: TrainingRecord[] = [
  {
    cpuUsage: 92,
    memoryUsage: 60,
    errorRate: 2,
    latency: 2.8,
    deploymentChanged: 0,
    sloViolated: 1,
  },
  {
    cpuUsage: 45,
    memoryUsage: 50,
    errorRate: 1,
    latency: 1.2,
    deploymentChanged: 0,
    sloViolated: 0,
  },
  {
    cpuUsage: 88,
    memoryUsage: 70,
    errorRate: 3,
    latency: 2.4,
    deploymentChanged: 0,
    sloViolated: 1,
  },
  {
    cpuUsage: 40,
    memoryUsage: 45,
    errorRate: 1,
    latency: 1.1,
    deploymentChanged: 0,
    sloViolated: 0,
  },
  {
    cpuUsage: 60,
    memoryUsage: 90,
    errorRate: 2,
    latency: 2.3,
    deploymentChanged: 0,
    sloViolated: 1,
  },
  {
    cpuUsage: 50,
    memoryUsage: 55,
    errorRate: 1,
    latency: 1.4,
    deploymentChanged: 0,
    sloViolated: 0,
  },
  {
    cpuUsage: 70,
    memoryUsage: 65,
    errorRate: 8,
    latency: 3.1,
    deploymentChanged: 1,
    sloViolated: 1,
  },
  {
    cpuUsage: 42,
    memoryUsage: 48,
    errorRate: 1,
    latency: 1.3,
    deploymentChanged: 0,
    sloViolated: 0,
  },
];
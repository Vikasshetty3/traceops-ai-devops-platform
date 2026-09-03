/**
 * Synthetic DevOps Telemetry Dataset Generator for SLO Breach Forecasting
 * Research-Grade Reproducible Synthetic Dataset with Fixed Random Seed (Mulberry32 PRNG)
 */

import * as fs from "fs";
import * as path from "path";

// Deterministic Pseudo-Random Number Generator (Mulberry32)
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller transform for normal distribution sampling
function randomNormal(prng: () => number, mean = 0, stdDev = 1): number {
  const u1 = Math.max(1e-7, prng());
  const u2 = prng();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z0 * stdDev;
}

export interface TelemetrySample {
  sampleId: string;
  service: string;
  cpuUsage: number;           // % (0 - 100)
  memoryUsage: number;        // % (0 - 100)
  p95Latency: number;         // seconds (0.05 - 10.0)
  errorRate: number;          // % (0.0 - 50.0)
  requestRate: number;        // requests / sec (10 - 2500)
  dbPoolUsage: number;        // % (0 - 100)
  deploymentChanged: number;  // 0 = False, 1 = True
  sloThreshold: number;       // seconds (e.g. 2.0s)
  slo_violation: number;      // Target label: 1 = VIOLATION, 0 = NO_VIOLATION
}

export function generateTelemetryDataset(
  sampleCount = 1500,
  seed = 42
): TelemetrySample[] {
  const prng = mulberry32(seed);
  const services = ["Checkout", "Payments", "Orders", "Authentication", "Inventory"];
  const samples: TelemetrySample[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const service = services[Math.floor(prng() * services.length)];
    const sloThreshold = 2.0; // 2.0 seconds p95 target

    // Generate realistic regime: 65% Normal / Low Load, 20% Contention / Saturation, 15% Bad Deployment / Cascading
    const regimeRand = prng();
    let cpuUsage: number;
    let memoryUsage: number;
    let p95Latency: number;
    let errorRate: number;
    let requestRate: number;
    let dbPoolUsage: number;
    let deploymentChanged: number;

    if (regimeRand < 0.65) {
      // Normal healthy operational regime
      cpuUsage = Math.min(75, Math.max(15, randomNormal(prng, 42, 12)));
      memoryUsage = Math.min(78, Math.max(25, randomNormal(prng, 48, 10)));
      requestRate = Math.min(800, Math.max(50, randomNormal(prng, 320, 90)));
      dbPoolUsage = Math.min(65, Math.max(10, randomNormal(prng, 35, 12)));
      deploymentChanged = prng() < 0.08 ? 1 : 0;
      errorRate = Math.max(0, randomNormal(prng, 0.05, 0.04));
      // Normal latency well below SLO threshold
      p95Latency = Math.max(0.08, randomNormal(prng, 0.45, 0.25));
    } else if (regimeRand < 0.85) {
      // High load / database connection pool starvation regime
      cpuUsage = Math.min(99, Math.max(78, randomNormal(prng, 89, 6)));
      memoryUsage = Math.min(95, Math.max(65, randomNormal(prng, 79, 7)));
      requestRate = Math.min(2200, Math.max(900, randomNormal(prng, 1400, 300)));
      dbPoolUsage = Math.min(100, Math.max(82, randomNormal(prng, 94, 4)));
      deploymentChanged = prng() < 0.20 ? 1 : 0;
      errorRate = Math.max(0.5, randomNormal(prng, 2.5, 1.2));
      // Latency frequently breaches SLO
      p95Latency = Math.max(1.8, randomNormal(prng, 2.9, 0.7));
    } else {
      // Faulty deployment / memory leak / exception storm regime
      deploymentChanged = 1;
      cpuUsage = Math.min(99, Math.max(50, randomNormal(prng, 82, 10)));
      memoryUsage = Math.min(99, Math.max(70, randomNormal(prng, 91, 6)));
      requestRate = Math.min(1200, Math.max(100, randomNormal(prng, 500, 150)));
      dbPoolUsage = Math.min(99, Math.max(50, randomNormal(prng, 75, 15)));
      errorRate = Math.max(3.0, randomNormal(prng, 8.5, 3.5));
      p95Latency = Math.max(1.6, randomNormal(prng, 3.4, 0.9));
    }

    // Round values to realistic precision
    cpuUsage = Number(cpuUsage.toFixed(1));
    memoryUsage = Number(memoryUsage.toFixed(1));
    p95Latency = Number(p95Latency.toFixed(2));
    errorRate = Number(errorRate.toFixed(2));
    requestRate = Math.round(requestRate);
    dbPoolUsage = Number(dbPoolUsage.toFixed(1));

    // Ground truth target: true SLO violation when latency > sloThreshold or errorRate > 2.5%
    const isViolated = p95Latency >= sloThreshold || errorRate >= 2.5 || (cpuUsage > 92 && dbPoolUsage > 90) ? 1 : 0;

    samples.push({
      sampleId: `SAMPLE-${String(i + 1).padStart(5, "0")}`,
      service,
      cpuUsage,
      memoryUsage,
      p95Latency,
      errorRate,
      requestRate,
      dbPoolUsage,
      deploymentChanged,
      sloThreshold,
      slo_violation: isViolated,
    });
  }

  return samples;
}

export function saveDatasetFiles(): { jsonPath: string; csvPath: string; count: number } {
  const dataset = generateTelemetryDataset(1500, 42);
  const targetDirs = [
    path.resolve(__dirname, "../../data"),
    path.resolve(__dirname, "../../../ml-service/data"),
    path.resolve(process.cwd(), "data"),
    path.resolve(process.cwd(), "ml-service/data"),
  ];

  for (const dir of targetDirs) {
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    }
    fs.writeFileSync(path.join(dir, "telemetry_dataset.json"), JSON.stringify(dataset, null, 2), "utf-8");
    const csvHeader = "sampleId,service,cpuUsage,memoryUsage,p95Latency,errorRate,requestRate,dbPoolUsage,deploymentChanged,sloThreshold,slo_violation\n";
    const csvRows = dataset
      .map(
        (s) =>
          `${s.sampleId},${s.service},${s.cpuUsage},${s.memoryUsage},${s.p95Latency},${s.errorRate},${s.requestRate},${s.dbPoolUsage},${s.deploymentChanged},${s.sloThreshold},${s.slo_violation}`
      )
      .join("\n");
    fs.writeFileSync(path.join(dir, "telemetry_dataset.csv"), csvHeader + csvRows, "utf-8");
  }

  const jsonPath = path.join(targetDirs[0], "telemetry_dataset.json");
  const csvPath = path.join(targetDirs[0], "telemetry_dataset.csv");

  return { jsonPath, csvPath, count: dataset.length };
}

if (require.main === module) {
  saveDatasetFiles();
}

import { ExperimentEngine } from "../experiment-engine";

async function testExperimentEngine() {
  console.log("🚀 Running Experiment Engine Unit Tests...\n");
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${msg}`);
    }
  }

  // 1. Connection pool simulation test (20 -> 40)
  const poolExp = ExperimentEngine.simulate({
    requirementId: "REQ-001",
    service: "Checkout",
    remediationAction: "Increase DB Connection Pool",
    parameterName: "DB Connection Pool",
    currentValue: 20,
    proposedValue: 40,
    currentLatency: 2.8,
    currentErrorRate: 2.0,
    currentCpu: 92,
    currentMemory: 60,
    sloThreshold: 2.0,
  });

  assert(
    poolExp.result === "PASS",
    `DB Pool experiment returns PASS (latency ${poolExp.metricsAfter.latency}s <= 2.0s)`
  );
  assert(
    poolExp.metricsAfter.latency < poolExp.metricsBefore.latency,
    "Simulated latency is reduced after pool increase"
  );
  assert(
    poolExp.metricsAfter.errorRate < poolExp.metricsBefore.errorRate,
    "Simulated error rate is reduced"
  );
  assert(
    poolExp.improvementPct > 0,
    `Improvement percentage is positive (+${poolExp.improvementPct}%)`
  );

  // 2. Replica scale simulation test (2 -> 4)
  const replicaExp = ExperimentEngine.simulate({
    requirementId: "REQ-002",
    service: "Checkout",
    remediationAction: "Scale Replicas",
    parameterName: "Replicas",
    currentValue: 2,
    proposedValue: 4,
    currentLatency: 2.5,
    currentErrorRate: 1.5,
    currentCpu: 90,
    currentMemory: 70,
    sloThreshold: 2.0,
  });

  assert(
    replicaExp.result === "PASS",
    `Replica scaling experiment returns PASS (${replicaExp.metricsAfter.latency}s <= 2.0s)`
  );
  assert(
    replicaExp.metricsAfter.cpuUsage < replicaExp.metricsBefore.cpuUsage,
    "Pod CPU load is reduced with additional replicas"
  );

  // 3. Negative test (Insufficient remediation that FAILS SLO)
  const failExp = ExperimentEngine.simulate({
    requirementId: "REQ-001",
    service: "Checkout",
    remediationAction: "Minor timeout tweak",
    parameterName: "Timeout",
    currentValue: 100,
    proposedValue: 105,
    currentLatency: 4.5,
    currentErrorRate: 8.0,
    currentCpu: 99,
    currentMemory: 95,
    sloThreshold: 1.0,
  });

  assert(
    failExp.result === "FAIL",
    `Engine correctly returns FAIL when simulated latency (${failExp.metricsAfter.latency}s) exceeds threshold (1.0s)`
  );

  console.log(`\nExperiment Engine Test Summary: ${passed}/${total} PASSED\n`);
  if (passed !== total) process.exit(1);
}

testExperimentEngine();

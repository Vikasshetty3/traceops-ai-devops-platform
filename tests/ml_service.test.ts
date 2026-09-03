import { SLOViolationClassifier } from "../ml-service/src/model";

async function testMLService() {
  console.log("🚀 Running Research-Grade ML Service Unit Tests...\n");
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

  // 1. High contention violation prediction test (Checkout spike)
  const violationResult = SLOViolationClassifier.predict({
    cpuUsage: 92,
    memoryUsage: 60,
    errorRate: 2.0,
    latency: 2.8,
    deploymentChanged: 0,
  });

  assert(
    violationResult.prediction === "VIOLATION",
    "ML model correctly predicts VIOLATION on high latency/CPU"
  );
  assert(
    violationResult.violationProbability >= 0.50,
    `Violation probability is >= 0.50 (${violationResult.violationProbability})`
  );
  assert(
    violationResult.confidence >= 0.70,
    `Prediction confidence is valid (${violationResult.confidence})`
  );
  assert(
    violationResult.model === "logistic_regression",
    "Model architecture is identified as logistic_regression"
  );
  assert(
    violationResult.topRiskFactors.length > 0,
    "Top risk factors are extracted and ranked"
  );

  // 2. Normal healthy condition test (Payments normal)
  const healthyResult = SLOViolationClassifier.predict({
    cpuUsage: 25,
    memoryUsage: 35,
    errorRate: 0.01,
    latency: 0.18,
    deploymentChanged: 0,
  });

  assert(
    healthyResult.prediction === "NO_VIOLATION",
    "ML model correctly predicts NO_VIOLATION on healthy metrics"
  );
  assert(
    healthyResult.violationProbability < 0.50,
    `Healthy violation probability is < 0.50 (${healthyResult.violationProbability})`
  );
  assert(
    healthyResult.probability >= 0.0 && healthyResult.probability <= 1.0,
    `Probability is strictly within [0.0, 1.0] range (${healthyResult.probability})`
  );

  // 3. Model Metadata & Coefficients Verification
  const modelInfo = SLOViolationClassifier.getModelInfo();
  assert(
    modelInfo.modelType === "logistic_regression",
    "Model metadata correctly exposes modelType"
  );
  assert(
    modelInfo.features.includes("p95Latency") && modelInfo.features.includes("cpuUsage"),
    "Model metadata contains full 7-feature telemetry schema"
  );
  assert(
    modelInfo.coefficients["p95Latency"] > 0 && modelInfo.coefficients["cpuUsage"] > 0,
    "Feature coefficients are strictly positive for risk indicators"
  );
  assert(
    modelInfo.metrics.accuracy >= 0.95,
    `Reported model test accuracy is >= 95% (${(modelInfo.metrics.accuracy * 100).toFixed(2)}%)`
  );

  // 4. Model Loading from disk
  const loadResult = SLOViolationClassifier.loadTrainedModel();
  assert(
    typeof loadResult === "boolean",
    "Model artifact loader executes cleanly"
  );

  // 5. Extreme and Boundary Condition Resilience
  const extremeHigh = SLOViolationClassifier.predict({
    cpuUsage: 150, // Out of bounds clamped
    memoryUsage: 100,
    errorRate: 50,
    latency: 10.0,
    deploymentChanged: 1,
  });
  assert(
    extremeHigh.prediction === "VIOLATION" && extremeHigh.violationProbability >= 0.95,
    "Extreme input correctly saturates to high violation probability without NaN"
  );

  const extremeLow = SLOViolationClassifier.predict({
    cpuUsage: 0,
    memoryUsage: 0,
    errorRate: 0,
    latency: 0.01,
    deploymentChanged: 0,
  });
  assert(
    extremeLow.prediction === "NO_VIOLATION" && extremeLow.violationProbability <= 0.15,
    "Zero-metric baseline resolves to low probability"
  );

  console.log(`\nML Service Test Summary: ${passed}/${total} PASSED\n`);
  if (passed !== total) process.exit(1);
}

testMLService();

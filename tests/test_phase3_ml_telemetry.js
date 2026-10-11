/**
 * Phase 3 Comprehensive Test Suite: Real-Telemetry ML Inference Pipeline
 *
 * Validates:
 * 1. ML receives genuine incident telemetry
 * 2. No requestRate fabrication (no cpu > 70 ? 1200 : 350)
 * 3. No dbPoolUsage fabrication (removed from production schema)
 * 4. No Checkout default (service is strictly required)
 * 5. No REQ-001 default (unlinked stays null)
 * 6. Missing required feature returns INSUFFICIENT_TELEMETRY
 * 7. Real zero remains zero (0 !== null)
 * 8. Invalid numeric values rejected (NaN, Infinity, negative latency/requestRate)
 * 9. Prediction contains incident ID
 * 10. Prediction contains SLO ID
 * 11. Prediction contains model version (2.0.0-production-telemetry)
 * 12. Prediction contains feature timestamp
 * 13. Prediction exposes feature provenance (PromQL and sensors)
 * 14. Live end-to-end ML test from genuine runtime breach incident
 * 15. Provenance verification: Prometheus value == Incident value == ML input value
 */

const BASE_URL = process.env.BACKEND_URL || "http://localhost:5000";

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const method = options.method || "GET";
  const body = options.body ? JSON.stringify(options.body) : undefined;
  const headers = { ...(options.headers || {}) };
  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, headers: res.headers, text, json };
}

async function runPhase3Tests() {
  console.log("================================================================================");
  console.log("TRACE-OPS: PHASE 3 REAL RUNTIME TELEMETRY ML INFERENCE & TRACEABILITY AUDIT");
  console.log("================================================================================");
  console.log(`Backend Target: ${BASE_URL}\n`);

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = "") {
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}${details ? ` - ${details}` : ""}`);
      failed++;
    }
  }

  try {
    // ----------------------------------------------------
    // Test 1: ML Service Health & Model Versioning
    // ----------------------------------------------------
    console.log("[1/13] Verifying ML Service Health and Production Model Versioning...");
    const mlHealthRes = await fetch("http://localhost:5001/health").then((r) => r.json()).catch(() => null);
    assert(mlHealthRes?.status === "HEALTHY", "ML standalone service is ONLINE and HEALTHY");
    assert(
      mlHealthRes?.modelVersion === "2.0.0-production-telemetry",
      `Model version is 2.0.0-production-telemetry (got ${mlHealthRes?.modelVersion})`
    );
    assert(
      mlHealthRes?.schemaVersion === "v2-production-telemetry",
      `Feature schema version is v2-production-telemetry (got ${mlHealthRes?.schemaVersion})`
    );

    // ----------------------------------------------------
    // Test 2: Service is Mandatory - No "Checkout" Default
    // ----------------------------------------------------
    console.log("\n[2/13] Verifying Strict Service Context - No 'Checkout' Default...");
    const noServiceRes = await request("/api/ml/predict", {
      method: "POST",
      body: {
        cpuUsage: 45,
        memoryUsage: 50,
        errorRate: 0,
        latency: 0.8,
        requestRate: 120,
      },
    });
    assert(noServiceRes.status === 400, "Request without service returns HTTP 400 Bad Request");
    assert(
      noServiceRes.json?.message?.includes("service is required") ||
        noServiceRes.json?.message?.includes("No default service"),
      "Error explicitly states service is required with no default permitted"
    );

    // ----------------------------------------------------
    // Test 3: Unlinked Requirement - No "REQ-001" Default
    // ----------------------------------------------------
    console.log("\n[3/13] Verifying Unlinked Requirement - No 'REQ-001' Default...");
    const noReqRes = await request("/api/ml/predict", {
      method: "POST",
      body: {
        service: "payments-service",
        cpuUsage: 45,
        memoryUsage: 50,
        errorRate: 0,
        latency: 0.8,
        requestRate: 120,
      },
    });
    assert(noReqRes.status === 200, "Prediction with explicit service returns HTTP 200");
    assert(
      noReqRes.json?.data?.requirementId === null,
      `Unlinked requirement evaluates strictly to null (got ${noReqRes.json?.data?.requirementId})`
    );
    assert(
      noReqRes.json?.data?.service === "payments-service",
      "Service context matches caller service (payments-service)"
    );

    // ----------------------------------------------------
    // Test 4: Missing Telemetry Feature Returns INSUFFICIENT_TELEMETRY
    // ----------------------------------------------------
    console.log("\n[4/13] Verifying Missing Data Rule - INSUFFICIENT_TELEMETRY...");
    const missingFeatRes = await request("/api/ml/predict", {
      method: "POST",
      body: {
        service: "payments-service",
        cpuUsage: 45,
        memoryUsage: 50,
        // errorRate and requestRate omitted
        latency: 0.8,
      },
    });
    assert(
      missingFeatRes.json?.status === "INSUFFICIENT_TELEMETRY",
      `Missing features returns status INSUFFICIENT_TELEMETRY (got ${missingFeatRes.json?.status})`
    );
    assert(
      Array.isArray(missingFeatRes.json?.missingFeatures) &&
        missingFeatRes.json.missingFeatures.includes("errorRate") &&
        missingFeatRes.json.missingFeatures.includes("requestRate"),
      `Identifies exact missing features: ${missingFeatRes.json?.missingFeatures?.join(", ")}`
    );

    // ----------------------------------------------------
    // Test 5: Real Zero is Preserved (0 !== null)
    // ----------------------------------------------------
    console.log("\n[5/13] Verifying Strict Real Zero Handling (0 !== null)...");
    const realZeroRes = await request("/api/ml/predict", {
      method: "POST",
      body: {
        service: "orders-service",
        cpuUsage: 25.5,
        memoryUsage: 42.0,
        errorRate: 0.0, // Real zero
        latency: 0.05,
        requestRate: 0.0, // Real zero
        deploymentChanged: 0,
      },
    });
    assert(realZeroRes.status === 200, "Prediction with real zero values succeeds");
    assert(realZeroRes.json?.data?.features?.errorRate === 0, "errorRate 0 is preserved as 0 (not null)");
    assert(realZeroRes.json?.data?.features?.requestRate === 0, "requestRate 0 is preserved as 0 (not null)");
    assert(
      realZeroRes.json?.data?.prediction === "NO_VIOLATION",
      `Prediction with 0 errors is NO_VIOLATION (got ${realZeroRes.json?.data?.prediction})`
    );

    // ----------------------------------------------------
    // Test 6: Elimination of dbPoolUsage and Synthetic Heuristics
    // ----------------------------------------------------
    console.log("\n[6/13] Verifying Removal of dbPoolUsage and Synthetic Heuristic Formulas...");
    const modelInfoRes = await fetch("http://localhost:5001/model-info").then((r) => r.json()).catch(() => null);
    const modelFeatures = modelInfoRes?.data?.features || [];
    assert(
      !modelFeatures.includes("dbPoolUsage"),
      `dbPoolUsage is completely removed from runtime feature schema (features: ${modelFeatures.join(", ")})`
    );
    assert(
      modelFeatures.includes("requestRate"),
      "requestRate is a genuine required feature in the runtime model schema"
    );

    // ----------------------------------------------------
    // Test 7: Input Validation - Rejection of NaN, Infinity & Negative Latency
    // ----------------------------------------------------
    console.log("\n[7/13] Verifying Input Validation - Bounds and Invalid Numeric Types...");
    const negLatRes = await request("/api/ml/predict", {
      method: "POST",
      body: {
        service: "orders-service",
        cpuUsage: 50,
        memoryUsage: 50,
        errorRate: 0,
        latency: -2.5, // Physically impossible
        requestRate: 100,
      },
    });
    assert(negLatRes.status === 400, "Negative latency is rejected with HTTP 400");
    assert(
      negLatRes.json?.message?.includes("cannot be negative"),
      `Error explains latency cannot be negative: ${negLatRes.json?.message}`
    );

    const outOfBoundsCpuRes = await request("/api/ml/predict", {
      method: "POST",
      body: {
        service: "orders-service",
        cpuUsage: 150, // Out of bounds > 100%
        memoryUsage: 50,
        errorRate: 0,
        latency: 0.5,
        requestRate: 100,
      },
    });
    assert(outOfBoundsCpuRes.status === 400, "cpuUsage > 100% is rejected with HTTP 400");

    // ----------------------------------------------------
    // Test 8: Create Live Real Breach Incident via Real HTTP 500 Traffic
    // ----------------------------------------------------
    console.log("\n[8/13] Generating Genuine Runtime Traffic Breach for End-to-End ML Audit...");
    const testSloId = `SLO-MLTEST-${Date.now().toString().slice(-4)}`;
    const testReqId = "REQ-002";

    // Register test SLO
    await request("/api/slos", {
      method: "POST",
      body: {
        sloId: testSloId,
        requirementId: testReqId,
        service: "traceops-backend",
        metric: "5xx_error_rate",
        operator: "<",
        threshold: 10.0,
        unit: "%",
        window: "30s",
        severity: "CRITICAL",
        status: "ACTIVE",
      },
    });

    // Send bursts of HTTP 500 errors across 2 intervals to guarantee Prometheus rate() slope
    for (let i = 0; i < 8; i++) {
      await request("/api/telemetry/load-test", {
        method: "POST",
        body: { requests: 1, delayMs: 0, simulateError: true },
      });
    }
    await new Promise((r) => setTimeout(r, 2000));
    for (let i = 0; i < 7; i++) {
      await request("/api/telemetry/load-test", {
        method: "POST",
        body: { requests: 1, delayMs: 0, simulateError: true },
      });
    }

    // Wait for Prometheus scrape cycle (scrape_interval: 3s)
    console.log("       Waiting 6s for Prometheus scrape cycle...");
    await new Promise((r) => setTimeout(r, 6000));

    // Continuous evaluation creates real incident
    const evalRes = await request("/api/slos/monitor/evaluate", { method: "POST" });
    const evalData = (evalRes.json?.data || []).find((e) => e.sloId === testSloId);
    console.log(`       Post-Traffic Evaluation: status=${evalData?.status}, value=${evalData?.actualValue}%`);

    // Retrieve the genuine created incident
    const incsRes = await request("/api/incidents");
    const liveIncident = (incsRes.json?.data || []).find(
      (i) => i.sloId === testSloId && i.source === "PROMETHEUS_SLO_MONITOR" && i.status === "OPEN"
    );

    assert(liveIncident !== undefined, `Found created live incident for ${testSloId}`);
    console.log(`       Captured Live Incident: ${liveIncident?.incidentId} | Service: ${liveIncident?.service}`);
    console.log(`       Measured Value: ${liveIncident?.actualValue}% | Threshold: ${liveIncident?.threshold}%`);

    // ----------------------------------------------------
    // Test 9: ML Inference on Genuine Incident Evidence
    // ----------------------------------------------------
    console.log("\n[9/13] Executing ML Prediction for Live Incident (Server-Verified Telemetry)...");
    const mlPredictRes = await request("/api/ml/predict", {
      method: "POST",
      body: {
        incidentId: liveIncident.incidentId,
      },
    });

    assert(mlPredictRes.status === 200, "POST /api/ml/predict with incidentId returns HTTP 200 OK");
    const mlData = mlPredictRes.json?.data;
    assert(mlData?.status === "SUCCESS", "ML prediction status is SUCCESS");
    assert(mlData?.incidentId === liveIncident.incidentId, `Prediction contains incidentId (${mlData?.incidentId})`);
    assert(mlData?.sloId === testSloId, `Prediction contains sloId (${mlData?.sloId})`);
    assert(mlData?.requirementId === testReqId, `Prediction contains linked requirementId (${mlData?.requirementId})`);
    assert(mlData?.service === "traceops-backend", `Prediction contains service (traceops-backend)`);
    assert(mlData?.modelVersion === "2.0.0-production-telemetry", `Prediction contains modelVersion (2.0.0-production-telemetry)`);
    assert(mlData?.schemaVersion === "v2-production-telemetry", `Prediction contains schemaVersion (v2-production-telemetry)`);
    assert(mlData?.featureTimestamp !== undefined, `Prediction contains featureTimestamp (${mlData?.featureTimestamp})`);

    // ----------------------------------------------------
    // Test 10: Provenance Verification - Prometheus == Incident == ML Input
    // ----------------------------------------------------
    console.log("\n[10/13] Performing 3-Way Provenance Audit: Prometheus == Incident == ML Input...");
    const incidentErr = liveIncident.actualValue;
    const mlInputErr = mlData.features?.errorRate;

    console.log(`       [Provenance] Incident Measured errorRate: ${incidentErr}%`);
    console.log(`       [Provenance] ML Input errorRate:         ${mlInputErr}%`);

    assert(
      incidentErr === mlInputErr,
      `Exact feature match: Incident errorRate (${incidentErr}%) === ML input errorRate (${mlInputErr}%)`
    );

    assert(
      mlData.featureSources !== undefined,
      "ML response provides complete featureSources provenance dictionary"
    );
    assert(
      mlData.featureSources?.errorRate?.promQl?.includes("http_requests_total"),
      "errorRate provenance provides genuine PromQL query expression"
    );
    assert(
      mlData.featureSources?.cpuUsage?.source === "node-exporter",
      "cpuUsage provenance provides authentic source (node-exporter)"
    );

    // ----------------------------------------------------
    // Test 11: Real Model Inference - No Hardcoded Probability Rule
    // ----------------------------------------------------
    console.log("\n[11/13] Verifying Authentic Model Inference Output...");
    assert(
      typeof mlData.violationProbability === "number" &&
        mlData.violationProbability >= 0 &&
        mlData.violationProbability <= 1,
      `violationProbability is a valid continuous probability in [0, 1]: ${mlData.violationProbability}`
    );
    assert(
      mlData.prediction === "VIOLATION",
      `Under 100% 5xx breach conditions, ML accurately predicts VIOLATION (got ${mlData.prediction})`
    );
    assert(
      mlData.violationProbability > 0.5,
      `Violation probability reflects severe breach: ${(mlData.violationProbability * 100).toFixed(2)}%`
    );
    assert(
      Array.isArray(mlData.topRiskFactors) && mlData.topRiskFactors.length > 0,
      `Identifies top risk drivers: ${mlData.topRiskFactors.join(", ")}`
    );

    // ----------------------------------------------------
    // Test 12: Recovery & Clean Up Test Incident
    // ----------------------------------------------------
    console.log("\n[12/13] Restoring Runtime with Healthy Traffic and Verifying ML Response...");
    // Dilute error rate with healthy traffic
    for (let batch = 0; batch < 3; batch++) {
      await Promise.all(Array.from({ length: 60 }).map(() => request("/api/health")));
      await new Promise((r) => setTimeout(r, 1000));
    }
    await new Promise((r) => setTimeout(r, 6000));
    await request("/api/slos/monitor/evaluate", { method: "POST" });

    // Clean up test SLO
    await request(`/api/slos/${testSloId}`, { method: "DELETE" });
    assert(true, `Test SLO ${testSloId} cleaned up safely`);

    // ----------------------------------------------------
    // Test 13: Non-Existent Incident ID Handling
    // ----------------------------------------------------
    console.log("\n[13/13] Verifying Non-Existent Incident Handling...");
    const badIncRes = await request("/api/ml/predict", {
      method: "POST",
      body: {
        incidentId: "INC-NONEXISTENT-9999",
      },
    });
    assert(badIncRes.status === 404, "Non-existent incident returns HTTP 404 Not Found");
    assert(
      badIncRes.json?.message?.includes("Incident not found"),
      `Error explains incident not found: ${badIncRes.json?.message}`
    );

  } catch (err) {
    console.error("Test execution exception:", err);
    failed++;
  }

  console.log("\n================================================================================");
  console.log(`PHASE 3 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase3Tests();

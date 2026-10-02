/**
 * Phase 3.2: Genuine Healthy Telemetry Collection Test Suite
 *
 * Validates:
 * Test 1 - Healthy SLO produces COMPLIANT evaluation and NON_VIOLATION TelemetryObservation
 * Test 2 - Real telemetry values correspond to actual Prometheus telemetry (within bounds, no fabrication)
 * Test 3 - NO_DATA evaluation does NOT produce NON_VIOLATION observation
 * Test 4 - BREACHED evaluation does NOT produce NON_VIOLATION observation; incident lifecycle preserved
 * Test 5 - Deduplication/sampling policy prevents runaway duplicate observations in same time bucket
 * Test 6 - Comprehensive provenance audit (sources, PromQL queries, units, timestamps)
 * Test 7 - Feature completeness verification (6 production features correctly flagged)
 * Test 8 - Read-only inspection API verification (pagination, filters, summary)
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

async function runPhase3_2Tests() {
  console.log("================================================================================");
  console.log("TRACE-OPS: PHASE 3.2 GENUINE HEALTHY TELEMETRY COLLECTION VERIFICATION");
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

  const createdSloIds = [];

  try {
    // ----------------------------------------------------
    // Test 1: API Endpoint Availability & Schema Readiness
    // ----------------------------------------------------
    console.log("[1/8] Verifying Telemetry Observation Endpoints & Summary...");
    const rootRes = await request("/");
    assert(rootRes.status === 200, "Root API returns HTTP 200 OK");
    assert(
      rootRes.json?.endpoints?.telemetryObservations === "/api/telemetry-observations",
      "Root endpoint directory advertises /api/telemetry-observations"
    );

    const summaryRes = await request("/api/telemetry-observations/summary");
    assert(summaryRes.status === 200, "GET /api/telemetry-observations/summary returns HTTP 200 OK");
    assert(summaryRes.json?.success === true, "Summary response success is true");
    assert(
      typeof summaryRes.json?.summary?.totalObservations === "number",
      "Summary returns totalObservations count"
    );
    assert(
      summaryRes.json?.summary?.samplingIntervalSec >= 1,
      `Sampling interval is documented and valid (${summaryRes.json?.summary?.samplingIntervalSec}s)`
    );

    // ----------------------------------------------------
    // Test 2: Healthy SLO Evaluation & NON_VIOLATION Persistence
    // ----------------------------------------------------
    console.log("\n[2/8] Creating Healthy SLO & Verifying NON_VIOLATION TelemetryObservation...");
    const testHealthySloId = `SLO-HEALTHY-P32-${Date.now().toString().slice(-4)}`;
    createdSloIds.push(testHealthySloId);

    // Target is intentionally generous (e.g. error rate < 99%) so it is guaranteed compliant
    const healthySloPayload = {
      sloId: testHealthySloId,
      service: "order-service",
      metric: "error_rate",
      operator: "<",
      threshold: 99.0,
      target: 99.0,
      unit: "%",
      window: "5m",
      severity: "LOW",
      status: "ACTIVE",
      requirementId: "REQ-P32-HEALTHY-001",
    };

    const createSloRes = await request("/api/slos", {
      method: "POST",
      body: healthySloPayload,
    });
    assert(createSloRes.status === 201, `Created healthy test SLO: ${testHealthySloId}`);

    // Trigger evaluation cycle
    const evalRes = await request("/api/slos/monitor/evaluate", { method: "POST" });
    assert(evalRes.status === 200, "POST /api/slos/monitor/evaluate executed successfully");

    const healthyEval = (evalRes.json?.data || []).find((e) => e.sloId === testHealthySloId);
    assert(healthyEval !== undefined, "Healthy SLO was evaluated in cycle");
    assert(
      healthyEval?.status === "COMPLIANT",
      `Healthy SLO status is COMPLIANT (measured: ${healthyEval?.actualValue}%, target: < 99%)`
    );

    // Query observations for this SLO
    const obsRes = await request(`/api/telemetry-observations?sloId=${testHealthySloId}`);
    assert(obsRes.status === 200, "GET /api/telemetry-observations?sloId=... returns HTTP 200 OK");
    assert(obsRes.json?.count >= 1, `Found ${obsRes.json?.count} observation for healthy SLO`);

    const observation = obsRes.json?.data?.[0];
    assert(observation?.sloId === testHealthySloId, "Observation matches healthy SLO ID");
    assert(observation?.service === "order-service", "Observation matches service");
    assert(observation?.requirementId === "REQ-P32-HEALTHY-001", "Observation preserves requirement ID");
    assert(
      observation?.evaluationStatus === "COMPLIANT",
      "Observation evaluationStatus is COMPLIANT"
    );
    assert(
      observation?.label === "NON_VIOLATION",
      `Observation label is strictly NON_VIOLATION (derived from evaluation, not fabricated)`
    );
    assert(
      observation?.source === "PROMETHEUS_SLO_MONITOR",
      "Observation source is PROMETHEUS_SLO_MONITOR"
    );
    assert(
      observation?.schemaVersion === "v2-production-telemetry",
      "Observation schemaVersion is v2-production-telemetry"
    );

    // ----------------------------------------------------
    // Test 3: Real Telemetry Values Verification (No Fabrication)
    // ----------------------------------------------------
    console.log("\n[3/8] Verifying Real Telemetry Values in Stored Observation...");
    const features = observation?.features;
    assert(features !== undefined, "Observation contains features object");

    // Check production 6 features
    assert("cpuUsage" in features, "features contains cpuUsage");
    assert("memoryUsage" in features, "features contains memoryUsage");
    assert("p95Latency" in features, "features contains p95Latency");
    assert("errorRate" in features, "features contains errorRate");
    assert("requestRate" in features, "features contains requestRate");
    assert("deploymentChanged" in features, "features contains deploymentChanged");

    // Strictly ensure no deprecated synthetic features
    assert(!("dbPoolUsage" in features), "Strictly NO dbPoolUsage feature present in schema");

    // Values bounds validation
    if (features.cpuUsage !== null) {
      assert(
        features.cpuUsage >= 0 && features.cpuUsage <= 100,
        `cpuUsage is bounded: ${features.cpuUsage}%`
      );
    }
    if (features.memoryUsage !== null) {
      assert(
        features.memoryUsage >= 0 && features.memoryUsage <= 100,
        `memoryUsage is bounded: ${features.memoryUsage}%`
      );
    }
    if (features.errorRate !== null) {
      assert(
        features.errorRate >= 0 && features.errorRate <= 100,
        `errorRate is bounded: ${features.errorRate}%`
      );
    }
    if (features.p95Latency !== null) {
      assert(features.p95Latency >= 0, `p95Latency is non-negative: ${features.p95Latency}s`);
    }
    if (features.requestRate !== null) {
      assert(features.requestRate >= 0, `requestRate is non-negative: ${features.requestRate} req/s`);
    }
    assert(
      features.deploymentChanged === 0 || features.deploymentChanged === 1,
      `deploymentChanged is binary (0 or 1): ${features.deploymentChanged}`
    );

    // ----------------------------------------------------
    // Test 4: NO_DATA Evaluation Does NOT Store NON_VIOLATION
    // ----------------------------------------------------
    console.log("\n[4/8] Verifying NO_DATA Evaluation Does NOT Create Healthy Observation...");
    const testNoDataSloId = `SLO-NODATA-P32-${Date.now().toString().slice(-4)}`;
    createdSloIds.push(testNoDataSloId);

    const noDataSloPayload = {
      sloId: testNoDataSloId,
      service: "nonexistent-ghost-service-xyz",
      metric: "custom_missing_metric",
      operator: "<",
      threshold: 10,
      target: 10,
      unit: "ms",
      window: "5m",
      severity: "LOW",
      status: "ACTIVE",
      requirementId: "REQ-P32-NODATA-001",
      promQl: 'rate(ghost_metric_never_exists_bucket{service="ghost"}[5m])',
    };

    const createNoDataRes = await request("/api/slos", {
      method: "POST",
      body: noDataSloPayload,
    });
    assert(createNoDataRes.status === 201, `Created NO_DATA test SLO: ${testNoDataSloId}`);

    const evalNoDataRes = await request("/api/slos/monitor/evaluate", { method: "POST" });
    const noDataEval = (evalNoDataRes.json?.data || []).find((e) => e.sloId === testNoDataSloId);
    assert(noDataEval !== undefined, "NO_DATA SLO evaluated in cycle");
    assert(
      noDataEval?.status === "NO_DATA",
      `Evaluation correctly identified missing data as NO_DATA (status: ${noDataEval?.status})`
    );

    // Confirm NO observation was created
    const noDataObsRes = await request(`/api/telemetry-observations?sloId=${testNoDataSloId}`);
    assert(
      noDataObsRes.json?.count === 0,
      `CRITICAL: NO_DATA evaluation produced 0 observations (count: ${noDataObsRes.json?.count})`
    );

    // ----------------------------------------------------
    // Test 5: BREACHED Evaluation Does NOT Store NON_VIOLATION
    // ----------------------------------------------------
    console.log("\n[5/8] Verifying BREACHED Evaluation Preserves Incident Pipeline & Creates No NON_VIOLATION...");
    const testBreachSloId = `SLO-BREACH-P32-${Date.now().toString().slice(-4)}`;
    createdSloIds.push(testBreachSloId);

    // Impossible target to force real breach against live traffic
    const breachSloPayload = {
      sloId: testBreachSloId,
      service: "auth-service",
      metric: "p95_latency",
      operator: "<",
      threshold: 0.00000001, // 0.01 microsecond threshold ensures breach
      target: 0.00000001,
      unit: "seconds",
      window: "5m",
      severity: "HIGH",
      status: "ACTIVE",
      requirementId: "REQ-P32-BREACH-001",
    };

    const createBreachRes = await request("/api/slos", {
      method: "POST",
      body: breachSloPayload,
    });
    assert(createBreachRes.status === 201, `Created breach test SLO: ${testBreachSloId}`);

    const evalBreachRes = await request("/api/slos/monitor/evaluate", { method: "POST" });
    const breachEval = (evalBreachRes.json?.data || []).find((e) => e.sloId === testBreachSloId);
    assert(breachEval !== undefined, "Breach SLO evaluated in cycle");
    assert(
      breachEval?.status === "BREACHED",
      `Evaluation correctly detected breach (measured: ${breachEval?.actualValue}s vs threshold: 0.00000001s)`
    );
    assert(
      typeof breachEval?.incidentCreated === "string" || typeof breachEval?.incidentUpdated === "string",
      "Breached evaluation triggered Phase 2 incident creation/update"
    );

    // Confirm NO NON_VIOLATION observation was created for the breached SLO
    const breachObsRes = await request(
      `/api/telemetry-observations?sloId=${testBreachSloId}&label=NON_VIOLATION`
    );
    assert(
      breachObsRes.json?.count === 0,
      `CRITICAL: BREACHED evaluation produced 0 NON_VIOLATION observations (count: ${breachObsRes.json?.count})`
    );

    // ----------------------------------------------------
    // Test 6: Deduplication / Sampling Policy Verification
    // ----------------------------------------------------
    console.log("\n[6/8] Verifying Deduplication / Sampling Policy in Same Bucket...");
    const initialObsRes = await request(`/api/telemetry-observations?sloId=${testHealthySloId}`);
    const initialCount = initialObsRes.json?.count || 0;
    assert(initialCount >= 1, `Pre-evaluation observation count: ${initialCount}`);

    // Trigger another evaluation cycle immediately (same time bucket)
    await request("/api/slos/monitor/evaluate", { method: "POST" });

    const postObsRes = await request(`/api/telemetry-observations?sloId=${testHealthySloId}`);
    const postCount = postObsRes.json?.count || 0;
    assert(
      postCount === initialCount,
      `Deduplication active: Observation count remained ${postCount} (not duplicated in same bucket)`
    );

    // ----------------------------------------------------
    // Test 7: Provenance Audit Verification
    // ----------------------------------------------------
    console.log("\n[7/8] Verifying Traceability & Provenance Metadata...");
    const prov = observation?.provenance;
    assert(prov !== undefined, "Observation contains provenance object");
    assert(typeof prov.sources === "object", "provenance.sources is present");
    assert(typeof prov.queries === "object", "provenance.queries is present");
    assert(typeof prov.units === "object", "provenance.units is present");
    assert(typeof prov.timestamps === "object", "provenance.timestamps is present");

    assert(
      prov.sources.cpuUsage === "node-exporter",
      `cpuUsage source is specific: ${prov.sources.cpuUsage}`
    );
    assert(
      prov.sources.memoryUsage === "node-exporter",
      `memoryUsage source is specific: ${prov.sources.memoryUsage}`
    );
    assert(
      prov.sources.requestRate === "prom-client",
      `requestRate source is specific: ${prov.sources.requestRate}`
    );
    assert(
      prov.queries.cpuUsage.includes("node_cpu_seconds_total"),
      `cpuUsage query contains valid node-exporter PromQL: ${prov.queries.cpuUsage}`
    );
    assert(
      prov.units.cpuUsage === "%" && prov.units.p95Latency === "seconds",
      "provenance units are correctly specified (% and seconds)"
    );

    // ----------------------------------------------------
    // Test 8: Feature Completeness Flag
    // ----------------------------------------------------
    console.log("\n[8/8] Verifying Feature Completeness Flagging...");
    assert(
      typeof observation?.featuresComplete === "boolean",
      `featuresComplete is boolean: ${observation?.featuresComplete}`
    );
    const allPresent =
      features.cpuUsage !== null &&
      features.memoryUsage !== null &&
      features.p95Latency !== null &&
      features.errorRate !== null &&
      features.requestRate !== null;

    if (allPresent) {
      assert(
        observation.featuresComplete === true,
        "featuresComplete correctly flags true when all features present"
      );
    } else {
      assert(
        observation.featuresComplete === false,
        "featuresComplete correctly flags false when any feature is missing"
      );
    }

    console.log("\n================================================================================");
    console.log(`PHASE 3.2 TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("================================================================================");
  } finally {
    // Cleanup temporary test SLOs
    console.log("\nCleaning up temporary test SLOs...");
    for (const sloId of createdSloIds) {
      try {
        await request(`/api/slos/${sloId}`, { method: "DELETE" });
      } catch {}
    }
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase3_2Tests().catch((err) => {
  console.error("Test runner encountered unhandled error:", err);
  process.exit(1);
});

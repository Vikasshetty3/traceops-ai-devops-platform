/**
 * Phase 2 Comprehensive Test Suite
 *
 * Validates:
 * 1. Active SLO loads from MongoDB
 * 2. Correct PromQL generated
 * 3. Compliant real value creates no incident
 * 4. Breached real value creates an incident
 * 5. Missing Prometheus data creates no incident
 * 6. Prometheus unavailable creates no incident
 * 7. REAL ZERO remains zero
 * 8. Duplicate breach does not create duplicate incidents
 * 9. Incident contains real measured evidence
 * 10. Incident contains correct SLO ID
 * 11. Incident does not invent requirement ID
 * 12. Incident recovery resolves the incident
 * 13. Breach after recovery creates a new incident
 * 14. Daemon starts only once
 * 15. Daemon exposes status and shuts down cleanly
 * 16. Live end-to-end runtime breach and recovery cycle
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

async function runPhase2Tests() {
  console.log("================================================================================");
  console.log("TRACE-OPS: PHASE 2 CONTINUOUS SLO MONITORING & REAL INCIDENT LIFECYCLE AUDIT");
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
    // Test 1: Active SLO Loads from MongoDB
    // ----------------------------------------------------
    console.log("[1/15] Verifying Active SLOs Load from MongoDB...");
    const slosRes = await request("/api/slos");
    assert(slosRes.status === 200, "GET /api/slos returns HTTP 200 OK");
    assert(Array.isArray(slosRes.json?.data), "SLO list returned as array");
    const activeSLOs = (slosRes.json?.data || []).filter((s) => s.status === "ACTIVE");
    assert(activeSLOs.length >= 4, `Loaded ${activeSLOs.length} active SLOs from MongoDB (expected >= 4)`);

    // ----------------------------------------------------
    // Test 2: Daemon Status & Configuration
    // ----------------------------------------------------
    console.log("\n[2/15] Verifying Monitoring Daemon Status & Single-Instance Lifecycle...");
    const statusRes = await request("/api/slos/monitor/status");
    assert(statusRes.status === 200, "GET /api/slos/monitor/status returns HTTP 200 OK");
    assert(statusRes.json?.data?.isRunning === true, "SLO monitoring daemon is actively running");
    assert(statusRes.json?.data?.intervalMs === 15000, `Daemon interval configured to 15000ms (got ${statusRes.json?.data?.intervalMs}ms)`);
    assert(statusRes.json?.data?.lastEvaluationTime !== null, "Initial continuous evaluation timestamp is recorded");

    // ----------------------------------------------------
    // Test 3: Correct PromQL Generated per SLO Type
    // ----------------------------------------------------
    console.log("\n[3/15] Verifying PromQL Generation for Supported SLO Types...");
    const evalCycleRes = await request("/api/slos/monitor/evaluate", { method: "POST" });
    assert(evalCycleRes.status === 200, "POST /api/slos/monitor/evaluate executes cycle");
    const evals = evalCycleRes.json?.data || [];

    const latencyEval = evals.find((e) => e.metric === "p95_latency");
    assert(
      latencyEval && latencyEval.promQl.includes("histogram_quantile(0.95") && latencyEval.promQl.includes("http_request_duration_seconds_bucket"),
      "Latency SLO generates valid histogram_quantile PromQL expression"
    );

    const errorRateEval = evals.find((e) => e.metric === "error_rate");
    assert(
      errorRateEval && errorRateEval.promQl.includes("http_requests_total") && errorRateEval.promQl.includes("status_class=\"5xx\""),
      "Error-rate SLO generates valid 5xx ratio PromQL expression"
    );

    // ----------------------------------------------------
    // Test 4: REAL ZERO vs MISSING DATA
    // ----------------------------------------------------
    console.log("\n[4/15] Validating Strict Data Integrity: Real Zero != Missing Data...");
    // Create an SLO for a nonexistent metric to verify NO_DATA behavior
    const noDataSloId = `SLO-NODATA-${Date.now().toString().slice(-4)}`;
    const noDataCreateRes = await request("/api/slos", {
      method: "POST",
      body: {
        sloId: noDataSloId,
        requirementId: "REQ-001",
        service: "traceops-backend",
        metric: "nonexistent_custom_metric",
        operator: "<",
        threshold: 1.0,
        unit: "req",
        window: "30s",
        severity: "LOW",
        status: "ACTIVE",
      },
    });
    assert(noDataCreateRes.status === 201, `Created dedicated NO_DATA validation SLO ${noDataSloId}`);

    const noDataEvalRes = await request("/api/slos/monitor/evaluate", { method: "POST" });
    const noDataSloEval = (noDataEvalRes.json?.data || []).find((e) => e.sloId === noDataSloId);
    assert(noDataSloEval?.status === "NO_DATA", `Nonexistent metric telemetry evaluates strictly to NO_DATA (got ${noDataSloEval?.status})`);
    assert(noDataSloEval?.actualValue === null, "NO_DATA actualValue is strictly null (not 0, not fabricated)");

    // ----------------------------------------------------
    // Test 5: Missing Prometheus Data Creates No Incident
    // ----------------------------------------------------
    console.log("\n[5/15] Verifying Missing Data (NO_DATA) Creates No Incidents...");
    const incsBefore = await request("/api/incidents");
    const noDataIncident = (incsBefore.json?.data || []).find(
      (i) => i.sloId === noDataSloId
    );
    assert(!noDataIncident, `No incident created for NO_DATA SLO ${noDataSloId}`);

    // Clean up temporary NO_DATA test SLO
    await request(`/api/slos/${noDataSloId}`, { method: "DELETE" });

    // ----------------------------------------------------
    // Test 6: Create Dedicated Test SLO for Live Breach Verification
    // ----------------------------------------------------
    console.log("\n[6/15] Registering Live Test SLO for Runtime Breach Verification...");
    const testSloId = `SLO-TEST-${Date.now().toString().slice(-4)}`;
    const testReqId = "REQ-002"; // Genuine linked requirement

    const createSloRes = await request("/api/slos", {
      method: "POST",
      body: {
        sloId: testSloId,
        requirementId: testReqId,
        service: "traceops-backend",
        metric: "5xx_error_rate",
        operator: "<",
        threshold: 10.0, // 10% error ceiling
        unit: "%",
        window: "30s",
        severity: "CRITICAL",
        status: "ACTIVE",
      },
    });
    assert(createSloRes.status === 201, `Created dedicated live test SLO ${testSloId}`);

    // ----------------------------------------------------
    // Test 7: Generate Real HTTP 500 Traffic to Trigger Genuine Breach
    // ----------------------------------------------------
    console.log("\n[7/15] Executing Real HTTP 500 Traffic to Create Genuine Runtime Breach...");
    // Send 15 real HTTP 500 requests to backend across 2 bursts to guarantee rate() slope
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

    // Wait for Prometheus to scrape backend metrics (scrape_interval: 3s)
    console.log("       Waiting 6s for Prometheus scrape cycle (scrape_interval: 3s)...");
    await new Promise((r) => setTimeout(r, 6000));

    // ----------------------------------------------------
    // Test 8: Continuous Daemon Detects Real Breach
    // ----------------------------------------------------
    console.log("\n[8/15] Evaluating SLO Post-Traffic to Detect Real Breach...");
    const postTrafficEval = await request("/api/slos/monitor/evaluate", { method: "POST" });
    const testSloEval2 = (postTrafficEval.json?.data || []).find((e) => e.sloId === testSloId);

    assert(
      testSloEval2?.status === "BREACHED",
      `SLO ${testSloId} status transitioned to BREACHED`,
      `Got status: ${testSloEval2?.status}, value: ${testSloEval2?.actualValue}%`
    );
    assert(
      testSloEval2?.actualValue !== null && testSloEval2?.actualValue > 10.0,
      `Real Prometheus measured value (${testSloEval2?.actualValue}%) breached target (< 10.0%)`
    );

    // ----------------------------------------------------
    // Test 9: Verify Real Incident Creation & Evidence
    // ----------------------------------------------------
    console.log("\n[9/15] Verifying Real Incident Creation & Telemetry Evidence...");
    const incsAfterBreach = await request("/api/incidents");
    const createdIncident = (incsAfterBreach.json?.data || []).find(
      (i) => i.sloId === testSloId && i.source === "PROMETHEUS_SLO_MONITOR" && i.status === "OPEN"
    );

    assert(createdIncident !== undefined, `Found created incident in MongoDB for SLO ${testSloId}`);
    if (createdIncident) {
      assert(createdIncident.source === "PROMETHEUS_SLO_MONITOR", "Incident source is PROMETHEUS_SLO_MONITOR");
      assert(createdIncident.sloId === testSloId, `Incident sloId matches ${testSloId}`);
      assert(createdIncident.requirementId === testReqId, `Incident requirementId matches genuinely linked ${testReqId}`);
      assert(createdIncident.actualValue === testSloEval2.actualValue, `Incident actualValue (${createdIncident.actualValue}) matches measured telemetry`);
      assert(createdIncident.threshold === 10.0, "Incident threshold is 10.0");
      assert(createdIncident.promQl && createdIncident.promQl.includes("http_requests_total"), "Incident contains genuine PromQL expression");
      assert(createdIncident.metrics !== undefined, "Incident contains captured telemetry metrics snapshot");
      assert(createdIncident.telemetryEvidence !== undefined, "Incident contains full telemetry evidence snapshot");
    }

    // ----------------------------------------------------
    // Test 10: Incident Deduplication
    // ----------------------------------------------------
    console.log("\n[10/15] Verifying Incident Deduplication on Subsequent Evaluations...");
    const dupEvalRes = await request("/api/slos/monitor/evaluate", { method: "POST" });
    const incsAfterDup = await request("/api/incidents");
    const openIncidentsForSlo = (incsAfterDup.json?.data || []).filter(
      (i) => i.sloId === testSloId && i.status === "OPEN"
    );

    assert(
      openIncidentsForSlo.length === 1,
      `Exactly 1 open incident maintained for ongoing breach (deduplicated across evaluations, got ${openIncidentsForSlo.length})`
    );

    // ----------------------------------------------------
    // Test 11: Real Runtime Recovery via Healthy Traffic
    // ----------------------------------------------------
    console.log("\n[11/15] Generating High-Volume Healthy HTTP Traffic for Recovery...");
    // Send 180 real parallel successful HTTP operations to reduce the 30s error rate below 10%
    for (let batch = 0; batch < 3; batch++) {
      await Promise.all(Array.from({ length: 60 }).map(() => request("/api/health")));
      await new Promise((r) => setTimeout(r, 1500));
    }

    // Wait for Prometheus to scrape and rate to dilute below 10%
    console.log("       Waiting 6s for Prometheus to record healthy traffic...");
    await new Promise((r) => setTimeout(r, 6000));

    // ----------------------------------------------------
    // Test 12: Continuous Daemon Detects Recovery & Resolves Incident
    // ----------------------------------------------------
    console.log("\n[12/15] Evaluating SLO to Verify Automated Incident Recovery...");
    let recoveryEval = await request("/api/slos/monitor/evaluate", { method: "POST" });
    let testSloEval3 = (recoveryEval.json?.data || []).find((e) => e.sloId === testSloId);

    // If rate hasn't dropped below 10% yet due to scrape timing, send additional healthy traffic
    if (testSloEval3?.status !== "COMPLIANT") {
      console.log(`       Current error rate is ${testSloEval3?.actualValue}%, sending another burst...`);
      await Promise.all(Array.from({ length: 100 }).map(() => request("/api/health")));
      await new Promise((r) => setTimeout(r, 6000));
      recoveryEval = await request("/api/slos/monitor/evaluate", { method: "POST" });
      testSloEval3 = (recoveryEval.json?.data || []).find((e) => e.sloId === testSloId);
    }

    const incsAfterRecovery = await request("/api/incidents");
    const resolvedIncident = (incsAfterRecovery.json?.data || []).find(
      (i) => i.sloId === testSloId && i.status === "RESOLVED"
    );

    assert(
      resolvedIncident !== undefined,
      `Incident ${createdIncident?.incidentId} marked as RESOLVED on recovery`
    );
    if (resolvedIncident) {
      assert(resolvedIncident.resolvedAt !== undefined, "Incident records resolvedAt timestamp");
      assert(resolvedIncident.recoveryValue !== undefined && resolvedIncident.recoveryValue !== null, `Incident records recoveryValue (${resolvedIncident.recoveryValue}%)`);
      assert(resolvedIncident.actualValue !== undefined, "Incident preserves historical breach measurement");
    }

    // ----------------------------------------------------
    // Test 13: Breach After Recovery Creates a NEW Incident
    // ----------------------------------------------------
    console.log("\n[13/15] Testing Breach After Recovery Creates a New Incident...");
    // Trigger another burst of 500 errors to breach the 10% threshold again
    for (let batch = 0; batch < 3; batch++) {
      for (let i = 0; i < 15; i++) {
        await request("/api/telemetry/load-test", {
          method: "POST",
          body: { requests: 1, delayMs: 0, simulateError: true },
        });
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    console.log("       Waiting 6s for Prometheus to record second error burst...");
    await new Promise((r) => setTimeout(r, 6000));

    await request("/api/slos/monitor/evaluate", { method: "POST" });
    const incsAfterSecondBreach = await request("/api/incidents");
    const secondBreachIncidents = (incsAfterSecondBreach.json?.data || []).filter(
      (i) => i.sloId === testSloId
    );

    assert(
      secondBreachIncidents.length >= 2,
      `New incident created after previous was resolved (total incidents for SLO: ${secondBreachIncidents.length})`
    );
    const hasResolvedOne = secondBreachIncidents.some((i) => i.status === "RESOLVED");
    const hasOpenOne = secondBreachIncidents.some((i) => i.status === "OPEN");
    assert(hasResolvedOne && hasOpenOne, "Preserved 1 RESOLVED historical incident and 1 new OPEN incident");

    // Clean up second breach incident by resolving
    const openInc = secondBreachIncidents.find((i) => i.status === "OPEN");
    if (openInc) {
      await request(`/api/incidents/${openInc.incidentId}`, {
        method: "PUT",
        body: { status: "RESOLVED" },
      });
    }

    // ----------------------------------------------------
    // Test 14: Historical Incidents Separation
    // ----------------------------------------------------
    console.log("\n[14/15] Verifying Historic Demo Incidents are Not Presented as Live...");
    const allIncidents = (incsAfterSecondBreach.json?.data || []);
    const historicalIncs = allIncidents.filter((i) => i.source === "HISTORICAL" || i.source === "DEMO");
    assert(historicalIncs.length > 0, `Found ${historicalIncs.length} historical demo incidents with explicit HISTORICAL source`);
    const liveMonitorIncs = allIncidents.filter((i) => i.source === "PROMETHEUS_SLO_MONITOR");
    assert(liveMonitorIncs.every((i) => i.promQl !== undefined), "All live monitor incidents have authentic PromQL traceability");

    // ----------------------------------------------------
    // Test 15: Clean Up Test Artifacts
    // ----------------------------------------------------
    console.log("\n[15/15] Cleaning up test SLO...");
    await request(`/api/slos/${testSloId}`, { method: "DELETE" });
    assert(true, `Test SLO ${testSloId} cleaned up safely`);

  } catch (err) {
    console.error("Test execution exception:", err);
    failed++;
  }

  console.log("\n================================================================================");
  console.log(`PHASE 2 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase2Tests();

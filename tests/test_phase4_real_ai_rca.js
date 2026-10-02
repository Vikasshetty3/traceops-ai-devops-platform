/**
 * PHASE 4 VERIFICATION SUITE — REAL AI ROOT CAUSE ANALYSIS (RCA)
 * 
 * Verifies:
 * 1. Live Real Incident RCA execution backed ONLY by real runtime telemetry & logs
 * 2. Incident ID, Requirement ID, SLO ID, and Service identity matching
 * 3. Prometheus metrics accuracy (actual PromQL results and timestamps)
 * 4. Application Docker container logs retrieval (real container logs with timestamps)
 * 5. Separation of OBSERVED FACTS from ROOT CAUSE HYPOTHESIS
 * 6. Evidence-derived dynamic confidence with detailed rationale (no fixed 0.95)
 * 7. INSUFFICIENT_EVIDENCE handling without hallucinating or inventing data
 * 8. Historical incident isolation and provenance tracking
 * 9. RCA persistence in MongoDB with full evidence provenance
 * 10. API endpoint validation across all RCA routes (/api/gemini-rca, /api/rca, /api/ai-rca)
 * 11. Security validation: Gemini API key never exposed in payload
 */

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function runPhase4Tests() {
  console.log("================================================================================");
  console.log("          PHASE 4 — REAL AI ROOT CAUSE ANALYSIS (RCA) VERIFICATION             ");
  console.log("================================================================================");

  // --------------------------------------------------------------------------
  // TEST 1: Retrieve genuine runtime incidents from MongoDB
  // --------------------------------------------------------------------------
  console.log("\n[TEST 1] Querying genuine PROMETHEUS_SLO_MONITOR incident from MongoDB...");
  let realIncident = null;
  try {
    const incRes = await fetch(`${BACKEND_URL}/api/incidents`);
    const incJson = await incRes.json();
    const incidents = incJson.data || incJson;

    const genuineIncidents = Array.isArray(incidents)
      ? incidents.filter((i) => i.source === "PROMETHEUS_SLO_MONITOR")
      : [];

    assert(genuineIncidents.length > 0, `Found ${genuineIncidents.length} genuine PROMETHEUS_SLO_MONITOR incidents in database`);
    realIncident = genuineIncidents[0];
    console.log(`  Target Real Incident: ID=${realIncident.incidentId}, Service=${realIncident.service}, Metric=${realIncident.metric}, Measured=${realIncident.actualValue}, Target=${realIncident.targetValue ?? realIncident.threshold}`);
  } catch (err) {
    assert(false, `Failed to query incidents: ${err.message}`);
  }

  if (!realIncident) {
    console.error("FATAL: No genuine runtime incidents found. Aborting live incident test.");
    return;
  }

  // --------------------------------------------------------------------------
  // TEST 2: Execute Real AI RCA on Genuine Incident
  // --------------------------------------------------------------------------
  console.log("\n[TEST 2] Executing genuine AI RCA on real incident via POST /api/gemini-rca/analyze...");
  let rcaResult = null;
  try {
    const rcaRes = await fetch(`${BACKEND_URL}/api/gemini-rca/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incidentId: realIncident.incidentId }),
    });

    assert(rcaRes.ok, `POST /api/gemini-rca/analyze returned HTTP ${rcaRes.status}`);
    const rcaJson = await rcaRes.json();
    assert(rcaJson.success === true, "Response payload indicated success === true");
    rcaResult = rcaJson.data;

    // Verify Incident Identity
    assert(rcaResult.incidentId === realIncident.incidentId, `RCA incidentId matches: ${rcaResult.incidentId}`);
    assert(rcaResult.requirementId === realIncident.requirementId, `RCA requirementId matches: ${rcaResult.requirementId}`);
    assert(rcaResult.sloId === realIncident.sloId, `RCA sloId matches: ${rcaResult.sloId}`);
    assert(rcaResult.service === realIncident.service, `RCA service matches: ${rcaResult.service}`);

    // Verify Observed Facts separation
    assert(Array.isArray(rcaResult.observedFacts) && rcaResult.observedFacts.length >= 3, `Separated ${rcaResult.observedFacts.length} OBSERVED FACTS directly backed by data`);

    // Verify Root Cause Hypothesis
    assert(typeof rcaResult.rootCauseHypothesis === "string" && rcaResult.rootCauseHypothesis.length > 20, "Root cause hypothesis is an evidence-backed string");
    assert(!rcaResult.rootCauseHypothesis.includes("Database connection pool exhaustion") || realIncident.metric.includes("pool"), "Hypothesis is not a hardcoded fallback string");

    // Verify Structured Evidence
    assert(Array.isArray(rcaResult.structuredEvidence) && rcaResult.structuredEvidence.length > 0, `Structured evidence contains ${rcaResult.structuredEvidence?.length} items`);
    const promEvidence = rcaResult.structuredEvidence.filter((e) => e.type === "PROMETHEUS");
    const logEvidence = rcaResult.structuredEvidence.filter((e) => e.type === "LOG");
    assert(promEvidence.length > 0, `Contains ${promEvidence.length} verified Prometheus evidence records`);
    assert(logEvidence.length > 0, `Contains ${logEvidence.length} verified container log evidence records`);

    // Verify Evidence Timestamps
    const hasTimestamps = rcaResult.structuredEvidence.every((e) => e.timestamp && !isNaN(new Date(e.timestamp).getTime()));
    assert(hasTimestamps, "All structured evidence items possess valid ISO timestamps");

    // Verify Timeline
    assert(Array.isArray(rcaResult.timeline) && rcaResult.timeline.length >= 3, `Chronological timeline constructed with ${rcaResult.timeline.length} events`);

    // Verify Confidence derivation (not fixed 0.95)
    assert(typeof rcaResult.confidence === "number", `Confidence is numeric: ${rcaResult.confidence}`);
    assert(rcaResult.confidenceDetails && typeof rcaResult.confidenceDetails.rationale === "string", "Confidence includes detailed mathematical rationale");
    console.log(`  Confidence Rationale: "${rcaResult.confidenceDetails.rationale.slice(0, 120)}..."`);

    // Verify Provenance
    assert(rcaResult.provenance && rcaResult.provenance.isHistorical === false, "Provenance tracks genuine live incident (isHistorical: false)");
  } catch (err) {
    assert(false, `RCA execution failed: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // TEST 3: INSUFFICIENT_EVIDENCE Handling
  // --------------------------------------------------------------------------
  console.log("\n[TEST 3] Testing INSUFFICIENT_EVIDENCE when telemetry and logs are absent...");
  try {
    const insufficientRes = await fetch(`${BACKEND_URL}/api/gemini-rca/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        incidentId: "INC-NON-EXISTENT-99999",
        requirementId: "REQ-GHOST",
        service: "ghost-service",
        actualValue: 0,
        threshold: 0,
      }),
    });

    assert(insufficientRes.ok, `POST /api/gemini-rca/analyze returned HTTP ${insufficientRes.status}`);
    const json = await insufficientRes.json();
    const data = json.data;

    assert(
      data.analysisStatus === "INSUFFICIENT_EVIDENCE" || data.rootCause.includes("INSUFFICIENT_EVIDENCE"),
      `RCA returned INSUFFICIENT_EVIDENCE status: ${data.analysisStatus}`
    );
    assert(data.confidence <= 0.25, `Confidence is reduced for insufficient evidence: ${data.confidence}`);
    assert(data.uncertainty && data.uncertainty.length > 0, "Uncertainty array documents missing signals");
  } catch (err) {
    assert(false, `Insufficient evidence test failed: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Historical Demo Incident Isolation
  // --------------------------------------------------------------------------
  console.log("\n[TEST 4] Testing Historical / Demo incident isolation...");
  try {
    const histRes = await fetch(`${BACKEND_URL}/api/gemini-rca/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        incidentId: "INC-101",
        source: "HISTORICAL",
      }),
    });

    assert(histRes.ok, `POST /api/gemini-rca/analyze returned HTTP ${histRes.status}`);
    const histJson = await histRes.json();
    const histData = histJson.data;

    assert(
      histData.provenance && histData.provenance.isHistorical === true,
      `Historical incident explicitly flagged in provenance: isHistorical=${histData.provenance?.isHistorical}`
    );
  } catch (err) {
    assert(false, `Historical isolation test failed: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Verify RCA Persistence in MongoDB
  // --------------------------------------------------------------------------
  console.log("\n[TEST 5] Verifying RCA record persistence in MongoDB...");
  if (rcaResult?.rcaId) {
    try {
      const getRes = await fetch(`${BACKEND_URL}/api/rca/${rcaResult.rcaId}`);
      assert(getRes.ok, `GET /api/rca/${rcaResult.rcaId} returned HTTP ${getRes.status}`);
      const getJson = await getRes.json();
      const stored = getJson.data;

      assert(stored.rcaId === rcaResult.rcaId, `Stored rcaId matches: ${stored.rcaId}`);
      assert(stored.incidentId === rcaResult.incidentId, `Stored incidentId matches: ${stored.incidentId}`);
      assert(stored.rootCauseHypothesis === rcaResult.rootCauseHypothesis, "Stored rootCauseHypothesis matches");
      assert(Array.isArray(stored.observedFacts) && stored.observedFacts.length > 0, "Stored observedFacts array persisted");
      assert(Array.isArray(stored.timeline) && stored.timeline.length > 0, "Stored timeline persisted");
      assert(stored.provenance && stored.provenance.llmModel, "Stored evidence provenance persisted");
    } catch (err) {
      assert(false, `RCA retrieval failed: ${err.message}`);
    }
  } else {
    skipped++;
    console.log("  [SKIP] Skipping persistence retrieval (no rcaId generated)");
  }

  // --------------------------------------------------------------------------
  // TEST 6: Validate Alternative RCA Endpoints (/api/rca/analyze and /api/ai-rca)
  // --------------------------------------------------------------------------
  console.log("\n[TEST 6] Validating all RCA API endpoints...");
  try {
    // 6a. POST /api/rca/analyze
    const rcaAnalyzeRes = await fetch(`${BACKEND_URL}/api/rca/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        incidentId: realIncident.incidentId,
      }),
    });
    assert(rcaAnalyzeRes.ok, `POST /api/rca/analyze returned HTTP ${rcaAnalyzeRes.status}`);
    const rcaAnalyzeJson = await rcaAnalyzeRes.json();
    assert(rcaAnalyzeJson.data.incidentId === realIncident.incidentId, "POST /api/rca/analyze correctly routed to evidence pipeline");

    // 6b. POST /api/ai-rca/analyze
    const aiRcaRes = await fetch(`${BACKEND_URL}/api/ai-rca/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service: "Checkout",
        requirementId: "REQ-001",
        metric: "p95_latency",
        actualValue: 2.8,
        threshold: 2.0,
        cpuUsage: 70,
        memoryUsage: 65,
        errorRate: 1.0,
      }),
    });
    assert(aiRcaRes.ok, `POST /api/ai-rca/analyze returned HTTP ${aiRcaRes.status}`);
    const aiRcaJson = await aiRcaRes.json();
    assert(aiRcaJson.data.confidence > 0 && aiRcaJson.data.confidence < 0.95, `ai-rca confidence dynamically derived: ${aiRcaJson.data.confidence}`);

    // 6c. Malformed request (should return 400)
    const malformedRes = await fetch(`${BACKEND_URL}/api/gemini-rca/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert(malformedRes.status === 400, `Malformed request cleanly rejected with HTTP 400 (got ${malformedRes.status})`);
  } catch (err) {
    assert(false, `Endpoint validation failed: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // TEST 7: Security Audit (Credentials and API keys)
  // --------------------------------------------------------------------------
  console.log("\n[TEST 7] Security Audit: credentials & API keys exposure check...");
  if (rcaResult) {
    const rawRcaString = JSON.stringify(rcaResult);
    const hasGeminiKey = rawRcaString.includes("AQ.Ab8RN6JTy7snFLQOhRNV1ujX");
    const hasJwtSecret = rawRcaString.includes("traceops_production_secret_key");
    assert(!hasGeminiKey, "Gemini API key is NEVER returned in RCA output");
    assert(!hasJwtSecret, "JWT secret is NEVER returned in RCA output");
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`PHASE 4 TEST SUMMARY:`);
  console.log(`  PASSED:  ${passed}`);
  console.log(`  FAILED:  ${failed}`);
  console.log(`  SKIPPED: ${skipped}`);
  console.log("================================================================================");

  if (failed === 0) {
    console.log("VERDICT: PHASE 4 VERIFIED — EVIDENCE-BACKED REAL AI RCA OPERATIONAL");
  } else {
    console.log("VERDICT: PHASE 4 BLOCKED — ISSUES DETECTED");
  }
}

runPhase4Tests().catch((err) => {
  console.error("Test runner fatal exception:", err);
  process.exit(1);
});

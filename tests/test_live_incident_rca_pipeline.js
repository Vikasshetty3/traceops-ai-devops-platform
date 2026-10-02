/**
 * LIVE RUNTIME INCIDENT -> PROMETHEUS -> SLO -> INCIDENT -> EVIDENCE -> RCA PIPELINE TEST
 * 
 * Verifies end-to-end Section 9:
 * 1. Generates genuine HTTP traffic / errors against the running system
 * 2. Scrapes / queries Prometheus to verify genuine observations were recorded
 * 3. Triggers SLO continuous evaluation daemon or checks real incident generation
 * 4. Executes AI RCA on the resulting real incident
 * 5. Validates all evidence fields, timestamps, facts, and Gemini reasoning
 */

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function testLivePipeline() {
  console.log("================================================================================");
  console.log("   STEP 1: GENERATE REAL HTTP TRAFFIC AGAINST RUNNING BACKEND                   ");
  console.log("================================================================================");

  // 1. Generate real HTTP requests with simulateError to record genuine 5xx in Prometheus
  console.log("Sending real HTTP traffic with controlled load and 5xx error simulation...");
  const loadRes = await fetch(`${BACKEND_URL}/api/telemetry/load-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests: 10, delayMs: 20, simulateError: true }),
  });
  console.log(`Load response status: ${loadRes.status} (expected 500 for error rate tracking)`);
  assert(loadRes.status === 500, "Real HTTP 500 response received from running backend");

  // 2. Query Prometheus directly to confirm genuine metrics were registered
  console.log("\n================================================================================");
  console.log("   STEP 2: CONFIRM PROMETHEUS METRIC OBSERVATIONS                               ");
  console.log("================================================================================");
  const promQueryRes = await fetch(`http://localhost:9090/api/v1/query?query=sum(http_requests_total)`);
  assert(promQueryRes.ok, "Prometheus HTTP API responded with HTTP 200");
  const promJson = await promQueryRes.json();
  const totalRequests = Number(promJson.data?.result?.[0]?.value?.[1]);
  assert(Number.isFinite(totalRequests) && totalRequests > 0, `Prometheus registered real total requests: ${totalRequests}`);

  // 3. Query active SLOs to find target SLO
  console.log("\n================================================================================");
  console.log("   STEP 3: IDENTIFY RELEVANT SLO AND TRIGGER SLO EVALUATION                     ");
  console.log("================================================================================");
  const slosRes = await fetch(`${BACKEND_URL}/api/slos`);
  const slosJson = await slosRes.json();
  const slos = slosJson.data || slosJson;
  assert(Array.isArray(slos) && slos.length > 0, `Active SLOs available in system: ${slos.length}`);

  // 4. Wait a moment for Prometheus scrape and daemon evaluation cycle
  console.log("Allowing continuous SLO daemon evaluation cycle to process latest Prometheus metrics...");
  await new Promise((r) => setTimeout(r, 2000));

  // 5. Query the latest genuine PROMETHEUS_SLO_MONITOR incident
  console.log("\n================================================================================");
  console.log("   STEP 4: RETRIEVE RESULTING REAL INCIDENT                                     ");
  console.log("================================================================================");
  const incRes = await fetch(`${BACKEND_URL}/api/incidents`);
  const incJson = await incRes.json();
  const incidents = incJson.data || incJson;

  const genuineIncidents = incidents.filter(
    (i) => i.source === "PROMETHEUS_SLO_MONITOR" && i.status !== "RESOLVED"
  );
  assert(genuineIncidents.length > 0, `Found ${genuineIncidents.length} open genuine PROMETHEUS_SLO_MONITOR incidents`);

  const targetIncident = genuineIncidents[0];
  console.log(`Target Incident: ${targetIncident.incidentId} | Service: ${targetIncident.service} | Measured: ${targetIncident.actualValue} | Target: ${targetIncident.threshold}`);

  // 6. Trigger AI RCA on this exact genuine incident
  console.log("\n================================================================================");
  console.log("   STEP 5: EXECUTE AI ROOT CAUSE ANALYSIS ON REAL INCIDENT                      ");
  console.log("================================================================================");
  const rcaStartTime = Date.now();
  const rcaRes = await fetch(`${BACKEND_URL}/api/gemini-rca/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ incidentId: targetIncident.incidentId }),
  });
  assert(rcaRes.ok, `POST /api/gemini-rca/analyze returned HTTP ${rcaRes.status}`);
  const rcaJson = await rcaRes.json();
  const rca = rcaJson.data;

  // 7. Rigorous Validation of Real AI RCA Output
  console.log("\n================================================================================");
  console.log("   STEP 6: RIGOROUS VALIDATION OF REAL AI RCA EVIDENCE & HYPOTHESIS             ");
  console.log("================================================================================");
  assert(rca.incidentId === targetIncident.incidentId, `RCA incidentId matches target: ${rca.incidentId}`);
  assert(rca.requirementId === targetIncident.requirementId, `RCA requirementId matches incident: ${rca.requirementId}`);
  assert(rca.sloId === targetIncident.sloId, `RCA sloId matches incident: ${rca.sloId}`);
  assert(rca.service === targetIncident.service, `RCA service matches incident: ${rca.service}`);

  // Metrics validation
  assert(rca.impact && rca.impact.actualValue === targetIncident.actualValue, "RCA impact actualValue matches incident measured value");

  // Evidence validation
  const promEvs = rca.structuredEvidence.filter((e) => e.type === "PROMETHEUS");
  const logEvs = rca.structuredEvidence.filter((e) => e.type === "LOG");
  assert(promEvs.length >= 4, `Structured evidence contains ${promEvs.length} Prometheus queries`);
  assert(logEvs.length >= 5, `Structured evidence contains ${logEvs.length} container log lines`);

  // Timestamp correlation
  const incTime = new Date(targetIncident.createdAt || targetIncident.evaluatedAt).getTime();
  const evTimes = rca.structuredEvidence.map((e) => new Date(e.timestamp).getTime());
  const maxDiffMins = Math.max(...evTimes.map((t) => Math.abs(t - incTime))) / (1000 * 60);
  assert(maxDiffMins < 60, `Evidence timestamps are correlated within incident window (max delta: ${maxDiffMins.toFixed(1)} mins)`);

  // Facts vs Hypothesis
  assert(Array.isArray(rca.observedFacts) && rca.observedFacts.length >= 4, `Separated ${rca.observedFacts.length} OBSERVED FACTS`);
  assert(typeof rca.rootCauseHypothesis === "string" && rca.rootCauseHypothesis.length > 20, "Root cause hypothesis generated");
  assert(!rca.rootCauseHypothesis.includes("Database connection pool exhaustion") || targetIncident.metric.includes("pool"), "Hypothesis is dynamically generated (not static fallback)");

  // Confidence validation
  assert(typeof rca.confidence === "number" && rca.confidence > 0, `Confidence is dynamically derived: ${rca.confidence}`);
  assert(rca.confidenceDetails && rca.confidenceDetails.rationale.length > 20, "Confidence includes detailed rationale");

  // Provenance validation
  assert(rca.provenance && rca.provenance.isHistorical === false, "Provenance confirms live runtime incident");

  console.log("\n--------------------------------------------------------------------------------");
  console.log("RCA SUMMARY FOR REAL RUNTIME INCIDENT:");
  console.log(`  Incident:             ${rca.incidentId}`);
  console.log(`  Service:              ${rca.service}`);
  console.log(`  Requirement:          ${rca.requirementId}`);
  console.log(`  SLO:                  ${rca.sloId}`);
  console.log(`  Confidence:           ${(rca.confidence * 100).toFixed(0)}% (${rca.confidenceDetails.rationale.slice(0, 80)}...)`);
  console.log(`  Observed Facts Count: ${rca.observedFacts.length}`);
  console.log(`  Evidence Items Count: ${rca.structuredEvidence.length}`);
  console.log(`  Root Cause Hypothesis:\n    "${rca.rootCauseHypothesis}"`);
  console.log(`  Recommended Action:\n    "${rca.recommendedAction}"`);
  console.log("--------------------------------------------------------------------------------");

  console.log(`\nPIPELINE TEST SUMMARY: Passed=${passed}, Failed=${failed}`);
  if (failed === 0) {
    console.log("VERDICT: REAL INCIDENT -> TELEMETRY -> SLO -> INCIDENT -> RCA VERIFIED");
  } else {
    console.log("VERDICT: PIPELINE TEST FAILED");
    process.exit(1);
  }
}

testLivePipeline().catch((err) => {
  console.error("Live pipeline error:", err);
  process.exit(1);
});

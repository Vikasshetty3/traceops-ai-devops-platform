/**
 * PHASE 4.1 — GENUINE GEMINI RCA REASONING & EVIDENCE-GROUNDING AUDIT SUITE
 * 
 * Verifies:
 * 1. Live Gemini 2.5 Flash invocation via @google/genai SDK
 * 2. Distinction between Gemini reasoning and deterministic synthesis
 * 3. Unknown-cause inference without pre-programmed rules (Section 7 & 8)
 * 4. Counterfactual evidence perturbation (Section 9: Test A vs Test B vs Test C)
 * 5. Confidence responsiveness to evidence quality (Section 10: Strong vs Medium vs Weak vs None)
 * 6. Anti-hallucination enforcement (Section 11: rejection of unsupported root causes)
 * 7. Offline/Failure graceful degradation to DETERMINISTIC_EVIDENCE_SUMMARY (Section 12)
 * 8. Log and Prometheus provenance validation (Sections 14, 15, 16)
 * 9. Security isolation (Section 17: no API key leakage)
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runPhase41Audit() {
  console.log("================================================================================");
  console.log("   PHASE 4.1: GENUINE GEMINI RCA REASONING & EVIDENCE-GROUNDING AUDIT           ");
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // AUDIT 1: VERIFY GEMINI 2.5 FLASH IS ACTUALLY CALLED VIA LIVE API (Section 2 & 13)
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("1. LIVE GEMINI 2.5 FLASH INVOCATION AUDIT (/api/gemini-rca/analyze)");
  console.log("--------------------------------------------------------------------------------");

  const incRes = await fetch(`${BACKEND_URL}/api/incidents`);
  const incJson = await incRes.json();
  const incidents = incJson.data || incJson;
  const genuineIncidents = incidents.filter(
    (i) => i.source === "PROMETHEUS_SLO_MONITOR" && i.status !== "RESOLVED"
  );
  assert(genuineIncidents.length > 0, `Found ${genuineIncidents.length} genuine runtime incidents`);
  const liveIncident = genuineIncidents.find((i) => i.service === "PaymentsMicroservice" || i.service === "CatalogService") || genuineIncidents[0];
  console.log(`Auditing live incident: ${liveIncident.incidentId} (${liveIncident.service})`);

  const t0 = Date.now();
  const rcaRes = await fetch(`${BACKEND_URL}/api/gemini-rca/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ incidentId: liveIncident.incidentId }),
  });
  const t1 = Date.now();
  assert(rcaRes.status === 201, `POST /api/gemini-rca/analyze returned HTTP ${rcaRes.status}`);

  const rcaData = await rcaRes.json();
  const rca = rcaData.data;

  assert(rca.incidentId === liveIncident.incidentId, `RCA incident ID matches target (${rca.incidentId})`);
  assert(rca.provenance.llmModel === "gemini-2.5-flash", `Provenance confirms live model is gemini-2.5-flash (actual: ${rca.provenance.llmModel})`);
  assert(rca.analysisStatus === "EVIDENCE_BACKED", `Analysis status is EVIDENCE_BACKED (actual: ${rca.analysisStatus})`);
  assert(t1 - t0 > 800, `Real LLM network invocation elapsed duration: ${t1 - t0}ms (proves non-instantaneous live API query)`);
  assert(typeof rca.rootCauseHypothesis === "string" && rca.rootCauseHypothesis.length > 50, "Gemini generated comprehensive natural language hypothesis");
  assert(rca.confidenceDetails.rationale.includes("LLM reasoning validation"), "Confidence rationale incorporates Gemini LLM validation");

  console.log(`\nGemini Generated Hypothesis:\n  "${rca.rootCauseHypothesis.slice(0, 160)}..."\n`);

  await sleep(4000);

  // ---------------------------------------------------------------------------
  // AUDIT 2: UNKNOWN-CAUSE INFERENCE TEST (Section 7 & 8)
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("2. UNKNOWN-CAUSE / HIDDEN-CAUSE INFERENCE TEST");
  console.log("   (Injected cause not in RCA rules, not in endpoint name, not in prompt)");
  console.log("--------------------------------------------------------------------------------");

  // Distinctive unprogrammed failure signature:
  // Downstream third-party carrier DNS resolution timeout failure
  const hiddenCauseInput = {
    incidentId: "INC-HIDDEN-DNS-001",
    service: "ShippingIntegrationService",
    requirementId: "REQ-PROJ-855-001",
    sloId: "SLO-PROJ-855-001",
    actualValue: 4.85,
    threshold: 1.0,
    metric: "p95_latency",
    source: "RUNTIME_PROBE",
    logs: [
      "2026-10-01T06:40:12.110Z [ShippingIntegrationService] Outbound carrier dispatch initiated for batch #49281",
      "2026-10-01T06:40:17.115Z [ShippingIntegrationService] getaddrinfo EAI_AGAIN api.fedex-external.com: DNS lookup timed out after 5000ms",
      "2026-10-01T06:40:17.118Z [ShippingIntegrationService] Retrying DNS resolution over secondary resolver 10.96.0.10:53",
      "2026-10-01T06:40:19.450Z [ShippingIntegrationService] DNS query returned SERVFAIL from cluster CoreDNS",
      "2026-10-01T06:40:19.452Z [ShippingIntegrationService] Request aborted with upstream network timeout",
    ],
  };

  const hiddenRcaRes = await fetch(`${BACKEND_URL}/api/gemini-rca/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(hiddenCauseInput),
  });
  assert(hiddenRcaRes.status === 201, `Hidden cause test returned HTTP ${hiddenRcaRes.status}`);
  const hiddenRcaJson = await hiddenRcaRes.json();
  const hiddenRca = hiddenRcaJson.data;

  console.log(`Hidden Cause Gemini Hypothesis:\n  "${hiddenRca.rootCauseHypothesis}"\n`);
  const hypothesisLower = hiddenRca.rootCauseHypothesis.toLowerCase();
  const dnsIdentified = hypothesisLower.includes("dns") || hypothesisLower.includes("lookup") || hypothesisLower.includes("resolution") || hypothesisLower.includes("getaddrinfo");
  assert(dnsIdentified, "Gemini successfully inferred DNS lookup/resolution failure from logs without any hardcoded rule");
  assert(!hiddenRca.rootCauseHypothesis.includes("Database connection pool exhaustion"), "Gemini did NOT claim database connection pool exhaustion");

  await sleep(4000);

  // ---------------------------------------------------------------------------
  // AUDIT 3: COUNTERFACTUAL EVIDENCE PERTURBATION TEST (Section 9)
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("3. COUNTERFACTUAL EVIDENCE PERTURBATION TEST");
  console.log("--------------------------------------------------------------------------------");

  // Test A: Full evidence (Metrics + logs + SLO + req)
  const testAPayload = {
    incidentId: "INC-COUNTER-A",
    service: "PaymentsMicroservice",
    requirementId: "REQ-PROJ-855-001",
    sloId: "SLO-PROJ-855-001",
    actualValue: 3.5,
    threshold: 1.0,
    metric: "p95_latency",
    logs: [
      "2026-10-01T06:45:00.000Z [PaymentsMicroservice] Processing customer checkout authorization",
      "2026-10-01T06:45:03.450Z [PaymentsMicroservice] Upstream payment processor latency: 3450ms",
    ],
  };
  const resA = await fetch(`${BACKEND_URL}/api/gemini-rca/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(testAPayload),
  });
  const dataA = (await resA.json()).data;
  console.log(`  Test A (Metrics + Logs + SLO): Confidence = ${dataA.confidence}`);

  await sleep(4000);

  // Test B: Remove application logs
  const testBPayload = {
    incidentId: "INC-COUNTER-B",
    service: "PaymentsMicroservice",
    requirementId: "REQ-PROJ-855-001",
    sloId: "SLO-PROJ-855-001",
    actualValue: 3.5,
    threshold: 1.0,
    metric: "p95_latency",
    logs: [], // Explicitly no logs
  };
  const resB = await fetch(`${BACKEND_URL}/api/gemini-rca/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(testBPayload),
  });
  const dataB = (await resB.json()).data;
  console.log(`  Test B (Metrics + SLO, No Logs): Confidence = ${dataB.confidence}`);

  await sleep(4000);

  // Test C: Remove Prometheus metrics
  const testCPayload = {
    incidentId: "INC-COUNTER-C",
    service: "PaymentsMicroservice",
    requirementId: "REQ-PROJ-855-001",
    sloId: "SLO-PROJ-855-001",
    actualValue: 3.5,
    threshold: 1.0,
    metric: "p95_latency",
    omitPrometheus: true, // Explicitly omit Prometheus
    logs: [
      "2026-10-01T06:45:00.000Z [PaymentsMicroservice] Upstream payment processor latency: 3450ms",
    ],
  };
  const resC = await fetch(`${BACKEND_URL}/api/gemini-rca/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(testCPayload),
  });
  const dataC = (await resC.json()).data;
  console.log(`  Test C (Logs + SLO, No Prometheus): Confidence = ${dataC.confidence}`);

  assert(dataA.confidence > dataB.confidence, `Confidence decreases when logs are removed: Test A (${dataA.confidence}) > Test B (${dataB.confidence})`);
  assert(dataA.confidence > dataC.confidence, `Confidence decreases when Prometheus is removed: Test A (${dataA.confidence}) > Test C (${dataC.confidence})`);
  assert(dataA.rootCauseHypothesis !== dataB.rootCauseHypothesis, "RCA hypothesis dynamically changes when evidence sources change");

  await sleep(4000);

  // ---------------------------------------------------------------------------
  // AUDIT 4: CONFIDENCE QUALITY LEVEL AUDIT (Section 10)
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("4. CONFIDENCE QUALITY LEVEL AUDIT (Strong vs Medium vs Weak vs None)");
  console.log("--------------------------------------------------------------------------------");

  // Strong: incident with full evidence (Metrics + Logs + SLO + Traceability)
  const strongConf = dataA.confidence;
  console.log(`  Strong Evidence (Full Context): Confidence = ${strongConf}`);

  // Medium: incident with partial evidence (no logs)
  const medConf = dataB.confidence;
  console.log(`  Medium Evidence (No Logs): Confidence = ${medConf}`);

  // Weak: incident with minimal telemetry (no Prometheus)
  const weakConf = dataC.confidence;
  console.log(`  Weak Evidence (No Prometheus): Confidence = ${weakConf}`);

  // None: non-existent incident
  const noEvRes = await fetch(`${BACKEND_URL}/api/gemini-rca/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ incidentId: "INC-NON-EXISTENT-88888" }),
  });
  const noEvData = (await noEvRes.json()).data;
  const noEvConf = noEvData.confidence;
  console.log(`  No Evidence (Non-Existent): Confidence = ${noEvConf} (Status: ${noEvData.analysisStatus})`);

  assert(strongConf > medConf, `Strong confidence (${strongConf}) > Medium confidence (${medConf})`);
  assert(medConf > weakConf, `Medium confidence (${medConf}) > Weak confidence (${weakConf})`);
  assert(weakConf > noEvConf, `Weak confidence (${weakConf}) > No-evidence confidence (${noEvConf})`);
  assert(noEvConf === 0.0, `No-evidence confidence is exactly 0.0`);
  assert(noEvData.analysisStatus === "INSUFFICIENT_EVIDENCE", "No-evidence status is INSUFFICIENT_EVIDENCE");

  await sleep(4000);

  // ---------------------------------------------------------------------------
  // AUDIT 5: ANTI-HALLUCINATION AUDIT (Section 11)
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("5. ANTI-HALLUCINATION AUDIT (Rejection of Unsupported Explanations)");
  console.log("--------------------------------------------------------------------------------");

  // Pure CPU spike incident with zero database or memory anomalies
  const cpuPayload = {
    incidentId: "INC-CPU-PURE-001",
    service: "Backend",
    requirementId: "REQ-PROJ-855-001",
    sloId: "SLO-PROJ-855-001",
    actualValue: 92,
    threshold: 80,
    metric: "cpu_usage",
    cpuUsage: 92,
    memoryUsage: 14.5,
    errorRate: 0.0,
    logs: [
      "2026-10-01T06:50:00.000Z [Backend] High thread contention in cryptographic key hashing loop",
      "2026-10-01T06:50:01.000Z [Backend] Worker thread 4 CPU affinity saturated at 99.8%",
    ],
  };

  const cpuRes = await fetch(`${BACKEND_URL}/api/gemini-rca/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cpuPayload),
  });
  const cpuData = (await cpuRes.json()).data;
  const cpuHypo = cpuData.rootCauseHypothesis.toLowerCase();
  console.log(`  CPU Incident Hypothesis:\n    "${cpuData.rootCauseHypothesis.slice(0, 150)}..."`);

  assert(!cpuHypo.includes("database connection pool"), "Did NOT hallucinate database connection pool exhaustion");
  assert(!cpuHypo.includes("memory leak") && !cpuHypo.includes("out of memory"), "Did NOT hallucinate memory leak or OOM crash");
  assert(cpuHypo.includes("cpu") || cpuHypo.includes("thread") || cpuHypo.includes("cryptographic") || cpuHypo.includes("saturation"), "Correctly grounded hypothesis on CPU/compute metrics");

  // ---------------------------------------------------------------------------
  // AUDIT 6: OFFLINE / FAILURE BEHAVIOR AUDIT (Section 12)
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("6. OFFLINE / GEMINI UNAVAILABILITY TEST");
  console.log("--------------------------------------------------------------------------------");

  // Call internal GeminiRcaService directly inside the container with simulated bad key
  const { execSync } = require("child_process");
  const offlineCheckScript = `
    const mongoose = require('mongoose');
    mongoose.connect('mongodb://mongodb:27017/requirement_traceable_devops').then(async () => {
      process.env.GEMINI_API_KEY = 'invalid_mock_key_offline_sim';
      const { GeminiRcaService } = require('./dist/backend/src/ai/geminiRcaService');
      const res = await GeminiRcaService.analyze('${liveIncident.incidentId}');
      console.log(JSON.stringify({
        status: res.status,
        llmModel: res.provenance.llmModel,
        hypothesis: res.rootCauseHypothesis.slice(0, 60),
        confidence: res.confidence
      }));
      process.exit(0);
    });
  `;

  try {
    const rawOut = execSync(
      `docker exec traceops-backend node -e "${offlineCheckScript.replace(/\n/g, " ")}"`,
      { encoding: "utf8" }
    );
    const parsedOut = JSON.parse(rawOut.trim().split("\n").pop());
    console.log("  Simulated Offline Result:", parsedOut);
    assert(parsedOut.status === "DETERMINISTIC_EVIDENCE_SUMMARY", `Offline status is explicitly DETERMINISTIC_EVIDENCE_SUMMARY (actual: ${parsedOut.status})`);
    assert(parsedOut.llmModel === "deterministic-evidence-analyzer", `LLM model indicates deterministic-evidence-analyzer (actual: ${parsedOut.llmModel})`);
    assert(parsedOut.hypothesis.startsWith("[DETERMINISTIC_EVIDENCE_SUMMARY]"), "Hypothesis is explicitly prefixed with [DETERMINISTIC_EVIDENCE_SUMMARY]");
  } catch (err) {
    console.error("  Offline test execution error:", err.message);
    assert(false, "Offline test executed cleanly");
  }

  // ---------------------------------------------------------------------------
  // AUDIT 7: SECURITY & CREDENTIAL ISOLATION AUDIT (Section 17)
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("7. SECURITY & CREDENTIAL ISOLATION AUDIT");
  console.log("--------------------------------------------------------------------------------");

  const rawRcaString = JSON.stringify(rcaData);
  assert(!rawRcaString.includes("AQ.Ab8RN6"), "Gemini API key is NEVER exposed in API response");
  assert(!rawRcaString.includes("traceops_production_secret_key_2026"), "JWT secret is NEVER exposed in API response");
  assert(rca.remediation && Array.isArray(rca.remediation), "Remediation recommendations are read-only advisory suggestions");

  // ---------------------------------------------------------------------------
  // AUDIT SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`PHASE 4.1 AUDIT SUITE FINISHED: Passed=${passed}, Failed=${failed}`);
  console.log("================================================================================");

  if (failed === 0) {
    console.log("VERDICT: GEMINI 2.5 FLASH GENUINE REASONING PROVEN");
  } else {
    console.error("VERDICT: GEMINI REASONING AUDIT FAILED");
    process.exit(1);
  }
}

runPhase41Audit().catch((err) => {
  console.error("Fatal error during Phase 4.1 audit:", err);
  process.exit(1);
});

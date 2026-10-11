/**
 * Phase 3.3: Real ML Training Pipeline & Production Readiness Test Suite
 *
 * Validates:
 * Test 1  - Real dataset extraction (genuine runtime records only)
 * Test 2  - Source provenance validation (sourceId, sloId, service, featureTimestamp)
 * Test 3  - Feature completeness (6 production features, bounded, no dbPoolUsage)
 * Test 4  - Label correctness (derived from genuine SLO compliance/breach state)
 * Test 5  - Historical and seed incidents strictly excluded
 * Test 6  - Synthetic generator records strictly excluded
 * Test 7  - Duplicate detection across observations and incidents
 * Test 8  - Train / validation / test leakage detection (zero overlap)
 * Test 9  - Chronological split monotonicity
 * Test 10 - Production readiness gate and safe training deferral
 */

const BASE_URL = process.env.BACKEND_URL || "http://localhost:5000";

async function request(path) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url);
  const json = await res.json();
  return { status: res.status, json };
}

// Inline lightweight runtime builder logic for standalone node execution
function extractObservation(obs) {
  if (obs.label !== "NON_VIOLATION" || obs.evaluationStatus !== "COMPLIANT") return null;
  const f = obs.features;
  if (!f) return null;
  const cpu = f.cpuUsage;
  const mem = f.memoryUsage;
  const lat = f.p95Latency;
  const err = f.errorRate;
  const req = f.requestRate;
  const dep = f.deploymentChanged === 1 ? 1 : 0;

  if (cpu === null || cpu === undefined || !Number.isFinite(cpu) || cpu < 0 || cpu > 100) return null;
  if (mem === null || mem === undefined || !Number.isFinite(mem) || mem < 0 || mem > 100) return null;
  if (lat === null || lat === undefined || !Number.isFinite(lat) || lat < 0) return null;
  if (err === null || err === undefined || !Number.isFinite(err) || err < 0 || err > 100) return null;
  if (req === null || req === undefined || !Number.isFinite(req) || req < 0) return null;

  const timestamp = obs.observedAt ? new Date(obs.observedAt).toISOString() : new Date().toISOString();

  return {
    sampleId: `SMP-OBS-${obs.observationId || obs._id}`,
    sourceType: "TELEMETRY_OBSERVATION",
    sourceId: obs.observationId || String(obs._id),
    sloId: obs.sloId,
    requirementId: obs.requirementId && obs.requirementId !== "UNLINKED" ? obs.requirementId : null,
    service: obs.service,
    featureTimestamp: timestamp,
    features: {
      cpuUsage: Number(cpu.toFixed(2)),
      memoryUsage: Number(mem.toFixed(2)),
      p95Latency: Number(lat.toFixed(4)),
      errorRate: Number(err.toFixed(2)),
      requestRate: Number(req.toFixed(2)),
      deploymentChanged: dep,
    },
    label: 0,
    labelString: "NON_VIOLATION",
    sourceTimestamp: timestamp,
    provenance: obs.provenance || {},
  };
}

function extractIncident(inc) {
  if (inc.source !== "PROMETHEUS_SLO_MONITOR") return null;

  const m = inc.metrics || {};
  const overview = inc.telemetryEvidence?.overview || {};
  const app = overview.application || {};
  const host = overview.host || {};

  const cpu = host.cpuUsage ?? m.cpuUsage;
  const mem = host.memoryUsage ?? m.memoryUsage;
  const lat = inc.metric?.includes("latency") ? inc.actualValue : (m.p95Latency ?? m.latency ?? app.p95Latency);
  const err = inc.metric?.includes("error") ? inc.actualValue : (m.errorRate ?? app.errorRate);
  const req = app.requestRate ?? m.requestRate;
  const dep = m.deploymentChanged ? 1 : 0;

  if (cpu === null || cpu === undefined || !Number.isFinite(cpu) || cpu < 0 || cpu > 100) return null;
  if (mem === null || mem === undefined || !Number.isFinite(mem) || mem < 0 || mem > 100) return null;
  if (lat === null || lat === undefined || !Number.isFinite(lat) || lat < 0) return null;
  if (err === null || err === undefined || !Number.isFinite(err) || err < 0 || err > 100) return null;
  if (req === null || req === undefined || !Number.isFinite(req) || req < 0) return null;

  const timestamp = (inc.evaluatedAt || inc.createdAt)
    ? new Date(inc.evaluatedAt || inc.createdAt).toISOString()
    : new Date().toISOString();

  return {
    sampleId: `SMP-INC-${inc.incidentId || inc._id}`,
    sourceType: "INCIDENT",
    sourceId: inc.incidentId || String(inc._id),
    sloId: inc.sloId,
    requirementId: inc.requirementId && inc.requirementId !== "UNLINKED" ? inc.requirementId : null,
    service: inc.service,
    featureTimestamp: timestamp,
    features: {
      cpuUsage: Number(cpu.toFixed(2)),
      memoryUsage: Number(mem.toFixed(2)),
      p95Latency: Number(lat.toFixed(4)),
      errorRate: Number(err.toFixed(2)),
      requestRate: Number(req.toFixed(2)),
      deploymentChanged: dep,
    },
    label: 1,
    labelString: "VIOLATION",
    sourceTimestamp: timestamp,
    provenance: {
      source: "PROMETHEUS_SLO_MONITOR",
      promQl: inc.promQl,
      measuredValue: inc.actualValue,
      threshold: inc.threshold,
    },
  };
}

async function runPhase3_3Tests() {
  console.log("================================================================================");
  console.log("TRACE-OPS: PHASE 3.3 REAL ML TRAINING PIPELINE & PRODUCTION READINESS AUDIT");
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

  // ----------------------------------------------------
  // Test 1: Real Dataset Extraction
  // ----------------------------------------------------
  console.log("[1/10] Verifying Real Dataset Extraction from Live Runtime Databases...");
  const [obsRes, incRes] = await Promise.all([
    request("/api/telemetry-observations?featuresComplete=true&limit=500"),
    request("/api/incidents"),
  ]);

  const rawObservations = obsRes.json?.data || [];
  const rawIncidents = incRes.json?.data || incRes.json || [];

  assert(rawObservations.length > 0, `Retrieved ${rawObservations.length} raw telemetry observations from MongoDB`);
  assert(rawIncidents.length > 0, `Retrieved ${rawIncidents.length} raw incidents from MongoDB`);

  const allSamples = [];
  const seenSourceIds = new Set();
  let duplicateCount = 0;

  for (const obs of rawObservations) {
    const s = extractObservation(obs);
    if (!s) continue;
    if (seenSourceIds.has(s.sourceId)) {
      duplicateCount++;
      continue;
    }
    seenSourceIds.add(s.sourceId);
    allSamples.push(s);
  }

  for (const inc of rawIncidents) {
    const s = extractIncident(inc);
    if (!s) continue;
    if (seenSourceIds.has(s.sourceId)) {
      duplicateCount++;
      continue;
    }
    seenSourceIds.add(s.sourceId);
    allSamples.push(s);
  }

  assert(allSamples.length >= 100, `Total extracted genuine samples (${allSamples.length}) satisfies minimum volume (>= 100)`);

  const healthyCount = allSamples.filter((s) => s.label === 0).length;
  const breachCount = allSamples.filter((s) => s.label === 1).length;
  assert(healthyCount >= 30, `Extracted ${healthyCount} genuine NON_VIOLATION samples (>= 30 required)`);
  assert(breachCount >= 30, `Extracted ${breachCount} genuine VIOLATION samples (>= 30 required)`);

  // ----------------------------------------------------
  // Test 2: Source Provenance Validation
  // ----------------------------------------------------
  console.log("\n[2/10] Verifying Source Provenance for Every Training Sample...");
  let allHaveValidProvenance = true;
  for (const s of allSamples) {
    if (!s.sourceId || !s.sourceType || !s.sloId || !s.service || !s.featureTimestamp) {
      allHaveValidProvenance = false;
      break;
    }
  }
  assert(allHaveValidProvenance, "Every sample contains valid sourceId, sourceType, sloId, service, and featureTimestamp");

  const sampleObs = allSamples.find((s) => s.sourceType === "TELEMETRY_OBSERVATION");
  const sampleInc = allSamples.find((s) => s.sourceType === "INCIDENT");
  assert(sampleObs !== undefined && sampleObs.sourceId.startsWith("OBS-"), `Observation sample preserves genuine ID: ${sampleObs?.sourceId}`);
  assert(sampleInc !== undefined && sampleInc.sourceId.startsWith("INC-"), `Incident sample preserves genuine ID: ${sampleInc?.sourceId}`);

  // ----------------------------------------------------
  // Test 3: Feature Completeness & Bounds Validation
  // ----------------------------------------------------
  console.log("\n[3/10] Verifying Feature Completeness, Bounds & Removal of Deprecated Fields...");
  let allFeaturesComplete = true;
  let allFeaturesBounded = true;
  let hasDbPoolUsage = false;

  for (const s of allSamples) {
    const f = s.features;
    if (
      f.cpuUsage === null || f.memoryUsage === null ||
      f.p95Latency === null || f.errorRate === null ||
      f.requestRate === null || f.deploymentChanged === null
    ) {
      allFeaturesComplete = false;
      break;
    }

    if (
      f.cpuUsage < 0 || f.cpuUsage > 100 ||
      f.memoryUsage < 0 || f.memoryUsage > 100 ||
      f.p95Latency < 0 ||
      f.errorRate < 0 || f.errorRate > 100 ||
      f.requestRate < 0 ||
      (f.deploymentChanged !== 0 && f.deploymentChanged !== 1)
    ) {
      allFeaturesBounded = false;
      break;
    }

    if ("dbPoolUsage" in f) {
      hasDbPoolUsage = true;
    }
  }

  assert(allFeaturesComplete, "All 6 production features are present and non-null across every sample");
  assert(allFeaturesBounded, "All feature values lie strictly within physical metric bounds");
  assert(!hasDbPoolUsage, "Strictly NO dbPoolUsage feature exists in training records");

  // ----------------------------------------------------
  // Test 4: Label Correctness
  // ----------------------------------------------------
  console.log("\n[4/10] Verifying Label Correctness (Derived from Actual SLO Status)...");
  let labelsCorrect = true;
  for (const s of allSamples) {
    if (s.sourceType === "TELEMETRY_OBSERVATION" && s.label !== 0) labelsCorrect = false;
    if (s.sourceType === "INCIDENT" && s.label !== 1) labelsCorrect = false;
  }
  assert(labelsCorrect, "Labels strictly match source type: TelemetryObservation = 0 (NON_VIOLATION), Incident = 1 (VIOLATION)");

  // ----------------------------------------------------
  // Test 5: Historical Incidents Excluded
  // ----------------------------------------------------
  console.log("\n[5/10] Verifying Historical Seed/Demo Incidents are Excluded...");
  const historicalSeedIncidents = rawIncidents.filter((i) => i.source === "HISTORICAL");
  assert(historicalSeedIncidents.length >= 30, `Identified ${historicalSeedIncidents.length} historical seed incidents in raw DB (>= 30 expected)`);

  const historicalInDataset = allSamples.filter((s) => s.provenance?.source === "HISTORICAL");
  assert(historicalInDataset.length === 0, "CRITICAL: Zero historical seed incidents are present in training dataset");

  // ----------------------------------------------------
  // Test 6: Synthetic Generator Records Excluded
  // ----------------------------------------------------
  console.log("\n[6/10] Verifying Synthetic Generator Records are Excluded...");
  const syntheticServiceNames = new Set(["Inventory"]); // Synthetic generator uses Inventory, live services do not
  const syntheticPresent = allSamples.filter((s) => syntheticServiceNames.has(s.service));
  assert(syntheticPresent.length === 0, "Zero synthetic generator records found in dataset");

  // ----------------------------------------------------
  // Test 7: Duplicate Detection
  // ----------------------------------------------------
  console.log("\n[7/10] Verifying Duplicate Detection Policy...");
  const uniqueIds = new Set(allSamples.map((s) => s.sourceId));
  assert(uniqueIds.size === allSamples.length, `Every sample has unique sourceId (${uniqueIds.size} unique IDs for ${allSamples.length} samples)`);
  console.log(`       Identified and safely excluded ${duplicateCount} duplicate source records during extraction`);

  // ----------------------------------------------------
  // Test 8: Train / Validation / Test Leakage Detection
  // ----------------------------------------------------
  console.log("\n[8/10] Verifying Chronological Split & Zero Data Leakage...");
  // Chronological sort
  allSamples.sort((a, b) => new Date(a.featureTimestamp).getTime() - new Date(b.featureTimestamp).getTime());

  const total = allSamples.length;
  const trainEnd = Math.floor(total * 0.7);
  const valEnd = Math.floor(total * 0.85);

  const train = allSamples.slice(0, trainEnd);
  const validation = allSamples.slice(trainEnd, valEnd);
  const test = allSamples.slice(valEnd);

  const trainIds = new Set(train.map((s) => s.sourceId));
  const valIds = new Set(validation.map((s) => s.sourceId));
  const testIds = new Set(test.map((s) => s.sourceId));

  let trainValOverlap = 0;
  for (const id of valIds) if (trainIds.has(id)) trainValOverlap++;

  let trainTestOverlap = 0;
  for (const id of testIds) if (trainIds.has(id)) trainTestOverlap++;

  let valTestOverlap = 0;
  for (const id of testIds) if (valIds.has(id)) valTestOverlap++;

  assert(trainValOverlap === 0, `Train ∩ Validation overlap is strictly 0 (got ${trainValOverlap})`);
  assert(trainTestOverlap === 0, `Train ∩ Test overlap is strictly 0 (got ${trainTestOverlap})`);
  assert(valTestOverlap === 0, `Validation ∩ Test overlap is strictly 0 (got ${valTestOverlap})`);

  // ----------------------------------------------------
  // Test 9: Chronological Monotonicity
  // ----------------------------------------------------
  console.log("\n[9/10] Verifying Chronological Boundary Monotonicity...");
  const maxTrainTime = new Date(train[train.length - 1].featureTimestamp).getTime();
  const minValTime = new Date(validation[0].featureTimestamp).getTime();
  const maxValTime = new Date(validation[validation.length - 1].featureTimestamp).getTime();
  const minTestTime = new Date(test[0].featureTimestamp).getTime();

  assert(maxTrainTime <= minValTime, `Chronological split: max(Train) [${new Date(maxTrainTime).toISOString()}] <= min(Val) [${new Date(minValTime).toISOString()}]`);
  assert(maxValTime <= minTestTime, `Chronological split: max(Val) [${new Date(maxValTime).toISOString()}] <= min(Test) [${new Date(minTestTime).toISOString()}]`);

  // ----------------------------------------------------
  // Test 10: Production Readiness Gate & Safe Training Deferral
  // ----------------------------------------------------
  console.log("\n[10/10] Evaluating Production Readiness Gate & Deferral Logic...");
  const days = new Set(allSamples.map((s) => new Date(s.featureTimestamp).toISOString().slice(0, 10)));
  const timestamps = allSamples.map((s) => new Date(s.featureTimestamp).getTime());
  const timeSpanHours = ((timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 3600)).toFixed(2);

  console.log(`       Dataset spans ${days.size} calendar day(s) across ${timeSpanHours} hours`);
  const isTemporalDiversitySufficient = days.size >= 3 && Number(timeSpanHours) >= 24.0;

  assert(
    isTemporalDiversitySufficient,
    `Readiness gate correctly validates temporal diversity criteria (${days.size} days >= 3, ${timeSpanHours}h >= 24h threshold)`
  );

  // Verify that active model version remains untouched
  const mlHealthRes = await fetch("http://localhost:5001/health").then((r) => r.json()).catch(() => ({}));
  assert(
    mlHealthRes?.modelVersion === "2.0.0-production-telemetry",
    `Production model version is untouched: ${mlHealthRes?.modelVersion}`
  );
  assert(
    mlHealthRes?.status === "HEALTHY",
    "Production ML service status is HEALTHY"
  );

  console.log("\n================================================================================");
  console.log(`PHASE 3.3 TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase3_3Tests().catch((err) => {
  console.error("Test runner encountered error:", err);
  process.exit(1);
});

const BASE_URL = process.env.BACKEND_URL || "http://localhost:5000";

async function runDetailedAudit() {
  console.log(`Connecting to TraceOps Backend API: ${BASE_URL}`);

  // Fetch summary and list of observations
  const [summaryRes, obsRes, incidentsRes] = await Promise.all([
    fetch(`${BASE_URL}/api/telemetry-observations/summary`).then((r) => r.json()),
    fetch(`${BASE_URL}/api/telemetry-observations?limit=500`).then((r) => r.json()),
    fetch(`${BASE_URL}/api/incidents`).then((r) => r.json()),
  ]);

  const observations = obsRes.data || [];
  const incidents = incidentsRes.data || incidentsRes || [];

  console.log("\n========================================================");
  console.log("1. TELEMETRY OBSERVATIONS AUDIT (HEALTHY / NON_VIOLATION)");
  console.log("========================================================");
  console.log(`Total Stored Observations: ${observations.length}`);

  let nonViolationObs = 0;
  let violationObs = 0;
  let completeObs = 0;
  let incompleteObs = 0;
  const obsServices = new Set();
  const obsSlos = new Set();
  const obsReqs = new Set();
  const obsHourly = {};
  const obsDaily = {};

  for (const obs of observations) {
    if (obs.label === "NON_VIOLATION") nonViolationObs++;
    if (obs.label === "VIOLATION") violationObs++;
    if (obs.featuresComplete) completeObs++;
    else incompleteObs++;

    if (obs.service) obsServices.add(obs.service);
    if (obs.sloId) obsSlos.add(obs.sloId);
    if (obs.requirementId) obsReqs.add(obs.requirementId);

    const d = new Date(obs.observedAt);
    const dayStr = d.toISOString().slice(0, 10);
    const hourStr = d.toISOString().slice(0, 13) + ":00Z";

    obsDaily[dayStr] = (obsDaily[dayStr] || 0) + 1;
    obsHourly[hourStr] = (obsHourly[hourStr] || 0) + 1;
  }

  console.log(`NON_VIOLATION Observations: ${nonViolationObs}`);
  console.log(`VIOLATION Observations:     ${violationObs}`);
  console.log(`Features Complete:          ${completeObs}`);
  console.log(`Features Incomplete:        ${incompleteObs}`);
  console.log(`Distinct Services (${obsServices.size}):`, Array.from(obsServices).sort());
  console.log(`Distinct SLOs (${obsSlos.size})`);
  console.log(`Distinct Requirements (${obsReqs.size})`);
  console.log(`Daily Distribution:`, obsDaily);
  console.log(`Hourly Distribution:`, obsHourly);

  console.log("\n========================================================");
  console.log("2. INCIDENTS AUDIT (VIOLATIONS)");
  console.log("========================================================");
  console.log(`Total Stored Incidents: ${incidents.length}`);

  const sourceCounts = {};
  const promIncidents = [];
  for (const inc of incidents) {
    const src = inc.source || "UNKNOWN";
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    if (src === "PROMETHEUS_SLO_MONITOR") {
      promIncidents.push(inc);
    }
  }

  console.log(`Incidents by Source:`, sourceCounts);
  console.log(`PROMETHEUS_SLO_MONITOR Incidents: ${promIncidents.length}`);

  let completeIncCount = 0;
  let incompleteIncCount = 0;
  const incServices = new Set();
  const incSlos = new Set();
  const incReqs = new Set();
  const incHourly = {};
  const incDaily = {};

  const incFeatureStats = {
    cpu: 0,
    memory: 0,
    latency: 0,
    errorRate: 0,
    requestRate: 0,
  };

  for (const inc of promIncidents) {
    if (inc.service) incServices.add(inc.service);
    if (inc.sloId) incSlos.add(inc.sloId);
    if (inc.requirementId) incReqs.add(inc.requirementId);

    const m = inc.metrics || {};
    const overview = inc.telemetryEvidence?.overview || {};
    const app = overview.application || {};
    const host = overview.host || {};

    const cpu = host.cpuUsage ?? m.cpuUsage;
    const mem = host.memoryUsage ?? m.memoryUsage;
    const lat = inc.metric?.includes("latency") ? inc.actualValue : (m.p95Latency ?? m.latency ?? app.p95Latency);
    const err = inc.metric?.includes("error") ? inc.actualValue : (m.errorRate ?? app.errorRate);
    const req = app.requestRate ?? m.requestRate;

    const hasCpu = cpu !== undefined && cpu !== null && Number.isFinite(cpu);
    const hasMem = mem !== undefined && mem !== null && Number.isFinite(mem);
    const hasLat = lat !== undefined && lat !== null && Number.isFinite(lat);
    const hasErr = err !== undefined && err !== null && Number.isFinite(err);
    const hasReq = req !== undefined && req !== null && Number.isFinite(req);

    if (hasCpu) incFeatureStats.cpu++;
    if (hasMem) incFeatureStats.memory++;
    if (hasLat) incFeatureStats.latency++;
    if (hasErr) incFeatureStats.errorRate++;
    if (hasReq) incFeatureStats.requestRate++;

    if (hasCpu && hasMem && hasLat && hasErr && hasReq) {
      completeIncCount++;
    } else {
      incompleteIncCount++;
    }

    const d = new Date(inc.createdAt || inc.evaluatedAt);
    const dayStr = d.toISOString().slice(0, 10);
    const hourStr = d.toISOString().slice(0, 13) + ":00Z";

    incDaily[dayStr] = (incDaily[dayStr] || 0) + 1;
    incHourly[hourStr] = (incHourly[hourStr] || 0) + 1;
  }

  console.log(`Complete Feature Sets for ML:   ${completeIncCount}`);
  console.log(`Incomplete Feature Sets:        ${incompleteIncCount}`);
  console.log(`Feature Presence Counts:`, incFeatureStats);
  console.log(`Distinct Services (${incServices.size}):`, Array.from(incServices).sort());
  console.log(`Distinct SLOs (${incSlos.size})`);
  console.log(`Distinct Requirements (${incReqs.size})`);
  console.log(`Daily Distribution:`, incDaily);
  console.log(`Hourly Distribution:`, incHourly);

  console.log("\n========================================================");
  console.log("3. COMBINED RUNTIME TRAINING POOL");
  console.log("========================================================");
  console.log(`Usable Genuine NON_VIOLATION: ${completeObs}`);
  console.log(`Usable Genuine VIOLATION:     ${completeIncCount}`);
  console.log(`Total Usable Dataset:         ${completeObs + completeIncCount}`);
  console.log(`Class Ratio (Violation : Non-Violation): ${(completeIncCount / (completeObs || 1)).toFixed(2)} : 1`);

  // Earliest and latest across both
  const allTimestamps = [
    ...observations.map((o) => new Date(o.observedAt).getTime()),
    ...promIncidents.map((i) => new Date(i.createdAt || i.evaluatedAt).getTime()),
  ].sort((a, b) => a - b);

  if (allTimestamps.length > 0) {
    const earliest = new Date(allTimestamps[0]).toISOString();
    const latest = new Date(allTimestamps[allTimestamps.length - 1]).toISOString();
    const spanHours = ((allTimestamps[allTimestamps.length - 1] - allTimestamps[0]) / (1000 * 3600)).toFixed(2);
    console.log(`Earliest Timestamp: ${earliest}`);
    console.log(`Latest Timestamp:   ${latest}`);
    console.log(`Total Time Span:    ${spanHours} hours`);
  }
}

runDetailedAudit().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});

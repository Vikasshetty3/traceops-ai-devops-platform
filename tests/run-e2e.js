/**
 * Fast Native E2E Test Suite for Requirement Traceable DevOps Platform
 */

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

async function runTests() {
  console.log(`\n🚀 Starting End-to-End DevOps Integration Test Suite against ${BACKEND_URL}...\n`);
  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}:`, err.message || err);
    }
  }

  // 1. Health check
  await test("Backend Health Endpoint", async () => {
    const res = await fetch(`${BACKEND_URL}/api/health`);
    if (!res.ok) throw new Error(`Health returned status ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("Health check reported failure");
  });

  // 2. Requirements CRUD
  let testReqId = `REQ-TEST-${Date.now().toString().slice(-4)}`;
  await test("Requirement Creation & Retrieval", async () => {
    const createRes = await fetch(`${BACKEND_URL}/api/requirements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requirementId: testReqId,
        title: "Integration Test Requirement",
        description: "Test description for latency SLA under load",
        service: "Checkout",
        priority: "CRITICAL",
        metric: "p95_latency",
        threshold: 2.0,
      }),
    });
    if (!createRes.ok) throw new Error(`Create req failed: ${createRes.status}`);
    
    const getRes = await fetch(`${BACKEND_URL}/api/requirements/${testReqId}`);
    if (!getRes.ok) throw new Error(`Get req failed: ${getRes.status}`);
    const reqData = await getRes.json();
    if (reqData.data.requirementId !== testReqId) throw new Error("Mismatched requirement ID");
  });

  // 3. SLO CRUD
  let testSloId = `SLO-TEST-${Date.now().toString().slice(-4)}`;
  await test("SLO Creation Linked to Requirement", async () => {
    const createRes = await fetch(`${BACKEND_URL}/api/slos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sloId: testSloId,
        requirementId: testReqId,
        service: "Checkout",
        metric: "p95_latency",
        operator: "<",
        threshold: 2.0,
        unit: "seconds",
        severity: "CRITICAL",
      }),
    });
    if (!createRes.ok) throw new Error(`Create SLO failed: ${createRes.status}`);

    const getRes = await fetch(`${BACKEND_URL}/api/slos/${testSloId}`);
    if (!getRes.ok) throw new Error(`Get SLO failed: ${getRes.status}`);
    const sloData = await getRes.json();
    if (sloData.data.sloId !== testSloId) throw new Error("Mismatched SLO ID");
  });

  // 4. ML Violation Prediction
  await test("ML Violation Prediction Endpoint", async () => {
    const mlRes = await fetch(`${BACKEND_URL}/api/ml`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requirementId: testReqId,
        service: "Checkout",
        cpuUsage: 92,
        memoryUsage: 60,
        errorRate: 2.0,
        latency: 2.8,
        deploymentChanged: 0,
      }),
    });
    if (!mlRes.ok) throw new Error(`ML prediction failed: ${mlRes.status}`);
    const mlData = await mlRes.json();
    if (!mlData.success || mlData.data.prediction !== "VIOLATION") {
      throw new Error(`Expected VIOLATION but got ${mlData.data?.prediction}`);
    }
  });

  // 5. Incident Triggering
  let testIncId = `INC-TEST-${Date.now().toString().slice(-4)}`;
  await test("Incident Creation Linked to Requirement & SLO", async () => {
    const incRes = await fetch(`${BACKEND_URL}/api/incidents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        incidentId: testIncId,
        requirementId: testReqId,
        sloId: testSloId,
        service: "Checkout",
        metric: "p95_latency",
        actualValue: 2.8,
        threshold: 2.0,
        severity: "CRITICAL",
        message: "Checkout latency 2.8s breached SLO threshold 2.0s",
      }),
    });
    if (!incRes.ok) throw new Error(`Incident creation failed: ${incRes.status}`);
  });

  // 6. Gemini RCA Generation & Persistence
  let generatedRcaId = "";
  await test("Gemini RCA Analysis & MongoDB Persistence", async () => {
    const rcaRes = await fetch(`${BACKEND_URL}/api/gemini-rca`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requirementId: testReqId,
        incidentId: testIncId,
        service: "Checkout",
        slo: "p95 latency < 2.0 seconds",
        metric: "p95_latency",
        actualValue: 2.8,
        threshold: 2.0,
        logs: [
          "Database connection pool exhausted",
          "High queue wait times on checkout transactions",
        ],
        cpuUsage: 92,
        memoryUsage: 60,
        errorRate: 2.0,
        deploymentChanged: false,
      }),
    });
    if (!rcaRes.ok) throw new Error(`Gemini RCA failed: ${rcaRes.status}`);
    const rcaData = await rcaRes.json();
    if (!rcaData.success || !rcaData.data.rootCause || !rcaData.data.rcaId) {
      throw new Error("Invalid RCA payload structure returned");
    }
    generatedRcaId = rcaData.data.rcaId;
  });

  // 7. Experiment Engine Simulation
  let experimentId = "";
  await test("Experiment Engine Remediation Simulation", async () => {
    const expRes = await fetch(`${BACKEND_URL}/api/experiments/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rcaId: generatedRcaId,
        requirementId: testReqId,
        service: "Checkout",
        remediationAction: "Increase DB Connection Pool from 20 to 40",
        parameterName: "DB Connection Pool",
        currentValue: 20,
        proposedValue: 40,
        currentLatency: 2.8,
        currentErrorRate: 2.0,
        currentCpu: 92,
        currentMemory: 60,
        sloThreshold: 2.0,
      }),
    });
    if (!expRes.ok) throw new Error(`Experiment failed: ${expRes.status}`);
    const expData = await expRes.json();
    if (!expData.success || expData.data.result !== "PASS") {
      throw new Error(`Expected PASS result from experiment, got ${expData.data?.result}`);
    }
    experimentId = expData.data.experimentId;
  });

  // 8. DevOps Adapter Proposal & Approval Workflow
  await test("DevOps Adapter Safe Approval & Execution Gate", async () => {
    // 8a. Propose action
    const propRes = await fetch(`${BACKEND_URL}/api/devops/propose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rcaId: generatedRcaId,
        experimentId: experimentId,
        requirementId: testReqId,
        service: "Checkout",
        actionType: "UPDATE_CONFIG",
        description: "Patch database connection pool size to 40",
        payload: { maxPoolSize: 40 },
      }),
    });
    if (!propRes.ok) throw new Error(`Action proposal failed: ${propRes.status}`);
    const propData = await propRes.json();
    const actionId = propData.data.actionId;

    // 8b. Approve action
    const appRes = await fetch(`${BACKEND_URL}/api/devops/approve/${actionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "DevOps Engineer" }),
    });
    if (!appRes.ok) throw new Error(`Action approval failed: ${appRes.status}`);

    // 8c. Execute action
    const execRes = await fetch(`${BACKEND_URL}/api/devops/execute/${actionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!execRes.ok) throw new Error(`Action execution failed: ${execRes.status}`);
    const execData = await execRes.json();
    if (execData.data.status !== "EXECUTED") {
      throw new Error(`Expected EXECUTED status, got ${execData.data.status}`);
    }
  });

  // 9. End-to-End Traceability Graph Validation
  await test("Full Traceability Graph Synthesis", async () => {
    const traceRes = await fetch(`${BACKEND_URL}/api/traceability/graph?requirementId=${testReqId}`);
    if (!traceRes.ok) throw new Error(`Trace graph failed: ${traceRes.status}`);
    const traceData = await traceRes.json();
    if (!traceData.success || traceData.data.length === 0) {
      throw new Error("No trace graph node generated for requirement");
    }
    const node = traceData.data[0];
    if (node.slos.length === 0 || node.incidents.length === 0 || node.rcas.length === 0) {
      throw new Error("Trace graph missing connected SLOs/incidents/RCAs");
    }
  });

  // 10. Prometheus Scrape Endpoint
  await test("Prometheus Metrics Exporter Format", async () => {
    const promRes = await fetch(`${BACKEND_URL}/metrics`);
    if (!promRes.ok) throw new Error(`Prometheus endpoint failed: ${promRes.status}`);
    const promText = await promRes.text();
    if (!promText.includes("http_request_duration_seconds")) {
      throw new Error("Prometheus output missing http_request_duration_seconds metric");
    }
  });

  console.log(`\n========================================`);
  console.log(`Integration Test Summary: ${passed}/${total} PASSED`);
  console.log(`========================================\n`);
}

runTests();

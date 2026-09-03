const tests = [
  { name: "Root Backend API", method: "GET", url: "http://localhost:5000/" },
  { name: "Backend Health", method: "GET", url: "http://localhost:5000/api/health" },
  { name: "ML Service Health", method: "GET", url: "http://localhost:5001/health" },
  { name: "Prometheus Health", method: "GET", url: "http://localhost:9090/-/healthy" },
  { name: "Requirements List", method: "GET", url: "http://localhost:5000/api/requirements" },
  { name: "SLOs List", method: "GET", url: "http://localhost:5000/api/slos" },
  { name: "Incidents List", method: "GET", url: "http://localhost:5000/api/incidents" },
  { name: "RCAs List", method: "GET", url: "http://localhost:5000/api/rca" },
  { name: "Experiments List", method: "GET", url: "http://localhost:5000/api/experiments" },
  { name: "DevOps Actions List", method: "GET", url: "http://localhost:5000/api/devops" },
  { name: "Telemetry Metrics", method: "GET", url: "http://localhost:5000/api/metrics" },
  { name: "Prometheus Exporter Format", method: "GET", url: "http://localhost:5000/api/metrics/prometheus" },
  { name: "Traceability Graph", method: "GET", url: "http://localhost:5000/api/traceability/graph" },
  {
    name: "ML Predict Route",
    method: "POST",
    url: "http://localhost:5000/api/ml/predict",
    body: { cpuUsage: 92, memoryUsage: 60, errorRate: 2.0, latency: 2.8, deploymentChanged: 0 }
  },
  {
    name: "Gemini RCA Route",
    method: "POST",
    url: "http://localhost:5000/api/gemini-rca/analyze",
    body: {
      incidentId: "INC-001",
      requirementId: "REQ-001",
      service: "Checkout",
      slo: "p95 < 2.0s",
      metric: "p95Latency",
      actualValue: 2.8,
      threshold: 2.0,
      cpuUsage: 88,
      memoryUsage: 64,
      errorRate: 2.0,
      deploymentChanged: false,
      logs: ["DB connection timeout"]
    }
  },
  {
    name: "Rule-Based RCA Route",
    method: "POST",
    url: "http://localhost:5000/api/rca/analyze",
    body: {
      service: "Checkout",
      metric: "p95Latency",
      actualValue: 2.8,
      threshold: 2.0,
      requirementId: "REQ-001",
      logs: ["Timeout in checkout pool"],
      deploymentChanged: false,
      cpuUsage: 88,
      memoryUsage: 64,
      errorRate: 2.0
    }
  },
  {
    name: "AI RCA Alias Route",
    method: "POST",
    url: "http://localhost:5000/api/ai-rca/analyze",
    body: {
      service: "Checkout",
      metric: "p95Latency",
      actualValue: 2.8,
      threshold: 2.0,
      requirementId: "REQ-001",
      logs: ["Timeout in checkout pool"],
      deploymentChanged: false,
      cpuUsage: 88,
      memoryUsage: 64,
      errorRate: 2.0
    }
  },
  {
    name: "Run Experiment Route",
    method: "POST",
    url: "http://localhost:5000/api/experiments/run",
    body: {
      requirementId: "REQ-001",
      service: "Checkout",
      remediationAction: "Increase DB Pool",
      parameterName: "DB Pool",
      currentValue: 20,
      proposedValue: 40,
      currentLatency: 2.8,
      currentErrorRate: 2.0,
      currentCpu: 90,
      currentMemory: 60,
      sloThreshold: 2.0
    }
  },
  {
    name: "Direct POST Experiments Route",
    method: "POST",
    url: "http://localhost:5000/api/experiments",
    body: {
      requirementId: "REQ-001",
      service: "Checkout",
      remediationAction: "Increase DB Pool",
      parameterName: "DB Pool",
      currentValue: 20,
      proposedValue: 40,
      currentLatency: 2.8,
      currentErrorRate: 2.0,
      currentCpu: 90,
      currentMemory: 60,
      sloThreshold: 2.0
    }
  },
  {
    name: "Propose DevOps Action Route",
    method: "POST",
    url: "http://localhost:5000/api/devops/propose",
    body: {
      requirementId: "REQ-001",
      service: "Checkout",
      actionType: "SCALE_SERVICE",
      payload: { replicas: 4 },
      description: "Scale checkout service to 4 replicas"
    }
  },
  {
    name: "Direct POST DevOps Route",
    method: "POST",
    url: "http://localhost:5000/api/devops",
    body: {
      requirementId: "REQ-001",
      service: "Checkout",
      actionType: "SCALE_SERVICE",
      payload: { replicas: 4 },
      description: "Scale checkout service to 4 replicas"
    }
  },
  {
    name: "SLO Evaluation Route",
    method: "POST",
    url: "http://localhost:5000/api/slo-evaluation",
    body: { sloId: "SLO-001", actualValue: 2.85 }
  },
  {
    name: "SLO Evaluation Alias Route",
    method: "POST",
    url: "http://localhost:5000/api/slo-evaluation/evaluate",
    body: { sloId: "SLO-001", actualValue: 2.85 }
  }
];

async function run() {
  console.log("ENDPOINT AUDIT REPORT");
  console.log("==========================================================================");
  let passed = 0;
  for (const t of tests) {
    try {
      const opts = {
        method: t.method,
        headers: { "Content-Type": "application/json" }
      };
      if (t.body) opts.body = JSON.stringify(t.body);
      const res = await fetch(t.url, opts);
      const statusText = `${res.status} ${res.statusText}`;
      if (res.ok) {
        console.log(`[PASS] ${t.method.padEnd(5)} ${t.url.padEnd(45)} -> ${statusText} (${t.name})`);
        passed++;
      } else {
        const txt = await res.text();
        console.log(`[FAIL] ${t.method.padEnd(5)} ${t.url.padEnd(45)} -> ${statusText} Error: ${txt}`);
      }
    } catch (e) {
      console.log(`[FAIL] ${t.method.padEnd(5)} ${t.url.padEnd(45)} -> Network Error: ${e.message}`);
    }
  }
  console.log("==========================================================================");
  console.log(`SUMMARY: ${passed} / ${tests.length} ENDPOINTS VERIFIED`);
}

run();

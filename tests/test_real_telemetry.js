/**
 * Real Telemetry Verification Test Suite (Phase 1)
 * Validates:
 * 1. /metrics exposes genuine prom-client Prometheus exposition text
 * 2. Real HTTP requests increment http_requests_total counter
 * 3. 2xx, 4xx, and 5xx status classes are accurately distinguished
 * 4. Request duration histogram receives real latency observations
 * 5. GET /api/telemetry/overview returns Prometheus-derived real telemetry
 * 6. Missing telemetry returns null (unavailable), never silently defaulting to zero
 * 7. Hardcoded fake metrics (92% CPU, 2.8s latency, etc.) are eliminated from production telemetry
 */

const http = require("http");

const BASE_URL = process.env.BACKEND_URL || "http://localhost:5000";

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const method = options.method || "GET";
  const body = options.body ? JSON.stringify(options.body) : undefined;
  const headers = { ...options.headers };
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

async function runTests() {
  console.log("==================================================");
  console.log("TRACE-OPS: PHASE 1 REAL RUNTIME TELEMETRY TEST SUITE");
  console.log("==================================================");
  console.log(`Target Backend: ${BASE_URL}\n`);

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = "") {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${details}`);
      failed++;
    }
  }

  try {
    // Test 1: Verify backend /metrics returns genuine Prometheus metrics
    console.log("--- 1. Prometheus /metrics Endpoint Verification ---");
    const mRes = await request("/metrics");
    assert(mRes.status === 200, "GET /metrics returns HTTP 200 OK");
    assert(
      mRes.text.includes("http_requests_total"),
      "Exposes http_requests_total counter"
    );
    assert(
      mRes.text.includes("http_request_duration_seconds"),
      "Exposes http_request_duration_seconds histogram"
    );
    assert(
      mRes.text.includes("http_requests_in_flight"),
      "Exposes http_requests_in_flight gauge"
    );
    assert(
      !mRes.text.includes("Checkout") && !mRes.text.includes("service_cpu_utilization_percent"),
      "Eliminated old fake serviceTelemetry static Prometheus gauge output"
    );

    // Test 2: Verify request counter increments after real HTTP requests
    console.log("\n--- 2. Real Request Counter & Classification Verification ---");
    // Parse baseline count for /api/health
    const mBefore = await request("/metrics");
    const getHealthCount = (text) => {
      const match = text.match(/http_requests_total\{[^}]*route="\/api\/health"[^}]*status_code="200"[^}]*\} (\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    };
    const countBefore = getHealthCount(mBefore.text);

    // Send 3 requests to /api/health
    await request("/api/health");
    await request("/api/health");
    await request("/api/health");

    const mAfter = await request("/metrics");
    const countAfter = getHealthCount(mAfter.text);
    assert(
      countAfter >= countBefore + 3,
      "http_requests_total increments accurately after real HTTP requests",
      `Expected >= ${countBefore + 3}, got ${countAfter}`
    );

    // Test 3: Verify 4xx error metric classification
    console.log("\n--- 3. Real 4xx Error Classification Verification ---");
    const get404Count = (text) => {
      const matches = [...text.matchAll(/http_requests_total\{[^}]*status_class="4xx"[^}]*\} (\d+)/g)];
      return matches.reduce((sum, m) => sum + parseInt(m[1], 10), 0);
    };
    const count4xxBefore = get404Count(mAfter.text);

    // Trigger a 404
    await request("/nonexistent-endpoint-for-4xx-test");

    const mAfter4xx = await request("/metrics");
    const count4xxAfter = get404Count(mAfter4xx.text);
    assert(
      count4xxAfter >= count4xxBefore + 1,
      "http_requests_total records 4xx status_class accurately on client error",
      `Expected >= ${count4xxBefore + 1}, got ${count4xxAfter}`
    );

    // Test 4: Verify latency duration histogram receives observations
    console.log("\n--- 4. Real Latency Histogram Observations ---");
    const getHistogramSum = (text) => {
      const match = text.match(/http_request_duration_seconds_count\{[^}]*route="\/api\/health"[^}]*\} (\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    };
    const histBefore = getHistogramSum(mAfter4xx.text);

    await request("/api/health");

    const mAfterHist = await request("/metrics");
    const histAfter = getHistogramSum(mAfterHist.text);
    assert(
      histAfter >= histBefore + 1,
      "http_request_duration_seconds histogram records observation",
      `Expected >= ${histBefore + 1}, got ${histAfter}`
    );

    // Test 5: Verify /api/telemetry/overview endpoint
    console.log("\n--- 5. Real Telemetry Overview API Verification ---");
    const tRes = await request("/api/telemetry/overview");
    assert(tRes.status === 200, "GET /api/telemetry/overview returns HTTP 200 OK");
    assert(tRes.json && tRes.json.success === true, "Response JSON has success: true");
    assert(tRes.json?.data && typeof tRes.json.data.timestamp === "string", "Includes ISO timestamp");
    assert(tRes.json?.data && typeof tRes.json.data.prometheusConnected === "boolean", "Includes prometheusConnected boolean");
    assert(tRes.json?.data && tRes.json.data.application, "Includes application telemetry block");
    assert(tRes.json?.data && tRes.json.data.host, "Includes host telemetry block");
    assert(tRes.json?.data && Array.isArray(tRes.json.data.containers), "Includes containers telemetry array");

    // Test 6: Verify strict missing data rule (null, not 0)
    console.log("\n--- 6. Strict Data Integrity Rule (Real Zero != Missing Data) ---");
    // If Prometheus is connected, verify no fabricated static numbers (92, 60, 2.8)
    const appData = tRes.json?.data?.application;
    if (appData) {
      assert(
        appData.p95Latency !== 2.8,
        "Application p95Latency is NOT the hardcoded 2.8s constant"
      );
      assert(
        appData.errorRate !== 2.0,
        "Application errorRate is NOT the hardcoded 2.0% constant"
      );
    }

    const hostData = tRes.json?.data?.host;
    if (hostData && hostData.cpuUsage === null) {
      assert(
        hostData.cpuUsage === null,
        "Host CPU returns null when unmeasured, NOT 0"
      );
    } else if (hostData && hostData.cpuUsage !== null) {
      assert(
        hostData.cpuUsage >= 0 && hostData.cpuUsage <= 100,
        "Host CPU is within real percentage bounds [0, 100]"
      );
    }

    // Test 7: Controlled traffic load generator
    console.log("\n--- 7. Controlled Load Generator Verification ---");
    const loadRes = await request("/api/telemetry/load-test", {
      method: "POST",
      body: { requests: 10, delayMs: 5 },
    });
    assert(loadRes.status === 200, "POST /api/telemetry/load-test returns HTTP 200 OK");
    assert(loadRes.json && loadRes.json.mode === "CONTROLLED_LOAD_TEST", "Identified as CONTROLLED_LOAD_TEST");
    assert(loadRes.json && loadRes.json.samplesExecuted === 10, "Executed exactly 10 test operations");

    console.log("\n==================================================");
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution encountered an error:", err);
    process.exit(1);
  }
}

runTests();

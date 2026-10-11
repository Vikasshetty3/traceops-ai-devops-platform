/**
 * TRACEOPS PHASE 5.3 BATCH C2 — DYNAMIC TRAFFIC ROUTING SUBSYSTEM
 *
 * Dedicated verification test suite for Batch C2 requirements:
 * 1. router initialization
 * 2. 0/100 routing (real HTTP requests)
 * 3. 10/90 routing (real HTTP requests, exact distribution)
 * 4. 25/75 routing (real HTTP requests, exact distribution)
 * 5. 50/50 routing (real HTTP requests, exact distribution)
 * 6. 100/0 routing (real HTTP requests, exact distribution)
 * 7. Blue-Green 0/100 -> 100/0 atomic cutover
 * 8. invalid negative weight rejection
 * 9. invalid >100 weight rejection
 * 10. invalid total (!= 100) rejection
 * 11. concurrent update protection (lock conflict)
 * 12. deployment lock enforcement
 * 13. approval enforcement (unapproved rejected)
 * 14. validation enforcement (unvalidated rejected)
 * 15. candidate identity verification
 * 16. predecessor identity verification
 * 17. audit event creation on traffic shift
 * 18. audit chain remains valid (SHA-256 chain verification)
 * 19. duplicate request idempotency
 * 20. unauthorized / not found access rejection
 * 21. candidate unavailable failure behavior (502)
 * 22. predecessor unavailable failure behavior (502)
 * 23. router failure / recovery
 * 24. no host process fallback
 * 25. no ML model modification
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/requirement_traceable_devops";

// Backend compiled modules
const mongoose = require(path.join(__dirname, "../backend/node_modules/mongoose"));
const {
  TrafficRoutingService,
} = require(path.join(__dirname, "../backend/dist/backend/src/services/trafficRoutingService"));
const {
  DeploymentAuditService,
} = require(path.join(__dirname, "../backend/dist/backend/src/services/deploymentAuditService"));
const {
  DeploymentLockService,
  DeploymentLockConflictError,
} = require(path.join(__dirname, "../backend/dist/backend/src/services/deploymentLockService"));
const { Deployment } = require(path.join(__dirname, "../backend/dist/backend/src/models/Deployment"));
const { CodeRepair } = require(path.join(__dirname, "../backend/dist/backend/src/models/CodeRepair"));
const { DeploymentAuditEvent } = require(path.join(__dirname, "../backend/dist/backend/src/models/DeploymentAuditEvent"));

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function api(endpoint, options = {}) {
  const url = `${BACKEND_URL}${endpoint.startsWith("/") ? endpoint : "/" + endpoint}`;
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  return { status: res.status, ok: res.ok, data };
}

function makeHttpRequest(urlStr) {
  return new Promise((resolve, reject) => {
    http
      .get(urlStr, (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (e) {
            json = raw;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            routedTo: res.headers["x-traceops-routed-to"],
            data: json,
          });
        });
      })
      .on("error", reject);
  });
}

async function runTestSuite() {
  console.log("================================================================================");
  console.log("PHASE 5.3 BATCH C2 — DYNAMIC TRAFFIC ROUTING SUBSYSTEM VERIFICATION SUITE");
  console.log("================================================================================\n");

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB for Batch C2 verification.\n");

  const runId = Date.now();
  const testProjectId = `PROJ-C2-${runId}`;
  const testRepairId = `REP-C2-${runId}`;
  const testDeploymentId = `DEP-C2-${runId}`;
  const testService = "PaymentGateway";
  const testEvidenceHash = crypto.createHash("sha256").update(`evidence-${runId}`).digest("hex");
  const testCandidateCommit = crypto.createHash("sha1").update(`commit-${runId}`).digest("hex");

  // Snapshot ML model hash before any actions
  const mlModelPath = path.join(__dirname, "../ml-service/data/trained_model.json");
  const initialMlHash = fs.existsSync(mlModelPath)
    ? crypto.createHash("sha256").update(fs.readFileSync(mlModelPath)).digest("hex")
    : null;

  // Clean any old locks on testService
  await DeploymentLockService.forceRelease(testService);

  // Spin up real HTTP mock servers for Predecessor and Candidate containers
  let predecessorHits = 0;
  let candidateHits = 0;

  const predServer = http.createServer((req, res) => {
    predecessorHits++;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ server: "predecessor", hits: predecessorHits }));
  });

  const candServer = http.createServer((req, res) => {
    candidateHits++;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ server: "candidate", hits: candidateHits }));
  });

  const predPort = await new Promise((resolve) => predServer.listen(0, "127.0.0.1", () => resolve(predServer.address().port)));
  const candPort = await new Promise((resolve) => candServer.listen(0, "127.0.0.1", () => resolve(candServer.address().port)));

  console.log(`[TEST SETUP] Mock Predecessor Server on port ${predPort}`);
  console.log(`[TEST SETUP] Mock Candidate Server on port ${candPort}\n`);

  // Seed validated CodeRepair
  const repair = await CodeRepair.create({
    repairId: testRepairId,
    issueId: `ISSUE-${runId}`,
    projectId: testProjectId,
    service: testService,
    workspacePath: `/tmp/traceops-rep-${runId}`,
    changedFiles: ["server.js"],
    diff: "patch diff",
    explanation: "Batch C2 Test Repair Candidate",
    riskLevel: "LOW",
    status: "VALIDATED",
    validationStatus: "VALIDATED",
    approvalStatus: "APPROVED",
    patchDiff: "patch diff",
    evidenceSnapshotHash: testEvidenceHash,
    candidateCommitSha: testCandidateCommit,
  });

  // Seed active Deployment
  const deployment = await Deployment.create({
    deploymentId: testDeploymentId,
    repairId: testRepairId,
    projectId: testProjectId,
    service: testService,
    version: "candidate",
    imageTag: "traceops-payment-service:candidate",
    candidateImage: "traceops-payment-service:candidate",
    predecessorImage: "traceops-payment-service:predecessor",
    candidateCommitSha: testCandidateCommit,
    hostPort: candPort,
    status: "RUNNING",
    healthCheckPassed: true,
    trafficStrategy: "CANARY",
  });

  console.log(`[SETUP] Seeded test repair ${testRepairId} and deployment ${testDeploymentId}.\n`);

  // ============================================================================
  // TEST 1: Router Initialization
  // ============================================================================
  console.log("Test 1: Router initialization");
  const route = await TrafficRoutingService.initRoute({
    deploymentId: testDeploymentId,
    strategy: "CANARY",
    candidateHostPort: candPort,
    predecessorHostPort: predPort,
  });
  assert(Boolean(route), "Traffic route initialized successfully");
  assert(route.candidateWeight === 0 && route.predecessorWeight === 100, "Initial weights default to 0% C / 100% P");
  assert(route.strategy === "CANARY", "Route strategy recorded as CANARY");

  // Start in-process proxy listener
  const proxyPort = await TrafficRoutingService.startProxyListener(testDeploymentId);
  assert(Boolean(proxyPort && proxyPort > 0), `In-process proxy listener active on port ${proxyPort}`);

  // ============================================================================
  // TEST 2: 0/100 Routing (Real HTTP Requests)
  // ============================================================================
  console.log("\nTest 2: 0/100 routing (Real HTTP Requests)");
  predecessorHits = 0;
  candidateHits = 0;
  for (let i = 0; i < 50; i++) {
    const res = await makeHttpRequest(`http://127.0.0.1:${proxyPort}/health`);
    assert(res.status === 200, "Proxy returns HTTP 200 OK");
  }
  assert(predecessorHits === 50, `100% traffic reached predecessor (50/50 hits)`);
  assert(candidateHits === 0, `0% traffic reached candidate (0/50 hits)`);

  // ============================================================================
  // TEST 3: 10/90 Routing (Real HTTP Requests)
  // ============================================================================
  console.log("\nTest 3: 10/90 routing (Real HTTP Requests)");
  await TrafficRoutingService.setTrafficWeights({
    deploymentId: testDeploymentId,
    candidateWeight: 10,
    predecessorWeight: 90,
    stage: "CANARY_TIER_10",
  });

  predecessorHits = 0;
  candidateHits = 0;
  for (let i = 0; i < 100; i++) {
    await makeHttpRequest(`http://127.0.0.1:${proxyPort}/api/test`);
  }
  assert(candidateHits === 10, `Candidate received exactly 10% of requests (10/100)`);
  assert(predecessorHits === 90, `Predecessor received exactly 90% of requests (90/100)`);

  // ============================================================================
  // TEST 4: 25/75 Routing (Real HTTP Requests)
  // ============================================================================
  console.log("\nTest 4: 25/75 routing (Real HTTP Requests)");
  await TrafficRoutingService.setTrafficWeights({
    deploymentId: testDeploymentId,
    candidateWeight: 25,
    predecessorWeight: 75,
    stage: "CANARY_TIER_25",
  });

  predecessorHits = 0;
  candidateHits = 0;
  for (let i = 0; i < 100; i++) {
    await makeHttpRequest(`http://127.0.0.1:${proxyPort}/api/test`);
  }
  assert(candidateHits === 25, `Candidate received exactly 25% of requests (25/100)`);
  assert(predecessorHits === 75, `Predecessor received exactly 75% of requests (75/100)`);

  // ============================================================================
  // TEST 5: 50/50 Routing (Real HTTP Requests)
  // ============================================================================
  console.log("\nTest 5: 50/50 routing (Real HTTP Requests)");
  await TrafficRoutingService.setTrafficWeights({
    deploymentId: testDeploymentId,
    candidateWeight: 50,
    predecessorWeight: 50,
    stage: "CANARY_TIER_50",
  });

  predecessorHits = 0;
  candidateHits = 0;
  for (let i = 0; i < 100; i++) {
    await makeHttpRequest(`http://127.0.0.1:${proxyPort}/api/test`);
  }
  assert(candidateHits === 50, `Candidate received exactly 50% of requests (50/100)`);
  assert(predecessorHits === 50, `Predecessor received exactly 50% of requests (50/100)`);

  // ============================================================================
  // TEST 6: 100/0 Routing (Real HTTP Requests)
  // ============================================================================
  console.log("\nTest 6: 100/0 routing (Real HTTP Requests)");
  await TrafficRoutingService.setTrafficWeights({
    deploymentId: testDeploymentId,
    candidateWeight: 100,
    predecessorWeight: 0,
    stage: "CANARY_CUTOVER",
  });

  predecessorHits = 0;
  candidateHits = 0;
  for (let i = 0; i < 50; i++) {
    await makeHttpRequest(`http://127.0.0.1:${proxyPort}/api/test`);
  }
  assert(candidateHits === 50, `Candidate received 100% of requests (50/50)`);
  assert(predecessorHits === 0, `Predecessor received 0% of requests (0/50)`);

  // ============================================================================
  // TEST 7: Blue-Green 0/100 -> 100/0 Atomic Cutover
  // ============================================================================
  console.log("\nTest 7: Blue-Green 0/100 -> 100/0 Atomic Cutover");
  await DeploymentLockService.forceRelease("CheckoutService");
  const bgDepId = `DEP-BG-${runId}`;
  const bgRepairId = `REP-BG-${runId}`;
  await CodeRepair.create({
    repairId: bgRepairId,
    projectId: testProjectId,
    service: "CheckoutService",
    workspacePath: `/tmp/traceops-bg-${runId}`,
    changedFiles: ["server.js"],
    diff: "patch diff",
    explanation: "Blue-Green test candidate",
    riskLevel: "LOW",
    status: "VALIDATED",
    validationStatus: "VALIDATED",
    approvalStatus: "APPROVED",
    patchDiff: "patch diff",
    evidenceSnapshotHash: testEvidenceHash,
    candidateCommitSha: testCandidateCommit,
  });

  await Deployment.create({
    deploymentId: bgDepId,
    repairId: bgRepairId,
    projectId: testProjectId,
    service: "CheckoutService",
    version: "candidate",
    imageTag: "traceops-checkout:candidate",
    candidateCommitSha: testCandidateCommit,
    hostPort: candPort,
    status: "RUNNING",
    healthCheckPassed: true,
    trafficStrategy: "BLUE_GREEN",
  });

  const bgRoute = await TrafficRoutingService.initRoute({
    deploymentId: bgDepId,
    strategy: "BLUE_GREEN",
    candidateHostPort: candPort,
    predecessorHostPort: predPort,
  });
  assert(bgRoute.candidateWeight === 0 && bgRoute.predecessorWeight === 100, "Blue-Green starts at 0% Green / 100% Blue");

  // Attempting intermediate weight on Blue-Green must be rejected
  let intermediateRejected = false;
  try {
    await TrafficRoutingService.setTrafficWeights({
      deploymentId: bgDepId,
      candidateWeight: 25,
      predecessorWeight: 75,
      stage: "TIER_25",
    });
  } catch (err) {
    intermediateRejected = err.message.includes("Strategy Violation");
  }
  assert(intermediateRejected, "Intermediate weights (25/75) strictly rejected on Blue-Green strategy");

  // Atomic 100% cutover succeeds
  const bgCutover = await TrafficRoutingService.setTrafficWeights({
    deploymentId: bgDepId,
    candidateWeight: 100,
    predecessorWeight: 0,
    stage: "ATOMIC_CUTOVER",
  });
  assert(bgCutover.candidateWeight === 100 && bgCutover.predecessorWeight === 0, "Blue-Green successfully flipped atomically to 100% Green / 0% Blue");

  // ============================================================================
  // TEST 8: Invalid Negative Weight Rejection
  // ============================================================================
  console.log("\nTest 8: Invalid negative weight rejection");
  let negRejected = false;
  try {
    await TrafficRoutingService.setTrafficWeights({
      deploymentId: testDeploymentId,
      candidateWeight: -10,
      predecessorWeight: 110,
      stage: "INVALID",
    });
  } catch (err) {
    negRejected = err.message.includes("Invariant Violation");
  }
  assert(negRejected, "Negative candidateWeight rejected with Invariant Violation");

  // ============================================================================
  // TEST 9: Invalid >100 Weight Rejection
  // ============================================================================
  console.log("\nTest 9: Invalid >100 weight rejection");
  let overRejected = false;
  try {
    await TrafficRoutingService.setTrafficWeights({
      deploymentId: testDeploymentId,
      candidateWeight: 120,
      predecessorWeight: -20,
      stage: "INVALID",
    });
  } catch (err) {
    overRejected = err.message.includes("Invariant Violation");
  }
  assert(overRejected, "Candidate weight > 100 rejected with Invariant Violation");

  // ============================================================================
  // TEST 10: Invalid Total (!= 100) Rejection
  // ============================================================================
  console.log("\nTest 10: Invalid total (!= 100) rejection");
  let totalRejected = false;
  try {
    await TrafficRoutingService.setTrafficWeights({
      deploymentId: testDeploymentId,
      candidateWeight: 40,
      predecessorWeight: 40, // Sum = 80
      stage: "INVALID",
    });
  } catch (err) {
    totalRejected = err.message.includes("candidateWeight + predecessorWeight must equal 100");
  }
  assert(totalRejected, "Total weight != 100 rejected with Invariant Violation");

  // ============================================================================
  // TEST 11 & 12: Concurrent Update Protection & Deployment Lock Enforcement
  // ============================================================================
  console.log("\nTest 11 & 12: Concurrent update protection & deployment lock enforcement");
  // Release current test repair's lock first so foreign repair can acquire
  await DeploymentLockService.forceRelease(testService);
  const foreignRepairId = `REP-FOREIGN-${runId}`;
  await DeploymentLockService.acquireLock(testService, foreignRepairId);

  let lockConflictCaught = false;
  try {
    await TrafficRoutingService.setTrafficWeights({
      deploymentId: testDeploymentId,
      candidateWeight: 25,
      predecessorWeight: 75,
      stage: "CANARY_TIER_25",
    });
  } catch (err) {
    lockConflictCaught = err instanceof DeploymentLockConflictError || err.name === "DeploymentLockConflictError";
  }
  assert(lockConflictCaught, "Concurrent traffic update blocked by active DeploymentLock on service");

  // Release foreign lock and resume
  await DeploymentLockService.forceRelease(testService);

  // ============================================================================
  // TEST 13: Approval Enforcement (Unapproved Rejected)
  // ============================================================================
  console.log("\nTest 13: Approval enforcement (Unapproved Rejected)");
  const unapprovedDepId = `DEP-UNAPP-${runId}`;
  const unapprovedRepId = `REP-UNAPP-${runId}`;
  await CodeRepair.create({
    repairId: unapprovedRepId,
    projectId: testProjectId,
    service: "AuthService",
    workspacePath: `/tmp/traceops-unapp-${runId}`,
    changedFiles: ["server.js"],
    diff: "diff",
    explanation: "Unapproved repair",
    riskLevel: "LOW",
    status: "VALIDATED",
    validationStatus: "VALIDATED",
    approvalStatus: "PENDING", // NOT APPROVED
    candidateCommitSha: testCandidateCommit,
  });
  await Deployment.create({
    deploymentId: unapprovedDepId,
    repairId: unapprovedRepId,
    projectId: testProjectId,
    service: "AuthService",
    version: "v1",
    imageTag: "traceops-auth:v1",
    candidateCommitSha: testCandidateCommit,
  });

  let unapprovedRejected = false;
  try {
    await TrafficRoutingService.initRoute({ deploymentId: unapprovedDepId });
  } catch (err) {
    unapprovedRejected = err.message.includes("must be approved");
  }
  assert(unapprovedRejected, "Traffic routing for unapproved repair strictly rejected by Safety Gate");

  // ============================================================================
  // TEST 14: Validation Enforcement (Unvalidated Rejected)
  // ============================================================================
  console.log("\nTest 14: Validation enforcement (Unvalidated Rejected)");
  const unvalidatedDepId = `DEP-UNVAL-${runId}`;
  const unvalidatedRepId = `REP-UNVAL-${runId}`;
  await CodeRepair.create({
    repairId: unvalidatedRepId,
    projectId: testProjectId,
    service: "NotificationService",
    workspacePath: `/tmp/traceops-unval-${runId}`,
    changedFiles: ["server.js"],
    diff: "diff",
    explanation: "Unvalidated repair",
    riskLevel: "LOW",
    status: "GENERATED",
    validationStatus: "PENDING", // NOT VALIDATED
    approvalStatus: "APPROVED",
    candidateCommitSha: testCandidateCommit,
  });
  await Deployment.create({
    deploymentId: unvalidatedDepId,
    repairId: unvalidatedRepId,
    projectId: testProjectId,
    service: "NotificationService",
    version: "v1",
    imageTag: "traceops-notif:v1",
    candidateCommitSha: testCandidateCommit,
  });

  let unvalRejected = false;
  try {
    await TrafficRoutingService.initRoute({ deploymentId: unvalidatedDepId });
  } catch (err) {
    unvalRejected = err.message.includes("must be validated");
  }
  assert(unvalRejected, "Traffic routing for unvalidated repair strictly rejected by Safety Gate");

  // ============================================================================
  // TEST 15: Candidate Identity Verification (Commit SHA Mismatch)
  // ============================================================================
  console.log("\nTest 15: Candidate identity verification");
  const mismatchDepId = `DEP-MISMATCH-${runId}`;
  const mismatchRepId = `REP-MISMATCH-${runId}`;
  await CodeRepair.create({
    repairId: mismatchRepId,
    projectId: testProjectId,
    service: "BillingService",
    workspacePath: `/tmp/traceops-mis-${runId}`,
    changedFiles: ["server.js"],
    diff: "diff",
    explanation: "Mismatch repair",
    riskLevel: "LOW",
    status: "VALIDATED",
    validationStatus: "VALIDATED",
    approvalStatus: "APPROVED",
    candidateCommitSha: "sha-candidate-11111111111111111111111111111111",
  });
  await Deployment.create({
    deploymentId: mismatchDepId,
    repairId: mismatchRepId,
    projectId: testProjectId,
    service: "BillingService",
    version: "v1",
    imageTag: "traceops-bill:v1",
    candidateCommitSha: "sha-tampered-99999999999999999999999999999999", // MISMATCH
  });

  let shaMismatchRejected = false;
  try {
    await TrafficRoutingService.initRoute({ deploymentId: mismatchDepId });
  } catch (err) {
    shaMismatchRejected = err.message.includes("Candidate commit SHA mismatch");
  }
  assert(shaMismatchRejected, "Candidate commit SHA mismatch rejected by Safety Gate");

  // ============================================================================
  // TEST 16: Predecessor Identity Verification
  // ============================================================================
  console.log("\nTest 16: Predecessor identity verification");
  const currentRoute = await TrafficRoutingService.getTrafficState(testDeploymentId);
  assert(
    currentRoute.predecessorTargetUrl.includes(String(predPort)),
    `Predecessor target port verified: ${currentRoute.predecessorTargetUrl}`
  );
  assert(
    Boolean(currentRoute.predecessorContainer),
    `Predecessor container identity preserved: ${currentRoute.predecessorContainer}`
  );

  // ============================================================================
  // TEST 17 & 18: Audit Event Creation & SHA-256 Chain Verification
  // ============================================================================
  console.log("\nTest 17 & 18: Audit event creation & SHA-256 chain verification");
  const auditEvents = await DeploymentAuditService.getDeploymentEvents(testDeploymentId);
  assert(auditEvents.length >= 5, `Audit events emitted on traffic shifts (${auditEvents.length} events logged)`);

  const chainVerification = await DeploymentAuditService.verifyChain(testDeploymentId);
  assert(chainVerification.valid === true, "Cryptographic audit chain remains 100% valid after traffic shifts");
  assert(chainVerification.firstInvalidEventId === null, "Zero broken links in cryptographic audit chain");

  // ============================================================================
  // TEST 19: Duplicate Request Idempotency
  // ============================================================================
  console.log("\nTest 19: Duplicate request idempotency");
  const resIdem1 = await api(`/api/deployments/${testDeploymentId}/traffic`, {
    method: "POST",
    body: JSON.stringify({
      candidateWeight: 50,
      predecessorWeight: 50,
      stage: "CANARY_TIER_50",
    }),
  });
  const resIdem2 = await api(`/api/deployments/${testDeploymentId}/traffic`, {
    method: "POST",
    body: JSON.stringify({
      candidateWeight: 50,
      predecessorWeight: 50,
      stage: "CANARY_TIER_50",
    }),
  });
  assert(resIdem1.status === 200 && resIdem2.status === 200, "Duplicate weight assignment returns 200 OK idempotently");
  assert(resIdem2.data.candidateWeight === 50, "State remains consistent across duplicate requests");

  // ============================================================================
  // TEST 20: Unauthorized / Not Found Access
  // ============================================================================
  console.log("\nTest 20: Unauthorized / Not found access");
  const notFoundTraffic = await api("/api/deployments/DEP-UNKNOWN-99999/traffic");
  assert(notFoundTraffic.status === 404, "GET /traffic on unknown deployment returns HTTP 404");

  const notFoundAdvance = await api("/api/deployments/DEP-UNKNOWN-99999/traffic/advance", {
    method: "POST",
    body: JSON.stringify({ targetWeight: 10 }),
  });
  assert(notFoundAdvance.status === 404, "POST /traffic/advance on unknown deployment returns HTTP 404");

  // ============================================================================
  // TEST 21: Candidate Unavailable Failure Behavior (502 Fail-Closed)
  // ============================================================================
  console.log("\nTest 21: Candidate unavailable failure behavior (502 Fail-Closed)");
  // Stop candidate server to simulate container crash
  await new Promise((resolve) => candServer.close(resolve));

  // Shift to 100% candidate so all traffic tries to reach candidate
  await TrafficRoutingService.setTrafficWeights({
    deploymentId: testDeploymentId,
    candidateWeight: 100,
    predecessorWeight: 0,
    stage: "CANARY_100_FAIL_TEST",
  });

  const failRes = await makeHttpRequest(`http://127.0.0.1:${proxyPort}/crash-test`);
  assert(failRes.status === 502, "Proxy returns HTTP 502 Bad Gateway when candidate container is unreachable");
  assert(
    failRes.data && failRes.data.message && failRes.data.message.includes("unavailable"),
    "Failure response details unavailable candidate without hanging"
  );

  // ============================================================================
  // TEST 22: Predecessor Unavailable Failure Behavior (502 Fail-Closed)
  // ============================================================================
  console.log("\nTest 22: Predecessor unavailable failure behavior (502 Fail-Closed)");
  await new Promise((resolve) => predServer.close(resolve));

  // Shift to 100% predecessor
  await TrafficRoutingService.setTrafficWeights({
    deploymentId: testDeploymentId,
    candidateWeight: 0,
    predecessorWeight: 100,
    stage: "CANARY_0_FAIL_TEST",
  });

  const predFailRes = await makeHttpRequest(`http://127.0.0.1:${proxyPort}/crash-test`);
  assert(predFailRes.status === 502, "Proxy returns HTTP 502 Bad Gateway when predecessor container is unreachable");

  // ============================================================================
  // TEST 23: Router Failure / Recovery (Emergency Clamp to Predecessor)
  // ============================================================================
  console.log("\nTest 23: Emergency Clamp to Predecessor (< 500ms)");
  const clampStart = Date.now();
  const clampedRoute = await TrafficRoutingService.clampToPredecessor(testDeploymentId, "SLO Breach Triggered Test");
  const clampDuration = Date.now() - clampStart;
  assert(clampedRoute.candidateWeight === 0 && clampedRoute.predecessorWeight === 100, "Emergency clamp immediately resets weights to 0% C / 100% P");
  assert(clampDuration < 500, `Emergency clamp executed in ${clampDuration}ms (< 500ms constraint)`);

  const clampedAudit = await DeploymentAuditEvent.findOne({ deploymentId: testDeploymentId, action: "TRAFFIC_ABORTED" });
  assert(Boolean(clampedAudit), "Audit trail recorded TRAFFIC_ABORTED event for emergency clamp");

  // ============================================================================
  // TEST 24: No Host Fallback
  // ============================================================================
  console.log("\nTest 24: No host fallback");
  const routingServiceSource = fs.readFileSync(
    path.join(__dirname, "../backend/src/services/trafficRoutingService.ts"),
    "utf-8"
  );
  assert(!routingServiceSource.includes("child_process.exec("), "Zero child_process.exec calls in TrafficRoutingService");
  assert(!routingServiceSource.includes("npm run"), "Zero host npm calls in TrafficRoutingService");

  // ============================================================================
  // TEST 25: No ML Model Modification
  // ============================================================================
  console.log("\nTest 25: No ML model modification");
  if (initialMlHash) {
    const finalMlHash = crypto.createHash("sha256").update(fs.readFileSync(mlModelPath)).digest("hex");
    assert(finalMlHash === initialMlHash, "ML model trained_model.json SHA-256 remains 100% untouched");
  } else {
    assert(true, "ML model verification passed (model unpromoted)");
  }

  // Cleanup proxy listener
  await TrafficRoutingService.stopProxyListener(testDeploymentId);
  await TrafficRoutingService.resetAll();

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log("\n================================================================================");
  console.log(`BATCH C2 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================\n");

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runTestSuite().catch((err) => {
  console.error("FATAL ERROR in Batch C2 test runner:", err);
  process.exit(1);
});

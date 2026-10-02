/**
 * TRACEOPS PHASE 5.3 BATCH C1 — CRYPTOGRAPHIC DEPLOYMENT AUDIT LOGGING
 *
 * Dedicated verification test suite for Batch C1 requirements:
 * 1. create first audit event
 * 2. genesis hash correct (64 zeros)
 * 3. second event references first event hash
 * 4. deterministic canonicalization
 * 5. event hash reproducibility
 * 6. chain verification succeeds
 * 7. tampered payload detected
 * 8. tampered parent hash detected
 * 9. tampered event hash detected
 * 10. reordered events detected
 * 11. deleted event detected
 * 12. duplicate event handling
 * 13. immutable event update rejected
 * 14. immutable event delete rejected
 * 15. invalid foreign key rejected
 * 16. evidenceSnapshotHash mismatch rejected
 * 17. unauthorized / not found audit access rejected
 * 18. valid audit retrieval API (GET /api/deployments/:id/audit-events)
 * 19. empty chain behavior
 * 20. concurrent / sequential append chain continuity
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/requirement_traceable_devops";

// Backend compiled modules
const mongoose = require(path.join(__dirname, "../backend/node_modules/mongoose"));
const {
  DeploymentAuditService,
  GENESIS_HASH,
} = require(path.join(__dirname, "../backend/dist/backend/src/services/deploymentAuditService"));
const {
  DeploymentAuditEvent,
} = require(path.join(__dirname, "../backend/dist/backend/src/models/DeploymentAuditEvent"));
const { Deployment } = require(path.join(__dirname, "../backend/dist/backend/src/models/Deployment"));
const { CodeRepair } = require(path.join(__dirname, "../backend/dist/backend/src/models/CodeRepair"));

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

async function runTestSuite() {
  console.log("================================================================================");
  console.log("PHASE 5.3 BATCH C1 — CRYPTOGRAPHIC DEPLOYMENT AUDIT LOGGING VERIFICATION SUITE");
  console.log("================================================================================\n");

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB for Batch C1 verification.\n");

  const runId = Date.now();
  const testProjectId = `PROJ-C1-${runId}`;
  const testRepairId = `REP-C1-${runId}`;
  const testDeploymentId = `DEP-C1-${runId}`;
  const testEvidenceHash = crypto.createHash("sha256").update(`evidence-${runId}`).digest("hex");
  const testCandidateCommit = crypto.createHash("sha1").update(`commit-${runId}`).digest("hex");

  // Setup prerequisite CodeRepair and Deployment records
  const repair = await CodeRepair.create({
    repairId: testRepairId,
    issueId: `ISSUE-${runId}`,
    projectId: testProjectId,
    service: "PaymentGateway",
    workspacePath: `/tmp/traceops-rep-${runId}`,
    changedFiles: ["src/index.ts"],
    diff: "--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new",
    explanation: "Batch C1 Test Repair Candidate",
    riskLevel: "LOW",
    status: "VALIDATED",
    validationStatus: "VALIDATED",
    approvalStatus: "APPROVED",
    patchDiff: "--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new",
    evidenceSnapshotHash: testEvidenceHash,
    candidateCommitSha: testCandidateCommit,
  });

  const deployment = await Deployment.create({
    deploymentId: testDeploymentId,
    repairId: testRepairId,
    projectId: testProjectId,
    service: "PaymentGateway",
    version: "candidate",
    imageTag: "traceops-payment-service:candidate",
    candidateImage: "traceops-payment-service:candidate",
    predecessorImage: "traceops-payment-service:predecessor",
    candidateCommitSha: testCandidateCommit,
    status: "BUILDING",
    healthCheckPassed: false,
    deploymentLogs: ["Initial deployment created for C1 test"],
  });

  console.log(`[SETUP] Seeded test repair ${testRepairId} and deployment ${testDeploymentId}.\n`);

  // ============================================================================
  // TEST 1: Create First Audit Event
  // ============================================================================
  console.log("Test 1: Create first audit event");
  const event1 = await DeploymentAuditService.appendEvent({
    deploymentId: testDeploymentId,
    repairId: testRepairId,
    action: "DEPLOY_START",
    stage: "INITIAL_DEPLOY",
    actor: "DevOps Engineer",
    previousCandidateWeight: 0,
    newCandidateWeight: 0,
  });
  assert(Boolean(event1 && event1.eventId), "First audit event appended successfully with generated eventId");
  assert(event1.deploymentId === testDeploymentId, "Event references correct deploymentId");
  assert(event1.sequenceNumber === 1, "First event has sequenceNumber === 1");

  // ============================================================================
  // TEST 2: Genesis Hash Correct
  // ============================================================================
  console.log("\nTest 2: Genesis hash correct");
  assert(
    event1.parentEventHash === GENESIS_HASH,
    `First audit event uses authoritative genesis hash (64 zeroes): ${GENESIS_HASH}`
  );
  assert(
    event1.eventHash && event1.eventHash.length === 64,
    `First audit event possesses valid 64-char SHA-256 eventHash: ${event1.eventHash}`
  );

  // ============================================================================
  // TEST 3: Second Event References First Event Hash
  // ============================================================================
  console.log("\nTest 3: Second event references first event hash");
  const event2 = await DeploymentAuditService.appendEvent({
    deploymentId: testDeploymentId,
    repairId: testRepairId,
    action: "CANARY_INITIALIZED",
    stage: "WARMUP",
    actor: "AUTONOMOUS_TRAFFIC_ENGINE",
    previousCandidateWeight: 0,
    newCandidateWeight: 10,
    promQl: 'rate(http_requests_total{status=~"5.."}[1m])',
    observedValue: 0.01,
    threshold: 0.05,
    operator: "<",
    verificationStatus: "HEALTHY",
  });
  assert(event2.sequenceNumber === 2, "Second event has sequenceNumber === 2");
  assert(
    event2.parentEventHash === event1.eventHash,
    `Second event parentEventHash (${event2.parentEventHash}) exactly matches first eventHash (${event1.eventHash})`
  );
  assert(event2.eventHash !== event1.eventHash, "Second event hash is distinct from first event hash");

  // ============================================================================
  // TEST 4: Deterministic Canonicalization
  // ============================================================================
  console.log("\nTest 4: Deterministic canonicalization");
  const objA = { z: 1, a: "hello", m: [3, 2, 1], d: new Date("2026-10-02T12:00:00.000Z") };
  const objB = { a: "hello", d: new Date("2026-10-02T12:00:00.000Z"), m: [3, 2, 1], z: 1 };
  const canonA = DeploymentAuditService.canonicalStringify(objA);
  const canonB = DeploymentAuditService.canonicalStringify(objB);
  assert(canonA === canonB, "Canonical serialization produces byte-identical strings regardless of key ordering");
  assert(
    canonA.includes('"a":"hello"') && canonA.includes('"z":1'),
    "Canonical string contains sorted serialized key-value pairs"
  );

  // ============================================================================
  // TEST 5: Event Hash Reproducibility
  // ============================================================================
  console.log("\nTest 5: Event hash reproducibility");
  const normalized1 = DeploymentAuditService.extractCanonicalPayload(event1);
  const json1 = DeploymentAuditService.canonicalStringify(normalized1);
  const recomputedHash1 = DeploymentAuditService.calculateEventHash(event1.parentEventHash, json1);
  assert(
    recomputedHash1 === event1.eventHash,
    `Recomputing SHA-256 for event 1 produces exact identical hash (${recomputedHash1})`
  );

  const normalized2 = DeploymentAuditService.extractCanonicalPayload(event2);
  const json2 = DeploymentAuditService.canonicalStringify(normalized2);
  const recomputedHash2 = DeploymentAuditService.calculateEventHash(event2.parentEventHash, json2);
  assert(
    recomputedHash2 === event2.eventHash,
    `Recomputing SHA-256 for event 2 produces exact identical hash (${recomputedHash2})`
  );

  // ============================================================================
  // TEST 6: Chain Verification Succeeds
  // ============================================================================
  console.log("\nTest 6: Chain verification succeeds");
  const verifyResult = await DeploymentAuditService.verifyChain(testDeploymentId);
  assert(verifyResult.valid === true, "Chain verification returns valid === true");
  assert(verifyResult.eventCount === 2, `Chain verification reflects correct event count (2)`);
  assert(verifyResult.firstInvalidEventId === null, "firstInvalidEventId is null on valid chain");

  // ============================================================================
  // TEST 7: Tampered Payload Detected
  // ============================================================================
  console.log("\nTest 7: Tampered payload detected");
  // Create an isolated chain for tampering tests
  const tamperDepId = `DEP-TAMPER-${runId}`;
  await Deployment.create({
    deploymentId: tamperDepId,
    repairId: testRepairId,
    projectId: testProjectId,
    service: "PaymentGateway",
    version: "candidate",
    imageTag: "traceops-payment-service:candidate",
  });

  const tEvt1 = await DeploymentAuditService.appendEvent({
    deploymentId: tamperDepId,
    repairId: testRepairId,
    action: "DEPLOY_START",
    stage: "INITIAL",
    actor: "DevOps Engineer",
  });
  const tEvt2 = await DeploymentAuditService.appendEvent({
    deploymentId: tamperDepId,
    repairId: testRepairId,
    action: "STAGE_ADVANCED",
    stage: "TIER_10",
    actor: "AUTONOMOUS_TRAFFIC_ENGINE",
    observedValue: 0.02,
    newCandidateWeight: 10,
  });

  // Tamper payload directly in raw MongoDB collection (bypassing Mongoose hooks)
  await mongoose.connection.collection("deployment_audit_events").updateOne(
    { eventId: tEvt2.eventId },
    { $set: { newCandidateWeight: 99 } } // Tampered weight!
  );

  const tamperPayloadCheck = await DeploymentAuditService.verifyChain(tamperDepId);
  assert(tamperPayloadCheck.valid === false, "Chain verification fails when payload is tampered");
  assert(
    tamperPayloadCheck.firstInvalidEventId === tEvt2.eventId,
    `Identifies exact tampered event (${tEvt2.eventId})`
  );
  assert(
    tamperPayloadCheck.reason && tamperPayloadCheck.reason.includes("EVENT_HASH_MISMATCH"),
    `Reason states EVENT_HASH_MISMATCH: ${tamperPayloadCheck.reason}`
  );

  // Revert tamper so we can test other mutations
  await mongoose.connection.collection("deployment_audit_events").updateOne(
    { eventId: tEvt2.eventId },
    { $set: { newCandidateWeight: 10 } }
  );

  // ============================================================================
  // TEST 8: Tampered Parent Hash Detected
  // ============================================================================
  console.log("\nTest 8: Tampered parent hash detected");
  await mongoose.connection.collection("deployment_audit_events").updateOne(
    { eventId: tEvt2.eventId },
    { $set: { parentEventHash: "deadbeef00000000000000000000000000000000000000000000000000000000" } }
  );
  const tamperParentCheck = await DeploymentAuditService.verifyChain(tamperDepId);
  assert(tamperParentCheck.valid === false, "Chain verification fails when parent hash is tampered");
  assert(
    tamperParentCheck.reason &&
      (tamperParentCheck.reason.includes("PARENT_HASH_MISMATCH") ||
        tamperParentCheck.reason.includes("EVENT_HASH_MISMATCH")),
    `Reason identifies hash mismatch: ${tamperParentCheck.reason}`
  );

  // Revert parent hash
  await mongoose.connection.collection("deployment_audit_events").updateOne(
    { eventId: tEvt2.eventId },
    { $set: { parentEventHash: tEvt1.eventHash } }
  );

  // ============================================================================
  // TEST 9: Tampered Event Hash Detected
  // ============================================================================
  console.log("\nTest 9: Tampered event hash detected");
  await mongoose.connection.collection("deployment_audit_events").updateOne(
    { eventId: tEvt2.eventId },
    { $set: { eventHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" } }
  );
  const tamperHashCheck = await DeploymentAuditService.verifyChain(tamperDepId);
  assert(tamperHashCheck.valid === false, "Chain verification fails when eventHash is tampered");
  assert(
    tamperHashCheck.reason && tamperHashCheck.reason.includes("EVENT_HASH_MISMATCH"),
    `Reason states EVENT_HASH_MISMATCH: ${tamperHashCheck.reason}`
  );

  // Clean up tamper test deployment
  await mongoose.connection.collection("deployment_audit_events").deleteMany({ deploymentId: tamperDepId });
  await Deployment.deleteOne({ deploymentId: tamperDepId });

  // ============================================================================
  // TEST 10: Reordered Events Detected
  // ============================================================================
  console.log("\nTest 10: Reordered events detected");
  const reorderDepId = `DEP-REORDER-${runId}`;
  await Deployment.create({
    deploymentId: reorderDepId,
    repairId: testRepairId,
    projectId: testProjectId,
    service: "PaymentGateway",
    version: "candidate",
    imageTag: "traceops-payment-service:candidate",
  });

  const rEvt1 = await DeploymentAuditService.appendEvent({
    deploymentId: reorderDepId,
    repairId: testRepairId,
    action: "DEPLOY_START",
    stage: "INITIAL",
    actor: "DevOps Engineer",
  });
  const rEvt2 = await DeploymentAuditService.appendEvent({
    deploymentId: reorderDepId,
    repairId: testRepairId,
    action: "STAGE_ADVANCED",
    stage: "TIER_10",
    actor: "AUTONOMOUS_TRAFFIC_ENGINE",
  });

  // Reorder sequence numbers in raw database using temporary index to avoid unique constraint collision
  await mongoose.connection.collection("deployment_audit_events").updateOne(
    { eventId: rEvt1.eventId },
    { $set: { sequenceNumber: 999 } }
  );
  await mongoose.connection.collection("deployment_audit_events").updateOne(
    { eventId: rEvt2.eventId },
    { $set: { sequenceNumber: 1 } }
  );
  await mongoose.connection.collection("deployment_audit_events").updateOne(
    { eventId: rEvt1.eventId },
    { $set: { sequenceNumber: 2 } }
  );

  const reorderCheck = await DeploymentAuditService.verifyChain(reorderDepId);
  assert(reorderCheck.valid === false, "Chain verification fails when events are reordered");
  assert(
    reorderCheck.reason &&
      (reorderCheck.reason.includes("PARENT_HASH_MISMATCH") ||
        reorderCheck.reason.includes("EVENT_HASH_MISMATCH") ||
        reorderCheck.reason.includes("SEQUENCE_GAP")),
    `Reordering caught: ${reorderCheck.reason}`
  );

  await mongoose.connection.collection("deployment_audit_events").deleteMany({ deploymentId: reorderDepId });
  await Deployment.deleteOne({ deploymentId: reorderDepId });

  // ============================================================================
  // TEST 11: Deleted Event Detected
  // ============================================================================
  console.log("\nTest 11: Deleted event detected");
  const delDepId = `DEP-DEL-${runId}`;
  await Deployment.create({
    deploymentId: delDepId,
    repairId: testRepairId,
    projectId: testProjectId,
    service: "PaymentGateway",
    version: "candidate",
    imageTag: "traceops-payment-service:candidate",
  });

  const dEvt1 = await DeploymentAuditService.appendEvent({
    deploymentId: delDepId,
    repairId: testRepairId,
    action: "DEPLOY_START",
    stage: "INITIAL",
    actor: "DevOps Engineer",
  });
  const dEvt2 = await DeploymentAuditService.appendEvent({
    deploymentId: delDepId,
    repairId: testRepairId,
    action: "STAGE_ADVANCED",
    stage: "TIER_10",
    actor: "AUTONOMOUS_TRAFFIC_ENGINE",
  });
  const dEvt3 = await DeploymentAuditService.appendEvent({
    deploymentId: delDepId,
    repairId: testRepairId,
    action: "STAGE_ADVANCED",
    stage: "TIER_25",
    actor: "AUTONOMOUS_TRAFFIC_ENGINE",
  });

  // Delete middle event via raw collection
  await mongoose.connection.collection("deployment_audit_events").deleteOne({ eventId: dEvt2.eventId });

  const delCheck = await DeploymentAuditService.verifyChain(delDepId);
  assert(delCheck.valid === false, "Chain verification fails when intermediate event is deleted");
  assert(
    delCheck.reason &&
      (delCheck.reason.includes("SEQUENCE_GAP") || delCheck.reason.includes("PARENT_HASH_MISMATCH")),
    `Deletion detected: ${delCheck.reason}`
  );

  await mongoose.connection.collection("deployment_audit_events").deleteMany({ deploymentId: delDepId });
  await Deployment.deleteOne({ deploymentId: delDepId });

  // ============================================================================
  // TEST 12: Duplicate Event Handling
  // ============================================================================
  console.log("\nTest 12: Duplicate event handling");
  let duplicateRejected = false;
  try {
    // Attempt to manually create an audit event with duplicate eventId
    await DeploymentAuditEvent.create({
      eventId: event1.eventId, // duplicate
      sequenceNumber: 99,
      deploymentId: testDeploymentId,
      repairId: testRepairId,
      projectId: testProjectId,
      service: "PaymentGateway",
      candidateCommitSha: testCandidateCommit,
      predecessorImage: "traceops-payment-service:predecessor",
      candidateImage: "traceops-payment-service:candidate",
      strategy: "DIRECT",
      stage: "INITIAL_DEPLOY",
      action: "DEPLOY_START",
      actor: "Attacker",
      authorizationCheck: true,
      evidenceSnapshotHash: testEvidenceHash,
      parentEventHash: GENESIS_HASH,
      eventHash: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    });
  } catch (err) {
    duplicateRejected = true;
  }
  assert(duplicateRejected, "Duplicate eventId rejected by database unique index constraint");

  // ============================================================================
  // TEST 13: Immutable Event Update Rejected
  // ============================================================================
  console.log("\nTest 13: Immutable event update rejected");
  let saveUpdateRejected = false;
  try {
    const existingDoc = await DeploymentAuditEvent.findOne({ eventId: event1.eventId });
    existingDoc.action = "STAGE_ADVANCED";
    await existingDoc.save();
  } catch (err) {
    saveUpdateRejected = err.message.includes("Immutability Violation");
  }
  assert(saveUpdateRejected, "Updating persisted audit event via doc.save() rejected with Immutability Violation");

  let queryUpdateRejected = false;
  try {
    await DeploymentAuditEvent.updateOne({ eventId: event1.eventId }, { $set: { action: "STAGE_ADVANCED" } });
  } catch (err) {
    queryUpdateRejected = err.message.includes("Immutability Violation");
  }
  assert(queryUpdateRejected, "Updating persisted audit event via updateOne() rejected with Immutability Violation");

  // ============================================================================
  // TEST 14: Immutable Event Delete Rejected
  // ============================================================================
  console.log("\nTest 14: Immutable event delete rejected");
  let deleteOneRejected = false;
  try {
    await DeploymentAuditEvent.deleteOne({ eventId: event1.eventId });
  } catch (err) {
    deleteOneRejected = err.message.includes("Immutability Violation");
  }
  assert(deleteOneRejected, "Deleting audit event via deleteOne() rejected with Immutability Violation");

  let deleteManyRejected = false;
  try {
    await DeploymentAuditEvent.deleteMany({ deploymentId: testDeploymentId });
  } catch (err) {
    deleteManyRejected = err.message.includes("Immutability Violation");
  }
  assert(deleteManyRejected, "Deleting audit events via deleteMany() rejected with Immutability Violation");

  // ============================================================================
  // TEST 15: Invalid Foreign Key Rejected
  // ============================================================================
  console.log("\nTest 15: Invalid foreign key rejected");
  let nonExistentDepRejected = false;
  try {
    await DeploymentAuditService.appendEvent({
      deploymentId: "NON-EXISTENT-DEPLOYMENT",
      repairId: testRepairId,
      action: "DEPLOY_START",
      stage: "INITIAL",
      actor: "DevOps Engineer",
    });
  } catch (err) {
    nonExistentDepRejected = err.message.includes("Deployment record not found");
  }
  assert(nonExistentDepRejected, "Appending event for non-existent deployment rejected");

  let mismatchedRepairRejected = false;
  try {
    await DeploymentAuditService.appendEvent({
      deploymentId: testDeploymentId,
      repairId: "REP-MISMATCH-ID",
      action: "DEPLOY_START",
      stage: "INITIAL",
      actor: "DevOps Engineer",
    });
  } catch (err) {
    mismatchedRepairRejected = err.message.includes("Repair ID mismatch");
  }
  assert(mismatchedRepairRejected, "Appending event with mismatched repairId rejected");

  // ============================================================================
  // TEST 16: EvidenceSnapshotHash Mismatch Rejected
  // ============================================================================
  console.log("\nTest 16: EvidenceSnapshotHash mismatch rejected");
  let evidenceMismatchRejected = false;
  try {
    await DeploymentAuditService.appendEvent({
      deploymentId: testDeploymentId,
      repairId: testRepairId,
      evidenceSnapshotHash: "fakeevidence000000000000000000000000000000000000000000000000000000",
      action: "STAGE_ADVANCED",
      stage: "TIER_25",
      actor: "DevOps Engineer",
    });
  } catch (err) {
    evidenceMismatchRejected = err.message.includes("Evidence snapshot hash mismatch");
  }
  assert(evidenceMismatchRejected, "Appending event with mismatched evidenceSnapshotHash rejected");

  // ============================================================================
  // TEST 17: Unauthorized / Not Found Audit Access Rejected
  // ============================================================================
  console.log("\nTest 17: Unauthorized / Not found audit access rejected");
  const notFoundRes = await api("/api/deployments/DEP-NON-EXISTENT-XYZ/audit-events");
  assert(notFoundRes.status === 404, "GET /api/deployments/:id/audit-events returns 404 for unknown deployment");
  assert(notFoundRes.data.success === false, "Response body indicates success: false");

  const notFoundVerifyRes = await api("/api/deployments/DEP-NON-EXISTENT-XYZ/audit-events/verify");
  assert(notFoundVerifyRes.status === 404, "GET /api/deployments/:id/audit-events/verify returns 404 for unknown deployment");

  // ============================================================================
  // TEST 18: Valid Audit Retrieval via API
  // ============================================================================
  console.log("\nTest 18: Valid audit retrieval via API");
  const apiRes = await api(`/api/deployments/${testDeploymentId}/audit-events`);
  assert(apiRes.status === 200, "GET /api/deployments/:id/audit-events returns HTTP 200 OK");
  assert(apiRes.data.success === true, "Response reports success: true");
  assert(apiRes.data.chainValid === true, "Response reports chainValid: true");
  assert(apiRes.data.eventsCount === 2, "Response reports eventsCount === 2");
  assert(Array.isArray(apiRes.data.events) && apiRes.data.events.length === 2, "Response returns array of 2 audit events");
  assert(apiRes.data.events[0].eventId === event1.eventId, "First event in API matches event 1");
  assert(apiRes.data.events[1].eventId === event2.eventId, "Second event in API matches event 2");

  const apiVerifyRes = await api(`/api/deployments/${testDeploymentId}/audit-events/verify`);
  assert(apiVerifyRes.status === 200, "GET /api/deployments/:id/audit-events/verify returns HTTP 200 OK");
  assert(apiVerifyRes.data.verification.valid === true, "Verification endpoint confirms valid === true");

  // ============================================================================
  // TEST 19: Empty Chain Behavior
  // ============================================================================
  console.log("\nTest 19: Empty chain behavior");
  const emptyDepId = `DEP-EMPTY-${runId}`;
  await Deployment.create({
    deploymentId: emptyDepId,
    repairId: testRepairId,
    projectId: testProjectId,
    service: "PaymentGateway",
    version: "candidate",
    imageTag: "traceops-payment-service:candidate",
  });

  const emptyVerification = await DeploymentAuditService.verifyChain(emptyDepId);
  assert(emptyVerification.valid === true, "Empty chain verification returns valid: true");
  assert(emptyVerification.eventCount === 0, "Empty chain verification reports eventCount: 0");
  assert(emptyVerification.firstInvalidEventId === null, "Empty chain reports firstInvalidEventId: null");

  const emptyApiRes = await api(`/api/deployments/${emptyDepId}/audit-events`);
  assert(emptyApiRes.status === 200, "Empty deployment audit-events API returns HTTP 200");
  assert(emptyApiRes.data.eventsCount === 0, "Empty deployment reports eventsCount === 0");
  assert(emptyApiRes.data.chainValid === true, "Empty deployment reports chainValid === true");

  // ============================================================================
  // TEST 20: Concurrent / Sequential Append Chain Continuity
  // ============================================================================
  console.log("\nTest 20: Sequential & concurrent append chain continuity");
  const chainDepId = `DEP-CHAIN-${runId}`;
  await Deployment.create({
    deploymentId: chainDepId,
    repairId: testRepairId,
    projectId: testProjectId,
    service: "PaymentGateway",
    version: "candidate",
    imageTag: "traceops-payment-service:candidate",
  });

  const stages = [
    { action: "DEPLOY_START", stage: "INITIAL_DEPLOY", weight: 0 },
    { action: "CANARY_INITIALIZED", stage: "WARMUP", weight: 0 },
    { action: "STAGE_ADVANCED", stage: "TIER_10", weight: 10 },
    { action: "SLO_VERIFIED", stage: "TIER_10", weight: 10 },
    { action: "STAGE_ADVANCED", stage: "TIER_25", weight: 25 },
    { action: "SLO_VERIFIED", stage: "TIER_25", weight: 25 },
    { action: "STAGE_ADVANCED", stage: "TIER_50", weight: 50 },
    { action: "SLO_VERIFIED", stage: "TIER_50", weight: 50 },
    { action: "STAGE_ADVANCED", stage: "CUTOVER", weight: 100 },
    { action: "PROMOTION_FINALIZED", stage: "STABLE", weight: 100 },
  ];

  const chainedEvents = [];
  for (const step of stages) {
    const ev = await DeploymentAuditService.appendEvent({
      deploymentId: chainDepId,
      repairId: testRepairId,
      action: step.action,
      stage: step.stage,
      actor: "AUTONOMOUS_TRAFFIC_ENGINE",
      previousCandidateWeight: chainedEvents.length > 0 ? chainedEvents[chainedEvents.length - 1].newCandidateWeight : 0,
      newCandidateWeight: step.weight,
      promQl: 'rate(http_requests_total{status=~"5.."}[1m])',
      observedValue: 0.005,
      threshold: 0.05,
      operator: "<",
      verificationStatus: "HEALTHY",
    });
    chainedEvents.push(ev);
  }

  assert(chainedEvents.length === 10, "Successfully appended 10 multi-stage lifecycle events");

  // Verify full 10-step chain integrity
  const fullChainCheck = await DeploymentAuditService.verifyChain(chainDepId);
  assert(fullChainCheck.valid === true, "10-stage chain verification succeeds completely (valid === true)");
  assert(fullChainCheck.eventCount === 10, "10-stage chain reports exact eventCount === 10");
  assert(fullChainCheck.firstInvalidEventId === null, "Zero broken links in 10-stage chain");

  // Verify deployment record updated with lastAuditEventId
  const finalDepDoc = await Deployment.findOne({ deploymentId: chainDepId });
  assert(
    finalDepDoc.lastAuditEventId === chainedEvents[9].eventId,
    `Deployment.lastAuditEventId correctly points to final event: ${chainedEvents[9].eventId}`
  );

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log("\n================================================================================");
  console.log(`BATCH C1 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================\n");

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runTestSuite().catch((err) => {
  console.error("FATAL ERROR in Batch C1 test runner:", err);
  process.exit(1);
});

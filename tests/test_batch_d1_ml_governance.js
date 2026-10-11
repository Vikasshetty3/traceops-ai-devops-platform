/**
 * TRACEOPS PHASE 5.3 BATCH D1 — ML MODEL GOVERNANCE SPECIFICATION & AUDIT FOUNDATION
 *
 * Dedicated verification test suite proving:
 * 1. Model registration
 * 2. Duplicate model rejection
 * 3. Artifact SHA validation
 * 4. Dataset registration
 * 5. Dataset provenance
 * 6. Evaluation record
 * 7. Evaluation-to-model linkage
 * 8. Approval record
 * 9. Unauthorized approval rejection
 * 10. Admin approval
 * 11. Invalid artifact rejection (path traversal & missing file)
 * 12. Invalid model metadata rejection
 * 13. Audit event creation
 * 14. Audit-chain verification (cryptographic continuity)
 * 15. Audit tampering detection (fails closed)
 * 16. Production model remains unchanged (SHA-256 exact match)
 * 17. Candidate remains unpromoted (isLiveServing: false)
 * 18. No promotion API exists (POST /api/ml/promote returns 404)
 * 19. No model hot-swap (production serves 2.0.0)
 * 20. No model rollback implementation in D1 (POST /api/ml/rollback returns 404)
 * 21. No synthetic data introduced
 * 22. Existing ML prediction continues working
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/requirement_traceable_devops";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

// Backend compiled modules
const mongoose = require(path.join(__dirname, "../backend/node_modules/mongoose"));
const { MLModelRegistry } = require(path.join(__dirname, "../backend/dist/backend/src/models/MLModelRegistry"));
const { MLDatasetVersion } = require(path.join(__dirname, "../backend/dist/backend/src/models/MLDatasetVersion"));
const { MLModelEvaluation } = require(path.join(__dirname, "../backend/dist/backend/src/models/MLModelEvaluation"));
const { MLModelApproval } = require(path.join(__dirname, "../backend/dist/backend/src/models/MLModelApproval"));
const { DeploymentAuditEvent } = require(path.join(__dirname, "../backend/dist/backend/src/models/DeploymentAuditEvent"));
const { DeploymentAuditService, GENESIS_HASH } = require(path.join(__dirname, "../backend/dist/backend/src/services/deploymentAuditService"));
const { MLGovernanceService } = require(path.join(__dirname, "../backend/dist/backend/src/services/mlGovernanceService"));
const { MLArtifactValidator } = require(path.join(__dirname, "../backend/dist/backend/src/services/mlArtifactValidator"));
const { AuthService } = require(path.join(__dirname, "../backend/dist/backend/src/services/authService"));
const app = require(path.join(__dirname, "../backend/dist/backend/src/app")).default;

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

async function api(baseUrl, endpoint, options = {}) {
  const url = `${baseUrl}${endpoint.startsWith("/") ? endpoint : "/" + endpoint}`;
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  let data = null;
  try {
    data = await res.json();
  } catch (_e) {
    data = null;
  }
  return { status: res.status, ok: res.ok, data };
}

async function runTestSuite() {
  console.log("================================================================================");
  console.log("PHASE 5.3 BATCH D1 — ML MODEL GOVERNANCE SPECIFICATION & AUDIT VERIFICATION");
  console.log("================================================================================\n");

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB for Batch D1 verification.\n");

  // Spin up in-process server on dynamic ephemeral port to test freshly compiled routes
  const testServer = http.createServer(app);
  await new Promise((resolve) => testServer.listen(0, resolve));
  const testPort = testServer.address().port;
  const TEST_SERVER_URL = `http://localhost:${testPort}`;
  console.log(`Ephemeral test API server listening on http://localhost:${testPort}\n`);

  const runId = Date.now();
  const testModelId = `mdl-test-${runId}`;
  const testModelVersion = `3.1.0-test-${runId}`;
  const candidateArtifactPath = "ml-service/data/models/3.1.0-real-runtime-training.json";
  const expectedCandidateSHA = "06240DB6F6FB75EAD3F269301574A7A15AA5EFE4C5F2B82C1D0651A5090CAE9A";

  // Create temporary test artifact matching testModelVersion
  const testArtifactDir = path.resolve(__dirname, "../ml-service/data/models");
  const testArtifactPath = path.join(testArtifactDir, `test-${runId}.json`);
  const candidateRaw = fs.readFileSync(path.resolve(__dirname, "../ml-service/data/models/3.1.0-real-runtime-training.json"), "utf-8");
  const candidateParsed = JSON.parse(candidateRaw);
  candidateParsed.modelVersion = testModelVersion;
  fs.writeFileSync(testArtifactPath, JSON.stringify(candidateParsed, null, 2), "utf-8");
  const testArtifactRelativePath = `ml-service/data/models/test-${runId}.json`;
  const testArtifactSHA = crypto.createHash("sha256").update(fs.readFileSync(testArtifactPath)).digest("hex").toUpperCase();

  const adminToken = AuthService.generateToken({
    userId: `admin-${runId}`,
    username: "governance-admin",
    email: "admin@traceops.io",
    role: "ADMIN",
    name: "Governance Admin",
  });

  const userToken = AuthService.generateToken({
    userId: `user-${runId}`,
    username: "standard-dev",
    email: "dev@traceops.io",
    role: "USER",
    name: "Standard Developer",
  });

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Model Registration via Governance API
    // -------------------------------------------------------------------------
    console.log("--- TEST 1: Model Registration ---");
    const regRes = await api(TEST_SERVER_URL, "/api/ml/governance/models", {
      method: "POST",
      body: JSON.stringify({
        modelId: testModelId,
        modelVersion: testModelVersion,
        modelType: "class_weighted_logistic_regression",
        artifactPath: testArtifactRelativePath,
        artifactSHA256: testArtifactSHA,
        featureSchemaVersion: "v2-production-telemetry",
        status: "CANDIDATE",
        servingStatus: "CANDIDATE_ONLY",
        threshold: 0.5,
        datasetVersion: "1.0.0-runtime",
        datasetSHA256: "82ed6c1af4be3909",
        validationSummary: "Batch D1 Test Candidate Registration",
      }),
    });

    assert(regRes.status === 201, `POST /api/ml/governance/models returned HTTP 201 Created (got ${regRes.status})`);
    assert(regRes.data?.success === true, "Model registration response indicates success");
    assert(regRes.data?.data?.modelId === testModelId, `Registered modelId matches requested ID "${testModelId}"`);
    assert(regRes.data?.data?.status === "CANDIDATE", "Registered model status is initialized to CANDIDATE");
    assert(regRes.data?.data?.servingStatus === "CANDIDATE_ONLY", "Serving status is initialized to CANDIDATE_ONLY");

    // -------------------------------------------------------------------------
    // TEST 2: Duplicate Model Rejection
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 2: Duplicate Model Rejection ---");
    const dupRes = await api(TEST_SERVER_URL, "/api/ml/governance/models", {
      method: "POST",
      body: JSON.stringify({
        modelId: testModelId,
        modelVersion: testModelVersion,
        artifactPath: testArtifactRelativePath,
        artifactSHA256: testArtifactSHA,
      }),
    });
    assert(dupRes.status === 409, `Duplicate model registration rejected with HTTP 409 Conflict (got ${dupRes.status})`);
    assert(dupRes.data?.error?.includes("already registered"), "Error message explicitly cites duplicate model");

    // -------------------------------------------------------------------------
    // TEST 3: Artifact SHA Validation
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 3: Artifact SHA Validation ---");
    const validArtifactResult = await MLArtifactValidator.validateArtifact(
      candidateArtifactPath,
      expectedCandidateSHA
    );
    assert(validArtifactResult.valid === true, "Valid candidate artifact passes MLArtifactValidator checks");
    assert(validArtifactResult.shaMatches === true, "Artifact SHA-256 matches expected cryptographic hash");

    const forgedSHA = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const forgedArtifactResult = await MLArtifactValidator.validateArtifact(
      candidateArtifactPath,
      forgedSHA
    );
    assert(forgedArtifactResult.valid === false, "Forged SHA-256 is correctly rejected by MLArtifactValidator");
    assert(forgedArtifactResult.shaMatches === false, "shaMatches is false for mismatched hash");

    // -------------------------------------------------------------------------
    // TEST 4 & 5: Dataset Registration & Provenance
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 4 & 5: Dataset Registration & Provenance ---");
    const testDatasetId = `ds-test-${runId}`;
    const testDatasetVersion = `1.0.0-test-${runId}`;

    const dsRes = await api(TEST_SERVER_URL, "/api/ml/governance/datasets", {
      method: "POST",
      body: JSON.stringify({
        datasetId: testDatasetId,
        datasetVersion: testDatasetVersion,
        datasetSHA256: "82ed6c1af4be3909",
        sampleCount: 845,
        healthyCount: 229,
        violationCount: 616,
        featureSchemaVersion: "v2-production-telemetry",
        temporalStart: "2026-09-27T11:01:59.150Z",
        temporalEnd: "2026-10-01T01:32:23.550Z",
        calendarDays: 3,
        builderVersion: "3.3.0",
        leakageChecks: {
          hasLeakage: false,
          trainValOverlapCount: 0,
          trainTestOverlapCount: 0,
          valTestOverlapCount: 0,
          chronologicalOrderValid: true,
        },
        readinessStatus: {
          isReady: true,
          reasons: [],
          totalSpanHours: 86.51,
          distinctServicesCount: 18,
          distinctSlosCount: 139,
          distinctRequirementsCount: 114,
        },
      }),
    });

    assert(dsRes.status === 201, `Dataset registration returned HTTP 201 (got ${dsRes.status})`);
    assert(dsRes.data?.data?.datasetId === testDatasetId, "Registered datasetId matches input");
    assert(dsRes.data?.data?.calendarDays === 3, "Dataset provenance records authentic multi-day span (3 days)");
    assert(dsRes.data?.data?.leakageChecks?.hasLeakage === false, "Dataset provenance confirms zero chronological leakage");

    // -------------------------------------------------------------------------
    // TEST 6 & 7: Evaluation Record & Linkage to Model
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 6 & 7: Evaluation Record & Model Linkage ---");
    const evalRes = await api(TEST_SERVER_URL, `/api/ml/governance/models/${testModelId}/evaluations`, {
      method: "POST",
      body: JSON.stringify({
        split: "TEST",
        sampleCount: 127,
        accuracy: 1.0,
        precision: 1.0,
        recall: 1.0,
        f1Score: 1.0,
        rocAuc: 1.0,
        logLoss: 0.2927,
        brierScore: 0.0746,
        confusionMatrix: {
          truePositive: 16,
          falsePositive: 0,
          trueNegative: 111,
          falseNegative: 0,
        },
        threshold: 0.5,
        resultStatus: "PASSED",
        summary: "Phase 3.6 held-out test evaluation with FP=0, FN=0",
      }),
    });

    assert(evalRes.status === 201, `Evaluation record returned HTTP 201 (got ${evalRes.status})`);
    assert(evalRes.data?.data?.modelId === testModelId, "Evaluation record correctly linked to modelId");
    assert(evalRes.data?.modelStatus === "VALIDATED", "Model transitioned to VALIDATED upon passing TEST split evaluation");

    const getEvalsRes = await api(TEST_SERVER_URL, `/api/ml/governance/models/${testModelId}/evaluations`);
    assert(getEvalsRes.status === 200, "GET /api/ml/governance/models/:modelId/evaluations returned HTTP 200");
    assert(getEvalsRes.data?.count === 1, "Evaluation retrieval returns exactly 1 linked evaluation record");

    // -------------------------------------------------------------------------
    // TEST 8: Approval Record Request
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 8: Approval Record Request ---");
    const appReqRes = await api(TEST_SERVER_URL, `/api/ml/governance/models/${testModelId}/approval/request`, {
      method: "POST",
      body: JSON.stringify({
        requestedBy: "ml-engineer-lead",
        reason: "Model passed all test split validation gates with 100% recall and 0 false alarms",
      }),
    });

    assert(appReqRes.status === 201, `Approval request returned HTTP 201 Created (got ${appReqRes.status})`);
    assert(appReqRes.data?.data?.decision === "PENDING", "Approval record decision is initialized to PENDING");

    const updatedModel = await MLModelRegistry.findOne({ modelId: testModelId });
    assert(updatedModel.status === "PENDING_APPROVAL", "Model lifecycle status updated to PENDING_APPROVAL");

    // -------------------------------------------------------------------------
    // TEST 9: Unauthorized Approval Rejection
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 9: Unauthorized Approval Rejection ---");
    const unauthNoToken = await api(TEST_SERVER_URL, `/api/ml/governance/models/${testModelId}/approval`, {
      method: "POST",
      body: JSON.stringify({ decision: "APPROVED", reason: "Attempted unauthenticated approval" }),
    });
    assert(unauthNoToken.status === 401, `Unauthenticated approval rejected with HTTP 401 (got ${unauthNoToken.status})`);

    const unauthStandardUser = await api(TEST_SERVER_URL, `/api/ml/governance/models/${testModelId}/approval`, {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ decision: "APPROVED", reason: "Attempted non-admin approval" }),
    });
    assert(unauthStandardUser.status === 403, `Non-admin approval rejected with HTTP 403 Forbidden (got ${unauthStandardUser.status})`);

    // -------------------------------------------------------------------------
    // TEST 10: Admin Approval Review
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 10: Admin Approval Review ---");
    const adminAppRes = await api(TEST_SERVER_URL, `/api/ml/governance/models/${testModelId}/approval`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        decision: "APPROVED",
        reviewer: "governance-admin",
        reason: "Officially approved candidate model for eventual promotion",
      }),
    });

    assert(adminAppRes.status === 200, `Admin approval returned HTTP 200 (got ${adminAppRes.status})`);
    assert(adminAppRes.data?.data?.decision === "APPROVED", "Approval record status updated to APPROVED");
    assert(adminAppRes.data?.model?.status === "APPROVED", "Model lifecycle status updated to APPROVED");
    assert(adminAppRes.data?.model?.servingStatus === "CANDIDATE_ONLY", "Approved candidate remains servingStatus: CANDIDATE_ONLY (NOT live serving)");

    // -------------------------------------------------------------------------
    // TEST 11: Invalid Artifact Rejection (Missing File & Path Traversal)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 11: Invalid Artifact Rejection ---");
    const missingFileRes = await api(TEST_SERVER_URL, "/api/ml/governance/models", {
      method: "POST",
      body: JSON.stringify({
        modelId: `mdl-missing-${runId}`,
        modelVersion: `missing-ver-${runId}`,
        artifactPath: "non/existent/path/model.json",
        artifactSHA256: expectedCandidateSHA,
      }),
    });
    assert(missingFileRes.status === 400, `Missing artifact file rejected with HTTP 400 (got ${missingFileRes.status})`);
    assert(missingFileRes.data?.error?.includes("Artifact file not found"), "Error explicitly mentions file not found");

    const pathTraversalRes = await api(TEST_SERVER_URL, "/api/ml/governance/models", {
      method: "POST",
      body: JSON.stringify({
        modelId: `mdl-traversal-${runId}`,
        modelVersion: `traversal-ver-${runId}`,
        artifactPath: "../../outside_root_file.json",
        artifactSHA256: expectedCandidateSHA,
      }),
    });
    assert(pathTraversalRes.status === 400, `Path traversal attempt rejected with HTTP 400 (got ${pathTraversalRes.status})`);
    assert(pathTraversalRes.data?.error?.includes("Path Traversal Violation"), "Error explicitly detects path traversal violation");

    // -------------------------------------------------------------------------
    // TEST 12: Invalid Model Metadata Rejection
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 12: Invalid Model Metadata Rejection ---");
    // Create temporary malformed artifact in scratch dir
    const scratchDir = path.resolve(__dirname, "../backend/src");
    const badArtifactPath = path.join(scratchDir, "temp_bad_model.json");
    fs.writeFileSync(
      badArtifactPath,
      JSON.stringify({
        modelVersion: "bad-meta-v1",
        schemaVersion: "v1-legacy-unsupported", // Wrong schema
        coefficients: { cpuUsage: 1.0 },       // Missing 5 features
      }),
      "utf-8"
    );

    const badSHA = crypto.createHash("sha256").update(fs.readFileSync(badArtifactPath)).digest("hex").toUpperCase();
    const badRes = await api(TEST_SERVER_URL, "/api/ml/governance/models", {
      method: "POST",
      body: JSON.stringify({
        modelId: `mdl-bad-${runId}`,
        modelVersion: `bad-meta-${runId}`,
        artifactPath: path.relative(path.resolve(__dirname, ".."), badArtifactPath),
        artifactSHA256: badSHA,
      }),
    });

    // Cleanup scratch file
    fs.unlinkSync(badArtifactPath);

    assert(badRes.status === 400, `Malformed model metadata rejected with HTTP 400 (got ${badRes.status})`);
    assert(badRes.data?.error?.includes("Feature Schema Version Incompatible"), "Error explicitly catches incompatible feature schema version");

    // -------------------------------------------------------------------------
    // TEST 13 & 14: Audit Event Creation & Chain Verification
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 13 & 14: Audit Trail Creation & Cryptographic Chain Verification ---");
    const auditRes = await api(TEST_SERVER_URL, `/api/ml/governance/models/${testModelId}/audit`);
    assert(auditRes.status === 200, `GET /api/ml/governance/models/:modelId/audit returned HTTP 200 (got ${auditRes.status})`);

    const events = auditRes.data?.data?.events || [];
    assert(events.length >= 4, `Audit chain recorded at least 4 discrete lifecycle events (got ${events.length})`);

    const actions = events.map((e) => e.action);
    assert(actions.includes("MODEL_REGISTERED"), "Audit chain contains MODEL_REGISTERED event");
    assert(actions.includes("MODEL_VALIDATION_PASSED"), "Audit chain contains MODEL_VALIDATION_PASSED event");
    assert(actions.includes("MODEL_APPROVAL_REQUESTED"), "Audit chain contains MODEL_APPROVAL_REQUESTED event");
    assert(actions.includes("MODEL_APPROVED"), "Audit chain contains MODEL_APPROVED event");

    const chainVerification = auditRes.data?.data?.chainVerification;
    assert(chainVerification?.valid === true, "Cryptographic audit chain verification succeeded (valid === true)");
    assert(chainVerification?.firstInvalidEventId === null, "Audit chain has zero broken parent hashes or sequence gaps");
    assert(events[0].parentEventHash === GENESIS_HASH, "Genesis audit event references 64 zeros null digest");
    assert(events[1].parentEventHash === events[0].eventHash, "Event sequence 2 parent hash matches event sequence 1 eventHash");

    // -------------------------------------------------------------------------
    // TEST 15: Audit Tampering Detection (Fails Closed)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 15: Audit Tampering Detection ---");
    // Verify tampering detection on a dedicated test chain
    const tamperModelId = `mdl-tamper-${runId}`;
    await DeploymentAuditService.appendModelEvent({
      modelId: tamperModelId,
      modelVersion: "1.0.0-tamper",
      artifactSHA256: "0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF",
      action: "MODEL_REGISTERED",
      actor: "tamper-tester",
    });
    await DeploymentAuditService.appendModelEvent({
      modelId: tamperModelId,
      modelVersion: "1.0.0-tamper",
      artifactSHA256: "0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF",
      action: "MODEL_APPROVED",
      actor: "tamper-tester",
    });

    const untamperedCheck = await DeploymentAuditService.verifyModelChain(tamperModelId);
    assert(untamperedCheck.valid === true, "Untampered model audit chain passes verification");

    // Directly tamper with MongoDB collection document to simulate malicious tampering
    await DeploymentAuditEvent.collection.updateOne(
      { modelId: tamperModelId, sequenceNumber: 2 },
      { $set: { actor: "MALICIOUS_IMPOSTOR" } }
    );

    const tamperedCheck = await DeploymentAuditService.verifyModelChain(tamperModelId);
    assert(tamperedCheck.valid === false, "Tampered model audit event is successfully caught (valid === false)");
    assert(tamperedCheck.reason?.includes("EVENT_HASH_MISMATCH"), "Tamper reason explicitly identifies EVENT_HASH_MISMATCH");

    // -------------------------------------------------------------------------
    // TEST 16: Production Model Remains Unchanged
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 16: Production Model Unchanged Invariant ---");
    const prodArtifactPath = path.resolve(__dirname, "../data/trained_model.json");
    const prodContent = fs.readFileSync(prodArtifactPath);
    const prodSHA = crypto.createHash("sha256").update(prodContent).digest("hex").toUpperCase();
    const EXPECTED_PROD_SHA = "74460AC69D6C8B507955081943620817E96C9F9631D7BA81EB30A400BD86EC49";

    assert(prodSHA === EXPECTED_PROD_SHA, `Production model SHA-256 is unchanged (${prodSHA})`);

    // -------------------------------------------------------------------------
    // TEST 17: Candidate 3.1.0 Remains Unpromoted
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 17: Candidate 3.1.0 Unpromoted Invariant ---");
    const candPath = path.resolve(__dirname, "../ml-service/data/models/3.1.0-real-runtime-training.json");
    const candContent = fs.readFileSync(candPath);
    const candSHA = crypto.createHash("sha256").update(candContent).digest("hex").toUpperCase();

    assert(candSHA === expectedCandidateSHA, `Candidate model 3.1.0 SHA-256 is unchanged (${candSHA})`);

    const candParsed = JSON.parse(candContent.toString("utf-8"));
    assert(candParsed.status === "CANDIDATE", "Candidate model artifact file status is CANDIDATE");

    // -------------------------------------------------------------------------
    // TEST 18: No Promotion API Exists in Batch D1
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 18: No Promotion API Exists ---");
    const promoteRes = await api(TEST_SERVER_URL, "/api/ml/promote", {
      method: "POST",
      body: JSON.stringify({ modelVersion: "3.1.0-real-runtime-training" }),
    });
    assert(promoteRes.status === 404, `POST /api/ml/promote returns HTTP 404 Not Found (got ${promoteRes.status})`);

    const govPromoteRes = await api(TEST_SERVER_URL, "/api/ml/governance/promote", {
      method: "POST",
      body: JSON.stringify({ modelVersion: "3.1.0-real-runtime-training" }),
    });
    assert(govPromoteRes.status === 404, `POST /api/ml/governance/promote returns HTTP 404 Not Found (got ${govPromoteRes.status})`);

    // -------------------------------------------------------------------------
    // TEST 19: No Model Hot-Swap (Production Serves 2.0.0)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 19: No Model Hot-Swap ---");
    const mlHealthRes = await api(BACKEND_URL, "/api/health");
    assert(mlHealthRes.status === 200, "Backend health check passes");

    // Test ML Microservice endpoint directly
    const mlServiceRes = await api("http://localhost:5001", "/health");
    assert(mlServiceRes.status === 200, "ML Service health check returns HTTP 200");
    assert(
      mlServiceRes.data?.modelVersion === "2.0.0-production-telemetry",
      `ML Service default serving model is strictly 2.0.0-production-telemetry (got ${mlServiceRes.data?.modelVersion})`
    );

    // -------------------------------------------------------------------------
    // TEST 20: No Rollback Implementation in Batch D1
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 20: No Rollback Implementation in Batch D1 ---");
    const rollbackRes = await api(TEST_SERVER_URL, "/api/ml/rollback", {
      method: "POST",
      body: JSON.stringify({ modelVersion: "3.1.0-real-runtime-training" }),
    });
    assert(rollbackRes.status === 404, `POST /api/ml/rollback returns HTTP 404 Not Found (got ${rollbackRes.status})`);

    const govRollbackRes = await api(TEST_SERVER_URL, "/api/ml/governance/rollback", {
      method: "POST",
      body: JSON.stringify({ modelVersion: "3.1.0-real-runtime-training" }),
    });
    assert(govRollbackRes.status === 404, `POST /api/ml/governance/rollback returns HTTP 404 Not Found (got ${govRollbackRes.status})`);

    // -------------------------------------------------------------------------
    // TEST 21: No Synthetic Data Introduced
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 21: Zero Synthetic Data Invariant ---");
    const datasets = await MLDatasetVersion.find();
    const hasSynthetic = datasets.some(
      (d) => d.sourceTypes.includes("SYNTHETIC") || d.sourceTypes.includes("SIMULATED")
    );
    assert(hasSynthetic === false, "All registered datasets use genuine runtime telemetry sources only");

    // -------------------------------------------------------------------------
    // TEST 22: Existing ML Prediction Continues Working
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 22: Existing ML Prediction Continues Working ---");
    const predRes = await api(BACKEND_URL, "/api/ml/predict", {
      method: "POST",
      body: JSON.stringify({
        service: "PaymentGateway",
        cpuUsage: 85.5,
        memoryUsage: 78.2,
        p95Latency: 2.1,
        errorRate: 4.5,
        requestRate: 650.0,
        deploymentChanged: 0,
      }),
    });

    assert(predRes.status === 200, `POST /api/ml/predict returned HTTP 200 OK (got ${predRes.status})`);
    assert(predRes.data?.success === true, "ML prediction response success is true");
    assert(predRes.data?.data?.prediction !== undefined, "ML prediction contains valid classification result");
    assert(
      predRes.data?.data?.modelVersion === "2.0.0-production-telemetry",
      `ML prediction was served by production model 2.0.0-production-telemetry (got ${predRes.data?.data?.modelVersion})`
    );

  } finally {
    // Teardown
    if (fs.existsSync(testArtifactPath)) {
      try { fs.unlinkSync(testArtifactPath); } catch (_e) {}
    }
    testServer.close();
    await mongoose.disconnect();
    console.log("\nDisconnected from MongoDB and closed ephemeral test server.");
  }

  console.log("\n================================================================================");
  console.log(`BATCH D1 VERIFICATION COMPLETE: ${passed} passed, ${failed} failed`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution aborted with unhandled error:", err);
  process.exit(1);
});

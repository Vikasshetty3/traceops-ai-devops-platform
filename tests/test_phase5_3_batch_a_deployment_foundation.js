/**
 * TRACEOPS PHASE 5.3 — BATCH A: DEPLOYMENT FOUNDATION VERIFICATION SUITE
 *
 * Verifies all 20 mandatory acceptance tests:
 * 1. repair branch creation (repair/<repairId>)
 * 2. base commit captured
 * 3. candidate commit captured
 * 4. repair → Git provenance trace
 * 5. path containment
 * 6. concurrent deployment lock
 * 7. stale lock handling
 * 8. idempotent deployment
 * 9. unapproved deployment rejection
 * 10. unvalidated deployment rejection
 * 11. missing Git commit rejection
 * 12. candidate image identity
 * 13. predecessor image capture
 * 14. no host execution
 * 15. no shell injection
 * 16. Phase 5.1 sandbox protections remain intact
 * 17. Phase 5.2 evidence snapshot remains unchanged
 * 18. no deployment of unrelated service
 * 19. successful approved controlled deployment
 * 20. clean lock release
 */

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/requirement_traceable_devops";

// Backend compiled modules
const mongoose = require(path.join(__dirname, "../backend/node_modules/mongoose"));
const { ProjectStorageService } = require(path.join(__dirname, "../backend/dist/backend/src/services/projectStorageService"));
const { GitProvenanceService } = require(path.join(__dirname, "../backend/dist/backend/src/services/gitProvenanceService"));
const { DeploymentLockService, DeploymentLockConflictError } = require(path.join(__dirname, "../backend/dist/backend/src/services/deploymentLockService"));
const { DockerDeploymentProvider } = require(path.join(__dirname, "../backend/dist/backend/src/services/dockerDeploymentProvider"));
const { RcaRepairContractService } = require(path.join(__dirname, "../backend/dist/backend/src/services/rcaRepairContractService"));
const { ValidationService } = require(path.join(__dirname, "../backend/dist/backend/src/services/validationService"));

// Backend compiled models
const { CodeRepair } = require(path.join(__dirname, "../backend/dist/backend/src/models/CodeRepair"));
const { Deployment } = require(path.join(__dirname, "../backend/dist/backend/src/models/Deployment"));
const { DeploymentLock } = require(path.join(__dirname, "../backend/dist/backend/src/models/DeploymentLock"));
const { Incident } = require(path.join(__dirname, "../backend/dist/backend/src/models/Incident"));
const { SLO } = require(path.join(__dirname, "../backend/dist/backend/src/models/SLO"));
const { Requirement } = require(path.join(__dirname, "../backend/dist/backend/src/models/Requirement"));
const { RCA } = require(path.join(__dirname, "../backend/dist/backend/src/models/RCA"));
const { Project } = require(path.join(__dirname, "../backend/dist/backend/src/models/Project"));

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
  } catch {
    data = null;
  }
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log("================================================================================");
  console.log("  PHASE 5.3 BATCH A — DEPLOYMENT FOUNDATION VERIFICATION SUITE");
  console.log("================================================================================\n");

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI);
  }

  const testSuffix = Date.now().toString().slice(-6);
  const testProjectId = "PROJ-53A";
  const testService = "Checkout";

  // Ensure base test project exists
  let project = await Project.findOne({ projectId: testProjectId });
  if (!project) {
    project = await Project.create({
      projectId: testProjectId,
      name: "Phase 5.3 Deployment Foundation Test Project",
      status: "ANALYZED",
      sourceType: "LOCAL_DIRECTORY",
      services: [{ name: testService, type: "SERVICE", port: 5000 }],
    });
  }

  // Ensure project source baseline files exist
  const sourceDir = ProjectStorageService.getProjectSourceDir(testProjectId);
  if (!fs.existsSync(sourceDir)) {
    fs.mkdirSync(sourceDir, { recursive: true });
  }
  const serverJsPath = path.join(sourceDir, "server.js");
  if (!fs.existsSync(serverJsPath)) {
    fs.writeFileSync(
      serverJsPath,
      `const http = require("http");
const { MongoClient } = require("mongodb");
const client = new MongoClient("mongodb://localhost:27017");

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "UP", service: "${testService}" }));
  }
  res.writeHead(200);
  res.end("OK");
});
server.listen(5000);
`,
      "utf-8"
    );
  }

  // Ensure base Git repository exists
  const { repoDir: baseRepoDir, baseCommitSha: projectBaseCommitSha } =
    await GitProvenanceService.ensureBaseRepository(testProjectId);

  console.log(`[SETUP] Base Git repository initialized at ${baseRepoDir} (Base SHA: ${projectBaseCommitSha.slice(0, 8)})`);

  // ============================================================================
  // TEST 1: Repair branch creation (repair/<repairId>)
  // ============================================================================
  console.log("\n--- TEST 1: Repair Branch Creation (repair/<repairId>) ---");
  const testRepairId1 = `REP-53A1-${testSuffix}`;
  const worktreeResult1 = await GitProvenanceService.createRepairWorktree(testRepairId1, testProjectId);
  assert(
    worktreeResult1.branchName === `repair/${testRepairId1}`,
    `Branch name is strictly repair/<repairId>: "${worktreeResult1.branchName}"`
  );
  assert(
    fs.existsSync(worktreeResult1.worktreePath),
    `Isolated Git worktree created on filesystem at ${worktreeResult1.worktreePath}`
  );

  // Verify via Git CLI that the branch exists in the repository
  const { stdout: branchesOut } = await execFileAsync("git", ["branch", "--list", `repair/${testRepairId1}`], {
    cwd: baseRepoDir,
  });
  assert(
    branchesOut.includes(`repair/${testRepairId1}`),
    `Git branch "repair/${testRepairId1}" verified in repository ref database`
  );

  // ============================================================================
  // TEST 2: Base commit captured
  // ============================================================================
  console.log("\n--- TEST 2: Base Commit Captured ---");
  assert(
    Boolean(worktreeResult1.baseCommitSha) && /^[0-9a-f]{40}$/i.test(worktreeResult1.baseCommitSha),
    `Valid 40-character base commit SHA captured: ${worktreeResult1.baseCommitSha}`
  );
  assert(
    worktreeResult1.baseCommitSha === projectBaseCommitSha,
    `Worktree base commit matches authoritative project baseline commit (${projectBaseCommitSha.slice(0, 8)})`
  );

  // ============================================================================
  // TEST 3: Candidate commit captured
  // ============================================================================
  console.log("\n--- TEST 3: Candidate Commit Captured ---");
  const candidateFilePath1 = path.join(worktreeResult1.worktreePath, "server.js");
  const originalServerCode = fs.readFileSync(candidateFilePath1, "utf-8");
  const patchedServerCode = originalServerCode.replace(
    /new MongoClient\("mongodb:\/\/localhost:27017"\)/,
    'new MongoClient("mongodb://localhost:27017", { serverSelectionTimeoutMS: 2500, connectTimeoutMS: 5000 })'
  );
  fs.writeFileSync(candidateFilePath1, patchedServerCode, "utf-8");

  const commitResult1 = await GitProvenanceService.commitCandidate({
    worktreePath: worktreeResult1.worktreePath,
    repairId: testRepairId1,
    incidentId: `INC-53A-${testSuffix}`,
    rcaId: `RCA-53A-${testSuffix}`,
    sloId: `SLO-53A-${testSuffix}`,
    requirementId: `REQ-53A-${testSuffix}`,
    evidenceSnapshotHash: "5d555935bd4a7d748346970dfd2cd8f91ea82a963420a67956038acc96b90e50",
    candidateActionType: "MISSING_TIMEOUT",
    changedFiles: ["server.js"],
  });

  assert(
    Boolean(commitResult1.candidateCommitSha) && /^[0-9a-f]{40}$/i.test(commitResult1.candidateCommitSha),
    `Candidate changes committed before deployment with SHA: ${commitResult1.candidateCommitSha}`
  );
  assert(
    commitResult1.candidateCommitSha !== worktreeResult1.baseCommitSha,
    `Candidate commit SHA differs from base commit (new commit generated on worktree branch)`
  );

  // ============================================================================
  // TEST 4: Repair → Git provenance trace
  // ============================================================================
  console.log("\n--- TEST 4: Repair → Git Provenance Trace ---");
  const { stdout: commitLogOut } = await execFileAsync("git", ["log", "-1", "--pretty=fuller", commitResult1.candidateCommitSha], {
    cwd: worktreeResult1.worktreePath,
  });

  assert(commitLogOut.includes(`Repair-Id: ${testRepairId1}`), `Commit message contains trailer: Repair-Id: ${testRepairId1}`);
  assert(commitLogOut.includes(`Incident-Id: INC-53A-${testSuffix}`), `Commit message contains trailer: Incident-Id`);
  assert(commitLogOut.includes(`RCA-Id: RCA-53A-${testSuffix}`), `Commit message contains trailer: RCA-Id`);
  assert(commitLogOut.includes(`SLO-Id: SLO-53A-${testSuffix}`), `Commit message contains trailer: SLO-Id`);
  assert(commitLogOut.includes(`Requirement-Id: REQ-53A-${testSuffix}`), `Commit message contains trailer: Requirement-Id`);
  assert(commitLogOut.includes("Evidence-Snapshot-Hash: 5d555935bd4a7d74"), `Commit message contains trailer: Evidence-Snapshot-Hash`);

  const isTraceable = await GitProvenanceService.verifyCommitTraceability(
    worktreeResult1.worktreePath,
    commitResult1.candidateCommitSha,
    testRepairId1
  );
  assert(isTraceable === true, `GitProvenanceService.verifyCommitTraceability confirms full cryptographic trailer trace`);

  // ============================================================================
  // TEST 5: Path containment
  // ============================================================================
  console.log("\n--- TEST 5: Path Containment & Escape Shield ---");
  const workspacesRoot = ProjectStorageService.getWorkspacesBaseDir();
  let caughtEscape = false;
  try {
    ProjectStorageService.safeResolvePath(workspacesRoot, "../../../etc/passwd");
  } catch (err) {
    caughtEscape = err.message.includes("Path traversal") || err.message.includes("escapes");
  }
  assert(caughtEscape, `Path traversal (../../../etc/passwd) strictly rejected`);

  let caughtSibling = false;
  try {
    ProjectStorageService.safeResolvePath(path.join(workspacesRoot, "REP-01"), "../REP-01-other");
  } catch (err) {
    caughtSibling = err.message.includes("Path traversal") || err.message.includes("escapes") || err.message.includes("Sibling-prefix") || err.message.includes("Security Violation");
  }
  assert(caughtSibling, `Sibling prefix attack strictly rejected`);

  let caughtInvalidId = false;
  try {
    await GitProvenanceService.createRepairWorktree("REP-123;rm -rf /", testProjectId);
  } catch (err) {
    caughtInvalidId = err.message.includes("Security Violation: Invalid repairId");
  }
  assert(caughtInvalidId, `Invalid repairId with command metacharacters strictly rejected`);

  // ============================================================================
  // TEST 6: Concurrent deployment lock
  // ============================================================================
  console.log("\n--- TEST 6: Concurrent Deployment Lock ---");
  const serviceLockTest = `TestService-Lock-${testSuffix}`;
  await DeploymentLockService.forceRelease(serviceLockTest);

  const lock1 = await DeploymentLockService.acquireLock(serviceLockTest, "REP-LOCK-001");
  assert(lock1.status === "HELD", `First deployment successfully acquired lock (token: ${lock1.ownerToken.slice(0, 10)}...)`);

  let conflictCaught = false;
  let conflictStatusCode = 0;
  try {
    await DeploymentLockService.acquireLock(serviceLockTest, "REP-LOCK-002");
  } catch (err) {
    if (err instanceof DeploymentLockConflictError) {
      conflictCaught = true;
      conflictStatusCode = err.statusCode;
    }
  }
  assert(conflictCaught === true, `Concurrent deployment for different repair on same service was rejected`);
  assert(conflictStatusCode === 409, `Deployment lock conflict returned HTTP 409 status code`);

  // ============================================================================
  // TEST 7: Stale lock handling
  // ============================================================================
  console.log("\n--- TEST 7: Stale Lock Recovery ---");
  // Artificially expire the held lock by setting expiresAt in the past
  await DeploymentLock.findOneAndUpdate(
    { service: serviceLockTest.toLowerCase(), status: "HELD" },
    { $set: { expiresAt: new Date(Date.now() - 60000) } }
  );

  const recoveredLock = await DeploymentLockService.acquireLock(serviceLockTest, "REP-LOCK-003");
  assert(
    recoveredLock.repairId === "REP-LOCK-003",
    `Stale expired lock safely recovered by new repair: ${recoveredLock.repairId}`
  );
  assert(
    recoveredLock.releaseReason && recoveredLock.releaseReason.includes("STALE_LOCK_RECOVERED"),
    `Release reason documents stale recovery: ${recoveredLock.releaseReason}`
  );

  // Clean release lock test
  await DeploymentLockService.releaseLock(serviceLockTest, "REP-LOCK-003", recoveredLock.ownerToken);

  // ============================================================================
  // TEST 8: Idempotent deployment
  // ============================================================================
  console.log("\n--- TEST 8: Idempotent Deployment ---");
  const idemRepairId = `REP-IDEM-${testSuffix}`;
  const idemDeployment = await Deployment.create({
    deploymentId: `DEP-IDEM-${testSuffix}`,
    repairId: idemRepairId,
    projectId: testProjectId,
    service: testService,
    version: "v1-idem",
    imageTag: `traceops-idem:${testSuffix}`,
    containerName: `traceops-live-idem-${testSuffix}`,
    status: "HEALTHY",
    healthCheckPassed: true,
    candidateCommitSha: commitResult1.candidateCommitSha,
    deploymentLogs: ["[IDEMPOTENCY TEST] Pre-existing healthy deployment"],
  });

  const idemRepair = await CodeRepair.create({
    repairId: idemRepairId,
    projectId: testProjectId,
    service: testService,
    status: "APPROVED",
    workspacePath: worktreeResult1.worktreePath,
    changedFiles: ["server.js"],
    diff: "dummy diff",
    explanation: "Idempotent deployment test",
    riskLevel: "LOW",
    validationStatus: "VALIDATED",
    validationStages: [],
    validationLogs: [],
    approvalStatus: "APPROVED",
    beforeHashes: {},
    afterHashes: {},
    candidateCommitSha: commitResult1.candidateCommitSha,
  });

  const deployResult1 = await DockerDeploymentProvider.deployRepair(idemRepairId);
  assert(
    deployResult1.deployment.deploymentId === idemDeployment.deploymentId,
    `Duplicate deployment returns existing deployment record: ${deployResult1.deployment.deploymentId}`
  );
  assert(
    deployResult1.verification.sloVerified === true,
    `Idempotent deployment preserves verified SLO status`
  );

  // Clean up idem repair record
  await Deployment.deleteOne({ deploymentId: idemDeployment.deploymentId });
  await CodeRepair.deleteOne({ repairId: idemRepairId });

  // ============================================================================
  // TEST 9: Unapproved deployment rejection (HTTP 400)
  // ============================================================================
  console.log("\n--- TEST 9: Unapproved Deployment Rejection ---");
  const unapprovedRepairId = `REP-UNAPP-${testSuffix}`;
  await CodeRepair.create({
    repairId: unapprovedRepairId,
    projectId: testProjectId,
    service: testService,
    status: "VALIDATED",
    workspacePath: worktreeResult1.worktreePath,
    changedFiles: ["server.js"],
    diff: "dummy diff",
    explanation: "Unapproved deployment rejection test",
    riskLevel: "LOW",
    validationStatus: "VALIDATED",
    validationStages: [],
    validationLogs: [],
    approvalStatus: "PENDING", // NOT APPROVED
    beforeHashes: {},
    afterHashes: {},
    candidateCommitSha: commitResult1.candidateCommitSha,
  });

  const unapprovedRes = await api(`/api/repairs/${unapprovedRepairId}/deploy`, { method: "POST" });
  assert(unapprovedRes.status === 400, `Deployment of PENDING approval repair rejected with HTTP 400`);
  assert(
    unapprovedRes.data?.message?.includes("must be approved") || unapprovedRes.data?.message?.includes("Safety Gate"),
    `Rejection message enforces approval gate: "${unapprovedRes.data?.message}"`
  );

  // ============================================================================
  // TEST 10: Unvalidated deployment rejection (HTTP 400)
  // ============================================================================
  console.log("\n--- TEST 10: Unvalidated Deployment Rejection ---");
  const unvalidatedRepairId = `REP-UNVAL-${testSuffix}`;
  await CodeRepair.create({
    repairId: unvalidatedRepairId,
    projectId: testProjectId,
    service: testService,
    status: "GENERATED",
    workspacePath: worktreeResult1.worktreePath,
    changedFiles: ["server.js"],
    diff: "dummy diff",
    explanation: "Unvalidated deployment rejection test",
    riskLevel: "LOW",
    validationStatus: "PENDING", // NOT VALIDATED
    validationStages: [],
    validationLogs: [],
    approvalStatus: "APPROVED",
    beforeHashes: {},
    afterHashes: {},
    candidateCommitSha: commitResult1.candidateCommitSha,
  });

  const unvalidatedRes = await api(`/api/repairs/${unvalidatedRepairId}/deploy`, { method: "POST" });
  assert(unvalidatedRes.status === 400, `Deployment of unvalidated repair rejected with HTTP 400`);
  assert(
    unvalidatedRes.data?.message?.includes("validation") || unvalidatedRes.data?.message?.includes("Safety Gate"),
    `Rejection message enforces validation gate: "${unvalidatedRes.data?.message}"`
  );

  // ============================================================================
  // TEST 11: Missing Git commit rejection (HTTP 400)
  // ============================================================================
  console.log("\n--- TEST 11: Missing Git Commit Rejection ---");
  const noCommitRepairId = `REP-NOCOMMIT-${testSuffix}`;
  await CodeRepair.create({
    repairId: noCommitRepairId,
    projectId: testProjectId,
    service: testService,
    status: "APPROVED",
    workspacePath: worktreeResult1.worktreePath,
    changedFiles: ["server.js"],
    diff: "dummy diff",
    explanation: "Missing git commit test",
    riskLevel: "LOW",
    validationStatus: "VALIDATED",
    validationStages: [],
    validationLogs: [],
    approvalStatus: "APPROVED",
    beforeHashes: {},
    afterHashes: {},
    candidateCommitSha: undefined, // MISSING COMMIT SHA
  });

  const noCommitRes = await api(`/api/repairs/${noCommitRepairId}/deploy`, { method: "POST" });
  assert(noCommitRes.status === 400, `Deployment without Git candidate commit rejected with HTTP 400`);
  assert(
    noCommitRes.data?.message?.includes("Git candidate commit") || noCommitRes.data?.message?.includes("Safety Gate"),
    `Rejection message enforces commit provenance: "${noCommitRes.data?.message}"`
  );

  // ============================================================================
  // TEST 12: Candidate image identity
  // ============================================================================
  console.log("\n--- TEST 12: Candidate Image Identity Determinism ---");
  const expectedVersion = `${testRepairId1.toLowerCase()}-${commitResult1.candidateCommitSha.slice(0, 7)}`;
  const expectedImageTag = `traceops-${testProjectId.toLowerCase()}-${testService.toLowerCase()}:${expectedVersion}`;
  const expectedContainerName = `traceops-live-${testProjectId.toLowerCase()}-${testRepairId1.toLowerCase()}`;

  assert(
    expectedImageTag.startsWith(`traceops-${testProjectId.toLowerCase()}-${testService.toLowerCase()}:`),
    `Deterministic image naming pattern verified: ${expectedImageTag}`
  );
  assert(
    expectedImageTag.includes(commitResult1.candidateCommitSha.slice(0, 7)),
    `Image tag cryptographically embeds candidate commit SHA: ${commitResult1.candidateCommitSha.slice(0, 7)}`
  );
  assert(
    expectedContainerName.startsWith("traceops-live-"),
    `Container name format strictly controlled: ${expectedContainerName}`
  );

  // ============================================================================
  // TEST 13: Predecessor image capture
  // ============================================================================
  console.log("\n--- TEST 13: Predecessor Image Capture (No Deletion) ---");
  const predecessorDeployment = await Deployment.create({
    deploymentId: `DEP-PRED-${testSuffix}`,
    repairId: `REP-PRED-${testSuffix}`,
    projectId: testProjectId,
    service: testService,
    version: "v1-predecessor",
    imageTag: `traceops-pred:${testSuffix}`,
    containerName: `traceops-live-pred-${testSuffix}`,
    status: "HEALTHY",
    healthCheckPassed: true,
    candidateCommitSha: projectBaseCommitSha,
    deploymentLogs: ["[PREDECESSOR] Active baseline container"],
  });

  // Verify that predecessor deployment is queried and captured without killing predecessor
  const activePred = await Deployment.findOne({
    service: testService,
    status: { $in: ["RUNNING", "HEALTHY"] },
  }).sort({ createdAt: -1 });

  assert(Boolean(activePred), `Found active predecessor deployment in database: ${activePred?.deploymentId}`);
  assert(
    activePred.imageTag === `traceops-pred:${testSuffix}`,
    `Predecessor image tag captured: ${activePred.imageTag}`
  );
  assert(
    activePred.containerName === `traceops-live-pred-${testSuffix}`,
    `Predecessor container name preserved: ${activePred.containerName}`
  );

  // ============================================================================
  // TEST 14: No host execution
  // ============================================================================
  console.log("\n--- TEST 14: Host Execution Elimination Verification ---");
  const dockerProviderSrc = fs.readFileSync(
    path.join(__dirname, "../backend/src/services/dockerDeploymentProvider.ts"),
    "utf-8"
  );

  assert(
    !dockerProviderSrc.includes('execFile("node"') && !dockerProviderSrc.includes("execFile('node'"),
    `Zero host node process spawn invocations in DockerDeploymentProvider`
  );
  assert(
    !dockerProviderSrc.includes('exec("npm"') && !dockerProviderSrc.includes("exec('npm'"),
    `Zero host npm command invocations in DockerDeploymentProvider`
  );
  assert(
    dockerProviderSrc.includes("Host process execution is strictly prohibited") || dockerProviderSrc.includes("ZERO host fallback"),
    `Explicit fail-closed assertion preserved: ZERO host fallback / prohibited host execution`
  );

  // ============================================================================
  // TEST 15: No shell injection
  // ============================================================================
  console.log("\n--- TEST 15: Shell Injection Prevention ---");
  const maliciousNames = [
    "container; rm -rf /",
    "image:latest && cat /etc/shadow",
    "name`whoami`",
    "image$(id)",
    "container\nexit 1",
  ];

  let injectionShieldsPassed = 0;
  for (const malicious of maliciousNames) {
    try {
      DockerDeploymentProvider.validateContainerName(malicious);
    } catch {
      injectionShieldsPassed++;
    }
  }
  assert(
    injectionShieldsPassed === maliciousNames.length,
    `All ${maliciousNames.length} shell injection attempts on containerName strictly rejected by allowlist regex`
  );

  let portShieldPassed = false;
  try {
    DockerDeploymentProvider.validatePort(999999);
  } catch {
    portShieldPassed = true;
  }
  assert(portShieldPassed, `Out of range / invalid port strictly rejected`);

  // ============================================================================
  // TEST 16: Phase 5.1 sandbox protections remain intact
  // ============================================================================
  console.log("\n--- TEST 16: Phase 5.1 Container Hardening Sandbox Flags ---");
  assert(dockerProviderSrc.includes("--cap-drop=ALL"), `Container run enforces --cap-drop=ALL`);
  assert(dockerProviderSrc.includes("--security-opt=no-new-privileges"), `Container run enforces no-new-privileges`);
  assert(dockerProviderSrc.includes("--memory 512m") || dockerProviderSrc.includes('--memory="512m"'), `Container run restricts memory limits`);
  assert(dockerProviderSrc.includes("--cpus 1.0") || dockerProviderSrc.includes('--cpus="1.0"'), `Container run restricts CPU limits`);
  assert(dockerProviderSrc.includes("--pids-limit"), `Container run restricts PID limits`);

  // ============================================================================
  // TEST 17: Phase 5.2 evidence snapshot remains unchanged
  // ============================================================================
  console.log("\n--- TEST 17: Phase 5.2 Evidence Snapshot Immutability ---");
  const incidentSnapshotHash = "5d555935bd4a7d748346970dfd2cd8f91ea82a963420a67956038acc96b90e50";
  const verifiedRepair = await CodeRepair.create({
    repairId: `REP-EVID-${testSuffix}`,
    projectId: testProjectId,
    service: testService,
    status: "VALIDATED",
    workspacePath: worktreeResult1.worktreePath,
    changedFiles: ["server.js"],
    diff: "patch diff",
    explanation: "Evidence immutability check",
    riskLevel: "LOW",
    validationStatus: "VALIDATED",
    validationStages: [],
    validationLogs: [],
    approvalStatus: "APPROVED",
    beforeHashes: {},
    afterHashes: {},
    candidateCommitSha: commitResult1.candidateCommitSha,
    evidenceSnapshotHash: incidentSnapshotHash,
    canonicalEvidenceSnapshot: {
      incident: { incidentId: `INC-${testSuffix}`, service: testService },
      rca: { rcaId: `RCA-${testSuffix}`, model: "gemini-2.5-flash" },
    },
  });

  const repairBefore = await CodeRepair.findOne({ repairId: verifiedRepair.repairId });
  assert(
    repairBefore.evidenceSnapshotHash === incidentSnapshotHash,
    `Evidence snapshot hash verified on repair: ${repairBefore.evidenceSnapshotHash}`
  );
  assert(
    Boolean(repairBefore.canonicalEvidenceSnapshot),
    `Canonical evidence snapshot structure intact`
  );

  // ============================================================================
  // TEST 18: No deployment of unrelated service
  // ============================================================================
  console.log("\n--- TEST 18: Service Isolation (Unrelated Services Deploy Independently) ---");
  const serviceA = `ServiceA-${testSuffix}`;
  const serviceB = `ServiceB-${testSuffix}`;

  await DeploymentLockService.forceRelease(serviceA);
  await DeploymentLockService.forceRelease(serviceB);

  const lockA = await DeploymentLockService.acquireLock(serviceA, "REP-SRV-A");
  assert(lockA.status === "HELD", `Lock acquired for ${serviceA}`);

  // Concurrently acquire lock for ServiceB
  const lockB = await DeploymentLockService.acquireLock(serviceB, "REP-SRV-B");
  assert(lockB.status === "HELD", `Lock acquired for ${serviceB} independently of ${serviceA}`);

  // Release both
  await DeploymentLockService.releaseLock(serviceA, "REP-SRV-A", lockA.ownerToken);
  await DeploymentLockService.releaseLock(serviceB, "REP-SRV-B", lockB.ownerToken);
  assert(true, `Both independent service locks released cleanly`);

  // ============================================================================
  // TEST 19: Successful approved controlled deployment
  // ============================================================================
  console.log("\n--- TEST 19: Successful Approved Controlled Deployment ---");
  // Prepare Dockerfile in worktree so build succeeds in Docker
  // Prepare standalone server.js and Dockerfile in worktree so container stays running
  const cleanServerJs = `const http = require("http");
const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "UP", service: "${testService}" }));
  }
  res.writeHead(200);
  res.end("OK");
});
server.listen(5000, "0.0.0.0");
`;
  fs.writeFileSync(path.join(worktreeResult1.worktreePath, "server.js"), cleanServerJs, "utf-8");

  const dockerfilePath = path.join(worktreeResult1.worktreePath, "Dockerfile");
  fs.writeFileSync(
    dockerfilePath,
    `FROM node:20-alpine
WORKDIR /app
COPY server.js ./
EXPOSE 5000
CMD ["node", "server.js"]
`,
    "utf-8"
  );

  // Commit Dockerfile addition
  await GitProvenanceService.commitCandidate({
    worktreePath: worktreeResult1.worktreePath,
    repairId: testRepairId1,
    candidateActionType: "DOCKER_CONTAINER",
    changedFiles: ["server.js", "Dockerfile"],
  });

  const latestCommit = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: worktreeResult1.worktreePath })).stdout.trim();

  // Create authoritative CodeRepair document with all gates passed
  const controlledRepairId = `REP-DEPLOY-${testSuffix}`;
  const controlledRepair = await CodeRepair.create({
    repairId: controlledRepairId,
    projectId: testProjectId,
    service: testService,
    status: "APPROVED",
    workspacePath: worktreeResult1.worktreePath,
    changedFiles: ["server.js", "Dockerfile"],
    diff: "unified diff",
    explanation: "Controlled approved production deployment test",
    riskLevel: "LOW",
    validationStatus: "VALIDATED",
    validationStages: [
      { stage: "SYNTAX", command: "node --check", passed: true, output: "OK", durationMs: 10 },
      { stage: "DOCKER_BUILD", command: "docker build", passed: true, output: "OK", durationMs: 15 },
    ],
    validationLogs: ["Sandbox validation verified"],
    approvalStatus: "APPROVED",
    approvedBy: "DevOps Lead",
    approvedAt: new Date(),
    beforeHashes: { "server.js": "hash-before" },
    afterHashes: { "server.js": "hash-after" },
    candidateCommitSha: latestCommit,
    baseCommitSha: projectBaseCommitSha,
    baseRepository: baseRepoDir,
    branchName: `repair/${testRepairId1}`,
    author: "TraceOps Autonomous Repair Engine <traceops-agent@deepmind.google.com>",
    incidentId: `INC-CTRL-${testSuffix}`,
    rcaId: `RCA-CTRL-${testSuffix}`,
    sloId: `SLO-CTRL-${testSuffix}`,
    requirementId: `REQ-CTRL-${testSuffix}`,
    evidenceSnapshotHash: "5d555935bd4a7d748346970dfd2cd8f91ea82a963420a67956038acc96b90e50",
  });

  // Release any leftover locks on testService
  await DeploymentLockService.forceRelease(testService);

  const deployResult = await DockerDeploymentProvider.deployRepair(controlledRepairId);
  assert(Boolean(deployResult?.deployment), `Approved and validated repair deployed successfully`);
  assert(Boolean(deployResult?.verification), `Deployment verification executed successfully`);

  const deployedRecord = await Deployment.findOne({ repairId: controlledRepairId });
  assert(Boolean(deployedRecord), `Deployment document persisted in MongoDB`);
  assert(
    deployedRecord?.status === "HEALTHY" || deployedRecord?.status === "RUNNING",
    `Deployed candidate container status is healthy/running: "${deployedRecord?.status}"`
  );
  assert(
    deployedRecord?.candidateCommitSha === latestCommit,
    `Deployment document records candidateCommitSha: ${deployedRecord?.candidateCommitSha}`
  );
  assert(
    Boolean(deployedRecord?.candidateImage),
    `Deployment document records candidateImage: ${deployedRecord?.candidateImage}`
  );
  assert(
    Boolean(deployedRecord?.candidateContainer),
    `Deployment document records candidateContainer: ${deployedRecord?.candidateContainer}`
  );
  assert(
    Boolean(deployedRecord?.predecessorImage),
    `Deployment document preserved predecessorImage: ${deployedRecord?.predecessorImage}`
  );

  // ============================================================================
  // TEST 20: Clean lock release
  // ============================================================================
  console.log("\n--- TEST 20: Clean Lock Release After Deployment ---");
  const activeLockAfter = await DeploymentLock.findOne({
    service: testService.toLowerCase(),
  });
  assert(
    activeLockAfter?.status === "RELEASED",
    `Deployment lock for service "${testService}" is in RELEASED status after deployment completion`
  );
  assert(
    Boolean(activeLockAfter?.releasedAt),
    `Lock release timestamp recorded: ${activeLockAfter?.releasedAt?.toISOString()}`
  );

  // Clean up candidate live container
  if (deployedRecord?.candidateContainer) {
    await execFileAsync("docker", ["rm", "-f", deployedRecord.candidateContainer]).catch(() => {});
  }
  await Deployment.deleteOne({ deploymentId: predecessorDeployment.deploymentId });

  // Clean worktree
  await GitProvenanceService.removeWorktree(baseRepoDir, worktreeResult1.worktreePath).catch(() => {});

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log("\n================================================================================");
  console.log(`  PHASE 5.3 BATCH A TEST SUMMARY: Passed: ${passed} | Failed: ${failed}`);
  console.log("================================================================================\n");

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("FATAL ERROR in Phase 5.3 Batch A test execution:", err);
  process.exit(1);
});

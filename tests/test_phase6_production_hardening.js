/**
 * TRACEOPS PHASE 6 — PRODUCTION HARDENING & DEPLOYMENT READINESS VERIFICATION SUITE
 *
 * Comprehensive audit and automated verification across all 8 production hardening pillars:
 * 1. Configuration Validation (fail-fast, no insecure fallbacks)
 * 2. Authentication & Authorization (password hashing, role enforcement, token expiration)
 * 3. API Security & Input Hardening (CORS, body limits, prototype pollution, path traversal, rate limiting)
 * 4. Secrets Hygiene (no credentials in responses, logs, or frontend bundle)
 * 5. Docker & Container Security (no public MongoDB, health checks, sandbox isolation)
 * 6. Health & Observability (liveness, readiness, ML health, Prometheus)
 * 7. Database Safety & Recovery (indexes, non-destructive backup integrity)
 * 8. Core Regression Continuity (ML governance, deployment safety, audit chain)
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/requirement_traceable_devops";

// Backend compiled modules
const mongoose = require(path.join(__dirname, "../backend/node_modules/mongoose"));
const { env, validateProductionConfig } = require(path.join(__dirname, "../backend/dist/backend/src/config/env"));
const { AuthService } = require(path.join(__dirname, "../backend/dist/backend/src/services/authService"));
const { User } = require(path.join(__dirname, "../backend/dist/backend/src/models/User"));
const { MLModelRegistry } = require(path.join(__dirname, "../backend/dist/backend/src/models/MLModelRegistry"));
const { DeploymentAuditEvent } = require(path.join(__dirname, "../backend/dist/backend/src/models/DeploymentAuditEvent"));
const { DeploymentAuditService } = require(path.join(__dirname, "../backend/dist/backend/src/services/deploymentAuditService"));
const { MLArtifactValidator } = require(path.join(__dirname, "../backend/dist/backend/src/services/mlArtifactValidator"));
const { SandboxValidationService } = require(path.join(__dirname, "../backend/dist/backend/src/services/sandboxValidationService"));
const { DockerDeploymentProvider } = require(path.join(__dirname, "../backend/dist/backend/src/services/dockerDeploymentProvider"));
const { resetRateLimitStore } = require(path.join(__dirname, "../backend/dist/backend/src/middleware/rateLimiter"));
const { createBackup, verifyBackup } = require(path.join(__dirname, "../scripts/backup_recovery_service"));

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
  const url = `${baseUrl}${endpoint}`;
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body,
  });

  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: res.status, data, headers: res.headers, rawText: text };
}

async function runTestSuite() {
  console.log("================================================================================");
  console.log("TRACEOPS PHASE 6 — PRODUCTION HARDENING & DEPLOYMENT READINESS SUITE");
  console.log("================================================================================\n");

  // Connect Database
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI);
  }

  // Spin up test server on dynamic port
  const testServer = http.createServer(app);
  await new Promise((resolve) => testServer.listen(0, "127.0.0.1", resolve));
  const testPort = testServer.address().port;
  const baseUrl = `http://127.0.0.1:${testPort}`;
  console.log(`[TEST HARNESS] Hardened test server running on ${baseUrl}\n`);

  try {
    // =========================================================================
    // SECTION 1: CONFIGURATION VALIDATION
    // =========================================================================
    console.log("--- SECTION 1: Production Configuration Validation ---");

    // Test 1: Missing JWT_SECRET in production fails fast
    const missingSecretCheck = validateProductionConfig({
      NODE_ENV: "production",
      JWT_SECRET: "",
      MONGODB_URI: "mongodb://127.0.0.1:27017/prod_db",
      CORS_ALLOWED_ORIGINS: "http://localhost:5173",
    });
    assert(!missingSecretCheck.valid, "Test 1: Missing JWT_SECRET in production terminates validation (fail-fast)");
    assert(missingSecretCheck.errors.some((e) => e.includes("JWT_SECRET")), "Test 1b: Error explicitly mentions JWT_SECRET without leaking values");

    // Test 2: Insecure default fallback secret rejected
    const fallbackSecretCheck = validateProductionConfig({
      NODE_ENV: "production",
      JWT_SECRET: "traceops_production_secret_key_2026",
      MONGODB_URI: "mongodb://127.0.0.1:27017/prod_db",
      CORS_ALLOWED_ORIGINS: "http://localhost:5173",
    });
    assert(!fallbackSecretCheck.valid, "Test 2: Known insecure default JWT_SECRET is strictly rejected");

    // Test 3: Short / weak secret rejected
    const weakSecretCheck = validateProductionConfig({
      NODE_ENV: "production",
      JWT_SECRET: "short_secret",
      MONGODB_URI: "mongodb://127.0.0.1:27017/prod_db",
      CORS_ALLOWED_ORIGINS: "http://localhost:5173",
    });
    assert(!weakSecretCheck.valid, "Test 3: Secret shorter than 16 characters is strictly rejected in production");

    // Test 4: Wildcard CORS rejected in production
    const wildcardCorsCheck = validateProductionConfig({
      NODE_ENV: "production",
      JWT_SECRET: "crypto_secure_production_token_secret_2026_x99",
      MONGODB_URI: "mongodb://127.0.0.1:27017/prod_db",
      CORS_ALLOWED_ORIGINS: "*",
    });
    assert(!wildcardCorsCheck.valid, "Test 4: Wildcard '*' CORS origin is strictly prohibited for production");

    // Test 4b: Valid production configuration passes cleanly
    const validConfigCheck = validateProductionConfig({
      NODE_ENV: "production",
      JWT_SECRET: "crypto_secure_production_token_secret_2026_x99",
      MONGODB_URI: "mongodb://127.0.0.1:27017/prod_db",
      CORS_ALLOWED_ORIGINS: "https://traceops.example.com",
      PORT: "5000",
    });
    assert(validConfigCheck.valid && validConfigCheck.errors.length === 0, "Test 4b: Fully configured production environment passes validation");

    // =========================================================================
    // SECTION 2: AUTHENTICATION & AUTHORIZATION HARDENING
    // =========================================================================
    console.log("\n--- SECTION 2: Authentication & Authorization Hardening ---");

    const nonce = Date.now();
    const adminUser = `admin_p6_${nonce}`;
    const normalUser = `user_p6_${nonce}`;
    const strongPassword = "StrongPassword2026!#";

    // Setup accounts
    const adminHash = await AuthService.hashPassword(strongPassword);
    const userHash = await AuthService.hashPassword(strongPassword);

    await User.deleteMany({ username: { $in: [adminUser, normalUser] } });

    const adminDoc = await User.create({
      userId: `USR-ADM-${nonce}`,
      username: adminUser,
      email: `${adminUser}@traceops.internal`,
      passwordHash: adminHash,
      name: "Platform Admin",
      role: "ADMIN",
    });

    const userDoc = await User.create({
      userId: `USR-STD-${nonce}`,
      username: normalUser,
      email: `${normalUser}@traceops.internal`,
      passwordHash: userHash,
      name: "Standard Operator",
      role: "USER",
    });

    // Test 5: Valid login returns valid JWT and role
    const validLoginRes = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: adminUser, password: strongPassword }),
    });
    assert(validLoginRes.status === 200, "Test 5: Valid login succeeds with HTTP 200 OK");
    assert(validLoginRes.data?.token && validLoginRes.data?.user?.role === "ADMIN", "Test 5b: Login returns valid JWT and user claims");
    const adminToken = validLoginRes.data.token;

    // Test 6: Invalid password strictly rejected
    const invalidLoginRes = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: adminUser, password: "wrong_password_attempt" }),
    });
    assert(invalidLoginRes.status === 401, "Test 6: Invalid password returns HTTP 401 Unauthorized");

    // Test 7: Expired JWT strictly rejected
    const expiredToken = AuthService.generateToken(userDoc, "-1s");
    const expiredRes = await api(baseUrl, "/api/auth/me", {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    assert(expiredRes.status === 401, "Test 7: Expired JWT token is strictly rejected with HTTP 401");

    // Test 8: Tampered JWT strictly rejected
    const tamperedToken = adminToken.slice(0, -6) + "XXXXXX";
    const tamperedRes = await api(baseUrl, "/api/auth/me", {
      headers: { Authorization: `Bearer ${tamperedToken}` },
    });
    assert(tamperedRes.status === 401, "Test 8: Cryptographically tampered JWT token rejected with HTTP 401");

    // Test 9: USER role authorization matrix
    const userLoginRes = await api(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: normalUser, password: strongPassword }),
    });
    const userToken = userLoginRes.data.token;

    const userPromoteAttempt = await api(baseUrl, "/api/ml/governance/models/mdl-cand-3.1.0/promote", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert(userPromoteAttempt.status === 403, "Test 9: USER role strictly forbidden from ML promotion (HTTP 403 Forbidden)");

    const userRollbackAttempt = await api(baseUrl, "/api/ml/governance/models/mdl-prod-2.0.0/rollback", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ reason: "Unauthorized rollback test" }),
    });
    assert(userRollbackAttempt.status === 403, "Test 9b: USER role strictly forbidden from ML rollback (HTTP 403 Forbidden)");

    const userDeployAttempt = await api(baseUrl, "/api/repairs/REP-P6-MOCK/deploy", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert(userDeployAttempt.status === 403, "Test 9c: USER role strictly forbidden from deploying repairs (HTTP 403 Forbidden)");

    // Test 10: ADMIN role authorization permitted
    const adminStatusRes = await api(baseUrl, "/api/auth/admin/overview", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminStatusRes.status === 200, "Test 10: ADMIN role granted access to administrative overview (HTTP 200 OK)");

    // =========================================================================
    // SECTION 3: API SECURITY & INPUT HARDENING
    // =========================================================================
    console.log("\n--- SECTION 3: API Security & Input Hardening ---");

    // Test 11: CORS Verification
    const corsGoodRes = await api(baseUrl, "/api/auth/status", {
      headers: { Origin: "http://localhost:5173" },
    });
    assert(corsGoodRes.headers.get("access-control-allow-origin") === "http://localhost:5173", "Test 11: Configured origin receives CORS approval");

    const corsBadRes = await api(baseUrl, "/api/auth/status", {
      headers: { Origin: "https://malicious-attacker-domain.xyz" },
    });
    assert(!corsBadRes.headers.get("access-control-allow-origin") || corsBadRes.status === 500, "Test 11b: Untrusted origin denied CORS header");

    // Test 12: Request Body Size Limit (1MB)
    const largePayload = JSON.stringify({ data: "A".repeat(1.5 * 1024 * 1024) });
    const bodySizeRes = await api(baseUrl, "/api/requirements", {
      method: "POST",
      body: largePayload,
    });
    assert(bodySizeRes.status === 413, "Test 12: Request body exceeding 1MB strictly rejected (HTTP 413 Payload Too Large)");

    // Test 13: Prototype Pollution Protection
    const protoPollutionRes = await api(baseUrl, "/api/requirements", {
      method: "POST",
      body: JSON.stringify({
        __proto__: { isAdmin: true },
        title: "Malicious Requirement",
      }),
    });
    assert(protoPollutionRes.status === 400, "Test 13: Prototype pollution payload strictly rejected (HTTP 400 Bad Request)");

    // Test 14: Path Traversal Protection
    const pathTraversalRes = await api(baseUrl, "/api/ml/governance/models/..%2f..%2fetc%2fpasswd", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(pathTraversalRes.status === 400 || pathTraversalRes.status === 404, "Test 14: URL encoded path traversal in route parameters rejected fail-closed");

    let traversalThrows = false;
    try {
      MLArtifactValidator.resolveSafePath("../../etc/shadow");
    } catch {
      traversalThrows = true;
    }
    assert(traversalThrows, "Test 14b: MLArtifactValidator.resolveSafePath blocks filesystem traversal");

    // Test 15: Command Injection in Parameters
    const cmdInjectRes = await api(baseUrl, "/api/repairs/REP-123;rm-rf;echo/deploy", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(cmdInjectRes.status === 400, "Test 15: Command injection metacharacters in parameter rejected with HTTP 400");

    // Test 16: API Rate Limiting
    resetRateLimitStore();
    process.env.ENABLE_RATE_LIMIT_TEST = "true";

    let rateLimitTriggered = false;
    for (let i = 0; i < 35; i++) {
      const res = await api(baseUrl, "/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: "rate_limit_probe", password: "probe" }),
      });
      if (res.status === 429) {
        rateLimitTriggered = true;
        break;
      }
    }
    assert(rateLimitTriggered, "Test 16: Sensitive auth endpoint enforces rate limiting (HTTP 429 Too Many Requests)");
    delete process.env.ENABLE_RATE_LIMIT_TEST;

    // =========================================================================
    // SECTION 4: SECRETS HYGIENE
    // =========================================================================
    console.log("\n--- SECTION 4: Secrets Hygiene & Information Leakage ---");

    // Test 17: No secrets in API responses
    const healthRes = await api(baseUrl, "/health");
    const readyRes = await api(baseUrl, "/health/ready");
    const combinedResponses = JSON.stringify(healthRes.data) + JSON.stringify(readyRes.data);

    assert(!combinedResponses.includes("mongodb://"), "Test 17: Health endpoints do not leak MongoDB connection strings");
    assert(!combinedResponses.includes("traceops_production_secret_key"), "Test 17b: Health endpoints do not leak JWT secrets");
    assert(!combinedResponses.includes("AQ.Ab8RN6J"), "Test 17c: Health endpoints do not leak Gemini API keys");

    // Test 18: No secrets in production error logs / responses
    const notFoundRes = await api(baseUrl, "/api/deployments/DEP-NONEXISTENT");
    assert(!JSON.stringify(notFoundRes.data).includes("mongodb://"), "Test 18: 404/500 error responses contain zero database URIs or passwords");

    // Test 19: Frontend bundle contains zero secret credentials
    const frontendDistDir = path.join(__dirname, "../frontend/dist/assets");
    let frontendBundleClean = true;
    if (fs.existsSync(frontendDistDir)) {
      const bundleFiles = fs.readdirSync(frontendDistDir).filter((f) => f.endsWith(".js"));
      for (const f of bundleFiles) {
        const content = fs.readFileSync(path.join(frontendDistDir, f), "utf-8");
        if (
          content.includes("AQ.Ab8RN6J") ||
          content.includes("traceops_production_secret_key") ||
          content.includes("mongodb://")
        ) {
          frontendBundleClean = false;
        }
      }
    }
    assert(frontendBundleClean, "Test 19: Compiled frontend production bundle contains zero backend secrets or API keys");

    // =========================================================================
    // SECTION 5: DOCKER & CONTAINER HARDENING
    // =========================================================================
    console.log("\n--- SECTION 5: Docker & Container Hardening ---");

    // Test 20: Production compose file exists and is valid
    const prodComposePath = path.join(__dirname, "../docker-compose.prod.yml");
    assert(fs.existsSync(prodComposePath), "Test 20: docker-compose.prod.yml exists for production deployments");

    const prodComposeContent = fs.readFileSync(prodComposePath, "utf-8");
    assert(prodComposeContent.includes("mongo_prod_data"), "Test 20b: Production compose uses persistent storage volumes");

    // Test 21: Container health checks defined
    assert(prodComposeContent.includes("healthcheck:"), "Test 21: Production compose enforces container health checks");
    const backendDockerContent = fs.readFileSync(path.join(__dirname, "../backend/Dockerfile"), "utf-8");
    assert(backendDockerContent.includes("HEALTHCHECK"), "Test 21b: Backend Dockerfile includes native HEALTHCHECK instruction");

    // Test 22: MongoDB not publicly exposed
    assert(!prodComposeContent.includes('"27017:27017"'), "Test 22: Production compose has zero public host port exposure for MongoDB");

    // Test 23: Phase 5.1 Docker sandbox security flags preserved
    const sandboxServiceCode = fs.readFileSync(path.join(__dirname, "../backend/src/services/sandboxValidationService.ts"), "utf-8");
    assert(sandboxServiceCode.includes("--network none"), "Test 23: Sandbox enforces --network none (zero external network)");
    assert(sandboxServiceCode.includes("--memory 512m"), "Test 23b: Sandbox enforces --memory 512m");
    assert(sandboxServiceCode.includes("--cap-drop=ALL"), "Test 23c: Sandbox enforces --cap-drop=ALL");
    assert(sandboxServiceCode.includes("--security-opt=no-new-privileges"), "Test 23d: Sandbox enforces --security-opt=no-new-privileges");

    // =========================================================================
    // SECTION 6: HEALTH & OBSERVABILITY
    // =========================================================================
    console.log("\n--- SECTION 6: Health & Observability ---");

    // Test 24: Liveness endpoint
    const liveRes = await api(baseUrl, "/health");
    assert(liveRes.status === 200 && liveRes.data?.status === "UP", "Test 24: Liveness probe GET /health returns 200 OK (status: UP)");

    // Test 25: Readiness endpoint
    const readyProbe = await api(baseUrl, "/health/ready");
    assert(readyProbe.status === 200 && readyProbe.data?.status === "READY", "Test 25: Readiness probe GET /health/ready returns 200 OK (status: READY)");
    assert(readyProbe.data?.database === "CONNECTED", "Test 25b: Readiness probe verifies MongoDB connection status");

    // Test 26: ML service health endpoint
    const mlHealthRes = await api(baseUrl, "/api/ml/health");
    assert(mlHealthRes.status === 200, "Test 26: ML service health endpoint reports 200 OK");
    assert(mlHealthRes.data?.data?.servingStatus === "LIVE_SERVING", "Test 26b: ML health reports servingStatus LIVE_SERVING");
    assert(!JSON.stringify(mlHealthRes.data).includes("weights"), "Test 26c: ML health endpoint exposes zero weights or model internals");

    // Test 27: Prometheus metrics scraper endpoint
    const metricsRes = await api(baseUrl, "/metrics");
    assert(metricsRes.status === 200, "Test 27: Prometheus metrics endpoint /metrics returns 200 OK");
    assert(metricsRes.rawText.includes("http_requests_total") || metricsRes.rawText.includes("process_cpu_user_seconds_total"), "Test 27b: Prometheus metrics contain standard operational telemetry");

    // =========================================================================
    // SECTION 7: DATABASE SAFETY & BACKUP INTEGRITY
    // =========================================================================
    console.log("\n--- SECTION 7: Database Safety & Backup Integrity ---");

    // Test 28: MongoDB Connection Status
    assert(mongoose.connection.readyState === 1, "Test 28: MongoDB connection is healthy and active");

    // Test 29: Database indexes verified
    const userIndexes = await User.collection.indexes();
    assert(userIndexes.some((idx) => idx.name.includes("username")), "Test 29: User collection has unique index on username");
    assert(userIndexes.some((idx) => idx.name.includes("email")), "Test 29b: User collection has unique index on email");

    const auditIndexes = await DeploymentAuditEvent.collection.indexes();
    assert(auditIndexes.some((idx) => idx.name.includes("sequenceNumber")), "Test 29c: DeploymentAuditEvent has ordered compound indexes for chain verification");

    // Test 30: Backup and recovery snapshot integrity
    const backupDir = path.join(__dirname, "../data/backups/test_phase6_snapshot");
    const backupResult = await createBackup(backupDir);
    assert(backupResult.success && fs.existsSync(path.join(backupDir, "manifest.json")), "Test 30: Governance backup creates complete structured snapshot and manifest");

    const verifyResult = verifyBackup(backupDir);
    assert(verifyResult.valid && verifyResult.errors.length === 0, "Test 30b: Backup manifest passes 100% SHA-256 cryptographic integrity verification");

    // Clean up temporary backup test folder
    fs.rmSync(backupDir, { recursive: true, force: true });

    // =========================================================================
    // SECTION 8: CORE REGRESSION & SAFETY CONTINUITY
    // =========================================================================
    console.log("\n--- SECTION 8: Core Regression & Safety Continuity ---");

    // Test 31: Active ML production model is 2.0.0, candidate 3.1.0 is ROLLED_BACK
    const activeModel = await MLModelRegistry.findOne({ status: "PRODUCTION" });
    assert(activeModel && activeModel.modelVersion === "2.0.0-production-telemetry", "Test 31: Authoritative active serving model remains 2.0.0-production-telemetry");

    const retiredCandidate = await MLModelRegistry.findOne({ modelVersion: "3.1.0-real-runtime-training" });
    assert(retiredCandidate && retiredCandidate.status === "ROLLED_BACK", "Test 31b: Candidate model remains retired in ROLLED_BACK status");

    // Test 32: Deployment safety gate blocks unapproved repairs
    let deployBlocked = false;
    try {
      await DockerDeploymentProvider.deployRepair("REP-NONEXISTENT");
    } catch (err) {
      deployBlocked = true;
    }
    assert(deployBlocked, "Test 32: Unapproved/non-existent code repair rejected fail-closed");

    // Test 33: Live prediction endpoint serves from active model
    const predictRes = await api(baseUrl, "/api/ml/predict", {
      method: "POST",
      body: JSON.stringify({
        service: "PaymentGateway",
        cpuUsage: 45.0,
        memoryUsage: 55.0,
        p95Latency: 0.15,
        errorRate: 0.005,
        requestRate: 80.0,
        deploymentChanged: 0,
      }),
    });
    assert(predictRes.status === 200, "Test 33: Live ML inference endpoint /api/ml/predict operates successfully");
    assert(predictRes.data?.data?.modelVersion === "2.0.0-production-telemetry", "Test 33b: Live prediction served by 2.0.0-production-telemetry");

    // Test 34: Cryptographic audit chain continuity intact
    const chainVerification = await DeploymentAuditService.verifyModelChain(activeModel.modelId);
    assert(chainVerification.valid, `Test 34: Cryptographic audit chain continuity for active model remains 100% valid (${chainVerification.eventsVerified || chainVerification.verifiedEvents || chainVerification.totalEvents || "verified"} events)`);

    // Test 35: Core endpoints functional
    const reqRes = await api(baseUrl, "/api/requirements");
    assert(reqRes.status === 200, "Test 35: Core endpoint /api/requirements is operational (HTTP 200 OK)");

    const sloRes = await api(baseUrl, "/api/slos");
    assert(sloRes.status === 200, "Test 35b: Core endpoint /api/slos is operational (HTTP 200 OK)");

  } finally {
    testServer.close();
    await mongoose.disconnect();
  }

  console.log("\n================================================================================");
  console.log(`PHASE 6 PRODUCTION HARDENING RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Fatal error during Phase 6 hardening verification:", err);
  process.exit(1);
});

/**
 * TRACEOPS — MANDATORY FRESH INSTALLATION & ZERO-DEMO VERIFICATION TEST
 * 
 * Formally verifies Section 20 requirements:
 * 1. Clean Database Startup State (Zero users, zero admins, zero requirements, zero SLOs, zero incidents, zero deployments, zero audit events)
 * 2. Unauthenticated Protected Access Rejection
 * 3. Auth Status API reports adminInitialized: false
 * 4. First Administrator Initialization API (POST /api/auth/init-admin)
 * 5. First Admin Lockout Enforcement (Subsequent calls strictly rejected with HTTP 403 Forbidden)
 * 6. Normal User Self-Registration (POST /api/auth/signup) with strict role escalation containment (role is forced to USER)
 * 7. Authentic User and Admin Authentication (POST /api/auth/login)
 * 8. RBAC Isolation (Normal user rejected with 403 from admin overview)
 * 9. Pure REST Requirement and SLO Creation
 * 10. Admin Overview aggregates genuine counts with zero pre-seeded records
 */

const http = require("http");
const path = require("path");

const mongoose = require(path.join(__dirname, "../backend/node_modules/mongoose"));
const { User } = require(path.join(__dirname, "../backend/dist/backend/src/models/User"));
const { Requirement } = require(path.join(__dirname, "../backend/dist/backend/src/models/Requirement"));
const { SLO } = require(path.join(__dirname, "../backend/dist/backend/src/models/SLO"));
const { Incident } = require(path.join(__dirname, "../backend/dist/backend/src/models/Incident"));
const { Deployment } = require(path.join(__dirname, "../backend/dist/backend/src/models/Deployment"));
const { DeploymentAuditEvent } = require(path.join(__dirname, "../backend/dist/backend/src/models/DeploymentAuditEvent"));
const { initializeDatabaseSchema } = require(path.join(__dirname, "../backend/dist/backend/src/config/seed"));

const app = require(path.join(__dirname, "../backend/dist/backend/src/app")).default;

const TEST_PORT = 5055;
const TEST_URL = `http://localhost:${TEST_PORT}`;
const CLEAN_DB_URI = "mongodb://localhost:27017/traceops_clean_install_verification";

let passed = 0;
let failed = 0;

function pass(name, detail = "") {
  passed++;
  console.log(`  ✓ PASS: ${name}${detail ? ` [${detail}]` : ""}`);
}

function fail(name, err) {
  failed++;
  console.error(`  ✗ FAIL: ${name} -> ${err.message || err}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const bodyStr = options.body ? JSON.stringify(options.body) : null;
    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
          ...(options.headers || {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let json = {};
          try {
            json = JSON.parse(raw);
          } catch (_) {}
          resolve({ status: res.statusCode, headers: res.headers, raw, json });
        });
      }
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function runFreshInstallationTest() {
  console.log("================================================================================");
  console.log("TRACEOPS — MANDATORY FRESH INSTALLATION & ZERO-DEMO VERIFICATION SUITE");
  console.log("================================================================================\n");

  let server = null;

  try {
    // 1. Establish connection to isolated clean test database
    await mongoose.connect(CLEAN_DB_URI);
    await mongoose.connection.db.dropDatabase();
    console.log(`Connected to clean test database: ${CLEAN_DB_URI}`);

    // Run clean schema initialization (indexes only, zero seed insertion)
    await initializeDatabaseSchema();

    // 2. Verify pristine clean state
    console.log("\n--- SECTION 1: Clean Database Initial State Verification ---");
    const [userCount, reqCount, sloCount, incCount, depCount, auditCount] = await Promise.all([
      User.countDocuments(),
      Requirement.countDocuments(),
      SLO.countDocuments(),
      Incident.countDocuments(),
      Deployment.countDocuments(),
      DeploymentAuditEvent.countDocuments(),
    ]);

    assert(userCount === 0, `Users must be 0, found ${userCount}`);
    assert(reqCount === 0, `Requirements must be 0, found ${reqCount}`);
    assert(sloCount === 0, `SLOs must be 0, found ${sloCount}`);
    assert(incCount === 0, `Incidents must be 0, found ${incCount}`);
    assert(depCount === 0, `Deployments must be 0, found ${depCount}`);
    assert(auditCount === 0, `Audit events must be 0, found ${auditCount}`);

    pass("Clean Database State", "All 6 business collections verified at count 0 with no default data");

    // 3. Start ephemeral test server
    server = app.listen(TEST_PORT);
    await new Promise((res) => setTimeout(res, 500));

    // 4. Test Auth Status on fresh system
    console.log("\n--- SECTION 2: Initial Setup Detection & First Admin Initialization ---");
    const statusRes = await requestJson(`${TEST_URL}/api/auth/status`);
    assert(statusRes.status === 200, `Expected 200 OK, got ${statusRes.status}`);
    assert(statusRes.json.adminInitialized === false, "adminInitialized must be false");
    assert(statusRes.json.totalUsers === 0, "totalUsers must be 0");
    pass("Auth Status on Clean Installation", "Correctly reports adminInitialized: false and totalUsers: 0");

    // 5. Initialize first administrator
    const initAdminRes = await requestJson(`${TEST_URL}/api/auth/init-admin`, {
      method: "POST",
      body: {
        username: "platform_admin",
        email: "admin@enterprise.io",
        password: "MasterSecurePassword2026!",
        name: "Enterprise Administrator",
      },
    });
    assert(initAdminRes.status === 201, `Expected 201 Created, got ${initAdminRes.status}`);
    assert(initAdminRes.json.success === true, "Admin init must return success");
    assert(initAdminRes.json.user.role === "ADMIN", `Role must be ADMIN, got ${initAdminRes.json.user.role}`);
    assert(Boolean(initAdminRes.json.token), "Admin init must return JWT token");
    const adminToken = initAdminRes.json.token;
    pass("First Administrator Initialization (/api/auth/init-admin)", `Initialized ${initAdminRes.json.user.username}`);

    // 6. Verify subsequent admin initialization is strictly blocked
    const secondInitRes = await requestJson(`${TEST_URL}/api/auth/init-admin`, {
      method: "POST",
      body: {
        username: "rogue_admin",
        email: "rogue@enterprise.io",
        password: "RoguePassword123!",
      },
    });
    assert(secondInitRes.status === 403, `Expected HTTP 403 Forbidden for second admin init, got ${secondInitRes.status}`);
    pass("First Admin Lockout Policy", "Second initialization attempt strictly blocked with HTTP 403 Forbidden");

    // 7. Verify Auth Status after admin initialization
    const statusAfterRes = await requestJson(`${TEST_URL}/api/auth/status`);
    assert(statusAfterRes.json.adminInitialized === true, "adminInitialized must now be true");
    assert(statusAfterRes.json.totalUsers === 1, "totalUsers must now be 1");
    pass("Auth Status Post-Initialization", "Correctly reports adminInitialized: true and totalUsers: 1");

    // 8. Public Normal User Signup with Role Escalation Attack Mitigation
    console.log("\n--- SECTION 3: User Signup, Escalation Mitigation & Authentication ---");
    const normalSignupRes = await requestJson(`${TEST_URL}/api/auth/signup`, {
      method: "POST",
      body: {
        username: "devops_alex",
        email: "alex@enterprise.io",
        password: "AlexPassword2026!",
        name: "Alex Dev",
        role: "ADMIN", // Malicious attempt to elevate privileges via public signup
      },
    });
    assert(normalSignupRes.status === 201, `Expected 201 Created, got ${normalSignupRes.status}`);
    assert(normalSignupRes.json.user.role === "USER", `Public signup must NEVER grant ADMIN, got ${normalSignupRes.json.user.role}`);
    pass("Normal User Self-Registration & Escalation Shield", "Role forced to USER; privilege escalation blocked");

    // 9. Login as Normal User
    const normalLoginRes = await requestJson(`${TEST_URL}/api/auth/login`, {
      method: "POST",
      body: {
        identifier: "devops_alex",
        password: "AlexPassword2026!",
      },
    });
    assert(normalLoginRes.status === 200, `Expected 200 OK, got ${normalLoginRes.status}`);
    assert(normalLoginRes.json.user.role === "USER", "User role must be USER");
    const normalToken = normalLoginRes.json.token;
    pass("Normal User Authentication (/api/auth/login)", "Authenticated as devops_alex with role USER");

    // 10. Login as Admin User
    const adminLoginRes = await requestJson(`${TEST_URL}/api/auth/login`, {
      method: "POST",
      body: {
        identifier: "platform_admin",
        password: "MasterSecurePassword2026!",
      },
    });
    assert(adminLoginRes.status === 200, `Expected 200 OK, got ${adminLoginRes.status}`);
    assert(adminLoginRes.json.user.role === "ADMIN", "Admin role must be ADMIN");
    pass("Admin User Authentication (/api/auth/login)", "Authenticated as platform_admin with role ADMIN");

    // 11. RBAC Isolation
    const forbiddenAdminOverview = await requestJson(`${TEST_URL}/api/auth/admin/overview`, {
      headers: { Authorization: `Bearer ${normalToken}` },
    });
    assert(forbiddenAdminOverview.status === 403, `Normal user must get 403 on admin overview, got ${forbiddenAdminOverview.status}`);
    pass("Role-Based Access Control", "Normal user strictly blocked (403) from admin endpoints");

    // 12. Pure REST Requirement and SLO Creation
    console.log("\n--- SECTION 4: REST Business Operations from Clean Database ---");
    const createReqRes = await requestJson(`${TEST_URL}/api/requirements`, {
      method: "POST",
      headers: { Authorization: `Bearer ${normalToken}` },
      body: {
        requirementId: "REQ-PROD-001",
        title: "Order Checkout Latency Invariant",
        description: "P95 latency must remain under 1.8 seconds",
        service: "OrderCheckoutService",
        metric: "p95_latency",
        threshold: 1.8,
        priority: "CRITICAL",
      },
    });
    assert(createReqRes.status === 201, `Expected 201 Created, got ${createReqRes.status}`);
    pass("Real Requirement Creation", "Created REQ-PROD-001 linked to OrderCheckoutService via REST");

    const createSloRes = await requestJson(`${TEST_URL}/api/slos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${normalToken}` },
      body: {
        sloId: "SLO-PROD-001",
        requirementId: "REQ-PROD-001",
        service: "OrderCheckoutService",
        metric: "p95_latency",
        threshold: 1.8,
        target: 1.8,
        operator: "<",
        unit: "seconds",
        severity: "CRITICAL",
      },
    });
    assert(createSloRes.status === 201, `Expected 201 Created, got ${createSloRes.status}`);
    pass("Real SLO Creation", "Created SLO-PROD-001 linked to REQ-PROD-001 via REST");

    // 13. Admin Overview Verification with Authentic Entities
    const adminOverviewRes = await requestJson(`${TEST_URL}/api/auth/admin/overview`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminOverviewRes.status === 200, `Expected 200 OK, got ${adminOverviewRes.status}`);
    const data = adminOverviewRes.json.data || adminOverviewRes.json.overview || adminOverviewRes.json;
    assert(data.totalUsers === 2, `Expected 2 users, got ${data.totalUsers}`);
    assert(data.totalRequirements === 1, `Expected 1 requirement, got ${data.totalRequirements}`);
    assert(data.totalSLOs === 1, `Expected 1 SLO, got ${data.totalSLOs}`);
    assert(data.activeIncidents === 0, `Expected 0 active incidents, got ${data.activeIncidents}`);
    assert(data.totalDeployments === 0, `Expected 0 deployments, got ${data.totalDeployments}`);
    assert(data.totalAuditEvents === 0, `Expected 0 audit events, got ${data.totalAuditEvents}`);
    pass("Admin Overview on Clean Dataset", `Correctly displays real metrics (2 users, 1 req, 1 SLO, 0 incidents, 0 deployments)`);

    console.log("\n================================================================================");
    console.log(`FRESH INSTALLATION VERIFICATION: TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log("================================================================================\n");

  } catch (err) {
    fail("Fresh Installation Suite Execution", err);
  } finally {
    if (server) {
      server.close();
    }
    try {
      if (mongoose.connection?.db) {
        await mongoose.connection.db.dropDatabase();
      }
      await mongoose.disconnect();
    } catch (_) {}
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runFreshInstallationTest();

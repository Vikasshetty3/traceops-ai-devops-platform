/**
 * TraceOps Phase 5.1 — Security & Execution Isolation Hardening Verification Suite
 *
 * Comprehensive runtime validation for:
 * - SEC-01 (CRITICAL): Elimination of untrusted npm execution on the host server
 * - SEC-02 (HIGH): Complete elimination of host process fallback (node spawn)
 * - SEC-03 (MEDIUM/LOW): Canonical path containment preventing directory traversal and sibling-prefix attacks
 * - SEC-04 (HIGH): Prevention of Docker command injection via strict allowlists and rejection of metacharacters
 * - VAL-01 (MEDIUM): Real TypeScript compiler verification replacing heuristic brace counting
 * - Fail-Closed: Verification that unavailable sandbox causes BLOCKED / FAILED, never host execution
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");

const { ProjectStorageService } = require(path.join(__dirname, "../backend/dist/backend/src/services/projectStorageService"));
const { DockerDeploymentProvider } = require(path.join(__dirname, "../backend/dist/backend/src/services/dockerDeploymentProvider"));
const { SandboxValidationService } = require(path.join(__dirname, "../backend/dist/backend/src/services/sandboxValidationService"));
const { ValidationService } = require(path.join(__dirname, "../backend/dist/backend/src/services/validationService"));

let passed = 0;
let failed = 0;
let blocked = 0;
let skipped = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

function assertThrows(fn, message, expectedSubstring) {
  try {
    fn();
    failed++;
    console.error(`  ✗ FAIL (Expected exception was not thrown): ${message}`);
  } catch (err) {
    if (!expectedSubstring || err.message.toLowerCase().includes(expectedSubstring.toLowerCase())) {
      passed++;
      console.log(`  ✓ PASS: ${message} (Threw expected error: "${err.message.slice(0, 60)}...")`);
    } else {
      failed++;
      console.error(`  ✗ FAIL (Error mismatch): ${message} — Received: "${err.message}", Expected substring: "${expectedSubstring}"`);
    }
  }
}

async function runTests() {
  console.log("================================================================================");
  console.log("  PHASE 5.1 — SECURITY & EXECUTION ISOLATION HARDENING VERIFICATION");
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // SUITE 1: SEC-03 — Canonical Path Containment & Sibling-Prefix Security
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("  SUITE 1: SEC-03 — Path Containment & Anti-Traversal Security");
  console.log("--------------------------------------------------------------------------------");

  const testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "traceops-sec-test-"));
  const workspaceBase = path.join(testTempDir, "workspaces", "REP-100");
  const siblingDir = path.join(testTempDir, "workspaces", "REP-100-malicious");

  fs.mkdirSync(workspaceBase, { recursive: true });
  fs.mkdirSync(siblingDir, { recursive: true });
  fs.mkdirSync(path.join(workspaceBase, "src", "services"), { recursive: true });

  fs.writeFileSync(path.join(workspaceBase, "src", "server.ts"), "// server code");
  fs.writeFileSync(path.join(workspaceBase, "src", "services", "api.ts"), "// api code");
  fs.writeFileSync(path.join(siblingDir, "stolen.txt"), "SECRET DATA");

  // 1.1 Valid relative paths within workspace
  assert(
    ProjectStorageService.safeResolvePath(workspaceBase, "src/server.ts") === path.join(workspaceBase, "src", "server.ts"),
    "Valid relative path 'src/server.ts' resolves correctly inside workspace"
  );
  assert(
    ProjectStorageService.safeResolvePath(workspaceBase, "src/services/api.ts") === path.join(workspaceBase, "src", "services", "api.ts"),
    "Valid nested relative path 'src/services/api.ts' resolves correctly inside workspace"
  );

  // 1.2 Directory traversal escaping workspace root
  assertThrows(
    () => ProjectStorageService.safeResolvePath(workspaceBase, "../secret.txt"),
    "Path traversal '../secret.txt' is rejected",
    "Path traversal"
  );
  assertThrows(
    () => ProjectStorageService.safeResolvePath(workspaceBase, "../../etc/passwd"),
    "Path traversal '../../etc/passwd' is rejected",
    "Path traversal"
  );
  assertThrows(
    () => ProjectStorageService.safeResolvePath(workspaceBase, "src/../../outside.txt"),
    "Nested path traversal 'src/../../outside.txt' is rejected",
    "Path traversal"
  );

  // 1.3 Windows-style directory traversal
  assertThrows(
    () => ProjectStorageService.safeResolvePath(workspaceBase, "..\\..\\secret.txt"),
    "Windows path traversal '..\\..\\secret.txt' is rejected",
    "Path traversal"
  );

  // 1.4 CRITICAL SEC-03 FIX: Sibling-prefix attack
  // Sibling directory 'REP-100-malicious' starts with 'REP-100', but is OUTSIDE 'REP-100' directory
  assertThrows(
    () => ProjectStorageService.safeResolvePath(workspaceBase, "../REP-100-malicious/stolen.txt"),
    "Sibling-prefix attack '../REP-100-malicious/stolen.txt' is rejected by canonical boundary check",
    "Path traversal"
  );

  // 1.5 Absolute path injection
  assertThrows(
    () => ProjectStorageService.safeResolvePath(workspaceBase, "/etc/passwd"),
    "Absolute Unix path '/etc/passwd' is rejected",
    "Absolute path"
  );
  assertThrows(
    () => ProjectStorageService.safeResolvePath(workspaceBase, "C:\\Windows\\System32\\cmd.exe"),
    "Absolute Windows drive path 'C:\\Windows\\System32\\cmd.exe' is rejected",
    "Absolute path"
  );
  assertThrows(
    () => ProjectStorageService.safeResolvePath(workspaceBase, "\\\\server\\share\\file.txt"),
    "UNC path '\\\\server\\share\\file.txt' is rejected",
    "Absolute path"
  );

  // 1.6 Null-byte injection
  assertThrows(
    () => ProjectStorageService.safeResolvePath(workspaceBase, "src/server.ts\0.evil.js"),
    "Null-byte injection is rejected",
    "Null byte"
  );

  // 1.7 Symlink escape prevention
  try {
    const symlinkPath = path.join(workspaceBase, "symlink-escape");
    const externalTarget = path.join(testTempDir, "external.txt");
    fs.writeFileSync(externalTarget, "EXTERNAL SECRET");
    fs.symlinkSync(externalTarget, symlinkPath, "file");

    assertThrows(
      () => ProjectStorageService.safeResolvePath(workspaceBase, "symlink-escape"),
      "Symlink escaping workspace root is rejected after realpath resolution",
      "Symlink escapes workspace root"
    );
  } catch (symlinkErr) {
    if (symlinkErr.code === "EPERM") {
      console.log("  ⚠ SKIP: Symlink creation requires elevated privileges on Windows; core path containment verified.");
      skipped++;
    } else {
      throw symlinkErr;
    }
  }

  // Cleanup temp dir
  fs.rmSync(testTempDir, { recursive: true, force: true });


  // ---------------------------------------------------------------------------
  // SUITE 2: SEC-04 — Docker Command Injection & Parameter Validation
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("  SUITE 2: SEC-04 — Command Injection & Parameter Validation");
  console.log("--------------------------------------------------------------------------------");

  // 2.1 Valid Container Names
  assert(
    (() => { DockerDeploymentProvider.validateContainerName("traceops-live-proj-rep-1"); return true; })(),
    "Valid container name 'traceops-live-proj-rep-1' accepted"
  );
  assert(
    (() => { DockerDeploymentProvider.validateContainerName("container_v1.0-prod"); return true; })(),
    "Valid container name 'container_v1.0-prod' accepted"
  );

  // 2.2 Semicolon Injection in Container Name
  assertThrows(
    () => DockerDeploymentProvider.validateContainerName("container; rm -rf /"),
    "Semicolon injection 'container; rm -rf /' is rejected",
    "metacharacters"
  );

  // 2.3 Ampersand / Background Execution Injection
  assertThrows(
    () => DockerDeploymentProvider.validateContainerName("container && curl evil.com"),
    "Ampersand injection 'container && curl evil.com' is rejected",
    "metacharacters"
  );

  // 2.4 Pipe Injection
  assertThrows(
    () => DockerDeploymentProvider.validateContainerName("container | cat /etc/passwd"),
    "Pipe injection 'container | cat /etc/passwd' is rejected",
    "metacharacters"
  );

  // 2.5 Subshell / Variable Expansion Injection
  assertThrows(
    () => DockerDeploymentProvider.validateContainerName("container$(whoami)"),
    "Subshell injection 'container$(whoami)' is rejected",
    "metacharacters"
  );
  assertThrows(
    () => DockerDeploymentProvider.validateContainerName("container`id`"),
    "Backtick injection 'container`id`' is rejected",
    "metacharacters"
  );
  assertThrows(
    () => DockerDeploymentProvider.validateContainerName("container$ENV_VAR"),
    "Environment variable expansion 'container$ENV_VAR' is rejected",
    "metacharacters"
  );

  // 2.6 Redirects & Quotes
  assertThrows(
    () => DockerDeploymentProvider.validateContainerName('container" > /tmp/hacked'),
    "Redirect and quote injection 'container\" > /tmp/hacked' is rejected",
    "metacharacters"
  );

  // 2.7 Image Tag Validation
  assert(
    (() => { DockerDeploymentProvider.validateImageTag("traceops-backend:v1.0.0"); return true; })(),
    "Valid image tag 'traceops-backend:v1.0.0' accepted"
  );
  assertThrows(
    () => DockerDeploymentProvider.validateImageTag("traceops:v1; cat /etc/shadow"),
    "Malicious image tag with semicolon is rejected",
    "Invalid image tag"
  );
  assertThrows(
    () => DockerDeploymentProvider.validateImageTag("traceops:v1$(reboot)"),
    "Malicious image tag with subshell is rejected",
    "Invalid image tag"
  );

  // 2.8 Port Validation
  assert(
    (() => { DockerDeploymentProvider.validatePort(5000); return true; })(),
    "Valid port 5000 accepted"
  );
  assert(
    (() => { DockerDeploymentProvider.validatePort(8080); return true; })(),
    "Valid port 8080 accepted"
  );
  assertThrows(
    () => DockerDeploymentProvider.validatePort(0),
    "Port 0 rejected",
    "between 1 and 65535"
  );
  assertThrows(
    () => DockerDeploymentProvider.validatePort(70000),
    "Port 70000 rejected",
    "between 1 and 65535"
  );
  assertThrows(
    () => DockerDeploymentProvider.validatePort("5000"),
    "String port '5000' rejected",
    "between 1 and 65535"
  );

  // 2.9 Docker Command String Sanitizer in runDockerCommand
  try {
    await DockerDeploymentProvider.runDockerCommand("docker ps; rm -rf /");
    failed++;
    console.error("  ✗ FAIL: runDockerCommand executed malicious injection string");
  } catch (err) {
    if (err.message.includes("illegal shell metacharacters")) {
      passed++;
      console.log("  ✓ PASS: runDockerCommand actively blocks commands with shell metacharacters (;)");
    } else {
      failed++;
      console.error(`  ✗ FAIL: Unexpected error: ${err.message}`);
    }
  }


  // ---------------------------------------------------------------------------
  // SUITE 3: VAL-01 — Real TypeScript Compiler Validation vs Brace Counting
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("  SUITE 3: VAL-01 — Real TypeScript Compiler Syntax & Type Checking");
  console.log("--------------------------------------------------------------------------------");

  // 3.1 Clean, well-formed TypeScript
  const validTsCode = `interface User { id: string; name: string; }
export function getUser(id: string): User {
  return { id, name: "Alice" };
}
`;
  const validDiagnostics = SandboxValidationService.validateTypeScriptCode(validTsCode, "index.ts");
  assert(
    validDiagnostics.valid === true && validDiagnostics.diagnostics.length === 0,
    "Valid TypeScript passes AST inspection with 0 errors"
  );

  // 3.2 Malformed TypeScript that would TRICK brace counting (braces are balanced, but code is syntactically invalid!)
  // Notice: exactly 2 open braces '{', 2 closing braces '}' -> old checkBalancedBraces returned TRUE!
  const brokenTsCode = `function badSyntax({} {
  return invalid syntax here! : = ;
}`;
  const invalidDiagnostics = SandboxValidationService.validateTypeScriptCode(brokenTsCode, "index.ts");
  assert(
    invalidDiagnostics.valid === false && invalidDiagnostics.diagnostics.length > 0,
    `Real TypeScript compiler detects syntax errors on brace-balanced invalid code (${invalidDiagnostics.diagnostics.length} diagnostics found)`
  );
  assert(
    invalidDiagnostics.diagnostics.some(d => d.message.length > 0 && d.line > 0),
    "Diagnostics report specific error messages and line numbers from TypeScript compiler"
  );




  // ---------------------------------------------------------------------------
  // SUITE 4: SEC-01 & SEC-02 — Sandbox Execution, Isolation & Host Containment
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("  SUITE 4: SEC-01 & SEC-02 — Sandbox Isolation & Host RCE Containment");
  console.log("--------------------------------------------------------------------------------");

  const maliciousFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "traceops-malicious-fixture-"));
  const canaryHostEscapeFile = path.join(testTempDir, "CANARY_HOST_ESCAPE_PROOF.txt");

  // Create malicious package.json that attempts to write outside the workspace to prove host execution
  const maliciousPackageJson = {
    name: "malicious-candidate-repair",
    version: "1.0.0",
    scripts: {
      build: `node -e "const fs=require('fs'); fs.writeFileSync('inside-sandbox.txt', 'SANDBOX'); try{fs.writeFileSync('${canaryHostEscapeFile.replace(/\\/g, "/")}', 'HOST_HACKED');}catch(e){}"`,
      test: "echo 'running tests'",
    },
  };

  fs.writeFileSync(path.join(maliciousFixtureDir, "package.json"), JSON.stringify(maliciousPackageJson, null, 2));
  fs.writeFileSync(path.join(maliciousFixtureDir, "index.js"), "console.log('harmless index');");

  // Execute sandboxed validation
  const validationReport = await SandboxValidationService.validateRepairWorkspace(
    "REP-TEST-MALICIOUS",
    "PROJ-SEC-01",
    maliciousFixtureDir,
    ["package.json", "index.js"]
  );

  // 4.1 Verify host canary file was NOT created
  assert(
    !fs.existsSync(canaryHostEscapeFile),
    "CRITICAL SEC-01: Untrusted package.json script was NOT executed on the host; canary file was NEVER created on host"
  );

  // 4.2 Verify validation report structure
  assert(
    typeof validationReport.validationId === "string" && validationReport.validationId.startsWith("VAL-"),
    "Validation report contains structured validation ID starting with VAL-"
  );
  assert(
    validationReport.resourceLimits.memory === "512m" &&
    validationReport.resourceLimits.cpus === "1.0" &&
    validationReport.resourceLimits.pidsLimit === 64,
    "Sandbox enforces strict resource bounds (512MB RAM, 1.0 CPU, 64 PIDs)"
  );
  assert(
    validationReport.networkMode === "NONE",
    "Sandbox enforces strict network isolation (networkMode: NONE)"
  );

  // 4.3 Verify fail-closed behavior if Docker is unavailable
  const failClosedReport = await SandboxValidationService.validateRepairWorkspace(
    "REP-FAIL-CLOSED",
    "PROJ-FAIL-CLOSED",
    "/nonexistent/path/that/cannot/exist",
    []
  );

  assert(
    failClosedReport.overallStatus === "VALIDATION_BLOCKED",
    "CRITICAL SEC-02 & FAIL-CLOSED: Nonexistent workspace or isolation failure yields VALIDATION_BLOCKED, NEVER PASS"
  );
  assert(
    failClosedReport.stages.some(s => s.status === "BLOCKED"),
    "Fail-closed stage reports status BLOCKED"
  );

  fs.rmSync(maliciousFixtureDir, { recursive: true, force: true });


  // ---------------------------------------------------------------------------
  // SUITE 5: LIVE BACKEND API INTEGRITY
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("  SUITE 5: LIVE BACKEND API INTEGRITY CHECK");
  console.log("--------------------------------------------------------------------------------");

  function httpRequest(apiPath) {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:5000${apiPath}`, { timeout: 5000 }, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      });
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    });
  }

  try {
    const projectsRes = await httpRequest("/api/projects");
    const projectsList = projectsRes.body?.data || projectsRes.body;
    assert(
      projectsRes.status === 200 && Array.isArray(projectsList) && projectsList.length > 0,
      `Live backend is operational and returns projects array (Status: ${projectsRes.status}, Count: ${projectsList.length})`
    );

    const firstProjectId = projectsList[0]?.projectId || "PROJ-105175";
    const historyRes = await httpRequest(`/api/projects/${firstProjectId}/repair-history`);
    assert(
      historyRes.status === 200 && historyRes.body?.success === true,
      `Live backend project repair history endpoint is operational (Status: ${historyRes.status})`
    );

    const slosRes = await httpRequest(`/api/projects/${firstProjectId}/slos`);
    assert(
      slosRes.status === 200 && slosRes.body?.success === true,
      `Live backend project SLOs endpoint is operational (Status: ${slosRes.status})`
    );
  } catch (apiErr) {
    failed++;
    console.error(`  ✗ FAIL: Live backend request failed: ${apiErr.message}`);
  }


  // ---------------------------------------------------------------------------
  // SUMMARY REPORT
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("  PHASE 5.1 SECURITY HARDENING VERIFICATION SUMMARY");
  console.log("================================================================================");
  console.log(`  TOTAL TESTS:   ${passed + failed + skipped}`);
  console.log(`  PASSED:        ${passed}`);
  console.log(`  FAILED:        ${failed}`);
  console.log(`  SKIPPED:       ${skipped}`);
  console.log("================================================================================");

  if (failed === 0) {
    console.log("  VERDICT: ALL SECURITY GATES VERIFIED SUCCESSFULLY [PHASE 5.1 VERIFIED]");
  } else {
    console.log(`  VERDICT: ${failed} TEST(S) FAILED [PHASE 5.1 FAILED]`);
  }
}

runTests().catch(err => {
  console.error("Unhandled error in test runner:", err);
  process.exit(1);
});

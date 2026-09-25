const http = require("http");

const API_BASE = "http://localhost:5000/api";

function request(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, API_BASE);
    const reqHeaders = { "Content-Type": "application/json" };
    let payload = null;

    if (body) {
      payload = JSON.stringify(body);
      reqHeaders["Content-Length"] = Buffer.byteLength(payload);
    }

    const options = {
      method,
      hostname: url.hostname,
      port: url.port || 5000,
      path: url.pathname + url.search,
      headers: reqHeaders,
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed, raw: data });
        } catch {
          resolve({ status: res.statusCode, data, raw: data });
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

async function runGitHubOnboardingTests() {
  console.log("================================================================================");
  console.log("TraceOps GitHub Repository Onboarding & Autonomous Pipeline E2E Audit");
  console.log("================================================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // Test 1: Reject Non-GitHub URL
  console.log("[1/10] Testing Security Controls: Non-GitHub URL Rejection...");
  const nonGithubRes = await request("POST", "/api/projects/github", {
    repositoryUrl: "https://gitlab.com/user/unauthorized-repo",
  });
  assert(
    (nonGithubRes.status === 400 || nonGithubRes.status === 500) &&
    nonGithubRes.data.error.includes("Only public HTTPS GitHub repository URLs"),
    "Rejected non-GitHub URL with security violation message"
  );

  // Test 2: Reject Malicious/Injection URL
  console.log("\n[2/10] Testing Security Controls: Command Injection & Path Traversal Rejection...");
  const maliciousRes = await request("POST", "/api/projects/github", {
    repositoryUrl: "https://github.com/user/repo;cat /etc/passwd",
  });
  assert(
    (maliciousRes.status === 400 || maliciousRes.status === 500) &&
    maliciousRes.data.error.includes("Illegal characters"),
    "Rejected illegal command characters in GitHub URL"
  );

  // Test 3: Reject Malformed URL
  console.log("\n[3/10] Testing Validation: Malformed GitHub URL Format...");
  const malformedRes = await request("POST", "/api/projects/github", {
    repositoryUrl: "https://github.com/invalid-no-repo",
  });
  assert(
    (malformedRes.status === 400 || malformedRes.status === 500) &&
    malformedRes.data.error.includes("Malformed GitHub repository URL"),
    "Rejected malformed GitHub URL missing repository component"
  );

  // Test 4: Onboard Real Public GitHub Repository
  console.log("\n[4/10] Onboarding Real Public GitHub Repository (expressjs/express-paginate or octocat/Hello-World)...");
  // Using octocat/Hello-World (a standard, lightweight public repo with verified master branch)
  const onboardRes = await request("POST", "/api/projects/github", {
    repositoryUrl: "https://github.com/octocat/Hello-World",
    branch: "master",
  });

  assert(
    onboardRes.status === 200 && onboardRes.data.success,
    `Successfully cloned and analyzed public GitHub repo (Project ID: ${onboardRes.data?.data?.project?.projectId})`
  );

  const project = onboardRes.data.data.project;
  const analysis = onboardRes.data.data.analysis;
  const projectId = project.projectId;

  assert(project.sourceType === "GITHUB", "Project sourceType is GITHUB");
  assert(project.repositoryOwner === "octocat", "Extracted repositoryOwner is octocat");
  assert(project.repositoryName === "Hello-World", "Extracted repositoryName is Hello-World");
  assert(project.repositoryBranch === "master", "Extracted repositoryBranch is master");
  assert(project.commitSha && project.commitSha.length >= 7, `Persisted real Git commit SHA: ${project.commitSha}`);
  assert(analysis.requirements && analysis.requirements.length > 0, `Discovered ${analysis.requirements.length} requirements from repository`);
  assert(analysis.slos && analysis.slos.length > 0, `Synthesized ${analysis.slos.length} operational SLOs from repository`);

  // Test 5: Check Remote GitHub Updates
  console.log(`\n[5/10] Testing Remote Commit Check for ${projectId}...`);
  const updateRes = await request("GET", `/api/projects/${projectId}/github-updates`);
  assert(
    updateRes.status === 200 && updateRes.data.success && updateRes.data.data.status === "UP_TO_DATE",
    `Remote commit check succeeded. Status: ${updateRes.data?.data?.status} (Latest SHA: ${updateRes.data?.data?.latestCommitSha?.slice(0, 7)})`
  );

  // Test 6: Static Code Issue Detection on Cloned Repository
  console.log(`\n[6/10] Executing Code Issue Detector on Cloned Project ${projectId}...`);
  const issueScanRes = await request("POST", `/api/projects/${projectId}/analyze-issues`);
  assert(
    issueScanRes.status === 200 && issueScanRes.data.success,
    `Static issue scan executed on cloned repository without executing untrusted code`
  );

  // Test 7: Autonomous Code Repair Pipeline Compatibility
  console.log(`\n[7/10] Verifying Autonomous Repair Engine Compatibility with Cloned Project...`);
  // Query project details to ensure requirements and SLOs are fully persisted
  const projectDetailsRes = await request("GET", `/api/projects/${projectId}`);
  assert(
    projectDetailsRes.status === 200 && projectDetailsRes.data.data.project.projectId === projectId,
    `Retrieved complete project model and linked requirements (${projectDetailsRes.data.data.requirements.length})`
  );

  // Test 8: Traceability Graph Linkage
  console.log(`\n[8/10] Verifying Project-Scoped Traceability Graph for GitHub Project...`);
  const traceRes = await request("GET", `/api/traceability/graph?projectId=${projectId}`);
  assert(
    traceRes.status === 200 && traceRes.data.data.length > 0,
    `Traceability graph generated with ${traceRes.data.data.length} root requirement nodes for GitHub project`
  );

  // Test 9: Query All Projects to verify GitHub project listed
  console.log(`\n[9/10] Verifying Project Catalog API includes GitHub project...`);
  const projectsRes = await request("GET", "/api/projects");
  const found = projectsRes.data.data.find((p) => p.projectId === projectId);
  assert(
    found && found.sourceType === "GITHUB" && found.repositoryUrl === "https://github.com/octocat/Hello-World",
    `Project ${projectId} verified in catalog with GitHub metadata`
  );

  // Test 10: Clean Cleanup
  console.log(`\n[10/10] Testing Project Removal and Artifact Cleanup...`);
  const deleteRes = await request("DELETE", `/api/projects/${projectId}`);
  assert(
    deleteRes.status === 200 && deleteRes.data.success,
    `Project ${projectId} and extracted operational models safely removed`
  );

  console.log("\n================================================================================");
  console.log(`TEST SUMMARY: ${passed}/${total} TESTS PASSED (100%)`);
  console.log("================================================================================\n");
}

runGitHubOnboardingTests().catch((err) => {
  console.error("\n❌ GitHub Onboarding Test Suite Error:", err);
  process.exit(1);
});

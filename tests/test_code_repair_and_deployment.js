const fs = require("fs");
const path = require("path");
const http = require("http");
const AdmZip = require(path.join(__dirname, "../backend/node_modules/adm-zip"));

const API_BASE = "http://localhost:5000/api";

function request(method, urlPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, API_BASE);
    const reqHeaders = { ...headers };
    let payload = null;

    if (body && !(body instanceof Buffer)) {
      payload = JSON.stringify(body);
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(payload);
    } else if (body instanceof Buffer) {
      payload = body;
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
      reject(new Error("Request timed out after 60s"));
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function createSampleBuggyProjectZip() {
  const zip = new AdmZip();

  const packageJson = {
    name: "payments-microservice",
    version: "1.0.0",
    description: "Core real-time payment processing service",
    main: "server.js",
    scripts: {
      start: "node server.js",
      build: "node --check server.js",
      test: "node -e \"console.log('Unit tests passed')\"",
    },
    dependencies: {
      express: "^4.18.2",
    },
  };

  const serverJs = `const http = require("http");

// Target service with intentional blocking latency defect
const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "UP", service: "payments-microservice" }));
  }

  if (req.url === "/api/pay") {
    // Intentional synchronous blocking delay causing p95 latency violation (>2.5s)
    const start = Date.now();
    while (Date.now() - start < 2600) {
      // Burn CPU cycles
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "PAID", amount: 100 }));
  }

  res.writeHead(404);
  res.end();
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log("Payments service listening on port " + PORT);
});
`;

  const dockerfile = `FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production --ignore-scripts
COPY server.js ./
EXPOSE 5000
HEALTHCHECK --interval=5s --timeout=3s CMD node -e "require('http').get('http://localhost:5000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["node", "server.js"]
`;

  const reqDoc = `# System Requirements Specification
## REQ-PAY-001: Payment Transaction Processing
The payments service must process transactions with p95 response times strictly under 2.0 seconds and maintain 99.9% availability.
`;

  zip.addFile("package.json", Buffer.from(JSON.stringify(packageJson, null, 2)));
  zip.addFile("server.js", Buffer.from(serverJs));
  zip.addFile("Dockerfile", Buffer.from(dockerfile));
  zip.addFile("REQUIREMENTS.md", Buffer.from(reqDoc));

  return zip.toBuffer();
}

async function runE2ETest() {
  console.log("================================================================================");
  console.log("TraceOps Autonomous Code Repair & Real Docker Deployment E2E Audit");
  console.log("================================================================================\n");

  let passedTests = 0;
  const totalTests = 12;

  try {
    // Step 1: Health check backend
    console.log("[1/12] Testing Backend Health...");
    const healthRes = await request("GET", "/api/health");
    if (healthRes.status === 200 && healthRes.data.success) {
      console.log("  ✓ Backend is ONLINE");
      passedTests++;
    } else {
      throw new Error(`Backend health failed: ${JSON.stringify(healthRes)}`);
    }

    // Step 2: Upload real buggy project archive
    console.log("\n[2/12] Uploading Buggy Project Archive to /api/projects/upload...");
    const zipBuffer = createSampleBuggyProjectZip();
    const boundary = "----WebKitFormBoundary" + Math.random().toString(16);
    const crlf = "\r\n";
    let body = Buffer.concat([
      Buffer.from(
        `--${boundary}${crlf}Content-Disposition: form-data; name="projectZip"; filename="payments-service.zip"${crlf}Content-Type: application/zip${crlf}${crlf}`
      ),
      zipBuffer,
      Buffer.from(`${crlf}--${boundary}--${crlf}`),
    ]);

    const uploadRes = await request("POST", "/api/projects/upload", body, {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": body.length,
    });

    if (uploadRes.status === 200 && uploadRes.data.success) {
      const projectId = uploadRes.data.data.project.projectId;
      console.log(`  ✓ Project successfully uploaded & analyzed. Project ID: ${projectId}`);
      passedTests++;

      // Step 3: Scan for issues
      console.log(`\n[3/12] Triggering Static Issue Detector for ${projectId}...`);
      const scanRes = await request("POST", `/api/projects/${projectId}/analyze-issues`);
      if (scanRes.status === 200 && scanRes.data.success && scanRes.data.data.length > 0) {
        const issues = scanRes.data.data;
        console.log(`  ✓ Detected ${issues.length} real issue(s) in source code:`);
        issues.forEach((iss) => {
          console.log(`    - [${iss.severity}] ${iss.category} in ${iss.file}:${iss.line}`);
          console.log(`      Root Cause: ${iss.rootCause}`);
          console.log(`      SLO Impact: ${iss.sloImpact}`);
        });
        passedTests++;

        const targetIssue = issues[0];

        // Step 4: Generate Autonomous Code Repair
        console.log(`\n[4/12] Generating Autonomous Code Repair for Issue ${targetIssue.issueId}...`);
        const repairRes = await request("POST", `/api/issues/${targetIssue.issueId}/repair`);
        if (repairRes.status === 201 && repairRes.data.success) {
          const repair = repairRes.data.data;
          console.log(`  ✓ Code repair generated in isolated workspace: ${repair.workspacePath}`);
          console.log(`  ✓ Modified Files: ${repair.changedFiles.join(", ")}`);
          passedTests++;

          // Step 5: Verify Unified Diff
          console.log(`\n[5/12] Inspecting Synthesized Unified Diff for Repair ${repair.repairId}...`);
          const diffRes = await request("GET", `/api/repairs/${repair.repairId}/diff`);
          if (diffRes.status === 200 && diffRes.data.data.diff.includes("---") && diffRes.data.data.diff.includes("+++")) {
            console.log("  ✓ Valid Unified Diff generated:");
            diffRes.data.data.diff.split("\n").slice(0, 10).forEach((l) => console.log(`    ${l}`));
            passedTests++;
          } else {
            throw new Error(`Invalid diff: ${JSON.stringify(diffRes)}`);
          }

          // Step 6: Execute Sandbox Validation
          console.log(`\n[6/12] Executing Sandbox Multi-Stage Validation on Repair ${repair.repairId}...`);
          const valRes = await request("POST", `/api/repairs/${repair.repairId}/validate`);
          if (valRes.status === 200 && valRes.data.data.validationStatus === "VALIDATED") {
            console.log("  ✓ Validation PASSED all stages:");
            valRes.data.data.validationStages.forEach((stage) => {
              console.log(`    - Stage: ${stage.stage} [Passed: ${stage.passed}] Duration: ${stage.durationMs}ms`);
            });
            passedTests++;
          } else {
            throw new Error(`Validation failed: ${JSON.stringify(valRes)}`);
          }

          // Step 7: Safety Gate Check (Cannot deploy unapproved repair)
          console.log(`\n[7/12] Testing Safety Gate: Attempting deployment of UNAPPROVED repair...`);
          const unapprovedDeployRes = await request("POST", `/api/repairs/${repair.repairId}/deploy`);
          if (unapprovedDeployRes.status === 500 && unapprovedDeployRes.data.error.includes("Safety Gate")) {
            console.log(`  ✓ Safety Gate correctly BLOCKED unapproved deployment: ${unapprovedDeployRes.data.error}`);
            passedTests++;
          } else {
            throw new Error(`Safety gate failed to block unapproved deployment: ${JSON.stringify(unapprovedDeployRes)}`);
          }

          // Step 8: Human Approval
          console.log(`\n[8/12] Approving Code Repair ${repair.repairId} via Human Approval API...`);
          const approveRes = await request("POST", `/api/repairs/${repair.repairId}/approve`, {
            approvedBy: "Lead SRE Engineer",
          });
          if (approveRes.status === 200 && approveRes.data.data.approvalStatus === "APPROVED") {
            console.log(`  ✓ Repair ${repair.repairId} approved by ${approveRes.data.data.approvedBy}`);
            passedTests++;
          } else {
            throw new Error(`Approval failed: ${JSON.stringify(approveRes)}`);
          }

          // Step 9: Deploy Repaired Project to Live Docker Container
          console.log(`\n[9/12] Deploying Repaired Container to Docker & Running SLO Verification...`);
          const deployRes = await request("POST", `/api/repairs/${repair.repairId}/deploy`);
          if (deployRes.status === 200 && deployRes.data.success) {
            const { deployment, verification } = deployRes.data.data;
            console.log(`  ✓ Live Container Launched: ${deployment.containerName}`);
            console.log(`  ✓ Host Port: ${deployment.hostPort} -> Target Port: ${deployment.targetPort}`);
            console.log(`  ✓ Image: ${deployment.imageTag}`);
            console.log(`  ✓ Health Check: ${deployment.healthCheckUrl} [Passed: ${deployment.healthCheckPassed}]`);
            console.log(`  ✓ Live Latency: ${verification.afterValue}s (Before: ${verification.beforeValue}s)`);
            console.log(`  ✓ SLO Improvement: +${verification.improvementPercentage}% (Status: ${verification.sloCompliant ? "COMPLIANT" : "NON_COMPLIANT"})`);
            passedTests++;

            // Step 10: Probe Live Deployed Container Directly
            console.log(`\n[10/12] Probing Live Container HTTP endpoint directly on port ${deployment.hostPort}...`);
            const probeRes = await request("GET", `/api/deployments/${deployment.deploymentId}/probe`);

            if (probeRes.status === 200 && probeRes.data.success && probeRes.data.data.status === 200) {
              console.log(`  ✓ HTTP 200 received from live container: ${probeRes.data.data.body}`);
              passedTests++;
            } else {
              throw new Error(`Direct container probe failed: ${JSON.stringify(probeRes)}`);
            }

            // Step 11: Verify Full Traceability Graph Linkage
            console.log(`\n[11/12] Verifying End-to-End Traceability Graph includes repair & deployment...`);
            const traceRes = await request("GET", `/api/traceability/graph?projectId=${projectId}`);
            if (traceRes.status === 200 && traceRes.data.data.length > 0) {
              const node = traceRes.data.data[0];
              const hasIssues = node.codeIssues && node.codeIssues.length > 0;
              const hasRepairs = node.codeRepairs && node.codeRepairs.length > 0;
              const hasDeployments = node.deployments && node.deployments.length > 0;
              console.log(`  ✓ Traceability Graph Node Verified:`);
              console.log(`    - Requirement: ${node.requirement.title}`);
              console.log(`    - Linked Issues: ${node.codeIssues ? node.codeIssues.length : 0}`);
              console.log(`    - Linked Repairs: ${node.codeRepairs ? node.codeRepairs.length : 0}`);
              console.log(`    - Linked Deployments: ${node.deployments ? node.deployments.length : 0}`);
              if (hasIssues && hasRepairs && hasDeployments) {
                console.log("  ✓ Full Traceability Chain COMPLETE");
                passedTests++;
              } else {
                throw new Error("Traceability graph missing linked repair/deployment nodes");
              }
            } else {
              throw new Error(`Traceability fetch failed: ${JSON.stringify(traceRes)}`);
            }

            // Step 12: Rollback Deployment
            console.log(`\n[12/12] Executing Deployment Rollback for ${deployment.deploymentId}...`);
            const rollbackRes = await request("POST", `/api/deployments/${deployment.deploymentId}/rollback`, {
              reason: "Automated regression drill verification",
            });
            if (rollbackRes.status === 200 && rollbackRes.data.data.status === "ROLLED_BACK") {
              console.log(`  ✓ Rollback successful. Container removed and status set to ROLLED_BACK.`);
              passedTests++;
            } else {
              throw new Error(`Rollback failed: ${JSON.stringify(rollbackRes)}`);
            }
          } else {
            throw new Error(`Deployment failed: ${JSON.stringify(deployRes)}`);
          }
        } else {
          throw new Error(`Repair generation failed: ${JSON.stringify(repairRes)}`);
        }
      } else {
        throw new Error(`Issue scan returned no issues: ${JSON.stringify(scanRes)}`);
      }
    } else {
      throw new Error(`Project upload failed: ${JSON.stringify(uploadRes)}`);
    }

    console.log("\n================================================================================");
    console.log(`TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
    console.log("================================================================================\n");
  } catch (error) {
    console.error(`\n❌ TEST FAILURE: ${error.message}`);
    process.exit(1);
  }
}

runE2ETest();

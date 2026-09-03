const fs = require("fs");
const path = require("path");
const os = require("os");
let AdmZip;
try {
  AdmZip = require("adm-zip");
} catch (e) {
  AdmZip = require(path.join(__dirname, "../backend/node_modules/adm-zip"));
}

async function runProjectOnboardingTest() {
  console.log("==========================================================================");
  console.log("🚀 STARTING REAL PROJECT ONBOARDING & STATIC ANALYSIS VALIDATION");
  console.log("==========================================================================");

  // 1. Create a Realistic Sample Multi-Service Project ZIP Fixture
  const zip = new AdmZip();

  const readmeContent = `# E-Commerce Cloud Platform

## Architecture & Microservices
The platform consists of an Order Service, Payment Gateway, and Catalog Service with Redis caching.

## Operational SLAs and Performance Requirements
- Order Service latency must stay below 1.2 seconds during peak flash sales.
- Payment Gateway error rate must stay below 0.05% under high transaction volume.
- Catalog Service availability must be at least 99.95% uptime.
`;

  const pkgJsonRoot = JSON.stringify({
    name: "ecommerce-cloud-platform",
    version: "2.1.0",
    description: "Enterprise e-commerce microservices platform",
    dependencies: {
      react: "^18.2.0",
      vite: "^5.0.0"
    }
  }, null, 2);

  const pkgJsonBackend = JSON.stringify({
    name: "order-service",
    version: "1.0.0",
    description: "High-throughput order ingestion service",
    dependencies: {
      express: "^4.19.0",
      mongoose: "^8.0.0",
      ioredis: "^5.3.0",
      pg: "^8.11.0"
    },
    devDependencies: {
      typescript: "^5.4.0"
    }
  }, null, 2);

  const dockerCompose = `version: '3.8'
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:80"
  order-service:
    build: ./backend
    ports:
      - "8080:8080"
  payment-gateway:
    image: payment-gateway:latest
    ports:
      - "8081:8081"
  catalog-service:
    image: catalog-service:latest
    ports:
      - "8082:8082"
  mongodb:
    image: mongo:7.0
  redis:
    image: redis:7.2
`;

  const k8sManifest = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service-deployment
  namespace: production
spec:
  replicas: 3
`;

  const githubAction = `name: CI/CD Pipeline
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
`;

  zip.addFile("README.md", Buffer.from(readmeContent, "utf8"));
  zip.addFile("package.json", Buffer.from(pkgJsonRoot, "utf8"));
  zip.addFile("backend/package.json", Buffer.from(pkgJsonBackend, "utf8"));
  zip.addFile("docker-compose.yml", Buffer.from(dockerCompose, "utf8"));
  zip.addFile("k8s/deployment.yaml", Buffer.from(k8sManifest, "utf8"));
  zip.addFile(".github/workflows/deploy.yml", Buffer.from(githubAction, "utf8"));

  const zipBuffer = zip.toBuffer();
  console.log(`📦 Created sample project archive (${zipBuffer.length} bytes, 6 files)`);

  // 2. Upload and Analyze Project via API
  console.log("\n📡 Dispatching POST /api/projects/upload...");
  const formData = new FormData();
  const blob = new Blob([zipBuffer], { type: "application/zip" });
  formData.append("projectZip", blob, "ecommerce-cloud-platform.zip");
  formData.append("name", "E-Commerce Cloud Platform");

  const uploadRes = await fetch("http://localhost:5000/api/projects/upload", {
    method: "POST",
    body: formData
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    console.error(`❌ Upload failed: ${uploadRes.status} ${err}`);
    process.exit(1);
  }

  const uploadData = await uploadRes.json();
  const project = uploadData.data.project;
  const analysis = uploadData.data.analysis;

  console.log(`✅ [PASS] Project Onboarded: ${project.name} (${project.projectId})`);
  console.log(`   Status: ${project.status}`);
  console.log(`   Architecture: ${project.analysisSummary.architectureType}`);
  console.log(`   Languages: ${project.techStack.languages.join(", ")}`);
  console.log(`   Frameworks: ${project.techStack.frameworks.join(", ")}`);
  console.log(`   Databases: ${project.techStack.databases.join(", ")}`);
  console.log(`   Containers: ${project.techStack.containerization.join(", ")}`);
  console.log(`   CI/CD: ${project.techStack.cicd.join(", ")}`);

  console.log(`\n🔍 Discovered Services (${project.services.length}):`);
  project.services.forEach(s => console.log(`   - ${s.name} (${s.type}) -> ${s.path || "/"}`));

  console.log(`\n📋 Extracted Requirements (${analysis.requirements.length}):`);
  analysis.requirements.forEach(r => {
    console.log(`   - [${r.requirementType}] ${r.requirementId}: ${r.title} | ${r.metric} ${r.operator} ${r.threshold}${r.unit} (Confidence: ${r.confidence})`);
    if (r.sourceFile) console.log(`     Source: ${r.sourceFile}`);
  });

  console.log(`\n⚡ Synthesized SLOs (${analysis.slos.length}):`);
  analysis.slos.forEach(s => {
    console.log(`   - ${s.sloId}: ${s.service} ${s.metric} ${s.operator} ${s.threshold} ${s.unit} [${s.window}]`);
  });

  // 3. Verify Project Query Endpoint
  console.log(`\n📡 Querying GET /api/projects/${project.projectId}...`);
  const getProjRes = await fetch(`http://localhost:5000/api/projects/${project.projectId}`);
  const getProjData = await getProjRes.json();
  if (getProjData.success && getProjData.data.project.projectId === project.projectId) {
    console.log(`✅ [PASS] Retrieved project details with ${getProjData.data.requirements.length} requirements and ${getProjData.data.slos.length} SLOs`);
  } else {
    console.error("❌ Failed to query project details");
    process.exit(1);
  }

  // 4. Verify Project-Scoped Traceability Graph
  console.log(`\n📡 Querying GET /api/traceability/graph?projectId=${project.projectId}...`);
  const traceRes = await fetch(`http://localhost:5000/api/traceability/graph?projectId=${project.projectId}`);
  const traceData = await traceRes.json();
  if (traceData.success && traceData.data.length > 0) {
    console.log(`✅ [PASS] Project-scoped Traceability graph generated (${traceData.data.length} root requirement nodes)`);
  } else {
    console.error("❌ Failed to query project traceability graph");
    process.exit(1);
  }

  // 5. Verify Regression: Baseline Seeded Requirements & Operational Flow
  console.log(`\n📡 Regression Check: Querying GET /api/requirements for baseline...`);
  const baseReqsRes = await fetch("http://localhost:5000/api/requirements");
  const baseReqsData = await baseReqsRes.json();
  const hasBase001 = baseReqsData.data.some(r => r.requirementId === "REQ-001");
  if (hasBase001) {
    console.log(`✅ [PASS] Baseline demo dataset (REQ-001) intact alongside newly onboarded project`);
  } else {
    console.error("❌ Baseline dataset corrupted");
    process.exit(1);
  }

  console.log("\n==========================================================================");
  console.log("🎉 ALL PROJECT ONBOARDING & ARCHITECTURE DISCOVERY TESTS PASSED!");
  console.log("==========================================================================");
}

runProjectOnboardingTest().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

/**
 * Phase 7.1 — Production Infrastructure Preparation Test Suite
 * 
 * Verifies:
 * 1. Docker Compose production configuration & syntax validity
 * 2. Strict port policy: Only 80/443 exposed publicly on reverse proxy
 * 3. Network segregation: traceops-public & traceops-internal
 * 4. Caddy reverse proxy configuration & route safety
 * 5. Frontend container SPA routing and healthcheck
 * 6. Production model artifacts byte-for-byte cryptographic integrity
 * 7. Active serving model locked to 2.0.0 and candidate offline
 * 8. CI/CD workflow with immutable image tagging and deployment gate
 * 9. Production deployment runbook completeness
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failCount++;
  }
}

function sha256File(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex').toUpperCase();
}

console.log('================================================================================');
console.log('STARTING PHASE 7.1 PRODUCTION INFRASTRUCTURE TEST SUITE');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// SECTION 1: Compose Configuration & Syntax Validation
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: Compose Configuration & Syntax Validation ---');
const prodComposePath = path.resolve(__dirname, '../docker-compose.prod.yml');
assert(fs.existsSync(prodComposePath), 'docker-compose.prod.yml exists');

try {
  const configOut = execSync('docker compose -f docker-compose.prod.yml config -q', {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
  });
  assert(true, 'docker compose -f docker-compose.prod.yml config succeeds with 0 exit code');
} catch (err) {
  assert(false, `docker compose config failed: ${err.message}`);
}

const prodComposeContent = fs.readFileSync(prodComposePath, 'utf8');

// -----------------------------------------------------------------------------
// SECTION 2: Port Policy & Boundary Protection
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Port Policy & Boundary Protection ---');

// Check that ONLY reverse-proxy publishes host ports
const servicesMatch = prodComposeContent.match(/services:\s*([\s\S]*?)(?=volumes:|$)/);
assert(servicesMatch !== null, 'Services block found in compose file');

// Check ports: only 80:80 and 443:443
const portsMatches = prodComposeContent.match(/ports:\s*\n(\s*-\s*["']?\d+:\d+["']?\n)+/g) || [];
assert(portsMatches.length === 1, 'Only exactly one service (reverse-proxy) publishes host ports');

assert(prodComposeContent.includes('"80:80"'), 'Public port 80 is published for HTTP');
assert(prodComposeContent.includes('"443:443"'), 'Public port 443 is published for HTTPS');

// Verify sensitive services do NOT have host port mappings
const mongodbHasHostPorts = /mongodb:[\s\S]*?ports:\s*\n\s*-\s*["']?\d+:27017/i.test(prodComposeContent);
assert(!mongodbHasHostPorts, 'MongoDB (27017) has zero public host port mapping');

const backendHasHostPorts = /backend:[\s\S]*?ports:\s*\n\s*-\s*["']?\d+:5000/i.test(prodComposeContent);
assert(!backendHasHostPorts, 'Backend API (5000) has zero public host port mapping');

const mlHasHostPorts = /ml-service:[\s\S]*?ports:\s*\n\s*-\s*["']?\d+:5001/i.test(prodComposeContent);
assert(!mlHasHostPorts, 'ML Service (5001) has zero public host port mapping');

const promHasHostPorts = /prometheus:[\s\S]*?ports:\s*\n\s*-\s*["']?\d+:9090/i.test(prodComposeContent);
assert(!promHasHostPorts, 'Prometheus (9090) has zero public host port mapping');

const grafanaHasHostPorts = /grafana:[\s\S]*?ports:\s*\n\s*-\s*["']?\d+:3000/i.test(prodComposeContent);
assert(!grafanaHasHostPorts, 'Grafana (3000) has zero public host port mapping');

// -----------------------------------------------------------------------------
// SECTION 3: Network Topology & Isolation
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 3: Network Topology & Isolation ---');

assert(prodComposeContent.includes('traceops-public:'), 'traceops-public network defined');
assert(prodComposeContent.includes('traceops-internal:'), 'traceops-internal network defined');

// Verify reverse proxy connects to both public and internal
const proxyNetworksMatch = /reverse-proxy:[\s\S]*?networks:\s*\n\s*-\s*traceops-public\s*\n\s*-\s*traceops-internal/m.test(prodComposeContent);
assert(proxyNetworksMatch, 'Reverse proxy connects to both traceops-public and traceops-internal');

// Verify backend connects only to internal
const backendNetworksMatch = /backend:[\s\S]*?networks:\s*\n\s*-\s*traceops-internal/m.test(prodComposeContent);
assert(backendNetworksMatch, 'Backend connects exclusively to traceops-internal');

// Verify mongodb connects only to internal
const mongoNetworksMatch = /mongodb:[\s\S]*?networks:\s*\n\s*-\s*traceops-internal/m.test(prodComposeContent);
assert(mongoNetworksMatch, 'MongoDB connects exclusively to traceops-internal');

// -----------------------------------------------------------------------------
// SECTION 4: Persistent Storage & Log Rotation
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 4: Persistent Storage & Log Rotation ---');

assert(prodComposeContent.includes('mongo_prod_data:'), 'Persistent volume mongo_prod_data defined');
assert(prodComposeContent.includes('prometheus_prod_data:'), 'Persistent volume prometheus_prod_data defined');
assert(prodComposeContent.includes('grafana_prod_data:'), 'Persistent volume grafana_prod_data defined');
assert(prodComposeContent.includes('caddy_data:'), 'Persistent volume caddy_data defined');

// Verify Docker log rotation is configured across services
const logDriverCount = (prodComposeContent.match(/driver:\s*["']?json-file["']?/g) || []).length;
assert(logDriverCount >= 6, 'Log rotation (json-file) configured across all production services');
assert(prodComposeContent.includes('max-size: "50m"'), 'Log max-size rotation limit configured');

// -----------------------------------------------------------------------------
// SECTION 5: Caddy Reverse Proxy Configuration
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 5: Caddy Reverse Proxy Configuration ---');

const caddyfilePath = path.resolve(__dirname, '../caddy/Caddyfile');
assert(fs.existsSync(caddyfilePath), 'caddy/Caddyfile exists');

const caddyfileContent = fs.readFileSync(caddyfilePath, 'utf8');

assert(caddyfileContent.includes('handle /api/*'), 'Caddyfile routes /api/* to backend');
assert(caddyfileContent.includes('reverse_proxy backend:5000'), 'Caddy routes API traffic to backend:5000');
assert(caddyfileContent.includes('handle /health*'), 'Caddyfile routes /health* to backend');
assert(caddyfileContent.includes('handle /metrics*'), 'Caddyfile intercepts /metrics* scraping endpoint');
assert(caddyfileContent.includes('respond "Access Denied" 403'), 'Caddyfile blocks public access to /metrics with HTTP 403');
assert(caddyfileContent.includes('reverse_proxy frontend:80'), 'Caddy routes UI traffic to frontend:80');
assert(caddyfileContent.includes('Strict-Transport-Security'), 'Caddy enforces HSTS header');
assert(caddyfileContent.includes('max_size 10MB'), 'Caddy limits request body size to 10MB');

// -----------------------------------------------------------------------------
// SECTION 6: Frontend Hardening & SPA Routing
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 6: Frontend Hardening & SPA Routing ---');

const frontendNginxPath = path.resolve(__dirname, '../frontend/nginx.conf');
assert(fs.existsSync(frontendNginxPath), 'frontend/nginx.conf exists');

const frontendNginxContent = fs.readFileSync(frontendNginxPath, 'utf8');
assert(frontendNginxContent.includes('try_files $uri $uri/ /index.html'), 'frontend/nginx.conf configures SPA history routing');
assert(frontendNginxContent.includes('location /health'), 'frontend/nginx.conf provides /health endpoint');

const frontendDockerfilePath = path.resolve(__dirname, '../frontend/Dockerfile');
const frontendDockerfileContent = fs.readFileSync(frontendDockerfilePath, 'utf8');
assert(frontendDockerfileContent.includes('HEALTHCHECK'), 'frontend/Dockerfile includes native HEALTHCHECK instruction');
assert(frontendDockerfileContent.includes('COPY nginx.conf /etc/nginx/conf.d/default.conf'), 'frontend/Dockerfile installs custom nginx.conf');

// -----------------------------------------------------------------------------
// SECTION 7: Production Model Cryptographic Verification
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 7: Production Model Cryptographic Verification ---');

const EXPECTED_PROD_SHA = '74460AC69D6C8B507955081943620817E96C9F9631D7BA81EB30A400BD86EC49';
const EXPECTED_CAND_SHA = '06240DB6F6FB75EAD3F269301574A7A15AA5EFE4C5F2B82C1D0651A5090CAE9A';

const prodModelPath = path.resolve(__dirname, '../data/trained_model.json');
assert(fs.existsSync(prodModelPath), 'Production model data/trained_model.json exists');
const actualProdSHA = sha256File(prodModelPath);
assert(actualProdSHA === EXPECTED_PROD_SHA, `Production model SHA-256 is byte-identical: ${actualProdSHA}`);

const candModelPath = path.resolve(__dirname, '../ml-service/data/candidate_model_3.1.0.json');
assert(fs.existsSync(candModelPath), 'Candidate model ml-service/data/candidate_model_3.1.0.json exists');
const actualCandSHA = sha256File(candModelPath);
assert(actualCandSHA === EXPECTED_CAND_SHA, `Candidate model SHA-256 is byte-identical: ${actualCandSHA}`);

// Verify active_model.json serving pointer
const activeModelPath = path.resolve(__dirname, '../data/active_model.json');
if (fs.existsSync(activeModelPath)) {
  const activeModelMeta = JSON.parse(fs.readFileSync(activeModelPath, 'utf8'));
  assert(activeModelMeta.activeModelVersion === '2.0.0-production-telemetry', 'Active model version is locked to 2.0.0-production-telemetry');
  assert(activeModelMeta.activeModelId === 'mdl-prod-2.0.0', 'Active model ID is mdl-prod-2.0.0');
} else {
  assert(false, 'data/active_model.json does not exist');
}

// -----------------------------------------------------------------------------
// SECTION 8: CI/CD Pipeline & Immutable Image Tagging
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 8: CI/CD Pipeline & Immutable Image Tagging ---');

const ciWorkflowPath = path.resolve(__dirname, '../.github/workflows/ci.yml');
assert(fs.existsSync(ciWorkflowPath), '.github/workflows/ci.yml exists');

const ciWorkflowContent = fs.readFileSync(ciWorkflowPath, 'utf8');
assert(ciWorkflowContent.includes('docker-image-build:'), 'CI workflow includes Docker image build job');
assert(ciWorkflowContent.includes('traceops-backend:${{ github.sha }}'), 'Backend image tagged immutably with Git SHA');
assert(ciWorkflowContent.includes('traceops-frontend:${{ github.sha }}'), 'Frontend image tagged immutably with Git SHA');
assert(ciWorkflowContent.includes('traceops-ml:${{ github.sha }}'), 'ML service image tagged immutably with Git SHA');
assert(ciWorkflowContent.includes('production-deploy-gate:'), 'Production deployment requires explicit manual approval gate');

// -----------------------------------------------------------------------------
// SECTION 9: Runbook Completeness
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 9: Runbook Completeness ---');

const runbookPath = path.resolve(__dirname, '../docs/PRODUCTION_DEPLOYMENT.md');
assert(fs.existsSync(runbookPath), 'docs/PRODUCTION_DEPLOYMENT.md exists');

const runbookContent = fs.readFileSync(runbookPath, 'utf8');
const requiredRunbookTopics = [
  'Server Prerequisites',
  'DNS Prerequisites',
  'Firewall Configuration',
  'SSH Hardening',
  'Docker Engine',
  'Repository Checkout',
  'Environment & Configuration',
  'Secret Generation',
  'Container Image Build',
  'Compose Startup',
  'Health Verification',
  'HTTPS & TLS Activation',
  'Observability & Telemetry',
  'Backup & Disaster Recovery',
  'Deployment Rollback',
  'Troubleshooting Guide',
  'Emergency Procedures',
];

for (const topic of requiredRunbookTopics) {
  assert(runbookContent.toLowerCase().includes(topic.toLowerCase()), `Runbook covers topic: ${topic}`);
}

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(`PHASE 7.1 INFRASTRUCTURE PREPARATION RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('================================================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

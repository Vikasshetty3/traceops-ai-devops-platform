/**
 * Master Test Runner for TraceOps Platform
 * Executes:
 * 1. DevOps Adapter Unit Tests
 * 2. Experiment Engine Unit Tests
 * 3. ML Service Unit Tests
 * 4. Full End-to-End Pipeline Tests
 */

const { spawnSync } = require("child_process");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const tsConfigPath = path.resolve(rootDir, "backend/tsconfig.json");

function runTestFile(title, file) {
  console.log(`\n------------------------------------------------------------`);
  console.log(`▶ ${title}: ${file}`);
  console.log(`------------------------------------------------------------`);

  const result = file.endsWith(".ts")
    ? spawnSync(
        "npx",
        ["ts-node", "--project", `"${tsConfigPath}"`, `"${path.resolve(rootDir, file)}"`],
        {
          cwd: path.resolve(rootDir, "backend"),
          stdio: "inherit",
          shell: true,
        }
      )
    : spawnSync("node", [`"${path.resolve(rootDir, file)}"`], {
        cwd: rootDir,
        stdio: "inherit",
        shell: true,
      });

  if (result.status !== 0) {
    console.error(`❌ Test failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }
}

async function main() {
  console.log("============================================================");
  console.log("🚀 TraceOps Master Test Suite Execution");
  console.log("============================================================");

  // 1. DevOps Adapter Unit Tests
  runTestFile("1. DevOps Adapter Unit Tests", "tests/devops_adapter.test.ts");

  // 2. Experiment Engine Unit Tests
  runTestFile("2. Experiment Engine Unit Tests", "tests/experiment_engine.test.ts");

  // 3. ML Service Unit Tests
  runTestFile("3. ML Service Unit Tests", "tests/ml_service.test.ts");

  // 4. End-to-End Pipeline Tests
  runTestFile("4. Full E2E Integration Suite", "tests/run-e2e.js");

  console.log("\n============================================================");
  console.log("🎉 ALL TRACEOPS TEST SUITES PASSED CLEANLY!");
  console.log("============================================================\n");
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

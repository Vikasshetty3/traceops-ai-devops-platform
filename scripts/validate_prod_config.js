#!/usr/bin/env node
/**
 * TRACEOPS PRODUCTION CONFIGURATION VALIDATOR
 *
 * Validates production environment variables without logging secret credentials.
 * Fails fast with exit code 1 if insecure defaults or missing variables are detected.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../backend/.env") });
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const INSECURE_DEFAULTS = new Set([
  "traceops_production_secret_key_2026",
  "your_jwt_secret_key_here",
  "your_strong_jwt_secret_min_16_chars_here",
  "secret",
  "admin123",
  "password123",
]);

function validate() {
  console.log("================================================================================");
  console.log("TRACEOPS PRODUCTION CONFIGURATION AUDIT & VALIDATION");
  console.log("================================================================================\n");

  const errors = [];
  const warnings = [];

  const nodeEnv = process.env.NODE_ENV || "development";
  console.log(`[TARGET ENVIRONMENT] NODE_ENV = "${nodeEnv}"`);

  // 1. JWT Configuration
  const jwtSecret = (process.env.JWT_SECRET || "").trim();
  if (!jwtSecret) {
    errors.push("JWT_SECRET is missing or empty.");
  } else if (INSECURE_DEFAULTS.has(jwtSecret)) {
    errors.push("JWT_SECRET is set to an insecure default placeholder.");
  } else if (jwtSecret.length < 16) {
    errors.push(`JWT_SECRET is too short (${jwtSecret.length} chars). Minimum 16 required.`);
  } else {
    console.log("  ✓ JWT_SECRET: Strong cryptographically sized secret configured");
  }

  // 2. Database Configuration (MongoDB)
  const mongoUri = (process.env.MONGODB_URI || "").trim();
  if (!mongoUri) {
    errors.push("MONGODB_URI is missing.");
  } else if (!mongoUri.startsWith("mongodb://") && !mongoUri.startsWith("mongodb+srv://")) {
    errors.push("MONGODB_URI is malformed.");
  } else {
    const isLocalhost = mongoUri.includes("localhost") || mongoUri.includes("127.0.0.1");
    if (nodeEnv === "production" && isLocalhost) {
      warnings.push("MONGODB_URI points to localhost. Ensure container network DNS or remote cluster is intended.");
    }
    console.log("  ✓ MONGODB_URI: Valid MongoDB connection URI format");
  }

  // 3. CORS Configuration
  const corsOrigins = process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_URL || "";
  if (!corsOrigins) {
    warnings.push("CORS_ALLOWED_ORIGINS not explicitly set. Defaulting to standard frontend origins.");
  } else if (corsOrigins.trim() === "*") {
    errors.push("CORS_ALLOWED_ORIGINS cannot be '*' for authenticated production APIs.");
  } else {
    console.log(`  ✓ CORS_ALLOWED_ORIGINS: Valid explicit origin allowlist configured`);
  }

  // 4. Prometheus Configuration
  const promUrl = (process.env.PROMETHEUS_URL || "").trim();
  if (!promUrl) {
    warnings.push("PROMETHEUS_URL missing. Using default http://prometheus:9090");
  } else {
    console.log("  ✓ PROMETHEUS_URL: Configured");
  }

  // 5. ML Service Configuration
  const mlUrl = (process.env.ML_SERVICE_URL || "").trim();
  if (!mlUrl) {
    warnings.push("ML_SERVICE_URL missing. Using default http://ml-service:5001");
  } else {
    console.log("  ✓ ML_SERVICE_URL: Configured");
  }

  // 6. Gemini Configuration
  const geminiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!geminiKey || geminiKey === "your_gemini_api_key_here") {
    warnings.push("GEMINI_API_KEY missing or placeholder. Gemini AI reasoning will fallback to deterministic rules.");
  } else {
    console.log("  ✓ GEMINI_API_KEY: Configured (Redacted)");
  }

  // Report Warnings
  if (warnings.length > 0) {
    console.log("\nWarnings:");
    warnings.forEach((w) => console.log(`  ⚠ ${w}`));
  }

  // Report Errors
  if (errors.length > 0) {
    console.error("\nValidation Failures:");
    errors.forEach((e) => console.error(`  ✗ ${e}`));
    console.log("\nStatus: CONFIGURATION INVALID — PRODUCTION STARTUP BLOCKED\n");
    return false;
  }

  console.log("\nStatus: ALL CONFIGURATION CHECKS PASSED\n");
  return true;
}

if (require.main === module) {
  const success = validate();
  process.exit(success ? 0 : 1);
}

module.exports = { validate };

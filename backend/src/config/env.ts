import dotenv from "dotenv";

dotenv.config();

export interface AppConfig {
  NODE_ENV: string;
  PORT: number;
  FRONTEND_URL: string;
  BACKEND_URL: string;
  CORS_ALLOWED_ORIGINS: string[];
  MONGODB_URI: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  ADMIN_INIT_SECRET: string;
  GEMINI_API_KEY: string;
  PROMETHEUS_URL: string;
  ML_SERVICE_URL: string;
  MODEL_ARTIFACT_ROOT: string;
  DEVOPS_PROVIDER: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_AUTH_MAX: number;
  RATE_LIMIT_API_MAX: number;
  RATE_LIMIT_AI_MAX: number;
}

const INSECURE_JWT_DEFAULTS = new Set([
  "traceops_production_secret_key_2026",
  "your_jwt_secret_key_here",
  "your_strong_jwt_secret_min_16_chars_here",
  "secret",
  "admin123",
  "password123",
]);

/**
 * Validates configuration according to production security policies.
 * Fails fast without leaking secret values.
 */
export function validateProductionConfig(customEnv?: NodeJS.ProcessEnv): { valid: boolean; errors: string[] } {
  const targetEnv = customEnv || process.env;
  const isProd = (targetEnv.NODE_ENV || "").toLowerCase() === "production";
  const errors: string[] = [];

  if (isProd) {
    // 1. JWT_SECRET validation
    const secret = (targetEnv.JWT_SECRET || "").trim();
    if (!secret) {
      errors.push("Configuration Error: JWT_SECRET is required in production and cannot be empty.");
    } else if (INSECURE_JWT_DEFAULTS.has(secret) || secret.length < 16) {
      errors.push("Configuration Error: Insecure JWT_SECRET rejected. Production requires a strong secret of at least 16 characters.");
    }

    // 2. MONGODB_URI validation
    const mongoUri = (targetEnv.MONGODB_URI || "").trim();
    if (!mongoUri) {
      errors.push("Configuration Error: MONGODB_URI is required in production.");
    } else if (!mongoUri.startsWith("mongodb://") && !mongoUri.startsWith("mongodb+srv://")) {
      errors.push("Configuration Error: MONGODB_URI must be a valid mongodb:// or mongodb+srv:// connection URI.");
    }

    // 3. CORS origin validation
    const rawOrigins = targetEnv.CORS_ALLOWED_ORIGINS || targetEnv.FRONTEND_URL || "";
    if (rawOrigins.trim() === "*") {
      errors.push("Configuration Error: Wildcard '*' origin is prohibited for authenticated production APIs.");
    }

    // 4. Port validation
    if (targetEnv.PORT) {
      const portNum = Number(targetEnv.PORT);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        errors.push("Configuration Error: PORT must be a valid integer between 1 and 65535.");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function resolveCorsOrigins(): string[] {
  const explicit = process.env.CORS_ALLOWED_ORIGINS;
  if (explicit && explicit.trim()) {
    return explicit
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }

  const frontendUrl = process.env.FRONTEND_URL;
  if (frontendUrl && frontendUrl.trim()) {
    return [frontendUrl.trim()];
  }

  // Development defaults
  return ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"];
}

const isProduction = (process.env.NODE_ENV || "").toLowerCase() === "production";

// Resolve JWT secret: in production, never silently fall back to insecure default
const resolvedJwtSecret = process.env.JWT_SECRET
  ? process.env.JWT_SECRET.trim()
  : (isProduction ? "" : "traceops_dev_secret_key_only_non_prod");

export const env: AppConfig = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT) || 5000,
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173",
  BACKEND_URL: process.env.BACKEND_URL || "http://localhost:5000",
  CORS_ALLOWED_ORIGINS: resolveCorsOrigins(),
  MONGODB_URI:
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/requirement_traceable_devops",
  JWT_SECRET: resolvedJwtSecret,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  ADMIN_INIT_SECRET: process.env.ADMIN_INIT_SECRET || "",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  PROMETHEUS_URL: process.env.PROMETHEUS_URL || "http://localhost:9090",
  ML_SERVICE_URL: process.env.ML_SERVICE_URL || "http://localhost:5001",
  MODEL_ARTIFACT_ROOT: process.env.MODEL_ARTIFACT_ROOT || "data",
  DEVOPS_PROVIDER: process.env.DEVOPS_PROVIDER || "simulation",
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  RATE_LIMIT_AUTH_MAX: Number(process.env.RATE_LIMIT_AUTH_MAX) || 30,
  RATE_LIMIT_API_MAX: Number(process.env.RATE_LIMIT_API_MAX) || 100,
  RATE_LIMIT_AI_MAX: Number(process.env.RATE_LIMIT_AI_MAX) || 20,
};
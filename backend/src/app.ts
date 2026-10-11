import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";

import { env } from "./config/env";
import {
  correlationIdMiddleware,
  requestLoggerMiddleware,
  errorHandler,
  extractUser,
  authRateLimiter,
  apiRateLimiter,
  aiRcaRateLimiter,
  inputSanitizerMiddleware,
} from "./middleware";

import requirementRoutes from "./routes/requirementRoutes";
import sloRoutes from "./routes/sloRoutes";
import traceabilityRoutes from "./routes/traceabilityRoutes";
import sloEvaluationRoutes from "./routes/sloEvaluationRoutes";
import incidentRoutes from "./routes/incidentRoutes";
import rcaRoutes from "./routes/rcaRoutes";
import aiRcaRoutes from "./routes/aiRcaRoutes";
import mlGovernanceRoutes from "./routes/mlGovernanceRoutes";
import mlRoutes from "./routes/mlRoutes";
import geminiRcaRoutes from "./routes/geminiRcaRoutes";
import telemetryRoutes from "./routes/telemetryRoutes";
import experimentRoutes from "./routes/experimentRoutes";
import devopsRoutes from "./routes/devopsRoutes";
import metricsRoutes from "./routes/metricsRoutes";
import projectRoutes from "./routes/projectRoutes";
import repairRoutes from "./routes/repairRoutes";
import authRoutes from "./routes/authRoutes";
import telemetryObservationRoutes from "./routes/telemetryObservationRoutes";
import { getPrometheusMetrics } from "./controllers/metricsController";
import { httpMetricsMiddleware } from "./services/telemetryInstrumentation";

const app = express();

// Security Headers (configured to protect without breaking React SPA)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(correlationIdMiddleware);
app.use(requestLoggerMiddleware);
app.use(httpMetricsMiddleware);

// Hardened CORS Configuration
const allowedOrigins = new Set(env.CORS_ALLOWED_ORIGINS);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server, unit tests)
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      // In non-production, allow localhost origins
      if (env.NODE_ENV !== "production") {
        if (
          origin.startsWith("http://localhost:") ||
          origin.startsWith("http://127.0.0.1:")
        ) {
          return callback(null, true);
        }
      }
      callback(new Error(`CORS Violation: Origin "${origin}" is not allowed by policy.`));
    },
    credentials: true,
  })
);

// Body Parsing with Request Size Limits
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Security Sanitization (Prototype Pollution & Injection Prevention)
app.use(inputSanitizerMiddleware);

// User Authentication Extraction
app.use(extractUser);

// Health & Readiness Endpoints (Exempt from Rate Limiting)
const handleLiveness = (req: Request, res: Response) => {
  res.status(200).json({
    status: "UP",
    service: "traceops-backend",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    correlationId: req.correlationId,
  });
};

const handleReadiness = (req: Request, res: Response) => {
  const dbState = mongoose.connection.readyState;
  const isDbReady = dbState === 1;

  if (isDbReady) {
    res.status(200).json({
      status: "READY",
      service: "traceops-backend",
      database: "CONNECTED",
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
    });
  } else {
    res.status(503).json({
      status: "NOT_READY",
      service: "traceops-backend",
      database: dbState === 2 ? "CONNECTING" : "DISCONNECTED",
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
    });
  }
};

app.get("/health", handleLiveness);
app.get("/health/ready", handleReadiness);
app.get("/api/health", handleLiveness);
app.get("/api/health/ready", handleReadiness);

// Prometheus scraper endpoint
app.get("/metrics", getPrometheusMetrics);

// Core API endpoints with Sensitive Rate Limiting
app.use("/api/auth", authRateLimiter, authRoutes);
app.use("/api/projects", apiRateLimiter, projectRoutes);
app.use("/api/requirements", apiRateLimiter, requirementRoutes);
app.use("/api/slos", apiRateLimiter, sloRoutes);
app.use("/api/traceability", apiRateLimiter, traceabilityRoutes);
app.use("/api/slo-evaluation", apiRateLimiter, sloEvaluationRoutes);
app.use("/api/incidents", apiRateLimiter, incidentRoutes);
app.use("/api/rca", apiRateLimiter, rcaRoutes);
app.use("/api/ai-rca", aiRcaRateLimiter, aiRcaRoutes);
app.use("/api/ml/governance", apiRateLimiter, mlGovernanceRoutes);
app.use("/api/ml", apiRateLimiter, mlRoutes);
app.use("/api/gemini-rca", aiRcaRateLimiter, geminiRcaRoutes);
app.use("/api/experiments", apiRateLimiter, experimentRoutes);
app.use("/api/devops", apiRateLimiter, devopsRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/api/telemetry", apiRateLimiter, telemetryRoutes);
app.use("/api/telemetry-observations", apiRateLimiter, telemetryObservationRoutes);
app.use("/api", apiRateLimiter, repairRoutes);

// Controlled test failure endpoint for genuine Prometheus runtime telemetry generation
app.post("/api/test/failure-mode", (req, res) => {
  const { statusCode = 500, message = "Database connection pool timeout on traceops-backend service" } = req.body || {};
  const code = Number(statusCode) || 500;
  console.error(`[traceops-backend] ERROR: HTTP ${code} Internal Server Error: ${message} - upstream gateway timeout`);
  res.status(code).json({
    success: false,
    failureMode: true,
    message,
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint
app.get("/", (_req, res) => {
  res.status(200).json({
    name: "Requirement-Traceable Autonomous DevOps Platform API",
    version: "1.0.0",
    status: "ONLINE",
    message: "TraceOps backend API is operational.",
    endpoints: {
      health: "/health",
      readiness: "/health/ready",
      metrics: "/metrics",
      projects: "/api/projects",
      requirements: "/api/requirements",
      slos: "/api/slos",
      traceability: "/api/traceability",
      sloEvaluation: "/api/slo-evaluation",
      incidents: "/api/incidents",
      rca: "/api/rca",
      geminiRca: "/api/gemini-rca/analyze",
      mlPredict: "/api/ml/predict",
      mlGovernance: "/api/ml/governance",
      experiments: "/api/experiments",
      devops: "/api/devops",
      repairs: "/api/repairs",
      deployments: "/api/deployments",
      telemetryObservations: "/api/telemetry-observations",
    },
    frontend: env.FRONTEND_URL,
  });
});

// Centralized error handling
app.use(errorHandler);

export default app;
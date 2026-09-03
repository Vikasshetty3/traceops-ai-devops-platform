import express from "express";
import cors from "cors";
import helmet from "helmet";

import {
  correlationIdMiddleware,
  requestLoggerMiddleware,
  errorHandler,
} from "./middleware";

import requirementRoutes from "./routes/requirementRoutes";
import sloRoutes from "./routes/sloRoutes";
import traceabilityRoutes from "./routes/traceabilityRoutes";
import sloEvaluationRoutes from "./routes/sloEvaluationRoutes";
import incidentRoutes from "./routes/incidentRoutes";
import rcaRoutes from "./routes/rcaRoutes";
import aiRcaRoutes from "./routes/aiRcaRoutes";
import mlRoutes from "./routes/mlRoutes";
import geminiRcaRoutes from "./routes/geminiRcaRoutes";
import experimentRoutes from "./routes/experimentRoutes";
import devopsRoutes from "./routes/devopsRoutes";
import metricsRoutes from "./routes/metricsRoutes";
import { getPrometheusMetrics } from "./controllers/metricsController";

const app = express();

// Security & Correlation
app.use(helmet());
app.use(correlationIdMiddleware);
app.use(requestLoggerMiddleware);

app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Core API endpoints
app.use("/api/requirements", requirementRoutes);
app.use("/api/slos", sloRoutes);
app.use("/api/traceability", traceabilityRoutes);
app.use("/api/slo-evaluation", sloEvaluationRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/rca", rcaRoutes);
app.use("/api/ai-rca", aiRcaRoutes);
app.use("/api/ml", mlRoutes);
app.use("/api/gemini-rca", geminiRcaRoutes);
app.use("/api/experiments", experimentRoutes);
app.use("/api/devops", devopsRoutes);
app.use("/api/metrics", metricsRoutes);

// Prometheus scraper endpoint
app.get("/metrics", getPrometheusMetrics);

// Root endpoint
app.get("/", (_req, res) => {
  res.status(200).json({
    name: "Requirement-Traceable Autonomous DevOps Platform API",
    version: "1.0.0",
    status: "ONLINE",
    message: "TraceOps backend API is operational.",
    endpoints: {
      health: "/api/health",
      metrics: "/metrics",
      requirements: "/api/requirements",
      slos: "/api/slos",
      traceability: "/api/traceability",
      sloEvaluation: "/api/slo-evaluation",
      incidents: "/api/incidents",
      rca: "/api/rca",
      geminiRca: "/api/gemini-rca/analyze",
      mlPredict: "/api/ml/predict",
      experiments: "/api/experiments",
      devops: "/api/devops",
    },
    frontend: "http://localhost:5173",
  });
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Requirement-Traceable DevOps backend is running",
    timestamp: new Date().toISOString(),
    correlationId: _req.correlationId,
  });
});

// Centralized error handling
app.use(errorHandler);

export default app;
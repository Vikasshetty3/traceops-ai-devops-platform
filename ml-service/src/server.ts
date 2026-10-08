import express, { Request, Response } from "express";
import cors from "cors";
import { SLOViolationClassifier } from "./model";

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Load trained model if available on filesystem
SLOViolationClassifier.loadTrainedModel();
// Load candidate model if artifact exists on filesystem
SLOViolationClassifier.loadCandidateModel();

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "HEALTHY",
    service: "traceops-ml-service",
    model: "LogisticRegression-SLOClassifier",
    modelVersion: SLOViolationClassifier.MODEL_VERSION,
    servingStatus: "LIVE_SERVING",
    schemaVersion: SLOViolationClassifier.FEATURE_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
  });
});

app.get("/model-info", (req: Request, res: Response) => {
  const modelType = (req.query.model || req.query.version || "").toString().toLowerCase();
  if (modelType === "candidate" || modelType === "3.0.0-real-runtime-training") {
    const candidateInfo = SLOViolationClassifier.getCandidateModelInfo();
    if (!candidateInfo) {
      return res.status(404).json({ success: false, message: "Candidate model 3.0.0 not found or not loaded" });
    }
    return res.status(200).json({ success: true, data: candidateInfo });
  }
  res.status(200).json({
    success: true,
    data: SLOViolationClassifier.getModelInfo(),
  });
});

app.get("/models", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: SLOViolationClassifier.getRegistry(),
  });
});

app.post("/internal/hot-swap", (req: Request, res: Response) => {
  try {
    const { modelData, artifactPath, artifactSHA } = req.body || {};
    if (!modelData || !artifactPath || !artifactSHA) {
      return res.status(400).json({
        success: false,
        error: "modelData, artifactPath, and artifactSHA are required",
      });
    }
    SLOViolationClassifier.setActiveProductionModel(modelData, artifactPath, artifactSHA);
    return res.status(200).json({
      success: true,
      message: `Model ${modelData.modelVersion} activated successfully`,
      activeModel: SLOViolationClassifier.getModelInfo(),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/internal/reset-baseline", (_req: Request, res: Response) => {
  try {
    SLOViolationClassifier.resetToProductionBaseline();
    return res.status(200).json({
      success: true,
      message: "Reset to production baseline successfully",
      activeModel: SLOViolationClassifier.getModelInfo(),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/predict", (req: Request, res: Response): void => {
  try {
    const {
      incidentId,
      sloId,
      requirementId,
      service,
      featureTimestamp,
      features,
      featureSources,
      // Direct feature fields
      cpuUsage,
      memoryUsage,
      errorRate,
      latency,
      p95Latency,
      requestRate,
      deploymentChanged,
    } = req.body;

    const requestedModel = (req.query.model || req.body.model || "").toString().toLowerCase();
    const isCandidate =
      requestedModel === "candidate" ||
      requestedModel === "3.0.0-real-runtime-training" ||
      requestedModel === "3.1.0-real-runtime-training";

    // Rule 5: NO DEFAULT SERVICE. Must come from caller or incident context.
    if (!service || typeof service !== "string" || service.trim() === "") {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "service is required. No default service is permitted.",
      });
      return;
    }

    // Rule 6: NO DEFAULT REQUIREMENT. Must be genuine or null.
    const resolvedRequirementId =
      requirementId !== undefined && requirementId !== null && requirementId !== "UNLINKED"
        ? String(requirementId)
        : null;

    // Merge direct telemetry or nested features object
    const effectiveFeatures = {
      cpuUsage: features?.cpuUsage !== undefined ? features.cpuUsage : cpuUsage,
      memoryUsage: features?.memoryUsage !== undefined ? features.memoryUsage : memoryUsage,
      errorRate: features?.errorRate !== undefined ? features.errorRate : errorRate,
      p95Latency:
        features?.p95Latency !== undefined
          ? features.p95Latency
          : p95Latency !== undefined
          ? p95Latency
          : features?.latency !== undefined
          ? features.latency
          : latency,
      latency:
        features?.latency !== undefined
          ? features.latency
          : latency !== undefined
          ? latency
          : features?.p95Latency !== undefined
          ? features.p95Latency
          : p95Latency,
      requestRate: features?.requestRate !== undefined ? features.requestRate : requestRate,
      deploymentChanged:
        features?.deploymentChanged !== undefined ? features.deploymentChanged : deploymentChanged,
    };

    const prediction = isCandidate
      ? SLOViolationClassifier.predictCandidate(effectiveFeatures)
      : SLOViolationClassifier.predict(effectiveFeatures);

    if (prediction.status === "INSUFFICIENT_TELEMETRY") {
      res.status(200).json({
        success: false,
        status: "INSUFFICIENT_TELEMETRY",
        message: "Insufficient telemetry for ML prediction",
        missingFeatures: prediction.missingFeatures,
        service: service.trim(),
        requirementId: resolvedRequirementId,
        incidentId: incidentId || undefined,
        sloId: sloId || undefined,
        modelVersion: prediction.modelVersion,
        schemaVersion: SLOViolationClassifier.FEATURE_SCHEMA_VERSION,
      });
      return;
    }

    const effectiveTimestamp = featureTimestamp || new Date().toISOString();

    res.status(200).json({
      success: true,
      status: "SUCCESS",
      data: {
        service: service.trim(),
        requirementId: resolvedRequirementId,
        incidentId: incidentId || undefined,
        sloId: sloId || undefined,
        featureTimestamp: effectiveTimestamp,
        features: {
          cpuUsage: effectiveFeatures.cpuUsage,
          memoryUsage: effectiveFeatures.memoryUsage,
          p95Latency: effectiveFeatures.p95Latency,
          errorRate: effectiveFeatures.errorRate,
          requestRate: effectiveFeatures.requestRate,
          deploymentChanged: effectiveFeatures.deploymentChanged ? 1 : 0,
        },
        featureSources: featureSources || undefined,
        ...prediction,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      status: "ERROR",
      message: error.message || "ML Prediction evaluation failed",
    });
  }
});

// Start listener only when run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Phase 3 Production ML Prediction Service running on http://localhost:${PORT}`);
  });
}

export default app;

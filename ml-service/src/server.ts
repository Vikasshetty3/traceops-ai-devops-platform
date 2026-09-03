import express, { Request, Response } from "express";
import cors from "cors";
import { SLOViolationClassifier } from "./model";

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Load trained model if available on filesystem
SLOViolationClassifier.loadTrainedModel();

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "HEALTHY",
    service: "traceops-ml-service",
    model: "LogisticRegression-SLOClassifier-v1",
    timestamp: new Date().toISOString(),
  });
});

app.get("/model-info", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: SLOViolationClassifier.getModelInfo(),
  });
});

app.post("/predict", (req: Request, res: Response): void => {
  try {
    const {
      requirementId,
      service,
      cpuUsage,
      memoryUsage,
      errorRate,
      latency,
      requestRate,
      dbPoolUsage,
      deploymentChanged,
    } = req.body;

    if (
      cpuUsage === undefined ||
      memoryUsage === undefined ||
      errorRate === undefined ||
      latency === undefined
    ) {
      res.status(400).json({
        success: false,
        message: "Missing required telemetry features (cpuUsage, memoryUsage, errorRate, latency)",
      });
      return;
    }

    const prediction = SLOViolationClassifier.predict({
      cpuUsage: Number(cpuUsage),
      memoryUsage: Number(memoryUsage),
      errorRate: Number(errorRate),
      latency: Number(latency),
      requestRate: requestRate !== undefined ? Number(requestRate) : undefined,
      dbPoolUsage: dbPoolUsage !== undefined ? Number(dbPoolUsage) : undefined,
      deploymentChanged,
    });

    res.status(200).json({
      success: true,
      data: {
        requirementId: requirementId || "REQ-001",
        service: service || "Checkout",
        ...prediction,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "ML Prediction evaluation failed",
      error: error instanceof Error ? error.message : error,
    });
  }
});

// Start listener only when run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Research-Grade ML Prediction Service running on http://localhost:${PORT}`);
  });
}

export default app;

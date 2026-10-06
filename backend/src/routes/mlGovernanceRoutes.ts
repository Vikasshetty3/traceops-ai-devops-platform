import express from "express";
import {
  registerModel,
  listModels,
  getModel,
  getModelEvaluations,
  recordEvaluation,
  requestApproval,
  reviewApproval,
  getModelAudit,
  registerDataset,
  listDatasets,
  getDataset,
} from "../controllers/mlGovernanceController";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware";

const router = express.Router();

// Model Registry Endpoints
router.post("/models", registerModel);
router.get("/models", listModels);
router.get("/models/:modelId", getModel);

// Evaluation Records
router.get("/models/:modelId/evaluations", getModelEvaluations);
router.post("/models/:modelId/evaluations", recordEvaluation);

// Approval Workflow
router.post("/models/:modelId/approval/request", requestApproval);
router.post("/models/:modelId/approval", requireAuth, requireAdmin, reviewApproval);

// Audit Trail & Cryptographic Chain Verification
router.get("/models/:modelId/audit", getModelAudit);

// Dataset Provenance Endpoints
router.post("/datasets", registerDataset);
router.get("/datasets", listDatasets);
router.get("/datasets/:datasetId", getDataset);

export default router;

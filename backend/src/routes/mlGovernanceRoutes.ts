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
  getPromotionReadiness,
  promoteModel,
  getPromotionStatus,
  rollbackModel,
  getRollbackStatus,
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

// Batch D2: Model Promotion & Safety Gates
router.get("/models/:modelId/promotion-readiness", requireAuth, getPromotionReadiness);
router.post("/models/:modelId/promote", requireAuth, requireAdmin, promoteModel);
router.get("/models/:modelId/promotion-status", requireAuth, getPromotionStatus);

// Batch D3: Model Rollback & Predecessor Restoration
router.post("/models/:modelId/rollback", requireAuth, requireAdmin, rollbackModel);
router.get("/models/:modelId/rollback-status", requireAuth, getRollbackStatus);

// Prohibited Endpoints: Direct / un-scoped mutations fail closed with 404
router.post("/rollback", (_req, res) => {
  res.status(404).json({ success: false, error: "Not Found: Direct rollback endpoint is prohibited." });
});
router.post("/promote", (_req, res) => {
  res.status(404).json({ success: false, error: "Not Found: Direct promote endpoint is prohibited." });
});

// Audit Trail & Cryptographic Chain Verification
router.get("/models/:modelId/audit", getModelAudit);

// Dataset Provenance Endpoints
router.post("/datasets", registerDataset);
router.get("/datasets", listDatasets);
router.get("/datasets/:datasetId", getDataset);

export default router;

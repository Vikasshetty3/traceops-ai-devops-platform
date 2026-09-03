import { Router } from "express";
import {
  analyzeProjectIssues,
  getProjectIssues,
  getIssueById,
  createRepair,
  getRepairById,
  getRepairDiff,
  validateRepair,
  approveRepair,
  rejectRepair,
  deployRepair,
  getDeploymentById,
  rollbackDeployment,
  getRepairHistory,
  probeDeployment,
} from "../controllers/repairController";

const router = Router();

// Project Issue Discovery
router.post("/projects/:projectId/analyze-issues", analyzeProjectIssues);
router.get("/projects/:projectId/issues", getProjectIssues);
router.get("/projects/:projectId/repair-history", getRepairHistory);

// Issues
router.get("/issues/:issueId", getIssueById);
router.post("/issues/:issueId/repair", createRepair);

// Repairs & Validation
router.get("/repairs/:repairId", getRepairById);
router.get("/repairs/:repairId/diff", getRepairDiff);
router.post("/repairs/:repairId/validate", validateRepair);
router.post("/repairs/:repairId/approve", approveRepair);
router.post("/repairs/:repairId/reject", rejectRepair);
router.post("/repairs/:repairId/deploy", deployRepair);

// Deployments & Rollback
router.get("/deployments/:deploymentId", getDeploymentById);
router.get("/deployments/:deploymentId/probe", probeDeployment);
router.post("/deployments/:deploymentId/rollback", rollbackDeployment);

export default router;

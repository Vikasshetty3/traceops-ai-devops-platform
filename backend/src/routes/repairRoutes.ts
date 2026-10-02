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
  downloadRepairedProject,
  downloadLatestRepairedProject,
  createIncidentRepair,
  verifyRepairEvidence,
} from "../controllers/repairController";

const router = Router();

// Project Issue Discovery
router.post("/projects/:projectId/analyze-issues", analyzeProjectIssues);
router.get("/projects/:projectId/issues", getProjectIssues);
router.get("/projects/:projectId/repair-history", getRepairHistory);
router.get("/projects/:projectId/download-repaired", downloadLatestRepairedProject);
router.get("/projects/:projectId/repairs/:repairId/download", downloadRepairedProject);

// Issues
router.get("/issues/:issueId", getIssueById);
router.post("/issues/:issueId/repair", createRepair);

// Phase 5.2 — Incident-Driven RCA Repair Contract
router.post("/incidents/:incidentId/repair", createIncidentRepair);

// Repairs & Validation
router.get("/repairs/:repairId", getRepairById);
router.get("/repairs/:repairId/verify-evidence", verifyRepairEvidence);
router.get("/repairs/:repairId/diff", getRepairDiff);
router.post("/repairs/:repairId/validate", validateRepair);
router.post("/repairs/:repairId/approve", approveRepair);
router.post("/repairs/:repairId/reject", rejectRepair);
router.post("/repairs/:repairId/deploy", deployRepair);
router.get("/repairs/:repairId/download", downloadRepairedProject);

// Deployments & Rollback
router.get("/deployments/:deploymentId", getDeploymentById);
router.get("/deployments/:deploymentId/verify", getDeploymentById);
router.get("/deployments/:deploymentId/probe", probeDeployment);
router.post("/deployments/:deploymentId/rollback", rollbackDeployment);

export default router;

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
  verifyDeploymentSLO,
  getDeploymentAuditEvents,
  verifyDeploymentAuditChain,
  getDeploymentTraffic,
  setDeploymentTraffic,
  advanceDeploymentTraffic,
  proxyDeploymentGateway,
  startCanaryDeployment,
  advanceCanaryDeployment,
  getCanaryDeploymentStatus,
  abortCanaryDeployment,
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
router.post("/deployments/:deploymentId/verify", verifyDeploymentSLO);
router.get("/deployments/:deploymentId/probe", probeDeployment);
router.post("/deployments/:deploymentId/rollback", rollbackDeployment);

// Phase 5.3 Batch C1 — Cryptographic Audit Logging
router.get("/deployments/:deploymentId/audit-events", getDeploymentAuditEvents);
router.get("/deployments/:deploymentId/audit-events/verify", verifyDeploymentAuditChain);

// Phase 5.3 Batch C2 — Dynamic Traffic Routing Subsystem
router.get("/deployments/:deploymentId/traffic", getDeploymentTraffic);
router.post("/deployments/:deploymentId/traffic", setDeploymentTraffic);
router.post("/deployments/:deploymentId/traffic/advance", advanceDeploymentTraffic);
router.use("/deployments/:deploymentId/gateway", proxyDeploymentGateway);

// Phase 5.3 Batch C3 — Canary Progression Controller
router.post("/deployments/:deploymentId/canary/start", startCanaryDeployment);
router.post("/deployments/:deploymentId/canary/advance", advanceCanaryDeployment);
router.get("/deployments/:deploymentId/canary/status", getCanaryDeploymentStatus);
router.post("/deployments/:deploymentId/canary/abort", abortCanaryDeployment);

export default router;

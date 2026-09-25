import { Router } from "express";
import multer from "multer";
import {
  createProject,
  uploadAndAnalyzeProject,
  onboardGithubProject,
  checkGithubUpdates,
  getProjects,
  getProjectById,
  getProjectTraceability,
  getProjectRequirements,
  getProjectSLOs,
  deleteProject,
} from "../controllers/projectController";
import {
  downloadRepairedProject,
  downloadLatestRepairedProject,
} from "../controllers/repairController";

const router = Router();

// Configure multer for memory storage with 50MB maximum archive size
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Project endpoints
router.get("/", getProjects);
router.post("/", createProject);

// Upload & analyze project ZIP
router.post("/upload", upload.any(), uploadAndAnalyzeProject);
router.post("/:projectId/upload", upload.any(), uploadAndAnalyzeProject);
router.post("/:projectId/analyze", upload.any(), uploadAndAnalyzeProject);

// GitHub repository onboarding & update check
router.post("/github", onboardGithubProject);
router.get("/:projectId/github-updates", checkGithubUpdates);

// Project details, Requirements, SLOs & Traceability
router.get("/:projectId", getProjectById);
router.get("/:projectId/analysis", getProjectById);
router.get("/:projectId/requirements", getProjectRequirements);
router.get("/:projectId/slos", getProjectSLOs);
router.get("/:projectId/traceability", getProjectTraceability);
router.get("/:projectId/download-repaired", downloadLatestRepairedProject);
router.get("/:projectId/repairs/:repairId/download", downloadRepairedProject);
router.delete("/:projectId", deleteProject);

export default router;

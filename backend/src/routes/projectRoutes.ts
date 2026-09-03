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
  deleteProject,
} from "../controllers/projectController";

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

// Project details & Traceability
router.get("/:projectId", getProjectById);
router.get("/:projectId/analysis", getProjectById);
router.get("/:projectId/traceability", getProjectTraceability);
router.delete("/:projectId", deleteProject);

export default router;

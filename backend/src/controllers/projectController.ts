import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import os from "os";
import { Project } from "../models/Project";
import { Requirement } from "../models/Requirement";
import { SLO } from "../models/SLO";
import { Traceability } from "../models/Traceability";
import { ProjectAnalyzerService } from "../services/projectAnalyzerService";
import { ProjectStorageService } from "../services/projectStorageService";
import { GithubRepositoryService } from "../services/githubRepositoryService";

/**
 * Register a new project record
 */
export const createProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, sourceType } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ success: false, message: "Project name is required" });
      return;
    }

    const projectId = `PROJ-${Date.now().toString().slice(-6)}`;
    const project = await Project.create({
      projectId,
      name,
      description: description || "",
      sourceType: sourceType || "ZIP_UPLOAD",
      status: "UPLOADED",
      techStack: {
        languages: [],
        frameworks: [],
        buildTools: [],
        databases: [],
        containerization: [],
        cicd: [],
      },
      services: [],
      analysisSummary: {
        totalFiles: 0,
        totalLinesOfCode: 0,
        explicitRequirementsCount: 0,
        inferredRequirementsCount: 0,
        slosCount: 0,
        servicesCount: 0,
        dockerDetected: false,
        k8sDetected: false,
        cicdDetected: false,
        architectureType: "MODULAR_SERVICE",
      },
      extractedRequirements: [],
      generatedSLOs: [],
    });

    res.status(201).json({
      success: true,
      message: "Project created successfully",
      data: project,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create project",
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Handle ZIP upload & execute complete static analysis pipeline
 */
export const uploadAndAnalyzeProject = async (req: Request, res: Response): Promise<void> => {
  let tempExtractDir: string | null = null;
  try {
    const file =
      req.file ||
      (Array.isArray(req.files) ? req.files[0] : undefined) ||
      (req.files ? Object.values(req.files).flat()[0] : undefined);
    const { name, description } = req.body;
    const requestedId = req.params.projectId;

    if (!file) {
      res.status(400).json({ success: false, message: "Project ZIP file is required" });
      return;
    }

    const rawId = req.params.projectId;
    const projectId =
      rawId && rawId !== "new"
        ? String(rawId)
        : `PROJ-${Date.now().toString().slice(-6)}`;
    const projectName = String(name || file.originalname.replace(/\.zip$/i, "") || "Uploaded Project");

    // Save and extract into persistent storage for code repair & deployment
    const { archivePath, sourceDir } = ProjectStorageService.saveAndExtractProjectArchive(
      projectId,
      file.buffer
    );

    // Perform static analysis & requirement extraction directly on stored source
    const analysisResult = await ProjectAnalyzerService.analyzeDirectory(
      projectId,
      projectName,
      sourceDir
    );

    // Persist to MongoDB
    const savedProject = await ProjectAnalyzerService.persistProjectAnalysis(
      analysisResult,
      "ZIP_UPLOAD"
    );

    // Update project with archive and source paths
    savedProject.archivePath = archivePath;
    savedProject.sourcePath = sourceDir;
    await savedProject.save();

    res.status(200).json({
      success: true,
      message: "Project successfully analyzed and integrated with operational model",
      data: {
        project: savedProject,
        analysis: analysisResult,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to analyze project archive",
      error: error instanceof Error ? error.message : error,
    });
  } finally {
    // Cleanup temporary extraction directory
    if (tempExtractDir && fs.existsSync(tempExtractDir)) {
      try {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      } catch {}
    }
  }
};

/**
 * Onboard & analyze a public GitHub repository
 */
export const onboardGithubProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { repositoryUrl, branch, name } = req.body;

    if (!repositoryUrl || typeof repositoryUrl !== "string") {
      res.status(400).json({
        success: false,
        message: "A valid public GitHub repository URL is required.",
      });
      return;
    }

    const projectId = `PROJ-${Date.now().toString().slice(-6)}`;

    // Acquire repository via safe git clone in sandbox
    const cloneResult = await GithubRepositoryService.cloneAndAcquireRepository(
      projectId,
      repositoryUrl,
      branch
    );

    const projectName = String(
      name || `${cloneResult.repositoryOwner}/${cloneResult.repositoryName}`
    );

    // Perform static architecture, requirement, and SLO analysis
    const analysisResult = await ProjectAnalyzerService.analyzeDirectory(
      projectId,
      projectName,
      cloneResult.sourceDir
    );

    // Persist project model with GitHub metadata
    const savedProject = await ProjectAnalyzerService.persistProjectAnalysis(
      analysisResult,
      "GITHUB"
    );

    savedProject.archivePath = cloneResult.archivePath;
    savedProject.sourcePath = cloneResult.sourceDir;
    savedProject.repositoryUrl = cloneResult.repositoryUrl;
    savedProject.repositoryOwner = cloneResult.repositoryOwner;
    savedProject.repositoryName = cloneResult.repositoryName;
    savedProject.repositoryBranch = cloneResult.branch;
    savedProject.commitSha = cloneResult.commitSha;
    await savedProject.save();

    res.status(200).json({
      success: true,
      message: "GitHub repository successfully acquired, analyzed, and integrated",
      data: {
        project: savedProject,
        analysis: analysisResult,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to onboard GitHub repository",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Check if a new commit is available on the remote repository
 */
export const checkGithubUpdates = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const project = await Project.findOne({ projectId });

    if (!project) {
      res.status(404).json({ success: false, message: "Project not found." });
      return;
    }

    if (project.sourceType !== "GITHUB" || !project.repositoryUrl) {
      res.status(400).json({
        success: false,
        message: "Project was not onboarded from a GitHub repository.",
      });
      return;
    }

    const { latestCommitSha, branch } = await GithubRepositoryService.getLatestRemoteCommit(
      project.repositoryUrl,
      project.repositoryBranch || "HEAD"
    );

    const hasNewCommit = project.commitSha ? project.commitSha !== latestCommitSha : false;

    res.status(200).json({
      success: true,
      data: {
        projectId: project.projectId,
        currentCommitSha: project.commitSha,
        latestCommitSha,
        branch,
        hasNewCommit,
        status: hasNewCommit ? "UPDATE_AVAILABLE" : "UP_TO_DATE",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to check for repository updates",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Get all onboarded projects
 */
export const getProjects = async (_req: Request, res: Response): Promise<void> => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      data: projects,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to retrieve projects",
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Get single project with associated requirements and SLOs
 */
export const getProjectById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const project = await Project.findOne({ projectId });

    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }

    const requirements = await Requirement.find({
      $or: [{ projectId }, { requirementId: { $in: project.extractedRequirements } }],
    });

    const slos = await SLO.find({
      $or: [{ projectId }, { sloId: { $in: project.generatedSLOs } }],
    });

    const traces = await Traceability.find({ projectId });

    res.status(200).json({
      success: true,
      data: {
        project,
        requirements,
        slos,
        traceability: traces,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to retrieve project details",
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Get project-scoped traceability graph
 */
export const getProjectTraceability = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const traces = await Traceability.find({ projectId });
    const reqs = await Requirement.find({ projectId });
    const slos = await SLO.find({ projectId });

    res.status(200).json({
      success: true,
      data: {
        projectId,
        traceCount: traces.length,
        nodes: traces,
        requirements: reqs,
        slos: slos,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to retrieve project traceability",
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Delete project and clean up extracted artifacts
 */
export const deleteProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const project = await Project.findOneAndDelete({ projectId });

    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }

    await Requirement.deleteMany({ projectId });
    await SLO.deleteMany({ projectId });
    await Traceability.deleteMany({ projectId });

    res.status(200).json({
      success: true,
      message: "Project and extracted models deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete project",
      error: error instanceof Error ? error.message : error,
    });
  }
};

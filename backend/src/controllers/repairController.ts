import { Request, Response } from "express";
import mongoose from "mongoose";
import { CodeIssue } from "../models/CodeIssue";
import { CodeRepair } from "../models/CodeRepair";
import { Deployment } from "../models/Deployment";
import { DeploymentVerification } from "../models/DeploymentVerification";
import { Project } from "../models/Project";
import { CodeIssueDetector } from "../services/codeIssueDetector";
import { CodeRepairService } from "../services/codeRepairService";
import { ValidationService } from "../services/validationService";
import { DockerDeploymentProvider } from "../services/dockerDeploymentProvider";
import { ProjectStorageService } from "../services/projectStorageService";

/**
 * Trigger static issue detection scan on a project
 */
export const analyzeProjectIssues = async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = String(req.params.projectId);
    const query = mongoose.isValidObjectId(projectId)
      ? { $or: [{ projectId }, { _id: projectId }] }
      : { projectId };
    const project = await Project.findOne(query);
    if (!project) {
      res.status(404).json({ success: false, message: `Project not found: ${projectId}` });
      return;
    }

    const actualProjectId = project.projectId;
    const sourceDir = project.sourcePath || ProjectStorageService.getProjectSourceDir(actualProjectId);
    const issues = await CodeIssueDetector.scanProject(actualProjectId, sourceDir);

    res.status(200).json({
      success: true,
      count: issues.length,
      issues,
      data: issues,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to analyze project issues",
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Get all detected code issues for a project
 */
export const getProjectIssues = async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = String(req.params.projectId);
    const query = mongoose.isValidObjectId(projectId)
      ? { $or: [{ projectId }, { _id: projectId }] }
      : { projectId };
    const project = await Project.findOne(query);
    const actualProjectId = project ? project.projectId : projectId;

    const issues = await CodeIssue.find({ projectId: actualProjectId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: issues.length,
      issues,
      data: issues,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch project issues",
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Get single issue details
 */
export const getIssueById = async (req: Request, res: Response): Promise<void> => {
  try {
    const issueId = String(req.params.issueId);
    const query = mongoose.isValidObjectId(issueId)
      ? { $or: [{ issueId }, { _id: issueId }] }
      : { issueId };
    const issue = await CodeIssue.findOne(query);
    if (!issue) {
      res.status(404).json({ success: false, message: `Issue not found: ${issueId}` });
      return;
    }

    res.status(200).json({
      success: true,
      issue,
      data: issue,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch issue",
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Generate autonomous code repair for an issue
 */
export const createRepair = async (req: Request, res: Response): Promise<void> => {
  try {
    const issueId = String(req.params.issueId);
    const query = mongoose.isValidObjectId(issueId)
      ? { $or: [{ issueId }, { _id: issueId }] }
      : { issueId };
    const foundIssue = await CodeIssue.findOne(query);
    const actualIssueId = foundIssue ? foundIssue.issueId : issueId;

    const repair = await CodeRepairService.generateRepair(actualIssueId);

    res.status(201).json({
      success: true,
      message: "Code repair generated successfully in isolated workspace",
      repair,
      data: repair,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to generate code repair",
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Get repair details
 */
export const getRepairById = async (req: Request, res: Response): Promise<void> => {
  try {
    const repairId = String(req.params.repairId);
    const query = mongoose.isValidObjectId(repairId)
      ? { $or: [{ repairId }, { _id: repairId }] }
      : { repairId };
    const repair = await CodeRepair.findOne(query);
    if (!repair) {
      res.status(404).json({ success: false, message: `Repair not found: ${repairId}` });
      return;
    }

    res.status(200).json({
      success: true,
      repair,
      data: repair,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch repair",
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Get unified diff for a repair
 */
export const getRepairDiff = async (req: Request, res: Response): Promise<void> => {
  try {
    const repairId = String(req.params.repairId);
    const query = mongoose.isValidObjectId(repairId)
      ? { $or: [{ repairId }, { _id: repairId }] }
      : { repairId };
    const repair = await CodeRepair.findOne(query);
    if (!repair) {
      res.status(404).json({ success: false, message: `Repair not found: ${repairId}` });
      return;
    }

    res.status(200).json({
      success: true,
      diff: repair.diff,
      data: {
        repairId: repair.repairId,
        diff: repair.diff,
        changedFiles: repair.changedFiles,
        explanation: repair.explanation,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch repair diff",
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Run sandbox validation checks on a repair
 */
export const validateRepair = async (req: Request, res: Response): Promise<void> => {
  try {
    const repairId = String(req.params.repairId);
    const query = mongoose.isValidObjectId(repairId)
      ? { $or: [{ repairId }, { _id: repairId }] }
      : { repairId };
    const foundRepair = await CodeRepair.findOne(query);
    const actualRepairId = foundRepair ? foundRepair.repairId : repairId;

    const repair = await ValidationService.validateRepair(actualRepairId);

    res.status(200).json({
      success: true,
      message: repair.validationStatus === "VALIDATED" ? "Validation passed" : "Validation failed",
      repair,
      data: repair,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to run validation",
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Human Approval: Approve a validated repair
 */
export const approveRepair = async (req: Request, res: Response): Promise<void> => {
  try {
    const repairId = String(req.params.repairId);
    const { approvedBy } = req.body;

    const query = mongoose.isValidObjectId(repairId)
      ? { $or: [{ repairId }, { _id: repairId }] }
      : { repairId };
    const repair = await CodeRepair.findOne(query);
    if (!repair) {
      res.status(404).json({ success: false, message: `Repair not found: ${repairId}` });
      return;
    }

    if (repair.validationStatus !== "VALIDATED") {
      res.status(400).json({
        success: false,
        message: "Safety Gate Violation: Cannot approve a repair that has not passed validation.",
      });
      return;
    }

    repair.approvalStatus = "APPROVED";
    repair.status = "APPROVED";
    repair.approvedBy = approvedBy || "DevOps Engineer";
    repair.approvedAt = new Date();
    await repair.save();

    res.status(200).json({
      success: true,
      message: "Repair approved for deployment",
      repair,
      data: repair,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to approve repair",
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Human Approval: Reject a repair
 */
export const rejectRepair = async (req: Request, res: Response): Promise<void> => {
  try {
    const repairId = String(req.params.repairId);
    const { reason } = req.body;

    const query = mongoose.isValidObjectId(repairId)
      ? { $or: [{ repairId }, { _id: repairId }] }
      : { repairId };
    const repair = await CodeRepair.findOne(query);
    if (!repair) {
      res.status(404).json({ success: false, message: `Repair not found: ${repairId}` });
      return;
    }

    repair.approvalStatus = "REJECTED";
    repair.status = "REJECTED";
    repair.rejectionReason = reason || "Rejected by user";
    await repair.save();

    res.status(200).json({
      success: true,
      message: "Repair rejected",
      repair,
      data: repair,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to reject repair",
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Deploy an approved repair to a live Docker container
 */
export const deployRepair = async (req: Request, res: Response): Promise<void> => {
  try {
    const repairId = String(req.params.repairId);
    const query = mongoose.isValidObjectId(repairId)
      ? { $or: [{ repairId }, { _id: repairId }] }
      : { repairId };
    const foundRepair = await CodeRepair.findOne(query);
    const actualRepairId = foundRepair ? foundRepair.repairId : repairId;

    const result = await DockerDeploymentProvider.deployRepair(actualRepairId);

    res.status(200).json({
      success: true,
      message: "Repair deployed and verified successfully",
      deployment: result.deployment,
      verification: result.verification,
      data: result,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isSafetyGate =
      errorMsg.includes("Safety Gate") ||
      errorMsg.includes("Approval Required") ||
      errorMsg.includes("not approved") ||
      errorMsg.includes("must be approved") ||
      errorMsg.includes("blocked");

    res.status(isSafetyGate ? 400 : 500).json({
      success: false,
      message: isSafetyGate ? errorMsg : "Deployment failed",
      error: errorMsg,
    });
  }
};

/**
 * Get deployment details
 */
export const getDeploymentById = async (req: Request, res: Response): Promise<void> => {
  try {
    const deploymentId = String(req.params.deploymentId);
    const query = mongoose.isValidObjectId(deploymentId)
      ? { $or: [{ deploymentId }, { _id: deploymentId }] }
      : { deploymentId };
    const deployment = await Deployment.findOne(query);
    if (!deployment) {
      res.status(404).json({ success: false, message: `Deployment not found: ${deploymentId}` });
      return;
    }

    const verification = await DeploymentVerification.findOne({
      $or: [{ deploymentId: deployment.deploymentId }, { deploymentId }],
    });

    res.status(200).json({
      success: true,
      deployment,
      verification,
      data: {
        deployment,
        verification,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch deployment",
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Rollback a deployment
 */
export const rollbackDeployment = async (req: Request, res: Response): Promise<void> => {
  try {
    const deploymentId = String(req.params.deploymentId);
    const { reason } = req.body;

    const query = mongoose.isValidObjectId(deploymentId)
      ? { $or: [{ deploymentId }, { _id: deploymentId }] }
      : { deploymentId };
    const deployment = await Deployment.findOne(query);
    if (!deployment) {
      res.status(404).json({ success: false, message: `Deployment not found: ${deploymentId}` });
      return;
    }

    await DockerDeploymentProvider.executeRollback(
      deployment,
      deployment.containerName || `traceops-live-${deployment.projectId}-${deployment.repairId}`,
      reason || "Manual rollback requested by operator"
    );

    res.status(200).json({
      success: true,
      message: `Deployment ${deployment.deploymentId} rolled back successfully`,
      deployment,
      data: deployment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to rollback deployment",
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Get full repair and deployment history for a project
 */
export const getRepairHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = String(req.params.projectId);

    const [issues, repairs, deployments, verifications] = await Promise.all([
      CodeIssue.find({ projectId }).sort({ createdAt: -1 }),
      CodeRepair.find({ projectId }).sort({ createdAt: -1 }),
      Deployment.find({ projectId }).sort({ createdAt: -1 }),
      DeploymentVerification.find({ projectId }).sort({ createdAt: -1 }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        issues,
        repairs,
        deployments,
        verifications,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch repair history",
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Live probe a running deployment
 */
export const probeDeployment = async (req: Request, res: Response): Promise<void> => {
  try {
    const deploymentId = String(req.params.deploymentId);
    const probeResult = await DockerDeploymentProvider.probeLiveDeployment(deploymentId);

    res.status(200).json({
      success: true,
      data: probeResult,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to probe deployment",
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Package and download final repaired project ZIP archive.
 * Generates an archive containing repaired workspace sources + repair-report.json.
 * Excludes node_modules, .git, internal runtime data, and secrets.
 * Leaves the original source 100% immutable.
 */
export const downloadRepairedProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const repairId = String(req.params.repairId);
    const repair = await CodeRepair.findOne({ repairId });
    if (!repair) {
      res.status(404).json({ success: false, message: `Repair not found: ${repairId}` });
      return;
    }

    const projectId = repair.projectId;
    const [project, issue, deployment] = await Promise.all([
      Project.findOne({ projectId }),
      CodeIssue.findOne({ issueId: repair.issueId }),
      Deployment.findOne({ repairId }).sort({ createdAt: -1 }),
    ]);

    let verification = null;
    if (deployment) {
      verification = await DeploymentVerification.findOne({ deploymentId: deployment.deploymentId });
    }

    const reportData = {
      projectName: project?.name || "Repaired Project",
      projectId: repair.projectId,
      originalRepositoryUrl: project?.repositoryUrl || null,
      sourceType: project?.sourceType || null,
      repositoryOwner: project?.repositoryOwner,
      repositoryName: project?.repositoryName,
      commitSha: project?.commitSha,
      repairId: repair.repairId,
      issueId: repair.issueId,
      issueCategory: issue?.category || "CODE_DEFECT",
      issueDescription: issue?.description,
      repairedFiles: repair.changedFiles,
      diff: repair.diff,
      explanation: repair.explanation,
      validationStatus: repair.validationStatus,
      validationStages: repair.validationStages,
      approvalStatus: repair.approvalStatus,
      approvedBy: repair.approvedBy,
      approvedAt: repair.approvedAt,
      deploymentId: deployment?.deploymentId || null,
      deploymentStatus: deployment?.status || null,
      containerImage: deployment?.imageTag || null,
      sloVerificationResult: verification
        ? {
            sloMetric: verification.sloMetric,
            targetValue: verification.targetValue,
            targetUnit: verification.targetUnit,
            beforeValue: verification.beforeValue,
            afterValue: verification.afterValue,
            improvementPercentage: verification.improvementPercentage,
            sloCompliant: verification.sloCompliant,
            healthCheckPassed: verification.healthCheckPassed,
            healthCheckLatencyMs: verification.healthCheckLatencyMs,
          }
        : null,
      downloadTimestamp: new Date().toISOString(),
    };

    const { zipBuffer, fileName } = ProjectStorageService.packageRepairedProjectZip(
      repairId,
      reportData
    );

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", zipBuffer.length);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.status(200).send(zipBuffer);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to package and download repaired project ZIP",
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Download the latest validated and deployed repair for a project
 */
export const downloadLatestRepairedProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = String(req.params.projectId);
    // Find latest deployed or validated repair
    const repair = await CodeRepair.findOne({
      projectId,
      $or: [{ status: "DEPLOYED" }, { validationStatus: "VALIDATED" }],
    }).sort({ updatedAt: -1 });

    if (!repair) {
      res.status(404).json({
        success: false,
        message: `No validated or deployed repair found for project ${projectId}`,
      });
      return;
    }

    req.params.repairId = repair.repairId;
    return downloadRepairedProject(req, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to download latest repaired project",
      error: error instanceof Error ? error.message : error,
    });
  }
};


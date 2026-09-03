import { Request, Response } from "express";
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
    const project = await Project.findOne({ projectId });
    if (!project) {
      res.status(404).json({ success: false, message: `Project not found: ${projectId}` });
      return;
    }

    const sourceDir = project.sourcePath || ProjectStorageService.getProjectSourceDir(projectId);
    const issues = await CodeIssueDetector.scanProject(projectId, sourceDir);

    res.status(200).json({
      success: true,
      count: issues.length,
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
    const issues = await CodeIssue.find({ projectId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: issues.length,
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
    const issue = await CodeIssue.findOne({ issueId });
    if (!issue) {
      res.status(404).json({ success: false, message: `Issue not found: ${issueId}` });
      return;
    }

    res.status(200).json({
      success: true,
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
    const repair = await CodeRepairService.generateRepair(issueId);

    res.status(201).json({
      success: true,
      message: "Code repair generated successfully in isolated workspace",
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
    const repair = await CodeRepair.findOne({ repairId });
    if (!repair) {
      res.status(404).json({ success: false, message: `Repair not found: ${repairId}` });
      return;
    }

    res.status(200).json({
      success: true,
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
    const repair = await CodeRepair.findOne({ repairId });
    if (!repair) {
      res.status(404).json({ success: false, message: `Repair not found: ${repairId}` });
      return;
    }

    res.status(200).json({
      success: true,
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
    const repair = await ValidationService.validateRepair(repairId);

    res.status(200).json({
      success: true,
      message: repair.validationStatus === "VALIDATED" ? "Validation passed" : "Validation failed",
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

    const repair = await CodeRepair.findOne({ repairId });
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
    repair.approvedBy = approvedBy || "DevOps Engineer";
    repair.approvedAt = new Date();
    await repair.save();

    res.status(200).json({
      success: true,
      message: "Repair approved for deployment",
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

    const repair = await CodeRepair.findOne({ repairId });
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
    const result = await DockerDeploymentProvider.deployRepair(repairId);

    res.status(200).json({
      success: true,
      message: "Repair deployed and verified successfully",
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Deployment failed",
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Get deployment details
 */
export const getDeploymentById = async (req: Request, res: Response): Promise<void> => {
  try {
    const deploymentId = String(req.params.deploymentId);
    const deployment = await Deployment.findOne({ deploymentId });
    if (!deployment) {
      res.status(404).json({ success: false, message: `Deployment not found: ${deploymentId}` });
      return;
    }

    const verification = await DeploymentVerification.findOne({ deploymentId });

    res.status(200).json({
      success: true,
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

    const deployment = await Deployment.findOne({ deploymentId });
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
      message: `Deployment ${deploymentId} rolled back successfully`,
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

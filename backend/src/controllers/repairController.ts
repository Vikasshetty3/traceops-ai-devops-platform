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
import { RcaRepairContractService } from "../services/rcaRepairContractService";
import { DeploymentLockConflictError } from "../services/deploymentLockService";
import { PostDeploymentVerificationService } from "../services/postDeploymentVerificationService";
import { DeploymentAuditService } from "../services/deploymentAuditService";
import { TrafficRoutingService } from "../services/trafficRoutingService";
import { CanaryProgressionService } from "../services/canaryProgressionService";
import { AutomatedCanaryAnalysisService } from "../services/automatedCanaryAnalysisService";
import { CanaryRollbackIntegrationService } from "../services/canaryRollbackIntegrationService";

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
    if ((req as any).user && (req as any).user.role !== "ADMIN") {
      res.status(403).json({
        success: false,
        message: "Permission Denied: Administrator role required to approve repairs.",
      });
      return;
    }

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
    if ((req as any).user && (req as any).user.role !== "ADMIN") {
      res.status(403).json({
        success: false,
        message: "Permission Denied: Administrator role required to reject repairs.",
      });
      return;
    }

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
    if ((req as any).user && (req as any).user.role !== "ADMIN") {
      res.status(403).json({
        success: false,
        message: "Permission Denied: Administrator role required to deploy repairs.",
      });
      return;
    }

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
    const isLockConflict =
      error instanceof DeploymentLockConflictError ||
      errorMsg.includes("Deployment Lock Conflict") ||
      errorMsg.includes("deployment lock held");
    const isSafetyGate =
      errorMsg.includes("Safety Gate") ||
      errorMsg.includes("Approval Required") ||
      errorMsg.includes("not approved") ||
      errorMsg.includes("must be approved") ||
      errorMsg.includes("blocked") ||
      errorMsg.includes("Missing Git candidate commit") ||
      errorMsg.includes("foreign key links");

    const status = isLockConflict ? 409 : (isSafetyGate ? 400 : 500);

    res.status(status).json({
      success: false,
      message: (isSafetyGate || isLockConflict) ? errorMsg : "Deployment failed",
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
 * Rollback a deployment (Phase 5.3 Batch B: Automated Predecessor Restoration & Prometheus Verification)
 */
export const rollbackDeployment = async (req: Request, res: Response): Promise<void> => {
  try {
    const deploymentId = String(req.params.deploymentId);
    const { reason } = req.body || {};

    const query = mongoose.isValidObjectId(deploymentId)
      ? { $or: [{ deploymentId }, { _id: deploymentId }] }
      : { deploymentId };
    const deployment = await Deployment.findOne(query);
    if (!deployment) {
      res.status(404).json({ success: false, message: `Deployment not found: ${deploymentId}` });
      return;
    }

    const outcome = await PostDeploymentVerificationService.executeRollback(
      deployment.deploymentId,
      reason || "Manual rollback requested by operator"
    );

    res.status(outcome.success ? 200 : 500).json({
      success: outcome.success,
      message: outcome.success
        ? `Deployment ${deployment.deploymentId} rolled back successfully`
        : `Deployment rollback failed: ${outcome.reason}`,
      deployment: outcome.deployment,
      outcome,
      data: outcome.deployment,
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
 * Phase 5.3 Batch B — Trigger or re-run closed-loop Prometheus SLO verification on a deployment
 * Endpoint: POST /api/deployments/:deploymentId/verify
 */
export const verifyDeploymentSLO = async (req: Request, res: Response): Promise<void> => {
  try {
    const deploymentId = String(req.params.deploymentId);
    const { stabilizationWindowSeconds, forcedPromQl, autoRollbackOnBreach, timeoutMs } = req.body || {};

    const outcome = await PostDeploymentVerificationService.verifyDeployment(deploymentId, {
      stabilizationWindowSeconds: stabilizationWindowSeconds ? Number(stabilizationWindowSeconds) : undefined,
      forcedPromQl,
      autoRollbackOnBreach: autoRollbackOnBreach !== undefined ? Boolean(autoRollbackOnBreach) : true,
      timeoutMs: timeoutMs ? Number(timeoutMs) : undefined,
    });

    res.status(200).json({
      success: outcome.status === "HEALTHY",
      status: outcome.status,
      verification: outcome.verification,
      deployment: outcome.deployment,
      actualValue: outcome.actualValue,
      target: outcome.target,
      operator: outcome.operator,
      promQl: outcome.promQl,
      samples: outcome.samples,
      data: outcome,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isSafetyGate = errorMsg.includes("Safety Gate") || errorMsg.includes("not found");
    res.status(isSafetyGate ? 400 : 500).json({
      success: false,
      message: errorMsg,
      error: errorMsg,
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

/**
 * Phase 5.2 — Create runtime repair candidate from a genuine Prometheus SLO incident and evidence-backed RCA
 * Endpoint: POST /api/incidents/:incidentId/repair
 */
export const createIncidentRepair = async (req: Request, res: Response): Promise<void> => {
  try {
    const incidentId = String(req.params.incidentId);
    const { rcaId } = req.body || {};
    const caller = req.headers["x-user-id"] || req.headers.authorization || "DevOps Engineer";

    const result = await RcaRepairContractService.createRepairCandidate(incidentId, {
      rcaId,
      caller: String(caller),
    });

    res.status(result.isExisting ? 200 : 201).json({
      success: true,
      message: result.isExisting
        ? "Idempotent lookup: Active repair candidate already exists for this incident"
        : result.actionMapping.isSupported
        ? "Runtime repair candidate created successfully via bounded deterministic mapping"
        : "Runtime advisory candidate created (RCA recommendation requires manual remediation)",
      isExisting: result.isExisting,
      repair: result.repair,
      traceability: result.traceability,
      snapshotHash: result.snapshotHash,
      actionMapping: result.actionMapping,
      data: {
        repair: result.repair,
        traceability: result.traceability,
        snapshotHash: result.snapshotHash,
        actionMapping: result.actionMapping,
      },
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    const isPreconditionFailure = message.includes("Precondition Failed") || message.includes("Security Shield");
    const isNotFound = message.includes("not found");

    const statusCode = isNotFound ? 404 : isPreconditionFailure ? 400 : 500;

    res.status(statusCode).json({
      success: false,
      message,
      error: message,
    });
  }
};

/**
 * Phase 5.2 — Independently verify the immutable evidence snapshot stored on a repair candidate
 * Endpoint: GET /api/repairs/:repairId/verify-evidence
 */
export const verifyRepairEvidence = async (req: Request, res: Response): Promise<void> => {
  try {
    const repairId = String(req.params.repairId);
    const result = await RcaRepairContractService.verifyEvidenceSnapshot(repairId);
    res.status(result.isValid ? 200 : 400).json({
      success: result.isValid,
      data: result,
      ...result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Phase 5.3 Batch C1 — Cryptographic Deployment Audit Logging
 * Returns complete, chronological, cryptographically verified audit events for a deployment.
 * Endpoint: GET /api/deployments/:deploymentId/audit-events
 */
export const getDeploymentAuditEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const deploymentId = String(req.params.deploymentId || req.params.id);
    const deployment = await Deployment.findOne({ deploymentId });
    if (!deployment) {
      res.status(404).json({
        success: false,
        message: `Deployment not found for deploymentId: ${deploymentId}`,
      });
      return;
    }

    const events = await DeploymentAuditService.getDeploymentEvents(deploymentId);
    const verification = await DeploymentAuditService.verifyChain(deploymentId);

    res.status(200).json({
      success: true,
      deploymentId,
      chainValid: verification.valid,
      eventsCount: events.length,
      events,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Phase 5.3 Batch C1 — Cryptographic Audit Chain Verification
 * Verifies SHA-256 hash chaining, sequential continuity, and payload integrity.
 * Endpoint: GET /api/deployments/:deploymentId/audit-events/verify
 */
export const verifyDeploymentAuditChain = async (req: Request, res: Response): Promise<void> => {
  try {
    const deploymentId = String(req.params.deploymentId || req.params.id);
    const deployment = await Deployment.findOne({ deploymentId });
    if (!deployment) {
      res.status(404).json({
        success: false,
        message: `Deployment not found for deploymentId: ${deploymentId}`,
      });
      return;
    }

    const verification = await DeploymentAuditService.verifyChain(deploymentId);

    res.status(verification.valid ? 200 : 400).json({
      success: verification.valid,
      deploymentId,
      verification,
      ...verification,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Phase 5.3 Batch C2 — Dynamic Traffic Routing Subsystem
 * Retrieves current traffic state, active weights, container targets, and request counts.
 * Endpoint: GET /api/deployments/:deploymentId/traffic
 */
export const getDeploymentTraffic = async (req: Request, res: Response): Promise<void> => {
  try {
    const deploymentId = String(req.params.deploymentId || req.params.id);
    const deployment = await Deployment.findOne({ deploymentId });
    if (!deployment) {
      res.status(404).json({
        success: false,
        message: `Deployment not found for deploymentId: ${deploymentId}`,
      });
      return;
    }

    const route = await TrafficRoutingService.getTrafficState(deploymentId);

    res.status(200).json({
      success: true,
      deploymentId: route.deploymentId,
      strategy: route.strategy,
      currentStage: route.stage,
      candidateWeight: route.candidateWeight,
      predecessorWeight: route.predecessorWeight,
      candidateContainer: route.candidateContainer,
      predecessorContainer: route.predecessorContainer,
      candidateHostPort: route.candidateHostPort,
      predecessorHostPort: route.predecessorHostPort,
      candidateTargetUrl: route.candidateTargetUrl,
      predecessorTargetUrl: route.predecessorTargetUrl,
      ingressPort: route.ingressPort,
      totalRequests: route.totalRequests,
      candidateRequests: route.candidateRequests,
      predecessorRequests: route.predecessorRequests,
      active: true,
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = message.includes("not found") ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

/**
 * Phase 5.3 Batch C2 — Explicit Traffic Weight Configuration
 * Sets dynamic traffic weights between predecessor and candidate containers.
 * Endpoint: POST /api/deployments/:deploymentId/traffic
 */
export const setDeploymentTraffic = async (req: Request, res: Response): Promise<void> => {
  try {
    const deploymentId = String(req.params.deploymentId || req.params.id);
    const { candidateWeight, predecessorWeight, stage, reason, actor } = req.body || {};

    if (candidateWeight === undefined || predecessorWeight === undefined) {
      res.status(400).json({
        success: false,
        message: "Missing required parameters: candidateWeight and predecessorWeight are required",
      });
      return;
    }

    const route = await TrafficRoutingService.setTrafficWeights({
      deploymentId,
      candidateWeight: Number(candidateWeight),
      predecessorWeight: Number(predecessorWeight),
      stage: stage || `TIER_${candidateWeight}`,
      reason,
      actor: actor || (req.headers["x-user-id"] as string) || "DevOps Engineer",
    });

    res.status(200).json({
      success: true,
      deploymentId: route.deploymentId,
      strategy: route.strategy,
      currentStage: route.stage,
      candidateWeight: route.candidateWeight,
      predecessorWeight: route.predecessorWeight,
      candidateContainer: route.candidateContainer,
      predecessorContainer: route.predecessorContainer,
      candidateHostPort: route.candidateHostPort,
      predecessorHostPort: route.predecessorHostPort,
      ingressPort: route.ingressPort,
      message: `Traffic shifted to ${route.candidateWeight}% candidate / ${route.predecessorWeight}% predecessor`,
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    const isConflict = error instanceof DeploymentLockConflictError || message.includes("DeploymentLockConflict");
    const isNotFound = message.includes("not found");
    const isValidation =
      message.includes("Invariant Violation") ||
      message.includes("Safety Gate") ||
      message.includes("Strategy Violation");

    const statusCode = isConflict ? 409 : isNotFound ? 404 : isValidation ? 400 : 500;

    res.status(statusCode).json({
      success: false,
      message,
      error: message,
    });
  }
};

/**
 * Phase 5.3 Batch C2 — Traffic Advance Primitive
 * Explicitly transitions traffic to target weight.
 * Endpoint: POST /api/deployments/:deploymentId/traffic/advance
 */
export const advanceDeploymentTraffic = async (req: Request, res: Response): Promise<void> => {
  try {
    const deploymentId = String(req.params.deploymentId || req.params.id);
    const { targetWeight, stage, reason, actor } = req.body || {};

    if (targetWeight === undefined || typeof targetWeight !== "number") {
      res.status(400).json({
        success: false,
        message: "targetWeight is required and must be a number between 0 and 100",
      });
      return;
    }

    const candidateWeight = Number(targetWeight);
    const predecessorWeight = 100 - candidateWeight;

    const route = await TrafficRoutingService.setTrafficWeights({
      deploymentId,
      candidateWeight,
      predecessorWeight,
      stage: stage || `TIER_${candidateWeight}`,
      reason: reason || `Advanced to tier ${candidateWeight}%`,
      actor: actor || (req.headers["x-user-id"] as string) || "DevOps Engineer",
    });

    res.status(200).json({
      success: true,
      deploymentId: route.deploymentId,
      strategy: route.strategy,
      currentStage: route.stage,
      candidateWeight: route.candidateWeight,
      predecessorWeight: route.predecessorWeight,
      candidateContainer: route.candidateContainer,
      predecessorContainer: route.predecessorContainer,
      message: `Traffic successfully advanced to ${candidateWeight}% candidate`,
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    const isConflict = error instanceof DeploymentLockConflictError || message.includes("DeploymentLockConflict");
    const isNotFound = message.includes("not found");
    const isValidation =
      message.includes("Invariant Violation") ||
      message.includes("Safety Gate") ||
      message.includes("Strategy Violation");

    const statusCode = isConflict ? 409 : isNotFound ? 404 : isValidation ? 400 : 500;

    res.status(statusCode).json({
      success: false,
      message,
      error: message,
    });
  }
};

/**
 * Phase 5.3 Batch C2 — Gateway HTTP Proxy
 * Dispatches live incoming requests to either candidate or predecessor according to active weights.
 * Endpoint: ALL /api/deployments/:deploymentId/gateway*
 */
export const proxyDeploymentGateway = async (req: Request, res: Response): Promise<void> => {
  try {
    const deploymentId = String(req.params.deploymentId || req.params.id);
    await TrafficRoutingService.dispatchRequest(deploymentId, req, res);
  } catch (error: any) {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
};

/**
 * Phase 5.3 Batch C3 — Canary Rollout Initiation
 * Initializes progressive canary deployment at Stage 0 (Warmup, 0% candidate / 100% predecessor).
 * Endpoint: POST /api/deployments/:deploymentId/canary/start
 */
export const startCanaryDeployment = async (req: Request, res: Response): Promise<void> => {
  try {
    const deploymentId = String(req.params.deploymentId || req.params.id);
    const { strategy, actor, reason, candidateHostPort, predecessorHostPort, options } = req.body || {};

    const status = await CanaryProgressionService.startCanary({
      deploymentId,
      strategy,
      actor: actor || (req.headers["x-user-id"] as string) || "Canary Operator",
      reason,
      candidateHostPort,
      predecessorHostPort,
      options,
    });

    res.status(200).json({
      success: true,
      deploymentId: status.deploymentId,
      strategy: status.strategy,
      canaryStatus: status.canaryStatus,
      currentStage: status.currentStage,
      candidateWeight: status.candidateWeight,
      predecessorWeight: status.predecessorWeight,
      stageEnteredAt: status.stageEnteredAt,
      requiredBakeDurationSeconds: status.requiredBakeDurationSeconds,
      elapsedBakeSeconds: status.elapsedBakeSeconds,
      remainingBakeSeconds: status.remainingBakeSeconds,
      isBakeComplete: status.isBakeComplete,
      nextStage: status.nextStage,
      canAdvance: status.canAdvance,
      prometheusVerificationState: (status as any).prometheusVerificationState,
      sampleCount: (status as any).sampleCount,
      requiredSampleCount: (status as any).requiredSampleCount,
      latestObservedValue: (status as any).latestObservedValue,
      target: (status as any).target,
      gateResult: (status as any).gateResult,
      abortReason: (status as any).abortReason,
      rollbackState: (status as any).rollbackState,
      message: `Canary rollout successfully initiated at ${status.currentStage} (0% candidate / 100% predecessor)`,
      data: status,
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    const isConflict = error instanceof DeploymentLockConflictError || message.includes("DeploymentLockConflict");
    const isNotFound = message.includes("not found");
    const isSafetyGate =
      message.includes("Safety Gate") ||
      message.includes("Canary Lifecycle") ||
      message.includes("Strategy Violation");

    const statusCode = isConflict ? 409 : isNotFound ? 404 : isSafetyGate ? 400 : 500;

    res.status(statusCode).json({
      success: false,
      message,
      error: message,
    });
  }
};

/**
 * Phase 5.3 Batch C3 — Advance Canary Stage
 * Progresses an active canary deployment to the next stage upon completion of bake/stabilization timing.
 * Endpoint: POST /api/deployments/:deploymentId/canary/advance
 */
export const advanceCanaryDeployment = async (req: Request, res: Response): Promise<void> => {
  try {
    const deploymentId = String(req.params.deploymentId || req.params.id);
    const { targetStage, targetWeight, actor, reason, options } = req.body || {};

    const status = await CanaryProgressionService.advanceCanary({
      deploymentId,
      targetStage,
      targetWeight,
      actor: actor || (req.headers["x-user-id"] as string) || "Canary Operator",
      reason,
      options,
    });

    res.status(200).json({
      success: true,
      deploymentId: status.deploymentId,
      strategy: status.strategy,
      canaryStatus: status.canaryStatus,
      currentStage: status.currentStage,
      candidateWeight: status.candidateWeight,
      predecessorWeight: status.predecessorWeight,
      stageEnteredAt: status.stageEnteredAt,
      requiredBakeDurationSeconds: status.requiredBakeDurationSeconds,
      elapsedBakeSeconds: status.elapsedBakeSeconds,
      remainingBakeSeconds: status.remainingBakeSeconds,
      isBakeComplete: status.isBakeComplete,
      nextStage: status.nextStage,
      canAdvance: status.canAdvance,
      prometheusVerificationState: (status as any).prometheusVerificationState,
      sampleCount: (status as any).sampleCount,
      requiredSampleCount: (status as any).requiredSampleCount,
      latestObservedValue: (status as any).latestObservedValue,
      target: (status as any).target,
      gateResult: (status as any).gateResult,
      abortReason: (status as any).abortReason,
      rollbackState: (status as any).rollbackState,
      message: `Canary advanced to ${status.currentStage} (${status.candidateWeight}% candidate / ${status.predecessorWeight}% predecessor)`,
      data: status,
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    const isConflict = error instanceof DeploymentLockConflictError || message.includes("DeploymentLockConflict");
    const isNotFound = message.includes("not found");
    const isBakeIncomplete = error.statusCode === 412 || message.includes("Bake Duration Incomplete");
    const isTransitionError =
      message.includes("Invalid Canary Stage Transition") ||
      message.includes("Canary Lifecycle") ||
      message.includes("Safety Gate") ||
      message.includes("Strategy Violation");

    const statusCode = isConflict ? 409 : isNotFound ? 404 : isBakeIncomplete ? 412 : isTransitionError ? 400 : 500;

    res.status(statusCode).json({
      success: false,
      message,
      error: message,
    });
  }
};

/**
 * Phase 5.3 Batch C3 — Query Canary Status
 * Returns real-time canary progression state, bake timer status, and next eligible stage.
 * Endpoint: GET /api/deployments/:deploymentId/canary/status
 */
export const getCanaryDeploymentStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const deploymentId = String(req.params.deploymentId || req.params.id);
    const status = await CanaryProgressionService.getCanaryStatus(deploymentId);

    res.status(200).json({
      success: true,
      deploymentId: status.deploymentId,
      strategy: status.strategy,
      canaryStatus: status.canaryStatus,
      currentStage: status.currentStage,
      candidateWeight: status.candidateWeight,
      predecessorWeight: status.predecessorWeight,
      stageEnteredAt: status.stageEnteredAt,
      requiredBakeDurationSeconds: status.requiredBakeDurationSeconds,
      elapsedBakeSeconds: status.elapsedBakeSeconds,
      remainingBakeSeconds: status.remainingBakeSeconds,
      isBakeComplete: status.isBakeComplete,
      nextStage: status.nextStage,
      canAdvance: status.canAdvance,
      prometheusVerificationState: (status as any).prometheusVerificationState,
      sampleCount: (status as any).sampleCount,
      requiredSampleCount: (status as any).requiredSampleCount,
      latestObservedValue: (status as any).latestObservedValue,
      target: (status as any).target,
      gateResult: (status as any).gateResult,
      abortReason: (status as any).abortReason,
      rollbackState: (status as any).rollbackState,
      history: status.history,
      data: status,
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    const isNotFound = message.includes("not found");
    res.status(isNotFound ? 404 : 500).json({
      success: false,
      message,
      error: message,
    });
  }
};

/**
 * Phase 5.3 Batch C3 — Abort Canary Deployment
 * Emergency clamp back to 100% predecessor and transition to ABORTED state.
 * Endpoint: POST /api/deployments/:deploymentId/canary/abort
 */
export const abortCanaryDeployment = async (req: Request, res: Response): Promise<void> => {
  try {
    const deploymentId = String(req.params.deploymentId || req.params.id);
    const { reason, actor } = req.body || {};

    const status = await CanaryProgressionService.abortCanary(
      deploymentId,
      reason || "Manual operator abort requested",
      actor || (req.headers["x-user-id"] as string) || "Canary Operator"
    );

    res.status(200).json({
      success: true,
      deploymentId: status.deploymentId,
      strategy: status.strategy,
      canaryStatus: status.canaryStatus,
      currentStage: status.currentStage,
      candidateWeight: status.candidateWeight,
      predecessorWeight: status.predecessorWeight,
      prometheusVerificationState: (status as any).prometheusVerificationState,
      sampleCount: (status as any).sampleCount,
      requiredSampleCount: (status as any).requiredSampleCount,
      latestObservedValue: (status as any).latestObservedValue,
      target: (status as any).target,
      gateResult: (status as any).gateResult,
      abortReason: (status as any).abortReason,
      rollbackState: (status as any).rollbackState,
      message: "Canary deployment aborted; traffic clamped to 100% predecessor",
      data: status,
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    const isNotFound = message.includes("not found");
    res.status(isNotFound ? 404 : 500).json({
      success: false,
      message,
      error: message,
    });
  }
};

/**
 * Phase 5.3 Batch C4 — Evaluate Canary Prometheus Gating (ACA)
 * Evaluates live PromQL metrics against linked SLO for current canary stage.
 * Endpoint: POST /api/deployments/:deploymentId/canary/evaluate
 */
export const evaluateCanaryDeployment = async (req: Request, res: Response): Promise<void> => {
  try {
    const deploymentId = String(req.params.deploymentId || req.params.id);
    const options = req.body || {};

    const evaluation = await AutomatedCanaryAnalysisService.evaluateCanaryStage(deploymentId, options);

    res.status(evaluation.passed ? 200 : 412).json({
      success: evaluation.passed,
      message: evaluation.reason,
      data: evaluation,
      ...evaluation,
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    const isNotFound = message.includes("not found");
    res.status(isNotFound ? 404 : 500).json({
      success: false,
      message,
      error: message,
    });
  }
};






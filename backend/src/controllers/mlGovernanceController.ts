import { Request, Response } from "express";
import { MLGovernanceService } from "../services/mlGovernanceService";
import { MLPromotionPolicyService } from "../services/mlPromotionPolicyService";
import { MLModelPromotionService } from "../services/mlModelPromotionService";
import { AuthenticatedRequest } from "../middleware/authMiddleware";

export const registerModel = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const actor = req.user?.username || (req.body?.createdBy as string) || "SYSTEM";
    const result = await MLGovernanceService.registerModel(req.body, actor);

    res.status(201).json({
      success: true,
      message: `Model "${result.model.modelVersion}" registered successfully in ML Model Registry`,
      data: result.model,
      auditEventId: result.auditEventId,
    });
  } catch (err: any) {
    const statusCode = err.message.includes("Duplicate") ? 409 : 400;
    res.status(statusCode).json({
      success: false,
      error: err.message,
    });
  }
};

export const listModels = async (req: Request, res: Response): Promise<void> => {
  try {
    const query: Record<string, any> = {};
    if (req.query.status) query.status = String(req.query.status);
    if (req.query.servingStatus) query.servingStatus = String(req.query.servingStatus);

    const models = await MLGovernanceService.listModels(query);
    res.status(200).json({
      success: true,
      count: models.length,
      data: models,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

export const getModel = async (req: Request, res: Response): Promise<void> => {
  try {
    const modelId = String(req.params.modelId);
    const model = await MLGovernanceService.getModelById(modelId);

    if (!model) {
      res.status(404).json({
        success: false,
        error: `Model not found: "${modelId}"`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: model,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

export const getModelEvaluations = async (req: Request, res: Response): Promise<void> => {
  try {
    const modelId = String(req.params.modelId);
    const evaluations = await MLGovernanceService.getModelEvaluations(modelId);

    res.status(200).json({
      success: true,
      count: evaluations.length,
      data: evaluations,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

export const recordEvaluation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const modelId = String(req.params.modelId);
    const actor = req.user?.username || "SYSTEM";
    const result = await MLGovernanceService.recordEvaluation(modelId, req.body, actor);

    res.status(201).json({
      success: true,
      message: `Evaluation recorded for model "${modelId}"`,
      data: result.evaluation,
      modelStatus: result.model.status,
    });
  } catch (err: any) {
    const statusCode = err.message.includes("Not Found") ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: err.message,
    });
  }
};

export const requestApproval = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const modelId = String(req.params.modelId);
    const requestedBy = req.user?.username || (req.body?.requestedBy as string) || "SYSTEM";
    const reason = req.body?.reason;

    const approval = await MLGovernanceService.requestApproval(modelId, requestedBy, reason);

    res.status(201).json({
      success: true,
      message: `Approval requested for model "${modelId}"`,
      data: approval,
    });
  } catch (err: any) {
    const statusCode = err.message.includes("Not Found") ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: err.message,
    });
  }
};

export const reviewApproval = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const modelId = String(req.params.modelId);
    const { decision, reason } = req.body || {};

    if (!decision || (decision !== "APPROVED" && decision !== "REJECTED")) {
      res.status(400).json({
        success: false,
        error: 'Invalid decision: Must be either "APPROVED" or "REJECTED"',
      });
      return;
    }

    const reviewer = req.user?.username || (req.body?.reviewer as string) || "ADMIN_OPERATOR";
    const result = await MLGovernanceService.reviewApproval(
      modelId,
      decision,
      reviewer,
      reason || `Decision ${decision} recorded`
    );

    res.status(200).json({
      success: true,
      message: `Model "${modelId}" approval reviewed with decision: ${decision}`,
      data: result.approval,
      model: {
        modelId: result.model.modelId,
        modelVersion: result.model.modelVersion,
        status: result.model.status,
        servingStatus: result.model.servingStatus,
        approvedBy: result.model.approvedBy,
        approvedAt: result.model.approvedAt,
      },
    });
  } catch (err: any) {
    const statusCode = err.message.includes("Not Found") ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: err.message,
    });
  }
};

export const getModelAudit = async (req: Request, res: Response): Promise<void> => {
  try {
    const modelId = String(req.params.modelId);
    const auditData = await MLGovernanceService.getModelAuditTrail(modelId);

    res.status(200).json({
      success: true,
      data: auditData,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

export const registerDataset = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const dataset = await MLGovernanceService.registerDataset(req.body);
    res.status(201).json({
      success: true,
      message: `Dataset version "${dataset.datasetVersion}" registered successfully`,
      data: dataset,
    });
  } catch (err: any) {
    const statusCode = err.message.includes("already exists") ? 409 : 400;
    res.status(statusCode).json({
      success: false,
      error: err.message,
    });
  }
};

export const listDatasets = async (_req: Request, res: Response): Promise<void> => {
  try {
    const datasets = await MLGovernanceService.listDatasets();
    res.status(200).json({
      success: true,
      count: datasets.length,
      data: datasets,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

export const getDataset = async (req: Request, res: Response): Promise<void> => {
  try {
    const datasetId = String(req.params.datasetId);
    const dataset = await MLGovernanceService.getDatasetById(datasetId);

    if (!dataset) {
      res.status(404).json({
        success: false,
        error: `Dataset not found: "${datasetId}"`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: dataset,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// Batch D2: Promotion Engine Controller Actions

export const getPromotionReadiness = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const modelId = String(req.params.modelId);
    const result = await MLPromotionPolicyService.evaluatePromotionReadiness(modelId);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    const statusCode = err.message.includes("Not Found") ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: err.message,
    });
  }
};

export const promoteModel = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const modelId = String(req.params.modelId);
    const actor = req.user?.username || "ADMIN_OPERATOR";
    const result = await MLModelPromotionService.promoteModel(modelId, actor);
    res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (err: any) {
    let statusCode = 400;
    if (err.message.includes("Not Found")) {
      statusCode = 404;
    } else if (
      err.message.includes("Conflict") ||
      err.message.includes("Idempotency") ||
      err.name === "DeploymentLockConflictError" ||
      err.statusCode === 409
    ) {
      statusCode = 409;
    }
    res.status(statusCode).json({
      success: false,
      error: err.message,
    });
  }
};

export const getPromotionStatus = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const modelId = String(req.params.modelId);
    const status = await MLModelPromotionService.getPromotionStatus(modelId);
    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (err: any) {
    const statusCode = err.message.includes("Not Found") ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      error: err.message,
    });
  }
};

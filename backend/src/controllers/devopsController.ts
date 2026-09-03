import { Request, Response } from "express";
import { DevOpsAction } from "../models/DevOpsAction";
import { DevOpsAdapter, SafetyGate } from "../../../devops-adapter";

export const getDevOpsActions = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { status, service } = req.query;
    const filter: Record<string, any> = {};

    if (status) filter.status = String(status);
    if (service) filter.service = String(service);

    const actions = await DevOpsAction.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: actions.length,
      data: actions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch DevOps actions",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const proposeDevOpsAction = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      rcaId,
      experimentId,
      requirementId,
      service,
      actionType,
      description,
      payload,
    } = req.body;

    if (!service || !actionType || !description) {
      res.status(400).json({
        success: false,
        message: "service, actionType and description are required",
      });
      return;
    }

    const actionId = `ACT-${Date.now().toString().slice(-5)}`;

    const proposalRequest = {
      actionId,
      rcaId,
      experimentId,
      requirementId,
      service,
      actionType,
      description,
      payload: payload || {},
    };

    const safetyCheck = SafetyGate.validateProposal(proposalRequest);
    if (!safetyCheck.allowed) {
      res.status(400).json({
        success: false,
        message: safetyCheck.reason,
      });
      return;
    }

    const action = await DevOpsAction.create({
      actionId,
      rcaId,
      experimentId,
      requirementId,
      service,
      actionType,
      description,
      payload: payload || {},
      status: "PROPOSED",
      executionLogs: [
        `[${new Date().toISOString()}] Action proposed and passed safety gate check. Awaiting human authorization.`,
      ],
    });

    res.status(201).json({
      success: true,
      message: "DevOps action proposed and awaiting approval",
      data: action,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to propose DevOps action",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const approveDevOpsAction = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);
    const { approvedBy } = req.body;

    const action = await DevOpsAction.findOne({
      $or: [{ actionId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : undefined }],
    });

    if (!action) {
      res.status(404).json({
        success: false,
        message: "DevOps action not found",
      });
      return;
    }

    action.status = "APPROVED";
    action.approvedBy = approvedBy || "DevOps Admin";
    action.approvedAt = new Date();
    action.executionLogs.push(
      `[${new Date().toISOString()}] Approved by ${action.approvedBy}. Safety gate unlocked for execution.`
    );

    await action.save();

    res.status(200).json({
      success: true,
      message: "DevOps action approved",
      data: action,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to approve DevOps action",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const rejectDevOpsAction = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);
    const { reason } = req.body;

    const action = await DevOpsAction.findOne({
      $or: [{ actionId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : undefined }],
    });

    if (!action) {
      res.status(404).json({
        success: false,
        message: "DevOps action not found",
      });
      return;
    }

    action.status = "REJECTED";
    action.executionLogs.push(
      `[${new Date().toISOString()}] Action rejected. Reason: ${reason || "Operator intervention"}`
    );

    await action.save();

    res.status(200).json({
      success: true,
      message: "DevOps action rejected",
      data: action,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to reject DevOps action",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const executeDevOpsAction = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);
    const isDryRun = req.body?.dryRun === true || req.query?.dryRun === "true";

    const action = await DevOpsAction.findOne({
      $or: [{ actionId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : undefined }],
    });

    if (!action) {
      res.status(404).json({
        success: false,
        message: "DevOps action not found",
      });
      return;
    }

    const execResult = await DevOpsAdapter.executeAction(action.status as any, {
      actionId: action.actionId,
      service: action.service,
      actionType: action.actionType,
      description: action.description,
      payload: action.payload,
      dryRun: isDryRun,
    });

    if (!execResult.success) {
      action.executionLogs.push(...execResult.logs);
      await action.save();

      res.status(403).json({
        success: false,
        message: execResult.error || "Action execution blocked by safety gate",
        logs: execResult.logs,
        executionResult: execResult,
      });
      return;
    }

    if (!isDryRun) {
      action.status = "EXECUTED";
      action.executedAt = execResult.executedAt;
    }
    
    action.executionLogs.push(...execResult.logs);
    await action.save();

    res.status(200).json({
      success: true,
      message: isDryRun
        ? "DevOps action dry-run completed successfully"
        : "DevOps action executed successfully",
      data: action,
      executionResult: execResult,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to execute DevOps action",
      error: error instanceof Error ? error.message : error,
    });
  }
};


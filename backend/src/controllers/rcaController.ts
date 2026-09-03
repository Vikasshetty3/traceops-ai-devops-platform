import { Request, Response } from "express";
import { RCA } from "../models/RCA";

export const getRCAs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { requirementId, service, status } = req.query;
    const filter: Record<string, any> = {};

    if (requirementId) filter.requirementId = String(requirementId);
    if (service) filter.service = String(service);
    if (status) filter.status = String(status);

    const rcas = await RCA.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: rcas.length,
      data: rcas,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch RCAs",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const getRCAById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);

    const rca = await RCA.findOne({
      $or: [{ rcaId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : undefined }],
    });

    if (!rca) {
      res.status(404).json({
        success: false,
        message: "RCA not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: rca,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch RCA",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const createRCA = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      rcaId,
      incidentId,
      requirementId,
      sloId,
      service,
      rootCause,
      evidence,
      confidence,
      recommendedAction,
      metricsSnapshot,
      status,
    } = req.body;

    if (!incidentId || !requirementId || !rootCause || !recommendedAction) {
      res.status(400).json({
        success: false,
        message:
          "incidentId, requirementId, rootCause, and recommendedAction are required",
      });
      return;
    }

    const newRca = await RCA.create({
      rcaId: rcaId || `RCA-${Date.now().toString().slice(-4)}`,
      incidentId,
      requirementId,
      sloId,
      service: service || "Checkout",
      rootCause,
      evidence: evidence || [],
      confidence: confidence || 0.95,
      recommendedAction,
      metricsSnapshot,
      status: status || "GENERATED",
    });

    res.status(201).json({
      success: true,
      message: "RCA record saved to MongoDB",
      data: newRca,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to create RCA",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const updateRCA = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);

    const rca = await RCA.findOneAndUpdate(
      {
        $or: [{ rcaId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : undefined }],
      },
      req.body,
      { new: true, runValidators: true }
    );

    if (!rca) {
      res.status(404).json({
        success: false,
        message: "RCA not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "RCA updated successfully",
      data: rca,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to update RCA",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const deleteRCA = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);

    const rca = await RCA.findOneAndDelete({
      $or: [{ rcaId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : undefined }],
    });

    if (!rca) {
      res.status(404).json({
        success: false,
        message: "RCA not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "RCA deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete RCA",
      error: error instanceof Error ? error.message : error,
    });
  }
};
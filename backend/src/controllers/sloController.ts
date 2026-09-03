import { Request, Response } from "express";
import { SLO } from "../models/SLO";

export const getSLOs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { requirementId, service, severity, status } = req.query;
    const filter: Record<string, any> = {};

    if (requirementId) filter.requirementId = String(requirementId);
    if (service) filter.service = String(service);
    if (severity) filter.severity = String(severity);
    if (status) filter.status = String(status);

    const slos = await SLO.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: slos.length,
      data: slos,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch SLOs",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const getSLOById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);

    const slo = await SLO.findOne({
      $or: [{ sloId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : undefined }],
    });

    if (!slo) {
      res.status(404).json({
        success: false,
        message: "SLO not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: slo,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch SLO",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const createSLO = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      sloId,
      requirementId,
      service,
      metric,
      operator,
      threshold,
      target,
      unit,
      window,
      severity,
      status,
    } = req.body;

    if (!sloId || !requirementId || !service || !metric || threshold === undefined) {
      res.status(400).json({
        success: false,
        message:
          "sloId, requirementId, service, metric, and threshold are required",
      });
      return;
    }

    const slo = await SLO.create({
      sloId,
      requirementId,
      service,
      metric,
      operator: operator || "<",
      threshold,
      target: target !== undefined ? target : threshold,
      unit: unit || "seconds",
      window: window || "5m",
      severity: severity || "CRITICAL",
      status: status || "ACTIVE",
    });

    res.status(201).json({
      success: true,
      message: "SLO created successfully",
      data: slo,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to create SLO",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const updateSLO = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);

    const slo = await SLO.findOneAndUpdate(
      {
        $or: [{ sloId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : undefined }],
      },
      req.body,
      { new: true, runValidators: true }
    );

    if (!slo) {
      res.status(404).json({
        success: false,
        message: "SLO not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "SLO updated successfully",
      data: slo,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to update SLO",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const deleteSLO = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);

    const slo = await SLO.findOneAndDelete({
      $or: [{ sloId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : undefined }],
    });

    if (!slo) {
      res.status(404).json({
        success: false,
        message: "SLO not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "SLO deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete SLO",
      error: error instanceof Error ? error.message : error,
    });
  }
};
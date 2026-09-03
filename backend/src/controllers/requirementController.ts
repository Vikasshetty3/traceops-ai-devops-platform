import { Request, Response } from "express";
import { Requirement } from "../models/Requirement";

export const getRequirements = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { priority, status, service, search } = req.query;
    const filter: Record<string, any> = {};

    if (priority) filter.priority = String(priority);
    if (status) filter.status = String(status);
    if (service) filter.service = String(service);
    if (search) {
      filter.$or = [
        { requirementId: { $regex: search, $options: "i" } },
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const requirements = await Requirement.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: requirements.length,
      data: requirements,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch requirements",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const getRequirementById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);

    const requirement = await Requirement.findOne({
      $or: [{ requirementId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : undefined }],
    });

    if (!requirement) {
      res.status(404).json({
        success: false,
        message: "Requirement not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: requirement,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch requirement",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const createRequirement = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      requirementId,
      title,
      description,
      service,
      priority,
      status,
      category,
      metric,
      operator,
      threshold,
      unit,
    } = req.body;

    if (!requirementId || !title || !description || !service) {
      res.status(400).json({
        success: false,
        message:
          "requirementId, title, description, and service are required",
      });
      return;
    }

    const requirement = await Requirement.create({
      requirementId,
      title,
      description,
      service,
      priority: priority || "MEDIUM",
      status: status || "ACTIVE",
      category: category || "performance",
      metric: metric || "p95_latency",
      operator: operator || "<",
      threshold: threshold !== undefined ? threshold : 2.0,
      unit: unit || "seconds",
    });

    res.status(201).json({
      success: true,
      message: "Requirement created successfully",
      data: requirement,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to create requirement",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const updateRequirement = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);

    const requirement = await Requirement.findOneAndUpdate(
      {
        $or: [{ requirementId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : undefined }],
      },
      req.body,
      { new: true, runValidators: true }
    );

    if (!requirement) {
      res.status(404).json({
        success: false,
        message: "Requirement not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Requirement updated successfully",
      data: requirement,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to update requirement",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const deleteRequirement = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);

    const requirement = await Requirement.findOneAndDelete({
      $or: [{ requirementId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : undefined }],
    });

    if (!requirement) {
      res.status(404).json({
        success: false,
        message: "Requirement not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Requirement deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete requirement",
      error: error instanceof Error ? error.message : error,
    });
  }
};
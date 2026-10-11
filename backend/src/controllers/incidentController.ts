import { Request, Response } from "express";
import { Incident } from "../models/Incident";

export const getIncidents = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { status, service, severity, projectId, sloId, source } = req.query;
    const filter: Record<string, any> = {};

    if (status) filter.status = String(status);
    if (service) filter.service = String(service);
    if (severity) filter.severity = String(severity);
    if (projectId) filter.projectId = String(projectId);
    if (sloId) filter.sloId = String(sloId);
    if (source) filter.source = String(source);

    const incidents = await Incident.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: incidents.length,
      data: incidents,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch incidents",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const getIncidentById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);

    const incident = await Incident.findOne({
      $or: [{ incidentId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : undefined }],
    });

    if (!incident) {
      res.status(404).json({
        success: false,
        message: "Incident not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: incident,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch incident",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const createIncident = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      incidentId,
      requirementId,
      sloId,
      service,
      metric,
      actualValue,
      threshold,
      severity,
      message,
      logs,
      metrics,
    } = req.body;

    if (
      !requirementId ||
      !sloId ||
      !service ||
      !metric ||
      actualValue === undefined ||
      threshold === undefined
    ) {
      res.status(400).json({
        success: false,
        message: "Missing required incident fields",
      });
      return;
    }

    const incId = incidentId || `INC-${Date.now().toString().slice(-4)}`;

    const incident = await Incident.create({
      incidentId: incId,
      requirementId,
      sloId,
      service,
      metric,
      actualValue,
      threshold,
      targetValue: req.body.targetValue !== undefined ? req.body.targetValue : threshold,
      operator: req.body.operator || "<",
      severity: severity || "CRITICAL",
      status: "OPEN",
      source: req.body.source || "MANUAL",
      promQl: req.body.promQl,
      evaluationWindow: req.body.evaluationWindow || "5m",
      evaluatedAt: req.body.evaluatedAt || new Date(),
      message:
        message ||
        `SLO breach on ${service} (${metric}: ${actualValue} vs target ${threshold})`,
      logs: logs || [
        `[${new Date().toISOString()}] Incident recorded for ${service} (${metric}: ${actualValue} vs threshold ${threshold}).`,
      ],
      metrics: metrics || {
        latency: metric.includes("latency") ? actualValue : undefined,
        errorRate: metric.includes("error") ? actualValue : undefined,
        deploymentChanged: false,
      },
    });

    res.status(201).json({
      success: true,
      message: "Incident created successfully",
      data: incident,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to create incident",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const updateIncident = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);

    const incident = await Incident.findOneAndUpdate(
      {
        $or: [{ incidentId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : undefined }],
      },
      req.body,
      { new: true, runValidators: true }
    );

    if (!incident) {
      res.status(404).json({
        success: false,
        message: "Incident not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Incident updated successfully",
      data: incident,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to update incident",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const deleteIncident = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);

    const incident = await Incident.findOneAndDelete({
      $or: [{ incidentId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : undefined }],
    });

    if (!incident) {
      res.status(404).json({
        success: false,
        message: "Incident not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Incident deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete incident",
      error: error instanceof Error ? error.message : error,
    });
  }
};
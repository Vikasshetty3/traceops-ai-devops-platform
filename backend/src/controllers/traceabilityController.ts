import { Request, Response } from "express";
import { Traceability } from "../models/Traceability";
import { Requirement } from "../models/Requirement";
import { SLO } from "../models/SLO";
import { Incident } from "../models/Incident";
import { RCA } from "../models/RCA";
import { Experiment } from "../models/Experiment";
import { DevOpsAction } from "../models/DevOpsAction";

export const getTraceability = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const mappings = await Traceability.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: mappings.length,
      data: mappings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch traceability mappings",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const getFullTraceGraph = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { requirementId } = req.query;

    const reqFilter = requirementId ? { requirementId: String(requirementId) } : {};

    const [requirements, slos, incidents, rcas, experiments, devopsActions] =
      await Promise.all([
        Requirement.find(reqFilter).sort({ createdAt: -1 }),
        SLO.find().sort({ createdAt: -1 }),
        Incident.find().sort({ createdAt: -1 }),
        RCA.find().sort({ createdAt: -1 }),
        Experiment.find().sort({ createdAt: -1 }),
        DevOpsAction.find().sort({ createdAt: -1 }),
      ]);

    // Build hierarchical graph for each requirement
    const graph = requirements.map((reqItem) => {
      const linkedSLOs = slos.filter(
        (s) => s.requirementId === reqItem.requirementId
      );
      const linkedIncidents = incidents.filter(
        (i) => i.requirementId === reqItem.requirementId
      );
      const linkedRCAs = rcas.filter(
        (r) => r.requirementId === reqItem.requirementId
      );
      const linkedExperiments = experiments.filter(
        (e) => e.requirementId === reqItem.requirementId
      );
      const linkedActions = devopsActions.filter(
        (a) => a.requirementId === reqItem.requirementId || a.service === reqItem.service
      );

      return {
        requirement: reqItem,
        slos: linkedSLOs,
        incidents: linkedIncidents,
        rcas: linkedRCAs,
        experiments: linkedExperiments,
        devopsActions: linkedActions,
      };
    });

    res.status(200).json({
      success: true,
      count: graph.length,
      data: graph,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to generate trace graph",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const createTraceability = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const traceability = await Traceability.create(req.body);

    res.status(201).json({
      success: true,
      message: "Traceability mapping created",
      data: traceability,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to create traceability mapping",
      error: error instanceof Error ? error.message : error,
    });
  }
};
import { Request, Response } from "express";
import { Experiment } from "../models/Experiment";
import { ExperimentEngine } from "../../../experiment-engine";

export const getExperiments = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { requirementId, service, result } = req.query;
    const filter: Record<string, any> = {};

    if (requirementId) filter.requirementId = String(requirementId);
    if (service) filter.service = String(service);
    if (result) filter.result = String(result);

    const experiments = await Experiment.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: experiments.length,
      data: experiments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch experiments",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const runExperiment = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      rcaId,
      requirementId,
      service,
      remediationAction,
      parameterName,
      currentValue,
      proposedValue,
      currentLatency,
      currentErrorRate,
      currentCpu,
      currentMemory,
      sloThreshold,
    } = req.body;

    if (!requirementId || !service || !remediationAction || !parameterName) {
      res.status(400).json({
        success: false,
        message:
          "requirementId, service, remediationAction, and parameterName are required",
      });
      return;
    }

    const simResult = ExperimentEngine.simulate({
      rcaId,
      requirementId,
      service,
      remediationAction,
      parameterName,
      currentValue: currentValue ?? 20,
      proposedValue: proposedValue ?? 40,
      currentLatency: Number(currentLatency ?? 2.8),
      currentErrorRate: Number(currentErrorRate ?? 2.0),
      currentCpu: Number(currentCpu ?? 92),
      currentMemory: Number(currentMemory ?? 60),
      sloThreshold: Number(sloThreshold ?? 2.0),
    });

    const experiment = await Experiment.create(simResult);

    res.status(201).json({
      success: true,
      message: "Experiment completed and verified against SLO",
      data: experiment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to run experiment",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const getExperimentById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);

    const experiment = await Experiment.findOne({
      $or: [{ experimentId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : undefined }],
    });

    if (!experiment) {
      res.status(404).json({
        success: false,
        message: "Experiment not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: experiment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch experiment",
      error: error instanceof Error ? error.message : error,
    });
  }
};

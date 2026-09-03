import { Request, Response } from "express";
import { evaluateSLO } from "../services/sloEvaluationService";

export const evaluateSLOController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { sloId, actualValue } = req.body;

    if (!sloId || actualValue === undefined) {
      res.status(400).json({
        success: false,
        message: "sloId and actualValue are required",
      });
      return;
    }

    const result = await evaluateSLO(sloId, Number(actualValue));

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to evaluate SLO",
      error: error instanceof Error ? error.message : error,
    });
  }
};
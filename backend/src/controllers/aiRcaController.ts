import { Request, Response } from "express";
import { analyzeRootCause, RCAInput } from "../ai/rcaService";

export const analyzeRCA = (
  req: Request,
  res: Response
): void => {
  try {
    const input: RCAInput = req.body;

    if (
      !input.service ||
      !input.requirementId ||
      input.actualValue === undefined ||
      input.threshold === undefined
    ) {
      res.status(400).json({
        success: false,
        message:
          "service, requirementId, actualValue and threshold are required",
      });
      return;
    }

    const result = analyzeRootCause(input);

    res.status(200).json({
      success: true,
      data: {
        ...result,
        requirementId: input.requirementId,
        service: input.service,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "RCA analysis failed",
      error: error instanceof Error ? error.message : error,
    });
  }
};
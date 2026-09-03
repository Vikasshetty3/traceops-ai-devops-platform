import { Request, Response } from "express";
import { MLClient } from "../services/mlClient";

export const predictViolation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      requirementId,
      service,
      cpuUsage,
      memoryUsage,
      errorRate,
      latency,
      requestRate,
      dbPoolUsage,
      deploymentChanged,
    } = req.body;

    if (
      cpuUsage === undefined ||
      memoryUsage === undefined ||
      errorRate === undefined ||
      latency === undefined
    ) {
      res.status(400).json({
        success: false,
        message:
          "cpuUsage, memoryUsage, errorRate, and latency are required",
      });
      return;
    }

    const prediction = await MLClient.predict({
      requirementId: requirementId || "REQ-001",
      service: service || "Checkout",
      cpuUsage: Number(cpuUsage),
      memoryUsage: Number(memoryUsage),
      errorRate: Number(errorRate),
      latency: Number(latency),
      requestRate:
        requestRate !== undefined ? Number(requestRate) : undefined,
      dbPoolUsage:
        dbPoolUsage !== undefined ? Number(dbPoolUsage) : undefined,
      deploymentChanged: deploymentChanged ? 1 : 0,
    });

    res.status(200).json({
      success: true,
      data: prediction,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "ML prediction failed",
      error: error instanceof Error ? error.message : error,
    });
  }
};
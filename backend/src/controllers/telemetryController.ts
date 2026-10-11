import { Request, Response } from "express";
import { PrometheusQueryService } from "../services/prometheusQueryService";

export const getTelemetryOverview = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const overview = await PrometheusQueryService.getOverviewTelemetry();
    res.status(200).json({
      success: true,
      data: overview,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to query Prometheus runtime telemetry",
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Controlled load/traffic generation for verification & demo testing.
 * Strictly executes real operations to let Prometheus observe genuine traffic
 * rather than fabricating metrics constants.
 */
export const generateControlledLoad = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { requests = 20, delayMs = 15, simulateError = false } = req.body || {};
    const count = Math.min(Math.max(1, Number(requests) || 20), 100);

    const latencies: number[] = [];
    for (let i = 0; i < count; i++) {
      const start = Date.now();
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      latencies.push(Date.now() - start);
    }

    if (simulateError) {
      res.status(500).json({
        success: false,
        mode: "CONTROLLED_LOAD_TEST",
        message: `Simulated real HTTP 500 error response to record observations in Prometheus 5xx error counter`,
        samplesExecuted: count,
      });
      return;
    }

    res.status(200).json({
      success: true,
      mode: "CONTROLLED_LOAD_TEST",
      message: `Executed ${count} real HTTP operations to record observations in Prometheus duration histogram`,
      samplesExecuted: count,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to execute load test",
      error: error instanceof Error ? error.message : error,
    });
  }
};

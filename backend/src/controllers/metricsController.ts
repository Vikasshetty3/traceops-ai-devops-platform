import { Request, Response } from "express";
import { MetricsService } from "../services/metricsService";

export const getLiveMetrics = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const metrics = MetricsService.getMetrics();
    res.status(200).json({
      success: true,
      count: metrics.length,
      data: metrics,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch runtime metrics",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const getServiceMetrics = getLiveMetrics;

export const getServiceMetric = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const serviceName = String(req.params.service);
    const metric = MetricsService.getServiceMetric(serviceName);

    if (!metric) {
      res.status(404).json({
        success: false,
        message: `Service '${serviceName}' not found in telemetry stream`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: metric,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch service metric",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const getSingleServiceMetric = getServiceMetric;

export const triggerMetricSpike = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { service } = req.body;
    const targetService = service || "Checkout";
    const updated = MetricsService.simulateSpike(targetService);

    res.status(200).json({
      success: true,
      message: `Simulated high load and latency spike on ${targetService} service`,
      data: updated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to trigger metric spike",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const triggerSpike = triggerMetricSpike;

export const normalizeMetric = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { service } = req.body;
    const targetService = service || "Checkout";
    const updated = MetricsService.normalize(targetService);

    res.status(200).json({
      success: true,
      message: `Normalized metrics for ${targetService} service`,
      data: updated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to normalize metrics",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const normalizeService = normalizeMetric;

export const getPrometheusMetrics = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const prometheusText = MetricsService.toPrometheusFormat();
    res.setHeader("Content-Type", "text/plain; version=0.0.4");
    res.status(200).send(prometheusText);
  } catch (error) {
    res.status(500).send("# Failed to generate Prometheus metrics export");
  }
};

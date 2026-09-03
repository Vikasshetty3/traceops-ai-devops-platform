import { Router } from "express";
import {
  getServiceMetrics,
  getSingleServiceMetric,
  triggerSpike,
  normalizeService,
  getPrometheusMetrics,
} from "../controllers/metricsController";

const router = Router();

router.get("/", getServiceMetrics);
router.get("/prometheus", getPrometheusMetrics);
router.get("/:service", getSingleServiceMetric);
router.post("/spike", triggerSpike);
router.post("/normalize", normalizeService);

export default router;

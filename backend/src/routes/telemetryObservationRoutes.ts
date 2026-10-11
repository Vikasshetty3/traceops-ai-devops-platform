import { Router } from "express";
import {
  getTelemetryObservations,
  getTelemetryObservationSummary,
  getTelemetryObservationById,
} from "../controllers/telemetryObservationController";

const router = Router();

router.get("/summary", getTelemetryObservationSummary);
router.get("/:id", getTelemetryObservationById);
router.get("/", getTelemetryObservations);

export default router;

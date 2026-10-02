import { Router } from "express";
import {
  getTelemetryOverview,
  generateControlledLoad,
} from "../controllers/telemetryController";

const router = Router();

router.get("/overview", getTelemetryOverview);
router.post("/load-test", generateControlledLoad);

export default router;

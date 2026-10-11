import { Router } from "express";
import {
  createSLO,
  getSLOs,
  getSLOById,
  updateSLO,
  deleteSLO,
  getSLOMonitorStatus,
  triggerSLOEvaluationCycle,
} from "../controllers/sloController";

const router = Router();

router.get("/monitor/status", getSLOMonitorStatus);
router.post("/monitor/evaluate", triggerSLOEvaluationCycle);

router.route("/").get(getSLOs).post(createSLO);
router.route("/:id").get(getSLOById).put(updateSLO).delete(deleteSLO);

export default router;
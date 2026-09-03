import { Router } from "express";
import {
  createTraceability,
  getTraceability,
  getFullTraceGraph,
} from "../controllers/traceabilityController";

const router = Router();

router.route("/").get(getTraceability).post(createTraceability);
router.get("/graph", getFullTraceGraph);

export default router;
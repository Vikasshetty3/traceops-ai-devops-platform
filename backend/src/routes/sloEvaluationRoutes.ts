import express from "express";
import { evaluateSLOController } from "../controllers/sloEvaluationController";

const router = express.Router();

router.post("/evaluate", evaluateSLOController);
router.post("/", evaluateSLOController);

export default router;
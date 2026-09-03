import { Router } from "express";
import {
  createRCA,
  getRCAs,
  getRCAById,
  updateRCA,
  deleteRCA,
} from "../controllers/rcaController";
import { analyzeRCA } from "../controllers/aiRcaController";

const router = Router();

router.post("/analyze", analyzeRCA);
router.route("/").get(getRCAs).post(createRCA);
router.route("/:id").get(getRCAById).put(updateRCA).delete(deleteRCA);

export default router;
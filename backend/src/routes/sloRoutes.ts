import { Router } from "express";
import {
  createSLO,
  getSLOs,
  getSLOById,
  updateSLO,
  deleteSLO,
} from "../controllers/sloController";

const router = Router();

router.route("/").get(getSLOs).post(createSLO);
router.route("/:id").get(getSLOById).put(updateSLO).delete(deleteSLO);

export default router;
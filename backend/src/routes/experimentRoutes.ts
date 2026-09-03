import { Router } from "express";
import {
  runExperiment,
  getExperiments,
  getExperimentById,
} from "../controllers/experimentController";

const router = Router();

router.route("/").get(getExperiments);
router.route("/run").post(runExperiment);
router.route("/:id").get(getExperimentById);

export default router;

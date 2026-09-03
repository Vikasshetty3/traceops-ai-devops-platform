import { Router } from "express";
import {
  createRequirement,
  getRequirements,
  getRequirementById,
  updateRequirement,
  deleteRequirement,
} from "../controllers/requirementController";

const router = Router();

router.route("/").get(getRequirements).post(createRequirement);
router
  .route("/:id")
  .get(getRequirementById)
  .put(updateRequirement)
  .delete(deleteRequirement);

export default router;
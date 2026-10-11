import { Router } from "express";
import {
  createIncident,
  getIncidents,
  getIncidentById,
  updateIncident,
  deleteIncident,
} from "../controllers/incidentController";
import { createIncidentRepair } from "../controllers/repairController";

const router = Router();

router.route("/").get(getIncidents).post(createIncident);
router.post("/:incidentId/repair", createIncidentRepair);
router
  .route("/:id")
  .get(getIncidentById)
  .put(updateIncident)
  .delete(deleteIncident);

export default router;
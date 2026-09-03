import { Router } from "express";
import {
  createIncident,
  getIncidents,
  getIncidentById,
  updateIncident,
  deleteIncident,
} from "../controllers/incidentController";

const router = Router();

router.route("/").get(getIncidents).post(createIncident);
router
  .route("/:id")
  .get(getIncidentById)
  .put(updateIncident)
  .delete(deleteIncident);

export default router;
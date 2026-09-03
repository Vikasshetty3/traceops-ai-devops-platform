import { Router } from "express";
import {
  createRCA,
  getRCAs,
  getRCAById,
  updateRCA,
  deleteRCA,
} from "../controllers/rcaController";

const router = Router();

router.route("/").get(getRCAs).post(createRCA);
router.route("/:id").get(getRCAById).put(updateRCA).delete(deleteRCA);

export default router;
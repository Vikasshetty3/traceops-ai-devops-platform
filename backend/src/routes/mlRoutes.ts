import express from "express";
import { predictViolation } from "../controllers/mlController";

const router = express.Router();

router.post("/predict", predictViolation);
router.post("/", predictViolation);

export default router;
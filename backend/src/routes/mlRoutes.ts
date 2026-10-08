import express from "express";
import { predictViolation, getMLHealth } from "../controllers/mlController";

const router = express.Router();

router.get("/health", getMLHealth);
router.post("/predict", predictViolation);
router.post("/", predictViolation);

export default router;
import express from "express";
import { analyzeRCA } from "../controllers/aiRcaController";

const router = express.Router();

router.post("/", analyzeRCA);

export default router;
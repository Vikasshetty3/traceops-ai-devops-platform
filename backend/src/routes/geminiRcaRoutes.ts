import express from "express";
import { analyzeGeminiRCA } from "../controllers/geminiRcaController";

const router = express.Router();

router.post("/analyze", analyzeGeminiRCA);
router.post("/", analyzeGeminiRCA);

export default router;
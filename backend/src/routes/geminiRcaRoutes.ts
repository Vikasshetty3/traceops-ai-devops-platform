import express from "express";
import { analyzeGeminiRCA } from "../controllers/geminiRcaController";

const router = express.Router();

router.post("/", analyzeGeminiRCA);

export default router;
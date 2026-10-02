import { Router } from "express";
import { signup, login, getCurrentUser, logout, getAllUsers, getAdminOverview } from "../controllers/authController";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware";

const router = Router();

// Public auth endpoints
router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);

// Authenticated user profile
router.get("/me", requireAuth, getCurrentUser);

// User & Admin management
router.get("/users", requireAuth, requireAdmin, getAllUsers);
router.get("/admin/overview", requireAuth, requireAdmin, getAdminOverview);

export default router;

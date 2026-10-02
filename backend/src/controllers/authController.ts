import { Response } from "express";
import { AuthService } from "../services/authService";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import { User } from "../models/User";
import { Project } from "../models/Project";
import { Requirement } from "../models/Requirement";
import { SLO } from "../models/SLO";
import { Incident } from "../models/Incident";
import { CodeRepair } from "../models/CodeRepair";
import { Deployment } from "../models/Deployment";
import { DeploymentAuditEvent } from "../models/DeploymentAuditEvent";

export const signup = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { username, email, password, name, role } = req.body || {};
    const result = await AuthService.registerUser({
      username,
      email,
      password,
      name,
      role: role === "ADMIN" ? "ADMIN" : "USER",
    });

    res.status(201).json({
      success: true,
      message: `User ${result.user.username} registered successfully`,
      user: result.user,
      token: result.token,
      data: result,
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    const isConflict = message.includes("Conflict");
    res.status(isConflict ? 409 : 400).json({
      success: false,
      message,
      error: message,
    });
  }
};

export const login = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { identifier, username, email, password } = req.body || {};
    const id = identifier || username || email;

    const result = await AuthService.authenticate(id, password);

    res.status(200).json({
      success: true,
      message: `Welcome back, ${result.user.name}`,
      user: result.user,
      token: result.token,
      data: result,
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(401).json({
      success: false,
      message,
      error: message,
    });
  }
};

export const getCurrentUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
      return;
    }

    const user = await AuthService.getUserById(req.user.userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    const userPayload = {
      userId: user.userId,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
    };

    res.status(200).json({
      success: true,
      user: userPayload,
      data: userPayload,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to fetch user profile",
    });
  }
};

export const logout = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};

export const getAllUsers = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const users = await AuthService.getAllUsers();
    const sanitized = users.map((u) => ({
      userId: u.userId,
      username: u.username,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt,
    }));

    res.status(200).json({
      success: true,
      count: sanitized.length,
      users: sanitized,
      data: sanitized,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to list users",
      error: error instanceof Error ? error.message : error,
    });
  }
};

/**
 * Admin-only platform overview aggregating all real system entities
 */
export const getAdminOverview = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const [
      totalUsers,
      totalProjects,
      totalRequirements,
      totalSLOs,
      activeIncidents,
      openRepairs,
      activeDeployments,
      totalAuditEvents,
      recentAuditEvents,
    ] = await Promise.all([
      User.countDocuments(),
      Project.countDocuments(),
      Requirement.countDocuments(),
      SLO.countDocuments(),
      Incident.countDocuments({ status: { $ne: "RESOLVED" } }),
      CodeRepair.countDocuments({ status: { $in: ["GENERATED", "VALIDATING", "VALIDATED", "APPROVED"] } }),
      Deployment.countDocuments({ status: { $in: ["DEPLOYED", "STABLE"] } }),
      DeploymentAuditEvent.countDocuments(),
      DeploymentAuditEvent.find().sort({ createdAt: -1 }).limit(10),
    ]);

    const users = await User.find().sort({ createdAt: -1 }).limit(10);

    const overviewData = {
      totalUsers,
      totalProjects,
      totalRequirements,
      totalSLOs,
      activeIncidents,
      openRepairs,
      activeDeployments,
      totalDeployments: activeDeployments,
      totalAuditEvents,
      recentAuditEvents,
      recentUsers: users.map((u) => ({
        userId: u.userId,
        username: u.username,
        email: u.email,
        name: u.name,
        role: u.role,
        createdAt: u.createdAt,
      })),
      systemHealth: {
        backend: "HEALTHY",
        database: "HEALTHY",
        mlService: "HEALTHY",
        prometheus: "HEALTHY",
      },
    };

    res.status(200).json({
      success: true,
      overview: overviewData,
      data: overviewData,
      ...overviewData,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Failed to aggregate admin overview",
      error: error instanceof Error ? error.message : error,
    });
  }
};

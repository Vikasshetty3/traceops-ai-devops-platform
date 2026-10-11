import { Request, Response, NextFunction } from "express";
import { AuthService, TokenPayload } from "../services/authService";

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export const extractUser = (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization || (req.headers["x-access-token"] as string);

  if (authHeader) {
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : authHeader.trim();
    const decoded = AuthService.verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }

  next();
};

export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization || (req.headers["x-access-token"] as string);

  if (!authHeader) {
    res.status(401).json({
      success: false,
      message: "Authentication Required: Missing Authorization header. Please log in.",
    });
    return;
  }

  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : authHeader.trim();
  const decoded = AuthService.verifyToken(token);

  if (!decoded) {
    res.status(401).json({
      success: false,
      message: "Authentication Failed: Invalid or expired token. Please log in again.",
    });
    return;
  }

  req.user = decoded;
  next();
};

export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication Required: Please log in as an administrator.",
    });
    return;
  }

  if (req.user.role !== "ADMIN") {
    res.status(403).json({
      success: false,
      message: "Permission Denied: Administrator role required to access this resource.",
    });
    return;
  }

  next();
};

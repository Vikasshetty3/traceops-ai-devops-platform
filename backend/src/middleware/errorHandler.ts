import { Request, Response, NextFunction } from "express";

export interface AppError extends Error {
  statusCode?: number;
  details?: any;
}

const SENSITIVE_PATTERNS = [
  /mongodb(?:\+srv)?:\/\/[^\s]+/gi,
  /(?:password|passwd|secret|jwt_secret|api_key|token)\s*[:=]\s*['"]?[^'"\s\n]+/gi,
  /(?:[A-Za-z]:\\[\w.-]+(?:\\[\w.-]+)+)/g, // Windows paths
  /(?:\/(?:home|etc|var|app|usr|root)\/[\w.-]+(?:\/[\w.-]+)+)/g, // POSIX absolute paths
];

function sanitizeErrorMessage(msg: string): string {
  let cleaned = msg;
  for (const pat of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pat, "[REDACTED]");
  }
  return cleaned;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const isProd = (process.env.NODE_ENV || "").toLowerCase() === "production";
  const statusCode = err.statusCode || 500;
  const rawMessage = err.message || "Internal Server Error";
  const correlationId = req.correlationId;

  // In production, sanitize 500-level error messages to prevent internal leakage
  let message = rawMessage;
  if (isProd) {
    if (statusCode >= 500) {
      message = "An internal server error occurred.";
    } else {
      message = sanitizeErrorMessage(rawMessage);
    }
  }

  // Sanitize logged message
  const sanitizedLog = sanitizeErrorMessage(err.stack || err.message || "Unknown error");

  console.error(
    `[ERROR] ${new Date().toISOString()} [${correlationId}] ${req.method} ${req.originalUrl} (${statusCode}):`,
    sanitizedLog
  );

  res.status(statusCode).json({
    success: false,
    message,
    correlationId,
    error: isProd ? undefined : (err.stack || err),
    details: isProd ? undefined : err.details,
  });
};

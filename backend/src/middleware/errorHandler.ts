import { Request, Response, NextFunction } from "express";

export interface AppError extends Error {
  statusCode?: number;
  details?: any;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  const correlationId = req.correlationId;

  console.error(
    `[ERROR] ${new Date().toISOString()} [${correlationId}] ${req.method} ${req.originalUrl}:`,
    err
  );

  res.status(statusCode).json({
    success: false,
    message,
    correlationId,
    error: process.env.NODE_ENV === "production" ? undefined : err.stack || err,
    details: err.details,
  });
};

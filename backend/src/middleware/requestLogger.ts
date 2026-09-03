import { Request, Response, NextFunction } from "express";

export const requestLoggerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const start = Date.now();
  const { method, originalUrl } = req;

  res.on("finish", () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const cid = req.correlationId ? `[${req.correlationId}]` : "";
    
    // Suppress spamming on prometheus scrape or health check in production
    if (originalUrl !== "/metrics" && originalUrl !== "/api/health") {
      console.log(
        `${new Date().toISOString()} ${cid} ${method} ${originalUrl} ${statusCode} - ${duration}ms`
      );
    }
  });

  next();
};

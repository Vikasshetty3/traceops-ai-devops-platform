import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Clean up expired buckets periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60000).unref();

export interface RateLimiterOptions {
  windowMs?: number;
  maxRequests?: number;
  message?: string;
  name?: string;
}

/**
 * Creates an in-memory sliding window rate limiter middleware.
 */
export function createRateLimiter(options: RateLimiterOptions = {}) {
  const windowMs = options.windowMs || env.RATE_LIMIT_WINDOW_MS || 60000;
  const maxRequests = options.maxRequests || env.RATE_LIMIT_API_MAX || 100;
  const message = options.message || "Too Many Requests: Rate limit exceeded. Please try again later.";
  const name = options.name || "default";

  return (req: Request, res: Response, next: NextFunction): void => {
    // Exempt Prometheus scrape and health endpoints completely
    if (
      req.path === "/metrics" ||
      req.path === "/health" ||
      req.path === "/health/ready" ||
      req.path === "/api/health" ||
      req.path === "/api/health/ready"
    ) {
      return next();
    }

    // Bypass in test runs unless explicitly testing rate limits
    if (
      process.env.NODE_ENV === "test" &&
      process.env.ENABLE_RATE_LIMIT_TEST !== "true"
    ) {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || "127.0.0.1";
    const bucketKey = `${name}:${ip}`;
    const now = Date.now();

    let record = rateLimitStore.get(bucketKey);
    if (!record || now > record.resetTime) {
      record = {
        count: 0,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(bucketKey, record);
    }

    record.count++;

    const remaining = Math.max(0, maxRequests - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", resetSeconds);

    if (record.count > maxRequests) {
      res.setHeader("Retry-After", resetSeconds);
      res.status(429).json({
        success: false,
        message,
        retryAfterSeconds: resetSeconds,
      });
      return;
    }

    next();
  };
}

// Pre-configured rate limiters
export const authRateLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: env.RATE_LIMIT_AUTH_MAX || 30,
  message: "Too Many Authentication Requests: Please wait before trying again.",
  name: "auth",
});

export const apiRateLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: env.RATE_LIMIT_API_MAX || 100,
  message: "Too Many Requests: API rate limit exceeded.",
  name: "api",
});

export const aiRcaRateLimiter = createRateLimiter({
  windowMs: 60000,
  maxRequests: env.RATE_LIMIT_AI_MAX || 20,
  message: "Too Many AI RCA Requests: Rate limit exceeded.",
  name: "ai-rca",
});

/**
 * Resets rate limit store (useful for automated testing)
 */
export function resetRateLimitStore(): void {
  rateLimitStore.clear();
}

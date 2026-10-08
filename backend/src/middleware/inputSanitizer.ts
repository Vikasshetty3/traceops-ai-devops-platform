import { Request, Response, NextFunction } from "express";

const PROTOTYPE_POLLUTION_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function containsPrototypePollution(obj: any, depth = 0): boolean {
  if (!obj || typeof obj !== "object" || depth > 20) return false;

  for (const key of Object.keys(obj)) {
    if (PROTOTYPE_POLLUTION_KEYS.has(key)) {
      return true;
    }
    const val = obj[key];
    if (val && typeof val === "object" && containsPrototypePollution(val, depth + 1)) {
      return true;
    }
  }

  return false;
}

const TRAVERSAL_PATTERN = /(?:\.\.[\\/]|%2e%2e[\\/]|%2e%2e%2f|%2e%2e%5c|\\\\\?|^\/\/|^\\\\|\0)/i;
const COMMAND_INJECTION_PATTERN = /[;&|`$<>]/;

export const inputSanitizerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // 1. Prototype Pollution Check on Body, Query, Params
  if (req.body && containsPrototypePollution(req.body)) {
    res.status(400).json({
      success: false,
      message: "Security Violation: Prototype pollution payload rejected.",
    });
    return;
  }

  if (req.query && containsPrototypePollution(req.query)) {
    res.status(400).json({
      success: false,
      message: "Security Violation: Prototype pollution payload rejected.",
    });
    return;
  }

  // 2. Command injection metacharacters check on URL path
  if (COMMAND_INJECTION_PATTERN.test(req.path)) {
    res.status(400).json({
      success: false,
      message: "Security Violation: Command injection characters rejected in URL path.",
    });
    return;
  }

  // 2. Path Traversal & Command Injection check on route parameters
  if (req.params) {
    for (const [paramName, paramVal] of Object.entries(req.params)) {
      if (typeof paramVal === "string") {
        if (TRAVERSAL_PATTERN.test(paramVal)) {
          res.status(400).json({
            success: false,
            message: `Security Violation: Path traversal pattern detected in parameter "${paramName}".`,
          });
          return;
        }

        // Identifier parameter command injection prevention
        if (paramName.toLowerCase().endsWith("id") || paramName === "service") {
          if (COMMAND_INJECTION_PATTERN.test(paramVal)) {
            res.status(400).json({
              success: false,
              message: `Security Violation: Command injection characters rejected in parameter "${paramName}".`,
            });
            return;
          }
        }
      }
    }
  }

  next();
};

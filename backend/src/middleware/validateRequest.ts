import { Request, Response, NextFunction } from "express";

export type ValidationRule = {
  field: string;
  required?: boolean;
  type?: "string" | "number" | "boolean" | "array" | "object";
};

export const validateBody = (rules: ValidationRule[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const missing: string[] = [];
    const typeErrors: string[] = [];

    for (const rule of rules) {
      const val = req.body[rule.field];

      if (rule.required && (val === undefined || val === null || val === "")) {
        missing.push(rule.field);
        continue;
      }

      if (val !== undefined && rule.type) {
        if (rule.type === "array" && !Array.isArray(val)) {
          typeErrors.push(`${rule.field} must be an array`);
        } else if (rule.type !== "array" && typeof val !== rule.type) {
          typeErrors.push(`${rule.field} must be of type ${rule.type}`);
        }
      }
    }

    if (missing.length > 0 || typeErrors.length > 0) {
      res.status(400).json({
        success: false,
        message: "Request validation failed",
        missingFields: missing.length > 0 ? missing : undefined,
        typeErrors: typeErrors.length > 0 ? typeErrors : undefined,
        correlationId: req.correlationId,
      });
      return;
    }

    next();
  };
};

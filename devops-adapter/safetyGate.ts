import { DevOpsActionRequest, DevOpsActionStatus } from "./types";

export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
}

export class SafetyGate {
  private static readonly ALLOWED_SERVICES = [
    "Checkout",
    "Payments",
    "Orders",
    "Authentication",
    "checkout",
    "payments",
    "orders",
    "authentication",
  ];

  private static readonly MAX_REPLICAS = 10;
  private static readonly MIN_REPLICAS = 1;

  /**
   * Validates whether an action proposal is safe according to platform policy.
   */
  public static validateProposal(request: DevOpsActionRequest): SafetyCheckResult {
    if (!request.service || !this.ALLOWED_SERVICES.includes(request.service)) {
      return {
        allowed: false,
        reason: `Service '${request.service}' is not in the allowed DevOps service registry`,
      };
    }

    if (request.actionType === "SCALE_SERVICE") {
      const replicas = request.payload?.targetReplicas;
      if (replicas !== undefined && (replicas < this.MIN_REPLICAS || replicas > this.MAX_REPLICAS)) {
        return {
          allowed: false,
          reason: `Target replicas ${replicas} out of safe bounds (${this.MIN_REPLICAS}..${this.MAX_REPLICAS})`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Enforces that an action MUST be in APPROVED state before execution is permitted.
   */
  public static validateExecution(
    currentStatus: DevOpsActionStatus,
    request: DevOpsActionRequest
  ): SafetyCheckResult {
    if (currentStatus !== "APPROVED") {
      return {
        allowed: false,
        reason: `Safety gate violation: action '${request.actionId}' is in state '${currentStatus}'. Must be 'APPROVED' by a human operator before execution.`,
      };
    }

    return this.validateProposal(request);
  }
}

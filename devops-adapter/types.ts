export type DevOpsActionType =
  | "SCALE_SERVICE"
  | "RESTART_POD"
  | "UPDATE_CONFIG"
  | "ROLLBACK";

export type DevOpsActionStatus =
  | "PROPOSED"
  | "APPROVED"
  | "EXECUTED"
  | "REJECTED";

export interface DevOpsActionPayload {
  targetReplicas?: number;
  maxPoolSize?: number;
  timeoutMs?: number;
  configKey?: string;
  configValue?: any;
  revision?: number;
  reason?: string;
  [key: string]: any;
}

export interface DevOpsActionRequest {
  actionId: string;
  rcaId?: string;
  experimentId?: string;
  requirementId?: string;
  service: string;
  actionType: DevOpsActionType;
  description: string;
  payload: DevOpsActionPayload;
  dryRun?: boolean;
}

export interface ActionVerification {
  verified: boolean;
  message: string;
  details?: Record<string, any>;
}

export interface ExecutionResult {
  success: boolean;
  actionId: string;
  service: string;
  actionType: DevOpsActionType;
  provider: string;
  dryRun: boolean;
  executedAt: Date;
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
  verification?: ActionVerification;
  logs: string[];
  error?: string;
}

export interface IDevOpsProvider {
  readonly name: string;
  execute(request: DevOpsActionRequest): Promise<ExecutionResult>;
}

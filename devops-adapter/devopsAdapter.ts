import {
  DevOpsActionRequest,
  DevOpsActionStatus,
  ExecutionResult,
  IDevOpsProvider,
} from "./types";
import { SafetyGate } from "./safetyGate";
import { SimulationProvider } from "./providers/simulationProvider";
import { KubernetesProvider } from "./providers/kubernetesProvider";

export class DevOpsAdapter {
  private static provider: IDevOpsProvider =
    process.env.DEVOPS_PROVIDER === "kubernetes"
      ? new KubernetesProvider()
      : new SimulationProvider();

  public static setProvider(customProvider: IDevOpsProvider): void {
    this.provider = customProvider;
  }

  public static getProvider(): IDevOpsProvider {
    return this.provider;
  }

  public static getProviderName(): string {
    return this.provider.name;
  }

  /**
   * Resets provider to environment default.
   */
  public static resetProvider(): void {
    this.provider =
      process.env.DEVOPS_PROVIDER === "kubernetes"
        ? new KubernetesProvider()
        : new SimulationProvider();
  }

  /**
   * Validates safety gate and executes an approved DevOps action through the configured provider.
   */
  public static async executeAction(
    currentStatus: DevOpsActionStatus,
    request: DevOpsActionRequest
  ): Promise<ExecutionResult> {
    const isDryRun = !!request.dryRun;

    // 1. Enforce strict safety gate check (unless dry-run proposal inspection)
    if (!isDryRun) {
      const safetyCheck = SafetyGate.validateExecution(currentStatus, request);
      if (!safetyCheck.allowed) {
        return {
          success: false,
          actionId: request.actionId,
          service: request.service,
          actionType: request.actionType,
          provider: this.provider.name,
          dryRun: false,
          executedAt: new Date(),
          logs: [`[SAFETY GATE ERROR] ${safetyCheck.reason}`],
          error: safetyCheck.reason,
        };
      }
    } else {
      // In dry-run, validate proposal format
      const proposalCheck = SafetyGate.validateProposal(request);
      if (!proposalCheck.allowed) {
        return {
          success: false,
          actionId: request.actionId,
          service: request.service,
          actionType: request.actionType,
          provider: this.provider.name,
          dryRun: true,
          executedAt: new Date(),
          logs: [`[SAFETY GATE ERROR] ${proposalCheck.reason}`],
          error: proposalCheck.reason,
        };
      }
    }

    // 2. Dispatch to execution provider
    return this.provider.execute(request);
  }
}

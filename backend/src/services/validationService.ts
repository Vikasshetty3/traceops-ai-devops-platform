import fs from "fs";
import { CodeRepair, ICodeRepair, IValidationStageResult } from "../models/CodeRepair";
import { SandboxValidationService } from "./sandboxValidationService";

export class ValidationService {
  /**
   * Runs isolated multi-stage container-sandboxed validation on a code repair workspace.
   * Untrusted repository code NEVER executes directly on the TraceOps host machine.
   */
  public static async validateRepair(repairId: string): Promise<ICodeRepair> {
    const repair = await CodeRepair.findOne({ repairId });
    if (!repair) {
      throw new Error(`Code repair not found: ${repairId}`);
    }

    const workspacePath = repair.workspacePath;
    if (!fs.existsSync(workspacePath)) {
      throw new Error(`Workspace directory does not exist: ${workspacePath}`);
    }

    repair.status = "VALIDATING";
    await repair.save();

    // Delegate execution to the dedicated SandboxValidationService
    const report = await SandboxValidationService.validateRepairWorkspace(
      repair.repairId,
      repair.projectId,
      workspacePath,
      repair.changedFiles
    );

    // Map stages to IValidationStageResult
    const stageResults: (IValidationStageResult & { status?: string })[] = report.stages.map((s) => ({
      stage: s.stage,
      command: s.command,
      passed: s.status === "PASS" || s.status === "SKIPPED",
      status: s.status,
      output: s.stdout
        ? s.stderr
          ? `${s.stdout}\n${s.stderr}`
          : s.stdout
        : s.stderr || `Stage ${s.stage} executed in ${s.executionEnvironment}`,
      durationMs: s.durationMs,
    }));

    repair.validationStages = stageResults as IValidationStageResult[];
    repair.validationLogs = report.logs;

    if (report.overallStatus === "VALIDATED") {
      repair.validationStatus = "VALIDATED";
      repair.status = "VALIDATED";
    } else if (report.overallStatus === "VALIDATION_BLOCKED") {
      repair.validationStatus = "BLOCKED";
      repair.status = "BLOCKED";
    } else {
      repair.validationStatus = "FAILED";
      repair.status = "REPAIR_FAILED";
    }

    await repair.save();
    return repair;
  }
}

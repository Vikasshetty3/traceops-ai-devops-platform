import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { ProjectStorageService } from "./projectStorageService";

const execFileAsync = promisify(execFile);

export interface IGitProvenanceData {
  baseRepository: string;
  baseCommitSha: string;
  branchName: string;
  candidateCommitSha: string;
  author: string;
  changedFiles: string[];
  diff: string;
  beforeHashes: Record<string, string>;
  afterHashes: Record<string, string>;
  committedAt: Date;
}

export class GitProvenanceService {
  private static readonly DEFAULT_AUTHOR =
    "TraceOps Autonomous Repair Engine <traceops-agent@deepmind.google.com>";

  /**
   * Executes a Git command safely using execFile (bypassing the shell, preventing command injection).
   * Automatically disables external hooks via -c core.hooksPath=/dev/null.
   */
  private static async runGit(
    args: string[],
    cwd: string
  ): Promise<{ stdout: string; stderr: string }> {
    const safeArgs = [
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "commit.gpgSign=false",
      "-c",
      "core.autocrlf=false",
      "-c",
      "user.name=TraceOps Autonomous Repair Engine",
      "-c",
      "user.email=traceops-agent@deepmind.google.com",
      ...args,
    ];

    try {
      const res = await execFileAsync("git", safeArgs, {
        cwd,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_ASKPASS: "",
          SSH_ASKPASS: "",
          GIT_COMMITTER_NAME: "TraceOps Autonomous Repair Engine",
          GIT_COMMITTER_EMAIL: "traceops-agent@deepmind.google.com",
          GIT_AUTHOR_NAME: "TraceOps Autonomous Repair Engine",
          GIT_AUTHOR_EMAIL: "traceops-agent@deepmind.google.com",
        },
        maxBuffer: 10 * 1024 * 1024,
      });
      return { stdout: res.stdout.trim(), stderr: res.stderr.trim() };
    } catch (err: any) {
      const stderr = err.stderr ? err.stderr.toString().trim() : "";
      const stdout = err.stdout ? err.stdout.toString().trim() : "";
      const extra = [stderr, stdout].filter(Boolean).join(" | ");
      throw new Error(`Git Execution Error (${args.join(" ")}): ${err.message}${extra ? ` | Details: ${extra}` : ""}`);
    }
  }

  /**
   * Ensures the project source directory has an initialized, clean base Git repository
   * with an immutable base commit snapshot.
   */
  public static async ensureBaseRepository(
    projectId: string
  ): Promise<{ repoDir: string; baseCommitSha: string }> {
    const sourceDir = ProjectStorageService.getProjectSourceDir(projectId);

    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Project source directory does not exist: ${sourceDir}`);
    }

    const gitDir = path.join(sourceDir, ".git");

    if (!fs.existsSync(gitDir)) {
      // Initialize fresh git repo
      await this.runGit(["init", "-b", "main"], sourceDir);
      await this.runGit(["config", "user.name", "TraceOps Project System"], sourceDir);
      await this.runGit(["config", "user.email", "traceops-system@deepmind.google.com"], sourceDir);

      // Stage all files and create base commit
      await this.runGit(["add", "-A"], sourceDir);
      await this.runGit(
        ["commit", "--no-verify", "-m", `chore(base): initial source baseline for project ${projectId}`],
        sourceDir
      );
    }

    // Capture base commit SHA
    const { stdout: baseCommitSha } = await this.runGit(["rev-parse", "HEAD"], sourceDir);
    return { repoDir: sourceDir, baseCommitSha: baseCommitSha.trim() };
  }

  /**
   * Creates an isolated Git worktree for the repair candidate.
   * Enforces:
   * - Branch name: repair/<repairId>
   * - Strict path containment inside the approved workspaces root
   * - Zero untrusted hook execution
   */
  public static async createRepairWorktree(
    repairId: string,
    projectId: string
  ): Promise<{
    worktreePath: string;
    branchName: string;
    baseCommitSha: string;
    baseRepository: string;
  }> {
    // 1. Validate repairId format to prevent path escape
    if (!/^[a-zA-Z0-9_-]+$/.test(repairId)) {
      throw new Error(`Security Violation: Invalid repairId '${repairId}'`);
    }

    const workspacesBase = ProjectStorageService.getWorkspacesBaseDir();
    // 2. Strict path resolution & containment check
    const worktreePath = ProjectStorageService.safeResolvePath(workspacesBase, repairId);

    // 3. Ensure base repository is ready
    const { repoDir, baseCommitSha } = await this.ensureBaseRepository(projectId);
    const branchName = `repair/${repairId}`;

    // Clean up any stale worktree at this path
    if (fs.existsSync(worktreePath)) {
      try {
        await this.runGit(["worktree", "remove", "--force", worktreePath], repoDir);
      } catch {
        fs.rmSync(worktreePath, { recursive: true, force: true });
      }
      await this.runGit(["worktree", "prune"], repoDir).catch(() => {});
    }

    // 4. Create isolated worktree branching off the known base commit
    await this.runGit(
      ["worktree", "add", "-B", branchName, worktreePath, baseCommitSha],
      repoDir
    );

    return {
      worktreePath,
      branchName,
      baseCommitSha,
      baseRepository: repoDir,
    };
  }

  /**
   * Commits the applied candidate repair changes to the isolated worktree branch,
   * injecting complete traceability trailers into the commit message.
   */
  public static async commitCandidate(params: {
    worktreePath: string;
    repairId: string;
    incidentId?: string;
    rcaId?: string;
    sloId?: string;
    requirementId?: string;
    evidenceSnapshotHash?: string;
    candidateActionType?: string;
    author?: string;
    changedFiles?: string[];
  }): Promise<{
    candidateCommitSha: string;
    commitMessage: string;
    branchName: string;
  }> {
    const {
      worktreePath,
      repairId,
      incidentId = "N/A",
      rcaId = "N/A",
      sloId = "N/A",
      requirementId = "N/A",
      evidenceSnapshotHash = "N/A",
      candidateActionType = "MISSING_TIMEOUT",
      author = this.DEFAULT_AUTHOR,
    } = params;

    if (!fs.existsSync(worktreePath)) {
      throw new Error(`Worktree path not found: ${worktreePath}`);
    }

    // 1. Stage all changes
    await this.runGit(["add", "-A"], worktreePath);

    // 2. Construct traceable commit message with required trailers
    const commitMessage = `fix(repair): autonomous self-healing patch for ${repairId}

Repair-Id: ${repairId}
Incident-Id: ${incidentId}
RCA-Id: ${rcaId}
SLO-Id: ${sloId}
Requirement-Id: ${requirementId}
Evidence-Snapshot-Hash: ${evidenceSnapshotHash}
Action-Type: ${candidateActionType}
Autonomous-Agent: TraceOps-Phase-5.3`;

    // 3. Commit to worktree branch without running external hooks
    await this.runGit(
      ["commit", "--allow-empty", "--no-verify", `--author=${author}`, "-m", commitMessage],
      worktreePath
    );

    // 4. Capture candidate commit SHA and current branch
    const { stdout: candidateCommitSha } = await this.runGit(
      ["rev-parse", "HEAD"],
      worktreePath
    );
    const { stdout: branchName } = await this.runGit(
      ["rev-parse", "--abbrev-ref", "HEAD"],
      worktreePath
    );

    return {
      candidateCommitSha: candidateCommitSha.trim(),
      commitMessage,
      branchName: branchName.trim(),
    };
  }

  /**
   * Verifies that the candidate commit contains the required traceability trailers.
   */
  public static async verifyCommitTraceability(
    worktreeOrRepoPath: string,
    commitSha: string,
    repairId: string
  ): Promise<boolean> {
    try {
      const { stdout: logOutput } = await this.runGit(
        ["log", "-1", "--pretty=fuller", commitSha],
        worktreeOrRepoPath
      );
      return (
        logOutput.includes(`Repair-Id: ${repairId}`) &&
        logOutput.includes("Evidence-Snapshot-Hash:")
      );
    } catch {
      return false;
    }
  }

  /**
   * Safely cleans up the worktree without deleting any repository history or production branches.
   */
  public static async removeWorktree(
    repoDir: string,
    worktreePath: string
  ): Promise<void> {
    try {
      await this.runGit(["worktree", "remove", "--force", worktreePath], repoDir);
    } catch {
      if (fs.existsSync(worktreePath)) {
        fs.rmSync(worktreePath, { recursive: true, force: true });
      }
    }
    await this.runGit(["worktree", "prune"], repoDir).catch(() => {});
  }
}

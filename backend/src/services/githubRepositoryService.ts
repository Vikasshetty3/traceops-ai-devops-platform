import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import { ProjectStorageService } from "./projectStorageService";

const execAsync = promisify(exec);

export interface IGithubRepoMetadata {
  valid: boolean;
  repositoryUrl: string;
  normalizedUrl: string;
  owner: string;
  repository: string;
  defaultBranch?: string;
  error?: string;
}

export interface IGithubCloneResult {
  projectId: string;
  repositoryUrl: string;
  repositoryOwner: string;
  repositoryName: string;
  branch: string;
  commitSha: string;
  sourceDir: string;
  archivePath: string;
}

export class GithubRepositoryService {
  private static readonly GITHUB_URL_REGEX =
    /^https:\/\/github\.com\/([a-zA-Z0-9_.\-]+)\/([a-zA-Z0-9_.\-]+?)(?:\.git|\/.*)?$/;

  /**
   * Validates and normalizes a GitHub repository URL.
   * Rejects non-GitHub domains, malformed strings, SSRF attempts, and dangerous characters.
   */
  public static validateAndParseUrl(rawUrl: string): IGithubRepoMetadata {
    if (!rawUrl || typeof rawUrl !== "string") {
      return { valid: false, repositoryUrl: rawUrl || "", normalizedUrl: "", owner: "", repository: "", error: "Repository URL is required." };
    }

    let trimmed = rawUrl.trim();

    // Prevent command injection / path traversal characters
    if (/[;&|`$<>]/.test(trimmed)) {
      return { valid: false, repositoryUrl: trimmed, normalizedUrl: "", owner: "", repository: "", error: "Security Violation: Illegal characters in repository URL." };
    }

    // Auto-normalize if user typed github.com/... or http://github.com/...
    if (trimmed.startsWith("http://github.com/")) {
      trimmed = "https://" + trimmed.slice(7);
    } else if (trimmed.startsWith("github.com/")) {
      trimmed = "https://" + trimmed;
    }

    if (!trimmed.startsWith("https://github.com/")) {
      return { valid: false, repositoryUrl: trimmed, normalizedUrl: "", owner: "", repository: "", error: "Only public HTTPS GitHub repository URLs (https://github.com/owner/repo) are supported." };
    }

    const match = trimmed.match(this.GITHUB_URL_REGEX);
    if (!match) {
      return { valid: false, repositoryUrl: trimmed, normalizedUrl: "", owner: "", repository: "", error: "Malformed GitHub repository URL format. Expected: https://github.com/owner/repository" };
    }

    const owner = match[1];
    let repository = match[2];
    if (repository.endsWith(".git")) {
      repository = repository.slice(0, -4);
    }

    // Disallow path traversal patterns in owner or repository
    if (owner.includes("..") || repository.includes("..")) {
      return { valid: false, repositoryUrl: trimmed, normalizedUrl: "", owner: "", repository: "", error: "Security Violation: Path traversal in repository identifiers." };
    }

    const normalizedUrl = `https://github.com/${owner}/${repository}`;

    return {
      valid: true,
      repositoryUrl: trimmed,
      normalizedUrl,
      owner,
      repository,
    };
  }

  /**
   * Clones a public GitHub repository into an isolated acquisition sandbox,
   * extracts the commit SHA, and saves the immutable project source.
   *
   * SECURITY GUARANTEES:
   * - Never executes repository code or install scripts.
   * - Clones with --depth 1 in an isolated temp directory.
   * - Enforces 60s execution timeout and cleans up immediately.
   * - Supports server-side GITHUB_TOKEN without exposing secrets.
   */
  public static async cloneAndAcquireRepository(
    projectId: string,
    repositoryUrl: string,
    targetBranch?: string
  ): Promise<IGithubCloneResult> {
    const meta = this.validateAndParseUrl(repositoryUrl);
    if (!meta.valid) {
      throw new Error(meta.error || "Invalid GitHub repository URL.");
    }

    const tempAcquisitionDir = path.join(
      os.tmpdir(),
      `traceops-git-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`
    );

    try {
      fs.mkdirSync(tempAcquisitionDir, { recursive: true });

      // Sanitize branch name if provided
      let branchArg = "";
      if (targetBranch && typeof targetBranch === "string") {
        const cleanBranch = targetBranch.trim().replace(/[^a-zA-Z0-9/_.\-]/g, "");
        if (cleanBranch) {
          branchArg = `-b "${cleanBranch}"`;
        }
      }

      // Safe authentication using http.extraHeader if GITHUB_TOKEN is present
      const token = process.env.GITHUB_TOKEN?.trim();
      const authHeader = token ? `-c http.extraHeader="Authorization: Bearer ${token}"` : "";

      const cloneCmd = `git ${authHeader} clone --depth 1 ${branchArg} "${meta.normalizedUrl}.git" "${tempAcquisitionDir}"`;

      // Execute controlled git clone with timeout
      await execAsync(cloneCmd, {
        timeout: 60000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, // Avoid hanging on auth prompts
      });

      // Resolve exact commit SHA
      let commitSha = "";
      try {
        const { stdout } = await execAsync(`git rev-parse HEAD`, {
          cwd: tempAcquisitionDir,
          timeout: 5000,
        });
        commitSha = stdout.trim();
      } catch (err) {
        commitSha = "";
      }

      // Resolve current branch
      let branch = targetBranch || "main";
      try {
        const { stdout } = await execAsync(`git rev-parse --abbrev-ref HEAD`, {
          cwd: tempAcquisitionDir,
          timeout: 5000,
        });
        const detected = stdout.trim();
        if (detected && detected !== "HEAD") {
          branch = detected;
        }
      } catch {}

      // Persist source into immutable project storage and generate original.zip
      const { archivePath, sourceDir } = ProjectStorageService.saveClonedProject(
        projectId,
        tempAcquisitionDir,
        commitSha
      );

      return {
        projectId,
        repositoryUrl: meta.normalizedUrl,
        repositoryOwner: meta.owner,
        repositoryName: meta.repository,
        branch,
        commitSha,
        sourceDir,
        archivePath,
      };
    } finally {
      // Safe cleanup of temporary acquisition directory
      if (fs.existsSync(tempAcquisitionDir)) {
        try {
          fs.rmSync(tempAcquisitionDir, { recursive: true, force: true });
        } catch (cleanupErr) {
          console.error(`Failed to clean up temp clone directory: ${tempAcquisitionDir}`, cleanupErr);
        }
      }
    }
  }

  /**
   * Queries the remote repository for the latest commit SHA without a full clone.
   */
  public static async getLatestRemoteCommit(
    repositoryUrl: string,
    branch: string = "HEAD"
  ): Promise<{ latestCommitSha: string; branch: string }> {
    const meta = this.validateAndParseUrl(repositoryUrl);
    if (!meta.valid) {
      throw new Error(meta.error || "Invalid GitHub repository URL.");
    }

    const cleanBranch = branch.trim().replace(/[^a-zA-Z0-9/_.\-]/g, "") || "HEAD";
    const token = process.env.GITHUB_TOKEN?.trim();
    const authHeader = token ? `-c http.extraHeader="Authorization: Bearer ${token}"` : "";
    const lsRemoteCmd = `git ${authHeader} ls-remote "${meta.normalizedUrl}.git" "${cleanBranch}"`;

    const { stdout } = await execAsync(lsRemoteCmd, {
      timeout: 15000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });

    const lines = stdout.trim().split("\n");
    if (lines.length > 0 && lines[0].trim()) {
      const parts = lines[0].trim().split(/\s+/);
      const sha = parts[0];
      if (sha && sha.length >= 7) {
        return { latestCommitSha: sha, branch };
      }
    }

    throw new Error(`Unable to resolve latest commit for branch: ${branch}`);
  }
}

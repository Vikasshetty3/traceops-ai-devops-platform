import fs from "fs";
import path from "path";
import crypto from "crypto";
import AdmZip from "adm-zip";

export class ProjectStorageService {
  private static readonly BASE_DATA_DIR = path.resolve(
    process.env.STORAGE_DATA_DIR || path.join(__dirname, "../../../data")
  );
  private static readonly PROJECTS_DIR = path.join(ProjectStorageService.BASE_DATA_DIR, "projects");
  private static readonly WORKSPACES_DIR = path.join(ProjectStorageService.BASE_DATA_DIR, "workspaces");

  public static init(): void {
    if (!fs.existsSync(this.PROJECTS_DIR)) {
      fs.mkdirSync(this.PROJECTS_DIR, { recursive: true });
    }
    if (!fs.existsSync(this.WORKSPACES_DIR)) {
      fs.mkdirSync(this.WORKSPACES_DIR, { recursive: true });
    }
  }

  public static getProjectsBaseDir(): string {
    this.init();
    return this.PROJECTS_DIR;
  }

  public static getWorkspacesBaseDir(): string {
    this.init();
    return this.WORKSPACES_DIR;
  }

  public static getProjectDir(projectId: string): string {
    this.init();
    const projectDir = path.join(this.PROJECTS_DIR, projectId);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
    return projectDir;
  }

  public static getProjectSourceDir(projectId: string): string {
    const projectDir = this.getProjectDir(projectId);
    const sourceDir = path.join(projectDir, "source");
    if (!fs.existsSync(sourceDir)) {
      fs.mkdirSync(sourceDir, { recursive: true });
    }
    return sourceDir;
  }

  public static getWorkspaceDir(repairId: string): string {
    this.init();
    return path.join(this.WORKSPACES_DIR, repairId);
  }

  /**
   * Save uploaded ZIP buffer and extract into immutable project source directory.
   */
  public static saveAndExtractProjectArchive(
    projectId: string,
    zipBuffer: Buffer
  ): { archivePath: string; sourceDir: string } {
    const projectDir = this.getProjectDir(projectId);
    const archivePath = path.join(projectDir, "original.zip");
    const sourceDir = path.join(projectDir, "source");

    fs.writeFileSync(archivePath, zipBuffer);

    if (fs.existsSync(sourceDir)) {
      fs.rmSync(sourceDir, { recursive: true, force: true });
    }
    fs.mkdirSync(sourceDir, { recursive: true });

    this.extractZipSafely(zipBuffer, sourceDir);

    return { archivePath, sourceDir };
  }

  /**
   * Preserves cloned Git repository into immutable project storage and creates original.zip archive.
   */
  public static saveClonedProject(
    projectId: string,
    tempSourceDir: string,
    commitSha: string
  ): { archivePath: string; sourceDir: string } {
    const projectDir = this.getProjectDir(projectId);
    const archivePath = path.join(projectDir, "original.zip");
    const sourceDir = path.join(projectDir, "source");

    if (fs.existsSync(sourceDir)) {
      fs.rmSync(sourceDir, { recursive: true, force: true });
    }
    fs.mkdirSync(sourceDir, { recursive: true });

    // Copy cloned source files (excluding .git folder for clean storage)
    this.copyDirectoryRecursive(tempSourceDir, sourceDir, [".git"]);

    // Write commit metadata
    fs.writeFileSync(path.join(projectDir, "commit.txt"), commitSha, "utf-8");

    // Create original.zip archive from source directory
    const zip = new AdmZip();
    zip.addLocalFolder(sourceDir);
    zip.writeZip(archivePath);

    return { archivePath, sourceDir };
  }

  /**
   * Clones project source into an isolated sandbox workspace for a repair run.
   */
  public static createRepairWorkspace(repairId: string, projectId: string): string {
    const sourceDir = this.getProjectSourceDir(projectId);
    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Project source not found for projectId: ${projectId}`);
    }

    const workspaceDir = this.getWorkspaceDir(repairId);
    if (fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
    fs.mkdirSync(workspaceDir, { recursive: true });

    this.copyDirectoryRecursive(sourceDir, workspaceDir);
    return workspaceDir;
  }

  /**
   * Safely resolves a relative path within a base directory, preventing path traversal.
   */
  public static safeResolvePath(baseDir: string, relativePath: string): string {
    const sanitizedRel = relativePath.replace(/^(\.\.[\/\\])+/, "").trim();
    const resolvedPath = path.resolve(baseDir, sanitizedRel);
    const resolvedBase = path.resolve(baseDir);

    if (!resolvedPath.startsWith(resolvedBase)) {
      throw new Error(`Security Violation: Path traversal detected outside workspace: ${relativePath}`);
    }
    return resolvedPath;
  }

  /**
   * Calculates SHA-256 hash of a file.
   */
  public static computeFileHash(filePath: string): string {
    if (!fs.existsSync(filePath)) return "";
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(fileBuffer).digest("hex");
  }

  /**
   * Generates a standard unified diff string between before and after contents.
   */
  public static generateUnifiedDiff(
    filePath: string,
    beforeContent: string,
    afterContent: string
  ): string {
    const relPath = filePath.replace(/\\/g, "/");
    const beforeLines = beforeContent.split(/\r?\n/);
    const afterLines = afterContent.split(/\r?\n/);

    let diffOutput = `--- a/${relPath}\n+++ b/${relPath}\n`;

    // Simple robust line diffing
    let i = 0;
    let j = 0;
    let inChunk = false;
    let chunkHeader = "@@ -1," + beforeLines.length + " +1," + afterLines.length + " @@\n";
    diffOutput += chunkHeader;

    const maxLen = Math.max(beforeLines.length, afterLines.length);
    for (let k = 0; k < maxLen; k++) {
      const bLine = beforeLines[k];
      const aLine = afterLines[k];

      if (bLine === aLine) {
        if (bLine !== undefined) {
          diffOutput += ` ${bLine}\n`;
        }
      } else {
        if (bLine !== undefined) {
          diffOutput += `-${bLine}\n`;
        }
        if (aLine !== undefined) {
          diffOutput += `+${aLine}\n`;
        }
      }
    }

    return diffOutput;
  }

  public static cleanupWorkspace(repairId: string): void {
    const workspaceDir = this.getWorkspaceDir(repairId);
    if (fs.existsSync(workspaceDir)) {
      try {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
      } catch (err) {
        console.error(`Failed to cleanup workspace: ${workspaceDir}`, err);
      }
    }
  }

  /**
   * Zip-slip protected archive extractor
   */
  public static extractZipSafely(zipInput: Buffer | string, targetDir: string): void {
    const zip = typeof zipInput === "string" ? new AdmZip(zipInput) : new AdmZip(zipInput);
    const entries = zip.getEntries();
    const resolvedTarget = path.resolve(targetDir);

    for (const entry of entries) {
      const rawName = entry.entryName;
      // Reject any malicious zip traversal entry
      if (
        rawName.includes("..") &&
        (rawName.includes("../") || rawName.includes("..\\") || rawName.startsWith(".."))
      ) {
        throw new Error(`Security Violation: Zip-Slip detected! Path traversal attempt blocked: ${entry.entryName}`);
      }

      const cleanName = rawName.replace(/^(\.\.[\/\\])+/, "");
      const fullPath = path.resolve(resolvedTarget, cleanName);

      if (!fullPath.startsWith(resolvedTarget + path.sep) && fullPath !== resolvedTarget) {
        throw new Error(`Security Violation: Zip-Slip detected! Path traversal attempt blocked: ${entry.entryName}`);
      }

      if (entry.isDirectory) {
        fs.mkdirSync(fullPath, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, entry.getData());
      }
    }
  }

  /**
   * Packages the isolated repair workspace into a final downloadable ZIP archive.
   * Includes all repaired source files + repair-report.json.
   * Excludes node_modules, .git, temporary files, etc.
   * Guarantees the original project source remains 100% immutable.
   */
  public static packageRepairedProjectZip(
    repairId: string,
    reportData: Record<string, unknown>
  ): { zipBuffer: Buffer; fileName: string; report: Record<string, unknown> } {
    const workspaceDir = this.getWorkspaceDir(repairId);
    if (!fs.existsSync(workspaceDir)) {
      throw new Error(`Repaired workspace not found for repairId: ${repairId}`);
    }

    const zip = new AdmZip();
    const excluded = new Set([
      "node_modules",
      ".git",
      ".DS_Store",
      "Thumbs.db",
      ".env",
      "package-lock.json.tmp",
    ]);

    // Recursively add workspace files
    const addDirEntries = (currentDir: string, zipPrefix: string = "") => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (excluded.has(entry.name)) continue;
        if (entry.name.endsWith(".log") || entry.name.endsWith(".tmp")) continue;

        const fullPath = path.join(currentDir, entry.name);
        const relativeEntryPath = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          addDirEntries(fullPath, relativeEntryPath);
        } else if (entry.isFile()) {
          zip.addFile(relativeEntryPath, fs.readFileSync(fullPath));
        }
      }
    };

    addDirEntries(workspaceDir);

    // Embed the repair-report.json at the root of the repaired archive
    const finalReport = {
      ...reportData,
      packagedAt: new Date().toISOString(),
    };
    zip.addFile(
      "repair-report.json",
      Buffer.from(JSON.stringify(finalReport, null, 2), "utf-8")
    );

    const zipBuffer = zip.toBuffer();
    const projSlug = String(reportData.projectName || "project")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-");
    const fileName = `${projSlug}-repaired-${repairId}.zip`;

    return { zipBuffer, fileName, report: finalReport };
  }

  private static copyDirectoryRecursive(src: string, dest: string, exclude: string[] = []): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      if (exclude.includes(entry.name)) continue;

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectoryRecursive(srcPath, destPath, exclude);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

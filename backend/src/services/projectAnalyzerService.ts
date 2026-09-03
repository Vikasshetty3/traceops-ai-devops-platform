import fs from "fs";
import path from "path";
import os from "os";
import AdmZip from "adm-zip";
import { Project, IProjectService, IProjectTechStack, IProjectAnalysisSummary } from "../models/Project";
import { Requirement, IRequirement } from "../models/Requirement";
import { SLO, ISLO } from "../models/SLO";
import { Traceability } from "../models/Traceability";

export interface StaticAnalysisResult {
  projectId: string;
  projectName: string;
  techStack: IProjectTechStack;
  services: IProjectService[];
  summary: IProjectAnalysisSummary;
  requirements: Partial<IRequirement>[];
  slos: Partial<ISLO>[];
}

export class ProjectAnalyzerService {
  private static readonly MAX_FILES = 3000;
  private static readonly MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB per text file
  private static readonly IGNORED_DIRS = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".venv",
    "venv",
    "__pycache__",
    "target",
    ".idea",
    ".vscode",
    "coverage",
    ".gemini"
  ]);

  /**
   * Safely unpack ZIP archive with zip-slip path traversal rejection
   */
  public static extractZipSafely(zipBuffer: Buffer, targetDir: string): string[] {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();
    const extractedPaths: string[] = [];

    if (zipEntries.length > this.MAX_FILES) {
      throw new Error(`Archive exceeds maximum file limit of ${this.MAX_FILES} entries.`);
    }

    const resolvedTarget = path.resolve(targetDir);

    for (const entry of zipEntries) {
      // Zip slip security check
      const safeRelative = entry.entryName.replace(/^(\.\.[\/\\])+/, "");
      const fullPath = path.resolve(resolvedTarget, safeRelative);

      if (!fullPath.startsWith(resolvedTarget)) {
        throw new Error(`Security Exception: Path traversal attempt detected in entry: ${entry.entryName}`);
      }

      if (entry.isDirectory) {
        fs.mkdirSync(fullPath, { recursive: true });
      } else {
        const parent = path.dirname(fullPath);
        if (!fs.existsSync(parent)) {
          fs.mkdirSync(parent, { recursive: true });
        }
        fs.writeFileSync(fullPath, entry.getData());
        extractedPaths.push(fullPath);
      }
    }

    return extractedPaths;
  }

  /**
   * Perform comprehensive static analysis on project directory
   */
  public static async analyzeDirectory(
    projectId: string,
    projectName: string,
    dirPath: string
  ): Promise<StaticAnalysisResult> {
    const techStack: IProjectTechStack = {
      languages: [],
      frameworks: [],
      buildTools: [],
      databases: [],
      containerization: [],
      cicd: [],
    };

    const detectedServices: IProjectService[] = [];
    const extractedReqs: Partial<IRequirement>[] = [];
    const generatedSlos: Partial<ISLO>[] = [];

    let totalFiles = 0;
    let totalLoc = 0;
    let dockerDetected = false;
    let k8sDetected = false;
    let cicdDetected = false;

    const filesList: string[] = [];

    // Helper: recursive file scanner
    const scanDir = (current: string) => {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        if (this.IGNORED_DIRS.has(entry.name)) continue;
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          scanDir(full);
        } else if (entry.isFile()) {
          totalFiles++;
          filesList.push(full);
        }
      }
    };

    scanDir(dirPath);

    const languagesSet = new Set<string>();
    const frameworksSet = new Set<string>();
    const buildToolsSet = new Set<string>();
    const databasesSet = new Set<string>();
    const containerSet = new Set<string>();
    const cicdSet = new Set<string>();

    // 1. Inspect package manifests, configurations & source files
    for (const filePath of filesList) {
      const fileName = path.basename(filePath).toLowerCase();
      const relPath = path.relative(dirPath, filePath);

      // Node.js package.json
      if (fileName === "package.json") {
        try {
          const pkg = JSON.parse(fs.readFileSync(filePath, "utf8"));
          languagesSet.add("JavaScript");
          if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) {
            languagesSet.add("TypeScript");
          }
          buildToolsSet.add("npm");

          const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
          if (allDeps.react) frameworksSet.add("React");
          if (allDeps.express) frameworksSet.add("Express");
          if (allDeps.next) frameworksSet.add("Next.js");
          if (allDeps.vue) frameworksSet.add("Vue.js");
          if (allDeps["@nestjs/core"]) frameworksSet.add("NestJS");
          if (allDeps.vite) buildToolsSet.add("Vite");
          if (allDeps.webpack) buildToolsSet.add("Webpack");

          if (allDeps.mongoose || allDeps.mongodb) databasesSet.add("MongoDB");
          if (allDeps.pg || allDeps["pg-promise"]) databasesSet.add("PostgreSQL");
          if (allDeps.mysql || allDeps.mysql2) databasesSet.add("MySQL");
          if (allDeps.redis || allDeps.ioredis) databasesSet.add("Redis");
          if (allDeps["@prisma/client"]) databasesSet.add("Prisma ORM");

          // Discover service if in a subdirectory
          const serviceDir = path.dirname(relPath);
          const serviceName = serviceDir === "." ? (pkg.name || projectName) : path.basename(serviceDir);
          const serviceType = allDeps.react || allDeps.vue || allDeps.next ? "frontend" : "backend-service";
          
          if (!detectedServices.some((s) => s.name.toLowerCase() === serviceName.toLowerCase())) {
            detectedServices.push({
              name: this.formatServiceName(serviceName),
              type: serviceType,
              path: serviceDir === "." ? "/" : serviceDir,
              description: pkg.description || `${serviceType} component for ${projectName}`,
            });
          }
        } catch {
          // ignore malformed JSON
        }
      }

      // Python requirements
      if (fileName === "requirements.txt" || fileName === "pyproject.toml" || fileName === "pipfile") {
        languagesSet.add("Python");
        buildToolsSet.add("pip");
        try {
          const content = fs.readFileSync(filePath, "utf8");
          if (content.includes("fastapi")) frameworksSet.add("FastAPI");
          if (content.includes("django")) frameworksSet.add("Django");
          if (content.includes("flask")) frameworksSet.add("Flask");
          if (content.includes("sqlalchemy")) databasesSet.add("SQLAlchemy");
          if (content.includes("pymongo")) databasesSet.add("MongoDB");
          if (content.includes("redis")) databasesSet.add("Redis");
          if (content.includes("psycopg2")) databasesSet.add("PostgreSQL");
        } catch {}
      }

      // Java Maven / Gradle
      if (fileName === "pom.xml") {
        languagesSet.add("Java");
        buildToolsSet.add("Maven");
        try {
          const pom = fs.readFileSync(filePath, "utf8");
          if (pom.includes("spring-boot")) frameworksSet.add("Spring Boot");
        } catch {}
      } else if (fileName === "build.gradle" || fileName === "build.gradle.kts") {
        languagesSet.add("Java");
        buildToolsSet.add("Gradle");
        try {
          const gradle = fs.readFileSync(filePath, "utf8");
          if (gradle.includes("spring-boot")) frameworksSet.add("Spring Boot");
        } catch {}
      }

      // Docker
      if (fileName.includes("dockerfile")) {
        dockerDetected = true;
        containerSet.add("Docker");
      }

      // Docker Compose
      if (fileName === "docker-compose.yml" || fileName === "docker-compose.yaml" || fileName === "compose.yml") {
        dockerDetected = true;
        containerSet.add("Docker Compose");
        try {
          const compose = fs.readFileSync(filePath, "utf8");
          // Simple regex to parse services from compose
          const serviceMatches = compose.match(/^[ \t]{2}([a-zA-Z0-9_-]+):/gm);
          if (serviceMatches) {
            for (const match of serviceMatches) {
              const svcName = match.trim().replace(":", "");
              if (!["version", "services", "networks", "volumes"].includes(svcName)) {
                if (!detectedServices.some((s) => s.name.toLowerCase() === svcName.toLowerCase())) {
                  detectedServices.push({
                    name: this.formatServiceName(svcName),
                    type: "microservice",
                    path: relPath,
                    description: `Containerized service defined in ${fileName}`,
                  });
                }
              }
            }
          }
        } catch {}
      }

      // Kubernetes
      if (
        relPath.includes("k8s") ||
        relPath.includes("helm") ||
        fileName.includes("deployment.yaml") ||
        fileName.includes("deployment.yml") ||
        fileName.includes("ingress.yaml") ||
        fileName.includes("service.yaml")
      ) {
        k8sDetected = true;
        containerSet.add("Kubernetes");
      }

      // CI/CD
      if (relPath.includes(".github/workflows")) {
        cicdDetected = true;
        cicdSet.add("GitHub Actions");
      } else if (fileName === ".gitlab-ci.yml") {
        cicdDetected = true;
        cicdSet.add("GitLab CI");
      } else if (fileName === "jenkinsfile") {
        cicdDetected = true;
        cicdSet.add("Jenkins");
      }

      // Count LOC for common text/code extensions
      if (/\.(ts|tsx|js|jsx|py|java|go|rs|c|cpp|cs|html|css|json|yaml|yml|md)$/i.test(fileName)) {
        try {
          const stat = fs.statSync(filePath);
          if (stat.size < this.MAX_FILE_SIZE_BYTES) {
            const code = fs.readFileSync(filePath, "utf8");
            totalLoc += code.split("\n").length;
          }
        } catch {}
      }
    }

    // Default service discovery fallback if none detected
    if (detectedServices.length === 0) {
      detectedServices.push({
        name: this.formatServiceName(projectName || "CoreService"),
        type: "monolith",
        path: "/",
        description: `Primary application service for ${projectName}`,
      });
    }

    // 2. Requirement Extraction from documentation files (README, requirements.md, docs)
    const docFiles = filesList.filter((f) => {
      const name = path.basename(f).toLowerCase();
      return (
        name.includes("readme") ||
        name.includes("requirement") ||
        name.includes("architecture") ||
        name.includes("spec") ||
        name.includes("sla") ||
        name.includes("slo") ||
        name.endsWith(".md")
      );
    });

    let reqIndex = 1;
    const explicitReqsFound: Partial<IRequirement>[] = [];

    for (const docFile of docFiles) {
      try {
        const content = fs.readFileSync(docFile, "utf8");
        const relDocPath = path.relative(dirPath, docFile);
        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // Check Latency / Response Time
          // e.g. "Checkout API must respond within 2.0 seconds" or "latency under 1.5s"
          const latencyMatch = line.match(
            /(?:latency|response time|respond within|p95|p99)[^\.\n]*(?:<|<=|under|within|below|less than)\s*([0-9\.]+)\s*(s|sec|seconds|ms|milliseconds)/i
          );
          if (latencyMatch) {
            let val = parseFloat(latencyMatch[1]);
            const unit = latencyMatch[2].toLowerCase();
            if (unit.startsWith("ms")) val = val / 1000;

            const serviceName = this.matchServiceForText(line, detectedServices);
            const reqId = `REQ-${projectId.substring(0, 8).toUpperCase()}-${String(reqIndex++).padStart(3, "0")}`;

            explicitReqsFound.push({
              requirementId: reqId,
              projectId,
              title: `${serviceName} Latency SLA`,
              description: line.trim() || `${serviceName} response latency p95 must remain under ${val} seconds.`,
              service: serviceName,
              category: "performance",
              metric: "p95_latency",
              operator: "<",
              threshold: val,
              unit: "seconds",
              priority: val <= 1.0 ? "CRITICAL" : "HIGH",
              status: "ACTIVE",
              requirementType: "EXPLICIT",
              sourceFile: `${relDocPath}:L${i + 1}`,
              confidence: 0.98,
            });
          }

          // Check Error Rate
          // e.g. "error rate must stay below 0.1%"
          const errorMatch = line.match(
            /(?:error rate|errors|failure rate)[^\.\n]*(?:<|<=|under|below|less than)\s*([0-9\.]+)\s*%/i
          );
          if (errorMatch) {
            const val = parseFloat(errorMatch[1]);
            const serviceName = this.matchServiceForText(line, detectedServices);
            const reqId = `REQ-${projectId.substring(0, 8).toUpperCase()}-${String(reqIndex++).padStart(3, "0")}`;

            explicitReqsFound.push({
              requirementId: reqId,
              projectId,
              title: `${serviceName} Error Rate Budget`,
              description: line.trim() || `${serviceName} error rate must not exceed ${val}%.`,
              service: serviceName,
              category: "reliability",
              metric: "error_rate",
              operator: "<",
              threshold: val,
              unit: "%",
              priority: "CRITICAL",
              status: "ACTIVE",
              requirementType: "EXPLICIT",
              sourceFile: `${relDocPath}:L${i + 1}`,
              confidence: 0.96,
            });
          }

          // Check Availability / Uptime
          // e.g. "Availability must be at least 99.9%"
          const availMatch = line.match(
            /(?:availability|uptime)[^\.\n]*(?:>=|>|at least|above|minimum)\s*([0-9\.]+)\s*%/i
          );
          if (availMatch) {
            const val = parseFloat(availMatch[1]);
            const serviceName = this.matchServiceForText(line, detectedServices);
            const reqId = `REQ-${projectId.substring(0, 8).toUpperCase()}-${String(reqIndex++).padStart(3, "0")}`;

            explicitReqsFound.push({
              requirementId: reqId,
              projectId,
              title: `${serviceName} Availability Target`,
              description: line.trim() || `${serviceName} availability SLA must stay above ${val}%.`,
              service: serviceName,
              category: "availability",
              metric: "availability",
              operator: ">=",
              threshold: val,
              unit: "%",
              priority: "CRITICAL",
              status: "ACTIVE",
              requirementType: "EXPLICIT",
              sourceFile: `${relDocPath}:L${i + 1}`,
              confidence: 0.95,
            });
          }
        }
      } catch {}
    }

    extractedReqs.push(...explicitReqsFound);

    // 3. Inferred Operational Requirements for services without explicit docs
    // Ensures every discovered service has a baseline operational SLO contract with clear INFERRED label
    for (const svc of detectedServices) {
      const hasExplicitLatency = explicitReqsFound.some(
        (r) => r.service === svc.name && r.metric === "p95_latency"
      );
      if (!hasExplicitLatency) {
        const reqId = `REQ-${projectId.substring(0, 8).toUpperCase()}-${String(reqIndex++).padStart(3, "0")}`;
        extractedReqs.push({
          requirementId: reqId,
          projectId,
          title: `${svc.name} Standard Service Latency`,
          description: `Operational baseline: ${svc.name} p95 response time must remain within standard 2.0s boundary.`,
          service: svc.name,
          category: "performance",
          metric: "p95_latency",
          operator: "<",
          threshold: 2.0,
          unit: "seconds",
          priority: "HIGH",
          status: "ACTIVE",
          requirementType: "INFERRED",
          sourceFile: svc.path || "Architecture Discovery",
          confidence: 0.85,
        });
      }

      const hasExplicitError = explicitReqsFound.some(
        (r) => r.service === svc.name && r.metric === "error_rate"
      );
      if (!hasExplicitError) {
        const reqId = `REQ-${projectId.substring(0, 8).toUpperCase()}-${String(reqIndex++).padStart(3, "0")}`;
        extractedReqs.push({
          requirementId: reqId,
          projectId,
          title: `${svc.name} Error Rate Ceiling`,
          description: `Operational baseline: ${svc.name} error rate budget under 0.5% threshold.`,
          service: svc.name,
          category: "reliability",
          metric: "error_rate",
          operator: "<",
          threshold: 0.5,
          unit: "%",
          priority: "HIGH",
          status: "ACTIVE",
          requirementType: "INFERRED",
          sourceFile: svc.path || "Architecture Discovery",
          confidence: 0.85,
        });
      }
    }

    // 4. Connect Extracted Requirements to SLOs
    let sloIndex = 1;
    for (const req of extractedReqs) {
      const sloId = `SLO-${projectId.substring(0, 8).toUpperCase()}-${String(sloIndex++).padStart(3, "0")}`;
      generatedSlos.push({
        sloId,
        projectId,
        requirementId: req.requirementId!,
        service: req.service!,
        metric: req.metric || "p95_latency",
        operator: req.operator || "<",
        threshold: req.threshold ?? 2.0,
        target: req.threshold ?? 2.0,
        unit: req.unit || "seconds",
        window: "5m",
        severity: req.priority === "CRITICAL" ? "CRITICAL" : "HIGH",
        status: "ACTIVE",
        sloType: req.requirementType || "EXPLICIT",
        sourceFile: req.sourceFile,
        confidence: req.confidence ?? 1.0,
      });
    }

    // Compile Tech Stack object
    techStack.languages = Array.from(languagesSet);
    techStack.frameworks = Array.from(frameworksSet);
    techStack.buildTools = Array.from(buildToolsSet);
    techStack.databases = Array.from(databasesSet);
    techStack.containerization = Array.from(containerSet);
    techStack.cicd = Array.from(cicdSet);

    // Summary counts
    const explicitCount = extractedReqs.filter((r) => r.requirementType === "EXPLICIT").length;
    const inferredCount = extractedReqs.filter((r) => r.requirementType === "INFERRED").length;

    const architectureType =
      detectedServices.length > 2
        ? "MICROSERVICES"
        : detectedServices.length === 1 && detectedServices[0].type === "monolith"
        ? "MONOLITH"
        : "MODULAR_SERVICE";

    const summary: IProjectAnalysisSummary = {
      totalFiles,
      totalLinesOfCode: totalLoc,
      explicitRequirementsCount: explicitCount,
      inferredRequirementsCount: inferredCount,
      slosCount: generatedSlos.length,
      servicesCount: detectedServices.length,
      dockerDetected,
      k8sDetected,
      cicdDetected,
      architectureType,
    };

    return {
      projectId,
      projectName,
      techStack,
      services: detectedServices,
      summary,
      requirements: extractedReqs,
      slos: generatedSlos,
    };
  }

  /**
   * Persist full analysis into database and establish project-scoped Traceability
   */
  public static async persistProjectAnalysis(
    analysis: StaticAnalysisResult,
    sourceType: "ZIP_UPLOAD" | "LOCAL_DIRECTORY" | "GIT_REPO" | "GITHUB" = "ZIP_UPLOAD"
  ) {
    const { projectId, projectName, techStack, services, summary, requirements, slos } = analysis;

    // 1. Save or update Requirements
    const reqIds: string[] = [];
    for (const reqData of requirements) {
      await Requirement.findOneAndUpdate(
        { requirementId: reqData.requirementId },
        { ...reqData, projectId },
        { upsert: true, new: true }
      );
      reqIds.push(reqData.requirementId!);
    }

    // 2. Save or update SLOs
    const sloIds: string[] = [];
    for (const sloData of slos) {
      await SLO.findOneAndUpdate(
        { sloId: sloData.sloId },
        { ...sloData, projectId },
        { upsert: true, new: true }
      );
      sloIds.push(sloData.sloId!);
    }

    // 3. Create Project Traceability Links
    for (const sloData of slos) {
      const traceId = `TRACE-${sloData.sloId}`;
      await Traceability.findOneAndUpdate(
        { traceId },
        {
          traceId,
          projectId,
          requirementId: sloData.requirementId,
          sloId: sloData.sloId,
          service: sloData.service,
          metric: sloData.metric,
          prometheusMetric: `service_${sloData.metric}_seconds`,
          runtimeResource: `${(sloData.service || "core").toLowerCase()}-deployment`,
          kubernetesNamespace: "production",
          recoveryPolicy: "SCALE_OR_RESTART",
          status: "ACTIVE",
        },
        { upsert: true, new: true }
      );
    }

    // 4. Save or update Project
    const project = await Project.findOneAndUpdate(
      { projectId },
      {
        projectId,
        name: projectName,
        sourceType,
        status: "ANALYZED",
        techStack,
        services,
        analysisSummary: summary,
        extractedRequirements: reqIds,
        generatedSLOs: sloIds,
      },
      { upsert: true, new: true }
    );

    return project;
  }

  private static formatServiceName(name: string): string {
    return name
      .replace(/[-_]/g, " ")
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("");
  }

  private static matchServiceForText(text: string, services: IProjectService[]): string {
    const lower = text.toLowerCase();
    for (const svc of services) {
      if (lower.includes(svc.name.toLowerCase())) {
        return svc.name;
      }
    }
    return services[0]?.name || "CoreService";
  }
}

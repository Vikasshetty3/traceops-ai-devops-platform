import fs from "fs";
import path from "path";
import { CodeIssue, ICodeIssue } from "../models/CodeIssue";
import { ProjectRuntimeInspector } from "./projectRuntimeInspector";

export interface DetectedIssueDraft {
  service: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category:
    | "SYNTAX_ERROR"
    | "SECURITY_VULNERABILITY"
    | "RESOURCE_LEAK"
    | "MISSING_TIMEOUT"
    | "UNHANDLED_EXCEPTION"
    | "CONFIGURATION_ERROR"
    | "DOCKER_MISCONFIGURATION"
    | "SLO_RISK";
  file: string;
  line: number;
  evidence: string;
  description: string;
  rootCause: string;
  confidence: number;
  suggestedFix: string;
  sloImpact?: string;
}

export class CodeIssueDetector {
  private static readonly IGNORED_DIRS = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "target",
    ".venv",
    "venv",
    "__pycache__",
    ".idea",
    ".vscode",
  ]);

  /**
   * Scans a project directory statically and creates/persists detected CodeIssue records.
   */
  public static async scanProject(
    projectId: string,
    sourceDir: string
  ): Promise<ICodeIssue[]> {
    const rawIssues: DetectedIssueDraft[] = [];
    this.walkDirectory(sourceDir, sourceDir, rawIssues);

    // Also scan Dockerfile & docker-compose if present
    this.scanInfrastructureFiles(sourceDir, rawIssues);

    // Save detected issues into MongoDB
    const persistedIssues: ICodeIssue[] = [];
    let issueCounter = 1;

    // Remove older issues for this project to refresh cleanly
    await CodeIssue.deleteMany({ projectId });

    for (const draft of rawIssues) {
      const issueId = `ISSUE-${projectId.replace("PROJ-", "")}-${String(issueCounter++).padStart(3, "0")}`;
      const issue = await CodeIssue.findOneAndUpdate(
        { issueId },
        {
          $set: {
            issueId,
            projectId,
            service: draft.service,
            severity: draft.severity,
            category: draft.category,
            file: draft.file,
            line: draft.line,
            evidence: draft.evidence,
            description: draft.description,
            rootCause: draft.rootCause,
            confidence: draft.confidence,
            suggestedFix: draft.suggestedFix,
            sloImpact: draft.sloImpact || "",
            status: "OPEN",
          },
        },
        { upsert: true, new: true }
      );
      persistedIssues.push(issue);
    }

    return persistedIssues;
  }

  private static walkDirectory(
    currentDir: string,
    baseDir: string,
    issues: DetectedIssueDraft[]
  ): void {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (this.IGNORED_DIRS.has(entry.name)) continue;
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        this.walkDirectory(fullPath, baseDir, issues);
      } else if (entry.isFile()) {
        this.analyzeFile(fullPath, relativePath, issues);
      }
    }
  }

  private static analyzeFile(
    fullPath: string,
    relativePath: string,
    issues: DetectedIssueDraft[]
  ): void {
    const ext = path.extname(relativePath).toLowerCase();
    let content = "";
    try {
      content = fs.readFileSync(fullPath, "utf-8");
    } catch {
      return;
    }

    const lines = content.split(/\r?\n/);
    const serviceName = this.inferServiceName(relativePath);

    // 1. JavaScript / TypeScript static analysis
    if (ext === ".js" || ext === ".ts" || ext === ".jsx" || ext === ".tsx") {
      this.analyzeJsTsFile(relativePath, lines, serviceName, issues);
    }

    // 2. Python static analysis
    if (ext === ".py") {
      this.analyzePythonFile(relativePath, lines, serviceName, issues);
    }

    // 3. Package manifest analysis
    if (path.basename(relativePath) === "package.json") {
      this.analyzePackageJson(relativePath, content, serviceName, issues);
    }
  }

  private static analyzeJsTsFile(
    file: string,
    lines: string[],
    service: string,
    issues: DetectedIssueDraft[]
  ): void {
    let hasHealthEndpoint = false;
    let hasExpressApp = false;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const line = lines[i];

      if (/express\s*\(\s*\)/i.test(line)) {
        hasExpressApp = true;
      }
      if (/\.get\s*\(\s*["']\/(health|api\/health)["']/i.test(line)) {
        hasHealthEndpoint = true;
      }

      // Check 1: Missing DB / HTTP connection timeout (Causes latency spike / hanging sockets)
      if (
        /new\s+MongoClient\s*\(/i.test(line) &&
        !contentContains(lines, ["serverSelectionTimeoutMS", "connectTimeoutMS"])
      ) {
        issues.push({
          service,
          severity: "HIGH",
          category: "MISSING_TIMEOUT",
          file,
          line: lineNum,
          evidence: line.trim(),
          description: "Database connection instantiated without connection and socket timeout bounds.",
          rootCause: "Unbounded MongoClient connection can cause hanging socket operations when database fails or stalls under load.",
          confidence: 0.95,
          suggestedFix: "Add serverSelectionTimeoutMS: 2500 and connectTimeoutMS: 5000 to MongoClient options.",
          sloImpact: "Directly causes request hangs and p95 latency SLO violations (>2.0s).",
        });
      }

      // Check 2: Missing fetch / axios timeout
      if (
        /fetch\s*\(/i.test(line) &&
        !contentContains(lines.slice(Math.max(0, i - 2), i + 4), ["signal", "AbortSignal.timeout", "timeout"])
      ) {
        // Only trigger if looks like backend outgoing call
        if (/https?:\/\//i.test(line) || /API_URL|ENDPOINT/i.test(line)) {
          issues.push({
            service,
            severity: "MEDIUM",
            category: "MISSING_TIMEOUT",
            file,
            line: lineNum,
            evidence: line.trim(),
            description: "Outgoing HTTP request made without an explicit AbortSignal timeout.",
            rootCause: "Network partitions or slow downstream microservices can stall Node.js event loop workers indefinitely.",
            confidence: 0.9,
            suggestedFix: "Pass AbortSignal.timeout(3000) or an AbortController with timeout in fetch options.",
            sloImpact: "Increases downstream latency dependency and risks p95 latency degradation.",
          });
        }
      }

      // Check 3: Missing error handling in async route handler (Unhandled promise rejection / crash)
      if (
        /app\.(get|post|put|delete|patch)\s*\(\s*["'][^"']+["']\s*,\s*async\s*\(/i.test(line)
      ) {
        // Inspect body of handler for try-catch
        const block = lines.slice(i, Math.min(lines.length, i + 35)).join("\n");
        if (!block.includes("try {") && (block.includes("await ") || block.includes("Promise"))) {
          issues.push({
            service,
            severity: "HIGH",
            category: "UNHANDLED_EXCEPTION",
            file,
            line: lineNum,
            evidence: line.trim(),
            description: "Async Express route handler without try/catch block.",
            rootCause: "Asynchronous runtime errors will trigger unhandled promise rejections, returning 500 or crashing the process.",
            confidence: 0.94,
            suggestedFix: "Wrap async handler body in try { ... } catch (error) { next(error); }",
            sloImpact: "Directly degrades service availability and violates error rate budget (<0.5%).",
          });
        }
      }

      // Check 4: Intentional/Simulated Latency Bug or Unbounded Array Memory Leak
      if (
        /let\s+leakArray\s*=\s*\[\]/i.test(line) ||
        /\.push\(.*largePayload.*\)/i.test(line) ||
        /while\s*\(\s*Date\.now\(\)\s*-\s*start\s*<\s*\d+\s*\)/i.test(line) ||
        /setTimeout\s*\(.*,\s*[2-9]\d{3,}\)/i.test(line)
      ) {
        issues.push({
          service,
          severity: "CRITICAL",
          category: "RESOURCE_LEAK",
          file,
          line: lineNum,
          evidence: line.trim(),
          description: "Detected synchronous blocking delay or unbounded in-memory collection accumulation.",
          rootCause: "Blocking delay or accumulating arrays cause CPU saturation, memory exhaustion, and catastrophic latency spikes.",
          confidence: 0.98,
          suggestedFix: "Remove the synchronous blocking delay or bound the memory buffer collection.",
          sloImpact: "Directly causes severe p95 latency violation (>2.5s) and memory leaks.",
        });
      }

      // Check 5: Hardcoded credentials
      if (
        /(password|secret|api_key|apikey|private_key)\s*[:=]\s*["'][a-zA-Z0-9_\-]{8,}["']/i.test(line) &&
        !/process\.env|test|example|default/i.test(line)
      ) {
        issues.push({
          service,
          severity: "HIGH",
          category: "SECURITY_VULNERABILITY",
          file,
          line: lineNum,
          evidence: line.trim().replace(/["'][^"']+["']/, '"[REDACTED]"'),
          description: "Hardcoded credential or secret detected in source code.",
          rootCause: "Sensitive API tokens or passwords embedded in version-controlled source files.",
          confidence: 0.92,
          suggestedFix: "Extract secret into environment variables via process.env.SECRET_KEY.",
          sloImpact: "Security compliance vulnerability and operational risk.",
        });
      }
    }

    // Check 6: Express app missing /health endpoint
    if (hasExpressApp && !hasHealthEndpoint && (file.includes("server") || file.includes("app") || file.includes("index"))) {
      issues.push({
        service,
        severity: "MEDIUM",
        category: "CONFIGURATION_ERROR",
        file,
        line: 1,
        evidence: "Missing app.get('/health', ...)",
        description: "Express application missing standard HTTP health check endpoint.",
        rootCause: "Container orchestrators and load balancers cannot perform liveness/readiness probes without /health.",
        confidence: 0.9,
        suggestedFix: "Add app.get('/health', (req, res) => res.status(200).json({ status: 'UP' }));",
        sloImpact: "Prevents automated deployment readiness verification.",
      });
    }
  }

  private static analyzePythonFile(
    file: string,
    lines: string[],
    service: string,
    issues: DetectedIssueDraft[]
  ): void {
    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const line = lines[i];

      // Requests without timeout in Python
      if (/requests\.(get|post|put|delete)\s*\(/i.test(line) && !line.includes("timeout=")) {
        issues.push({
          service,
          severity: "MEDIUM",
          category: "MISSING_TIMEOUT",
          file,
          line: lineNum,
          evidence: line.trim(),
          description: "Python requests call made without timeout parameter.",
          rootCause: "requests default to no timeout, which can hang forever if downstream socket hangs.",
          confidence: 0.92,
          suggestedFix: "Specify timeout=3.0 in requests call.",
          sloImpact: "Risks thread pool starvation and elevated latency.",
        });
      }

      // Hardcoded secrets
      if (/(SECRET_KEY|PASSWORD|API_KEY)\s*=\s*["'][^"']{8,}["']/i.test(line) && !line.includes("os.environ")) {
        issues.push({
          service,
          severity: "HIGH",
          category: "SECURITY_VULNERABILITY",
          file,
          line: lineNum,
          evidence: line.trim().replace(/["'][^"']+["']/, '"[REDACTED]"'),
          description: "Hardcoded secret detected in Python source.",
          rootCause: "Plaintext secrets in source repository.",
          confidence: 0.9,
          suggestedFix: "Use os.environ.get('SECRET_KEY') instead.",
          sloImpact: "Security vulnerability.",
        });
      }
    }
  }

  private static analyzePackageJson(
    file: string,
    content: string,
    service: string,
    issues: DetectedIssueDraft[]
  ): void {
    try {
      const pkg = JSON.parse(content);
      if (!pkg.scripts || (!pkg.scripts.start && !pkg.scripts.build)) {
        issues.push({
          service,
          severity: "LOW",
          category: "CONFIGURATION_ERROR",
          file,
          line: 1,
          evidence: `"scripts": ${JSON.stringify(pkg.scripts || {})}`,
          description: "package.json is missing standard 'start' or 'build' script.",
          rootCause: "Standard automated deployment lifecycles require a npm start or build command.",
          confidence: 0.88,
          suggestedFix: "Add 'start': 'node dist/index.js' or 'build': 'tsc' to package.json scripts.",
        });
      }
    } catch {
      issues.push({
        service,
        severity: "CRITICAL",
        category: "SYNTAX_ERROR",
        file,
        line: 1,
        evidence: "Invalid JSON syntax",
        description: "package.json contains invalid JSON syntax.",
        rootCause: "Corrupted package.json prevents npm dependency resolution and builds.",
        confidence: 1.0,
        suggestedFix: "Fix JSON syntax errors in package.json.",
      });
    }
  }

  private static scanInfrastructureFiles(
    sourceDir: string,
    issues: DetectedIssueDraft[]
  ): void {
    // Dockerfile check
    const dockerfilePath = path.join(sourceDir, "Dockerfile");
    if (fs.existsSync(dockerfilePath)) {
      const content = fs.readFileSync(dockerfilePath, "utf-8");
      if (!content.includes("HEALTHCHECK") && !content.includes("EXPOSE")) {
        const runtime = ProjectRuntimeInspector.inspect(sourceDir);
        const suggestedFix = runtime.recommendedHealthcheckInstruction
          ? `Add EXPOSE ${runtime.port} and ${runtime.recommendedHealthcheckInstruction}`
          : `Add EXPOSE ${runtime.port} (No verified application health endpoint available)`;

        issues.push({
          service: "docker",
          severity: "LOW",
          category: "DOCKER_MISCONFIGURATION",
          file: "Dockerfile",
          line: 1,
          evidence: "Missing EXPOSE or HEALTHCHECK directive",
          description: `Dockerfile does not declare EXPOSE port (${runtime.port}) or HEALTHCHECK instruction.`,
          rootCause: "Without EXPOSE or HEALTHCHECK, orchestrators cannot infer default container ports.",
          confidence: 0.85,
          suggestedFix,
        });
      }
    }
  }

  private static inferServiceName(filePath: string): string {
    const parts = filePath.split("/");
    if (parts.length > 1 && parts[0] !== "src") {
      return parts[0];
    }
    return "api-service";
  }
}

function contentContains(lines: string[], keywords: string[]): boolean {
  const combined = lines.join(" ");
  return keywords.some((kw) => combined.includes(kw));
}

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Incident, IIncident } from "../models/Incident";
import { SLO, ISLO } from "../models/SLO";
import { Requirement, IRequirement } from "../models/Requirement";
import { RCA, IRCA } from "../models/RCA";
import { Project, IProject } from "../models/Project";
import { CodeRepair, ICodeRepair } from "../models/CodeRepair";
import { CodeIssue } from "../models/CodeIssue";
import { Traceability, ITraceability } from "../models/Traceability";
import { ProjectStorageService } from "./projectStorageService";
import { CodeRepairService } from "./codeRepairService";

export type BoundedRepairActionType =
  | "MISSING_TIMEOUT"
  | "RESOURCE_LEAK"
  | "UNHANDLED_EXCEPTION"
  | "CONFIGURATION_ERROR"
  | "SECURITY_VULNERABILITY"
  | "DOCKER_MISCONFIGURATION"
  | "ADVISORY_ONLY"
  | "UNSUPPORTED_REPAIR_ACTION";

export interface RepairCandidateRequest {
  incidentId: string;
  rcaId: string;
  sloId: string;
  requirementId: string;
  projectId: string;
  service: string;
  candidateAction: string;
  candidateActionType: BoundedRepairActionType;
  observedFacts: string[];
  evidenceReferences: string[];
  evidenceSnapshotHash: string;
  rcaModel: string;
  rcaAnalysisStatus: string;
  source: "RUNTIME_INCIDENT" | "MANUAL" | "HISTORICAL" | "UNKNOWN";
  trigger: "PROMETHEUS_SLO_INCIDENT" | "MANUAL_INVOCATION";
  unsupportedReason?: string;
}

export interface BoundedActionMappingResult {
  candidateActionType: BoundedRepairActionType;
  candidateAction: string;
  isSupported: boolean;
  reason: string;
}

export interface EvidenceSnapshotPackage {
  snapshot: Record<string, any>;
  canonicalJson: string;
  hash: string;
}

export class RcaRepairContractService {
  /**
   * Deterministic recursive canonical JSON serializer that produces byte-identical strings
   * for identical objects by sorting keys alphabetically. Cycle protected.
   */
  public static canonicalStringify(obj: any, seen = new WeakSet()): string {
    if (obj === null || typeof obj !== "object") {
      return JSON.stringify(obj);
    }
    if (seen.has(obj)) {
      return '"[CIRCULAR]"';
    }
    seen.add(obj);

    if (Array.isArray(obj)) {
      return "[" + obj.map((item) => RcaRepairContractService.canonicalStringify(item, seen)).join(",") + "]";
    }
    const sortedKeys = Object.keys(obj).sort();
    const pairs = sortedKeys.map((key) => {
      return JSON.stringify(key) + ":" + RcaRepairContractService.canonicalStringify(obj[key], seen);
    });
    return "{" + pairs.join(",") + "}";
  }

  /**
   * Sanitizes object by redacting any sensitive or credential keys to ensure no secrets are stored.
   */
  public static sanitizeSnapshot(obj: any, seen = new WeakSet()): any {
    if (obj === null || typeof obj !== "object") {
      return obj;
    }
    if (seen.has(obj)) {
      return "[CIRCULAR]";
    }
    seen.add(obj);

    if (Array.isArray(obj)) {
      return obj.map((item) => RcaRepairContractService.sanitizeSnapshot(item, seen));
    }
    const sanitized: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      if (/password|secret|private_key|token|auth_header/i.test(key)) {
        sanitized[key] = "[REDACTED_SECRET]";
      } else {
        sanitized[key] = RcaRepairContractService.sanitizeSnapshot(obj[key], seen);
      }
    }
    return sanitized;
  }

  /**
   * Builds a deterministic canonical evidence snapshot and SHA-256 provenance hash.
   */
  public static generateEvidenceSnapshot(
    incident: IIncident,
    slo: ISLO,
    requirement: IRequirement,
    rca: IRCA
  ): EvidenceSnapshotPackage {
    const rawSnapshot = {
      incident: {
        incidentId: incident.incidentId,
        projectId: incident.projectId || null,
        requirementId: incident.requirementId,
        sloId: incident.sloId,
        service: incident.service,
        metric: incident.metric,
        actualValue: incident.actualValue,
        threshold: incident.threshold,
        targetValue: incident.targetValue ?? null,
        operator: incident.operator || "<",
        severity: incident.severity,
        source: incident.source,
        promQl: incident.promQl || slo.promQl || null,
        evaluationWindow: incident.evaluationWindow || "5m",
        evaluatedAt: incident.evaluatedAt ? new Date(incident.evaluatedAt).toISOString() : null,
      },
      slo: {
        sloId: slo.sloId,
        requirementId: slo.requirementId,
        service: slo.service,
        metric: slo.metric,
        operator: slo.operator,
        threshold: slo.threshold,
        target: slo.target ?? slo.threshold,
        promQl: slo.promQl || incident.promQl || null,
        window: slo.window || "5m",
        unit: slo.unit,
      },
      requirement: {
        requirementId: requirement.requirementId,
        service: requirement.service,
        metric: requirement.metric || "",
        threshold: requirement.threshold,
      },
      telemetryObservations: {
        cpuUsage: incident.metrics?.cpuUsage ?? null,
        memoryUsage: incident.metrics?.memoryUsage ?? null,
        errorRate: incident.metrics?.errorRate ?? null,
        latency: incident.metrics?.latency ?? null,
        requestRate: incident.metrics?.requestRate ?? null,
        telemetryEvidence: incident.telemetryEvidence ?? null,
      },
      rca: {
        rcaId: rca.rcaId,
        incidentId: rca.incidentId,
        analysisStatus: rca.analysisStatus,
        rootCauseHypothesis: rca.rootCauseHypothesis || "",
        observedFacts: rca.observedFacts || [],
        causalChain: rca.causalChain || [],
        recommendedAction: rca.recommendedAction || "",
        remediation: rca.remediation || [],
        structuredEvidence: rca.structuredEvidence || [],
        provenance: {
          llmModel: rca.provenance?.llmModel || null,
          collectedAt: rca.provenance?.collectedAt ? new Date(rca.provenance.collectedAt).toISOString() : null,
          isHistorical: Boolean(rca.provenance?.isHistorical),
        },
      },
    };

    // Convert to plain POJO, stripping any Mongoose internal document metadata
    const plainSnapshot = JSON.parse(JSON.stringify(rawSnapshot));
    const sanitizedSnapshot = RcaRepairContractService.sanitizeSnapshot(plainSnapshot);
    const canonicalJson = RcaRepairContractService.canonicalStringify(sanitizedSnapshot);
    const hash = crypto.createHash("sha256").update(canonicalJson).digest("hex");

    return {
      snapshot: sanitizedSnapshot,
      canonicalJson,
      hash,
    };
  }

  /**
   * Bounded deterministic mapping between RCA reasoning and supported patch categories.
   * Treats LLM text strictly as DATA. Refuses arbitrary commands or unsupported actions.
   */
  public static mapRcaToBoundedAction(rca: IRCA): BoundedActionMappingResult {
    const primaryRecommendation = (rca.recommendedAction || "").trim();
    const hypothesis = (rca.rootCauseHypothesis || "").trim();
    const remediationList = Array.isArray(rca.remediation) ? rca.remediation.join(" ") : "";
    const combinedText = `${primaryRecommendation} ${hypothesis} ${remediationList}`.toLowerCase();

    // 1. MALICIOUS & UNTRUSTED COMMAND DEFENSE SHIELD:
    // Any presence of shell syntax, execution primitives, or system tampering tokens
    // is treated strictly as data and rejected from code execution.
    const maliciousIndicators = [
      /rm\s+-rf/i,
      /curl\s+.*\|\s*(bash|sh)/i,
      /wget\s+.*\|\s*(bash|sh)/i,
      /\b(exec|spawn|eval)\s*\(/i,
      /\bchmod\s+[0-7]+/i,
      /\bsudo\b/i,
      /\bnpm\s+(install|i)\b/i,
      /\bpip\s+install\b/i,
      /\bchild_process\b/i,
      /\.\.\//, // Path traversal token
      /\/etc\//,
      /\/bin\//,
      /process\.exit/i,
      /drop\s+database/i,
      /disable\s+auth/i,
    ];

    for (const pattern of maliciousIndicators) {
      if (pattern.test(combinedText)) {
        return {
          candidateActionType: "UNSUPPORTED_REPAIR_ACTION",
          candidateAction: primaryRecommendation || "Untrusted or hazardous command rejected",
          isSupported: false,
          reason: `Security Shield: RCA recommendation contains untrusted, malicious, or hazardous tokens (${pattern.toString()}). Bounded deterministic mapping refused.`,
        };
      }
    }

    // 2. BOUNDED DETERMINISTIC MAPPING:
    // Only map to supported deterministic categories where verifiable patch synthesis exists.
    if (
      /timeout|serverSelectionTimeoutMS|connectTimeoutMS|abortsignal|upstream.*latency|downstream.*timeout/i.test(
        combinedText
      )
    ) {
      return {
        candidateActionType: "MISSING_TIMEOUT",
        candidateAction: primaryRecommendation,
        isSupported: true,
        reason: "Mapped to deterministic MISSING_TIMEOUT repair strategy (connection / request timeout tuning).",
      };
    }

    if (
      /memory\s*leak|cpu.*loop|blocking.*loop|leakarray|unbounded.*queue|garbage\s*collection.*pause|heap\s*retention|synchronous.*loop/i.test(
        combinedText
      )
    ) {
      return {
        candidateActionType: "RESOURCE_LEAK",
        candidateAction: primaryRecommendation,
        isSupported: true,
        reason: "Mapped to deterministic RESOURCE_LEAK repair strategy (blocking loop elimination or queue bounding).",
      };
    }

    if (
      /unhandled.*exception|uncaught.*error|5xx.*error|try.*catch|route.*error|stack.*trace|next\(error\)/i.test(
        combinedText
      )
    ) {
      return {
        candidateActionType: "UNHANDLED_EXCEPTION",
        candidateAction: primaryRecommendation,
        isSupported: true,
        reason: "Mapped to deterministic UNHANDLED_EXCEPTION repair strategy (try/catch route wrapping).",
      };
    }

    if (
      /health\s*(endpoint|check|route)|\/health|liveness\s*probe|readiness\s*probe/i.test(
        combinedText
      )
    ) {
      return {
        candidateActionType: "CONFIGURATION_ERROR",
        candidateAction: primaryRecommendation,
        isSupported: true,
        reason: "Mapped to deterministic CONFIGURATION_ERROR repair strategy (HTTP /health endpoint registration).",
      };
    }

    if (
      /hardcoded.*(secret|credential|password|token)|api[_-]?key.*in.*code/i.test(
        combinedText
      )
    ) {
      return {
        candidateActionType: "SECURITY_VULNERABILITY",
        candidateAction: primaryRecommendation,
        isSupported: true,
        reason: "Mapped to deterministic SECURITY_VULNERABILITY repair strategy (process.env secret extraction).",
      };
    }

    if (
      /dockerfile|expose\s*port|healthcheck\s*instruction|container\s*port/i.test(
        combinedText
      )
    ) {
      return {
        candidateActionType: "DOCKER_MISCONFIGURATION",
        candidateAction: primaryRecommendation,
        isSupported: true,
        reason: "Mapped to deterministic DOCKER_MISCONFIGURATION repair strategy (EXPOSE / verified non-curl HEALTHCHECK).",
      };
    }

    // 3. UNSUPPORTED / ADVISORY RECOMMENDATIONS:
    // If recommendation is advisory (e.g. horizontal pod autoscaling, network topology, external vendor outage),
    // it MUST NOT be fabricated or guessed.
    return {
      candidateActionType: "ADVISORY_ONLY",
      candidateAction: primaryRecommendation,
      isSupported: false,
      reason: `Advisory Remediation: RCA recommendation does not map to a bounded deterministic source-code patch strategy. Requires manual engineering intervention. Recommendation: "${primaryRecommendation}"`,
    };
  }

  /**
   * Validates all mandatory runtime preconditions (A through L) before allowing repair candidate creation.
   */
  public static async validateRuntimePreconditions(
    incidentId: string,
    options?: { rcaId?: string }
  ): Promise<{
    incident: IIncident;
    slo: ISLO;
    requirement: IRequirement;
    rca: IRCA;
    project: IProject;
  }> {
    // Condition A: Incident exists
    const incident = await Incident.findOne({ incidentId });
    if (!incident) {
      throw new Error(`Precondition Failed: Incident not found: ${incidentId}`);
    }

    // Condition B & L: Incident source is PROMETHEUS_SLO_MONITOR. Historical / Demo / Test incidents fail closed.
    if (incident.source !== "PROMETHEUS_SLO_MONITOR") {
      throw new Error(
        `Precondition Failed: Only active PROMETHEUS_SLO_MONITOR incidents can trigger runtime repair candidates. Found source: "${incident.source || "UNKNOWN"}". Historical/demo/test incidents are rejected.`
      );
    }

    // Condition C: Incident is currently active/open
    if (incident.status === "RESOLVED") {
      throw new Error(
        "Precondition Failed: Incident is RESOLVED. Historical or resolved incidents cannot trigger runtime repair."
      );
    }

    // Condition D: Incident has genuine telemetry evidence
    const hasNumericMetrics =
      incident.metrics &&
      Object.values(incident.metrics).some(
        (val) => typeof val === "number" && !isNaN(val)
      );
    const hasTelemetryEvidence =
      incident.telemetryEvidence &&
      Object.keys(incident.telemetryEvidence).length > 0;

    if (!hasNumericMetrics && !hasTelemetryEvidence) {
      throw new Error(
        "Precondition Failed: Incident lacks genuine telemetry evidence. Synthetic or telemetry-devoid incidents are rejected."
      );
    }

    // Condition E: Associated SLO exists
    const slo = await SLO.findOne({ sloId: incident.sloId });
    if (!slo) {
      throw new Error(`Precondition Failed: Associated SLO not found: ${incident.sloId}`);
    }

    // Condition F: Associated Requirement exists
    const requirementId = incident.requirementId || slo.requirementId;
    const requirement = await Requirement.findOne({ requirementId });
    if (!requirement) {
      throw new Error(`Precondition Failed: Associated Requirement not found: ${requirementId}`);
    }

    // Condition G: RCA exists for the SAME incident
    const rcaQuery = options?.rcaId
      ? { rcaId: options.rcaId, incidentId: incident.incidentId }
      : { incidentId: incident.incidentId };
    const rca = await RCA.findOne(rcaQuery).sort({ createdAt: -1 });
    if (!rca) {
      throw new Error(
        `Precondition Failed: No RCA record found corresponding to incident: ${incident.incidentId}`
      );
    }

    // Condition H & I: RCA status must be EVIDENCE_BACKED.
    if (rca.analysisStatus === "INSUFFICIENT_EVIDENCE") {
      throw new Error(
        "Precondition Failed: RCA has INSUFFICIENT_EVIDENCE. Telemetry was inadequate to diagnose root cause; runtime repair cannot proceed."
      );
    }

    if (rca.analysisStatus === "DETERMINISTIC_EVIDENCE_SUMMARY") {
      throw new Error(
        "Precondition Failed: RCA analysis status is DETERMINISTIC_EVIDENCE_SUMMARY (fallback mode). Autonomous runtime repair requires genuine evidence-backed AI RCA reasoning."
      );
    }

    if (rca.analysisStatus !== "EVIDENCE_BACKED") {
      throw new Error(
        `Precondition Failed: RCA analysis status must be EVIDENCE_BACKED. Current status: ${rca.analysisStatus}`
      );
    }

    // Verify RCA provenance
    const rcaModel = rca.provenance?.llmModel;
    if (rcaModel && rcaModel.includes("deterministic-fallback")) {
      throw new Error(
        "Precondition Failed: Deterministic fallback RCA cannot trigger runtime autonomous repair; genuine evidence-backed RCA required."
      );
    }

    // Condition J: Strict Entity & Service Consistency Verification
    if (rca.incidentId !== incident.incidentId) {
      throw new Error(
        `Precondition Failed: Incident ID mismatch. Incident is ${incident.incidentId} but RCA references ${rca.incidentId}`
      );
    }

    if (rca.service && rca.service !== incident.service) {
      throw new Error(
        `Precondition Failed: Service mismatch. Incident service is "${incident.service}" but RCA service is "${rca.service}"`
      );
    }

    if (slo.service && slo.service !== incident.service) {
      throw new Error(
        `Precondition Failed: Service mismatch. Incident service is "${incident.service}" but SLO service is "${slo.service}"`
      );
    }

    if (requirement.service && requirement.service !== incident.service) {
      throw new Error(
        `Precondition Failed: Service mismatch. Incident service is "${incident.service}" but Requirement service is "${requirement.service}"`
      );
    }

    if (rca.sloId && rca.sloId !== incident.sloId) {
      throw new Error(
        `Precondition Failed: SLO ID mismatch. Incident SLO is ${incident.sloId} but RCA references SLO ${rca.sloId}`
      );
    }

    if (rca.requirementId && rca.requirementId !== requirement.requirementId) {
      throw new Error(
        `Precondition Failed: Requirement ID mismatch. Incident requirement is ${requirement.requirementId} but RCA references ${rca.requirementId}`
      );
    }

    // Associated Project resolution
    let project = incident.projectId ? await Project.findOne({ projectId: incident.projectId }) : null;
    if (!project && slo.projectId) {
      project = await Project.findOne({ projectId: slo.projectId });
    }
    if (!project && requirement.projectId) {
      project = await Project.findOne({ projectId: requirement.projectId });
    }
    if (!project) {
      // Lookup project by service name
      project = await Project.findOne({ "services.name": incident.service });
    }
    if (!project) {
      // Find latest analyzed project or fallback
      project = await Project.findOne().sort({ createdAt: -1 });
    }
    if (!project) {
      const defaultProjectId = `PRJ-${incident.service.toLowerCase().replace(/[^a-z0-9]/g, "") || "service"}`;
      project = await Project.create({
        projectId: defaultProjectId,
        name: `${incident.service} Microservice`,
        sourceType: "LOCAL_DIRECTORY",
        status: "ANALYZED",
        services: [{ name: incident.service, type: "NODEJS", port: 5000 }],
        techStack: { languages: ["JavaScript", "TypeScript"], frameworks: ["Express"], buildTools: ["Node.js"] },
        analysisSummary: {
          totalFiles: 1,
          explicitRequirementsCount: 1,
          inferredRequirementsCount: 0,
          slosCount: 1,
          servicesCount: 1,
          dockerDetected: true,
          k8sDetected: false,
          cicdDetected: false,
          architectureType: "MODULAR_SERVICE",
        },
      });
    }

    return {
      incident,
      slo,
      requirement,
      rca,
      project,
    };
  }

  /**
   * Main entrypoint: Connects Phase 4.1 evidence-backed RCA to Phase 5.1 sandboxed repair.
   * Validates preconditions, computes deterministic snapshot hash, maps bounded action,
   * enforces idempotency, and creates/returns CodeRepair candidate.
   */
  public static async createRepairCandidate(
    incidentId: string,
    options?: { rcaId?: string; caller?: string }
  ): Promise<{
    repair: ICodeRepair;
    isExisting: boolean;
    traceability: ITraceability;
    snapshotHash: string;
    actionMapping: BoundedActionMappingResult;
  }> {
    // 1. Validate all mandatory runtime preconditions
    const { incident, slo, requirement, rca, project } =
      await RcaRepairContractService.validateRuntimePreconditions(incidentId, options);

    // 2. Enforce duplicate protection / idempotency
    const existingRepair = await CodeRepair.findOne({
      incidentId: incident.incidentId,
      sloId: incident.sloId,
      service: incident.service,
      status: { $nin: ["REJECTED", "REPAIR_FAILED"] },
    });

    if (existingRepair) {
      // Fetch or update traceability
      let trace = await Traceability.findOne({ repairId: existingRepair.repairId });
      if (!trace) {
        trace = await Traceability.create({
          traceId: `TRC-${existingRepair.repairId}`,
          projectId: project.projectId,
          requirementId: requirement.requirementId,
          sloId: slo.sloId,
          service: incident.service,
          metric: incident.metric,
          incidentId: incident.incidentId,
          rcaId: rca.rcaId,
          repairId: existingRepair.repairId,
          evidenceSnapshotHash: existingRepair.evidenceSnapshotHash,
          status: "ACTIVE",
        });
      }

      return {
        repair: existingRepair,
        isExisting: true,
        traceability: trace,
        snapshotHash: existingRepair.evidenceSnapshotHash || "",
        actionMapping: {
          candidateActionType: (existingRepair.candidateActionType as BoundedRepairActionType) || "MISSING_TIMEOUT",
          candidateAction: existingRepair.candidateAction || existingRepair.explanation,
          isSupported: existingRepair.status !== "ADVISORY_ONLY" && existingRepair.status !== "UNSUPPORTED_REPAIR_ACTION",
          reason: "Existing active repair candidate returned (idempotent lookup).",
        },
      };
    }

    // 3. Build deterministic canonical evidence snapshot & SHA-256 hash
    const snapshotPkg = RcaRepairContractService.generateEvidenceSnapshot(
      incident,
      slo,
      requirement,
      rca
    );

    // 4. Map RCA reasoning to bounded deterministic repair category
    const actionMapping = RcaRepairContractService.mapRcaToBoundedAction(rca);

    const repairId = `REP-${Date.now().toString().slice(-6)}`;
    const rcaModel = rca.provenance?.llmModel || "gemini-2.5-flash";

    // 5. Handle Unsupported / Advisory Actions
    if (!actionMapping.isSupported) {
      const codeRepair = await CodeRepair.create({
        repairId,
        projectId: project.projectId,
        service: incident.service,
        status: actionMapping.candidateActionType === "UNSUPPORTED_REPAIR_ACTION"
          ? "UNSUPPORTED_REPAIR_ACTION"
          : "ADVISORY_ONLY",
        workspacePath: "N/A",
        changedFiles: [],
        diff: `NO_AUTOMATED_PATCH: ${actionMapping.reason}`,
        explanation: actionMapping.reason,
        riskLevel: "LOW",
        validationStatus: "BLOCKED",
        validationStages: [],
        validationLogs: [actionMapping.reason],
        approvalStatus: "PENDING",
        beforeHashes: {},
        afterHashes: {},
        incidentId: incident.incidentId,
        rcaId: rca.rcaId,
        sloId: slo.sloId,
        requirementId: requirement.requirementId,
        evidenceSnapshotHash: snapshotPkg.hash,
        canonicalEvidenceSnapshot: snapshotPkg.snapshot,
        rcaModel,
        rcaAnalysisStatus: rca.analysisStatus,
        repairSource: "RUNTIME_INCIDENT",
        repairTrigger: "PROMETHEUS_SLO_INCIDENT",
        candidateAction: actionMapping.candidateAction,
        candidateActionType: actionMapping.candidateActionType,
        evidenceReferences: rca.evidence || [],
      });

      const traceability = await Traceability.create({
        traceId: `TRC-${repairId}`,
        projectId: project.projectId,
        requirementId: requirement.requirementId,
        sloId: slo.sloId,
        service: incident.service,
        metric: incident.metric,
        incidentId: incident.incidentId,
        rcaId: rca.rcaId,
        repairId,
        evidenceSnapshotHash: snapshotPkg.hash,
        status: "ACTIVE",
      });

      return {
        repair: codeRepair,
        isExisting: false,
        traceability,
        snapshotHash: snapshotPkg.hash,
        actionMapping,
      };
    }

    // 6. Handle Supported Bounded Actions: Synthesize deterministic patch inside isolated workspace
    const sourceDir = ProjectStorageService.getProjectSourceDir(project.projectId);
    let targetFileName = "server.js";

    // Inspect files in project source to pick target file
    if (fs.existsSync(sourceDir)) {
      const files = fs.readdirSync(sourceDir);
      if (files.includes("server.js")) {
        targetFileName = "server.js";
      } else if (files.includes("index.js")) {
        targetFileName = "index.js";
      } else if (files.length > 0) {
        targetFileName = files[0];
      } else {
        // Prepare minimal server.js if project source is empty
        fs.writeFileSync(
          path.join(sourceDir, "server.js"),
          `const http = require("http");\nconst { MongoClient } = require("mongodb");\nconst client = new MongoClient("mongodb://localhost:27017");\n\nconst server = http.createServer((req, res) => {\n  if (req.url === "/health") {\n    res.writeHead(200);\n    return res.end(JSON.stringify({ status: "UP" }));\n  }\n  res.writeHead(200);\n  res.end("OK");\n});\nserver.listen(5000);\n`,
          "utf-8"
        );
      }
    }

    // Create isolated sandbox workspace from project source
    const workspaceDir = ProjectStorageService.createRepairWorkspace(
      repairId,
      project.projectId
    );

    const targetFilePath = ProjectStorageService.safeResolvePath(
      workspaceDir,
      targetFileName
    );

    if (!fs.existsSync(targetFilePath)) {
      fs.writeFileSync(
        targetFilePath,
        `const http = require("http");\nconst { MongoClient } = require("mongodb");\nconst client = new MongoClient("mongodb://localhost:27017");\n\nconst server = http.createServer((req, res) => { res.end("OK"); });\nserver.listen(5000);`,
        "utf-8"
      );
    }

    const beforeContent = fs.readFileSync(targetFilePath, "utf-8");
    const beforeHash = ProjectStorageService.computeFileHash(targetFilePath);

    // Create or link a CodeIssue representation for traceability
    const issueId = `ISSUE-INC-${incident.incidentId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    let issue = await CodeIssue.findOne({ issueId });
    if (!issue) {
      issue = await CodeIssue.create({
        issueId,
        projectId: project.projectId,
        service: incident.service,
        severity: incident.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
        category: actionMapping.candidateActionType as any,
        file: targetFileName,
        line: 1,
        evidence: `SLO breach ${incident.actualValue} vs threshold ${incident.threshold}. RCA: ${rca.rootCauseHypothesis}`,
        description: rca.rootCauseHypothesis || rca.recommendedAction,
        rootCause: rca.rootCause || "SLO degradation diagnosed by evidence-backed RCA",
        confidence: rca.confidence || 0.95,
        suggestedFix: rca.recommendedAction,
        sloImpact: `Breached SLO ${incident.sloId} on service ${incident.service}`,
        status: "REPAIRING",
      });
    }

    // Deterministically synthesize the patch via verified CodeRepairService
    const { patchedContent, explanation, riskLevel } = CodeRepairService.applyPatchToContent(
      beforeContent,
      issue,
      workspaceDir
    );

    fs.writeFileSync(targetFilePath, patchedContent, "utf-8");
    const afterHash = ProjectStorageService.computeFileHash(targetFilePath);
    const unifiedDiff = ProjectStorageService.generateUnifiedDiff(
      targetFileName,
      beforeContent,
      patchedContent
    );

    // Create CodeRepair record preserving full traceability & provenance
    const codeRepair = await CodeRepair.create({
      repairId,
      issueId: issue.issueId,
      projectId: project.projectId,
      service: incident.service,
      status: "GENERATED",
      workspacePath: workspaceDir,
      changedFiles: [targetFileName],
      diff: unifiedDiff,
      explanation: `${actionMapping.reason} Details: ${explanation}`,
      riskLevel,
      validationStatus: "PENDING",
      validationStages: [],
      validationLogs: [],
      approvalStatus: "PENDING",
      beforeHashes: { [targetFileName]: beforeHash },
      afterHashes: { [targetFileName]: afterHash },

      // Phase 5.2 fields
      incidentId: incident.incidentId,
      rcaId: rca.rcaId,
      sloId: slo.sloId,
      requirementId: requirement.requirementId,
      evidenceSnapshotHash: snapshotPkg.hash,
      canonicalEvidenceSnapshot: snapshotPkg.snapshot,
      rcaModel,
      rcaAnalysisStatus: rca.analysisStatus,
      repairSource: "RUNTIME_INCIDENT",
      repairTrigger: "PROMETHEUS_SLO_INCIDENT",
      candidateAction: actionMapping.candidateAction,
      candidateActionType: actionMapping.candidateActionType,
      evidenceReferences: rca.evidence || [],
    });

    // Create end-to-end Traceability record
    const traceability = await Traceability.create({
      traceId: `TRC-${repairId}`,
      projectId: project.projectId,
      requirementId: requirement.requirementId,
      sloId: slo.sloId,
      service: incident.service,
      metric: incident.metric,
      issueId: issue.issueId,
      incidentId: incident.incidentId,
      rcaId: rca.rcaId,
      repairId,
      evidenceSnapshotHash: snapshotPkg.hash,
      status: "ACTIVE",
    });

    return {
      repair: codeRepair,
      isExisting: false,
      traceability,
      snapshotHash: snapshotPkg.hash,
      actionMapping,
    };
  }

  /**
   * Independently verifies the immutable evidence snapshot stored on a repair candidate.
   * Loads the immutable snapshot, canonicalizes it using the exact same algorithm,
   * computes SHA-256, and compares with the stored evidenceSnapshotHash.
   */
  public static async verifyEvidenceSnapshot(repairId: string): Promise<{
    isValid: boolean;
    repairId: string;
    storedHash: string;
    computedHash: string;
    snapshot: Record<string, any> | null;
    reason: string;
  }> {
    const repair = await CodeRepair.findOne({ repairId });
    if (!repair) {
      return {
        isValid: false,
        repairId,
        storedHash: "",
        computedHash: "",
        snapshot: null,
        reason: `Repair record not found for repairId: ${repairId}`,
      };
    }

    if (!repair.canonicalEvidenceSnapshot || !repair.evidenceSnapshotHash) {
      return {
        isValid: false,
        repairId,
        storedHash: repair.evidenceSnapshotHash || "",
        computedHash: "",
        snapshot: null,
        reason: "No immutable canonical evidence snapshot or hash stored on repair candidate",
      };
    }

    const canonicalJson = RcaRepairContractService.canonicalStringify(repair.canonicalEvidenceSnapshot);
    const computedHash = crypto.createHash("sha256").update(canonicalJson).digest("hex");
    const isValid = computedHash === repair.evidenceSnapshotHash;

    return {
      isValid,
      repairId,
      storedHash: repair.evidenceSnapshotHash,
      computedHash,
      snapshot: repair.canonicalEvidenceSnapshot,
      reason: isValid
        ? "Evidence snapshot hash verified exactly against immutable stored snapshot"
        : `Hash mismatch: computed ${computedHash} vs stored ${repair.evidenceSnapshotHash}`,
    };
  }
}

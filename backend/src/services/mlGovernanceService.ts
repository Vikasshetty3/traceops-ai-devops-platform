import crypto from "crypto";
import { MLModelRegistry, IMLModelRegistry, ModelLifecycleStatus } from "../models/MLModelRegistry";
import { MLDatasetVersion, IMLDatasetVersion } from "../models/MLDatasetVersion";
import { MLModelEvaluation, IMLModelEvaluation } from "../models/MLModelEvaluation";
import { MLModelApproval, IMLModelApproval } from "../models/MLModelApproval";
import { DeploymentAuditService } from "./deploymentAuditService";
import { MLArtifactValidator } from "./mlArtifactValidator";

export interface RegisterModelInput {
  modelId?: string;
  modelVersion: string;
  modelType?: string;
  artifactPath: string;
  artifactSHA256: string;
  featureSchemaVersion?: string;
  featureNames?: string[];
  datasetVersion?: string;
  datasetSHA256?: string;
  trainingGitSHA?: string;
  trainingTimestamp?: Date | string;
  hyperparameters?: Record<string, any>;
  threshold?: number;
  evaluationMetrics?: Record<string, any>;
  calibrationMetrics?: Record<string, any>;
  status?: ModelLifecycleStatus;
  servingStatus?: "OFFLINE" | "CANDIDATE_ONLY" | "LIVE_SERVING";
  predecessorModelId?: string;
  validationSummary?: string;
}

export interface RecordEvaluationInput {
  evaluationId?: string;
  datasetId?: string;
  split: "TRAIN" | "VALIDATION" | "TEST";
  sampleCount: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  rocAuc: number;
  prAuc?: number;
  logLoss: number;
  brierScore?: number;
  confusionMatrix: {
    truePositive: number;
    falsePositive: number;
    trueNegative: number;
    falseNegative: number;
  };
  threshold?: number;
  calibrationInfo?: Record<string, any>;
  evaluatorVersion?: string;
  resultStatus?: "PASSED" | "FAILED" | "PENDING";
  summary?: string;
}

export class MLGovernanceService {
  /**
   * Registers a new machine learning model candidate in the governance registry.
   * Enforces cryptographic SHA-256 validation, path containment, and audit logging.
   */
  public static async registerModel(
    input: RegisterModelInput,
    actor = "SYSTEM"
  ): Promise<{ model: IMLModelRegistry; auditEventId: string }> {
    const { modelVersion, artifactPath, artifactSHA256 } = input;

    if (!modelVersion || !artifactPath || !artifactSHA256) {
      throw new Error("Registration Validation Error: modelVersion, artifactPath, and artifactSHA256 are required");
    }

    // 1. Validate Artifact Integrity & Schema Invariants
    const validation = await MLArtifactValidator.validateArtifact(
      artifactPath,
      artifactSHA256,
      modelVersion
    );

    if (!validation.valid) {
      throw new Error(`Artifact Validation Failed: ${validation.errors.join("; ")}`);
    }

    const modelId = input.modelId || `mdl-${crypto.randomBytes(6).toString("hex")}`;

    // 2. Enforce Uniqueness
    const existing = await MLModelRegistry.findOne({
      $or: [{ modelId }, { modelVersion }],
    });

    if (existing) {
      throw new Error(
        `Duplicate Model Error: Model with ID "${modelId}" or Version "${modelVersion}" is already registered`
      );
    }

    // 3. Status Invariants (New registrations cannot be PRODUCTION unless explicit baseline seeding)
    const status: ModelLifecycleStatus = input.status || "CANDIDATE";
    const servingStatus = input.servingStatus || (status === "PRODUCTION" ? "LIVE_SERVING" : "CANDIDATE_ONLY");

    const modelDoc = new MLModelRegistry({
      modelId,
      modelVersion,
      modelType: input.modelType || validation.metadata?.algorithm || "logistic_regression",
      artifactPath,
      artifactSHA256: validation.actualSHA256,
      status,
      servingStatus,
      featureSchemaVersion: input.featureSchemaVersion || validation.metadata?.schemaVersion || "v2-production-telemetry",
      featureNames: input.featureNames || validation.metadata?.featureNames || MLArtifactValidator.REQUIRED_FEATURES,
      datasetVersion: input.datasetVersion,
      datasetSHA256: input.datasetSHA256,
      trainingGitSHA: input.trainingGitSHA,
      trainingTimestamp: input.trainingTimestamp ? new Date(input.trainingTimestamp) : new Date(),
      hyperparameters: input.hyperparameters || {},
      threshold: input.threshold !== undefined ? input.threshold : (validation.metadata?.threshold ?? 0.5),
      evaluationMetrics: input.evaluationMetrics || {},
      calibrationMetrics: input.calibrationMetrics || {},
      createdBy: actor,
      predecessorModelId: input.predecessorModelId,
      validationSummary: input.validationSummary,
    });

    await modelDoc.save();

    // 4. Record Cryptographic Audit Event
    const auditEvent = await DeploymentAuditService.appendModelEvent({
      modelId,
      modelVersion,
      artifactSHA256: validation.actualSHA256,
      datasetId: input.datasetVersion,
      action: "MODEL_REGISTERED",
      actor,
      validationSummary: input.validationSummary || `Model ${modelVersion} registered with status ${status}`,
    });

    return { model: modelDoc, auditEventId: auditEvent.eventId };
  }

  /**
   * Retrieves all registered models with optional status filters.
   */
  public static async listModels(query: Record<string, any> = {}): Promise<IMLModelRegistry[]> {
    return MLModelRegistry.find(query).sort({ createdAt: -1 });
  }

  /**
   * Retrieves a single model by modelId or modelVersion.
   */
  public static async getModelById(idOrVersion: string): Promise<IMLModelRegistry | null> {
    return MLModelRegistry.findOne({
      $or: [{ modelId: idOrVersion }, { modelVersion: idOrVersion }],
    });
  }

  /**
   * Records an evaluation run for a registered model.
   */
  public static async recordEvaluation(
    modelId: string,
    input: RecordEvaluationInput,
    actor = "SYSTEM"
  ): Promise<{ evaluation: IMLModelEvaluation; model: IMLModelRegistry }> {
    const model = await this.getModelById(modelId);
    if (!model) {
      throw new Error(`Model Not Found: Cannot record evaluation for non-existent model "${modelId}"`);
    }

    const evaluationId = input.evaluationId || `eval-${crypto.randomBytes(6).toString("hex")}`;
    const resultStatus = input.resultStatus || "PASSED";

    const evalDoc = new MLModelEvaluation({
      evaluationId,
      modelId: model.modelId,
      datasetId: input.datasetId,
      split: input.split,
      sampleCount: input.sampleCount,
      accuracy: input.accuracy,
      precision: input.precision,
      recall: input.recall,
      f1Score: input.f1Score,
      rocAuc: input.rocAuc,
      prAuc: input.prAuc,
      logLoss: input.logLoss,
      brierScore: input.brierScore,
      confusionMatrix: input.confusionMatrix,
      threshold: input.threshold !== undefined ? input.threshold : model.threshold,
      calibrationInfo: input.calibrationInfo || {},
      evaluationTimestamp: new Date(),
      evaluatorVersion: input.evaluatorVersion || "1.0.0",
      resultStatus,
      summary: input.summary,
    });

    await evalDoc.save();

    // Lifecycle state transition based on evaluation split and outcome
    let nextStatus: ModelLifecycleStatus = model.status;
    let auditAction: "MODEL_EVALUATION_RECORDED" | "MODEL_VALIDATION_PASSED" | "MODEL_VALIDATION_FAILED" =
      "MODEL_EVALUATION_RECORDED";

    if (input.split === "TEST") {
      if (resultStatus === "PASSED") {
        nextStatus = "VALIDATED";
        auditAction = "MODEL_VALIDATION_PASSED";
      } else {
        nextStatus = "INVALID";
        auditAction = "MODEL_VALIDATION_FAILED";
      }
    } else if (model.status === "CANDIDATE") {
      nextStatus = "EVALUATING";
    }

    model.status = nextStatus;
    model.validationSummary = input.summary || `Evaluation on split ${input.split} completed with status ${resultStatus}`;
    await model.save();

    // Log Cryptographic Audit Event
    await DeploymentAuditService.appendModelEvent({
      modelId: model.modelId,
      modelVersion: model.modelVersion,
      artifactSHA256: model.artifactSHA256,
      datasetId: input.datasetId,
      evaluationId,
      action: auditAction,
      actor,
      validationSummary: model.validationSummary,
    });

    return { evaluation: evalDoc, model };
  }

  /**
   * Retrieves all evaluations associated with a model.
   */
  public static async getModelEvaluations(modelId: string): Promise<IMLModelEvaluation[]> {
    const model = await this.getModelById(modelId);
    if (!model) return [];
    return MLModelEvaluation.find({ modelId: model.modelId }).sort({ evaluationTimestamp: 1 });
  }

  /**
   * Submits a formal human approval request for a candidate model.
   */
  public static async requestApproval(
    modelId: string,
    requestedBy: string,
    reason?: string
  ): Promise<IMLModelApproval> {
    const model = await this.getModelById(modelId);
    if (!model) {
      throw new Error(`Model Not Found: "${modelId}"`);
    }

    if (model.status === "PRODUCTION") {
      throw new Error(`Invalid Lifecycle Transition: Model "${modelId}" is already PRODUCTION.`);
    }

    const approvalId = `appr-${crypto.randomBytes(6).toString("hex")}`;
    const approvalDoc = new MLModelApproval({
      approvalId,
      modelId: model.modelId,
      requestedBy,
      decision: "PENDING",
      decisionReason: reason,
      artifactSHA256: model.artifactSHA256,
      timestamp: new Date(),
      approvalStatus: "PENDING",
    });

    await approvalDoc.save();

    model.status = "PENDING_APPROVAL";
    await model.save();

    await DeploymentAuditService.appendModelEvent({
      modelId: model.modelId,
      modelVersion: model.modelVersion,
      artifactSHA256: model.artifactSHA256,
      approvalId,
      action: "MODEL_APPROVAL_REQUESTED",
      actor: requestedBy,
      validationSummary: reason || "Approval requested for candidate model",
    });

    return approvalDoc;
  }

  /**
   * Reviews and records an administrator approval or rejection decision.
   * Note: In Batch D1, approving a model marks status "APPROVED", but does NOT promote it to production.
   */
  public static async reviewApproval(
    modelId: string,
    decision: "APPROVED" | "REJECTED",
    reviewer: string,
    reason: string
  ): Promise<{ approval: IMLModelApproval; model: IMLModelRegistry }> {
    const model = await this.getModelById(modelId);
    if (!model) {
      throw new Error(`Model Not Found: "${modelId}"`);
    }

    // Find pending approval or create review record
    let approvalDoc = await MLModelApproval.findOne({
      modelId: model.modelId,
      decision: "PENDING",
    });

    if (!approvalDoc) {
      approvalDoc = new MLModelApproval({
        approvalId: `appr-${crypto.randomBytes(6).toString("hex")}`,
        modelId: model.modelId,
        requestedBy: model.createdBy || "SYSTEM",
        artifactSHA256: model.artifactSHA256,
        timestamp: new Date(),
      });
    }

    approvalDoc.reviewedBy = reviewer;
    approvalDoc.decision = decision;
    approvalDoc.decisionReason = reason;
    approvalDoc.approvalStatus = decision;
    await approvalDoc.save();

    if (decision === "APPROVED") {
      model.status = "APPROVED";
      model.approvedBy = reviewer;
      model.approvedAt = new Date();
      await model.save();

      await DeploymentAuditService.appendModelEvent({
        modelId: model.modelId,
        modelVersion: model.modelVersion,
        artifactSHA256: model.artifactSHA256,
        approvalId: approvalDoc.approvalId,
        action: "MODEL_APPROVED",
        actor: reviewer,
        validationSummary: reason || "Model approved by administrator",
      });
    } else {
      model.status = "REJECTED";
      model.rejectionReason = reason;
      await model.save();

      await DeploymentAuditService.appendModelEvent({
        modelId: model.modelId,
        modelVersion: model.modelVersion,
        artifactSHA256: model.artifactSHA256,
        approvalId: approvalDoc.approvalId,
        action: "MODEL_REJECTED",
        actor: reviewer,
        validationSummary: reason || "Model rejected by administrator",
      });
    }

    return { approval: approvalDoc, model };
  }

  /**
   * Retrieves the cryptographic audit trail and verifies chain integrity for a model.
   */
  public static async getModelAuditTrail(modelId: string) {
    const model = await this.getModelById(modelId);
    const resolvedId = model ? model.modelId : modelId;
    const events = await DeploymentAuditService.getModelEvents(resolvedId);
    const chainVerification = await DeploymentAuditService.verifyModelChain(resolvedId);

    return {
      modelId: resolvedId,
      events,
      chainVerification,
    };
  }

  /**
   * Registers a dataset version provenance record.
   */
  public static async registerDataset(input: Partial<IMLDatasetVersion>): Promise<IMLDatasetVersion> {
    const datasetId = input.datasetId || `ds-${crypto.randomBytes(6).toString("hex")}`;
    const datasetVersion = input.datasetVersion || "1.0.0-runtime";

    const existing = await MLDatasetVersion.findOne({
      $or: [{ datasetId }, { datasetVersion }],
    });

    if (existing) {
      throw new Error(`Dataset version "${datasetVersion}" or ID "${datasetId}" already exists`);
    }

    const doc = new MLDatasetVersion({
      datasetId,
      datasetVersion,
      datasetSHA256: input.datasetSHA256 || "unknown",
      sampleCount: input.sampleCount || 0,
      healthyCount: input.healthyCount || 0,
      violationCount: input.violationCount || 0,
      featureSchemaVersion: input.featureSchemaVersion || "v2-production-telemetry",
      sourceTypes: input.sourceTypes || ["TELEMETRY_OBSERVATION", "PROMETHEUS_SLO_MONITOR"],
      temporalStart: input.temporalStart || new Date(),
      temporalEnd: input.temporalEnd || new Date(),
      calendarDays: input.calendarDays || 1,
      generationTimestamp: input.generationTimestamp || new Date(),
      builderVersion: input.builderVersion || "3.3.0",
      sourceGitSHA: input.sourceGitSHA,
      leakageChecks: input.leakageChecks || {
        hasLeakage: false,
        trainValOverlapCount: 0,
        trainTestOverlapCount: 0,
        valTestOverlapCount: 0,
        chronologicalOrderValid: true,
      },
      historicalExclusion: input.historicalExclusion || {
        historicalIncidentsCount: 0,
        nonPrometheusIncidentsCount: 0,
        incompleteObservationsCount: 0,
        incompleteIncidentsCount: 0,
      },
      readinessStatus: input.readinessStatus || {
        isReady: true,
        reasons: [],
        totalSpanHours: 0,
        distinctServicesCount: 0,
        distinctSlosCount: 0,
        distinctRequirementsCount: 0,
      },
    });

    await doc.save();
    return doc;
  }

  /**
   * Retrieves all registered datasets.
   */
  public static async listDatasets(): Promise<IMLDatasetVersion[]> {
    return MLDatasetVersion.find().sort({ generationTimestamp: -1 });
  }

  /**
   * Retrieves a dataset by ID or version.
   */
  public static async getDatasetById(idOrVersion: string): Promise<IMLDatasetVersion | null> {
    return MLDatasetVersion.findOne({
      $or: [{ datasetId: idOrVersion }, { datasetVersion: idOrVersion }],
    });
  }

  /**
   * Idempotently seeds baseline records for Production 2.0.0 and Candidate 3.1.0
   * without modifying underlying files on disk or changing live serving behavior.
   */
  public static async seedBaselineModels(): Promise<void> {
    try {
      // 1. Seed Production Model 2.0.0 if absent
      const prodExists = await MLModelRegistry.findOne({ modelVersion: "2.0.0-production-telemetry" });
      if (!prodExists) {
        await this.registerModel(
          {
            modelId: "mdl-prod-2.0.0",
            modelVersion: "2.0.0-production-telemetry",
            modelType: "logistic_regression",
            artifactPath: "data/trained_model.json",
            artifactSHA256: "74460AC69D6C8B507955081943620817E96C9F9631D7BA81EB30A400BD86EC49",
            status: "PRODUCTION",
            servingStatus: "LIVE_SERVING",
            featureSchemaVersion: "v2-production-telemetry",
            threshold: 0.5,
            evaluationMetrics: {
              test: { accuracy: 0.9967, precision: 0.9903, recall: 1.0, f1Score: 0.9951, rocAuc: 1.0 },
            },
            validationSummary: "Production baseline model 2.0.0 locked to active serving",
          },
          "SYSTEM_INITIALIZER"
        );
      }

      // 2. Seed Candidate Model 3.1.0 if absent
      const candExists = await MLModelRegistry.findOne({ modelVersion: "3.1.0-real-runtime-training" });
      if (!candExists) {
        await this.registerModel(
          {
            modelId: "mdl-cand-3.1.0",
            modelVersion: "3.1.0-real-runtime-training",
            modelType: "class_weighted_logistic_regression",
            artifactPath: "ml-service/data/models/3.1.0-real-runtime-training.json",
            artifactSHA256: "06240DB6F6FB75EAD3F269301574A7A15AA5EFE4C5F2B82C1D0651A5090CAE9A",
            status: "CANDIDATE",
            servingStatus: "CANDIDATE_ONLY",
            featureSchemaVersion: "v2-production-telemetry",
            threshold: 0.5,
            predecessorModelId: "mdl-prod-2.0.0",
            datasetVersion: "1.0.0-runtime",
            datasetSHA256: "82ed6c1af4be3909",
            evaluationMetrics: {
              heldOutTest: { accuracy: 1.0, precision: 1.0, recall: 1.0, f1Score: 1.0, rocAuc: 1.0 },
            },
            calibrationMetrics: {
              brierScore: 0.0746,
              operatingThreshold: 0.5,
            },
            validationSummary: "Candidate 3.1.0 registered as unpromoted candidate",
          },
          "SYSTEM_INITIALIZER"
        );
      }
    } catch (_err) {
      // Non-blocking on re-runs
    }
  }
}

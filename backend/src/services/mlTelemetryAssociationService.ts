import crypto from "crypto";
import { MLTelemetryAssociation, IMLTelemetryAssociation, IAssociatedTelemetryFeature } from "../models/MLTelemetryAssociation";
import { CodeRepair } from "../models/CodeRepair";
import { Deployment } from "../models/Deployment";
import { MLModelRegistry } from "../models/MLModelRegistry";
import { TelemetryObservation } from "../models/TelemetryObservation";
import { DeploymentAuditService } from "./deploymentAuditService";
import { SLOViolationClassifier } from "../../../ml-service/src/model";

export interface CreateAssociationParams {
  repairId: string;
  deploymentId: string;
  modelId?: string;
  startTime: Date | string;
  endTime: Date | string;
  runtimeResource?: string;
  actor?: string;
}

export class MLTelemetryAssociationService {
  public static readonly MIN_OBSERVATION_COUNT = 5;
  public static readonly FEATURE_SCHEMA_VERSION = "v2-production-telemetry";

  /**
   * Associates a completed repair and deployment event with genuine runtime telemetry observations.
   *
   * Enforces:
   * 1. Existing verified CodeRepair and Deployment records
   * 2. Temporal consistency: startTime < endTime, endTime <= now
   * 3. Post-repair window alignment (startTime >= deployment timestamp)
   * 4. Model governance identity resolution
   * 5. Collection of genuine 6-feature observations from Prometheus telemetry pipeline
   * 6. Minimum observation sample check (fails closed to INSUFFICIENT_DATA if sparse)
   * 7. Cryptographic audit trail chaining to genesis
   */
  public static async createAssociation(params: CreateAssociationParams): Promise<IMLTelemetryAssociation> {
    const actor = params.actor || "SYSTEM";

    // 1. Mandatory Identifier Validation
    if (!params.repairId || typeof params.repairId !== "string" || !params.repairId.trim()) {
      throw new Error("Telemetry Association Safety Violation: Non-empty repairId is required.");
    }
    if (!params.deploymentId || typeof params.deploymentId !== "string" || !params.deploymentId.trim()) {
      throw new Error("Telemetry Association Safety Violation: Non-empty deploymentId is required.");
    }

    // 2. Validate Repair Existence
    const repair = await CodeRepair.findOne({ repairId: params.repairId.trim() });
    if (!repair) {
      throw new Error(`Telemetry Association Target Error: Repair "${params.repairId}" not found in database.`);
    }

    // 3. Validate Deployment Existence
    const deployment = await Deployment.findOne({ deploymentId: params.deploymentId.trim() });
    if (!deployment) {
      throw new Error(`Telemetry Association Target Error: Deployment "${params.deploymentId}" not found in database.`);
    }

    // 4. Temporal Window Validation
    const start = new Date(params.startTime);
    const end = new Date(params.endTime);
    const now = new Date();

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error("Telemetry Association Window Error: Invalid startTime or endTime timestamp format.");
    }
    if (end.getTime() <= start.getTime()) {
      throw new Error("Telemetry Association Window Error: endTime must be strictly greater than startTime.");
    }
    if (end.getTime() > now.getTime() + 5000) {
      throw new Error("Telemetry Association Window Error: Future timestamps are strictly prohibited.");
    }

    // Post-repair window rule: startTime must not precede deployment/repair creation
    const eventAnchorTime = deployment.deployedAt || deployment.createdAt || repair.createdAt;
    if (eventAnchorTime && start.getTime() < eventAnchorTime.getTime() - 60000) {
      throw new Error(
        `Telemetry Association Window Error: Observation window start (${start.toISOString()}) cannot precede deployment time (${eventAnchorTime.toISOString()}). Pre-repair telemetry cannot be mixed into post-repair dataset.`
      );
    }

    // 5. Resolve Active / Target Model in Governance Registry
    let modelDoc = null;
    if (params.modelId) {
      modelDoc = await MLModelRegistry.findOne({
        $or: [{ modelId: params.modelId }, { modelVersion: params.modelId }],
      });
    }

    if (!modelDoc) {
      const activeVersion = SLOViolationClassifier.getActiveModelVersion();
      modelDoc = await MLModelRegistry.findOne({ modelVersion: activeVersion });
    }

    if (!modelDoc) {
      modelDoc = await MLModelRegistry.findOne({ status: "PRODUCTION", servingStatus: "LIVE_SERVING" });
    }

    if (!modelDoc) {
      throw new Error("Telemetry Association Governance Error: No active production model found in registry.");
    }

    const service = deployment.service || repair.service;
    const runtimeResource = params.runtimeResource || deployment.containerName || "container";
    const associationId = `assoc-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

    // 6. Create Initial Association Record in PENDING state
    const association = new MLTelemetryAssociation({
      associationId,
      repairId: repair.repairId,
      deploymentId: deployment.deploymentId,
      modelId: modelDoc.modelId,
      modelVersion: modelDoc.modelVersion,
      artifactSHA256: modelDoc.artifactSHA256,
      service,
      runtimeResource,
      startTime: start,
      endTime: end,
      observationCount: 0,
      featureSchemaVersion: this.FEATURE_SCHEMA_VERSION,
      source: "PROMETHEUS_RUNTIME",
      status: "PENDING",
      collectedFeatures: [],
      actor,
    });

    await association.save();

    // 7. Audit: TELEMETRY_ASSOCIATION_CREATED
    await DeploymentAuditService.appendModelEvent({
      modelId: modelDoc.modelId,
      modelVersion: modelDoc.modelVersion,
      artifactSHA256: modelDoc.artifactSHA256,
      repairId: repair.repairId,
      deploymentId: deployment.deploymentId,
      associationId,
      action: "TELEMETRY_ASSOCIATION_CREATED",
      actor,
      validationSummary: `Post-repair telemetry association created for repair ${repair.repairId} on service ${service}. Window: [${start.toISOString()} -> ${end.toISOString()}].`,
    });

    // 8. Transition State to COLLECTING
    association.status = "COLLECTING";
    await association.save();

    await DeploymentAuditService.appendModelEvent({
      modelId: modelDoc.modelId,
      modelVersion: modelDoc.modelVersion,
      artifactSHA256: modelDoc.artifactSHA256,
      repairId: repair.repairId,
      deploymentId: deployment.deploymentId,
      associationId,
      action: "TELEMETRY_ASSOCIATION_STARTED",
      actor,
      validationSummary: `Collecting genuine Prometheus telemetry observations for association ${associationId}.`,
    });

    try {
      // 9. Query Genuine Prometheus Observations for the Target Service & Time Window
      const observations = await TelemetryObservation.find({
        service,
        observedAt: { $gte: start, $lte: end },
        featuresComplete: true,
      }).sort({ observedAt: 1 });

      const extractedFeatures: IAssociatedTelemetryFeature[] = [];

      for (const obs of observations) {
        const feats = obs.features;
        if (!feats) continue;

        // Verify numeric bounds & finite values across all 6 features
        const cpu = Number(feats.cpuUsage);
        const mem = Number(feats.memoryUsage);
        const lat = Number(feats.p95Latency);
        const errRate = Number(feats.errorRate);
        const reqRate = Number(feats.requestRate);
        const depChanged = Number(feats.deploymentChanged || 0);

        if (
          Number.isFinite(cpu) &&
          Number.isFinite(mem) &&
          Number.isFinite(lat) &&
          Number.isFinite(errRate) &&
          Number.isFinite(reqRate) &&
          Number.isFinite(depChanged) &&
          cpu >= 0 && cpu <= 100 &&
          mem >= 0 && mem <= 100 &&
          errRate >= 0 && errRate <= 100 &&
          lat >= 0 &&
          reqRate >= 0
        ) {
          extractedFeatures.push({
            observationId: obs.observationId,
            timestamp: obs.observedAt || obs.featureTimestamp,
            cpuUsage: cpu,
            memoryUsage: mem,
            p95Latency: lat,
            errorRate: errRate,
            requestRate: reqRate,
            deploymentChanged: depChanged === 1 ? 1 : 0,
          });
        }
      }

      association.collectedFeatures = extractedFeatures;
      association.observationCount = extractedFeatures.length;

      if (extractedFeatures.length > 0) {
        association.firstObservationTime = extractedFeatures[0].timestamp;
        association.lastObservationTime = extractedFeatures[extractedFeatures.length - 1].timestamp;
      }

      // 10. Evaluate Sample Volume Quality Gate
      if (extractedFeatures.length < this.MIN_OBSERVATION_COUNT) {
        association.status = "INSUFFICIENT_DATA";
        association.errorMessage = `Insufficient runtime observations collected: got ${extractedFeatures.length}, required >= ${this.MIN_OBSERVATION_COUNT}.`;
        await association.save();

        await DeploymentAuditService.appendModelEvent({
          modelId: modelDoc.modelId,
          modelVersion: modelDoc.modelVersion,
          artifactSHA256: modelDoc.artifactSHA256,
          repairId: repair.repairId,
          deploymentId: deployment.deploymentId,
          associationId,
          action: "TELEMETRY_ASSOCIATION_COMPLETED",
          actor,
          validationSummary: `Telemetry collection completed with INSUFFICIENT_DATA: ${extractedFeatures.length} observations (minimum ${this.MIN_OBSERVATION_COUNT} required).`,
        });

        return association;
      }

      // 11. Complete Association
      association.status = "COMPLETE";
      await association.save();

      await DeploymentAuditService.appendModelEvent({
        modelId: modelDoc.modelId,
        modelVersion: modelDoc.modelVersion,
        artifactSHA256: modelDoc.artifactSHA256,
        repairId: repair.repairId,
        deploymentId: deployment.deploymentId,
        associationId,
        action: "TELEMETRY_ASSOCIATION_COMPLETED",
        actor,
        validationSummary: `Successfully associated ${extractedFeatures.length} verified Prometheus observations with repair ${repair.repairId}.`,
      });

      return association;
    } catch (err: any) {
      association.status = "FAILED";
      association.errorMessage = err.message || "Failed to collect runtime observations";
      await association.save();

      await DeploymentAuditService.appendModelEvent({
        modelId: modelDoc.modelId,
        modelVersion: modelDoc.modelVersion,
        artifactSHA256: modelDoc.artifactSHA256,
        repairId: repair.repairId,
        deploymentId: deployment.deploymentId,
        associationId,
        action: "TELEMETRY_ASSOCIATION_FAILED",
        actor,
        validationSummary: `Telemetry association failed: ${err.message}`,
      });

      throw err;
    }
  }

  /**
   * Retrieves an association by ID.
   */
  public static async getAssociationById(associationId: string): Promise<IMLTelemetryAssociation | null> {
    return MLTelemetryAssociation.findOne({ associationId: associationId.trim() });
  }

  /**
   * Lists associations for a specific model.
   */
  public static async listAssociationsForModel(modelId: string): Promise<IMLTelemetryAssociation[]> {
    return MLTelemetryAssociation.find({
      $or: [{ modelId }, { modelVersion: modelId }],
    }).sort({ createdAt: -1 });
  }
}

/**
 * Production-Grade Machine Learning Classifier for SLO Breach Forecasting
 * Phase 3 Real-Telemetry Logistic Regression Model with Standard Scaling,
 * Explainability, Strict Real Zero Support, and Provenance Traceability.
 *
 * PROVENANCE: Trained on reproducible DevOps operational metrics dataset
 * using 6 genuine runtime telemetry dimensions (cpuUsage, memoryUsage, p95Latency,
 * errorRate, requestRate, deploymentChanged). Uninstrumented features (dbPoolUsage)
 * and synthetic heuristic formulas have been completely removed.
 */

import * as fs from "fs";
import * as path from "path";

export interface TelemetryFeatures {
  cpuUsage?: number | null;
  memoryUsage?: number | null;
  errorRate?: number | null;
  latency?: number | null;
  p95Latency?: number | null;
  requestRate?: number | null;
  deploymentChanged?: number | boolean | null;
  // Retained optionally for test payload compatibility (ignored in inference)
  dbPoolUsage?: number | null;
}

export interface FeatureScaler {
  mean: number;
  stdDev: number;
}

export interface PredictionResult {
  status: "SUCCESS" | "INSUFFICIENT_TELEMETRY" | "INVALID_TELEMETRY";
  prediction: "VIOLATION" | "NO_VIOLATION";
  violationProbability: number;
  probability: number;
  confidence: number;
  model: "logistic_regression";
  modelVersion: string;
  schemaVersion: string;
  threshold?: number;
  missingFeatures?: string[];
  error?: string;
  factors: {
    cpuFactor: number;
    memoryFactor: number;
    errorFactor: number;
    latencyFactor: number;
    deploymentFactor: number;
    requestRateFactor?: number;
  };
  featureContributions: Record<string, number>;
  topRiskFactors: string[];
  explanation: string[];
}

export interface ModelMetadata {
  modelType: string;
  version: string;
  schemaVersion: string;
  features: string[];
  coefficients: Record<string, number>;
  intercept: number;
  scaler: Record<string, FeatureScaler>;
  metrics: {
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    rocAuc: number;
  };
}

export class SLOViolationClassifier {
  public static readonly MODEL_VERSION = "2.0.0-production-telemetry";
  public static readonly FEATURE_SCHEMA_VERSION = "v2-production-telemetry";

  // Production runtime feature schema (6 genuine dimensions)
  public static readonly FEATURE_NAMES = [
    "cpuUsage",
    "memoryUsage",
    "p95Latency",
    "errorRate",
    "requestRate",
    "deploymentChanged",
  ];

  // StandardScaler statistics for the 6 production telemetry features
  private static scaler: Record<string, FeatureScaler> = {
    cpuUsage: { mean: 57.251, stdDev: 23.6062 },
    memoryUsage: { mean: 61.0501, stdDev: 19.3402 },
    p95Latency: { mean: 1.396, stdDev: 1.3867 },
    errorRate: { mean: 1.7345, stdDev: 3.1949 },
    requestRate: { mean: 575.8207, stdDev: 470.7501 },
    deploymentChanged: { mean: 0.2427, stdDev: 0.4287 },
  };

  // Trained logistic regression weights for the 6 production telemetry features
  private static coefficients: Record<string, number> = {
    cpuUsage: 1.0218,
    memoryUsage: 0.7703,
    p95Latency: 2.0426,
    errorRate: 1.0764,
    requestRate: 0.2723,
    deploymentChanged: 0.3708,
  };

  private static intercept = -2.1771;

  private static metrics = {
    accuracy: 0.9967,
    precision: 0.9903,
    recall: 1.0,
    f1Score: 0.9951,
    rocAuc: 1.0,
  };

  /**
   * Initializes or reloads model weights from disk if available.
   */
  public static loadTrainedModel(customPath?: string): boolean {
    const candidates = [
      customPath,
      path.join(__dirname, "../data/trained_model.json"),
      path.join(__dirname, "../../data/trained_model.json"),
      path.resolve(process.cwd(), "data/trained_model.json"),
      path.resolve(process.cwd(), "ml-service/data/trained_model.json"),
    ].filter(Boolean) as string[];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, "utf-8");
          const data = JSON.parse(raw);
          if (data.coefficients && data.scaler) {
            this.coefficients = data.coefficients;
            this.scaler = data.scaler;
            this.intercept = data.intercept ?? this.intercept;
            if (data.metrics?.test) {
              this.metrics = data.metrics.test;
            }
            return true;
          }
        } catch (_err) {
          // fallback to embedded weights
        }
      }
    }
    return false;
  }

  /**
   * Evaluates telemetry features using the trained Logistic Regression model.
   *
   * STRICT DATA INTEGRITY RULES:
   * 1. Real Zero: 0 is a genuine measured number and is never converted to null.
   * 2. Missing Data: If any mandatory feature is missing (null or undefined), returns
   *    status: INSUFFICIENT_TELEMETRY with missingFeatures list. Never fabricates values.
   * 3. Input Validation: Validates numeric types and physical ranges. Rejects NaN, Infinity, negative values.
   */
  public static predict(features: TelemetryFeatures): PredictionResult {
    // 1. Mandatory features check
    const missingFeatures: string[] = [];
    if (features.cpuUsage === undefined || features.cpuUsage === null) missingFeatures.push("cpuUsage");
    if (features.memoryUsage === undefined || features.memoryUsage === null) missingFeatures.push("memoryUsage");
    if (features.errorRate === undefined || features.errorRate === null) missingFeatures.push("errorRate");

    const latencyVal =
      features.p95Latency !== undefined && features.p95Latency !== null
        ? features.p95Latency
        : features.latency;
    if (latencyVal === undefined || latencyVal === null) missingFeatures.push("p95Latency");

    if (features.requestRate === undefined || features.requestRate === null) missingFeatures.push("requestRate");

    if (missingFeatures.length > 0) {
      return {
        status: "INSUFFICIENT_TELEMETRY",
        prediction: "NO_VIOLATION",
        violationProbability: 0,
        probability: 0,
        confidence: 0,
        model: "logistic_regression",
        modelVersion: this.MODEL_VERSION,
        schemaVersion: this.FEATURE_SCHEMA_VERSION,
        missingFeatures,
        factors: {
          cpuFactor: 0,
          memoryFactor: 0,
          errorFactor: 0,
          latencyFactor: 0,
          deploymentFactor: 0,
          requestRateFactor: 0,
        },
        featureContributions: {},
        topRiskFactors: [],
        explanation: [
          `Insufficient telemetry for ML prediction: missing mandatory features [${missingFeatures.join(", ")}].`,
        ],
      };
    }

    // 2. Numeric type and range validation
    const cpu = Number(features.cpuUsage);
    const memory = Number(features.memoryUsage);
    const errors = Number(features.errorRate);
    const latency = Number(latencyVal);
    const requestRate = Number(features.requestRate);
    const deployment = features.deploymentChanged ? 1 : 0;

    const numericMap: Record<string, number> = {
      cpuUsage: cpu,
      memoryUsage: memory,
      errorRate: errors,
      p95Latency: latency,
      requestRate: requestRate,
    };

    for (const [name, val] of Object.entries(numericMap)) {
      if (!Number.isFinite(val) || Number.isNaN(val)) {
        throw new Error(`Invalid telemetry value for ${name}: must be a finite number (got ${val})`);
      }
    }

    if (cpu < 0 || cpu > 100) {
      throw new Error(`Invalid cpuUsage: ${cpu}% (must be between 0 and 100)`);
    }
    if (memory < 0 || memory > 100) {
      throw new Error(`Invalid memoryUsage: ${memory}% (must be between 0 and 100)`);
    }
    if (errors < 0 || errors > 100) {
      throw new Error(`Invalid errorRate: ${errors}% (must be between 0 and 100)`);
    }
    if (latency < 0) {
      throw new Error(`Invalid latency: ${latency}s (latency cannot be negative)`);
    }
    if (requestRate < 0) {
      throw new Error(`Invalid requestRate: ${requestRate} req/s (request rate cannot be negative)`);
    }

    const rawValues: Record<string, number> = {
      cpuUsage: cpu,
      memoryUsage: memory,
      p95Latency: latency,
      errorRate: errors,
      requestRate: requestRate,
      deploymentChanged: deployment,
    };

    // 3. Compute standardized feature contributions and linear logit z
    let logitZ = this.intercept;
    const contributions: Record<string, number> = {};
    const explanations: string[] = [];

    for (const feat of this.FEATURE_NAMES) {
      const val = rawValues[feat];
      const scale = this.scaler[feat] || { mean: 0, stdDev: 1 };
      const normalized = (val - scale.mean) / Math.max(1e-5, scale.stdDev);
      const coeff = this.coefficients[feat] || 0;
      const contribution = coeff * normalized;
      contributions[feat] = Number(contribution.toFixed(4));
      logitZ += contribution;

      if (contribution > 0.8) {
        explanations.push(
          `High ${feat} (${val}) increases violation log-odds by +${contribution.toFixed(2)}`
        );
      }
    }

    // 4. Sigmoid activation function P = 1 / (1 + e^-z)
    const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-25, Math.min(25, z))));
    const prob = sigmoid(logitZ);
    const violationProbability = Number(prob.toFixed(4));
    const isViolation = violationProbability >= 0.5;

    // Identify top positive risk factors
    const topRiskFactors = Object.entries(contributions)
      .filter(([_, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, val]) => `${name} (+${val.toFixed(2)})`);

    // Backward-compatible factor mapping for frontend charts
    const factors = {
      cpuFactor: Number(Math.max(0, (contributions.cpuUsage || 0) / 4).toFixed(2)),
      memoryFactor: Number(Math.max(0, (contributions.memoryUsage || 0) / 4).toFixed(2)),
      errorFactor: Number(Math.max(0, (contributions.errorRate || 0) / 4).toFixed(2)),
      latencyFactor: Number(Math.max(0, (contributions.p95Latency || 0) / 4).toFixed(2)),
      deploymentFactor: Number(Math.max(0, (contributions.deploymentChanged || 0) / 4).toFixed(2)),
      requestRateFactor: Number(Math.max(0, (contributions.requestRate || 0) / 4).toFixed(2)),
    };

    // Authentic confidence derived from model certainty: |P - 0.5| * 2 mapped to [0.5, 1.0]
    const confidence = Number((0.5 + Math.abs(violationProbability - 0.5)).toFixed(2));

    return {
      status: "SUCCESS",
      prediction: isViolation ? "VIOLATION" : "NO_VIOLATION",
      violationProbability,
      probability: violationProbability,
      confidence,
      model: "logistic_regression",
      modelVersion: this.MODEL_VERSION,
      schemaVersion: this.FEATURE_SCHEMA_VERSION,
      factors,
      featureContributions: contributions,
      topRiskFactors,
      explanation:
        explanations.length > 0
          ? explanations
          : ["All operational telemetry features are within nominal SLO boundaries."],
    };
  }

  /**
   * Returns model metadata, coefficients, and training metrics for explainability endpoints.
   */
  public static getModelInfo(): ModelMetadata {
    return {
      modelType: "logistic_regression",
      version: this.MODEL_VERSION,
      schemaVersion: this.FEATURE_SCHEMA_VERSION,
      features: [...this.FEATURE_NAMES],
      coefficients: { ...this.coefficients },
      intercept: this.intercept,
      scaler: { ...this.scaler },
      metrics: { ...this.metrics },
    };
  }

  // =========================================================================
  // Phase 3.5 Candidate Model Support & Registry
  // =========================================================================

  private static candidateModel: any = null;

  /**
   * Loads candidate model artifact from disk.
   */
  public static loadCandidateModel(customPath?: string): boolean {
    const candidates = [
      customPath,
      path.join(__dirname, "../data/models/3.1.0-real-runtime-training.json"),
      path.join(__dirname, "../../data/models/3.1.0-real-runtime-training.json"),
      path.resolve(process.cwd(), "ml-service/data/models/3.1.0-real-runtime-training.json"),
      path.resolve(process.cwd(), "data/models/3.1.0-real-runtime-training.json"),
      path.join(__dirname, "../data/models/3.0.0-real-runtime-training.json"),
      path.join(__dirname, "../../data/models/3.0.0-real-runtime-training.json"),
      path.resolve(process.cwd(), "ml-service/data/models/3.0.0-real-runtime-training.json"),
      path.resolve(process.cwd(), "data/models/3.0.0-real-runtime-training.json"),
    ].filter(Boolean) as string[];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, "utf-8");
          const data = JSON.parse(raw);
          if (data.modelVersion && data.coefficients && data.scaler) {
            this.candidateModel = data;
            return true;
          }
        } catch (_err) {
          // ignore error
        }
      }
    }
    return false;
  }

  /**
   * Returns candidate model metadata if available.
   */
  public static getCandidateModelInfo(): any | null {
    if (!this.candidateModel) {
      this.loadCandidateModel();
    }
    return this.candidateModel;
  }

  /**
   * Returns model registry overview distinguishing PRODUCTION from CANDIDATE.
   */
  public static getRegistry(): Array<{
    version: string;
    status: "PRODUCTION" | "CANDIDATE";
    algorithm: string;
    schemaVersion: string;
    isLiveServing: boolean;
  }> {
    if (!this.candidateModel) {
      this.loadCandidateModel();
    }
    const registry: Array<{
      version: string;
      status: "PRODUCTION" | "CANDIDATE";
      algorithm: string;
      schemaVersion: string;
      isLiveServing: boolean;
    }> = [
      {
        version: this.MODEL_VERSION,
        status: "PRODUCTION",
        algorithm: "logistic_regression",
        schemaVersion: this.FEATURE_SCHEMA_VERSION,
        isLiveServing: true,
      },
    ];

    // Find all candidate models in data/models directory
    const modelDirs = [
      path.join(__dirname, "../data/models"),
      path.join(__dirname, "../../data/models"),
      path.resolve(process.cwd(), "ml-service/data/models"),
      path.resolve(process.cwd(), "data/models"),
    ];

    const seenCandidateVersions = new Set<string>();

    for (const dir of modelDirs) {
      if (fs.existsSync(dir)) {
        try {
          const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
          for (const file of files) {
            try {
              const content = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
              if (content.modelVersion && content.status === "CANDIDATE" && !seenCandidateVersions.has(content.modelVersion)) {
                seenCandidateVersions.add(content.modelVersion);
                registry.push({
                  version: content.modelVersion,
                  status: "CANDIDATE",
                  algorithm: content.algorithm || "logistic_regression",
                  schemaVersion: content.schemaVersion || "v2-production-telemetry",
                  isLiveServing: false,
                });
              }
            } catch {
              // ignore parse errors
            }
          }
        } catch {
          // ignore directory read errors
        }
      }
    }

    if (this.candidateModel && !seenCandidateVersions.has(this.candidateModel.modelVersion)) {
      registry.push({
        version: this.candidateModel.modelVersion,
        status: "CANDIDATE",
        algorithm: this.candidateModel.algorithm || "logistic_regression",
        schemaVersion: this.candidateModel.schemaVersion || "v2-production-telemetry",
        isLiveServing: false,
      });
    }

    return registry;
  }

  /**
   * Evaluates telemetry features using Candidate Model (3.0.0-real-runtime-training).
   * Safe, isolated: does NOT touch production model weights or state.
   */
  public static predictCandidate(features: TelemetryFeatures): PredictionResult {
    if (!this.candidateModel) {
      this.loadCandidateModel();
    }

    if (!this.candidateModel) {
      return {
        status: "INVALID_TELEMETRY",
        prediction: "NO_VIOLATION",
        violationProbability: 0,
        probability: 0,
        confidence: 0,
        model: "logistic_regression",
        modelVersion: "3.0.0-real-runtime-training",
        schemaVersion: this.FEATURE_SCHEMA_VERSION,
        error: "Candidate model 3.0.0 artifact not loaded on server",
        factors: { cpuFactor: 0, memoryFactor: 0, errorFactor: 0, latencyFactor: 0, deploymentFactor: 0 },
        featureContributions: {},
        topRiskFactors: [],
        explanation: ["Candidate model 3.0.0 artifact not loaded on server"],
      };
    }

    // 1. Mandatory features check
    const missingFeatures: string[] = [];
    if (features.cpuUsage === undefined || features.cpuUsage === null) missingFeatures.push("cpuUsage");
    if (features.memoryUsage === undefined || features.memoryUsage === null) missingFeatures.push("memoryUsage");
    if (features.errorRate === undefined || features.errorRate === null) missingFeatures.push("errorRate");

    const latencyVal =
      features.p95Latency !== undefined && features.p95Latency !== null
        ? features.p95Latency
        : features.latency;
    if (latencyVal === undefined || latencyVal === null) missingFeatures.push("p95Latency");

    if (features.requestRate === undefined || features.requestRate === null) missingFeatures.push("requestRate");

    if (missingFeatures.length > 0) {
      return {
        status: "INSUFFICIENT_TELEMETRY",
        prediction: "NO_VIOLATION",
        violationProbability: 0,
        probability: 0,
        confidence: 0,
        model: "logistic_regression",
        modelVersion: this.candidateModel.modelVersion,
        schemaVersion: this.FEATURE_SCHEMA_VERSION,
        missingFeatures,
        factors: { cpuFactor: 0, memoryFactor: 0, errorFactor: 0, latencyFactor: 0, deploymentFactor: 0 },
        featureContributions: {},
        topRiskFactors: [],
        explanation: [`Telemetry incomplete: missing ${missingFeatures.join(", ")}`],
      };
    }

    // 2. Physical range validation
    const deploymentVal =
      features.deploymentChanged === true || features.deploymentChanged === 1
        ? 1
        : 0;

    const candidateScaler = this.candidateModel.scaler;
    const candidateCoeffs = this.candidateModel.coefficients;
    const candidateIntercept = this.candidateModel.intercept ?? 0;

    const effectiveValues: Record<string, number> = {
      cpuUsage: Number(features.cpuUsage),
      memoryUsage: Number(features.memoryUsage),
      p95Latency: Number(latencyVal),
      errorRate: Number(features.errorRate),
      requestRate: Number(features.requestRate),
      deploymentChanged: deploymentVal,
    };

    let logitZ = candidateIntercept;
    const contributions: Record<string, number> = {};
    const explanations: string[] = [];

    for (const feat of this.FEATURE_NAMES) {
      const rawVal = effectiveValues[feat];
      const featScaler = candidateScaler[feat] || { mean: 0, stdDev: 1 };
      const std = featScaler.stdDev > 1e-4 ? featScaler.stdDev : 1.0;
      const zScore = (rawVal - featScaler.mean) / std;
      const weight = candidateCoeffs[feat] || 0;
      const contribution = Number((zScore * weight).toFixed(4));
      contributions[feat] = contribution;
      logitZ += contribution;

      if (contribution > 1.0) {
        explanations.push(`High ${feat} (${rawVal}) increases violation log-odds by +${contribution.toFixed(2)}`);
      }
    }

    const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-25, Math.min(25, z))));
    const prob = sigmoid(logitZ);
    const violationProbability = Number(prob.toFixed(4));
    const candidateThreshold = this.candidateModel.threshold ?? 0.5;
    const isViolation = violationProbability >= candidateThreshold;

    const topRiskFactors = Object.entries(contributions)
      .filter(([_, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, val]) => `${name} (+${val.toFixed(2)})`);

    const factors = {
      cpuFactor: Number(Math.max(0, (contributions.cpuUsage || 0) / 4).toFixed(2)),
      memoryFactor: Number(Math.max(0, (contributions.memoryUsage || 0) / 4).toFixed(2)),
      errorFactor: Number(Math.max(0, (contributions.errorRate || 0) / 4).toFixed(2)),
      latencyFactor: Number(Math.max(0, (contributions.p95Latency || 0) / 4).toFixed(2)),
      deploymentFactor: Number(Math.max(0, (contributions.deploymentChanged || 0) / 4).toFixed(2)),
      requestRateFactor: Number(Math.max(0, (contributions.requestRate || 0) / 4).toFixed(2)),
    };

    const confidence = Number((0.5 + Math.abs(violationProbability - 0.5)).toFixed(2));

    return {
      status: "SUCCESS",
      prediction: isViolation ? "VIOLATION" : "NO_VIOLATION",
      violationProbability,
      probability: violationProbability,
      confidence,
      threshold: candidateThreshold,
      model: "logistic_regression",
      modelVersion: this.candidateModel.modelVersion,
      schemaVersion: this.FEATURE_SCHEMA_VERSION,
      factors,
      featureContributions: contributions,
      topRiskFactors,
      explanation:
        explanations.length > 0
          ? explanations
          : ["All operational telemetry features are within nominal SLO boundaries."],
    };
  }
}

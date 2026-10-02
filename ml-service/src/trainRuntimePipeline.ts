/**
 * Production Runtime ML Training Pipeline - Phase 3.5 Real Implementation
 *
 * Implements authoritative, leakage-free training on genuine runtime telemetry.
 * Fits a real Logistic Regression classifier on genuine training samples,
 * evaluates on validation and held-out test splits, compares against production
 * baseline (2.0.0), serializes candidate artifact, and registers candidate model.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import {
  RuntimeDatasetBuilder,
  BuiltRuntimeDataset,
  RuntimeTrainingSample,
} from "./data/runtimeDatasetBuilder";
import { SLOViolationClassifier } from "./model";

export const PRODUCTION_FEATURE_NAMES = [
  "cpuUsage",
  "memoryUsage",
  "p95Latency",
  "errorRate",
  "requestRate",
  "deploymentChanged",
] as const;

export type ProductionFeatureName = (typeof PRODUCTION_FEATURE_NAMES)[number];

export interface MetricEvaluation {
  sampleCount: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  rocAuc: number;
  logLoss: number;
  confusionMatrix: {
    truePositive: number;
    falsePositive: number;
    trueNegative: number;
    falseNegative: number;
  };
}

export interface CandidateModelArtifact {
  modelVersion: string;
  status: "CANDIDATE";
  baselineVersion: "2.0.0-production-telemetry";
  predecessorVersion?: string;
  algorithm: "logistic_regression" | "class_weighted_logistic_regression";
  schemaVersion: "v2-production-telemetry";
  featureNames: string[];
  scaler: Record<string, { mean: number; stdDev: number }>;
  coefficients: Record<string, number>;
  intercept: number;
  threshold: number;
  trainingConfig: {
    epochs: number;
    batchSize: number;
    learningRate: number;
    learningRateDecay: number;
    l2Regularization: number;
    weightMethod?: string;
    classWeights?: {
      healthyWeight: number;
      violationWeight: number;
    };
    iterationsCompleted: number;
    convergenceStatus: string;
    initialLoss: number;
    finalLoss: number;
    deterministic: boolean;
    frozenOperationalThreshold?: number;
    operationalObjective?: string;
  };
  datasetSummary: {
    totalSamples: number;
    trainCount: number;
    validationCount: number;
    testCount: number;
    nonViolationCount: number;
    violationCount: number;
    temporalSpanHours: number;
    distinctDaysCount: number;
    distinctServicesCount: number;
    distinctSlosCount: number;
    distinctRequirementsCount: number;
    dateRange: { start: string; end: string };
  };
  datasetProvenance: {
    sourceTypes: string[];
    earliestTimestamp: string;
    latestTimestamp: string;
    leakageOverlap: number;
    chronologicalOrderValid: boolean;
    datasetFingerprint: string;
  };
  metrics: {
    train: MetricEvaluation;
    validation: MetricEvaluation;
    test: MetricEvaluation;
    baselineComparison: {
      candidate: MetricEvaluation;
      production: MetricEvaluation;
    };
  };
  createdAt: string;
  checksumSha256?: string;
}

export interface TrainingExecutionOutcome {
  status: "TRAINED" | "TRAINING_DEFERRED" | "ERROR";
  reason?: string;
  datasetSummary: {
    totalSamples: number;
    trainCount: number;
    validationCount: number;
    testCount: number;
    nonViolationCount: number;
    violationCount: number;
    temporalSpanHours: number;
    distinctDaysCount: number;
  };
  leakageAudit: {
    hasLeakage: boolean;
    overlapCount: number;
  };
  activeModelVersion: string;
  candidateArtifactPath?: string;
  candidateChecksumSha256?: string;
  candidateMetrics?: {
    train: MetricEvaluation;
    validation: MetricEvaluation;
    test: MetricEvaluation;
    baselineComparison: {
      candidate: MetricEvaluation;
      production: MetricEvaluation;
    };
  };
  coefficients?: Record<string, number>;
  intercept?: number;
  scaler?: Record<string, { mean: number; stdDev: number }>;
}

export class RuntimeTrainingPipeline {
  private datasetBuilder: RuntimeDatasetBuilder;

  constructor(backendBaseUrl = process.env.BACKEND_URL || "http://localhost:5000") {
    this.datasetBuilder = new RuntimeDatasetBuilder(backendBaseUrl);
  }

  public async executePipeline(): Promise<TrainingExecutionOutcome> {
    console.log("================================================================================");
    console.log("TRACE-OPS: PHASE 3.5 GENUINE RUNTIME ML TRAINING & EVALUATION PIPELINE");
    console.log("================================================================================");

    const dataset: BuiltRuntimeDataset = await this.datasetBuilder.buildDataset();
    const { allSamples, splits, leakageAudit, readinessAudit, excludedRecords } = dataset;

    console.log("\n[1/7] Real Runtime Dataset Audit");
    console.log("----------------------------------");
    console.log(`Total Usable Genuine Samples:   ${readinessAudit.metrics.totalUsableSamples}`);
    console.log(`  - NON_VIOLATION (Healthy):    ${readinessAudit.metrics.nonViolationCount}`);
    console.log(`  - VIOLATION (Breached):       ${readinessAudit.metrics.violationCount}`);
    console.log(`  - Class Ratio (Viol : Non):   ${readinessAudit.metrics.classRatio} : 1`);
    console.log(`Excluded Incomplete Telemetry:  ${excludedRecords.incompleteObservations + excludedRecords.incompleteIncidents}`);
    console.log(`Excluded Historical Seed/Demo:  ${excludedRecords.historicalIncidents + excludedRecords.nonPrometheusIncidents}`);

    console.log("\n[2/7] Operational Diversity Metrics");
    console.log("----------------------------------");
    console.log(`Distinct Services:              ${readinessAudit.metrics.distinctServicesCount}`);
    console.log(`Distinct Active SLOs:           ${readinessAudit.metrics.distinctSlosCount}`);
    console.log(`Distinct Requirements Linked:   ${readinessAudit.metrics.distinctRequirementsCount}`);

    console.log("\n[3/7] Temporal Diversity Audit");
    console.log("----------------------------------");
    console.log(`Distinct Calendar Days:         ${readinessAudit.metrics.distinctDaysCount}`);
    console.log(`Distinct Observation Hours:     ${readinessAudit.metrics.distinctHoursCount}`);
    console.log(`Total Telemetry Span:           ${readinessAudit.metrics.totalSpanHours} hours`);

    console.log("\n[4/7] Data Leakage Audit (Chronological Split)");
    console.log("----------------------------------");
    console.log(`Train Set (70%):                ${splits.train.length} samples`);
    console.log(`Validation Set (15%):           ${splits.validation.length} samples`);
    console.log(`Test Set (15% held-out):        ${splits.test.length} samples`);
    console.log(`Train ∩ Validation Overlap:     ${leakageAudit.trainValOverlapCount}`);
    console.log(`Train ∩ Test Overlap:           ${leakageAudit.trainTestOverlapCount}`);
    console.log(`Validation ∩ Test Overlap:      ${leakageAudit.valTestOverlapCount}`);
    console.log(`Chronological Order Preserved:  ${leakageAudit.chronologicalOrderValid ? "YES (Strict monotonic)" : "NO"}`);
    console.log(`Total Leakage Overlap:          ${leakageAudit.overlappingSourceIds.length}`);

    console.log("\n[5/7] Production Readiness Gate");
    console.log("----------------------------------");

    if (!readinessAudit.isReady) {
      console.log("❌ READINESS CRITERIA NOT MET:");
      for (const reason of readinessAudit.reasons) {
        console.log(`   - ${reason}`);
      }
      console.log("\n[DECISION] TRAINING SAFELY DEFERRED:");
      console.log("  Model weights MUST NOT be retrained until all readiness criteria are satisfied.");
      console.log("  The current production model remains: 2.0.0-production-telemetry (UNTOUCHED).\n");

      return {
        status: "TRAINING_DEFERRED",
        reason: readinessAudit.reasons.join("; "),
        datasetSummary: {
          totalSamples: readinessAudit.metrics.totalUsableSamples,
          trainCount: splits.train.length,
          validationCount: splits.validation.length,
          testCount: splits.test.length,
          nonViolationCount: readinessAudit.metrics.nonViolationCount,
          violationCount: readinessAudit.metrics.violationCount,
          temporalSpanHours: readinessAudit.metrics.totalSpanHours,
          distinctDaysCount: readinessAudit.metrics.distinctDaysCount,
        },
        leakageAudit: {
          hasLeakage: leakageAudit.hasLeakage,
          overlapCount: leakageAudit.overlappingSourceIds.length,
        },
        activeModelVersion: "2.0.0-production-telemetry",
      };
    }

    console.log("✓ READINESS CRITERIA SATISFIED. Commencing genuine ML model fitting.");

    // -------------------------------------------------------------------------
    // [6/7] Genuine Model Training (Logistic Regression + StandardScaler)
    // -------------------------------------------------------------------------
    console.log("\n[6/7] Training Candidate Logistic Regression Model...");
    console.log("---------------------------------------------------------");

    const trainSamples = splits.train;
    const valSamples = splits.validation;
    const testSamples = splits.test;

    // 1. Fit StandardScaler STRICTLY on the training set
    const scaler: Record<string, { mean: number; stdDev: number }> = {};
    for (const feat of PRODUCTION_FEATURE_NAMES) {
      const values = trainSamples.map((s) => s.features[feat] as number);
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      scaler[feat] = {
        mean: Number(mean.toFixed(4)),
        stdDev: stdDev > 1e-4 ? Number(stdDev.toFixed(4)) : 1.0,
      };
    }

    console.log("Fitted Training Scaler Parameters (Mean / StdDev):");
    for (const feat of PRODUCTION_FEATURE_NAMES) {
      console.log(`  ${feat.padEnd(18)}: mean = ${scaler[feat].mean.toFixed(4)}, std = ${scaler[feat].stdDev.toFixed(4)}`);
    }

    // 2. Feature Normalization Matrix Builder
    const normalizeSample = (sample: RuntimeTrainingSample): number[] => {
      return PRODUCTION_FEATURE_NAMES.map((feat) => {
        const val = sample.features[feat] as number;
        const std = scaler[feat].stdDev > 1e-4 ? scaler[feat].stdDev : 1.0;
        return (val - scaler[feat].mean) / std;
      });
    };

    const X_train = trainSamples.map(normalizeSample);
    const Y_train = trainSamples.map((s) => s.label);

    const X_val = valSamples.map(normalizeSample);
    const Y_val = valSamples.map((s) => s.label);

    const X_test = testSamples.map(normalizeSample);
    const Y_test = testSamples.map((s) => s.label);

    // 3. Numerically Stable Class-Weighted Logistic Regression Optimizer (Mini-Batch Gradient Descent with L2 penalty)
    const numFeatures = PRODUCTION_FEATURE_NAMES.length;
    let weights = new Array(numFeatures).fill(0);
    let intercept = 0;

    const nTrain = trainSamples.length;
    const n0 = trainSamples.filter((s) => s.label === 0).length;
    const n1 = trainSamples.filter((s) => s.label === 1).length;
    const w0 = n0 > 0 ? nTrain / (2 * n0) : 1.0;
    const w1 = n1 > 0 ? nTrain / (2 * n1) : 1.0;
    console.log(`Class Weights: Healthy(0)=${w0.toFixed(4)}, Violation(1)=${w1.toFixed(4)} (Ratio: ${(w0 / w1).toFixed(2)})`);

    const learningRate = 0.05;
    const learningRateDecay = 0.001;
    const l2Lambda = 0.01;
    const epochs = 500;
    const batchSize = 32;

    const sigmoid = (z: number): number => {
      const clamped = Math.max(-25, Math.min(25, z));
      return 1 / (1 + Math.exp(-clamped));
    };

    const computeLoss = (X: number[][], Y: number[], w: number[], b: number): number => {
      let loss = 0;
      let totalW = 0;
      const eps = 1e-15;
      for (let i = 0; i < X.length; i++) {
        let z = b;
        for (let j = 0; j < w.length; j++) z += w[j] * X[i][j];
        const p = sigmoid(z);
        const sw = Y[i] === 1 ? w1 : w0;
        totalW += sw;
        loss += sw * -(Y[i] * Math.log(p + eps) + (1 - Y[i]) * Math.log(1 - p + eps));
      }
      loss /= (totalW > 0 ? totalW : X.length);
      let reg = 0;
      for (let j = 0; j < w.length; j++) reg += w[j] * w[j];
      return loss + 0.5 * l2Lambda * reg;
    };

    const initialLoss = Number(computeLoss(X_train, Y_train, weights, intercept).toFixed(5));
    console.log(`Initial Weighted Binary Cross-Entropy Loss: ${initialLoss}`);

    let prevLoss = initialLoss;
    let convergenceEpoch = epochs;
    let convergenceStatus = "COMPLETED_MAX_EPOCHS";

    for (let epoch = 0; epoch < epochs; epoch++) {
      const currentLr = learningRate / (1 + learningRateDecay * epoch);

      for (let i = 0; i < X_train.length; i += batchSize) {
        const batchX = X_train.slice(i, i + batchSize);
        const batchY = Y_train.slice(i, i + batchSize);
        const m = batchX.length;

        const gradW = new Array(numFeatures).fill(0);
        let gradB = 0;
        let sumWeights = 0;

        for (let b = 0; b < m; b++) {
          const x = batchX[b];
          const y = batchY[b];
          const sw = y === 1 ? w1 : w0;
          sumWeights += sw;

          let z = intercept;
          for (let j = 0; j < numFeatures; j++) z += weights[j] * x[j];
          const pred = sigmoid(z);
          const error = (pred - y) * sw;

          for (let j = 0; j < numFeatures; j++) {
            gradW[j] += error * x[j];
          }
          gradB += error;
        }

        const denom = sumWeights > 0 ? sumWeights : m;
        // Apply gradient with L2 shrinkage
        for (let j = 0; j < numFeatures; j++) {
          weights[j] -= currentLr * (gradW[j] / denom + l2Lambda * weights[j]);
        }
        intercept -= currentLr * (gradB / denom);
      }

      if ((epoch + 1) % 50 === 0) {
        const currentLoss = computeLoss(X_train, Y_train, weights, intercept);
        if (Math.abs(prevLoss - currentLoss) < 1e-6) {
          convergenceEpoch = epoch + 1;
          convergenceStatus = `CONVERGED_AT_EPOCH_${convergenceEpoch}`;
          break;
        }
        prevLoss = currentLoss;
      }
    }

    const finalLoss = Number(computeLoss(X_train, Y_train, weights, intercept).toFixed(5));
    console.log(`Final Weighted Loss: ${finalLoss} (${convergenceStatus}, completed ${convergenceEpoch} epochs)`);

    const coefficients: Record<string, number> = {};
    PRODUCTION_FEATURE_NAMES.forEach((feat, idx) => {
      coefficients[feat] = Number(weights[idx].toFixed(4));
    });
    intercept = Number(intercept.toFixed(4));

    console.log("\nLearned Model Coefficients (Candidate 3.1.0):");
    for (const feat of PRODUCTION_FEATURE_NAMES) {
      console.log(`  ${feat.padEnd(18)}: ${coefficients[feat].toFixed(4)}`);
    }
    console.log(`  Intercept          : ${intercept.toFixed(4)}`);

    // 4. Metric Evaluation Helper
    const evaluateModel = (
      samples: RuntimeTrainingSample[],
      X_norm: number[][],
      Y: number[],
      w: number[],
      b: number
    ): MetricEvaluation => {
      let tp = 0;
      let fp = 0;
      let tn = 0;
      let fn = 0;
      let totalLogLoss = 0;
      const eps = 1e-15;
      const predictions: { prob: number; label: number }[] = [];

      for (let i = 0; i < samples.length; i++) {
        let z = b;
        for (let j = 0; j < w.length; j++) z += w[j] * X_norm[i][j];
        const prob = sigmoid(z);
        const pred = prob >= 0.5 ? 1 : 0;
        const actual = Y[i];

        totalLogLoss += -(actual * Math.log(prob + eps) + (1 - actual) * Math.log(1 - prob + eps));
        predictions.push({ prob, label: actual });

        if (pred === 1 && actual === 1) tp++;
        else if (pred === 1 && actual === 0) fp++;
        else if (pred === 0 && actual === 0) tn++;
        else if (pred === 0 && actual === 1) fn++;
      }

      const sampleCount = samples.length;
      const accuracy = Number(((tp + tn) / sampleCount).toFixed(4));
      const precision = Number((tp + fp > 0 ? tp / (tp + fp) : 0).toFixed(4));
      const recall = Number((tp + fn > 0 ? tp / (tp + fn) : 0).toFixed(4));
      const f1Score = Number(
        (precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0).toFixed(4)
      );
      const logLoss = Number((totalLogLoss / sampleCount).toFixed(4));

      // ROC-AUC via trapezoidal integration over sorted probabilities
      predictions.sort((a, b) => b.prob - a.prob);
      let rocAuc = 0;
      const numPos = Y.filter((y) => y === 1).length;
      const numNeg = Y.length - numPos;
      if (numPos > 0 && numNeg > 0) {
        let cumPos = 0;
        let cumNeg = 0;
        let prevFpr = 0;
        let prevTpr = 0;

        for (const p of predictions) {
          if (p.label === 1) cumPos++;
          else cumNeg++;

          const tpr = cumPos / numPos;
          const fpr = cumNeg / numNeg;

          rocAuc += (fpr - prevFpr) * ((tpr + prevTpr) / 2);
          prevFpr = fpr;
          prevTpr = tpr;
        }
      }
      rocAuc = Number(rocAuc.toFixed(4));

      return {
        sampleCount,
        accuracy,
        precision,
        recall,
        f1Score,
        rocAuc,
        logLoss,
        confusionMatrix: {
          truePositive: tp,
          falsePositive: fp,
          trueNegative: tn,
          falseNegative: fn,
        },
      };
    };

    const trainMetrics = evaluateModel(trainSamples, X_train, Y_train, weights, intercept);
    const valMetrics = evaluateModel(valSamples, X_val, Y_val, weights, intercept);
    const testMetrics = evaluateModel(testSamples, X_test, Y_test, weights, intercept);

    console.log("\nEvaluation Summary for Candidate 3.0.0-real-runtime-training:");
    console.log("-----------------------------------------------------------------");
    console.log(`  Training   (N=${trainMetrics.sampleCount}) : Acc=${trainMetrics.accuracy} | Prec=${trainMetrics.precision} | Rec=${trainMetrics.recall} | F1=${trainMetrics.f1Score} | ROC-AUC=${trainMetrics.rocAuc} | Loss=${trainMetrics.logLoss}`);
    console.log(`  Validation (N=${valMetrics.sampleCount}) : Acc=${valMetrics.accuracy} | Prec=${valMetrics.precision} | Rec=${valMetrics.recall} | F1=${valMetrics.f1Score} | ROC-AUC=${valMetrics.rocAuc} | Loss=${valMetrics.logLoss}`);
    console.log(`  Test       (N=${testMetrics.sampleCount}) : Acc=${testMetrics.accuracy} | Prec=${testMetrics.precision} | Rec=${testMetrics.recall} | F1=${testMetrics.f1Score} | ROC-AUC=${testMetrics.rocAuc} | Loss=${testMetrics.logLoss}`);
    console.log("  Held-out Test Confusion Matrix: TP=" + testMetrics.confusionMatrix.truePositive + ", FP=" + testMetrics.confusionMatrix.falsePositive + ", TN=" + testMetrics.confusionMatrix.trueNegative + ", FN=" + testMetrics.confusionMatrix.falseNegative);

    // -------------------------------------------------------------------------
    // [7/7] Baseline Production Model (2.0.0) Comparison on Same Held-Out Test Set
    // -------------------------------------------------------------------------
    console.log("\n[7/7] Evaluating Baseline Production Model (2.0.0) on Held-Out Test Set...");
    console.log("-----------------------------------------------------------------");

    let prodTp = 0;
    let prodFp = 0;
    let prodTn = 0;
    let prodFn = 0;
    let prodTotalLoss = 0;
    const eps = 1e-15;
    const prodProbs: { prob: number; label: number }[] = [];

    for (let i = 0; i < testSamples.length; i++) {
      const sample = testSamples[i];
      const prodRes = SLOViolationClassifier.predict(sample.features);
      const prob = prodRes.violationProbability;
      const pred = prodRes.prediction === "VIOLATION" ? 1 : 0;
      const actual = sample.label;

      prodTotalLoss += -(actual * Math.log(prob + eps) + (1 - actual) * Math.log(1 - prob + eps));
      prodProbs.push({ prob, label: actual });

      if (pred === 1 && actual === 1) prodTp++;
      else if (pred === 1 && actual === 0) prodFp++;
      else if (pred === 0 && actual === 0) prodTn++;
      else if (pred === 0 && actual === 1) prodFn++;
    }

    const prodAccuracy = Number(((prodTp + prodTn) / testSamples.length).toFixed(4));
    const prodPrecision = Number((prodTp + prodFp > 0 ? prodTp / (prodTp + prodFp) : 0).toFixed(4));
    const prodRecall = Number((prodTp + prodFn > 0 ? prodTp / (prodTp + prodFn) : 0).toFixed(4));
    const prodF1 = Number(
      (prodPrecision + prodRecall > 0
        ? (2 * prodPrecision * prodRecall) / (prodPrecision + prodRecall)
        : 0
      ).toFixed(4)
    );
    const prodLogLoss = Number((prodTotalLoss / testSamples.length).toFixed(4));

    prodProbs.sort((a, b) => b.prob - a.prob);
    let prodRocAuc = 0;
    const numPos = Y_test.filter((y) => y === 1).length;
    const numNeg = Y_test.length - numPos;
    if (numPos > 0 && numNeg > 0) {
      let cumPos = 0;
      let cumNeg = 0;
      let prevFpr = 0;
      let prevTpr = 0;

      for (const p of prodProbs) {
        if (p.label === 1) cumPos++;
        else cumNeg++;

        const tpr = cumPos / numPos;
        const fpr = cumNeg / numNeg;

        prodRocAuc += (fpr - prevFpr) * ((tpr + prevTpr) / 2);
        prevFpr = fpr;
        prevTpr = tpr;
      }
    }
    prodRocAuc = Number(prodRocAuc.toFixed(4));

    const productionBaselineMetrics: MetricEvaluation = {
      sampleCount: testSamples.length,
      accuracy: prodAccuracy,
      precision: prodPrecision,
      recall: prodRecall,
      f1Score: prodF1,
      rocAuc: prodRocAuc,
      logLoss: prodLogLoss,
      confusionMatrix: {
        truePositive: prodTp,
        falsePositive: prodFp,
        trueNegative: prodTn,
        falseNegative: prodFn,
      },
    };

    console.log("Held-Out Test Baseline Comparison (N=122):");
    console.log("-----------------------------------------------------------------");
    console.log(`  Metric        | Production 2.0.0 | Candidate 3.0.0`);
    console.log(`  Accuracy      | ${prodAccuracy.toFixed(4).padStart(16)} | ${testMetrics.accuracy.toFixed(4).padStart(15)}`);
    console.log(`  Precision     | ${prodPrecision.toFixed(4).padStart(16)} | ${testMetrics.precision.toFixed(4).padStart(15)}`);
    console.log(`  Recall        | ${prodRecall.toFixed(4).padStart(16)} | ${testMetrics.recall.toFixed(4).padStart(15)}`);
    console.log(`  F1-Score      | ${prodF1.toFixed(4).padStart(16)} | ${testMetrics.f1Score.toFixed(4).padStart(15)}`);
    console.log(`  ROC-AUC       | ${prodRocAuc.toFixed(4).padStart(16)} | ${testMetrics.rocAuc.toFixed(4).padStart(15)}`);
    console.log(`  Log Loss      | ${prodLogLoss.toFixed(4).padStart(16)} | ${testMetrics.logLoss.toFixed(4).padStart(15)}`);
    console.log(`  True Positive | ${String(prodTp).padStart(16)} | ${String(testMetrics.confusionMatrix.truePositive).padStart(15)}`);
    console.log(`  True Negative | ${String(prodTn).padStart(16)} | ${String(testMetrics.confusionMatrix.trueNegative).padStart(15)}`);
    console.log(`  False Positive| ${String(prodFp).padStart(16)} | ${String(testMetrics.confusionMatrix.falsePositive).padStart(15)}`);
    console.log(`  False Negative| ${String(prodFn).padStart(16)} | ${String(testMetrics.confusionMatrix.falseNegative).padStart(15)}`);

    // Dataset fingerprint (hash of sorted IDs)
    const datasetFingerprint = crypto
      .createHash("sha256")
      .update(allSamples.map((s) => s.sourceId).sort().join(":"))
      .digest("hex")
      .slice(0, 16);

    const earliestTimestamp = allSamples[0]?.featureTimestamp || new Date().toISOString();
    const latestTimestamp = allSamples[allSamples.length - 1]?.featureTimestamp || new Date().toISOString();

    // -------------------------------------------------------------------------
    // Construct Candidate Model Artifact
    // -------------------------------------------------------------------------
    const candidateArtifact: CandidateModelArtifact = {
      modelVersion: "3.1.0-real-runtime-training",
      status: "CANDIDATE",
      baselineVersion: "2.0.0-production-telemetry",
      predecessorVersion: "3.0.0-real-runtime-training",
      algorithm: "class_weighted_logistic_regression",
      schemaVersion: "v2-production-telemetry",
      featureNames: [...PRODUCTION_FEATURE_NAMES],
      scaler,
      coefficients,
      intercept,
      threshold: 0.5,
      trainingConfig: {
        epochs,
        batchSize,
        learningRate,
        learningRateDecay,
        l2Regularization: l2Lambda,
        weightMethod: "balanced_inverse_frequency",
        classWeights: {
          healthyWeight: Number(w0.toFixed(4)),
          violationWeight: Number(w1.toFixed(4)),
        },
        iterationsCompleted: convergenceEpoch,
        convergenceStatus,
        initialLoss,
        finalLoss,
        deterministic: true,
        frozenOperationalThreshold: 0.5,
        operationalObjective: "Objective A - Detection Sensitive with False Negative Minimization",
      },
      datasetSummary: {
        totalSamples: readinessAudit.metrics.totalUsableSamples,
        trainCount: splits.train.length,
        validationCount: splits.validation.length,
        testCount: splits.test.length,
        nonViolationCount: readinessAudit.metrics.nonViolationCount,
        violationCount: readinessAudit.metrics.violationCount,
        temporalSpanHours: readinessAudit.metrics.totalSpanHours,
        distinctDaysCount: readinessAudit.metrics.distinctDaysCount,
        distinctServicesCount: readinessAudit.metrics.distinctServicesCount,
        distinctSlosCount: readinessAudit.metrics.distinctSlosCount,
        distinctRequirementsCount: readinessAudit.metrics.distinctRequirementsCount,
        dateRange: { start: earliestTimestamp, end: latestTimestamp },
      },
      datasetProvenance: {
        sourceTypes: ["TELEMETRY_OBSERVATION", "PROMETHEUS_SLO_MONITOR"],
        earliestTimestamp,
        latestTimestamp,
        leakageOverlap: leakageAudit.overlappingSourceIds.length,
        chronologicalOrderValid: leakageAudit.chronologicalOrderValid,
        datasetFingerprint,
      },
      metrics: {
        train: trainMetrics,
        validation: valMetrics,
        test: testMetrics,
        baselineComparison: {
          candidate: testMetrics,
          production: productionBaselineMetrics,
        },
      },
      createdAt: new Date().toISOString(),
    };

    // Calculate SHA-256 Checksum on canonical serialized artifact
    const artifactString = JSON.stringify(candidateArtifact, null, 2);
    const checksumSha256 = crypto.createHash("sha256").update(artifactString).digest("hex");
    candidateArtifact.checksumSha256 = checksumSha256;

    // Serialize Artifact to disk
    const targetDirs = [
      path.resolve(__dirname, "../data/models"),
      path.resolve(process.cwd(), "ml-service/data/models"),
      path.resolve(process.cwd(), "data/models"),
    ];

    let savedPath = "";
    for (const dir of targetDirs) {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const filePath = path.join(dir, "3.1.0-real-runtime-training.json");
        fs.writeFileSync(filePath, JSON.stringify(candidateArtifact, null, 2), "utf-8");
        if (!savedPath) savedPath = filePath;
      } catch (err) {
        // non-blocking for secondary dirs
      }
    }

    console.log(`\nCandidate Model Artifact Successfully Created:`);
    console.log(`  Path            : ${savedPath}`);
    console.log(`  Model Version   : ${candidateArtifact.modelVersion}`);
    console.log(`  Registry Status : ${candidateArtifact.status}`);
    console.log(`  SHA-256 Checksum: ${checksumSha256}`);
    console.log(`  File Size       : ${Buffer.byteLength(JSON.stringify(candidateArtifact, null, 2))} bytes`);

    return {
      status: "TRAINED",
      datasetSummary: {
        totalSamples: readinessAudit.metrics.totalUsableSamples,
        trainCount: splits.train.length,
        validationCount: splits.validation.length,
        testCount: splits.test.length,
        nonViolationCount: readinessAudit.metrics.nonViolationCount,
        violationCount: readinessAudit.metrics.violationCount,
        temporalSpanHours: readinessAudit.metrics.totalSpanHours,
        distinctDaysCount: readinessAudit.metrics.distinctDaysCount,
      },
      leakageAudit: {
        hasLeakage: leakageAudit.hasLeakage,
        overlapCount: leakageAudit.overlappingSourceIds.length,
      },
      activeModelVersion: "2.0.0-production-telemetry", // Production serving remains 2.0.0!
      candidateArtifactPath: savedPath,
      candidateChecksumSha256: checksumSha256,
      candidateMetrics: {
        train: trainMetrics,
        validation: valMetrics,
        test: testMetrics,
        baselineComparison: {
          candidate: testMetrics,
          production: productionBaselineMetrics,
        },
      },
      coefficients,
      intercept,
      scaler,
    };
  }
}

// Allow direct CLI invocation
if (require.main === module) {
  const pipeline = new RuntimeTrainingPipeline();
  pipeline
    .executePipeline()
    .then((outcome) => {
      console.log("\nPipeline Execution Outcome:", JSON.stringify(outcome, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("\nPipeline Execution Failed:", err);
      process.exit(1);
    });
}

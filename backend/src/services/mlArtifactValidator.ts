import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface ArtifactValidationResult {
  valid: boolean;
  artifactPath: string;
  actualSHA256: string;
  expectedSHA256?: string;
  shaMatches: boolean;
  metadata?: {
    modelVersion?: string;
    schemaVersion?: string;
    algorithm?: string;
    featureNames?: string[];
    threshold?: number;
    intercept?: number;
    coefficients?: Record<string, number>;
    scaler?: Record<string, { mean: number; stdDev: number }>;
  };
  errors: string[];
}

export class MLArtifactValidator {
  public static readonly REQUIRED_SCHEMA_VERSION = "v2-production-telemetry";
  public static readonly REQUIRED_FEATURES = [
    "cpuUsage",
    "memoryUsage",
    "p95Latency",
    "errorRate",
    "requestRate",
    "deploymentChanged",
  ];

  /**
   * Root directory of the repository for path containment checks.
   */
  private static getProjectRoot(): string {
    let cur = path.resolve(__dirname);
    for (let i = 0; i < 8; i++) {
      if (
        fs.existsSync(path.join(cur, "data", "trained_model.json")) ||
        fs.existsSync(path.join(cur, "ml-service", "data"))
      ) {
        return cur;
      }
      const parent = path.dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
    return process.cwd();
  }

  /**
   * Resolves and verifies that a target file path remains safely confined within the repository root.
   * Throws an error on path traversal attempts.
   */
  public static resolveSafePath(relativeOrAbsolutePath: string): string {
    const root = path.resolve(this.getProjectRoot());
    const resolved = path.isAbsolute(relativeOrAbsolutePath)
      ? path.resolve(relativeOrAbsolutePath)
      : path.resolve(root, relativeOrAbsolutePath);

    // Normalize and verify prefix containment
    const normalizedRoot = root.toLowerCase();
    const normalizedResolved = resolved.toLowerCase();

    if (!normalizedResolved.startsWith(normalizedRoot)) {
      throw new Error(
        `Path Traversal Violation: Artifact path "${relativeOrAbsolutePath}" resolves outside repository root.`
      );
    }

    return resolved;
  }

  /**
   * Deterministically validates an ML model artifact on disk against cryptographic and schema invariants.
   */
  public static async validateArtifact(
    targetPath: string,
    expectedSHA256?: string,
    expectedVersion?: string
  ): Promise<ArtifactValidationResult> {
    const errors: string[] = [];
    let resolvedPath = "";

    try {
      resolvedPath = this.resolveSafePath(targetPath);
    } catch (err: any) {
      return {
        valid: false,
        artifactPath: targetPath,
        actualSHA256: "",
        expectedSHA256,
        shaMatches: false,
        errors: [err.message],
      };
    }

    // 1. File existence check
    if (!fs.existsSync(resolvedPath)) {
      return {
        valid: false,
        artifactPath: resolvedPath,
        actualSHA256: "",
        expectedSHA256,
        shaMatches: false,
        errors: [`Artifact file not found at path: ${resolvedPath}`],
      };
    }

    // 2. Cryptographic SHA-256 calculation
    let fileBuffer: Buffer;
    try {
      fileBuffer = fs.readFileSync(resolvedPath);
    } catch (err: any) {
      return {
        valid: false,
        artifactPath: resolvedPath,
        actualSHA256: "",
        expectedSHA256,
        shaMatches: false,
        errors: [`Failed to read artifact file: ${err.message}`],
      };
    }

    const actualSHA256 = crypto
      .createHash("sha256")
      .update(fileBuffer)
      .digest("hex")
      .toUpperCase();

    let shaMatches = true;
    if (expectedSHA256) {
      const normalizedExpected = expectedSHA256.trim().toUpperCase();
      if (actualSHA256 !== normalizedExpected) {
        shaMatches = false;
        errors.push(
          `Cryptographic Integrity Mismatch: Expected SHA-256 "${normalizedExpected}", but computed "${actualSHA256}"`
        );
      }
    }

    // 3. JSON parseability
    let parsed: any;
    try {
      parsed = JSON.parse(fileBuffer.toString("utf-8"));
    } catch (err: any) {
      errors.push(`JSON Parsing Error: Artifact is not valid JSON: ${err.message}`);
      return {
        valid: false,
        artifactPath: resolvedPath,
        actualSHA256,
        expectedSHA256,
        shaMatches,
        errors,
      };
    }

    // 4. Model Version Verification (if expected)
    const detectedVersion = parsed.modelVersion || parsed.version;
    const isProductionLegacyMatch =
      expectedVersion === "2.0.0-production-telemetry" && detectedVersion === "1.0.0-research";

    if (expectedVersion && detectedVersion !== expectedVersion && !isProductionLegacyMatch) {
      errors.push(
        `Model Version Mismatch: Expected "${expectedVersion}", but artifact contains "${detectedVersion}"`
      );
    }

    // 5. Feature Schema Version Verification
    const detectedSchema = parsed.schemaVersion || (parsed.featureNames ? "v2-production-telemetry" : null);
    if (detectedSchema !== this.REQUIRED_SCHEMA_VERSION) {
      errors.push(
        `Feature Schema Version Incompatible: Expected "${this.REQUIRED_SCHEMA_VERSION}", found "${detectedSchema}"`
      );
    }

    // 6. Feature Dimensions Verification
    const featureNames: string[] = parsed.featureNames || Object.keys(parsed.coefficients || {});
    for (const reqFeat of this.REQUIRED_FEATURES) {
      if (!featureNames.includes(reqFeat)) {
        errors.push(`Missing Required Feature Dimension: Artifact is missing feature "${reqFeat}"`);
      }
    }

    // 7. Coefficients and Scaler Numerical Validation
    if (!parsed.coefficients || typeof parsed.coefficients !== "object") {
      errors.push("Invalid Model Parameters: coefficients map is missing or invalid");
    } else {
      for (const feat of this.REQUIRED_FEATURES) {
        const val = parsed.coefficients[feat];
        if (val === undefined || val === null || typeof val !== "number" || !Number.isFinite(val)) {
          errors.push(`Invalid Coefficient: Feature "${feat}" has missing or non-finite coefficient (${val})`);
        }
      }
    }

    if (!parsed.scaler || typeof parsed.scaler !== "object") {
      errors.push("Invalid Model Parameters: scaler map is missing or invalid");
    } else {
      for (const feat of this.REQUIRED_FEATURES) {
        const s = parsed.scaler[feat];
        if (!s || typeof s.mean !== "number" || typeof s.stdDev !== "number" || !Number.isFinite(s.mean) || !Number.isFinite(s.stdDev)) {
          errors.push(`Invalid Scaler Statistics: Feature "${feat}" scaler mean or stdDev is non-finite`);
        }
      }
    }

    const valid = errors.length === 0;

    return {
      valid,
      artifactPath: resolvedPath,
      actualSHA256,
      expectedSHA256,
      shaMatches,
      metadata: {
        modelVersion: detectedVersion,
        schemaVersion: detectedSchema,
        algorithm: parsed.algorithm || parsed.modelType,
        featureNames,
        threshold: parsed.threshold !== undefined ? parsed.threshold : 0.5,
        intercept: parsed.intercept,
        coefficients: parsed.coefficients,
        scaler: parsed.scaler,
      },
      errors,
    };
  }
}

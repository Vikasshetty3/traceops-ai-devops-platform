/**
 * Runtime ML Training Dataset Builder - Phase 3.3
 *
 * Assembles genuine runtime telemetry observations and SLO breach incidents
 * into a verified, leakage-free training dataset contract.
 *
 * STRICT INTEGRITY RULES:
 * 1. ZERO SYNTHETIC DATA: Never use generateDataset.ts or synthetic noise.
 * 2. ZERO DUPLICATION: Never inflate dataset size by duplicating records.
 * 3. REAL SOURCES ONLY:
 *    - NON_VIOLATION from TelemetryObservation (where label === 'NON_VIOLATION', COMPLIANT)
 *    - VIOLATION from Incident (where source === 'PROMETHEUS_SLO_MONITOR', real breach)
 * 4. STRICT 6-FEATURE SCHEMA: cpuUsage, memoryUsage, p95Latency, errorRate, requestRate, deploymentChanged.
 * 5. NO IMPUTATION: Incomplete records are counted and excluded, never filled with mean/zero.
 * 6. CHRONOLOGICAL SPLIT: Train (70%) -> Validation (15%) -> Test (15%) without temporal leakage.
 * 7. READINESS GUARD: Flags whether dataset possesses sufficient temporal and operational diversity.
 */

export interface RuntimeTrainingSample {
  sampleId: string;
  sourceType: "TELEMETRY_OBSERVATION" | "INCIDENT";
  sourceId: string;
  sloId: string;
  requirementId: string | null;
  service: string;
  featureTimestamp: string;
  features: {
    cpuUsage: number;
    memoryUsage: number;
    p95Latency: number;
    errorRate: number;
    requestRate: number;
    deploymentChanged: number;
  };
  label: 0 | 1; // 0 = NON_VIOLATION, 1 = VIOLATION
  labelString: "NON_VIOLATION" | "VIOLATION";
  sourceTimestamp: string;
  provenance: Record<string, any>;
}

export interface DatasetSplit {
  train: RuntimeTrainingSample[];
  validation: RuntimeTrainingSample[];
  test: RuntimeTrainingSample[];
}

export interface LeakageAuditResult {
  hasLeakage: boolean;
  trainValOverlapCount: number;
  trainTestOverlapCount: number;
  valTestOverlapCount: number;
  chronologicalOrderValid: boolean;
  overlappingSourceIds: string[];
}

export interface ReadinessAuditResult {
  isReady: boolean;
  reasons: string[];
  metrics: {
    totalUsableSamples: number;
    nonViolationCount: number;
    violationCount: number;
    classRatio: number;
    distinctServicesCount: number;
    distinctSlosCount: number;
    distinctRequirementsCount: number;
    distinctDaysCount: number;
    distinctHoursCount: number;
    totalSpanHours: number;
    excludedIncompleteCount: number;
    excludedHistoricalCount: number;
  };
}

export interface BuiltRuntimeDataset {
  allSamples: RuntimeTrainingSample[];
  splits: DatasetSplit;
  leakageAudit: LeakageAuditResult;
  readinessAudit: ReadinessAuditResult;
  excludedRecords: {
    incompleteObservations: number;
    incompleteIncidents: number;
    historicalIncidents: number;
    nonPrometheusIncidents: number;
  };
}

export class RuntimeDatasetBuilder {
  private backendBaseUrl: string;

  constructor(backendBaseUrl = process.env.BACKEND_URL || "http://localhost:5000") {
    this.backendBaseUrl = backendBaseUrl;
  }

  /**
   * Fetches genuine raw data from backend APIs.
   */
  private async fetchRawData(): Promise<{ observations: any[]; incidents: any[] }> {
    const obsUrl = `${this.backendBaseUrl}/api/telemetry-observations?limit=500`;
    const incUrl = `${this.backendBaseUrl}/api/incidents`;

    const [obsRes, incRes] = await Promise.all([
      fetch(obsUrl).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch(incUrl).then((r) => r.json()).catch(() => ({ data: [] })),
    ]);

    const observations = Array.isArray(obsRes.data) ? obsRes.data : [];
    const rawInc = incRes.data || incRes;
    const incidents = Array.isArray(rawInc) ? rawInc : [];

    return { observations, incidents };
  }

  /**
   * Extracts valid, complete features from a TelemetryObservation record.
   * Returns null if incomplete or invalid.
   */
  public extractObservationSample(obs: any): RuntimeTrainingSample | null {
    if (obs.label !== "NON_VIOLATION" || obs.evaluationStatus !== "COMPLIANT") {
      return null;
    }

    const f = obs.features;
    if (!f) return null;

    const cpu = f.cpuUsage;
    const mem = f.memoryUsage;
    const lat = f.p95Latency;
    const err = f.errorRate;
    const req = f.requestRate;
    const dep = f.deploymentChanged === 1 ? 1 : 0;

    // Strict validation: No nulls, finite, valid bounds
    if (cpu === null || cpu === undefined || !Number.isFinite(cpu) || cpu < 0 || cpu > 100) return null;
    if (mem === null || mem === undefined || !Number.isFinite(mem) || mem < 0 || mem > 100) return null;
    if (lat === null || lat === undefined || !Number.isFinite(lat) || lat < 0) return null;
    if (err === null || err === undefined || !Number.isFinite(err) || err < 0 || err > 100) return null;
    if (req === null || req === undefined || !Number.isFinite(req) || req < 0) return null;

    const timestamp = obs.observedAt ? new Date(obs.observedAt).toISOString() : new Date().toISOString();

    return {
      sampleId: `SMP-OBS-${obs.observationId || obs._id}`,
      sourceType: "TELEMETRY_OBSERVATION",
      sourceId: obs.observationId || String(obs._id),
      sloId: obs.sloId,
      requirementId: obs.requirementId && obs.requirementId !== "UNLINKED" ? obs.requirementId : null,
      service: obs.service,
      featureTimestamp: timestamp,
      features: {
        cpuUsage: Number(cpu.toFixed(2)),
        memoryUsage: Number(mem.toFixed(2)),
        p95Latency: Number(lat.toFixed(4)),
        errorRate: Number(err.toFixed(2)),
        requestRate: Number(req.toFixed(2)),
        deploymentChanged: dep,
      },
      label: 0,
      labelString: "NON_VIOLATION",
      sourceTimestamp: timestamp,
      provenance: obs.provenance || {},
    };
  }

  /**
   * Extracts valid, complete features from a genuine PROMETHEUS_SLO_MONITOR incident.
   * Returns null if incomplete, invalid, or non-Prometheus.
   */
  public extractIncidentSample(inc: any): RuntimeTrainingSample | null {
    // Strictly exclude historical seed and demo records
    if (inc.source !== "PROMETHEUS_SLO_MONITOR") {
      return null;
    }

    const m = inc.metrics || {};
    const overview = inc.telemetryEvidence?.overview || {};
    const app = overview.application || {};
    const host = overview.host || {};

    const cpu = host.cpuUsage ?? m.cpuUsage;
    const mem = host.memoryUsage ?? m.memoryUsage;
    const lat = inc.metric?.includes("latency") ? inc.actualValue : (m.p95Latency ?? m.latency ?? app.p95Latency);
    const err = inc.metric?.includes("error") ? inc.actualValue : (m.errorRate ?? app.errorRate);
    const req = app.requestRate ?? m.requestRate;
    const dep = m.deploymentChanged ? 1 : 0;

    // Strict validation
    if (cpu === null || cpu === undefined || !Number.isFinite(cpu) || cpu < 0 || cpu > 100) return null;
    if (mem === null || mem === undefined || !Number.isFinite(mem) || mem < 0 || mem > 100) return null;
    if (lat === null || lat === undefined || !Number.isFinite(lat) || lat < 0) return null;
    if (err === null || err === undefined || !Number.isFinite(err) || err < 0 || err > 100) return null;
    if (req === null || req === undefined || !Number.isFinite(req) || req < 0) return null;

    const timestamp = (inc.evaluatedAt || inc.createdAt)
      ? new Date(inc.evaluatedAt || inc.createdAt).toISOString()
      : new Date().toISOString();

    return {
      sampleId: `SMP-INC-${inc.incidentId || inc._id}`,
      sourceType: "INCIDENT",
      sourceId: inc.incidentId || String(inc._id),
      sloId: inc.sloId,
      requirementId: inc.requirementId && inc.requirementId !== "UNLINKED" ? inc.requirementId : null,
      service: inc.service,
      featureTimestamp: timestamp,
      features: {
        cpuUsage: Number(cpu.toFixed(2)),
        memoryUsage: Number(mem.toFixed(2)),
        p95Latency: Number(lat.toFixed(4)),
        errorRate: Number(err.toFixed(2)),
        requestRate: Number(req.toFixed(2)),
        deploymentChanged: dep,
      },
      label: 1,
      labelString: "VIOLATION",
      sourceTimestamp: timestamp,
      provenance: {
        source: "PROMETHEUS_SLO_MONITOR",
        promQl: inc.promQl,
        measuredValue: inc.actualValue,
        threshold: inc.threshold,
        severity: inc.severity,
      },
    };
  }

  /**
   * Builds the complete dataset with chronological split and audits.
   */
  public async buildDataset(): Promise<BuiltRuntimeDataset> {
    const { observations, incidents } = await this.fetchRawData();

    const allSamples: RuntimeTrainingSample[] = [];
    let incompleteObservations = 0;
    let incompleteIncidents = 0;
    let historicalIncidents = 0;
    let nonPrometheusIncidents = 0;

    // Process healthy observations
    const seenSourceIds = new Set<string>();

    for (const obs of observations) {
      const sample = this.extractObservationSample(obs);
      if (!sample) {
        incompleteObservations++;
        continue;
      }
      if (seenSourceIds.has(sample.sourceId)) {
        // Deduplicate
        continue;
      }
      seenSourceIds.add(sample.sourceId);
      allSamples.push(sample);
    }

    // Process breach incidents
    for (const inc of incidents) {
      if (inc.source === "HISTORICAL") {
        historicalIncidents++;
        continue;
      }
      if (inc.source !== "PROMETHEUS_SLO_MONITOR") {
        nonPrometheusIncidents++;
        continue;
      }

      const sample = this.extractIncidentSample(inc);
      if (!sample) {
        incompleteIncidents++;
        continue;
      }
      if (seenSourceIds.has(sample.sourceId)) {
        // Deduplicate
        continue;
      }
      seenSourceIds.add(sample.sourceId);
      allSamples.push(sample);
    }

    // Sort chronologically by featureTimestamp
    allSamples.sort(
      (a, b) => new Date(a.featureTimestamp).getTime() - new Date(b.featureTimestamp).getTime()
    );

    // Chronological split: 70% Train, 15% Validation, 15% Test
    const total = allSamples.length;
    const trainEnd = Math.floor(total * 0.7);
    const valEnd = Math.floor(total * 0.85);

    const train = allSamples.slice(0, trainEnd);
    const validation = allSamples.slice(trainEnd, valEnd);
    const test = allSamples.slice(valEnd);

    const splits: DatasetSplit = { train, validation, test };

    // Audit for Data Leakage
    const leakageAudit = this.auditLeakage(splits);

    // Audit for Training Readiness
    const readinessAudit = this.auditReadiness(allSamples, {
      incompleteObservations,
      incompleteIncidents,
      historicalIncidents,
      nonPrometheusIncidents,
    });

    return {
      allSamples,
      splits,
      leakageAudit,
      readinessAudit,
      excludedRecords: {
        incompleteObservations,
        incompleteIncidents,
        historicalIncidents,
        nonPrometheusIncidents,
      },
    };
  }

  /**
   * Verifies zero overlap and strict chronological ordering across splits.
   */
  public auditLeakage(splits: DatasetSplit): LeakageAuditResult {
    const trainIds = new Set(splits.train.map((s) => s.sourceId));
    const valIds = new Set(splits.validation.map((s) => s.sourceId));
    const testIds = new Set(splits.test.map((s) => s.sourceId));

    const overlappingSourceIds: string[] = [];

    let trainValOverlap = 0;
    for (const id of valIds) {
      if (trainIds.has(id)) {
        trainValOverlap++;
        overlappingSourceIds.push(id);
      }
    }

    let trainTestOverlap = 0;
    for (const id of testIds) {
      if (trainIds.has(id)) {
        trainTestOverlap++;
        overlappingSourceIds.push(id);
      }
    }

    let valTestOverlap = 0;
    for (const id of testIds) {
      if (valIds.has(id)) {
        valTestOverlap++;
        overlappingSourceIds.push(id);
      }
    }

    // Chronological ordering check
    let chronologicalOrderValid = true;
    if (splits.train.length > 0 && splits.validation.length > 0) {
      const maxTrain = new Date(splits.train[splits.train.length - 1].featureTimestamp).getTime();
      const minVal = new Date(splits.validation[0].featureTimestamp).getTime();
      if (maxTrain > minVal) chronologicalOrderValid = false;
    }
    if (splits.validation.length > 0 && splits.test.length > 0) {
      const maxVal = new Date(splits.validation[splits.validation.length - 1].featureTimestamp).getTime();
      const minTest = new Date(splits.test[0].featureTimestamp).getTime();
      if (maxVal > minTest) chronologicalOrderValid = false;
    }

    const hasLeakage =
      trainValOverlap > 0 ||
      trainTestOverlap > 0 ||
      valTestOverlap > 0 ||
      !chronologicalOrderValid;

    return {
      hasLeakage,
      trainValOverlapCount: trainValOverlap,
      trainTestOverlapCount: trainTestOverlap,
      valTestOverlapCount: valTestOverlap,
      chronologicalOrderValid,
      overlappingSourceIds,
    };
  }

  /**
   * Evaluates dataset readiness against production standards.
   */
  public auditReadiness(
    allSamples: RuntimeTrainingSample[],
    excluded: {
      incompleteObservations: number;
      incompleteIncidents: number;
      historicalIncidents: number;
      nonPrometheusIncidents: number;
    }
  ): ReadinessAuditResult {
    let nonViolationCount = 0;
    let violationCount = 0;
    const services = new Set<string>();
    const slos = new Set<string>();
    const requirements = new Set<string>();
    const days = new Set<string>();
    const hours = new Set<string>();

    const timestamps: number[] = [];

    for (const s of allSamples) {
      if (s.label === 0) nonViolationCount++;
      if (s.label === 1) violationCount++;
      if (s.service) services.add(s.service);
      if (s.sloId) slos.add(s.sloId);
      if (s.requirementId) requirements.add(s.requirementId);

      const d = new Date(s.featureTimestamp);
      timestamps.push(d.getTime());
      days.add(d.toISOString().slice(0, 10));
      hours.add(d.toISOString().slice(0, 13));
    }

    timestamps.sort((a, b) => a - b);
    const totalSpanHours =
      timestamps.length > 1
        ? Number(((timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 3600)).toFixed(2))
        : 0;

    const classRatio = Number((violationCount / (nonViolationCount || 1)).toFixed(2));

    const reasons: string[] = [];

    // Criteria 1: Sample volume
    if (allSamples.length < 100) {
      reasons.push(`Total usable samples (${allSamples.length}) below minimum production threshold (100)`);
    }

    // Criteria 2: Class balance (both classes must have >= 30)
    if (nonViolationCount < 30) {
      reasons.push(`NON_VIOLATION class count (${nonViolationCount}) below minimum threshold (30)`);
    }
    if (violationCount < 30) {
      reasons.push(`VIOLATION class count (${violationCount}) below minimum threshold (30)`);
    }

    // Criteria 3: Service diversity (>= 3 services)
    if (services.size < 3) {
      reasons.push(`Distinct services count (${services.size}) below threshold (3)`);
    }

    // Criteria 4: TEMPORAL DIVERSITY (CRITICAL CONTRACT RULE)
    // Production retraining mandates data spanning across at least 3 distinct days or multi-shift diurnal cycle (> 24h)
    if (days.size < 3 || totalSpanHours < 24.0) {
      reasons.push(
        `Temporal diversity insufficient: Dataset spans only ${days.size} calendar day(s) and ${totalSpanHours} hours (minimum required: >= 3 distinct calendar days and > 24 hours to prevent single-session diurnal overfitting)`
      );
    }

    const isReady = reasons.length === 0;

    return {
      isReady,
      reasons,
      metrics: {
        totalUsableSamples: allSamples.length,
        nonViolationCount,
        violationCount,
        classRatio,
        distinctServicesCount: services.size,
        distinctSlosCount: slos.size,
        distinctRequirementsCount: requirements.size,
        distinctDaysCount: days.size,
        distinctHoursCount: hours.size,
        totalSpanHours,
        excludedIncompleteCount: excluded.incompleteObservations + excluded.incompleteIncidents,
        excludedHistoricalCount: excluded.historicalIncidents + excluded.nonPrometheusIncidents,
      },
    };
  }
}

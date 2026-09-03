import { SLO, ISLO } from "../models/SLO";

export interface SLOEvaluationResult {
  sloId: string;
  requirementId: string;
  metric: string;
  operator: string;
  target: number;
  actualValue: number;
  unit: string;
  compliant: boolean;
  margin: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  evaluatedAt: Date;
}

export interface SLOEvaluationSummary {
  total: number;
  compliant: number;
  breached: number;
  complianceRate: number;
  evaluations: SLOEvaluationResult[];
}

export class SLOEvaluationService {
  public static evaluateSLODirect(
    slo: ISLO,
    actualValue: number
  ): SLOEvaluationResult {
    let compliant = false;
    const threshold = slo.threshold ?? slo.target ?? 0;

    switch (slo.operator) {
      case "<":
        compliant = actualValue < threshold;
        break;
      case "<=":
        compliant = actualValue <= threshold;
        break;
      case ">":
        compliant = actualValue > threshold;
        break;
      case ">=":
        compliant = actualValue >= threshold;
        break;
      case "=":
      case "==" as any:
        compliant = actualValue === threshold;
        break;
      default:
        compliant = false;
    }

    const margin = Number((actualValue - threshold).toFixed(4));

    return {
      sloId: slo.sloId,
      requirementId: slo.requirementId,
      metric: slo.metric,
      operator: slo.operator,
      target: threshold,
      actualValue,
      unit: slo.unit,
      compliant,
      margin,
      severity: slo.severity,
      evaluatedAt: new Date(),
    };
  }

  public static async evaluateSLO(
    sloId: string,
    actualValue: number
  ): Promise<SLOEvaluationResult> {
    const slo = await SLO.findOne({
      $or: [{ sloId }, { _id: sloId.match(/^[0-9a-fA-F]{24}$/) ? sloId : undefined }],
    });

    if (!slo) {
      throw new Error(`SLO '${sloId}' not found`);
    }

    return this.evaluateSLODirect(slo, actualValue);
  }

  public static async evaluateAll(
    metricsMap: Record<string, number>
  ): Promise<SLOEvaluationSummary> {
    const slos = await SLO.find({ status: "ACTIVE" });
    const evaluations: SLOEvaluationResult[] = [];

    for (const slo of slos) {
      const metricKey = `${slo.service}_${slo.metric}`;
      const actualValue = metricsMap[metricKey] ?? metricsMap[slo.metric] ?? 0;
      evaluations.push(this.evaluateSLODirect(slo, actualValue));
    }

    const total = evaluations.length;
    const compliantCount = evaluations.filter((e) => e.compliant).length;
    const breachedCount = total - compliantCount;
    const complianceRate = total > 0 ? (compliantCount / total) * 100 : 100;

    return {
      total,
      compliant: compliantCount,
      breached: breachedCount,
      complianceRate: Number(complianceRate.toFixed(2)),
      evaluations,
    };
  }
}

export const evaluateSLO = (sloId: string, actualValue: number) =>
  SLOEvaluationService.evaluateSLO(sloId, actualValue);
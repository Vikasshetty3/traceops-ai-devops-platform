import { Requirement } from "../models/Requirement";
import { SLO } from "../models/SLO";
import { Incident } from "../models/Incident";
import { RCA } from "../models/RCA";
import { Experiment } from "../models/Experiment";
import { DevOpsAction } from "../models/DevOpsAction";
import { Traceability } from "../models/Traceability";
import { User } from "../models/User";
import { AuthService } from "../services/authService";

export const seedDatabase = async (): Promise<void> => {
  try {
    const baseReq = await Requirement.findOne({ requirementId: "REQ-001" });
    if (!baseReq) {
      console.log("Seeding baseline DevOps requirements...");
      await Requirement.create([
        {
          requirementId: "REQ-001",
          title: "Checkout latency SLA",
          description: "Checkout response latency p95 must stay under 2.0 seconds during peak traffic.",
          service: "Checkout",
          category: "performance",
          metric: "p95_latency",
          operator: "<",
          threshold: 2.0,
          unit: "seconds",
          priority: "CRITICAL",
          status: "ACTIVE",
        },
        {
          requirementId: "REQ-002",
          title: "Payment gateway success rate",
          description: "Payment transaction error rate must stay below 0.1% under normal conditions.",
          service: "Payments",
          category: "reliability",
          metric: "error_rate",
          operator: "<",
          threshold: 0.1,
          unit: "%",
          priority: "CRITICAL",
          status: "ACTIVE",
        },
        {
          requirementId: "REQ-003",
          title: "Order fulfillment processing latency",
          description: "Order ingestion and queue dispatch latency p95 must remain under 1.5 seconds.",
          service: "Orders",
          category: "performance",
          metric: "p95_latency",
          operator: "<",
          threshold: 1.5,
          unit: "seconds",
          priority: "HIGH",
          status: "ACTIVE",
        },
        {
          requirementId: "REQ-004",
          title: "User authentication response time",
          description: "JWT token issuance and validation p95 latency must be under 300ms.",
          service: "Authentication",
          category: "availability",
          metric: "p95_latency",
          operator: "<",
          threshold: 0.3,
          unit: "seconds",
          priority: "MEDIUM",
          status: "ACTIVE",
        },
      ]);
    }

    const baseSlo = await SLO.findOne({ sloId: "SLO-001" });
    if (!baseSlo) {
      console.log("Seeding baseline DevOps SLOs...");
      await SLO.create([
        {
          sloId: "SLO-001",
          requirementId: "REQ-001",
          service: "Checkout",
          metric: "p95_latency",
          operator: "<",
          threshold: 2.0,
          target: 2.0,
          unit: "seconds",
          window: "5m",
          severity: "CRITICAL",
          status: "ACTIVE",
        },
        {
          sloId: "SLO-002",
          requirementId: "REQ-002",
          service: "Payments",
          metric: "error_rate",
          operator: "<",
          threshold: 0.1,
          target: 0.1,
          unit: "%",
          window: "15m",
          severity: "CRITICAL",
          status: "ACTIVE",
        },
        {
          sloId: "SLO-003",
          requirementId: "REQ-003",
          service: "Orders",
          metric: "p95_latency",
          operator: "<",
          threshold: 1.5,
          target: 1.5,
          unit: "seconds",
          window: "5m",
          severity: "HIGH",
          status: "ACTIVE",
        },
        {
          sloId: "SLO-004",
          requirementId: "REQ-004",
          service: "Authentication",
          metric: "p95_latency",
          operator: "<",
          threshold: 0.3,
          target: 0.3,
          unit: "seconds",
          window: "1m",
          severity: "MEDIUM",
          status: "ACTIVE",
        },
      ]);
    }

    const baseInc = await Incident.findOne({ incidentId: "INC-101" });
    if (!baseInc) {
      console.log("Seeding baseline historical demo incidents...");
      await Incident.create([
        {
          incidentId: "INC-101",
          requirementId: "REQ-001",
          sloId: "SLO-001",
          service: "Checkout",
          metric: "p95_latency",
          actualValue: 2.8,
          threshold: 2.0,
          targetValue: 2.0,
          operator: "<",
          severity: "CRITICAL",
          status: "OPEN",
          source: "HISTORICAL",
          message: "Checkout p95 latency spiked to 2.8s breaching 2.0s SLO threshold",
          logs: [
            "WARN [CheckoutService] Connection pool exhausted: 20/20 active connections",
            "ERROR [CheckoutService] Connection wait queue size exceeded limit (124 pending requests)",
            "INFO [CheckoutService] High latency observed during payment authorization phase",
          ],
          metrics: {
            cpuUsage: 92,
            memoryUsage: 60,
            errorRate: 2.0,
            latency: 2.8,
            deploymentChanged: false,
          },
        },
        {
          incidentId: "INC-102",
          requirementId: "REQ-003",
          sloId: "SLO-003",
          service: "Orders",
          metric: "p95_latency",
          actualValue: 1.8,
          threshold: 1.5,
          targetValue: 1.5,
          operator: "<",
          severity: "HIGH",
          status: "RESOLVED",
          source: "HISTORICAL",
          message: "Order queue latency breach due to downstream Redis cache saturation",
          logs: [
            "WARN [OrdersService] Redis client command timeout after 1500ms",
            "INFO [OrdersService] Reconnecting to Redis secondary replica node",
          ],
          metrics: {
            cpuUsage: 78,
            memoryUsage: 72,
            errorRate: 0.4,
            latency: 1.8,
            deploymentChanged: false,
          },
          resolvedAt: new Date(),
        },
      ]);
    }

    // 4. Baseline RCA
    const baseRca = await RCA.findOne({ rcaId: "RCA-GEMINI-001" });
    if (!baseRca) {
      await RCA.create([
        {
          rcaId: "RCA-GEMINI-001",
          incidentId: "INC-101",
          requirementId: "REQ-001",
          sloId: "SLO-001",
          service: "Checkout",
          rootCause: "Database connection pool exhaustion",
          evidence: [
            "p95 latency (2.8s) exceeded SLO threshold of 2.0s",
            "Database connection pool exhausted (20/20 active connections)",
            "CPU utilization elevated at 92% under concurrent checkout load",
            "Error rate elevated at 2.0%",
          ],
          confidence: 0.95,
          recommendedAction: "Increase database connection pool size from 20 to 40 and tune query connection timeout",
          metricsSnapshot: {
            cpuUsage: 92,
            memoryUsage: 60,
            errorRate: 2.0,
            latency: 2.8,
            deploymentChanged: false,
          },
          status: "GENERATED",
        },
      ]);
    }

    // 5. Baseline Experiment
    const baseExp = await Experiment.findOne({ experimentId: "EXP-101" });
    if (!baseExp) {
      await Experiment.create([
        {
          experimentId: "EXP-101",
          rcaId: "RCA-GEMINI-001",
          requirementId: "REQ-001",
          service: "Checkout",
          hypothesis: "Increasing DB Connection Pool from 20 to 40 will reduce response latency from 2.8s to 1.68s (40.0% improvement) and satisfy SLO (<2.0s).",
          remediationAction: "Increase database connection pool size from 20 to 40",
          parameters: {
            parameterName: "DB Connection Pool",
            currentValue: 20,
            proposedValue: 40,
          },
          metricsBefore: {
            latency: 2.8,
            errorRate: 2.0,
            cpuUsage: 92,
            memoryUsage: 60,
          },
          metricsAfter: {
            latency: 1.68,
            errorRate: 0.1,
            cpuUsage: 68,
            memoryUsage: 58,
          },
          sloThreshold: 2.0,
          result: "PASS",
          improvementPct: 40.0,
          status: "COMPLETED",
        },
      ]);
    }

    // 6. Baseline DevOps Action
    const baseAction = await DevOpsAction.findOne({ actionId: "ACT-101" });
    if (!baseAction) {
      await DevOpsAction.create([
        {
          actionId: "ACT-101",
          rcaId: "RCA-GEMINI-001",
          experimentId: "EXP-101",
          requirementId: "REQ-001",
          service: "Checkout",
          actionType: "UPDATE_CONFIG",
          description: "Apply ConfigMap patch: database.pool.max = 40 on checkout service",
          payload: { maxPoolSize: 40, timeoutMs: 3000 },
          status: "PROPOSED",
          executionLogs: [
            `[${new Date().toISOString()}] Action proposed following Experiment EXP-101 verification (PASS).`,
          ],
        },
      ]);
    }

    // 7. Traceability Mappings
    const baseTrace = await Traceability.findOne({ traceId: "TRACE-001" });
    if (!baseTrace) {
      await Traceability.create([
        {
          traceId: "TRACE-001",
          requirementId: "REQ-001",
          sloId: "SLO-001",
          service: "Checkout",
          metric: "p95_latency",
          prometheusMetric: "http_request_duration_seconds",
          runtimeResource: "deployment/checkout-service",
          kubernetesNamespace: "production",
          recoveryPolicy: "auto_scale_or_pool_expand",
          status: "ACTIVE",
        },
        {
          traceId: "TRACE-002",
          requirementId: "REQ-002",
          sloId: "SLO-002",
          service: "Payments",
          metric: "error_rate",
          prometheusMetric: "service_error_rate_percent",
          runtimeResource: "deployment/payments-service",
          kubernetesNamespace: "production",
          recoveryPolicy: "circuit_breaker_retry",
          status: "ACTIVE",
        },
      ]);
    }

    // Seed default demo users for product/demo experience
    const defaultUser = await User.findOne({ username: "user" });
    if (!defaultUser) {
      const userHash = await AuthService.hashPassword("user123");
      const adminHash = await AuthService.hashPassword("admin123");

      await User.create([
        {
          userId: "USR-DEMO-001",
          username: "user",
          email: "user@traceops.io",
          passwordHash: userHash,
          name: "DevOps Engineer",
          role: "USER",
        },
        {
          userId: "USR-ADMIN-001",
          username: "admin",
          email: "admin@traceops.io",
          passwordHash: adminHash,
          name: "Platform Administrator",
          role: "ADMIN",
        },
      ]);
      console.log("Demo users seeded: user (user@traceops.io / user123) and admin (admin@traceops.io / admin123)");
    }

    console.log("Database seeded successfully with complete TraceOps dataset!");
  } catch (error) {
    console.error("Database seeding notice:", error);
  }
};

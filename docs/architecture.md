# Architecture & Workflow Documentation

The **Requirement Traceable DevOps Platform (TraceOps)** bridges high-level business software requirements with low-level observability, machine learning violation prediction, AI-assisted root cause analysis, automated remediation experiments, and safe DevOps execution.

```
+-----------------------------------------------------------------------------------+
|                            REQUIREMENT (REQ-001)                                  |
|                            "Checkout latency SLA"                                 |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                               SLO (SLO-001)                                       |
|                              p95 < 2.0 seconds                                    |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                     RUNTIME OBSERVABILITY (Prometheus)                            |
|             Latency: 2.8s | CPU: 92% | Memory: 60% | Errors: 2.0%                 |
+------------------------------------------+----------------------------------------+
                                           |
                    +----------------------+-----------------------+
                    |                                              |
                    v                                              v
+---------------------------------------+      +------------------------------------+
|       ML PREDICTIVE CLASSIFIER        |      |         INCIDENT DETECTION         |
|         POST /api/ml                  |      |      Status: OPEN | Severity: CRIT |
|   Logistic Regression (L2 Regularized)|      |      Actual: 2.8s vs Target: 2.0s  |
|      Result: 99% VIOLATION            |      |                                    |
+-------------------+-------------------+      +-------------------+----------------+
                    |                                              |
                    +----------------------+-----------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                          GEMINI AI ROOT CAUSE ANALYSIS                            |
|                            POST /api/gemini-rca                                   |
|   - Root Cause: Database connection pool exhaustion                               |
|   - Confidence: 95%                                                               |
|   - Evidence: Exceeded p95 threshold, Connection pool exhausted (20/20)           |
|   - Recommended Action: Increase database connection pool size from 20 to 40      |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                               MONGODB RCA HISTORY                                 |
|                 Persisted for Compliance, Audit, and Search                       |
+------------------------------------------+----------------------------------------+
                                           |
                    +----------------------+-----------------------+
                    |                                              |
                    v                                              v
+---------------------------------------+      +------------------------------------+
|           EXPERIMENT ENGINE           |      |          DEVOPS ADAPTER            |
|       Remediation Simulation          |      |  SafetyGate -> Human Approval      |
|   Before: 2.8s -> After: 1.68s        |      |  -> SimulationProvider /           |
|   Result: PASS (+40.0% Improvement)   |      |     KubernetesProvider             |
|                                       |      |  -> Verified Infrastructure State  |
+-------------------+-------------------+      +-------------------+----------------+
                    |                                              |
                    +----------------------+-----------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                        END-TO-END TRACEABILITY GRAPH                              |
|           Requirement -> SLO -> Metrics -> Incident -> ML -> RCA                  |
|                           -> Experiment -> DevOps Action                          |
+-----------------------------------------------------------------------------------+
```

---

## Key Components

1. **Requirements Core**: Manages requirements with metadata, priority, status, and mapped metrics.
2. **SLO Engine**: Binds requirements to measurable metric expressions and validation windows.
3. **Observability & Prometheus Exporter**: Emits Prometheus standard scrape format (`/metrics`) and live REST telemetry (`/api/metrics`).
4. **ML Violation Predictor**: Standalone microservice with trained L2-Regularized Logistic Regression model ($99.33\%$ test accuracy, $0.9999$ ROC-AUC) calculating breach probabilities and feature risk contributions.
5. **Gemini AI Root Cause Analysis**: Utilizes Google Gemini 2.5 Flash (`@google/genai`) to synthesize unstructured logs and multi-dimensional metrics into actionable findings.
6. **Remediation Experiment Engine**: Validates proposed fixes in a sandboxed simulation (queue wait reduction and replica scaling equations) to prove SLO improvement before applying changes.
7. **DevOps Adapter Layer**: Pluggable provider system (`SimulationProvider` for local testing; `KubernetesProvider` for live clusters) with `SafetyGate` validation, human authorization, and `dryRun` inspection.

# TRACEOPS PHASE 5.3 BATCH D4: POST-REPAIR TELEMETRY ASSOCIATION & STATISTICAL DRIFT GOVERNANCE SPECIFICATION

## Document Information
- **Standard**: TraceOps ML Governance Framework & Statistical Quality Assurance Protocol
- **Phase**: 5.3 Batch D4
- **Classification**: Observational / Statistical Governance Specification
- **Authoritative Status**: Active & Enforced
- **Policy Version**: `D4-DRIFT-POLICY-1.0.0`

---

## 1. Primary Objective
Phase 5.3 Batch D4 establishes an evidence-based, cryptographically audited lifecycle for associating genuine runtime telemetry with completed repairs and deployments, and detecting statistically significant changes in the production machine learning input feature distribution.

Batch D4 is strictly **observational and governance functionality only**. It provides deep empirical visibility into distribution changes without performing autonomous mutations, rollbacks, retraining, or promotions.

---

## 2. Post-Repair Telemetry Association Lifecycle
The association of runtime observations with completed repairs or deployments is managed by an explicit finite-state machine governed in `MLTelemetryAssociation`:

```text
       [ PENDING ] (Association instantiated with valid repair/deployment & window)
            │
            │ startAssociation() invoked
            ▼
      [ COLLECTING ] (Querying & extracting genuine Prometheus observations)
            │
            ├──────────────────────────────────────────────┐
            │ Sufficient genuine observations (N >= 10)    │ Insufficient observations (N < 10)
            ▼                                              ▼
       [ COMPLETE ]                                [ INSUFFICIENT_DATA ]
```

### State Definitions & Transitions
1. **PENDING**: Initial state upon validated creation. The association links a genuine repair ID (`repairId`) and deployment ID (`deploymentId`) with a strictly validated time window (`startTime` and `endTime`).
2. **COLLECTING**: The association engine queries the telemetry pipeline within the declared temporal boundary. Pre-repair observations are strictly filtered out (`startTime >= repairCompletedAt`).
3. **COMPLETE**: Terminal successful state. Reached **only** if the number of verified observations meets or exceeds the minimum sample requirement (`MIN_SAMPLE_REQUIREMENT = 10`) and all observations pass schema validation.
4. **INSUFFICIENT_DATA**: Terminal observational state. Reached when telemetry querying completes but yields fewer than 10 observations. **Under no circumstances is an undersampled window classified as `COMPLETE` or `NO_SIGNIFICANT_DRIFT`**.
5. **FAILED**: Terminal error state if telemetry query fails, unexpected database errors occur, or data quality gates are violated.

---

## 3. Telemetry Source & Provenance
All telemetry associated with repairs and deployments must originate from the genuine runtime telemetry pipeline:
- **Prometheus Service**: Live metrics monitored at `http://localhost:9090`.
- **Database Collection**: Genuine `TelemetryObservation` collection populated by production metric scrappers and SLO monitors.
- **Zero Synthetic Telemetry**: The use of `Math.random()`, synthetic distributions, mocked observations, or hardcoded metrics as production evidence is strictly forbidden. Any observation failing verification is rejected.

---

## 4. Six-Feature Production ML Schema
Every observation vector must strictly conform to the 6 production ML features established in Phase 3.3 and governed through Batches D1–D3:

| Feature Name | Type | Unit / Range | Semantic Description |
|---|---|---|---|
| `cpuUsage` | Continuous | Percentage `[0.0, 100.0]` | CPU utilization across service container instances |
| `memoryUsage` | Continuous | Percentage `[0.0, 100.0]` | Memory utilization percentage |
| `p95Latency` | Continuous | Milliseconds `[0.0, ∞)` | 95th percentile response latency |
| `errorRate` | Continuous | Ratio `[0.0, 1.0]` | Fraction of failed requests over window |
| `requestRate` | Continuous | Requests/sec `[0.0, ∞)` | Aggregated ingress request throughput |
| `deploymentChanged` | Binary | Integer `{0, 1}` | Binary flag indicating deployment/configuration change |

### Data Quality Rules for Features
- All feature values must be finite real numbers (`Number.isFinite(v) === true`).
- `NaN`, `null`, `undefined`, `+Infinity`, and `-Infinity` are rejected fail-closed.
- Missing features in an observation invalidate that observation.

---

## 5. Reference Dataset Policy
Drift evaluation compares the current post-repair telemetry distribution against an authoritative, governed reference distribution:
1. **Governed Reference Source**: Reference distributions must be backed by a validated `MLDatasetVersion` record in MongoDB (e.g., `ds-prod-2.0.0-reference-window`) and bound to the active production model's training artifact.
2. **Cryptographic Anchoring**: The reference dataset SHA-256 (`referenceDatasetSHA256`) must match the registered artifact SHA-256 (`74460AC69D6C8B507955081943620817E96C9F9631D7BA81EB30A400BD86EC49`).
3. **No Synthetic Reference Data**: Synthetic reference generators are strictly prohibited. Reference data must be authentic historical baseline telemetry.

---

## 6. Minimum Sample Requirement Policy
Statistical tests (PSI and KS) lose statistical power and yield wildly inflated or erratic values when calculated on tiny sample sizes:
- **Minimum Threshold**: `MIN_SAMPLE_REQUIREMENT = 10` samples for both reference and current distributions.
- **Enforcement**: If `referenceSampleCount < 10` or `currentSampleCount < 10`, the evaluation terminates with `overallStatus = INSUFFICIENT_DATA`.
- **Fail-Closed Distinction**: `INSUFFICIENT_DATA` is distinctly categorized. It is mathematically invalid and governance-prohibited to report `NO_SIGNIFICANT_DRIFT` when data is inadequate.

---

## 7. Population Stability Index (PSI) Methodology
PSI quantifies the shift in distribution between a reference baseline and the current observed sample across continuous features (`cpuUsage`, `memoryUsage`, `p95Latency`, `errorRate`, `requestRate`):

### Binning Strategy
- **Quantile/Equal-Width Partitioning**: The reference range $[min, max]$ is partitioned into $K = 5$ bins with a floor adjustment ($\epsilon = 1e-4$) to prevent zero-width boundaries on low-variance features.
- **Laplace Smoothing**: To prevent division by zero or undefined logarithms when a bin has zero samples, an $\epsilon = 0.0001$ smoothing constant is applied to proportion calculations:
  $$Actual\% = \frac{count_{curr} + \epsilon}{N_{curr} + K \cdot \epsilon}, \quad Expected\% = \frac{count_{ref} + \epsilon}{N_{ref} + K \cdot \epsilon}$$
- **PSI Formula**:
  $$PSI = \sum_{b=1}^{K} (Actual\%_b - Expected\%_b) \times \ln\left(\frac{Actual\%_b}{Expected\%_b}\right)$$

### Decision Thresholds (`D4-DRIFT-POLICY-1.0.0`)
- **PSI < 0.10**: `LOW` — No significant shift in the population distribution.
- **0.10 <= PSI < 0.25**: `MODERATE` — Moderate distribution change; warrants observation.
- **PSI >= 0.25**: `SIGNIFICANT` — Actionable distribution divergence.

---

## 8. Kolmogorov-Smirnov (KS) Test Methodology
The two-sample Kolmogorov-Smirnov test evaluates whether the continuous reference sample $F_{ref}(x)$ and current sample $F_{curr}(x)$ originate from the same underlying continuous distribution without assuming normality:

### Statistic Calculation
$$D = \sup_x |F_{ref}(x) - F_{curr}(x)|$$
The empirical cumulative distribution functions (ECDF) are compared across all sorted pooled values.

### Asymptotic Critical Value & p-Value
- **Critical Value at $\alpha = 0.05$**:
  $$c(\alpha) = 1.36 \times \sqrt{\frac{N_{ref} + N_{curr}}{N_{ref} \times N_{curr}}}$$
- **Asymptotic P-Value Approximation**:
  $$\lambda = \left(\sqrt{\frac{N_{ref} N_{curr}}{N_{ref} + N_{curr}}} + 0.12 + \frac{0.11}{\sqrt{\frac{N_{ref} N_{curr}}{N_{ref} + N_{curr}}}}\right) \times D$$
  $$p \approx 2 \sum_{j=1}^{100} (-1)^{j-1} e^{-2 j^2 \lambda^2}$$

### Multiple-Testing Treatment
When evaluating multiple continuous features (5 features) simultaneously, an uncorrected family-wise error rate could yield false positives. In `D4-DRIFT-POLICY-1.0.0`:
- Individual feature tests report both raw $D$ statistic and unadjusted $p$-value.
- Feature KS status is flagged `SIGNIFICANT` if $D \ge c(\alpha)$ and $p < 0.05$.
- Overall status synthesis prioritizes PSI as the primary continuous drift score, using KS as corroborating empirical evidence.

---

## 9. Binary Feature (`deploymentChanged`) Treatment
`deploymentChanged` is a discrete binary indicator ($\{0, 1\}$) representing operational state transitions. Applying a continuous distance metric (like KS test) or multi-bin quantile slicing to binary data is statistically invalid.

### Governed Binary Method
- **2-Bin Categorical Frequency Proportion**: Proportions of class 0 and class 1 are calculated directly:
  $$p_0 = \frac{\#\{x = 0\} + \epsilon}{N + 2\epsilon}, \quad p_1 = \frac{\#\{x = 1\} + \epsilon}{N + 2\epsilon}$$
- **Binary Population Stability Shift**:
  $$PSI_{binary} = (p_{0,curr} - p_{0,ref}) \ln\left(\frac{p_{0,curr}}{p_{0,ref}}\right) + (p_{1,curr} - p_{1,ref}) \ln\left(\frac{p_{1,curr}}{p_{1,ref}}\right)$$
- **KS Treatment for Binary**: For `deploymentChanged`, $D$ represents the absolute proportion difference $|p_{1,curr} - p_{1,ref}|$, marked appropriately as discrete comparison.

---

## 10. Overall Drift Status Synthesis
The overall drift evaluation status synthesizes the individual results of all six production features:

```text
       ┌────────────────────────────────────────────────────────┐
       │ Sample Count < 10 for ref or curr?                     │
       └──────────────────────────┬─────────────────────────────┘
                                  │ YES -> INSUFFICIENT_DATA
                                  ▼ NO
       ┌────────────────────────────────────────────────────────┐
       │ Any feature has PSI >= 0.25 (or KS significant & PSI)? │
       └──────────────────────────┬─────────────────────────────┘
                                  │ YES -> SIGNIFICANT_DRIFT
                                  ▼ NO
       ┌────────────────────────────────────────────────────────┐
       │ Any feature has 0.10 <= PSI < 0.25?                    │
       └──────────────────────────┬─────────────────────────────┘
                                  │ YES -> MODERATE_DRIFT
                                  ▼ NO
                     [ NO_SIGNIFICANT_DRIFT ]
```

---

## 11. Model Performance vs. Drift vs. SLO Violations
A fundamental design requirement of Batch D4 is that the system explicitly decouples three orthogonal operational concepts:
1. **Distribution Drift**: A change in the input features $(P(X))$ relative to training baseline. A model may experience distribution drift while still performing accurately.
2. **Performance Degradation**: A deterioration in the model's predictive precision, recall, or error rate $(P(Y|X))$.
3. **SLO Violation**: A failure of the runtime service to meet configured business objectives (e.g., latency > 500ms). A service can violate an SLO due to infrastructure failures completely independent of ML input drift.

**Governance Mandate**: D4 records and reports distribution drift without asserting speculative causality regarding performance or SLOs.

---

## 12. Security & Prometheus Query Safety
1. **Zero PromQL Injection**: User-submitted or arbitrary PromQL queries are strictly forbidden. All Prometheus queries are synthesized internally using safe parameterized templates (`service`, `runtimeResource`, `timeWindow`).
2. **Zero Filesystem Path Traversal**: Reference datasets and model artifacts are resolved strictly through canonical project boundaries.
3. **Role-Based Access Control (RBAC)**:
   - Creation of associations and drift evaluations requires `ADMIN` authorization.
   - Read-only viewing of associations and drift evaluations is permitted for authenticated `USER` and `ADMIN` roles.
   - Unauthenticated requests return `HTTP 401 Unauthorized`.

---

## 13. Audit Trail Integration & Cryptographic Chaining
Every association and drift lifecycle milestone is written to the cryptographic `DeploymentAuditEvent` ledger:

### Registered Event Types
- `TELEMETRY_ASSOCIATION_CREATED`
- `TELEMETRY_ASSOCIATION_STARTED`
- `TELEMETRY_ASSOCIATION_COMPLETED`
- `TELEMETRY_ASSOCIATION_FAILED`
- `DRIFT_EVALUATION_STARTED`
- `DRIFT_EVALUATION_COMPLETED`
- `DRIFT_DETECTED`
- `DRIFT_EVALUATION_INSUFFICIENT_DATA`
- `DRIFT_EVALUATION_FAILED`

### Cryptographic Chaining Properties
- Every audit record includes `parentHash`, `eventHash`, `nonce`, and canonical payload.
- Anchored to the verified genesis block (`0000000000000000000000000000000000000000000000000000000000000000`).
- Hash verification and tamper detection are fully integrated.

---

## 14. Immutability & Forensic Integrity
Once an `MLDriftEvaluation` reaches a terminal status (`COMPLETE`, `NO_SIGNIFICANT_DRIFT`, `MODERATE_DRIFT`, `SIGNIFICANT_DRIFT`, `INSUFFICIENT_DATA`, `FAILED`):
- `isImmutable` is set to `true`.
- MongoDB pre-save hooks intercept and reject any attempted mutation or update (`Error: Cannot update immutable drift evaluation record`).
- New evaluations require a distinct `driftEvaluationId`. Historical governance records cannot be retroactively altered.

---

## 15. Operational Safety & Non-Goals
Batch D4 is strictly observational:
- Drift detection **NEVER** automatically promotes a candidate model.
- Drift detection **NEVER** automatically rolls back the production model.
- Drift detection **NEVER** automatically initiates model retraining.
- Drift detection **NEVER** alters production decision thresholds.
- Drift detection **NEVER** modifies Prometheus metrics or configurations.

All downstream remediations remain deferred to Phase 5.3 Batch D5 (Full E2E Integration) and human-in-the-loop governance.

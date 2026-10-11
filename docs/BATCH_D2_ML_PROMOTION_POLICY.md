# TRACEOPS PHASE 5.3 BATCH D2 — ML PROMOTION POLICY SPECIFICATION
## Machine Learning Promotion Policy Engine, Safety Gates & Atomic Hot-Swap Semantics

**Document Version:** 1.0.0  
**Effective Policy Version:** `1.0.0`  
**Governing Standard:** TraceOps ML Safety & Deployment Governance Architecture  
**Document Status:** RATIFIED SPECIFICATION  
**Author:** TraceOps Forensic ML Engineering & Architecture Governance Agent  

---

## 1. Promotion Objective

The primary objective of the ML Promotion Policy Engine is to transform the cryptographic ML governance foundation established in Batch D1 into a deterministic, fail-closed, multi-gate promotion mechanism. Machine learning models governing production SLO violation classification directly influence incident detection, automated RCA, and automated closed-loop code repair workflows. Consequently, promoting an ML candidate model must adhere to the highest standard of verification:

1. **Zero Degraded Deployments:** An ML model candidate may only assume active serving responsibility if it demonstrably satisfies absolute performance thresholds across all supervised classification metrics.
2. **Zero Protected Metric Regressions:** An ML model candidate may never sacrifice recall or accuracy on critical SLO violation categories in pursuit of marginal gains elsewhere.
3. **Provable Provenance & Integrity:** No candidate trained on synthetic data, contaminated chronological splits, or possessing unverified weights/hyperparameters may enter evaluation.
4. **Enforced Human Accountability:** Autonomous or unauthenticated promotion is strictly forbidden. A model candidate requires dual-key cryptographic validation and authorized human administrative sign-off before entering cutover.
5. **Atomic Serving Cutover:** Model transitions in production runtime must be atomic, non-destructive, and leak-free. In-flight requests must never encounter inconsistent or intermediate model weights.

---

## 2. Protected Production Principle

The foundation of TraceOps ML governance is the **Protected Production Principle**:

> **The baseline production model artifact (`data/trained_model.json`) is cryptographically immutable and physically protected. It shall NEVER be overwritten, truncated, or mutated in-place on disk during evaluation, promotion, or testing.**

### Guarantees:
- **Baseline Preservation:** The production model `2.0.0-production-telemetry` (SHA-256: `74460AC69D6C8B507955081943620817E96C9F9631D7BA81EB30A400BD86EC49`) remains permanently intact at `data/trained_model.json`.
- **Candidate Preservation:** Candidate model artifacts (e.g. `ml-service/data/candidate_model_3.1.0.json`, SHA-256: `06240DB6F6FB75EAD3F269301574A7A15AA5EFE4C5F2B82C1D0651A5090CAE9A`) remain physically intact in their canonical locations.
- **Pointer-Based Serving Cutover:** Active production serving identity is governed via the dynamic model registry and persisted to a non-destructive runtime pointer (`data/active_model.json`). Promotion updates the pointer atomically via temporary write and atomic rename (`fs.renameSync`).
- **Fail-Closed Fallback:** In the absence of an active model pointer or upon any corrupt pointer state, the serving engine deterministically falls back to baseline model `2.0.0-production-telemetry`.

---

## 3. Promotion Lifecycle State Machine

The ML model lifecycle follows a strict, deterministic, one-way state progression:

```text
       ┌──────────────┐
       │  CANDIDATE   │ (Registered in D1)
       └──────┬───────┘
              │ [Policy Evaluation Triggered]
              ▼
       ┌──────────────┐
       │  EVALUATING  │ (Artifact, Dataset, Metric gates running)
       └──────┬───────┘
              │
       ┌──────┴─────────────────────────────────┐
       │ (Any Gate Fails)                       │ (All Automated Gates Pass)
       ▼                                        ▼
┌──────────────┐                         ┌──────────────┐
│   INVALID    │                         │  VALIDATED   │
└──────────────┘                         └──────┬───────┘
                                                │ [Admin Submits Approval Request]
                                                ▼
                                         ┌────────────────────┐
                                         │  PENDING_APPROVAL  │
                                         └──────┬─────────────┘
                                                │
                         ┌──────────────────────┴──────────────────────┐
                         │ (Admin Rejects)                             │ (Admin Approves)
                         ▼                                             ▼
                  ┌──────────────┐                              ┌──────────────┐
                  │   REJECTED   │                              │   APPROVED   │
                  └──────────────┘                              └──────┬───────┘
                                                                       │ [Promote Command Executed]
                                                                       ▼
                                                                ┌──────────────┐
                                                                │  PROMOTING   │
                                                                └──────┬───────┘
                                                                       │
                                                ┌──────────────────────┴──────────────────────┐
                                                │ (Cutover Fails)                             │ (Cutover Succeeds)
                                                ▼                                             ▼
                                         ┌────────────────────┐                        ┌──────────────┐
                                         │  PROMOTION_FAILED  │                        │  PRODUCTION  │
                                         └────────────────────┘                        └──────────────┘
```

### Transition Invariants:
1. State skipping is prohibited (e.g., `CANDIDATE` cannot jump directly to `APPROVED` or `PRODUCTION`).
2. Mutating state via arbitrary REST update is prohibited. All state transitions must occur through `MLPromotionPolicyService` or `MLModelPromotionService`.
3. Predecessor production model transitions to `servingStatus: RETIRED` upon successful promotion, retaining historical audit links.

---

## 4. Policy Version

The active promotion policy version is:

```json
{
  "policyVersion": "1.0.0",
  "ratifiedDate": "2026-10-07T00:00:00.000Z",
  "status": "RATIFIED_ACTIVE"
}
```

Any modification to gate thresholds, required metrics, or non-regression limits requires a policy version bump (e.g., `1.1.0` or `2.0.0`), re-evaluation, and new human administrative approval.

---

## 5. Numerical Gates (Candidate Quality Gate — GATE-04)

Promotion policy 1.0.0 establishes the following minimum absolute performance gates on the held-out **TEST** split:

| Metric | Minimum Absolute Threshold | Candidate 3.1.0 Observed | Status | Rationale |
|---|---|---|---|---|
| **Recall** | $\ge 0.80$ | `1.0000` | **PASS** | Prevents false negatives where critical SLO breaches escape incident response. |
| **F1 Score** | $\ge 0.75$ | `1.0000` | **PASS** | Ensures balanced harmonic mean of precision and recall on skewed incident distributions. |
| **Precision** | $\ge 0.70$ | `1.0000` | **PASS** | Prevents alert fatigue caused by false positive SLO alerts. |
| **ROC-AUC** | $\ge 0.85$ | `1.0000` | **PASS** | Confirms strong rank-order discrimination capacity across confidence thresholds. |
| **Log Loss (Cross-Entropy)** | $\le 0.60$ | `0.2927` | **PASS** | Penalizes overconfident incorrect predictions. |
| **Brier Score** | $\le 0.15$ | `0.0746` | **PASS** | Measures mean squared probability error; guarantees calibrated risk estimates. |
| **Accuracy** | $\ge 0.80$ | `1.0000` | **PASS** | Minimum overall predictive concordance. |

---

## 6. Non-Regression Rules (Production Non-Regression Gate — GATE-05)

To prevent regression where an updated model outperforms on secondary metrics while degrading critical capabilities, Policy 1.0.0 defines strict allowable deltas relative to baseline production model `2.0.0-production-telemetry`:

$$\Delta_{\text{metric}} = \text{Metric}_{\text{candidate}} - \text{Metric}_{\text{production}}$$

| Metric | Maximum Permitted Regression ($\Delta$) | Production 2.0.0 | Candidate 3.1.0 | Observed $\Delta$ | Gate Verdict |
|---|---|---|---|---|---|
| **Recall** | $\Delta \ge 0.00$ (Zero regression permitted) | `0.0625` | `1.0000` | $+0.9375$ | **PASS** |
| **Precision** | $\Delta \ge -0.05$ (Max 5% drop allowed) | `1.0000` | `1.0000` | $0.0000$ | **PASS** |
| **F1 Score** | $\Delta \ge 0.00$ (Zero regression permitted) | `0.1176` | `1.0000` | $+0.8824$ | **PASS** |
| **ROC-AUC** | $\Delta \ge -0.02$ (Max 2% drop allowed) | `1.0000` | `1.0000` | $0.0000$ | **PASS** |
| **Accuracy** | $\Delta \ge -0.02$ (Max 2% drop allowed) | `0.8819` | `1.0000` | $+0.1181$ | **PASS** |

Candidate 3.1.0 dramatically resolves the severe under-recall of production 2.0.0 ($0.0625 \to 1.0000$) without suffering any degradation on precision, ROC-AUC, or accuracy.

---

## 7. Calibration Requirements (Calibration Gate — GATE-06)

Probabilistic classifiers in autonomous systems must be well-calibrated to support thresholded actions (e.g. automated repair triggering):

1. **Threshold Anchoring:** Candidate classification threshold must be explicitly recorded in model metadata (`classificationThreshold`).
2. **Threshold Plausibility:** Must satisfy $0.10 \le \theta \le 0.90$. Candidate 3.1.0 utilizes $\theta = 0.50$.
3. **Brier Calibration Bound:** Brier score on the test split must not exceed $0.15$. Candidate 3.1.0 achieved $0.0746$.
4. **Threshold Mutability Prohibited:** The candidate threshold cannot be altered post-evaluation or during promotion. Any threshold modification invalidates all prior evaluation and approval records.

---

## 8. Approval Requirements (Approval Validity Gate — GATE-07)

Model promotion requires formal, authorized human administrative review:

1. **Role Requirement:** Only authenticated users with role `ADMIN` may create or verify approvals.
2. **Decision Status:** Approval document must exist in database with `decision: 'APPROVED'`.
3. **Model & Evaluation Linkage:** Approval must explicitly link to `modelId` and verified `evaluationId`.
4. **Artifact Hash Binding:** Approval payload must contain `artifactSHA256`. The policy verifies that:
   $$\text{Approval.artifactSHA256} == \text{Candidate.artifactSHA256} == \text{SHA256}(\text{candidate\_file})$$
5. **Freshness & Revocation:** Approvals marked `REJECTED`, superseded by candidate file mutations, or lacking cryptographic linkage fail closed immediately.

---

## 9. Artifact Integrity (GATE-01)

Before evaluation or promotion, the physical artifact is verified:

1. **Canonical Path:** Must reside within the canonical repository structure (`data/` or `ml-service/data/models/`). Path traversal (`../`, absolute external paths) is strictly blocked.
2. **SHA-256 Digest Verification:** Actual file content on disk is hashed with SHA-256 and matched against the registered database digest.
3. **Feature Schema Adherence:** Must adhere strictly to the 6-feature schema:
   `["cpu_usage", "memory_usage", "error_rate", "response_time", "network_io", "disk_io"]`.
4. **Numerical Sanity:** Weights, biases, scaling means, and variances must be finite numbers (`Number.isFinite()`). `NaN`, `+Infinity`, `-Infinity`, and non-numeric values are rejected.
5. **Version Match:** Model artifact JSON version must match the registered `modelVersion`.

---

## 10. Dataset Provenance (GATE-02)

Training datasets are subject to rigorous forensic checks:

1. **Genuine Telemetry Only:** `sourceCollection` must be genuine runtime telemetry (`service_metrics`, `container_metrics`).
2. **Zero Synthetic Contamination:** `syntheticContaminationAllowed: false` and `syntheticSampleCount: 0`.
3. **Zero Incident Contamination:** `historicalIncidentContaminationAllowed: false` and `historicalIncidentSampleCount: 0`.
4. **Temporal Diversity:** Dataset must span at least 3 distinct calendar days and a minimum of 72 hours.
5. **Chronological Splitting:** `chronologicalSplitLeakageVerified: true`. Test split must strictly succeed Validation split, which must strictly succeed Train split temporally.
6. **Integrity Hash:** Dataset JSON digest must match `datasetSHA256`.

---

## 11. Concurrency & Mutual Exclusion (GATE-08)

Model promotion is protected against race conditions and concurrent modifications:

1. **Deployment Lock Service Integration:** Promotion acquires an exclusive lock via `DeploymentLockService` with lock ID `ML-PROMOTION-LOCK-<modelId>`.
2. **Mutual Exclusion:** If another promotion, canary deployment, or rollback holds an active lock on the service or model, promotion attempts immediately fail closed (`409 Conflict` or gate failure).
3. **Self-Lock Resolution:** When promotion policy evaluation is invoked within the promotion cutover workflow, the caller's active lock ID is supplied (`currentOperationId`), permitting atomic validation without deadlocking against its own lease.
4. **Lock Auto-Release:** Lock is released cleanly in a `finally` block regardless of cutover success or failure.

---

## 12. Atomic Hot-Swap Semantics

Model cutover in the serving engine is performed atomically and non-destructively:

1. **Phase 1: Validation:** Pre-cutover validation executes all 8 gates with the acquired lock.
2. **Phase 2: State Transition:** Candidate status transitions to `PROMOTING`.
3. **Phase 3: Dual-Mode Serving Cutover:**
   - **In-Memory Registry:** Host `SLOViolationClassifier` updates active model pointer in memory (`setActiveProductionModel(modelId, version, sha, weights)`).
   - **Non-Destructive Disk Pointer:** Writes new active metadata to temporary file `data/active_model.json.tmp` and executes atomic POSIX/Windows rename to `data/active_model.json`.
   - **Microservice Container Notification:** Internal dispatch to ML microservice (`POST /internal/hot-swap`).
4. **Phase 4: Serving Verification:** The active serving engine is polled to confirm that `getActiveModelVersion()` equals the promoted candidate version.
5. **Phase 5: State Finalization:** Candidate status transitions to `PRODUCTION` and `servingStatus: ACTIVE_PRODUCTION`. Predecessor model is linked (`predecessorModelId`, `predecessorVersion`) and transitioned to `servingStatus: RETIRED`.
6. **Phase 6: Audit Record:** Cryptographic `MODEL_PROMOTED` event is appended to the audit chain.

---

## 13. Audit Events

Model promotion lifecycle events extend the Phase 5.3 Batch C1 cryptographic hash chain:

```text
Genesis (64 zeroes)
       │
       ▼
[MODEL_PROMOTION_VALIDATION_STARTED] (seq: N)
       │
       ▼
[MODEL_PROMOTION_GATE_PASSED] (seq: N+1)
       │
       ▼
[MODEL_PROMOTION_APPROVED] (seq: N+2)
       │
       ▼
[MODEL_PROMOTION_STARTED] (seq: N+3)
       │
       ▼
[MODEL_PROMOTED] (seq: N+4)
```

Each event payload canonically records:
- `action`: Specific promotion lifecycle action.
- `modelId`: Identifier of the candidate model.
- `modelVersion`: Version string of candidate model.
- `artifactSHA256`: SHA-256 digest of candidate model artifact.
- `predecessorModelId`: Identifier of retired predecessor model.
- `predecessorVersion`: Version of retired predecessor model.
- `predecessorArtifactSHA256`: SHA-256 digest of predecessor artifact.
- `promotionPolicyVersion`: Active policy version (`1.0.0`).
- `parentEventHash`: SHA-256 digest of the immediately preceding audit event.
- `eventHash`: Canonical JSON SHA-256 digest of current event.

---

## 14. Failure Behavior & Rollback Safeguards

If any gate, permission check, or filesystem operation encounters an error during promotion:
1. **Immediate Abort:** Workflow terminates immediately; candidate transitions to `PROMOTION_FAILED`.
2. **Production Undisturbed:** Serving engine remains locked to predecessor model. No intermediate or unverified model is ever served.
3. **Pointer Unchanged:** Active model pointer on disk is not updated (or deleted).
4. **Cryptographic Event:** `MODEL_PROMOTION_FAILED` event is appended to the audit chain recording failure reasons.
5. **Lock Released:** Distributed deployment lock is released immediately.

---

## 15. Security Invariants

1. **Role-Based Access Control:** Only users with `role: 'ADMIN'` may call `POST /api/ml/governance/models/:modelId/promote`. Standard users receive `403 Forbidden`. Unauthenticated requests receive `401 Unauthorized`.
2. **Prohibited Endpoints:**
   - `POST /api/ml/promote` $\to$ `404 Not Found`
   - `POST /api/ml/governance/promote` $\to$ `404 Not Found`
   - `POST /api/ml/rollback` $\to$ `404 Not Found`
3. **No Arbitrary Code Execution:** Artifacts are strictly parsed as JSON coefficient files; zero execution of Python pickles, shell scripts, or external libraries.
4. **No Secret Leakage:** Audit events and log payloads strictly omit API keys, environment credentials, or raw model weights.

---

## 16. Batch D2 Non-Goals

The following capabilities are explicitly excluded from Batch D2:
- Model rollback / automated predecessor rollback (deferred to Batch D3).
- Autonomous / bot-initiated model promotion without human review.
- Automatic retraining triggers or candidate generation (deferred to Batch D4).
- Drift-triggered re-evaluation or drift detection algorithms (deferred to Batch D4).
- Post-repair telemetry association (deferred to Batch D4).
- Modification of existing production model artifact `data/trained_model.json`.

---

## 17. Batch D3 / D4 Deferred Capabilities

| Roadmap Milestone | Scope & Capabilities |
|---|---|
| **Batch D3** | Model Rollback Engine, Predecessor Restoration, Emergency Downgrade Gating, and Versioned State Reversal. |
| **Batch D4** | Post-Repair Telemetry Association, Production Data Drift Detection, Performance Degradation Detection, and Drift Alerting. |
| **Batch D5** | Full End-to-End Governance Verification, Multi-Model Promotion/Rollback Scenarios, and Complete Security Auditing. |

---
*Signed and ratified by TraceOps ML Governance Architecture Authority on 2026-10-07.*

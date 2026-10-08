# Batch D5 — Final ML Governance End-to-End Integration Specification

## 1. Executive Summary & Objective

**Phase 5.3 Batch D5** establishes the end-to-end integration and forensic verification of the complete Machine Learning (ML) Governance lifecycle for the TraceOps AI DevOps Platform. Batch D5 does not introduce new model architectures, training algorithms, or speculative automation. Instead, it serves as the definitive verification contract proving that all governance subsystems—spanning dataset provenance, offline model candidate evaluation, multi-gate promotion policies, cryptographic human approval, atomic serving hot-swap, runtime prediction serving, post-repair telemetry association, statistical model/data drift detection, controlled predecessor rollback, and immutable cryptographic audit logging—function as a unified, fail-closed lifecycle without weakening any safety boundary.

---

## 2. End-to-End Lifecycle State Architecture

The complete ML governance lifecycle enforces the following state transitions:

```text
                       REAL RUNTIME TELEMETRY
                                  ↓
                        DATASET PROVENANCE
                                  ↓
                          MODEL CANDIDATE
                                  ↓
                          MODEL EVALUATION
                                  ↓
                        GOVERNANCE VALIDATION
                                  ↓
                            ADMIN APPROVAL
                                  ↓
                         CONTROLLED PROMOTION
                                  ↓
                        ATOMIC MODEL HOT-SWAP
                                  ↓
                             LIVE SERVING
                                  ↓
                        POST-REPAIR TELEMETRY
                                  ↓
                           DRIFT EVALUATION
                                  ↓
                         CONTROLLED ROLLBACK
                                  ↓
                        PREDECESSOR RESTORATION
                                  ↓
                         CRYPTOGRAPHIC AUDIT
```

### Discrete Subsystem Lifecycle States

| Subsystem | Verified Lifecycle Transition | Authority & Invariants |
| :--- | :--- | :--- |
| **Model Registration (D1)** | `UNREGISTERED` → `CANDIDATE` → `CANDIDATE_ONLY` | Passive JSON schema validation, safe path traversal restriction, SHA-256 fingerprinting. |
| **Dataset Provenance (D1)** | `RAW_OBSERVATIONS` → `CHRONOLOGICAL_SPLIT` → `GOVERNED_DATASET` | Genuine runtime telemetry only, zero synthetic contamination, zero chronological leakage, 3+ day span. |
| **Candidate Evaluation (D1)** | `EVALUATING` → `TRAIN / VAL / TEST` → `VALIDATED` | Full metric completeness across 5 protected metrics, discrete TEST split verification. |
| **Promotion Policy Engine (D2)**| `VALIDATED` → `8 SAFETY GATES` → `PENDING_APPROVAL` | Deterministic evaluation of Gates 01 through 08. Fail-closed on missing metric or tampered artifact. |
| **Human Administrative Sign-Off (D2)** | `PENDING_APPROVAL` → `APPROVED` | Requires authenticated `ADMIN` role. Cryptographically bound to candidate artifact SHA-256 digest. Non-admins receive HTTP 403. |
| **Controlled Promotion (D2)** | `APPROVED` → `PROMOTING` → `PRODUCTION` / `LIVE_SERVING` | Mutual exclusion concurrency lock, in-memory authoritative classifier hot-swap, pointer update on disk. Predecessor retired to `VALIDATED` / `OFFLINE`. |
| **Live Runtime Serving (D2/D3)** | `POST /api/ml/predict` | Authoritative in-memory model executes 6-feature prediction. Dynamic response contract explicitly exposes active `modelVersion`. |
| **Post-Repair Association (D4)** | `DEPLOYMENT_COMPLETED` → `WINDOW_VALIDATION` → `COMPLETE` | Genuine post-deployment Prometheus metrics window (`[startTime, endTime]`), strictly non-future, non-synthetic, schema-verified. |
| **Drift Evaluation (D4)** | `TELEMETRY_ASSOCIATED` → `PSI_KS_ANALYSIS` → `DRIFT_RECORD` | Statistical Population Stability Index (PSI) and Kolmogorov-Smirnov (KS) tests. Observational governance signal only. Zero autonomous mutations. |
| **Predecessor Rollback (D3)** | `PRODUCTION` → `ROLLBACK_VALIDATING` → `ROLLED_BACK` | Mutual exclusion lock, target SHA verification, restoration of predecessor to `PRODUCTION` / `LIVE_SERVING`, previous active transitioned to `ROLLED_BACK` / `OFFLINE`. |
| **Cryptographic Audit Log (C1–D5)** | `APPEND_EVENT` → `PARENT_HASH_LINKAGE` → `CHAIN_VERIFIED` | SHA-256 chaining back to 64-zero genesis hash. Deterministic canonical serialization. Zero mutation tolerance. |

---

## 3. Strict Safety & Non-Negotiable Boundaries

Under no circumstances does Batch D5 allow:

1. **Autonomous Model Promotion**: Promotion requires explicit human administrative sign-off (`POST /approval`) followed by an authenticated admin promotion cutover.
2. **Autonomous Model Rollback**: Rollback cannot be triggered automatically by alerts or drift signals; it requires explicit admin invocation with documented operational rationale.
3. **Autonomous Retraining**: Drift or degradation signals do not spawn background training routines or modify hyperparameters.
4. **Synthetic Production Telemetry**: All production datasets and runtime telemetry associations use genuine Prometheus observations. Synthetic data generation is strictly restricted to isolated mathematical tests.
5. **Physical Artifact Mutation**: The model files (`data/trained_model.json` and `ml-service/data/candidate_model_3.1.0.json`) must remain 100% byte-identical throughout every promotion, serving, drift, and rollback stage.
6. **Host Process / Code Execution**: Model artifacts are strictly parsed as passive JSON data structures (`SLOViolationClassifier`). Dynamic code execution (`eval`, `exec`, Python unpickling) is forbidden.

---

## 4. Multi-Batch Contract Interfaces

### D1 → D2 Integration Contract
- **Input**: `MLModelRegistry` document (`modelId`, `modelVersion`, `artifactPath`, `artifactSHA256`, `evaluationId`, `datasetId`).
- **Policy Contract**: `MLPromotionPolicyService.evaluateCandidate(candidateDoc)` inspects D1 evaluation splits and D1 dataset provenance. All 8 safety gates must return `PASS`.
- **Pre-Condition**: Candidate cannot be promoted until Gate 07 (Approval Validity) transitions from `NOT_READY` to `PASS` via an explicit `APPROVED` record in `MLModelApproval`.

### D2 → Live Serving Integration Contract
- **Execution**: `MLModelPromotionService.promoteModel(modelId, actor)`:
  1. Acquires `ml-model-promotion` concurrency lease.
  2. Hot-swaps in-memory `SLOViolationClassifier` to candidate weights.
  3. Writes atomic JSON pointer to `data/active_model.json`.
  4. Verifies in-memory `getActiveModelVersion()` matches candidate identity.
  5. Transitions database registry statuses atomically.
- **Verification**: `POST /api/ml/predict` returns `{ modelVersion: candidateVersion }`.

### Live Serving → D4 Telemetry Association Contract
- **Input**: Active service deployment ID (`deploymentId`) and associated code repair ID (`repairId`).
- **Telemetry Query**: Scrapes genuine runtime `PrometheusMetric` observations across a bounded historical window `[startTime, endTime]`.
- **Quality Gate**: Window must follow deployment, must not lie in the future, must contain ≥ 10 valid observation vectors across all 6 production features.
- **Output**: Persisted `MLTelemetryAssociation` document with status `COMPLETE` or `INSUFFICIENT_DATA`.

### D4 → Drift Evaluation Contract
- **Input**: Completed `associationId`.
- **Reference**: Governed baseline dataset (`DATASET-REAL-RUNTIME-v1`).
- **Methodology**:
  - Continuous features: 10-bin quantile Population Stability Index (PSI) with Laplace smoothing + Two-sample Kolmogorov-Smirnov (KS) test at $\alpha = 0.05$.
  - Binary feature (`deploymentChanged`): Discrete category proportion stability index.
- **Rule**: If observation count < 10, evaluation status must strictly fail closed to `INSUFFICIENT_DATA`. `INSUFFICIENT_DATA` cannot be classified as `NO_SIGNIFICANT_DRIFT`.

### D4 → D3 Rollback Independence Contract
- **Safety Invariant**: When drift status escalates to `SIGNIFICANT_DRIFT`, the system emits audit events and telemetry flags, but strictly maintains the currently active model in `LIVE_SERVING`. Drift does not trigger autonomous rollback or serving pointer mutation.
- **Human Action**: An authorized administrator may inspect drift findings and execute controlled predecessor rollback (`POST /api/ml/governance/models/:modelId/rollback`).

### D3 → Final Serving Contract
- **Restoration**: Predecessor model 2.0.0 is verified against its baseline SHA-256 digest, loaded into the in-memory classifier, and updated in `data/active_model.json`.
- **Retirement**: Candidate 3.1.0 is transitioned to `ROLLED_BACK` / `OFFLINE`.
- **Serving Verification**: `POST /api/ml/predict` confirms active inference identity is restored to `2.0.0-production-telemetry`.

---

## 5. Cryptographic Forensics & Tamper Evident Auditing

Every state transition across D1 through D5 is logged to `deployment_audit_events`:
- **Genesis Hash**: The initial event in the model chain links to the 64-zero genesis digest (`0000000000000000000000000000000000000000000000000000000000000000`).
- **Deterministic Chaining**: Every subsequent event calculates:
  $$\text{eventHash} = \text{SHA-256}(\text{parentEventHash} + \text{":"} + \text{canonicalJson}(\text{payload}))$$
- **Sequence Continuity**: Every event increments `sequenceNumber` strictly by +1.
- **Verification API**: `DeploymentAuditService.verifyModelChain(modelId)` re-derives the full chain in sequential order. Any payload tampering, parent hash mismatch, or sequence gap causes verification to fail closed (`valid === false`) and reports `firstInvalidEventId`.

---

## 6. Concurrency & Role-Based Authorization

1. **Concurrency Leases**: All promotion and rollback mutations acquire an exclusive lease on service `"ml-model-promotion"` via `DeploymentLockService`. Concurrent mutation attempts are deterministically rejected with `HTTP 409 Conflict`.
2. **Role Boundaries**:
   - `ANONYMOUS`: Cannot access protected governance endpoints (HTTP 401).
   - `USER`: Permitted read-only queries (HTTP 200). Blocked from approval, promotion, rollback, and telemetry association (HTTP 403 Forbidden).
   - `ADMIN`: Permitted to execute approvals, promotions, telemetry associations, drift evaluations, and rollbacks.

---

## 7. Final Baseline Identities

At the conclusion of the verified governance lifecycle:

```text
Active Production Model:
  ID: mdl-prod-2.0.0
  Version: 2.0.0-production-telemetry
  Status: PRODUCTION
  Serving Status: LIVE_SERVING
  Artifact Path: data/trained_model.json
  Artifact SHA-256: 74460AC69D6C8B507955081943620817E96C9F9631D7BA81EB30A400BD86EC49

Rolled-Back Candidate Model:
  ID: mdl-cand-3.1.0
  Version: 3.1.0-real-runtime-training
  Status: ROLLED_BACK
  Serving Status: OFFLINE
  Artifact Path: ml-service/data/candidate_model_3.1.0.json
  Artifact SHA-256: 06240DB6F6FB75EAD3F269301574A7A15AA5EFE4C5F2B82C1D0651A5090CAE9A
```

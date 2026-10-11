# TRACEOPS ML MODEL GOVERNANCE SPECIFICATION
## Phase 5.3 Batch D: Enterprise ML Model Governance, Provenance & Safe Lifecycle Management

**Status:** RATIFIED & ACTIVE (Batch D1 Implemented)  
**Document Version:** 1.0.0  
**Baseline SHA:** `39e8f55d9a354194f20dd68445d5f3cb94afd317`  
**Security Level:** High / Regulated DevOps Autonomous Self-Healing  

---

## 1. Purpose

The purpose of TraceOps ML Model Governance is to establish a tamper-proof, auditable, and mathematically verified framework for machine learning models that predict runtime SLO violations and drive autonomous repair decisions. 

In an autonomous self-healing platform, an unverified or silently promoted ML model poses critical reliability and safety risks. This specification ensures that:
- Production models remain protected against unverified replacements.
- No model candidate is promoted merely because an artifact exists or training completed.
- Every model is rooted in reproducible telemetry provenance from authentic production traffic.
- Every lifecycle decision is cryptographically chained and human-authorized before entering production.
- Model predictions serve strictly as advisory signals that never override Prometheus SLO and canary safety gates.

---

## 2. Scope

This specification governs all predictive models, training datasets, offline/online evaluations, approval workflows, artifact storage, and runtime serving transitions within the TraceOps platform.

Specifically covered:
- **Model Registry:** Immutable metadata, cryptographic artifact verification, and lifecycle states.
- **Dataset Provenance:** Exact source telemetry references, temporal span, calendar coverage, and leak-prevention boundaries.
- **Evaluation Standards:** Standardized multi-split metrics (accuracy, precision, recall, F1, ROC-AUC, Brier score, log loss, calibration).
- **Human Approval Gate:** Mandatory administrative review and sign-off before candidate promotion.
- **Audit Logging:** Integration with the Batch C1 cryptographic hash chain (`DeploymentAuditEvent`).
- **Path Containment & Integrity:** Elimination of arbitrary filesystem access and tampering.

---

## 3. D1–D5 Boundaries

To ensure strict change control, Batch D is partitioned into five distinct, sequential phases:

| Batch | Title | Scope & Boundaries | Current Status |
|---|---|---|---|
| **D1** | **Specification, Governance Schemas & Cryptographic Audit Foundation** | Data models, artifact integrity validator, audit chain extension, governance REST APIs, test suite. **NON-GOALS:** No model promotion, no hot-swap, no rollback, no drift monitoring. | **VERIFIED (Current)** |
| **D2** | **Formal Model Promotion Policy & Human-Gated Promotion Engine** | Multi-gate evaluation threshold validation, automated canary shadowing, atomic model promotion engine, serving cutover. | Planned / Next Phase |
| **D3** | **Deterministic Model Rollback & Predecessor Recovery** | Automated/manual rollback to proven predecessor model, rollback state machine, Prometheus post-rollback verification. | Future Phase |
| **D4** | **Runtime Data Drift, Concept Drift & Post-Repair Telemetry Association** | Kolmogorov-Smirnov / PSI drift monitoring, feature distribution shifts, post-repair telemetry labeling loop. | Future Phase |
| **D5** | **Autonomous Model Retraining Loop & End-to-End Governance Audit** | Closed-loop scheduled retraining trigger, dataset version progression, end-to-end multi-tenant governance compliance. | Future Phase |

---

## 4. Ratified Governance Principles

Unless an explicit project requirement supersedes, the following 12 principles are inviolable:

1. **Production model remains protected:** The active serving model (`2.0.0-production-telemetry`) cannot be replaced or unseated without completing the full governance lifecycle.
2. **No automatic promotion:** Candidate models (`3.1.0-real-runtime-training`) are never promoted merely because training succeeded.
3. **Reproducible provenance:** Every candidate must be traceable to genuine database observations and incidents.
4. **Explicit evaluation gates:** Multi-split evaluation must verify precision, recall, and calibration before approval.
5. **Human approval is mandatory:** An administrator must review evaluations and explicitly approve promotion.
6. **Auditable lifecycle:** Every model action creates a tamper-evident audit record in the C1 cryptographic chain.
7. **Cryptographic artifact identity:** Model files are verified using SHA-256 before registration, evaluation, or serving.
8. **Known predecessor required for rollback:** Rollback targets must be registered, verified predecessors.
9. **Fail-closed default:** Any validation error, missing artifact, or schema mismatch blocks model progression immediately.
10. **Phase 5.1–5.3 security preservation:** Zero host process execution, strict path containment, no arbitrary code execution.
11. **Safety gates supremacy:** ML predictions can suggest repairs or warn of risk, but can never override Prometheus metrics or abort gates.
12. **Governance compliance is gating:** A candidate cannot become `PRODUCTION` without passing every governance phase.

---

## 5. Formal Model Lifecycle & State Machine

```text
    ┌──────────────┐
    │  CANDIDATE   │  (Artifact registered, SHA verified)
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │  EVALUATING  │  (Multi-split offline evaluation executing)
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐      Validation Failed
    │  VALIDATED   ├────────────────────────┐
    └──────┬───────┘                        │
           │                                │
           ▼                                ▼
    ┌──────────────────┐               ┌─────────┐
    │ PENDING_APPROVAL │               │ INVALID │
    └──────┬───────────┘               └─────────┘
           │
      ┌────┴────┐
      │         │ Admin Rejection
      │         └───────────────────────────┐
      ▼ Admin Approval                      │
    ┌──────────┐                            ▼
    │ APPROVED │                       ┌──────────┐
    └────┬─────┘                       │ REJECTED │
         │                             └──────────┘
         ▼ (D2 Execution)
    ┌──────────┐      Cutover Failure
    │PROMOTING ├────────────────────────────┐
    └────┬─────┘                            ▼
         │                         ┌──────────────────┐
         ▼ (D2 Complete)           │ PROMOTION_FAILED │
    ┌────────────┐                 └──────────────────┘
    │ PRODUCTION │
    └────────────┘
```

### Lifecycle Status Definitions

- `CANDIDATE`: The artifact exists, is parseable, matches the 6-feature schema, and is registered in the registry. Serving status is `CANDIDATE_ONLY`.
- `EVALUATING`: The model is being scored against train, validation, or test dataset splits.
- `VALIDATED`: The model has scored and recorded test split metrics meeting minimum schema completeness.
- `PENDING_APPROVAL`: Formal promotion approval has been requested with an administrative review payload.
- `APPROVED`: An authenticated administrator has reviewed evaluation metrics and authorized production deployment.
- `PROMOTING`: (Reserved for D2) Dynamic hot-swap / serving configuration cutover in progress.
- `PRODUCTION`: (Reserved for D2) Model is active in `ml-service` and serving live inference traffic.
- `REJECTED`: Promotion request was denied by human administrator with documented reason.
- `INVALID`: Model failed feature schema, coefficient check, or evaluation thresholds.
- `PROMOTION_FAILED`: (Reserved for D2) Serving cutover or runtime verification failed; state failed closed.

---

## 6. Model Registry Model (`MLModelRegistry`)

Persistent Mongoose schema tracking complete model provenance and serving readiness:

| Field | Type | Description |
|---|---|---|
| `modelId` | String (Unique) | Unique model identifier (e.g. `mdl-3.1.0-runtime`) |
| `modelVersion` | String (Indexed) | Semantic version string (e.g. `3.1.0-real-runtime-training`) |
| `modelType` | String | Model architecture (default: `LOGISTIC_REGRESSION`) |
| `artifactPath` | String | Path contained within project root |
| `artifactSHA256` | String (Indexed) | SHA-256 cryptographic digest of artifact file |
| `status` | String (Enum) | `CANDIDATE`, `EVALUATING`, `VALIDATED`, `PENDING_APPROVAL`, `APPROVED`, `PROMOTING`, `PRODUCTION`, `REJECTED`, `INVALID`, `PROMOTION_FAILED` |
| `servingStatus` | String (Enum) | `CANDIDATE_ONLY`, `SHADOW`, `CANARY`, `ACTIVE_PRODUCTION`, `RETIRED`, `ROLLED_BACK` |
| `featureSchemaVersion` | String | Must match active schema (e.g. `v2-production-telemetry`) |
| `features` | [String] | Required 6-feature array |
| `datasetVersion` | String | Version of dataset used for training |
| `datasetSHA256` | String | Cryptographic SHA-256 of training dataset |
| `trainingGitSHA` | String | Repository Git commit SHA during training |
| `trainingTimestamp` | Date | Exact training execution timestamp |
| `hyperparameters` | Object | Hyperparameter settings (`learningRate`, `epochs`, `regularization`, `batchSize`) |
| `threshold` | Number | Classification decision threshold (default: 0.50) |
| `evaluationMetrics` | Object | Summary offline test metrics |
| `calibrationMetrics` | Object | Brier score, calibration slope, calibration intercept |
| `createdBy` | String | User ID or `TraceOps Autonomous ML Engine` |
| `approvedBy` | String | Admin identifier who approved promotion |
| `approvedAt` | Date | Timestamp of human approval |
| `promotedAt` | Date | Timestamp when model was cut over to production |
| `predecessorModelId`| String | Identity of model replaced by this model |
| `rejectionReason` | String | Explanation if rejected by admin |
| `validationSummary` | String | Textual summary of validation pass |

---

## 7. Dataset Provenance Model (`MLDatasetVersion`)

Persistent Mongoose schema tracking training telemetry provenance:

| Field | Type | Description |
|---|---|---|
| `datasetId` | String (Unique) | Unique dataset version ID |
| `datasetVersion` | String (Indexed) | Semantic dataset version string |
| `datasetSHA256` | String (Indexed) | Cryptographic SHA-256 of compiled dataset rows |
| `sampleCount` | Number | Total genuine training rows |
| `healthyCount` | Number | Count of class 0 (`TelemetryObservation`) samples |
| `violationCount` | Number | Count of class 1 (`Incident`) samples |
| `featureSchemaVersion`| String | Telemetry feature schema version |
| `sourceTypes` | [String] | Source collections: `['TelemetryObservation', 'Incident']` |
| `temporalStart` | Date | Oldest telemetry sample timestamp |
| `temporalEnd` | Date | Most recent telemetry sample timestamp |
| `calendarDays` | Number | Total unique calendar days spanned (min: 3) |
| `generationTimestamp` | Date | Timestamp dataset was compiled |
| `builderVersion` | String | Version of dataset builder engine |
| `sourceGitSHA` | String | Repository Git commit SHA of dataset generation code |
| `leakageChecks` | Object | Proof of 0 intersection between Train/Val/Test |
| `historicalExclusion`| Boolean | Confirms historical seed incidents were excluded |
| `syntheticExclusion` | Boolean | Confirms synthetic generator records were excluded |
| `readinessStatus` | String (Enum) | `READY`, `INSUFFICIENT_SPAN`, `INSUFFICIENT_VOLUME`, `FAILED_LEAKAGE` |

---

## 8. Evaluation Record Model (`MLModelEvaluation`)

Persistent record of model evaluation runs across dataset splits:

| Field | Type | Description |
|---|---|---|
| `evaluationId` | String (Unique) | Unique evaluation ID (e.g. `eval-20261006-001`) |
| `modelId` | String (Indexed) | Foreign key referencing `MLModelRegistry.modelId` |
| `datasetId` | String (Indexed) | Foreign key referencing `MLDatasetVersion.datasetId` |
| `split` | String (Enum) | `TRAIN`, `VALIDATION`, `TEST` |
| `sampleCount` | Number | Samples in this evaluation split |
| `accuracy` | Number | Overall accuracy (0.00 – 1.00) |
| `precision` | Number | Positive class precision (0.00 – 1.00) |
| `recall` | Number | Positive class recall (0.00 – 1.00) |
| `f1` | Number | Harmonic mean of precision and recall |
| `rocAuc` | Number | Area under the ROC curve |
| `prAuc` | Number | Area under Precision-Recall curve |
| `logLoss` | Number | Cross-entropy loss |
| `brierScore` | Number | Mean squared probability error (calibration) |
| `confusionMatrix` | Object | `{ tp, fp, tn, fn }` counts |
| `threshold` | Number | Probability cutoff used for evaluation |
| `calibration` | Object | Calibration binning and reliability data |
| `evaluatorVersion` | String | Evaluation runner version |
| `resultStatus` | String (Enum) | `PASSED`, `FAILED`, `WARNING` |

---

## 9. Model Approval Record Model (`MLModelApproval`)

Persistent record of human administrative decision:

| Field | Type | Description |
|---|---|---|
| `approvalId` | String (Unique) | Unique approval decision ID |
| `modelId` | String (Indexed) | Foreign key to `MLModelRegistry.modelId` |
| `requestedBy` | String | User or system requesting promotion |
| `reviewedBy` | String | Authenticated administrator performing review |
| `decision` | String (Enum) | `PENDING`, `APPROVED`, `REJECTED` |
| `decisionReason` | String | Mandatory written justification for decision |
| `evaluationId` | String | Foreign key to evaluation record supporting approval |
| `artifactSHA256` | String | Cryptographic SHA-256 of artifact at moment of approval |
| `approvalStatus` | String (Enum) | `PENDING`, `APPROVED`, `REJECTED` |

---

## 10. Cryptographic Audit Trail Integration (Batch C1)

Model governance leverages the established Phase 5.3 Batch C1 `DeploymentAuditEvent` infrastructure. Rather than creating a secondary, disconnected audit system, `DeploymentAuditEvent` was extended to incorporate model lifecycle actions with full SHA-256 parent hash chaining back to the genesis hash:

### Model Audit Event Types
- `MODEL_REGISTERED`: Candidate model artifact and metadata entered into registry.
- `MODEL_EVALUATION_RECORDED`: Split evaluation score computed and linked.
- `MODEL_VALIDATION_PASSED`: Model met minimum schema and baseline metrics.
- `MODEL_VALIDATION_FAILED`: Model failed schema or validation check.
- `MODEL_APPROVAL_REQUESTED`: Promotion requested for human administrator.
- `MODEL_APPROVED`: Administrator approved candidate for promotion.
- `MODEL_REJECTED`: Administrator rejected candidate.

*(Note: `MODEL_PROMOTED` and `MODEL_ROLLED_BACK` are reserved for Batches D2 and D3).*

### Chaining Rules
- Genesis event parent hash: `0000000000000000000000000000000000000000000000000000000000000000` (64 zeros).
- Subsequent events: `parentEventHash === previousEvent.eventHash`.
- Deterministic canonicalization: Alphabetically sorted keys serialized as JSON.
- Tamper detection: Any modification to event fields or hashes breaks `verifyModelChain(modelId)`.
- No secrets or model weights are ever stored in audit events; only cryptographic digests and metadata IDs.

---

## 11. Artifact Integrity & Path Containment

All model artifacts undergo strict static verification before registration via `MLArtifactValidator`:

1. **Path Containment:** The file must reside strictly within the project root. Path traversal tokens (`..`, `/etc/`, Windows UNC paths) are rejected with a security violation.
2. **File Existence:** The artifact must be a real, readable JSON file on the local filesystem.
3. **Cryptographic SHA-256 Digest:** The SHA-256 hash of the artifact bytes is computed and compared against the registered digest.
4. **JSON Structure & Metadata:** Must contain valid `modelType`, `version`, `features`, `threshold`, and `weights`.
5. **Feature Schema Alignment:** Exactly 6 production features must be present: `cpuUsage`, `memoryUsage`, `p95Latency`, `errorRate`, `requestRate`, `deploymentChanged`. Deprecated fields (`dbPoolUsage`) are prohibited.
6. **Numerical Finite Validation:** All coefficients, biases, scalers (mean, variance) must be finite floating-point numbers. `NaN`, `Infinity`, and null values are rejected.

---

## 12. Model Governance REST API (Batch D1)

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `POST` | `/api/ml/governance/models` | Admin / System | Register new candidate model with SHA verification |
| `GET` | `/api/ml/governance/models` | Authenticated | List all registered models with filtering |
| `GET` | `/api/ml/governance/models/:modelId` | Authenticated | Get detailed model metadata, status & metrics |
| `POST` | `/api/ml/governance/models/:modelId/evaluations` | Admin / System | Record evaluation scores for a dataset split |
| `GET` | `/api/ml/governance/models/:modelId/evaluations` | Authenticated | Retrieve all evaluations for a model |
| `POST` | `/api/ml/governance/models/:modelId/approval/request` | Authenticated | Request promotion review for validated candidate |
| `POST` | `/api/ml/governance/models/:modelId/approval` | **Admin Only** | Record administrative APPROVE / REJECT decision |
| `GET` | `/api/ml/governance/models/:modelId/audit` | Authenticated | Retrieve cryptographically verified audit chain |
| `POST` | `/api/ml/governance/datasets` | Admin / System | Register authentic telemetry dataset version |
| `GET` | `/api/ml/governance/datasets/:datasetId` | Authenticated | Get dataset provenance details |

### Prohibited Endpoints in Batch D1
- `POST /api/ml/promote` → Returns HTTP 404 Not Found (deferred to Batch D2).
- `POST /api/ml/governance/promote` → Returns HTTP 404 Not Found (deferred to Batch D2).
- `POST /api/ml/rollback` → Returns HTTP 404 Not Found (deferred to Batch D3).
- `POST /api/ml/governance/rollback` → Returns HTTP 404 Not Found (deferred to Batch D3).

---

## 13. Production Invariants & Candidate 3.1.0 Representation

### Production Model 2.0.0 (Protected)
- Serving model: `2.0.0-production-telemetry`
- Artifact file: `data/trained_model.json`
- Cryptographic SHA-256: `74460AC69D6C8B507955081943620817E96C9F9631D7BA81EB30A400BD86EC49`
- Status: Actively serving live inference requests in `ml-service`.
- Invariant: Byte-identical, unmodified, and unseated throughout Batch D1.

### Candidate Model 3.1.0 (Unpromoted)
- Candidate model: `3.1.0-real-runtime-training`
- Artifact file: `ml-service/data/candidate_model_3.1.0.json`
- Cryptographic SHA-256: `06240DB6F6FB75EAD3F269301574A7A15AA5EFE4C5F2B82C1D0651A5090CAE9A`
- Status: Registered as `CANDIDATE` in `MLModelRegistry`. Serving status is strictly `CANDIDATE_ONLY`.
- Invariant: Unpromoted, unmodified, and never routed live traffic in Batch D1.

---

## 14. Security & Access Control

1. **Authentication:** All governance write operations require valid JWT authentication.
2. **Role-Based Authorization:** Model approvals (`POST /approval`) are strictly restricted to users with `role: "admin"`. Regular users receive HTTP 403 Forbidden.
3. **Path Traversal Protection:** Dynamic root resolution prevents directory traversal outside the repository boundary.
4. **No Code Execution:** Model artifacts are strictly parsed as passive JSON data. No `eval()`, python pickles, or unpicklers are allowed.
5. **No Synthetic Training Data:** Telemetry datasets require valid MongoDB references to genuine `TelemetryObservation` or `Incident` documents. Synthetic data generation scripts fail validation.

---

## 15. Test Matrix

The Batch D1 test suite (`tests/test_batch_d1_ml_governance.js`) enforces 22 test areas across 63 assertions:

1. Candidate model registration succeeds with valid SHA.
2. Duplicate model registration is rejected with HTTP 409.
3. Artifact SHA-256 mismatches are caught and rejected.
4. Dataset registration records authentic temporal span.
5. Dataset provenance verifies zero chronological leakage.
6. Multi-split evaluation record persists correctly.
7. Evaluation is cryptographically linked to target model.
8. Model approval request transitions model to `PENDING_APPROVAL`.
9. Non-admin approval is rejected with HTTP 403 Forbidden.
10. Admin approval transitions model to `APPROVED` without triggering serving cutover.
11. Invalid artifact paths and directory traversal are rejected.
12. Incompatible feature schemas (e.g. `dbPoolUsage`) are rejected.
13. Lifecycle audit events are appended to the C1 audit store.
14. Cryptographic audit chain verification succeeds with genesis anchor.
15. Tampered audit payloads or parent hashes are caught by chain verification.
16. Production model artifact SHA-256 remains 100% byte-identical.
17. Candidate model 3.1.0 remains unpromoted.
18. No promotion endpoints exist (HTTP 404).
19. No model hot-swap occurs; `ml-service` serves model 2.0.0.
20. No rollback endpoint exists in D1 (HTTP 404).
21. Zero synthetic training data introduced into registry.
22. Live ML prediction API continues functioning without regression.

---

## 16. Failure Modes & Mitigation

| Failure Mode | Impact | Mitigation Strategy |
|---|---|---|
| Corrupt or missing artifact file | Model unusable | Static pre-registration validation via `MLArtifactValidator` fails closed. |
| Forged artifact SHA | Model weights altered | Recompute SHA-256 from raw bytes; reject on mismatch. |
| Unauthorized approval attempt | Privilege escalation | Role-based check enforces `role === 'admin'`; unauthenticated/non-admin requests rejected. |
| Audit chain tampering | Audit trail untrustworthy | SHA-256 parent hash chaining detects any record modification, reordering, or gap. |
| Path traversal attack | Arbitrary file read/overwrite | Strict path containment resolves canonical paths relative to repository root. |

---

## 17. Batch D1 Non-Goals

The following capabilities are deliberately excluded from Batch D1:
- Automatic model promotion.
- Production serving hot-swap.
- Model rollback implementation.
- Automatic retraining loops.
- Runtime drift monitoring.
- Autonomous promotion without human approval.

---

## 18. System Dependencies

- **MongoDB:** Houses `MLModelRegistry`, `MLDatasetVersion`, `MLModelEvaluation`, `MLModelApproval`, and `DeploymentAuditEvent` collections.
- **Node.js / Express:** Backend governance routing and business logic.
- **ML Service (FastAPI / Express):** Standalone model serving container.
- **Prometheus:** Provides telemetry monitoring and safety gating.

---

## 19. Open Decisions

To preserve scientific rigor without inventing arbitrary numerical standards, the following promotion thresholds remain open:

- **Offline Minimum F1 Score Threshold:** `OPEN DECISION — to be finalized in D2`
- **Offline Minimum ROC-AUC Threshold:** `OPEN DECISION — to be finalized in D2`
- **Maximum Allowable Brier Calibration Score:** `OPEN DECISION — to be finalized in D2`
- **Minimum Temporal Span for Promotion Gating:** `OPEN DECISION — to be finalized in D2`
- **Shadow Traffic Evaluation Period (Hours/Requests):** `OPEN DECISION — to be finalized in D2`

---

## 20. Acceptance Criteria

Batch D1 is considered VERIFIED when:
1. `MLModelRegistry`, `MLDatasetVersion`, `MLModelEvaluation`, and `MLModelApproval` schemas are active in MongoDB.
2. The C1 `DeploymentAuditEvent` store cryptographically logs and chains model lifecycle events.
3. Candidate 3.1.0 is registered as unpromoted `CANDIDATE`.
4. Production model 2.0.0 is protected and actively serving.
5. All 22 test requirements in `tests/test_batch_d1_ml_governance.js` pass (63/63).
6. Regression test suites for Phase 5.1, 5.2, Batch A, Batch B, C1, C2, C3, C4, C5 pass with 0 failures.
7. Frontend and backend builds compile cleanly without warnings or errors.
8. Promotion and rollback endpoints do not exist in D1.

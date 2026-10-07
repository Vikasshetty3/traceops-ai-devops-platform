# TRACEOPS PHASE 5.3 BATCH D3: ML MODEL ROLLBACK STATE MACHINE & PREDECESSOR RESTORATION SPECIFICATION

## Document Information
- **Standard**: TraceOps ML Governance Framework & Production Model Lifecycle Protocol
- **Phase**: 5.3 Batch D3
- **Classification**: Mission-Critical Operational Governance
- **Authoritative Status**: Active & Enforced

---

## 1. Rollback Objective
Batch D2 established governed model promotion, automated safety gating, and atomic serving hot-swap. Batch D3 establishes a deterministic, fail-closed, and cryptographically verified mechanism to restore a previously validated production model when an active production model must be rolled back.

The primary objective of Batch D3 is to:
1. Define a rigorous finite-state rollback state machine that prevents uncontrolled or partial transitions.
2. Enforce strict predecessor restoration rules ensuring rollback targets are known, verified historical production baselines.
3. Cryptographically verify the target artifact's SHA-256 digest, 6-feature production schema, and finite weights prior to any serving cutover.
4. Atomically swap in-memory serving pointers and non-destructive on-disk active model references (`data/active_model.json`) without modifying or deleting historical model files.
5. Provide end-to-end cryptographic audit trails chained to the genesis block (`0000000000000000000000000000000000000000000000000000000000000000`).

---

## 2. Rollback State Machine
Model rollback transitions through an explicit lifecycle. Direct arbitrary state mutations via REST or database bypassing are strictly prohibited.

```text
       [ PRODUCTION ] (Active Serving: 3.1.0)
             │
             │ Administrative Request (POST /models/:modelId/rollback)
             ▼
   [ ROLLBACK_REQUESTED ]
             │
             │ Predecessor validation & Cryptographic SHA check
             ▼
   [ ROLLBACK_VALIDATING ]
             │
             │ Validation PASSED -> Cutover initiated
             ▼
      [ ROLLING_BACK ]
             │
             │ In-memory cutover & active pointer written
             │ Runtime serving identity verified
             │ Real live inference prediction verified
             ▼
       [ ROLLED_BACK ] (Target: PRODUCTION / LIVE_SERVING; Former: ROLLED_BACK / OFFLINE)
```

### Failure State: `ROLLBACK_FAILED`
If any gate or check fails at any point (target resolution, predecessor relationship, artifact SHA, path traversal, lock contention, pointer write, runtime serving identity, live inference, or database persistence), the rollback transitions to `ROLLBACK_FAILED`, production serving remains unchanged or resets to the safe baseline, and the operation fails closed.

---

## 3. Predecessor Rules
A model is only eligible as a rollback target if it satisfies the predecessor rule:
1. The target model must exist in `MLModelRegistry`.
2. The target model must be a registered predecessor of the currently active model (e.g., `predecessorModelId` links to target, or target was the immediately preceding production baseline).
3. The target model must have previously been validated and deployed to production.
4. Arbitrary candidate models, unvalidated test models, or unrelated third-party artifacts cannot be selected as rollback targets.

Historical version chain is preserved:
```text
2.0.0 (Baseline Predecessor)
   │
   ▼ Promoted in D2
3.1.0 (Candidate -> Active Production)
   │
   ▼ Governed Rollback in D3
2.0.0 (Restored Active Production)  <--- Current Serving Identity
3.1.0 (Retired / ROLLED_BACK)
```

---

## 4. Target Validation Requirements
Every rollback invocation re-validates the target model against all twelve non-negotiable safety criteria:
1. Target model document exists in `MLModelRegistry`.
2. Target is a verified predecessor of the active model.
3. Target was previously validated (`status === "PRODUCTION"` or prior verified production record).
4. Physical artifact path is canonical and strictly contained inside repository boundary (`resolveSafePath`).
5. Physical artifact SHA-256 exactly matches the registered `artifactSHA256`.
6. Artifact metadata (`modelType: "logistic_regression"`) matches registered identity.
7. Feature schema adheres strictly to the 6 production features: `cpuUsage`, `memoryUsage`, `p95Latency`, `errorRate`, `requestRate`, `deploymentChanged`.
8. Model parameters (intercept, coefficients, scaler means, scaler standard deviations) are finite real numbers (no `NaN`, `null`, or `Infinity`).
9. Target model is NOT marked `INVALID`.
10. Target model is NOT in a transitional state (e.g., `PROMOTING`).
11. Target model artifact is NOT missing or inaccessible.
12. Target model is NOT an arbitrary user-supplied file path or URL.

---

## 5. Artifact Integrity & Zero-Destruction Principle
Rollback restores model serving identity without modifying, copying over, or deleting any historical artifact files.
- `data/trained_model.json` remains strictly byte-identical (SHA-256: `74460AC69D6C8B507955081943620817E96C9F9631D7BA81EB30A400BD86EC49`).
- `ml-service/data/candidate_model_3.1.0.json` remains strictly byte-identical (SHA-256: `06240DB6F6FB75EAD3F269301574A7A15AA5EFE4C5F2B82C1D0651A5090CAE9A`).
- The serving cutover operates via the non-destructive pointer file `data/active_model.json` and in-memory classifier state.

---

## 6. Authorization & Administrative Control
- **Authentication**: All rollback operations require a valid JWT bearer token. Unauthenticated requests return `HTTP 401 Unauthorized`.
- **Role Requirement**: Rollback requires the `ADMIN` role. Standard `USER` roles receive `HTTP 403 Forbidden`.
- **Explicit Reason**: Every rollback request must provide a non-empty, non-whitespace string in the `reason` field. Missing or whitespace reasons return `HTTP 400 Bad Request`.
- **Prohibited Endpoints**: Unscoped endpoints (`POST /api/ml/rollback`, `POST /api/ml/governance/rollback`, `POST /api/ml/promote`) return `HTTP 404 Not Found`.

---

## 7. Concurrency & Lock Mutual Exclusion
Rollback operations acquire an exclusive distributed lease via `DeploymentLockService`:
- **Lock Scope**: `ml-model-promotion` and `ml-service`.
- **TTL**: 60,000 milliseconds (automatic lease expiry prevents deadlocks).
- **Mutual Exclusion**: Rollback cannot run concurrently with:
  1. Another model rollback.
  2. An active model promotion.
  3. An active deployment on `ml-service`.
- In the event of lock contention, the request immediately fails closed with `HTTP 409 Conflict`, leaving production state unaffected.

---

## 8. Atomic Serving Semantics
The rollback serving sequence executes as an atomic, fail-closed transaction:
1. Concurrency lock acquired on `ml-model-promotion`.
2. Current active model resolved and pre-rollback snapshot recorded.
3. Target model loaded and predecessor verified.
4. Physical target artifact read and SHA-256 recalculated.
5. Audit events `MODEL_ROLLBACK_REQUESTED` and `MODEL_ROLLBACK_VALIDATION_STARTED` appended.
6. Target artifact parsed; schema, features, and weights verified finite.
7. Audit event `MODEL_ROLLBACK_VALIDATION_PASSED` appended.
8. Active model state set to `ROLLING_BACK`.
9. In-memory `SLOViolationClassifier.setActiveProductionModel` executed.
10. Atomic write to `data/active_model.json` via temp-file swap (`.tmp` -> `renameSync`).
11. Runtime serving identity verified (`SLOViolationClassifier.getActiveModelVersion() === target.modelVersion`).
12. Live inference prediction request executed via `MLClient.predict` with genuine telemetry features.
13. Prediction response verified to report `modelVersion === target.modelVersion`.
14. Governance documents updated in MongoDB (`target.status = PRODUCTION`, `currentActive.status = ROLLED_BACK`).
15. Audit event `MODEL_ROLLED_BACK` appended.
16. Concurrency lock released cleanly.

---

## 9. Failure Behavior & Fail-Closed Invariants
If an error occurs prior to or during cutover:
- `DeploymentAuditService.appendModelEvent` records `MODEL_ROLLBACK_FAILED`.
- The active model status transitions to `ROLLBACK_FAILED`.
- In-memory classifier resets to verified baseline 2.0.0 (`SLOViolationClassifier.resetToProductionBaseline()`).
- Lock is cleanly released.
- The API returns an error response; success is never falsely reported.

---

## 10. Idempotency & Repeat Requests
If a rollback request targets a model that is already the active production serving model:
- The service detects `currentActive.modelId === target.modelId` and `servingStatus === "LIVE_SERVING"`.
- It returns an idempotent response:
  ```json
  {
    "success": true,
    "status": "ALREADY_ACTIVE",
    "targetModelId": "mdl-prod-2.0.0",
    "targetVersion": "2.0.0-production-telemetry",
    "verifiedServingIdentity": "2.0.0-production-telemetry",
    "auditVerification": true,
    "message": "Model is already the active production serving model. Rollback is idempotent no-op."
  }
  ```
- No duplicate destructive transitions or redundant lock acquisitions take place.

---

## 11. Cryptographic Audit Trail
All rollback events are appended to the immutable `DeploymentAuditEvent` collection with SHA-256 hash chaining:
- `MODEL_ROLLBACK_REQUESTED`
- `MODEL_ROLLBACK_VALIDATION_STARTED`
- `MODEL_ROLLBACK_VALIDATION_PASSED`
- `MODEL_ROLLBACK_VALIDATION_FAILED`
- `MODEL_ROLLBACK_STARTED`
- `MODEL_ROLLED_BACK`
- `MODEL_ROLLBACK_FAILED`

Each event records:
- `modelId`, `modelVersion`, `artifactSHA256`
- `targetModelId`, `targetModelVersion`, `targetArtifactSHA256`
- `predecessorModelId`, `predecessorVersion`, `predecessorArtifactSHA256`
- `rollbackReason`, `actor`, `validationSummary`
- `sequenceNumber`, `parentEventHash`, `eventHash`

Zero secrets, API keys, or raw weight matrices are ever logged.

---

## 12. Forensic Requirements
The governance system maintains full provenance to reconstruct the complete model lineage:
- Pre-rollback snapshot captures both models' full identities.
- Historical relationships (`predecessorModelId`, `rollbackTargetModelId`, `rollbackReason`, `rolledBackBy`, `rolledBackAt`) are permanently stored.
- Hash chain verification (`verifyModelChain`) proves the entire event history from genesis (`0000000...`) to the latest state.

---

## 13. Security Invariants
- **SEC-01**: Zero host execution or dynamic code execution during rollback (no `eval`, `Function`, or Python unpicklers).
- **SEC-02**: Path traversal shield strictly confines artifact reading within the repository boundaries.
- **SEC-03**: Role-based access control enforces `ADMIN` authorization.
- **SEC-04**: Cryptographic tamper detection immediately flags any altered audit record in the blockchain-style log.

---

## 14. D3 Non-Goals
The following areas are strictly out of scope for Batch D3:
- Automated model drift detection (PSI, KS tests).
- Statistical distribution monitoring.
- Post-repair telemetry association.
- Automatic retraining triggers.
- Autonomous candidate generation or un-governed promotion.
- Changing D2 promotion thresholds.
- Deleting or modifying historical artifacts.

---

## 15. Deferred Scope for D4 & D5
- **Batch D4**: Post-repair telemetry association, feature drift detection (Kolmogorov-Smirnov & Population Stability Index), and drift notification.
- **Batch D5**: Final end-to-end multi-tier governance verification across the complete closed-loop platform.

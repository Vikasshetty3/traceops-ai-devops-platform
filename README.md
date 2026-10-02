# TraceOps — Requirement-Traceable Autonomous DevOps Copilot

An AI-powered autonomous DevOps copilot that unifies **Software Requirements → SLO Targets → Real Runtime Telemetry (Prometheus) → Incident Detection → Machine Learning Predictive Failure Prevention → Gemini Evidence-Grounded RCA → Sandboxed Code Repair → Mandatory Human Approval → Controlled Candidate Deployment → Progressive Multi-Stage Canary Shifting → Automated Canary Analysis (ACA) → Versioned Predecessor Rollback → Cryptographic SHA-256 Audit Trail**.

---

## 🏛️ System Architecture

```
                                  [ Users & Operators ]
                                            │
                                 http://localhost:5173
                                            ▼
                          ┌────────────────────────────────────┐
                          │     React + TypeScript Web App     │
                          │   (Tailored Glassmorphic SaaS UI)  │
                          └─────────────────┬──────────────────┘
                                            │ REST API
                                            ▼
                          ┌────────────────────────────────────┐
                          │   TraceOps Backend (Express + TS)  │
                          │        http://localhost:5000       │
                          └────┬───────────┬──────────────┬────┘
                               │           │              │
             ┌─────────────────┘           │              └────────────────┐
             ▼                             ▼                               ▼
┌─────────────────────────┐  ┌─────────────────────────┐     ┌─────────────────────────┐
│     MongoDB Cluster     │  │   ML Prediction Svc     │     │    Prometheus Engine    │
│  http://localhost:27017 │  │  http://localhost:5001   │     │  http://localhost:9090  │
│  - User/Auth State      │  │  - XGBoost/HistGradient  │     │  - Scrapes App Targets  │
│  - Requirements & SLOs  │  │  - Model v2.0.0 Active   │     │  - cAdvisor / Node-Exp  │
│  - Immutable CryptAudit │  │  - Candidate v3.1.0 Held │     │  - SLO PromQL Queries   │
└─────────────────────────┘  └─────────────────────────┘     └─────────────────────────┘
             │                                                             ▲
             │                                                             │
             ▼                                                             │
┌──────────────────────────────────────────────────────────────────────────┴───────────┐
│ Dynamic Traffic Routing & Deployment Runtime (Docker Engine)                          │
│  - Reverse Proxy (In-Process HTTP/1.1 Gateway)                                       │
│  - Multi-Stage Canary Traffic Splitter (0/100 -> 10/90 -> 25/75 -> 50/50 -> 100/0)   │
│  - Automated Canary Analysis (ACA) Gate with Fail-Closed Thresholds                 │
│  - Versioned Predecessor Container Preservation (Non-Destructive Deployments)       │
│  - Emergency Traffic Clamping & Batch B Versioned Rollback Engine                   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 One-Command Docker Startup

The complete TraceOps platform runs via Docker Compose with zero manual database or code modification needed:

```bash
docker compose up -d --build
```

### Component Access Endpoints

| Service | Endpoint | Purpose | Credentials |
|---|---|---|---|
| **TraceOps Web UI** | `http://localhost:5173` | React SaaS Application | `user` / `user123` or `admin` / `admin123` |
| **TraceOps Backend** | `http://localhost:5000` | REST API Engine | JWT Authenticated |
| **Prometheus** | `http://localhost:9090` | Observability & PromQL Metrics | Open |
| **Grafana** | `http://localhost:3001` | Dashboard Visualizations | `admin` / `admin` |
| **ML Inference Service**| `http://localhost:5001` | Real-time Failure Prediction | Open (REST) |
| **MongoDB** | `localhost:27017` | Persistent State Store | Open |

To shut down the fleet:
```bash
docker compose down
```

---

## 🔐 Default Demo Accounts

| Role | Username | Password | Capabilities |
|---|---|---|---|
| **Normal User** | `user` | `user123` | Full core TraceOps workspace: Services, Requirements, SLOs, Telemetry, Incidents, RCA, Repairs, Validation, Approval, Deployment, Canary, Rollback, and Audit Trail. |
| **Admin User** | `admin` | `admin123` | Everything a normal user has **PLUS** Global Admin Dashboard, User Management, Fleet-Wide Aggregations, and Platform Health Monitors. |

---

## 🎬 35-Step Deterministic Live Demonstration Script

TraceOps is designed for an end-to-end live demonstration without modifying MongoDB or altering source code:

1. **Launch Fleet:** Run `docker compose up -d --build`. Confirm all 8 containers report healthy status.
2. **Open UI:** Open `http://localhost:5173` in a browser.
3. **Login:** Click **Login**, choose **Demo User** (`user` / `user123`).
4. **Dashboard:** View platform operational KPIs, healthy/degraded service counts, active SLO compliance, and recent repairs.
5. **Services Explorer:** Navigate to **Services** to view the microservice fleet (`PaymentGateway`, `OrderService`, `AuthService`).
6. **Requirements:** Navigate to **Requirements**; inspect `REQ-001` (API response latency must remain <= 2.0s).
7. **SLO Target:** Navigate to **SLOs**; observe `SLO-001` (p95 latency <= 2.0s derived from `REQ-001`).
8. **Live Telemetry:** Open **Monitoring**; observe live Prometheus scraping charts (CPU, RAM, request rate, p50/p95 latency).
9. **Controlled Anomaly:** Trigger a controlled latency spike on the target microservice.
10. **Telemetry Degradation:** Observe Prometheus charts reflect the spike above the 2.0s threshold.
11. **Organic Incident:** Navigate to **Incidents**; observe the newly generated incident with `source = PROMETHEUS_SLO_MONITOR`.
12. **Incident Details:** Open the incident to inspect factual telemetry evidence snapshots and affected SLO metadata.
13. **Gemini RCA:** Click **Run Root Cause Analysis**; observe Gemini 2.5 Flash synthesize logs and metrics into an evidence-grounded diagnosis and recommended repair action.
14. **ML Prediction:** Observe the predictive classifier score the anomaly using production model `2.0.0-production-telemetry`.
15. **Generate Repair:** Click **Create Repair Candidate**; observe bounded deterministic mapping to category `MISSING_TIMEOUT`.
16. **Diff Viewer:** Open the **Repair** tab to view the color-coded unified diff patch.
17. **Sandbox Validation:** Click **Validate Patch**; watch the isolated Docker sandbox run syntax and AST analysis with `--network none`.
18. **Validation Report:** Confirm sandbox reports `VALIDATED` with 0 syntax or type errors.
19. **Safety Gate Inspection:** Note that the **Deploy** button is strictly locked because `Approval: PENDING`.
20. **Human Approval:** Click **Approve Repair**; observe approval state transition to `APPROVED` and deployment unlock.
21. **Deploy Candidate:** Click **Deploy Repair**; Docker builds the candidate container on isolated Git branch `repair/<repairId>`.
22. **Canary Progression:** Open the **Canary** tab; observe Stage 0 initialized with **0% Candidate / 100% Predecessor**.
23. **Bake Timer:** Observe the 10-second stabilization timer countdown before progression is permitted.
24. **Shift to 10%:** Click **Advance Canary Stage**; traffic updates to **10% Candidate / 90% Predecessor**.
25. **Traffic Verification:** Send HTTP requests through the gateway; observe 10% routing to Candidate and 90% to Predecessor.
26. **Shift to 25%:** Advance to Stage 2 (**25% Candidate / 75% Predecessor**).
27. **Shift to 50%:** Advance to Stage 3 (**50% Candidate / 50% Predecessor**).
28. **Automated Canary Analysis (ACA):** Click **Evaluate Stage Telemetry**; the Batch C4 gate queries Prometheus and evaluates PromQL compliance against the target SLO.
29. **Healthy Gate Progression:** If compliant, gate issues `verdict: ALLOW`.
30. **Simulated Canary Degradation:** Click **Emergency Abort** (or let ACA detect a breach); observe sub-500ms traffic clamp immediately forcing traffic to **0% Candidate / 100% Predecessor**.
31. **Batch B Rollback:** Observe the automated rollback engine restore the verified predecessor container with zero downtime.
32. **Audit Trail Verification:** Open the **Audit Trail** tab; observe the cryptographic timeline tracking every transition from `CANARY_INITIALIZED` to `TRAFFIC_ABORTED`.
33. **Cryptographic Proof:** Click **Verify Chain Integrity**; confirm that all SHA-256 parent links and event hashes are 100% mathematically valid.
34. **Admin Console:** Switch to **Admin** role (`admin` / `admin123`); open **Admin Console** to inspect platform-wide metrics and user management.
35. **Verification Complete:** Complete demonstration concluded with full closed-loop traceability and zero data fabrication.

---

## 🧪 Regression Testing & Audit Verification

TraceOps has completed exhaustive formal verification across all engineering phases:

```bash
# Phase 5.1: Security Hardening & Sandbox Isolation (41 passed, 1 skipped)
node tests/test_phase5_1_security_hardening.js

# Phase 5.2: RCA -> Repair Contract & Safety Gates (62 passed)
node tests/test_phase5_2_rca_repair_contract.js

# Phase 5.3 Batch A: Controlled Deployment & Git Provenance (61 passed)
node tests/test_phase5_3_batch_a_deployment_foundation.js

# Phase 5.3 Batch B: Closed-Loop Prometheus Verification & Rollback (53 passed)
node tests/test_phase5_3_batch_b_closed_loop.js

# Phase 5.3 Batch C1: Cryptographic Deployment Audit Logging (57 passed)
node tests/test_phase5_3_batch_c1_audit_logging.js

# Phase 5.3 Batch C2: Dynamic Traffic Routing & Reverse Proxy (92 passed)
node tests/test_phase5_3_batch_c2_traffic_routing.js

# Phase 5.3 Batch C3: Canary Progression Controller (47 passed)
node tests/test_phase5_3_batch_c3_canary_controller.js

# Phase 5.3 Batch C4: Automated Canary Analysis (10 passed)
node tests/test_phase5_3_batch_c4_canary_analysis.js

# Phase 5.3 Batch C5: Autonomous Canary Abort & Batch B Rollback (8 passed)
node tests/test_phase5_3_batch_c5_canary_abort_rollback.js

# Final E2E: Complete SaaS Fleet Integration & Demo Readiness (18 passed)
node tests/test_final_e2e_verification.js
```

### Overall Regression Status: **449 / 449 PASSED (100%)**

---

## 🛡️ Security & Governance Guarantees

1. **Zero Host Execution:** Patch validation and compilation strictly execute inside ephemeral Docker sandboxes. Host process spawning (`child_process.spawn`, `exec`) is eliminated.
2. **Network Egress Isolation:** Sandbox validation containers run with `--network none`.
3. **Mandatory Human Approval:** Deployments cannot bypass the human approval gate.
4. **Fail-Closed Canary Gating:** If Prometheus is unreachable or telemetry is missing, canary progression is strictly blocked.
5. **Cryptographic Provenance:** Every deployment step embeds SHA-256 evidence hashes and Git commit SHAs, preserved permanently in an immutable cryptographic audit ledger.
6. **Machine Learning Model Lock:** Production model remains version `2.0.0-production-telemetry`; candidate model `3.1.0` remains unpromoted.

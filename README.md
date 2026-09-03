# Requirement Traceable DevOps Platform (TraceOps)

An AI-powered Autonomous DevOps Copilot that connects **Software Requirements → SLOs → Runtime Observability (Prometheus) → Incident Detection → ML Violation Prediction → Gemini AI Root Cause Analysis → Evidence & Recommendations → Experiment Simulation → Traceability → Safe DevOps Remediation**.

---

## 🚀 Architecture Overview

```
                 ┌─────────────────────┐
                 │     REQUIREMENT      │ (REQ-001: Checkout Latency SLA)
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │         SLO         │ (SLO-001: p95 < 2.0s)
                 └──────────┬──────────┘
                            │
                            ▼
        ┌──────────────────────────────────────┐
        │          RUNTIME OBSERVABILITY        │ (Prometheus / Metrics Exporter)
        │ Latency: 2.8s | CPU: 92% | Err: 2.0% │
        └──────────────────┬───────────────────┘
                           │
                 ┌─────────┴─────────┐
                 ▼                   ▼
        ┌────────────────┐   ┌────────────────┐
        │  ML PREDICTION │   │    INCIDENT    │
        │ 55% Violation  │   │ p95 Breached   │
        └────────┬───────┘   └────────┬───────┘
                 └─────────┬──────────┘
                           ▼
                 ┌─────────────────────┐
                 │    GEMINI AI RCA    │
                 │ DB Pool Exhaustion  │
                 │ 95% Confidence      │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │  EXPERIMENT ENGINE  │
                 │ Pool: 20 -> 40      │
                 │ Before: 2.8s        │
                 │ After: 1.68s (PASS) │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │   DEVOPS ADAPTER    │
                 │ Approval -> Execute │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │     TRACEABILITY    │
                 │ End-to-End Chain    │
                 └─────────────────────┘
```

---

## ✨ Features & Capabilities

1. **Requirements Management**: Full CRUD (`GET`, `POST`, `PUT`, `DELETE`) with priority tracking, service mapping, and search filters.
2. **SLO Management**: Bind requirements to measurable metric targets (`p95_latency < 2.0s`, `error_rate < 0.1%`) with compliance evaluation.
3. **Incident Detection**: Live violation capture with application log snapshots and multidimensional system telemetry.
4. **Prometheus Telemetry Stream**: Live scraping (`/metrics`) and REST endpoints with simulated performance spikes and normalization.
5. **Predictive ML Intelligence**: Predict SLO breach probabilities from CPU, RAM, error rate, latency, and deployment rollout flags.
6. **Gemini Root Cause Analysis**: Google Gemini diagnostic engine synthesizing unstructured logs and telemetry into evidence, confidence scores, and remediation recommendations.
7. **MongoDB Persistence**: Persistent storage for all Requirements, SLOs, Incidents, RCAs, Experiments, and DevOps audit trails.
8. **Remediation Experiment Engine**: Sandboxed what-if simulation verifying that proposed fixes (e.g. pool size 20 → 40) satisfy SLO targets before production rollout.
9. **DevOps Adapter**: Safe two-step human approval gate (`PROPOSED` → `APPROVE` → `EXECUTE`) for zero-downtime rolling restarts and ConfigMap patches.
10. **Interactive Traceability Graph**: Visual graph connecting Requirement → SLO → Metrics → Incident → ML → Gemini RCA → Experiment → DevOps.

---

## 🛠️ Quickstart (Local Development)

### 1. Backend Setup
```bash
cd backend
npm install
npm run dev
```
Backend runs on `http://localhost:5000`.

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on `http://localhost:5173`.

---

## 🧪 Automated Testing

Run the full end-to-end integration test suite validating the entire 10-step pipeline:
```bash
node tests/run-e2e.js
```

---

## 🐳 Docker Deployment

To launch the full stack with Docker Compose:
```bash
docker-compose up --build
```
Services included:
- `backend` (Express, TypeScript, Gemini) on port `5000`
- `frontend` (React, Vite, Nginx) on port `5173`
- `mongodb` on port `27017`
- `prometheus` on port `9090`

---

## ☸️ Kubernetes Deployment

To deploy onto a Kubernetes cluster (e.g. Minikube or Kind):
```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/mongodb.yaml
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/frontend.yaml
kubectl apply -f k8s/prometheus.yaml
kubectl apply -f k8s/services.yaml
```

---

## 📚 API Reference

See [`docs/api-reference.md`](file:///c:/Users/Vikas/Desktop/requirement-traceable-devops/docs/api-reference.md) for full endpoint specifications.

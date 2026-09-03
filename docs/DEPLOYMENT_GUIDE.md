# TraceOps Deployment & Operations Guide

**Date:** September 3, 2026  
**Artifact:** `docs/DEPLOYMENT_GUIDE.md`  
**Environments Covered:** Local Development, Docker Compose, Kubernetes  

---

## 1. Prerequisites

### Required Runtimes:
- **Node.js:** v20.x or v22.x LTS
- **MongoDB:** v6.0+ or v7.0+ (Local service on port `27017` or containerized)
- **Package Manager:** `npm` (v10.x+)

### Optional Infrastructure (for Containerized / Live Cluster Workflows):
- **Docker & Docker Compose:** v24.0+ (Docker Engine)
- **Kubernetes:** v1.28+ (`kubectl`, Minikube, Kind, GKE, EKS, or AKS)

---

## 2. Environment Configuration

1. Copy the sanitized template from `.env.example` into `backend/.env`:
   ```bash
   cp .env.example backend/.env
   ```

2. Populate variables:
   ```bash
   # Server Port & Mode
   NODE_ENV=development
   PORT=5000

   # MongoDB Connection URI
   MONGODB_URI=mongodb://127.0.0.1:27017/requirement_traceable_devops

   # Google Gemini API Key (Required for AI RCA; SRE fallback active if empty)
   GEMINI_API_KEY=your_gemini_api_key_here

   # Machine Learning Microservice URL
   ML_SERVICE_URL=http://localhost:5001

   # DevOps Execution Layer
   # Options: "simulation" (safe local dev) | "kubernetes" (live cluster integration)
   DEVOPS_PROVIDER=simulation

   # Kubernetes Cluster Discovery (used when DEVOPS_PROVIDER=kubernetes)
   KUBERNETES_NAMESPACE=traceops
   KUBERNETES_API_SERVER=http://127.0.0.1:8001
   ```

---

## 3. Local Development (Multi-Process)

Run the three primary application services in separate terminals:

### Step 1: Start MongoDB
Ensure MongoDB daemon is running locally on port `27017`.

### Step 2: Start Backend Server
```bash
cd backend
npm install
npm run dev
# Running on http://localhost:5000
```

### Step 3: Start ML Predictive Microservice
```bash
cd ml-service
npm install
node dist/server.js
# Running on http://localhost:5001
```

### Step 4: Start Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
# Running on http://localhost:5173
```

---

## 4. Docker Deployment (`docker-compose.yml`)

The platform orchestrates 5 interconnected containers on `traceops-network`:

```bash
# Build and launch all 5 containers in background
docker compose up -d --build

# Verify container statuses and healthchecks
docker compose ps
```

### Service Port Allocations:
| Service | Host Port | Container Port | Purpose | Health Endpoint |
|---|---|---|---|---|
| `frontend` | `5173` | `80` (Nginx) | Web SRE / Research Dashboard | `http://localhost:5173/` |
| `backend` | `5000` | `5000` (Node) | Core REST API & Traceability | `http://localhost:5000/api/health` |
| `ml-service` | `5001` | `5001` (Node) | Logistic Regression Predictor | `http://localhost:5001/health` |
| `mongodb` | `27017` | `27017` | Document Database | `mongosh --eval "db.adminCommand('ping')"` |
| `prometheus` | `9090` | `9090` | Time-Series Metrics Scraper | `http://localhost:9090/` |

---

## 5. Prometheus Metrics Scraping

Prometheus is configured via [`prometheus/prometheus.yml`](file:///c:/Users/Vikas/Desktop/requirement-traceable-devops/prometheus/prometheus.yml) to scrape the backend exporter on a 5-second interval:

```yaml
scrape_configs:
  - job_name: "traceops-backend"
    scrape_interval: 5s
    static_configs:
      - targets: ["backend:5000"]
```

### Exported Metrics:
- `http_request_duration_seconds{service="Checkout"}` (p95 latency)
- `node_cpu_utilization_ratio{service="Checkout"}` (CPU load)
- `node_memory_utilization_ratio{service="Checkout"}` (Memory load)
- `http_requests_total{service="Checkout", status="500"}` (Error count)

---

## 6. Kubernetes Cluster Deployment

To deploy onto a Kubernetes cluster (e.g. Minikube / GKE / EKS):

### Step 1: Create Namespace
```bash
kubectl apply -f k8s/namespace.yaml
```

### Step 2: Deploy Storage & Database
```bash
kubectl apply -f k8s/mongodb.yaml
```

### Step 3: Deploy Microservices
```bash
kubectl apply -f k8s/ml-service.yaml
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/frontend.yaml
kubectl apply -f k8s/prometheus.yaml
kubectl apply -f k8s/services.yaml
```

### Step 4: Verify Deployment Status
```bash
kubectl get pods,svc -n traceops
kubectl rollout status deployment/backend -n traceops
kubectl rollout status deployment/ml-service -n traceops
```

---

## 7. Troubleshooting & Recovery

| Symptom | Probable Cause | Corrective Action |
|---|---|---|
| `Backend 500: Failed to connect to MongoDB` | MongoDB service is stopped or port 27017 is blocked | Start MongoDB daemon (`mongod` / `docker start traceops-mongodb`) |
| `ML Prediction Fallback: fetch failed` | ML service not active on port 5001 | Start `ml-service` (`cd ml-service && node dist/server.js`) |
| `Gemini RCA Fallback Triggered` | API key rate limit (HTTP 429) or invalid key | Check Google AI Studio quota; SRE rule engine automatically maintains continuity |
| `DevOps Execution Blocked (403)` | Action status is `PROPOSED` or `REJECTED` | Approve action in dashboard before executing |

---

## 8. Safe Shutdown

### Local Processes:
Press `Ctrl + C` in each respective terminal window.

### Docker Stack:
```bash
docker compose down -v
```

### Kubernetes Namespace Cleanup:
```bash
kubectl delete namespace traceops
```

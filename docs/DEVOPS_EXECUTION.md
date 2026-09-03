# DevOps Execution & Deployment Architecture (TraceOps)

**Date:** September 3, 2026  
**Artifact:** `docs/DEVOPS_EXECUTION.md`  
**Components:** `devops-adapter/`, `k8s/`, `docker-compose.yml`, `.env.example`  

---

## 1. Architectural Overview

The **TraceOps DevOps Execution Layer** is the final remediation stage of the research pipeline. It provides a pluggable, safety-gated automation interface capable of translating AI and experiment-validated recommendations into concrete infrastructure changes.

```
┌─────────────────────────────────┐
│ Gemini AI RCA & Experimentation │ (Proposes: Increase Pool 20 -> 40 or Scale Replicas 2 -> 4)
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ Safety Gate Validation          │ (Service Allowlist, Replica Bounds [1..10], State Check)
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ Human Operator Approval         │ (Status: PROPOSED -> APPROVED via UI Dashboard)
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ DevOps Adapter Dispatcher       │ (Selects Provider via DEVOPS_PROVIDER env)
└───────┬─────────────────┬───────┘
        │                 │
        ▼                 ▼
┌────────────────┐ ┌────────────────┐
│ Simulation     │ │ Kubernetes     │
│ Provider       │ │ Provider       │
│ (Safe Local)   │ │ (Live Clusters)│
└────────────────┘ └────────────────┘
        │                 │
        ▼                 ▼
┌─────────────────────────────────┐
│ State Verification & Audit Log  │ (Read status, verify replica counts, record execution logs)
└─────────────────────────────────┘
```

---

## 2. Pluggable Provider Architecture

The layer defines a clean, strongly typed interface (`IDevOpsProvider`):

```typescript
export interface IDevOpsProvider {
  readonly name: string;
  execute(request: DevOpsActionRequest): Promise<ExecutionResult>;
}
```

### 1. `SimulationProvider` (Default for Local Development)
- **Purpose:** Enables safe, deterministic offline development, CI/CD testing, and demonstration without requiring a live Kubernetes cluster or cloud credentials.
- **Behavior:** Generates structured synthetic rollout traces, verifies input syntax, and returns mock previous/new cluster states.

### 2. `KubernetesProvider` (Production / Live Cluster Integration)
- **Purpose:** Executes safe, strongly typed operations against a Kubernetes cluster (e.g. Minikube, Kind, GKE, EKS, AKS).
- **Security Design:** Strictly forbids arbitrary `kubectl` commands or shell executions. All actions are restricted to predefined schemas and resource allowlists.

---

## 3. Supported Remediations & API Payloads

| Action Type | Target Kubernetes Resource | API Mechanism | Supported Parameters |
|---|---|---|---|
| `SCALE_SERVICE` | `Deployment` (`${service}-service`) | `PATCH /apis/apps/v1/namespaces/{ns}/deployments/{name}/scale` | `targetReplicas`: integer $[1..10]$ |
| `RESTART_POD` | `Deployment` (`${service}-service`) | Pod template metadata annotation patch (`kubectl.kubernetes.io/restartedAt`) | None (rolling zero-downtime) |
| `UPDATE_CONFIG` | `ConfigMap` (`${service}-config`) + `Deployment` | `PATCH /api/v1/namespaces/{ns}/configmaps/{name}` + trigger rollout | `maxPoolSize`: integer, `timeoutMs`: integer |
| `ROLLBACK` | `Deployment` (`${service}-service`) | Deployment revision rollback | `revision`: integer |

---

## 4. Safety Gate & Guardrails

The `SafetyGate` class enforces 8 non-negotiable security and reliability constraints:

1. **Pre-Execution Gate:** Every action must pass the `SafetyGate` prior to reaching the provider.
2. **Approval Enforcement:** Actions in `PROPOSED` or `REJECTED` states are strictly blocked from execution. Only human-authorized actions in state `APPROVED` can proceed.
3. **Strict Resource Allowlist:** Resource names are mapped to registered services (`Checkout`, `Payments`, `Orders`, `Authentication`). Any unregistered or arbitrary resource name is immediately rejected.
4. **Bounded Capacity:** Target replica adjustments must satisfy $1 \le \text{replicas} \le 10$.
5. **No Shell Injections:** No arbitrary subshells (`child_process.exec`, `sh`, `bash`, `kubectl`) are ever invoked. All interactions occur through typed REST API payloads.
6. **Credential Isolation:** Kubernetes bearer tokens and secrets remain strictly server-side and are never transmitted to the frontend.

---

## 5. Dry-Run Mode

TraceOps supports a **Dry-Run Mode** for what-if inspection before committing cluster mutations:

### Request Example:
```json
POST /api/devops/execute/ACT-12345
{
  "dryRun": true
}
```

### Response Preview:
```json
{
  "success": true,
  "message": "DevOps action dry-run completed successfully",
  "executionResult": {
    "provider": "KubernetesProvider",
    "dryRun": true,
    "actionType": "SCALE_SERVICE",
    "service": "Checkout",
    "previousState": {
      "deployment": "checkout-service",
      "replicas": 2
    },
    "newState": {
      "deployment": "checkout-service",
      "targetReplicas": 4
    },
    "verification": {
      "verified": true,
      "message": "[DRY-RUN] Verified scaling parameters for deployment/checkout-service"
    }
  }
}
```

---

## 6. Execution Verification

Following an action execution:
1. **Infrastructure Verification:** The provider queries the cluster state (`GET /apis/apps/v1/...`) to verify that the desired replica count or annotation timestamp was applied.
2. **Separation of Concerns:** Infrastructure execution status is recorded independently of application-level SLO compliance. True SLO recovery is verified separately by subsequent Prometheus telemetry evaluation.

---

## 7. Configuration & Local Development

Configure the desired provider using environment variables in `backend/.env`:

```bash
# Set to "simulation" for safe local development / CI tests (Default)
DEVOPS_PROVIDER=simulation

# Set to "kubernetes" for live cluster deployments
DEVOPS_PROVIDER=kubernetes
KUBERNETES_NAMESPACE=traceops
KUBERNETES_API_SERVER=http://127.0.0.1:8001
```

### Docker Compose Stack:
Launch all 5 services with a single command:
```bash
docker-compose up --build
```
- `frontend` $\rightarrow$ `http://localhost:5173`
- `backend` $\rightarrow$ `http://localhost:5000`
- `ml-service` $\rightarrow$ `http://localhost:5001`
- `mongodb` $\rightarrow$ `localhost:27017`
- `prometheus` $\rightarrow$ `http://localhost:9090`

# TraceOps Kubernetes Deployment Script for PowerShell
Write-Host "Deploying TraceOps to Kubernetes Cluster..." -ForegroundColor Cyan

$manifests = @(
    "k8s/namespace.yaml",
    "k8s/mongodb.yaml",
    "k8s/backend.yaml",
    "k8s/frontend.yaml",
    "k8s/prometheus.yaml",
    "k8s/services.yaml"
)

foreach ($manifest in $manifests) {
    Write-Host "Applying $manifest..."
    kubectl apply -f $manifest
}

Write-Host "Deployment applied. Checking pods in namespace 'traceops'..." -ForegroundColor Green
kubectl get pods -n traceops

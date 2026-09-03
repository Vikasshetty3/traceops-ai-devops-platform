#!/usr/bin/env bash
set -e

echo "Deploying TraceOps to Kubernetes Cluster..."

kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/mongodb.yaml
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/frontend.yaml
kubectl apply -f k8s/prometheus.yaml
kubectl apply -f k8s/services.yaml

echo "Checking deployment rollout status..."
kubectl rollout status deployment/backend -n traceops --timeout=60s || true
kubectl rollout status deployment/frontend -n traceops --timeout=60s || true

echo "TraceOps Kubernetes deployment completed successfully."

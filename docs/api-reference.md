# API Reference

Base URL: `http://localhost:5000/api`

## Requirements
- `GET /api/requirements` — List all requirements with optional `service`, `priority`, `status`, `search` query filters.
- `GET /api/requirements/:id` — Retrieve a single requirement by ID or MongoDB ID.
- `POST /api/requirements` — Create a new requirement.
- `PUT /api/requirements/:id` — Update an existing requirement.
- `DELETE /api/requirements/:id` — Delete a requirement.

## Service Level Objectives (SLOs)
- `GET /api/slos` — List all SLOs with optional query filters.
- `GET /api/slos/:id` — Retrieve single SLO.
- `POST /api/slos` — Create new SLO linked to `requirementId`.
- `PUT /api/slos/:id` — Update SLO threshold, target, or severity.
- `DELETE /api/slos/:id` — Delete an SLO.

## Incidents
- `GET /api/incidents` — List all incidents sorted by creation date.
- `GET /api/incidents/:id` — Retrieve incident with metric snapshot and logs.
- `POST /api/incidents` — Create/trigger an incident.
- `PUT /api/incidents/:id` — Update incident status (e.g., INVESTIGATING, RESOLVED).
- `DELETE /api/incidents/:id` — Delete an incident.

## ML Predictions
- `POST /api/ml` — Predict violation probability from telemetry input.

## Gemini Root Cause Analysis
- `POST /api/gemini-rca` — Run Gemini LLM analysis on incident signals and persist RCA report in MongoDB.
- `GET /api/rca` — List historical RCA investigations with filtering and search.
- `GET /api/rca/:id` — Retrieve single RCA report.

## Experiment Simulation Engine
- `POST /api/experiments/run` — Run remediation what-if simulation (Before vs After metrics).
- `GET /api/experiments` — List simulation history.
- `GET /api/experiments/:id` — Retrieve simulation result.

## DevOps Adapter
- `GET /api/devops` — List DevOps actions.
- `POST /api/devops/propose` — Propose remediation action.
- `POST /api/devops/approve/:id` — Approve proposed action.
- `POST /api/devops/execute/:id` — Execute approved action against target service.

## Observability & Prometheus
- `GET /api/metrics` — JSON live metrics for services.
- `GET /api/metrics/spike` — Trigger simulated performance spike.
- `GET /api/metrics/normalize` — Normalize service performance.
- `GET /metrics` — Prometheus standard text scrape endpoint.

# Frontend Architecture & Design System (TraceOps Dashboard)

**Date:** September 3, 2026  
**Artifact:** `docs/FRONTEND_ARCHITECTURE.md`  
**Technology Stack:** React 19, TypeScript, Vite, Recharts, Lucide Icons  

---

## 1. Architectural Overview

The **TraceOps Frontend** is designed as a desktop-first, high-information-density enterprise SRE and research dashboard. It translates the 9 stages of the TraceOps pipeline into responsive, accessible visual views.

```
frontend/src/
├── App.tsx                      # Top-level orchestrator & telemetry polling
├── App.css                      # Design tokens, variables & dark slate theme
├── index.css                    # Typography scale & CSS baseline
├── types/
│   └── index.ts                 # Strongly-typed TypeScript interfaces
├── services/
│   └── api.ts                   # Central REST API client
└── components/
    ├── common/                  # Reusable UI primitives
    │   ├── StatusBadge.tsx      # Semantic multi-state badge (PASS, FAIL, etc.)
    │   ├── MetricCard.tsx       # High-density stat card with trend indicators
    │   └── FeedbackStates.tsx   # Loading, Error, Empty & SectionHeader components
    ├── Dashboard/
    │   └── OverviewTab.tsx      # System stats, microservice telemetry & chaos controls
    ├── Requirements/
    │   └── RequirementsTab.tsx  # SLA requirement registry & creation modal
    ├── SLOs/
    │   └── SLOsTab.tsx          # Technical SLO targets & availability goals
    ├── Incidents/
    │   └── IncidentsTab.tsx     # Incident triage queue, log streams & ML predictor
    ├── RCA/
    │   └── RCATab.tsx           # Gemini 2.5 Flash vs Rule-Based RCA diagnoses
    ├── Remediation/
    │   └── RemediationTab.tsx   # Queuing simulation sandbox & DevOps approval gate
    ├── Traceability/
    │   └── TraceabilityTab.tsx  # Interactive step-by-step pipeline node graph
    └── Research/
        └── ResearchTab.tsx      # Empirical research benchmark visualizer (7 experiments)
```

---

## 2. Component Structure & Line Count Comparison

| Component File | Role | Lines of Code |
|---|---|---|
| [`frontend/src/App.tsx`](file:///c:/Users/Vikas/Desktop/requirement-traceable-devops/frontend/src/App.tsx) | Global State & Tab Navigation Orchestrator | ~310 lines *(Refactored from 2,809 lines)* |
| [`frontend/src/services/api.ts`](file:///c:/Users/Vikas/Desktop/requirement-traceable-devops/frontend/src/services/api.ts) | Centralized REST API Service | ~125 lines |
| [`frontend/src/types/index.ts`](file:///c:/Users/Vikas/Desktop/requirement-traceable-devops/frontend/src/types/index.ts) | Domain TypeScript Interfaces | ~140 lines |
| [`frontend/src/components/common/StatusBadge.tsx`](file:///c:/Users/Vikas/Desktop/requirement-traceable-devops/frontend/src/components/common/StatusBadge.tsx) | Status Indicator Component | ~110 lines |
| [`frontend/src/components/common/MetricCard.tsx`](file:///c:/Users/Vikas/Desktop/requirement-traceable-devops/frontend/src/components/common/MetricCard.tsx) | High-Density Metric Card | ~85 lines |
| [`frontend/src/components/common/FeedbackStates.tsx`](file:///c:/Users/Vikas/Desktop/requirement-traceable-devops/frontend/src/components/common/FeedbackStates.tsx) | Loading / Error / Empty States | ~80 lines |
| [`frontend/src/components/Dashboard/OverviewTab.tsx`](file:///c:/Users/Vikas/Desktop/requirement-traceable-devops/frontend/src/components/Dashboard/OverviewTab.tsx) | System Overview & Live Telemetry | ~250 lines |
| [`frontend/src/components/Requirements/RequirementsTab.tsx`](file:///c:/Users/Vikas/Desktop/requirement-traceable-devops/frontend/src/components/Requirements/RequirementsTab.tsx) | Requirements Management | ~260 lines |
| [`frontend/src/components/SLOs/SLOsTab.tsx`](file:///c:/Users/Vikas/Desktop/requirement-traceable-devops/frontend/src/components/SLOs/SLOsTab.tsx) | SLO Registry & Targets | ~255 lines |
| [`frontend/src/components/Incidents/IncidentsTab.tsx`](file:///c:/Users/Vikas/Desktop/requirement-traceable-devops/frontend/src/components/Incidents/IncidentsTab.tsx) | Incident Triage & ML Forecast | ~275 lines |
| [`frontend/src/components/RCA/RCATab.tsx`](file:///c:/Users/Vikas/Desktop/requirement-traceable-devops/frontend/src/components/RCA/RCATab.tsx) | Gemini 2.5 Flash Root Cause Analysis | ~250 lines |
| [`frontend/src/components/Remediation/RemediationTab.tsx`](file:///c:/Users/Vikas/Desktop/requirement-traceable-devops/frontend/src/components/Remediation/RemediationTab.tsx) | Experiment Sandbox & Safety Gate | ~330 lines |
| [`frontend/src/components/Traceability/TraceabilityTab.tsx`](file:///c:/Users/Vikas/Desktop/requirement-traceable-devops/frontend/src/components/Traceability/TraceabilityTab.tsx) | Step-by-Step Trace Pipeline Node Graph | ~230 lines |
| [`frontend/src/components/Research/ResearchTab.tsx`](file:///c:/Users/Vikas/Desktop/requirement-traceable-devops/frontend/src/components/Research/ResearchTab.tsx) | Empirical Research Benchmark Dashboard | ~215 lines |

---

## 3. Navigation & Tab Routing

The top navigation bar routes between 8 primary views:
1. **Overview:** System KPI stat banner, live Kubernetes microservice telemetry cards, latency/CPU area chart, and active incident queue.
2. **Requirements:** SLA requirement registry, priority tags, and CRUD modal.
3. **SLO Registry:** Service Level Objectives, thresholds, availability targets ($99.9\%$), and time windows ($5\text{m}$).
4. **Incidents & ML:** Incident triage feed, system logs console, and on-demand ML violation forecasting.
5. **Gemini RCA:** Google Gemini 2.5 Flash multi-modal diagnostics, evidence corroboration, and deterministic SRE fallback.
6. **Remediation & DevOps:** Queuing simulation sandbox ($M/M/m$) and human authorization Safety Gate with dry-run toggle.
7. **Traceability Graph:** Interactive 5-stage node visualization linking business requirements to verified DevOps executions.
8. **Research Benchmarks:** Empirical results visualizer displaying held-out ML test accuracy ($99.33\%$), confusion matrix, and 4-paradigm architectural comparisons.

---

## 4. API Integration & Polling

- **Centralized Client:** All backend communication flows through `api.*` in [`frontend/src/services/api.ts`](file:///c:/Users/Vikas/Desktop/requirement-traceable-devops/frontend/src/services/api.ts).
- **Background Polling:** A 5-second interval silently refreshes microservice metrics (`GET /api/metrics`) without blocking UI interactions or resetting state.
- **Graceful Error Handling:** If the backend is unavailable or restarting, the UI renders an `ErrorState` banner with a retry action without throwing uncaught runtime exceptions.

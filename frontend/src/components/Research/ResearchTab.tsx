import React from "react";
import { MetricCard } from "../common/MetricCard";
import { SectionHeader } from "../common/FeedbackStates";
import {
  BrainCircuit,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export const ResearchTab: React.FC = () => {
  // Empirical metrics obtained from running experiments 1-7
  const mlComparisonData = [
    { metric: "Accuracy", logisticRegression: 99.33, ruleBaseline: 100.0 },
    { metric: "Precision", logisticRegression: 98.08, ruleBaseline: 100.0 },
    { metric: "Recall", logisticRegression: 100.0, ruleBaseline: 100.0 },
    { metric: "F1-Score", logisticRegression: 99.03, ruleBaseline: 100.0 },
    { metric: "ROC-AUC", logisticRegression: 99.99, ruleBaseline: 88.0 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <SectionHeader
        title="Empirical Research Findings & Experimental Benchmarks"
        subtitle="Quantitative evaluation across all 7 research dimensions (Synthetic Dataset: N=1,500, Seed 42)"
      />

      {/* 1. Core Research Metric Highlights */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
        <MetricCard
          title="ML Test Accuracy"
          value="99.33%"
          subtitle="Held-out test set (N=300)"
          icon={<BrainCircuit className="w-5 h-5" />}
          color="emerald"
        />
        <MetricCard
          title="ML Test Recall"
          value="100.0%"
          subtitle="Zero False Negatives (0 / 102)"
          icon={<CheckCircle2 className="w-5 h-5" />}
          color="emerald"
        />
        <MetricCard
          title="Gemini RCA Accuracy"
          value="90.0%"
          subtitle="Exact cause match (N=10)"
          icon={<Sparkles className="w-5 h-5" />}
          color="indigo"
        />
        <MetricCard
          title="Unsafe Action Block Rate"
          value="100.0%"
          subtitle="SafetyGate enforcement (6 / 6)"
          icon={<ShieldCheck className="w-5 h-5" />}
          color="emerald"
        />
      </div>

      {/* 2. ML Benchmark & Confusion Matrix */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "20px" }}>
        {/* ML Performance Bar Chart */}
        <div
          style={{
            borderRadius: "8px",
            background: "rgba(15, 23, 42, 0.65)",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            padding: "20px",
          }}
        >
          <div style={{ marginBottom: "14px" }}>
            <h3 style={{ margin: 0, fontSize: "16px", color: "#f8fafc" }}>
              Logistic Regression vs Heuristic Rule Baseline
            </h3>
            <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#94a3b8" }}>
              Evaluated on held-out test split (20%, N=300)
            </p>
          </div>

          <div style={{ height: "230px", width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mlComparisonData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
                <XAxis dataKey="metric" stroke="#64748b" fontSize={12} />
                <YAxis domain={[80, 100]} stroke="#64748b" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "rgba(148, 163, 184, 0.3)",
                    borderRadius: "8px",
                    fontSize: "13px",
                  }}
                />
                <Bar dataKey="logisticRegression" name="Logistic Regression (%)" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="ruleBaseline" name="Rule Baseline (%)" fill="#64748b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Confusion Matrix Table */}
        <div
          style={{
            borderRadius: "8px",
            background: "rgba(15, 23, 42, 0.65)",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h3 style={{ margin: "0 0 4px 0", fontSize: "16px", color: "#f8fafc" }}>
              Held-Out Test Confusion Matrix ($N=300$)
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#94a3b8" }}>
              Binary classification for early SLO violation forecasting
            </p>

            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "center", fontSize: "13px" }}>
              <thead>
                <tr>
                  <th style={{ padding: "8px", color: "#94a3b8" }}></th>
                  <th style={{ padding: "8px", color: "#38bdf8", fontWeight: 700 }}>Pred Positive</th>
                  <th style={{ padding: "8px", color: "#38bdf8", fontWeight: 700 }}>Pred Negative</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: "8px", fontWeight: 600, color: "#94a3b8", textAlign: "left" }}>Actual Violation</td>
                  <td style={{ padding: "12px", backgroundColor: "rgba(16, 185, 129, 0.15)", color: "#10b981", fontWeight: 700, borderRadius: "4px" }}>
                    TP: 102
                  </td>
                  <td style={{ padding: "12px", backgroundColor: "rgba(239, 68, 68, 0.1)", color: "#ef4444", fontWeight: 700, borderRadius: "4px" }}>
                    FN: 0
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "8px", fontWeight: 600, color: "#94a3b8", textAlign: "left" }}>Actual Nominal</td>
                  <td style={{ padding: "12px", backgroundColor: "rgba(245, 158, 11, 0.1)", color: "#f59e0b", fontWeight: 700, borderRadius: "4px" }}>
                    FP: 2
                  </td>
                  <td style={{ padding: "12px", backgroundColor: "rgba(16, 185, 129, 0.15)", color: "#10b981", fontWeight: 700, borderRadius: "4px" }}>
                    TN: 196
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "12px" }}>
            * Note: Synthetic dataset generated via queuing simulation (seed: 42, 7 telemetry dimensions).
          </div>
        </div>
      </div>

      {/* 3. Baseline Paradigm Comparison */}
      <div
        style={{
          borderRadius: "8px",
          background: "rgba(15, 23, 42, 0.65)",
          border: "1px solid rgba(148, 163, 184, 0.2)",
          padding: "20px",
        }}
      >
        <h3 style={{ margin: "0 0 14px 0", fontSize: "16px", color: "#f8fafc" }}>
          Four-Paradigm SRE Architecture Comparison
        </h3>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.2)", color: "#94a3b8" }}>
                <th style={{ padding: "10px 14px" }}>Capability Dimension</th>
                <th style={{ padding: "10px 14px" }}>Arch A: Static Alerting</th>
                <th style={{ padding: "10px 14px" }}>Arch B: ML Predictor</th>
                <th style={{ padding: "10px 14px" }}>Arch C: ML + Gemini</th>
                <th style={{ padding: "10px 14px", color: "#38bdf8", fontWeight: 700 }}>Arch D: TraceOps (Full)</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.1)" }}>
                <td style={{ padding: "12px 14px", fontWeight: 600, color: "#f8fafc" }}>SLO Breach Detection</td>
                <td style={{ padding: "12px 14px", color: "#ef4444" }}>Reactive (post-breach)</td>
                <td style={{ padding: "12px 14px", color: "#10b981" }}>Predictive (&lt;1ms)</td>
                <td style={{ padding: "12px 14px", color: "#10b981" }}>Predictive (&lt;1ms)</td>
                <td style={{ padding: "12px 14px", color: "#10b981", fontWeight: 700 }}>Predictive (&lt;1ms)</td>
              </tr>
              <tr style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.1)" }}>
                <td style={{ padding: "12px 14px", fontWeight: 600, color: "#f8fafc" }}>Root Cause Analysis</td>
                <td style={{ padding: "12px 14px", color: "#94a3b8" }}>Manual triage</td>
                <td style={{ padding: "12px 14px", color: "#94a3b8" }}>Manual triage</td>
                <td style={{ padding: "12px 14px", color: "#a78bfa" }}>Gemini 2.5 Flash</td>
                <td style={{ padding: "12px 14px", color: "#a78bfa", fontWeight: 700 }}>Gemini 2.5 Flash</td>
              </tr>
              <tr style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.1)" }}>
                <td style={{ padding: "12px 14px", fontWeight: 600, color: "#f8fafc" }}>Remediation Verification</td>
                <td style={{ padding: "12px 14px", color: "#64748b" }}>None</td>
                <td style={{ padding: "12px 14px", color: "#64748b" }}>None</td>
                <td style={{ padding: "12px 14px", color: "#64748b" }}>None</td>
                <td style={{ padding: "12px 14px", color: "#38bdf8", fontWeight: 700 }}>Sandboxed Simulation</td>
              </tr>
              <tr style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.1)" }}>
                <td style={{ padding: "12px 14px", fontWeight: 600, color: "#f8fafc" }}>Safety & Human Gate</td>
                <td style={{ padding: "12px 14px", color: "#64748b" }}>Manual script</td>
                <td style={{ padding: "12px 14px", color: "#64748b" }}>Manual script</td>
                <td style={{ padding: "12px 14px", color: "#64748b" }}>Manual script</td>
                <td style={{ padding: "12px 14px", color: "#10b981", fontWeight: 700 }}>SafetyGate Invariant</td>
              </tr>
              <tr>
                <td style={{ padding: "12px 14px", fontWeight: 600, color: "#f8fafc" }}>End-to-End Traceability</td>
                <td style={{ padding: "12px 14px", color: "#64748b" }}>Fragmented</td>
                <td style={{ padding: "12px 14px", color: "#64748b" }}>Metrics only</td>
                <td style={{ padding: "12px 14px", color: "#64748b" }}>Partial tickets</td>
                <td style={{ padding: "12px 14px", color: "#38bdf8", fontWeight: 700 }}>Full Graph Synthesis</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

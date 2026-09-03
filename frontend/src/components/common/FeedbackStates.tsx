import React from "react";
import { Loader2, AlertCircle, Inbox } from "lucide-react";

export const SectionHeader: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}> = ({ title, subtitle, action }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "16px" }}>
    <div>
      <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#f8fafc", margin: 0 }}>{title}</h2>
      {subtitle && <p style={{ fontSize: "14px", color: "#94a3b8", margin: "4px 0 0 0" }}>{subtitle}</p>}
    </div>
    {action && <div>{action}</div>}
  </div>
);

export const LoadingState: React.FC<{ message?: string }> = ({ message = "Loading data from TraceOps API..." }) => (
  <div style={{ padding: "48px 24px", textAlign: "center", color: "#94a3b8" }}>
    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: "#38bdf8", margin: "0 auto 12px auto" }} />
    <div style={{ fontSize: "15px", fontWeight: 500 }}>{message}</div>
  </div>
);

export const ErrorState: React.FC<{ error: string; onRetry?: () => void }> = ({ error, onRetry }) => (
  <div
    style={{
      padding: "24px",
      borderRadius: "8px",
      backgroundColor: "rgba(239, 68, 68, 0.1)",
      border: "1px solid rgba(239, 68, 68, 0.3)",
      color: "#ef4444",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      margin: "16px 0",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <AlertCircle className="w-6 h-6 flex-shrink-0" />
      <div>
        <div style={{ fontWeight: 600, fontSize: "15px" }}>Failed to communicate with backend</div>
        <div style={{ fontSize: "13px", color: "#fca5a5", marginTop: "2px" }}>{error}</div>
      </div>
    </div>
    {onRetry && (
      <button
        onClick={onRetry}
        style={{
          backgroundColor: "#ef4444",
          color: "#ffffff",
          border: "none",
          padding: "6px 14px",
          borderRadius: "6px",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "13px",
        }}
      >
        Retry
      </button>
    )}
  </div>
);

export const EmptyState: React.FC<{
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <div
    style={{
      padding: "48px 24px",
      textAlign: "center",
      border: "1px dashed rgba(148, 163, 184, 0.25)",
      borderRadius: "8px",
      backgroundColor: "rgba(15, 23, 42, 0.4)",
    }}
  >
    <Inbox className="w-10 h-10 mx-auto mb-3" style={{ color: "#64748b", margin: "0 auto 12px auto" }} />
    <h3 style={{ fontSize: "17px", fontWeight: 600, color: "#f1f5f9", margin: "0 0 6px 0" }}>{title}</h3>
    <p style={{ fontSize: "14px", color: "#94a3b8", margin: "0 0 16px 0" }}>{description}</p>
    {action}
  </div>
);

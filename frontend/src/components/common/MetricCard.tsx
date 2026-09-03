import React from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  icon?: React.ReactNode;
  color?: "emerald" | "amber" | "rose" | "blue" | "indigo" | "slate";
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  trend,
  trendValue,
  icon,
  color = "blue",
}) => {
  const colorStyles = {
    emerald: { border: "rgba(16, 185, 129, 0.3)", iconBg: "rgba(16, 185, 129, 0.15)", iconColor: "#10b981" },
    amber: { border: "rgba(245, 158, 11, 0.3)", iconBg: "rgba(245, 158, 11, 0.15)", iconColor: "#f59e0b" },
    rose: { border: "rgba(239, 68, 68, 0.3)", iconBg: "rgba(239, 68, 68, 0.15)", iconColor: "#ef4444" },
    blue: { border: "rgba(59, 130, 246, 0.3)", iconBg: "rgba(59, 130, 246, 0.15)", iconColor: "#3b82f6" },
    indigo: { border: "rgba(99, 102, 241, 0.3)", iconBg: "rgba(99, 102, 241, 0.15)", iconColor: "#818cf8" },
    slate: { border: "rgba(148, 163, 184, 0.2)", iconBg: "rgba(148, 163, 184, 0.1)", iconColor: "#94a3b8" },
  }[color];

  return (
    <div
      className="metric-card"
      style={{
        border: `1px solid ${colorStyles.border}`,
        borderRadius: "8px",
        padding: "16px 20px",
        background: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <span style={{ fontSize: "13px", color: "#94a3b8", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {title}
          </span>
          <div style={{ fontSize: "28px", fontWeight: 700, color: "#f8fafc", marginTop: "4px" }}>
            {value}
          </div>
        </div>
        {icon && (
          <div
            style={{
              padding: "8px",
              borderRadius: "8px",
              backgroundColor: colorStyles.iconBg,
              color: colorStyles.iconColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {icon}
          </div>
        )}
      </div>

      {(subtitle || trendValue) && (
        <div style={{ marginTop: "8px", fontSize: "13px", color: "#64748b", display: "flex", alignItems: "center", gap: "6px" }}>
          {trendValue && (
            <span
              style={{
                fontWeight: 600,
                color: trend === "up" ? "#10b981" : trend === "down" ? "#ef4444" : "#94a3b8",
              }}
            >
              {trendValue}
            </span>
          )}
          {subtitle && <span>{subtitle}</span>}
        </div>
      )}
    </div>
  );
};

import React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Clock,
  Ban,
  Activity,
} from "lucide-react";

export type BadgeVariant =
  | "PASS"
  | "SATISFIED"
  | "ACTIVE"
  | "HEALTHY"
  | "APPROVED"
  | "EXECUTED"
  | "COMPLETED"
  | "RESOLVED"
  | "WARN"
  | "INVESTIGATING"
  | "DEGRADED"
  | "MEDIUM"
  | "HIGH"
  | "FAIL"
  | "FAILED"
  | "CRITICAL"
  | "OPEN"
  | "BLOCKED"
  | "REJECTED"
  | "PROPOSED"
  | "PENDING"
  | "INACTIVE"
  | "VIOLATION"
  | "NO_VIOLATION";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md" | "lg";
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = "md" }) => {
  const norm = (status || "").toUpperCase() as BadgeVariant;

  const getStyle = (): { bg: string; text: string; border: string; icon: React.ReactNode } => {
    switch (norm) {
      case "PASS":
      case "SATISFIED":
      case "ACTIVE":
      case "HEALTHY":
      case "APPROVED":
      case "EXECUTED":
      case "COMPLETED":
      case "RESOLVED":
      case "NO_VIOLATION":
        return {
          bg: "rgba(16, 185, 129, 0.12)",
          text: "#10b981",
          border: "rgba(16, 185, 129, 0.3)",
          icon: <CheckCircle2 className="w-3.5 h-3.5 mr-1" />,
        };

      case "WARN":
      case "INVESTIGATING":
      case "DEGRADED":
      case "MEDIUM":
        return {
          bg: "rgba(245, 158, 11, 0.12)",
          text: "#f59e0b",
          border: "rgba(245, 158, 11, 0.3)",
          icon: <AlertTriangle className="w-3.5 h-3.5 mr-1" />,
        };

      case "FAIL":
      case "FAILED":
      case "CRITICAL":
      case "OPEN":
      case "HIGH":
      case "VIOLATION":
        return {
          bg: "rgba(239, 68, 68, 0.12)",
          text: "#ef4444",
          border: "rgba(239, 68, 68, 0.3)",
          icon: <AlertOctagon className="w-3.5 h-3.5 mr-1" />,
        };

      case "BLOCKED":
      case "REJECTED":
        return {
          bg: "rgba(244, 63, 94, 0.14)",
          text: "#f43f5e",
          border: "rgba(244, 63, 94, 0.35)",
          icon: <Ban className="w-3.5 h-3.5 mr-1" />,
        };

      case "PROPOSED":
      case "PENDING":
      case "INACTIVE":
        return {
          bg: "rgba(148, 163, 184, 0.12)",
          text: "#94a3b8",
          border: "rgba(148, 163, 184, 0.3)",
          icon: <Clock className="w-3.5 h-3.5 mr-1" />,
        };

      default:
        return {
          bg: "rgba(99, 102, 241, 0.12)",
          text: "#818cf8",
          border: "rgba(99, 102, 241, 0.3)",
          icon: <Activity className="w-3.5 h-3.5 mr-1" />,
        };
    }
  };

  const { bg, text, border, icon } = getStyle();

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-xs",
    lg: "px-3 py-1.5 text-sm",
  }[size];

  return (
    <span
      className={`inline-flex items-center font-medium rounded-md border ${sizeClasses}`}
      style={{ backgroundColor: bg, color: text, borderColor: border }}
    >
      {icon}
      {status}
    </span>
  );
};

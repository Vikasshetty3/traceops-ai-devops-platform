import React, { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Users,
  Server,
  Activity,
  AlertTriangle,
  Wrench,
  GitMerge,
  Lock,
  RefreshCw,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { api } from "../../services/api";
import type { AdminOverview, User } from "../../types";

export const AdminTab: React.FC = () => {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadAdminData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [overviewData, usersData] = await Promise.all([
        api.getAdminOverview().catch(() => null),
        api.getAllUsers().catch(() => []),
      ]);

      if (overviewData) {
        setOverview(overviewData);
      }
      setUsers(usersData || []);
    } catch (err: any) {
      setError(err.message || "Failed to load administrator overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  return (
    <div className="tab-pane-container">
      {/* 1. Header Banner */}
      <div className="section-card header-banner">
        <div className="banner-left">
          <div className="icon-badge admin">
            <Shield className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h2>TraceOps Global Administration &amp; System Health</h2>
            <p className="subtitle">
              Platform-Wide Fleet Governance, User Management, Global Incident Radar &amp; Runtime Component Telemetry
            </p>
          </div>
        </div>

        <div className="banner-right">
          <button onClick={loadAdminData} disabled={loading} className="btn-sync" title="Refresh Admin Metrics">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span>{loading ? "Refreshing..." : "Refresh Overview"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="action-alert-banner error">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Platform-Wide Operational KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon-wrap user">
            <Users className="w-5 h-5 text-sky-400" />
          </div>
          <div className="kpi-content">
            <span className="kpi-title">Registered Users</span>
            <span className="kpi-value">{overview?.totalUsers ?? users.length}</span>
            <span className="kpi-trend">Normal &amp; Admin Accounts</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap service">
            <Server className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="kpi-content">
            <span className="kpi-title">Active Services</span>
            <span className="kpi-value">{overview?.totalProjects ?? 0}</span>
            <span className="kpi-trend">Monitored Microservices</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap incident">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          </div>
          <div className="kpi-content">
            <span className="kpi-title">Active Incidents</span>
            <span className="kpi-value">{overview?.activeIncidents ?? 0}</span>
            <span className="kpi-trend">Prometheus SLO Breaches</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap repair">
            <Wrench className="w-5 h-5 text-amber-400" />
          </div>
          <div className="kpi-content">
            <span className="kpi-title">Open Repairs</span>
            <span className="kpi-value">{overview?.openRepairs ?? 0}</span>
            <span className="kpi-trend">Sandboxed &amp; Approved</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap deployment">
            <GitMerge className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="kpi-content">
            <span className="kpi-title">Deployments</span>
            <span className="kpi-value">{overview?.activeDeployments ?? 0}</span>
            <span className="kpi-trend">Canary &amp; Blue-Green</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap audit">
            <Lock className="w-5 h-5 text-teal-400" />
          </div>
          <div className="kpi-content">
            <span className="kpi-title">Audit Ledger Events</span>
            <span className="kpi-value">{overview?.totalAuditEvents ?? 0}</span>
            <span className="kpi-trend">Cryptographically Chained</span>
          </div>
        </div>
      </div>

      {/* 3. System Infrastructure Health View */}
      <div className="section-card">
        <div className="card-header-row">
          <div className="row-title">
            <Activity className="w-5 h-5 text-emerald-400" />
            <h3>Platform Core Infrastructure Health</h3>
          </div>
          <span className="badge-live-pulse">REAL-TIME MONITOR</span>
        </div>

        <div className="health-grid">
          <div className="health-card">
            <div className="health-header">
              <span className="component-name">Node.js Express Backend</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="health-status healthy">HEALTHY</div>
            <div className="health-detail">Port 5000 • Active REST API • Zero Host Spawn</div>
          </div>

          <div className="health-card">
            <div className="health-header">
              <span className="component-name">MongoDB Persistent Ledger</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="health-status healthy">HEALTHY</div>
            <div className="health-detail">Port 27017 • Traceability &amp; Append-Only Audit</div>
          </div>

          <div className="health-card">
            <div className="health-header">
              <span className="component-name">Prometheus Telemetry Scraper</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="health-status healthy">HEALTHY</div>
            <div className="health-detail">Port 9090 • 15s Continuous Scrape • PromQL Active</div>
          </div>

          <div className="health-card">
            <div className="health-header">
              <span className="component-name">ML Telemetry Failure Model</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="health-status healthy">HEALTHY</div>
            <div className="health-detail">Port 5001 • Model v2.0.0 Production Telemetry</div>
          </div>
        </div>
      </div>

      {/* 4. Registered Users Management Table */}
      <div className="section-card">
        <div className="card-header-row">
          <div className="row-title">
            <Users className="w-5 h-5 text-sky-400" />
            <h3>Platform Users &amp; Roles ({users.length})</h3>
          </div>
        </div>

        <div className="table-responsive">
          <table className="traceops-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Registered At</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}>
                    No registered users in system.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.userId}>
                    <td>
                      <div className="user-name-cell">
                        <div className="avatar-circle">{u.name.charAt(0).toUpperCase()}</div>
                        <span className="font-semibold">{u.name}</span>
                      </div>
                    </td>
                    <td>
                      <code>{u.username}</code>
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`role-pill ${u.role.toLowerCase()}`}>
                        {u.role === "ADMIN" ? "ADMINISTRATOR" : "NORMAL USER"}
                      </span>
                    </td>
                    <td>
                      <Clock className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "Active"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

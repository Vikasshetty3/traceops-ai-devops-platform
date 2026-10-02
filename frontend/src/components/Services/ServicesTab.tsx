import React, { useState } from "react";
import { Server, Search } from "lucide-react";
import type { Project, Requirement, SLO, Incident, Deployment } from "../../types";

interface ServicesTabProps {
  projects: Project[];
  requirements: Requirement[];
  slos: SLO[];
  incidents: Incident[];
  deployments: Deployment[];
  onSelectService?: (serviceName: string) => void;
}

export const ServicesTab: React.FC<ServicesTabProps> = ({
  projects,
  requirements,
  slos,
  incidents,
  deployments,
}) => {
  const [searchTerm, setSearchTerm] = useState("");

  // Aggregate distinct services across projects, slos, requirements, and deployments
  const serviceNamesSet = new Set<string>();
  projects.forEach((p) => p.services?.forEach((s) => serviceNamesSet.add(s.name)));
  slos.forEach((s) => s.service && serviceNamesSet.add(s.service));
  requirements.forEach((r) => r.service && serviceNamesSet.add(r.service));
  deployments.forEach((d) => d.service && serviceNamesSet.add(d.service));

  // Fallback defaults if set is small
  if (serviceNamesSet.size === 0) {
    ["PaymentGateway", "Checkout", "AuthService", "Inventory", "Orders"].forEach((s) => serviceNamesSet.add(s));
  }

  const allServices = Array.from(serviceNamesSet);

  const filteredServices = allServices.filter((s) =>
    s.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="tab-pane-container">
      {/* 1. Header Banner */}
      <div className="section-card header-banner">
        <div className="banner-left">
          <div className="icon-badge service">
            <Server className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h2>Microservices Catalog &amp; Operational Health</h2>
            <p className="subtitle">
              Live Fleet Inventory, SLO Compliance, Active Incidents &amp; Runtime Deployment Manifests
            </p>
          </div>
        </div>

        <div className="banner-right">
          <div className="search-bar">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search services..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* 2. Services Grid */}
      <div className="services-grid">
        {filteredServices.map((serviceName) => {
          const serviceSLOs = slos.filter((s) => s.service === serviceName);
          const serviceReqs = requirements.filter((r) => r.service === serviceName);
          const serviceIncidents = incidents.filter(
            (i) => i.service === serviceName && i.status !== "RESOLVED"
          );
          const serviceDeployments = deployments.filter((d) => d.service === serviceName);
          const latestDep = serviceDeployments[0];

          const isFailing = serviceIncidents.length > 0;
          const isDegraded = serviceSLOs.some((s) => (s as any).status === "VIOLATED");
          const statusLabel = isFailing ? "FAILED" : isDegraded ? "DEGRADED" : "HEALTHY";
          const statusClass = statusLabel.toLowerCase();

          return (
            <div key={serviceName} className={`service-card status-${statusClass}`}>
              <div className="card-top-row">
                <div className="service-title-wrap">
                  <Server className="w-5 h-5 text-indigo-400" />
                  <h4>{serviceName}</h4>
                </div>
                <span className={`status-pill ${statusClass}`}>{statusLabel}</span>
              </div>

              <div className="service-stats-grid">
                <div className="stat-box">
                  <span className="stat-label">Requirements</span>
                  <span className="stat-value">{serviceReqs.length}</span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">SLOs</span>
                  <span className="stat-value">{serviceSLOs.length}</span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">Open Incidents</span>
                  <span className={`stat-value ${serviceIncidents.length > 0 ? "text-rose-400 font-bold" : ""}`}>
                    {serviceIncidents.length}
                  </span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">Deployments</span>
                  <span className="stat-value">{serviceDeployments.length}</span>
                </div>
              </div>

              <div className="deployment-meta-footer">
                <div className="meta-line">
                  <span className="label">Candidate Image:</span>
                  <code>{latestDep?.candidateImage || `traceops/${serviceName.toLowerCase()}:v1.0.0`}</code>
                </div>
                <div className="meta-line">
                  <span className="label">Predecessor Image:</span>
                  <code>{latestDep?.predecessorImage || `traceops/${serviceName.toLowerCase()}:stable`}</code>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

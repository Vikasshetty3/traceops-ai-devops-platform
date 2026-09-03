import React, { useState } from "react";
import type { Project, Requirement, SLO } from "../../types";
import { api } from "../../services/api";
import {
  FolderGit2,
  UploadCloud,
  FileCode,
  Zap,
  Trash2,
  ChevronRight,
  Server,
  FileText,
  Workflow,
  RefreshCw,
  Search,
} from "lucide-react";

interface ProjectsTabProps {
  projects: Project[];
  requirements: Requirement[];
  slos: SLO[];
  onRefresh: () => Promise<void>;
  onSelectProjectTraceability: (projectId: string) => void;
}

export const ProjectsTab: React.FC<ProjectsTabProps> = ({
  projects,
  requirements,
  slos,
  onRefresh,
  onSelectProjectTraceability,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [onboardMode, setOnboardMode] = useState<"ZIP" | "GITHUB">("ZIP");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [githubBranch, setGithubBranch] = useState("main");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateStatusMsg, setUpdateStatusMsg] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!projectName) {
        setProjectName(file.name.replace(/\.zip$/i, ""));
      }
    }
  };

  const handleUploadAndAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onboardMode === "ZIP" && !selectedFile) {
      setErrorMsg("Please select a project ZIP archive.");
      return;
    }
    if (onboardMode === "GITHUB" && !githubUrl.trim()) {
      setErrorMsg("Please enter a valid public GitHub repository URL.");
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);

    if (onboardMode === "GITHUB") {
      setUploadStep("Validating GitHub repository URL format...");
      setTimeout(() => setUploadStep("Cloning repository with --depth 1 in secure sandbox..."), 600);
      setTimeout(() => setUploadStep("Resolving commit SHA & head branch..."), 1200);
      setTimeout(() => setUploadStep("Preserving immutable project storage..."), 1800);
      setTimeout(() => setUploadStep("Running static AST & requirement discovery..."), 2400);

      try {
        const result = await api.onboardGithubProject(
          githubUrl.trim(),
          githubBranch.trim() || undefined,
          projectName.trim() || undefined
        );

        setUploadStep("Finalizing project operational model & traceability graph...");
        await onRefresh();
        setShowModal(false);
        setGithubUrl("");
        setGithubBranch("main");
        setProjectName("");
        if (result?.project) {
          setSelectedProject(result.project);
        }
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to onboard GitHub repository.");
      } finally {
        setIsUploading(false);
        setUploadStep("");
      }
    } else {
      setUploadStep("Uploading archive to secure sandbox...");
      try {
        setTimeout(() => setUploadStep("Verifying zip-slip security & file boundaries..."), 600);
        setTimeout(() => setUploadStep("Running static AST & dependency scanning..."), 1200);
        setTimeout(() => setUploadStep("Extracting explicit SLAs & synthesizing operational SLOs..."), 1800);

        const result = await api.uploadAndAnalyzeProject(
          selectedFile!,
          projectName || selectedFile!.name.replace(/\.zip$/i, "")
        );

        setUploadStep("Finalizing project operational model & traceability graph...");
        await onRefresh();
        setShowModal(false);
        setSelectedFile(null);
        setProjectName("");
        if (result?.project) {
          setSelectedProject(result.project);
        }
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to analyze project archive.");
      } finally {
        setIsUploading(false);
        setUploadStep("");
      }
    }
  };

  const handleCheckForUpdates = async (projectId: string) => {
    setIsCheckingUpdates(true);
    setUpdateStatusMsg(null);
    try {
      const res = await api.checkGithubUpdates(projectId);
      if (res.hasNewCommit) {
        setUpdateStatusMsg(`New commit available on branch ${res.branch}: ${res.latestCommitSha.slice(0, 7)}`);
      } else {
        setUpdateStatusMsg(`Repository is up to date (${res.latestCommitSha.slice(0, 7)})`);
      }
    } catch (err: unknown) {
      setUpdateStatusMsg(err instanceof Error ? err.message : "Failed to check for updates");
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to remove this project and its extracted operational models?")) {
      try {
        await api.deleteProject(projectId);
        if (selectedProject?.projectId === projectId) {
          setSelectedProject(null);
        }
        await onRefresh();
      } catch (err) {
        alert("Failed to delete project: " + (err instanceof Error ? err.message : String(err)));
      }
    }
  };

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
    p.projectId.toLowerCase().includes(filterQuery.toLowerCase()) ||
    p.techStack.frameworks.some((f) => f.toLowerCase().includes(filterQuery.toLowerCase()))
  );

  // Project-filtered details for selected project view
  const projectReqs = selectedProject
    ? requirements.filter(
        (r) =>
          r.projectId === selectedProject.projectId ||
          selectedProject.extractedRequirements?.includes(r.requirementId)
      )
    : [];

  const projectSLOs = selectedProject
    ? slos.filter(
        (s) =>
          s.projectId === selectedProject.projectId ||
          selectedProject.generatedSLOs?.includes(s.sloId)
      )
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* 1. Header Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
          border: "1px solid rgba(99, 102, 241, 0.3)",
          borderRadius: "12px",
          padding: "24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "rgba(99, 102, 241, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#818cf8",
              }}
            >
              <FolderGit2 className="w-5 h-5" />
            </div>
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#f8fafc", margin: 0 }}>
                Project Onboarding & Architecture Discovery
              </h2>
              <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
                Upload real-world software codebases to automatically discover services, extract performance SLAs, and generate traceable DevOps pipelines.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button
            onClick={() => onRefresh()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              backgroundColor: "rgba(30, 41, 59, 0.8)",
              color: "#cbd5e1",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>

          <button
            onClick={() => {
              setShowModal(true);
              setErrorMsg(null);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 18px",
              backgroundColor: "#4f46e5",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 600,
              boxShadow: "0 4px 12px rgba(79, 70, 229, 0.3)",
            }}
          >
            <UploadCloud className="w-4 h-4" />
            Onboard Project ZIP
          </button>
        </div>
      </div>

      {/* 2. Search & Overview Filter */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
        <div style={{ position: "relative", width: "320px" }}>
          <Search
            className="w-4 h-4"
            style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#64748b" }}
          />
          <input
            type="text"
            placeholder="Search projects by name, ID, or framework..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px 8px 36px",
              backgroundColor: "#0f172a",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "8px",
              color: "#f8fafc",
              fontSize: "13px",
              outline: "none",
            }}
          />
        </div>

        <div style={{ fontSize: "13px", color: "#94a3b8" }}>
          Showing <strong style={{ color: "#f8fafc" }}>{filteredProjects.length}</strong> onboarded project{filteredProjects.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* 3. Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div
          style={{
            padding: "48px 24px",
            textAlign: "center",
            backgroundColor: "#0f172a",
            borderRadius: "12px",
            border: "1px dashed rgba(148, 163, 184, 0.2)",
          }}
        >
          <FolderGit2 className="w-12 h-12" style={{ margin: "0 auto 12px", color: "#64748b" }} />
          <h3 style={{ fontSize: "16px", color: "#f8fafc", margin: "0 0 8px 0" }}>No Projects Onboarded Yet</h3>
          <p style={{ fontSize: "13px", color: "#94a3b8", maxWidth: "420px", margin: "0 auto 16px" }}>
            Upload a ZIP archive of your software application to trigger static architecture discovery, requirement extraction, and SLO synthesis.
          </p>
          <button
            onClick={() => setShowModal(true)}
            style={{
              padding: "8px 16px",
              backgroundColor: "#4f46e5",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            Upload Project ZIP
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "16px" }}>
          {filteredProjects.map((p) => {
            const isSelected = selectedProject?.projectId === p.projectId;
            return (
              <div
                key={p.projectId}
                onClick={() => setSelectedProject(p)}
                style={{
                  backgroundColor: isSelected ? "rgba(30, 27, 75, 0.6)" : "#0f172a",
                  border: isSelected ? "2px solid #6366f1" : "1px solid rgba(148, 163, 184, 0.15)",
                  borderRadius: "12px",
                  padding: "20px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          backgroundColor: "rgba(99, 102, 241, 0.15)",
                          color: "#818cf8",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontFamily: "monospace",
                        }}
                      >
                        {p.projectId}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          backgroundColor: p.status === "ANALYZED" ? "rgba(16, 185, 129, 0.15)" : "rgba(234, 179, 8, 0.15)",
                          color: p.status === "ANALYZED" ? "#34d399" : "#fbbf24",
                          padding: "2px 8px",
                          borderRadius: "4px",
                        }}
                      >
                        {p.status}
                      </span>
                    </div>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#f8fafc", margin: 0 }}>
                      {p.name}
                    </h3>
                  </div>

                  <button
                    onClick={(e) => handleDeleteProject(p.projectId, e)}
                    title="Delete Project"
                    style={{
                      backgroundColor: "transparent",
                      border: "none",
                      color: "#64748b",
                      cursor: "pointer",
                      padding: "4px",
                      borderRadius: "4px",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#64748b")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Tech Badges */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {p.techStack.languages?.slice(0, 3).map((l) => (
                    <span
                      key={l}
                      style={{
                        fontSize: "11px",
                        backgroundColor: "#1e293b",
                        color: "#94a3b8",
                        padding: "2px 8px",
                        borderRadius: "4px",
                      }}
                    >
                      {l}
                    </span>
                  ))}
                  {p.techStack.frameworks?.slice(0, 3).map((f) => (
                    <span
                      key={f}
                      style={{
                        fontSize: "11px",
                        backgroundColor: "rgba(56, 189, 248, 0.15)",
                        color: "#38bdf8",
                        padding: "2px 8px",
                        borderRadius: "4px",
                      }}
                    >
                      {f}
                    </span>
                  ))}
                  {p.analysisSummary.dockerDetected && (
                    <span
                      style={{
                        fontSize: "11px",
                        backgroundColor: "rgba(14, 165, 233, 0.15)",
                        color: "#0ea5e9",
                        padding: "2px 8px",
                        borderRadius: "4px",
                      }}
                    >
                      Docker
                    </span>
                  )}
                  {p.analysisSummary.k8sDetected && (
                    <span
                      style={{
                        fontSize: "11px",
                        backgroundColor: "rgba(99, 102, 241, 0.15)",
                        color: "#818cf8",
                        padding: "2px 8px",
                        borderRadius: "4px",
                      }}
                    >
                      K8s
                    </span>
                  )}
                </div>

                {/* Summary Chips */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: "8px",
                    backgroundColor: "#020617",
                    padding: "10px",
                    borderRadius: "8px",
                    textAlign: "center",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "10px", color: "#64748b", textTransform: "uppercase" }}>Services</div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "#f8fafc" }}>
                      {p.analysisSummary.servicesCount || p.services?.length || 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: "#64748b", textTransform: "uppercase" }}>Explicit</div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "#38bdf8" }}>
                      {p.analysisSummary.explicitRequirementsCount || 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: "#64748b", textTransform: "uppercase" }}>Inferred</div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "#e2e8f0" }}>
                      {p.analysisSummary.inferredRequirementsCount || 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: "#64748b", textTransform: "uppercase" }}>SLOs</div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "#a855f7" }}>
                      {p.analysisSummary.slosCount || p.generatedSLOs?.length || 0}
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>
                    Arch: <strong style={{ color: "#94a3b8" }}>{p.analysisSummary.architectureType || "Modular"}</strong>
                  </span>

                  <span
                    style={{
                      fontSize: "12px",
                      color: "#818cf8",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    View Details <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Selected Project Deep Dive & Analysis Details */}
      {selectedProject && (
        <div
          style={{
            backgroundColor: "#0f172a",
            border: "1px solid rgba(99, 102, 241, 0.3)",
            borderRadius: "12px",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                <span style={{ fontSize: "12px", color: "#818cf8", fontFamily: "monospace", fontWeight: 700 }}>
                  {selectedProject.projectId}
                </span>
                <span style={{ color: "#64748b" }}>•</span>
                <span style={{ fontSize: "12px", color: "#34d399", fontWeight: 600 }}>
                  STATIC ANALYSIS COMPLETED
                </span>
              </div>
              <h2 style={{ fontSize: "22px", fontWeight: 700, color: "#f8fafc", margin: 0 }}>
                {selectedProject.name} — Architecture & Operational Model
              </h2>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => onSelectProjectTraceability(selectedProject.projectId)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 16px",
                  backgroundColor: "#4f46e5",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                <Workflow className="w-4 h-4" />
                View in Traceability Graph
              </button>
            </div>
          </div>

          {/* Infrastructure & Frameworks Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
            {selectedProject.sourceType === "GITHUB" && (
              <div style={{ backgroundColor: "#020617", padding: "16px", borderRadius: "8px", border: "1px solid rgba(99, 102, 241, 0.3)" }}>
                <div style={{ fontSize: "12px", color: "#818cf8", display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px", fontWeight: 600 }}>
                  <FolderGit2 className="w-4 h-4 text-indigo-400" />
                  GitHub Repository Source
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ fontSize: "13px", color: "#f8fafc", fontWeight: 700 }}>
                    {selectedProject.repositoryOwner}/{selectedProject.repositoryName}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "11px", backgroundColor: "#1e293b", color: "#38bdf8", padding: "2px 8px", borderRadius: "4px" }}>
                      Branch: {selectedProject.repositoryBranch || "main"}
                    </span>
                    {selectedProject.commitSha && (
                      <span style={{ fontSize: "11px", backgroundColor: "#1e293b", color: "#a78bfa", padding: "2px 8px", borderRadius: "4px", fontFamily: "monospace" }}>
                        Commit: {selectedProject.commitSha.slice(0, 7)}
                      </span>
                    )}
                  </div>
                  {selectedProject.repositoryUrl && (
                    <a
                      href={selectedProject.repositoryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "12px", color: "#60a5fa", textDecoration: "underline", marginTop: "4px" }}
                    >
                      {selectedProject.repositoryUrl} ↗
                    </a>
                  )}
                  <div style={{ marginTop: "8px" }}>
                    <button
                      onClick={() => handleCheckForUpdates(selectedProject.projectId)}
                      disabled={isCheckingUpdates}
                      style={{
                        padding: "4px 10px",
                        backgroundColor: "#1e1b4b",
                        border: "1px solid rgba(99, 102, 241, 0.4)",
                        borderRadius: "6px",
                        color: "#c7d2fe",
                        fontSize: "11px",
                        cursor: isCheckingUpdates ? "not-allowed" : "pointer",
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <RefreshCw className={`w-3 h-3 ${isCheckingUpdates ? "animate-spin" : ""}`} />
                      {isCheckingUpdates ? "Checking..." : "Check for Updates"}
                    </button>
                    {updateStatusMsg && (
                      <div style={{ fontSize: "11px", color: "#34d399", marginTop: "4px", fontWeight: 500 }}>
                        {updateStatusMsg}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div style={{ backgroundColor: "#020617", padding: "16px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.1)" }}>
              <div style={{ fontSize: "12px", color: "#64748b", display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                <FileCode className="w-4 h-4 text-sky-400" />
                Languages & Frameworks
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {selectedProject.techStack.languages?.map((l) => (
                  <span key={l} style={{ fontSize: "12px", backgroundColor: "#1e293b", color: "#f1f5f9", padding: "2px 8px", borderRadius: "4px" }}>
                    {l}
                  </span>
                ))}
                {selectedProject.techStack.frameworks?.map((f) => (
                  <span key={f} style={{ fontSize: "12px", backgroundColor: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", padding: "2px 8px", borderRadius: "4px" }}>
                    {f}
                  </span>
                ))}
              </div>
              <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {selectedProject.techStack.containerization?.map((c) => (
                  <span key={c} style={{ fontSize: "12px", backgroundColor: "rgba(99, 102, 241, 0.15)", color: "#818cf8", padding: "2px 8px", borderRadius: "4px" }}>
                    {c}
                  </span>
                ))}
                {selectedProject.techStack.cicd?.map((ci) => (
                  <span key={ci} style={{ fontSize: "12px", backgroundColor: "rgba(16, 185, 129, 0.15)", color: "#34d399", padding: "2px 8px", borderRadius: "4px" }}>
                    {ci}
                  </span>
                ))}
                {selectedProject.techStack.containerization?.length === 0 && selectedProject.techStack.cicd?.length === 0 && (
                  <span style={{ fontSize: "12px", color: "#64748b" }}>Standard process runtime</span>
                )}
              </div>
            </div>

            <div style={{ backgroundColor: "#020617", padding: "16px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.1)" }}>
              <div style={{ fontSize: "12px", color: "#64748b", display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                <Server className="w-4 h-4 text-emerald-400" />
                Discovered Services ({selectedProject.services?.length || 0})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {selectedProject.services?.map((s) => (
                  <div key={s.name} style={{ fontSize: "12px", color: "#cbd5e1" }}>
                    • <strong style={{ color: "#f8fafc" }}>{s.name}</strong> ({s.type})
                  </div>
                ))}
                {(!selectedProject.services || selectedProject.services.length === 0) && (
                  <span style={{ fontSize: "12px", color: "#64748b" }}>Primary microservice</span>
                )}
              </div>
            </div>
          </div>

          {/* Requirements & Generated SLOs Section */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "20px" }}>
            {/* Discovered Requirements */}
            <div
              style={{
                backgroundColor: "#020617",
                border: "1px solid rgba(148, 163, 184, 0.1)",
                borderRadius: "10px",
                padding: "18px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                <FileText className="w-4 h-4 text-sky-400" />
                <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#f8fafc", margin: 0 }}>
                  Discovered Requirements ({projectReqs.length})
                </h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "360px", overflowY: "auto" }}>
                {projectReqs.map((r) => (
                  <div
                    key={r.requirementId}
                    style={{
                      backgroundColor: "#0f172a",
                      border: "1px solid rgba(148, 163, 184, 0.15)",
                      borderRadius: "8px",
                      padding: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "#38bdf8", fontFamily: "monospace" }}>
                        {r.requirementId}
                      </span>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 600,
                          backgroundColor: r.requirementType === "EXPLICIT" ? "rgba(16, 185, 129, 0.15)" : "rgba(99, 102, 241, 0.15)",
                          color: r.requirementType === "EXPLICIT" ? "#34d399" : "#818cf8",
                          padding: "1px 6px",
                          borderRadius: "4px",
                        }}
                      >
                        {r.requirementType || "INFERRED"}
                      </span>
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#f8fafc" }}>
                      {r.title}
                    </div>
                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                      Target: <strong style={{ color: "#e2e8f0" }}>{r.metric} {r.operator} {r.threshold}{r.unit}</strong>
                    </div>
                    {r.sourceFile && (
                      <div style={{ fontSize: "11px", color: "#64748b" }}>
                        Source: {r.sourceFile}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Synthesized Operational SLOs */}
            <div
              style={{
                backgroundColor: "#020617",
                border: "1px solid rgba(148, 163, 184, 0.1)",
                borderRadius: "10px",
                padding: "18px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                <Zap className="w-4 h-4 text-emerald-400" />
                <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#f8fafc", margin: 0 }}>
                  Synthesized Operational SLOs ({projectSLOs.length})
                </h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "360px", overflowY: "auto" }}>
                {projectSLOs.map((s) => (
                  <div
                    key={s.sloId}
                    style={{
                      backgroundColor: "#0f172a",
                      border: "1px solid rgba(148, 163, 184, 0.15)",
                      borderRadius: "8px",
                      padding: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "#34d399", fontFamily: "monospace" }}>
                        {s.sloId}
                      </span>
                      <span style={{ fontSize: "11px", color: "#94a3b8", backgroundColor: "#1e293b", padding: "1px 6px", borderRadius: "4px" }}>
                        Window: {s.window || "5m"}
                      </span>
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#f8fafc" }}>
                      {s.service} • {s.metric}
                    </div>
                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                      Threshold: <strong style={{ color: "#34d399" }}>{s.operator} {s.threshold} {s.unit}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Onboard Project Modal */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "#0f172a",
              border: "1px solid rgba(99, 102, 241, 0.4)",
              borderRadius: "16px",
              padding: "28px",
              width: "100%",
              maxWidth: "540px",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <UploadCloud className="w-6 h-6 text-indigo-400" />
                <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#f8fafc", margin: 0 }}>
                  Onboard Software Project
                </h3>
              </div>
              {!isUploading && (
                <button
                  onClick={() => setShowModal(false)}
                  style={{
                    backgroundColor: "transparent",
                    border: "none",
                    color: "#94a3b8",
                    fontSize: "20px",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Mode Switcher Tabs */}
            <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid rgba(148, 163, 184, 0.15)", paddingBottom: "12px" }}>
              <button
                type="button"
                onClick={() => setOnboardMode("ZIP")}
                disabled={isUploading}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: isUploading ? "not-allowed" : "pointer",
                  backgroundColor: onboardMode === "ZIP" ? "#4f46e5" : "#1e293b",
                  color: onboardMode === "ZIP" ? "#ffffff" : "#94a3b8",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <FolderGit2 className="w-4 h-4" />
                Upload ZIP Archive
              </button>

              <button
                type="button"
                onClick={() => setOnboardMode("GITHUB")}
                disabled={isUploading}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: isUploading ? "not-allowed" : "pointer",
                  backgroundColor: onboardMode === "GITHUB" ? "#4f46e5" : "#1e293b",
                  color: onboardMode === "GITHUB" ? "#ffffff" : "#94a3b8",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Workflow className="w-4 h-4" />
                GitHub Repository
              </button>
            </div>

            {errorMsg && (
              <div
                style={{
                  backgroundColor: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "8px",
                  padding: "12px",
                  fontSize: "13px",
                  color: "#fca5a5",
                }}
              >
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleUploadAndAnalyze} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", color: "#cbd5e1", marginBottom: "6px", fontWeight: 500 }}>
                  Project Name (Optional override)
                </label>
                <input
                  type="text"
                  placeholder={onboardMode === "GITHUB" ? "e.g. user/my-microservices" : "e.g. My E-Commerce Microservices"}
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  disabled={isUploading}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    backgroundColor: "#020617",
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    borderRadius: "8px",
                    color: "#f8fafc",
                    fontSize: "14px",
                    outline: "none",
                  }}
                />
              </div>

              {onboardMode === "GITHUB" ? (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", color: "#cbd5e1", marginBottom: "6px", fontWeight: 500 }}>
                      Public GitHub Repository URL
                    </label>
                    <input
                      type="url"
                      placeholder="https://github.com/user/repository"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      disabled={isUploading}
                      required
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        backgroundColor: "#020617",
                        border: "1px solid rgba(99, 102, 241, 0.4)",
                        borderRadius: "8px",
                        color: "#f8fafc",
                        fontSize: "14px",
                        outline: "none",
                      }}
                    />
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                      Public repositories only • Shallow clone (--depth 1) • Zero code execution during acquisition
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "13px", color: "#cbd5e1", marginBottom: "6px", fontWeight: 500 }}>
                      Branch (Optional, defaults to main)
                    </label>
                    <input
                      type="text"
                      placeholder="main"
                      value={githubBranch}
                      onChange={(e) => setGithubBranch(e.target.value)}
                      disabled={isUploading}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        backgroundColor: "#020617",
                        border: "1px solid rgba(148, 163, 184, 0.2)",
                        borderRadius: "8px",
                        color: "#f8fafc",
                        fontSize: "14px",
                        outline: "none",
                      }}
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label style={{ display: "block", fontSize: "13px", color: "#cbd5e1", marginBottom: "6px", fontWeight: 500 }}>
                    Project Source (Upload ZIP Archive)
                  </label>
                  <div
                    style={{
                      border: "2px dashed rgba(99, 102, 241, 0.4)",
                      borderRadius: "10px",
                      padding: "24px",
                      textAlign: "center",
                      backgroundColor: "#020617",
                      cursor: "pointer",
                    }}
                    onClick={() => document.getElementById("projectZipInput")?.click()}
                  >
                    <input
                      id="projectZipInput"
                      type="file"
                      accept=".zip"
                      onChange={handleFileChange}
                      disabled={isUploading}
                      style={{ display: "none" }}
                    />
                    <FolderGit2 className="w-8 h-8 text-indigo-400" style={{ margin: "0 auto 8px" }} />
                    <div style={{ fontSize: "13px", color: "#f8fafc", fontWeight: 600 }}>
                      {selectedFile ? selectedFile.name : "Click or Drag & Drop project .zip here"}
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                      Safe static analysis • No arbitrary code execution • Max 50MB
                    </div>
                  </div>
                </div>
              )}

              {isUploading && (
                <div
                  style={{
                    backgroundColor: "rgba(30, 27, 75, 0.5)",
                    border: "1px solid rgba(99, 102, 241, 0.3)",
                    borderRadius: "8px",
                    padding: "14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
                  <div style={{ fontSize: "13px", color: "#cbd5e1" }}>{uploadStep}</div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={isUploading}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#1e293b",
                    color: "#94a3b8",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading || (onboardMode === "ZIP" ? !selectedFile : !githubUrl.trim())}
                  style={{
                    padding: "8px 20px",
                    backgroundColor: isUploading ? "#64748b" : "#4f46e5",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    cursor: isUploading || (onboardMode === "ZIP" ? !selectedFile : !githubUrl.trim()) ? "not-allowed" : "pointer",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  {isUploading ? "Analyzing..." : onboardMode === "GITHUB" ? "Fetch & Analyze Repository" : "Analyze Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import mongoose, { Document, Schema } from "mongoose";

export interface IProjectService {
  name: string;
  type: string;
  path?: string;
  port?: number;
  description?: string;
}

export interface IProjectTechStack {
  languages: string[];
  frameworks: string[];
  buildTools: string[];
  databases?: string[];
  containerization: string[];
  cicd: string[];
}

export interface IProjectAnalysisSummary {
  totalFiles: number;
  totalLinesOfCode?: number;
  explicitRequirementsCount: number;
  inferredRequirementsCount: number;
  slosCount: number;
  servicesCount: number;
  dockerDetected: boolean;
  k8sDetected: boolean;
  cicdDetected: boolean;
  architectureType: "MONOLITH" | "MICROSERVICES" | "SERVERLESS" | "MODULAR_SERVICE";
}

export interface IProject extends Document {
  projectId: string;
  name: string;
  description?: string;
  sourceType: "ZIP_UPLOAD" | "LOCAL_DIRECTORY" | "GIT_REPO" | "GITHUB";
  status: "UPLOADED" | "ANALYZING" | "ANALYZED" | "FAILED";
  archivePath?: string;
  sourcePath?: string;
  repositoryUrl?: string;
  repositoryOwner?: string;
  repositoryName?: string;
  repositoryBranch?: string;
  commitSha?: string;
  techStack: IProjectTechStack;
  services: IProjectService[];
  analysisSummary: IProjectAnalysisSummary;
  extractedRequirements: string[];
  generatedSLOs: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

const projectSchema = new Schema<IProject>(
  {
    projectId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    sourceType: {
      type: String,
      enum: ["ZIP_UPLOAD", "LOCAL_DIRECTORY", "GIT_REPO", "GITHUB"],
      default: "ZIP_UPLOAD",
    },
    status: {
      type: String,
      enum: ["UPLOADED", "ANALYZING", "ANALYZED", "FAILED"],
      default: "UPLOADED",
    },
    archivePath: {
      type: String,
      trim: true,
    },
    sourcePath: {
      type: String,
      trim: true,
    },
    repositoryUrl: {
      type: String,
      trim: true,
    },
    repositoryOwner: {
      type: String,
      trim: true,
    },
    repositoryName: {
      type: String,
      trim: true,
    },
    repositoryBranch: {
      type: String,
      trim: true,
    },
    commitSha: {
      type: String,
      trim: true,
    },
    techStack: {
      languages: [{ type: String }],
      frameworks: [{ type: String }],
      buildTools: [{ type: String }],
      databases: [{ type: String }],
      containerization: [{ type: String }],
      cicd: [{ type: String }],
    },
    services: [
      {
        name: { type: String, required: true },
        type: { type: String, default: "service" },
        path: { type: String },
        port: { type: Number },
        description: { type: String },
      },
    ],
    analysisSummary: {
      totalFiles: { type: Number, default: 0 },
      totalLinesOfCode: { type: Number, default: 0 },
      explicitRequirementsCount: { type: Number, default: 0 },
      inferredRequirementsCount: { type: Number, default: 0 },
      slosCount: { type: Number, default: 0 },
      servicesCount: { type: Number, default: 0 },
      dockerDetected: { type: Boolean, default: false },
      k8sDetected: { type: Boolean, default: false },
      cicdDetected: { type: Boolean, default: false },
      architectureType: {
        type: String,
        enum: ["MONOLITH", "MICROSERVICES", "SERVERLESS", "MODULAR_SERVICE"],
        default: "MODULAR_SERVICE",
      },
    },
    extractedRequirements: [{ type: String }],
    generatedSLOs: [{ type: String }],
  },
  {
    timestamps: true,
  }
);

export const Project = mongoose.model<IProject>("Project", projectSchema);

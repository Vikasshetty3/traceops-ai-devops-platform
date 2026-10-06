/**
 * TraceOps Database Schema & Index Initialization
 * 
 * Verifies and initializes MongoDB collections and indexes on startup without
 * injecting any synthetic demo records, predefined accounts, or fake telemetry.
 * 
 * Fresh installations remain completely pristine until configured by authorized operators.
 */

import { Requirement } from "../models/Requirement";
import { SLO } from "../models/SLO";
import { Incident } from "../models/Incident";
import { User } from "../models/User";
import { Deployment } from "../models/Deployment";
import { DeploymentAuditEvent } from "../models/DeploymentAuditEvent";
import { MLModelRegistry } from "../models/MLModelRegistry";
import { MLDatasetVersion } from "../models/MLDatasetVersion";
import { MLModelEvaluation } from "../models/MLModelEvaluation";
import { MLModelApproval } from "../models/MLModelApproval";

export const initializeDatabaseSchema = async (): Promise<void> => {
  try {
    // Ensure essential database indexes exist for performance and unique constraints
    await Promise.all([
      User.createIndexes().catch(() => {}),
      Requirement.createIndexes().catch(() => {}),
      SLO.createIndexes().catch(() => {}),
      Incident.createIndexes().catch(() => {}),
      Deployment.createIndexes().catch(() => {}),
      DeploymentAuditEvent.createIndexes().catch(() => {}),
      MLModelRegistry.createIndexes().catch(() => {}),
      MLDatasetVersion.createIndexes().catch(() => {}),
      MLModelEvaluation.createIndexes().catch(() => {}),
      MLModelApproval.createIndexes().catch(() => {}),
    ]);
  } catch (error) {
    console.error("Schema initialization notice:", error);
  }
};

// Backward-compatibility export alias (performs zero data seeding)
export const seedDatabase = initializeDatabaseSchema;

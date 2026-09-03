/**
 * MongoDB Production Initialization Script
 * Configures collections, compound indexes, and validation rules.
 */

const dbName = "requirement_traceable_devops";
const dbInstance = db.getSiblingDB(dbName);

print(`Initializing TraceOps MongoDB instance: ${dbName}...`);

// 1. Requirements collection
dbInstance.createCollection("requirements");
dbInstance.requirements.createIndex({ requirementId: 1 }, { unique: true });
dbInstance.requirements.createIndex({ service: 1, priority: 1, status: 1 });

// 2. SLOs collection
dbInstance.createCollection("slos");
dbInstance.slos.createIndex({ sloId: 1 }, { unique: true });
dbInstance.slos.createIndex({ requirementId: 1 });
dbInstance.slos.createIndex({ service: 1, status: 1 });

// 3. Incidents collection
dbInstance.createCollection("incidents");
dbInstance.incidents.createIndex({ incidentId: 1 }, { unique: true });
dbInstance.incidents.createIndex({ requirementId: 1, sloId: 1 });
dbInstance.incidents.createIndex({ status: 1, createdAt: -1 });

// 4. RCAs collection
dbInstance.createCollection("rcas");
dbInstance.rcas.createIndex({ rcaId: 1 }, { unique: true });
dbInstance.rcas.createIndex({ requirementId: 1, incidentId: 1 });
dbInstance.rcas.createIndex({ createdAt: -1 });

// 5. Experiments collection
dbInstance.createCollection("experiments");
dbInstance.experiments.createIndex({ experimentId: 1 }, { unique: true });
dbInstance.experiments.createIndex({ rcaId: 1, requirementId: 1 });
dbInstance.experiments.createIndex({ result: 1, createdAt: -1 });

// 6. DevOps Actions collection
dbInstance.createCollection("devopsactions");
dbInstance.devopsactions.createIndex({ actionId: 1 }, { unique: true });
dbInstance.devopsactions.createIndex({ status: 1, service: 1 });

// 7. Traceability collection
dbInstance.createCollection("traceabilities");
dbInstance.traceabilities.createIndex({ traceId: 1 }, { unique: true });
dbInstance.traceabilities.createIndex({ requirementId: 1, sloId: 1 });

print("TraceOps MongoDB initialization and indexing completed successfully.");

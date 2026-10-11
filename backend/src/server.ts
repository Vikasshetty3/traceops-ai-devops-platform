import app from "./app";
import { connectDatabase } from "./config/database";
import { env, validateProductionConfig } from "./config/env";
import { initializeDatabaseSchema } from "./config/seed";
import { MLGovernanceService } from "./services/mlGovernanceService";
import { sloMonitoringDaemon } from "./services/sloMonitoringDaemon";

const startServer = async (): Promise<void> => {
  const configValidation = validateProductionConfig();
  if (!configValidation.valid) {
    console.error("[CRITICAL CONFIGURATION ERROR] Production startup blocked due to configuration errors:");
    configValidation.errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }

  await connectDatabase();
  await initializeDatabaseSchema();
  await MLGovernanceService.seedBaselineModels().catch((err) =>
    console.warn("[MLGovernance] Notice: Baseline seeding:", err.message)
  );

  const server = app.listen(env.PORT, () => {
    console.log(`Backend server running on http://localhost:${env.PORT}`);
    sloMonitoringDaemon.start();
  });

  const handleShutdown = (signal: string) => {
    console.log(`Received ${signal}. Initiating graceful shutdown...`);
    sloMonitoringDaemon.stop();
    server.close(() => {
      console.log("HTTP server closed.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
  process.on("SIGINT", () => handleShutdown("SIGINT"));
};

startServer();
import app from "./app";
import { connectDatabase } from "./config/database";
import { env } from "./config/env";
import { initializeDatabaseSchema } from "./config/seed";
import { MLGovernanceService } from "./services/mlGovernanceService";
import { sloMonitoringDaemon } from "./services/sloMonitoringDaemon";

const startServer = async (): Promise<void> => {
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
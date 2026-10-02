import app from "./app";
import { connectDatabase } from "./config/database";
import { env } from "./config/env";
import { seedDatabase } from "./config/seed";
import { sloMonitoringDaemon } from "./services/sloMonitoringDaemon";

const startServer = async (): Promise<void> => {
  await connectDatabase();
  await seedDatabase();

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
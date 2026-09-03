import app from "./app";
import { connectDatabase } from "./config/database";
import { env } from "./config/env";
import { seedDatabase } from "./config/seed";

const startServer = async (): Promise<void> => {
  await connectDatabase();
  await seedDatabase();

  app.listen(env.PORT, () => {
    console.log(`Backend server running on http://localhost:${env.PORT}`);
  });
};

startServer();
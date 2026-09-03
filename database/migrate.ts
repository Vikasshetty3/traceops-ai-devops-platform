import mongoose from "mongoose";
import { connectDatabase } from "../backend/src/config/database";
import { seedDatabase } from "../backend/src/config/seed";

async function runMigration() {
  console.log("Starting TraceOps Database Migration & Seed Routine...");
  await connectDatabase();
  await seedDatabase();
  console.log("Migration finished successfully.");
  await mongoose.disconnect();
  process.exit(0);
}

runMigration().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

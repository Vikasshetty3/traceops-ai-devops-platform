/**
 * TRACEOPS — DATABASE DEMO ACCOUNT CLEANUP SCRIPT
 * 
 * Safely removes seeded default demo accounts (user/user123, admin/admin123)
 * while preserving all historical operational telemetry and regression verification data.
 */

const path = require("path");
const mongoose = require(path.join(__dirname, "../backend/node_modules/mongoose"));
const { User } = require(path.join(__dirname, "../backend/dist/backend/src/models/User"));

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/requirement_traceable_devops";

async function cleanDemoData() {
  await mongoose.connect(MONGO_URI);
  console.log(`Connected to MongoDB: ${MONGO_URI}`);

  // 1. Identify demo accounts
  const demoUsers = await User.find({
    $or: [
      { userId: { $in: ["USR-DEMO-001", "USR-ADMIN-001"] } },
      { username: { $in: ["user", "admin"] } },
    ],
  });

  console.log(`Found ${demoUsers.length} default seeded demo accounts:`);
  for (const u of demoUsers) {
    console.log(`  - ${u.userId} (${u.username} / ${u.email} / Role: ${u.role})`);
  }

  // 2. Delete default demo accounts
  const delUsers = await User.deleteMany({
    $or: [
      { userId: { $in: ["USR-DEMO-001", "USR-ADMIN-001"] } },
      { username: { $in: ["user", "admin"] } },
    ],
  });

  console.log(`\nSuccessfully deleted ${delUsers.deletedCount} default demo user accounts.`);

  const remainingUsers = await User.countDocuments();
  console.log(`Remaining registered users: ${remainingUsers}`);

  await mongoose.disconnect();
}

cleanDemoData().catch(console.error);

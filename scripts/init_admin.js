#!/usr/bin/env node
/**
 * TRACEOPS — FIRST ADMINISTRATOR INITIALIZATION CLI
 * 
 * Allows a DevOps cluster operator to securely initialize the initial platform
 * administrator without hardcoding credentials in repository source files or templates.
 * 
 * Usage:
 *   node scripts/init_admin.js --username <username> --email <email> --password <password> [--name <name>]
 *   OR set environment variables:
 *   ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME
 */

const path = require("path");
const mongoose = require(path.join(__dirname, "../backend/node_modules/mongoose"));
const { User } = require(path.join(__dirname, "../backend/dist/backend/src/models/User"));
const { AuthService } = require(path.join(__dirname, "../backend/dist/backend/src/services/authService"));

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://localhost:27017/requirement_traceable_devops";

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true;
      parsed[key] = val;
    }
  }
  return {
    username: parsed.username || process.env.ADMIN_USERNAME,
    email: parsed.email || process.env.ADMIN_EMAIL,
    password: parsed.password || process.env.ADMIN_PASSWORD,
    name: parsed.name || process.env.ADMIN_NAME || "System Administrator",
    secret: parsed.secret || process.env.ADMIN_INIT_SECRET,
  };
}

async function main() {
  const opts = parseArgs();

  if (!opts.username || !opts.email || !opts.password) {
    console.error("Error: Missing required parameters.");
    console.error("Usage: node scripts/init_admin.js --username <username> --email <email> --password <password> [--name <name>]");
    process.exit(1);
  }

  if (opts.password.length < 6) {
    console.error("Error: Administrator password must be at least 6 characters in length.");
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGO_URI);
    console.log(`Connected to database: ${MONGO_URI}`);

    const existingAdminCount = await User.countDocuments({ role: "ADMIN" });
    if (existingAdminCount > 0) {
      console.error("Error: Administrator already initialized on this platform deployment.");
      await mongoose.disconnect();
      process.exit(1);
    }

    const result = await AuthService.initializeFirstAdmin({
      username: opts.username,
      email: opts.email,
      password: opts.password,
      name: opts.name,
      initSecret: opts.secret,
    });

    console.log("================================================================================");
    console.log("TraceOps Administrator Initialized Successfully");
    console.log(`  User ID:   ${result.user.userId}`);
    console.log(`  Username:  ${result.user.username}`);
    console.log(`  Email:     ${result.user.email}`);
    console.log(`  Role:      ${result.user.role}`);
    console.log("================================================================================");
    console.log("Security Notice: Password has been securely hashed with bcrypt.");
    console.log("The administrator can now log in via the TraceOps Web UI or API.");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Administrator initialization failed:", error.message || error);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  }
}

main();

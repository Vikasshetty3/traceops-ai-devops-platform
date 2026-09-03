import dotenv from "dotenv";

dotenv.config();

export const env = {
  PORT: Number(process.env.PORT) || 5000,
  MONGODB_URI:
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/requirement_traceable_devops",
  NODE_ENV: process.env.NODE_ENV || "development",
};
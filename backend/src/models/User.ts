import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  userId: string;
  username: string;
  email: string;
  passwordHash: string;
  name: string;
  role: "USER" | "ADMIN";
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ["USER", "ADMIN"], default: "USER" },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>("User", userSchema);

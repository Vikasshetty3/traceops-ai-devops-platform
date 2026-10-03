import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { User, IUser } from "../models/User";
import { env } from "../config/env";

export interface TokenPayload {
  userId: string;
  username: string;
  email: string;
  role: "USER" | "ADMIN";
  name: string;
}

export interface AuthResult {
  user: {
    userId: string;
    username: string;
    email: string;
    name: string;
    role: "USER" | "ADMIN";
    createdAt: Date;
  };
  token: string;
}

export class AuthService {
  private static readonly SALT_ROUNDS = 10;
  private static readonly TOKEN_EXPIRY = "7d";

  public static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  public static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  public static generateToken(user: IUser | TokenPayload): string {
    const payload: TokenPayload = {
      userId: user.userId,
      username: user.username,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: this.TOKEN_EXPIRY,
    });
  }

  public static verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
      return decoded;
    } catch {
      return null;
    }
  }

  public static async getAuthStatus(): Promise<{ adminInitialized: boolean; totalUsers: number }> {
    const [adminCount, totalUsers] = await Promise.all([
      User.countDocuments({ role: "ADMIN" }),
      User.countDocuments(),
    ]);
    return {
      adminInitialized: adminCount > 0,
      totalUsers,
    };
  }

  public static async initializeFirstAdmin(params: {
    username: string;
    email: string;
    password: string;
    name?: string;
    initSecret?: string;
  }): Promise<AuthResult> {
    const adminCount = await User.countDocuments({ role: "ADMIN" });
    if (adminCount > 0) {
      throw new Error("Forbidden: Administrator has already been initialized on this instance");
    }

    const requiredSecret = process.env.ADMIN_INIT_SECRET;
    if (requiredSecret && params.initSecret !== requiredSecret) {
      throw new Error("Forbidden: Invalid administrator initialization secret");
    }

    return this.registerUser({
      username: params.username,
      email: params.email,
      password: params.password,
      name: params.name || "System Administrator",
      role: "ADMIN",
      allowAdminRole: true,
    });
  }

  public static async registerUser(params: {
    username: string;
    email: string;
    password: string;
    name: string;
    role?: "USER" | "ADMIN";
    allowAdminRole?: boolean;
  }): Promise<AuthResult> {
    const username = params.username.trim().toLowerCase();
    const email = params.email.trim().toLowerCase();

    if (!username || username.length < 3) {
      throw new Error("Validation Error: Username must be at least 3 characters");
    }

    if (!email || !email.includes("@")) {
      throw new Error("Validation Error: Valid email address is required");
    }

    if (!params.password || params.password.length < 6) {
      throw new Error("Validation Error: Password must be at least 6 characters");
    }

    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
    });

    if (existingUser) {
      if (existingUser.username === username) {
        throw new Error(`Conflict: Username "${username}" is already registered`);
      }
      throw new Error(`Conflict: Email "${email}" is already registered`);
    }

    const passwordHash = await this.hashPassword(params.password);
    const userId = `USR-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
    const assignedRole = params.role === "ADMIN" && params.allowAdminRole ? "ADMIN" : "USER";

    const user = new User({
      userId,
      username,
      email,
      passwordHash,
      name: params.name.trim() || username,
      role: assignedRole,
    });

    await user.save();

    const token = this.generateToken(user);

    return {
      user: {
        userId: user.userId,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
      token,
    };
  }

  public static async authenticate(identifier: string, password: string): Promise<AuthResult> {
    const cleanId = (identifier || "").trim().toLowerCase();

    if (!cleanId || !password) {
      throw new Error("Authentication Error: Identifier and password are required");
    }

    const user = await User.findOne({
      $or: [{ username: cleanId }, { email: cleanId }],
    });

    if (!user) {
      throw new Error("Authentication Error: Invalid username/email or password");
    }

    const isMatch = await this.comparePassword(password, user.passwordHash);
    if (!isMatch) {
      throw new Error("Authentication Error: Invalid username/email or password");
    }

    const token = this.generateToken(user);

    return {
      user: {
        userId: user.userId,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
      token,
    };
  }

  public static async getUserById(userId: string): Promise<IUser | null> {
    return User.findOne({ userId });
  }

  public static async getAllUsers(): Promise<IUser[]> {
    return User.find().sort({ createdAt: -1 });
  }
}

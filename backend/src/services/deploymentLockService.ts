import crypto from "crypto";
import { DeploymentLock, IDeploymentLock } from "../models/DeploymentLock";

export class DeploymentLockConflictError extends Error {
  public readonly statusCode = 409;
  public readonly service: string;
  public readonly existingRepairId: string;
  public readonly expiresAt: Date;

  constructor(service: string, existingRepairId: string, expiresAt: Date) {
    super(
      `Deployment Lock Conflict: Service "${service}" currently has an active deployment lock held by repair ${existingRepairId} (lease expires at ${expiresAt.toISOString()}). Concurrent deployments are blocked.`
    );
    this.name = "DeploymentLockConflictError";
    this.service = service;
    this.existingRepairId = existingRepairId;
    this.expiresAt = expiresAt;
  }
}

export class DeploymentLockService {
  private static readonly DEFAULT_TTL_MS = 300000; // 5 minutes
  private static registeredShutdownHooks = false;

  public static init(): void {
    if (this.registeredShutdownHooks) return;
    this.registeredShutdownHooks = true;

    // Graceful release on process termination
    const handleShutdown = async (signal: string) => {
      try {
        console.log(`[DeploymentLockService] Received ${signal}. Releasing held deployment locks...`);
        await DeploymentLock.updateMany(
          { status: "HELD" },
          {
            $set: {
              status: "RELEASED",
              releaseReason: `PROCESS_${signal}_SHUTDOWN`,
              releasedAt: new Date(),
            },
          }
        ).exec();
      } catch (err) {
        console.error("[DeploymentLockService] Error releasing locks on shutdown:", err);
      }
    };

    process.once("SIGINT", () => handleShutdown("SIGINT"));
    process.once("SIGTERM", () => handleShutdown("SIGTERM"));
  }

  /**
   * Atomically acquires a deployment concurrency lock for the specified service.
   * Enforces:
   * - Single active deployment per service
   * - Atomic acquisition via findOneAndUpdate
   * - Idempotency (same repair re-acquiring renews lease)
   * - Stale lock recovery (expired leases are safely stolen/renewed)
   * - Rejection with HTTP 409 on active conflict
   */
  public static async acquireLock(
    service: string,
    repairId: string,
    ttlMs: number = this.DEFAULT_TTL_MS
  ): Promise<IDeploymentLock> {
    this.init();
    const normalizedService = service.trim().toLowerCase();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    const ownerToken = `lock-${crypto.randomBytes(12).toString("hex")}`;

    // 1. Check existing lock for the service
    const existingLock = await DeploymentLock.findOne({ service: normalizedService });

    if (!existingLock) {
      // No existing lock record: insert atomically
      try {
        const lock = await DeploymentLock.create({
          service: normalizedService,
          repairId,
          ownerToken,
          acquiredAt: now,
          expiresAt,
          status: "HELD",
        });
        return lock;
      } catch (insertErr: any) {
        // Race condition: another thread created a lock simultaneously
        if (insertErr.code === 11000) {
          return this.acquireLock(service, repairId, ttlMs);
        }
        throw insertErr;
      }
    }

    // 2. Lock already exists: evaluate state
    if (existingLock.status === "RELEASED") {
      // Previously released lock: re-acquire atomically
      const updated = await DeploymentLock.findOneAndUpdate(
        { service: normalizedService, status: "RELEASED" },
        {
          $set: {
            repairId,
            ownerToken,
            acquiredAt: now,
            expiresAt,
            status: "HELD",
            releaseReason: undefined,
            releasedAt: undefined,
          },
        },
        { new: true }
      );

      if (updated) return updated;
      // If condition failed due to race, re-evaluate
      return this.acquireLock(service, repairId, ttlMs);
    }

    // 3. Lock status is currently HELD:
    // Check if it's held by the SAME repair (Idempotent re-acquisition)
    if (existingLock.repairId === repairId) {
      existingLock.expiresAt = expiresAt;
      existingLock.updatedAt = now;
      await existingLock.save();
      return existingLock;
    }

    // Check for stale lock (lease has expired)
    if (existingLock.expiresAt < now) {
      console.warn(
        `[DeploymentLockService] Recovering stale lock for service "${service}". Previous repair ${existingLock.repairId} lease expired at ${existingLock.expiresAt.toISOString()}.`
      );

      const recovered = await DeploymentLock.findOneAndUpdate(
        {
          service: normalizedService,
          status: "HELD",
          expiresAt: { $lt: now },
        },
        {
          $set: {
            repairId,
            ownerToken,
            acquiredAt: now,
            expiresAt,
            status: "HELD",
            releaseReason: `STALE_LOCK_RECOVERED_FROM_${existingLock.repairId}`,
            releasedAt: undefined,
          },
        },
        { new: true }
      );

      if (recovered) return recovered;
      // If raced by another steal, retry
      return this.acquireLock(service, repairId, ttlMs);
    }

    // 4. Lock is HELD, unexpired, and owned by a DIFFERENT repair: REJECT CONFLICT
    throw new DeploymentLockConflictError(
      service,
      existingLock.repairId,
      existingLock.expiresAt
    );
  }

  /**
   * Releases a deployment lock on completion, failure, or rollback.
   */
  public static async releaseLock(
    service: string,
    repairId: string,
    ownerToken?: string,
    reason: string = "COMPLETED"
  ): Promise<boolean> {
    const normalizedService = service.trim().toLowerCase();
    const query: any = { service: normalizedService, repairId, status: "HELD" };
    if (ownerToken) {
      query.ownerToken = ownerToken;
    }

    const res = await DeploymentLock.findOneAndUpdate(
      query,
      {
        $set: {
          status: "RELEASED",
          releaseReason: reason,
          releasedAt: new Date(),
        },
      },
      { new: true }
    );

    return !!res;
  }

  /**
   * Checks whether an unexpired active deployment lock is held for the service.
   */
  public static async isLockActive(service: string): Promise<boolean> {
    const normalizedService = service.trim().toLowerCase();
    const now = new Date();
    const lock = await DeploymentLock.findOne({
      service: normalizedService,
      status: "HELD",
      expiresAt: { $gt: now },
    });
    return !!lock;
  }

  /**
   * Retrieves active lock details for inspection.
   */
  public static async getLock(service: string): Promise<IDeploymentLock | null> {
    const normalizedService = service.trim().toLowerCase();
    return DeploymentLock.findOne({ service: normalizedService });
  }

  /**
   * Force releases lock (for tests or administrative overrides).
   */
  public static async forceRelease(service: string, reason = "ADMIN_FORCE_RELEASE"): Promise<void> {
    const normalizedService = service.trim().toLowerCase();
    await DeploymentLock.findOneAndUpdate(
      { service: normalizedService },
      {
        $set: {
          status: "RELEASED",
          releaseReason: reason,
          releasedAt: new Date(),
        },
      }
    );
  }
}

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface IRealContainerLog {
  timestamp: string;
  message: string;
  container: string;
}

export class ContainerLogService {
  /**
   * Resolves running Docker container candidate names for a target service.
   */
  public static resolveCandidateContainers(service: string): string[] {
    const s = (service || "").toLowerCase();
    const candidates: string[] = [];

    if (s.includes("ml") || s.includes("inference") || s.includes("model")) {
      candidates.push("traceops-ml-service");
    } else if (s.includes("frontend") || s.includes("ui")) {
      candidates.push("traceops-frontend");
    } else {
      // Default primary application service container is traceops-backend
      candidates.push("traceops-backend");
    }

    // Also include exact service name sanitized if different
    const sanitized = s.replace(/[^a-z0-9_-]/g, "-");
    if (sanitized && !candidates.includes(sanitized)) {
      candidates.push(sanitized);
    }

    return candidates;
  }

  /**
   * Executes a docker command cleanly on Linux container or Windows host.
   */
  private static async runDocker(cmd: string): Promise<string> {
    const isWin = process.platform === "win32";
    const dockerCmd = isWin
      ? `$env:Path += ";C:\\Program Files\\Docker\\Docker\\resources\\bin"; ${cmd}`
      : cmd;

    try {
      const { stdout, stderr } = await execAsync(dockerCmd, {
        shell: isWin ? "powershell.exe" : "/bin/sh",
        timeout: 8000,
        maxBuffer: 2 * 1024 * 1024,
      });
      return stdout || stderr || "";
    } catch (err: any) {
      // Docker command failed or container not found
      return err.stdout || err.stderr || "";
    }
  }

  /**
   * Retrieves genuine, un-fabricated application logs from the running Docker container
   * around the incident evaluation window.
   */
  public static async getRealLogsForService(
    service: string,
    incidentTime?: Date,
    tailCount: number = 40
  ): Promise<IRealContainerLog[]> {
    const candidates = this.resolveCandidateContainers(service);
    const targetIncidentTime = incidentTime || new Date();
    const windowStartMs = targetIncidentTime.getTime() - 15 * 60 * 1000; // 15 mins prior
    const windowEndMs = targetIncidentTime.getTime() + 10 * 60 * 1000;   // 10 mins post

    // Discover actual running containers
    const runningRaw = await this.runDocker('docker ps --format "{{.Names}}"');
    const runningSet = new Set(runningRaw.split(/\r?\n/).map((n) => n.trim()).filter(Boolean));

    // Only query containers that actually exist and are running
    const validContainers = candidates.filter((c) => runningSet.has(c));
    if (validContainers.length === 0 && runningSet.has("traceops-backend")) {
      validContainers.push("traceops-backend");
    }

    for (const container of validContainers) {
      try {
        const rawOutput = await this.runDocker(
          `docker logs --timestamps --tail ${tailCount} ${container}`
        );

        if (!rawOutput || rawOutput.trim().length === 0) {
          continue;
        }

        const lines = rawOutput.split(/\r?\n/).filter((l) => l.trim().length > 0);
        const parsedLogs: IRealContainerLog[] = [];

        for (const line of lines) {
          // Docker logs format: 2026-10-01T05:27:53.857438085Z log message text
          const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s+(.*)$/);
          if (match) {
            const logTimeStr = match[1];
            const logMsg = match[2];
            const logTime = new Date(logTimeStr);

            // Sanitize potential secret tokens from log line
            const sanitizedMsg = this.sanitizeLog(logMsg);

            // Filter within or around incident window if timestamp valid
            const logMs = logTime.getTime();
            if (!Number.isNaN(logMs)) {
              if (logMs >= windowStartMs && logMs <= windowEndMs) {
                parsedLogs.push({
                  timestamp: logTime.toISOString(),
                  message: sanitizedMsg,
                  container,
                });
              } else {
                // If slightly outside window but tail is requested, include as context
                parsedLogs.push({
                  timestamp: logTime.toISOString(),
                  message: sanitizedMsg,
                  container,
                });
              }
            } else {
              parsedLogs.push({
                timestamp: targetIncidentTime.toISOString(),
                message: sanitizedMsg,
                container,
              });
            }
          } else {
            parsedLogs.push({
              timestamp: targetIncidentTime.toISOString(),
              message: this.sanitizeLog(line),
              container,
            });
          }
        }

        if (parsedLogs.length > 0) {
          // Return the most relevant logs capped to 30
          return parsedLogs.slice(-30);
        }
      } catch {
        // Continue to next candidate container
      }
    }

    return [];
  }

  /**
   * Sanitizes sensitive information from log messages.
   */
  private static sanitizeLog(msg: string): string {
    return msg
      .replace(/AIza[0-9A-Za-z-_]{35}/g, "[REDACTED_API_KEY]")
      .replace(/AQ\.[0-9A-Za-z-_]{40,}/g, "[REDACTED_GEMINI_KEY]")
      .replace(/bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer [REDACTED_TOKEN]")
      .replace(/password\s*=\s*['"]?[^'"\s]+/gi, "password=[REDACTED]")
      .trim();
  }
}

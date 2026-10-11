import http from "http";
import url from "url";
import { Deployment, IDeployment } from "../models/Deployment";
import { CodeRepair } from "../models/CodeRepair";
import { DeploymentAuditService } from "./deploymentAuditService";
import { DeploymentLockService, DeploymentLockConflictError } from "./deploymentLockService";
import { deploymentTrafficWeightGauge } from "./telemetryInstrumentation";

export interface ActiveRoute {
  deploymentId: string;
  repairId: string;
  projectId: string;
  service: string;
  strategy: "CANARY" | "BLUE_GREEN" | "DIRECT";
  candidateHostPort: number;
  predecessorHostPort: number;
  candidateTargetUrl: string;
  predecessorTargetUrl: string;
  candidateContainer: string;
  predecessorContainer: string;
  candidateWeight: number; // 0..100
  predecessorWeight: number; // 0..100
  stage: string;
  ingressPort?: number;
  proxyServer?: http.Server;
  totalRequests: number;
  candidateRequests: number;
  predecessorRequests: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InitRouteParams {
  deploymentId: string;
  strategy?: "CANARY" | "BLUE_GREEN" | "DIRECT";
  candidateHostPort?: number;
  predecessorHostPort?: number;
  stage?: string;
  actor?: string;
}

export interface SetTrafficWeightsParams {
  deploymentId: string;
  candidateWeight: number;
  predecessorWeight: number;
  stage: string;
  reason?: string;
  actor?: string;
}

export class TrafficRoutingService {
  private static routes: Map<string, ActiveRoute> = new Map();
  private static nextIngressPort: number = 5300;

  /**
   * Initializes or registers an active traffic route for a deployment.
   * Enforces:
   * - Deployment existence and approved/validated repair status
   * - Candidate commit SHA integrity
   * - Initial 0% candidate / 100% predecessor distribution
   * - Registration of audit event
   */
  public static async initRoute(params: InitRouteParams): Promise<ActiveRoute> {
    const { deploymentId } = params;

    const deployment = await Deployment.findOne({ deploymentId });
    if (!deployment) {
      throw new Error(`Deployment not found for deploymentId: ${deploymentId}`);
    }

    const repair = await CodeRepair.findOne({ repairId: deployment.repairId });
    if (!repair) {
      throw new Error(`Safety Gate Violation: CodeRepair not found for repairId: ${deployment.repairId}`);
    }

    if (repair.approvalStatus !== "APPROVED") {
      throw new Error(`Safety Gate Violation: Repair ${repair.repairId} must be approved before traffic routing.`);
    }

    if (repair.validationStatus !== "VALIDATED") {
      throw new Error(`Safety Gate Violation: Repair ${repair.repairId} must be validated before traffic routing.`);
    }

    if (repair.candidateCommitSha && deployment.candidateCommitSha && repair.candidateCommitSha !== deployment.candidateCommitSha) {
      throw new Error(
        `Safety Gate Violation: Candidate commit SHA mismatch between repair (${repair.candidateCommitSha}) and deployment (${deployment.candidateCommitSha})`
      );
    }

    const strategy = params.strategy || (deployment.trafficStrategy as any) || "CANARY";
    const candidateHostPort = params.candidateHostPort || deployment.hostPort || 5200;
    const predecessorHostPort = params.predecessorHostPort || 5210;

    const candidateContainer = deployment.candidateContainer || `traceops-live-${deployment.projectId.toLowerCase()}-${deployment.repairId.toLowerCase()}`;
    const predecessorContainer = deployment.predecessorContainer || `traceops-live-${deployment.projectId.toLowerCase()}-${deployment.service.toLowerCase()}-pred`;

    const candidateTargetUrl = `http://127.0.0.1:${candidateHostPort}`;
    const predecessorTargetUrl = `http://127.0.0.1:${predecessorHostPort}`;

    const stage = params.stage || "WARMUP";
    const actor = params.actor || "AUTONOMOUS_TRAFFIC_ENGINE";

    const initialRoute: ActiveRoute = {
      deploymentId,
      repairId: repair.repairId,
      projectId: deployment.projectId,
      service: deployment.service,
      strategy,
      candidateHostPort,
      predecessorHostPort,
      candidateTargetUrl,
      predecessorTargetUrl,
      candidateContainer,
      predecessorContainer,
      candidateWeight: 0,
      predecessorWeight: 100,
      stage,
      totalRequests: 0,
      candidateRequests: 0,
      predecessorRequests: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.routes.set(deploymentId, initialRoute);

    // Update Deployment model
    await Deployment.updateOne(
      { deploymentId },
      {
        $set: {
          trafficStrategy: strategy,
          candidateTrafficWeight: 0,
          predecessorTrafficWeight: 100,
          currentCanaryStage: stage,
        },
        $push: {
          canaryStages: {
            stage,
            candidateWeight: 0,
            predecessorWeight: 100,
            enteredAt: new Date(),
            status: "INITIALIZED",
            reason: "Initial traffic route configured at 0% candidate / 100% predecessor",
          },
        },
      }
    );

    // Record C1 Audit Event
    await DeploymentAuditService.appendEvent({
      deploymentId,
      repairId: repair.repairId,
      projectId: deployment.projectId,
      service: deployment.service,
      candidateCommitSha: deployment.candidateCommitSha || repair.candidateCommitSha,
      predecessorImage: deployment.predecessorImage || "traceops-pred:v1",
      candidateImage: deployment.candidateImage || deployment.imageTag,
      strategy,
      stage,
      previousCandidateWeight: 0,
      newCandidateWeight: 0,
      action: "CANARY_INITIALIZED",
      actor,
      authorizationCheck: true,
      evidenceSnapshotHash: repair.evidenceSnapshotHash,
    });

    // Update Prometheus Observability
    deploymentTrafficWeightGauge.labels(deployment.service, "candidate", stage).set(0);
    deploymentTrafficWeightGauge.labels(deployment.service, "predecessor", stage).set(100);

    return initialRoute;
  }

  /**
   * Sets traffic routing weights atomically.
   * Enforces:
   * - Invariant: candidateWeight + predecessorWeight === 100
   * - Values strictly in [0..100] integer range
   * - Blue-Green atomic cutover invariant (only 0/100 or 100/0 allowed)
   * - DeploymentLockService concurrency mutual exclusion
   * - Append-only cryptographic audit event generation
   * - Prometheus gauge update
   */
  public static async setTrafficWeights(params: SetTrafficWeightsParams): Promise<ActiveRoute> {
    const { deploymentId, candidateWeight, predecessorWeight, stage } = params;
    const actor = params.actor || "AUTONOMOUS_TRAFFIC_ENGINE";
    const reason = params.reason || `Traffic shifted to ${candidateWeight}% candidate / ${predecessorWeight}% predecessor`;

    // 1. Invariant: Integer bounds [0..100]
    if (
      typeof candidateWeight !== "number" ||
      typeof predecessorWeight !== "number" ||
      !Number.isInteger(candidateWeight) ||
      !Number.isInteger(predecessorWeight)
    ) {
      throw new Error(
        `Traffic Weight Invariant Violation: Weights must be integers. Received candidate=${candidateWeight}, predecessor=${predecessorWeight}`
      );
    }

    if (candidateWeight < 0 || candidateWeight > 100 || predecessorWeight < 0 || predecessorWeight > 100) {
      throw new Error(
        `Traffic Weight Invariant Violation: Weights must be between 0 and 100. Received candidate=${candidateWeight}, predecessor=${predecessorWeight}`
      );
    }

    // 2. Invariant: candidateWeight + predecessorWeight === 100
    if (candidateWeight + predecessorWeight !== 100) {
      throw new Error(
        `Traffic Weight Invariant Violation: candidateWeight + predecessorWeight must equal 100. Got ${candidateWeight} + ${predecessorWeight} = ${
          candidateWeight + predecessorWeight
        }`
      );
    }

    // 3. Deployment & Repair Safety Verification
    const deployment = await Deployment.findOne({ deploymentId });
    if (!deployment) {
      throw new Error(`Deployment not found for deploymentId: ${deploymentId}`);
    }

    const repair = await CodeRepair.findOne({ repairId: deployment.repairId });
    if (!repair) {
      throw new Error(`Safety Gate Violation: CodeRepair not found for repairId: ${deployment.repairId}`);
    }

    if (repair.approvalStatus !== "APPROVED") {
      throw new Error(`Safety Gate Violation: Cannot shift traffic on unapproved repair ${repair.repairId}`);
    }

    if (repair.validationStatus !== "VALIDATED") {
      throw new Error(`Safety Gate Violation: Cannot shift traffic on unvalidated repair ${repair.repairId}`);
    }

    // 4. Blue-Green Strategy Constraint
    const currentRoute = this.routes.get(deploymentId);
    const strategy = currentRoute?.strategy || deployment.trafficStrategy || "CANARY";
    if (strategy === "BLUE_GREEN") {
      if (candidateWeight !== 0 && candidateWeight !== 100) {
        throw new Error(
          `Strategy Violation: Blue-Green deployments only support atomic cutover (0/100 or 100/0). Got candidate=${candidateWeight}`
        );
      }
    }

    // 5. Concurrency Locking: Verify lock lease through DeploymentLockService
    await DeploymentLockService.acquireLock(deployment.service, deployment.repairId);

    // 6. Resolve Route State
    let route = this.routes.get(deploymentId);
    if (!route) {
      route = await this.initRoute({
        deploymentId,
        strategy: strategy as any,
        stage,
        actor,
      });
    }

    const prevCandidateWeight = route.candidateWeight;
    const prevPredecessorWeight = route.predecessorWeight;

    // 7. Atomic In-Memory Update
    route.candidateWeight = candidateWeight;
    route.predecessorWeight = predecessorWeight;
    route.stage = stage;
    route.updatedAt = new Date();

    // 8. Atomic Database Update
    await Deployment.updateOne(
      { deploymentId },
      {
        $set: {
          candidateTrafficWeight: candidateWeight,
          predecessorTrafficWeight: predecessorWeight,
          currentCanaryStage: stage,
        },
        $push: {
          canaryStages: {
            stage,
            candidateWeight,
            predecessorWeight,
            enteredAt: new Date(),
            status: "ACTIVE",
            reason,
          },
        },
      }
    );

    // 9. Emit Cryptographically Chained C1 Audit Event
    const action = candidateWeight === 0 && prevCandidateWeight > 0 ? "TRAFFIC_ABORTED" : "STAGE_ADVANCED";
    await DeploymentAuditService.appendEvent({
      deploymentId,
      repairId: repair.repairId,
      projectId: deployment.projectId,
      service: deployment.service,
      candidateCommitSha: deployment.candidateCommitSha || repair.candidateCommitSha,
      predecessorImage: deployment.predecessorImage || "traceops-pred:v1",
      candidateImage: deployment.candidateImage || deployment.imageTag,
      strategy: route.strategy,
      stage,
      previousCandidateWeight: prevCandidateWeight,
      newCandidateWeight: candidateWeight,
      action,
      actor,
      authorizationCheck: true,
      evidenceSnapshotHash: repair.evidenceSnapshotHash,
    });

    // 10. Update Prometheus Observability
    deploymentTrafficWeightGauge.labels(deployment.service, "candidate", stage).set(candidateWeight);
    deploymentTrafficWeightGauge.labels(deployment.service, "predecessor", stage).set(predecessorWeight);

    return route;
  }

  /**
   * Emergency instant traffic clamping (< 500ms).
   * Immediately resets candidate to 0% and predecessor to 100%.
   */
  public static async clampToPredecessor(deploymentId: string, reason: string, actor: string = "EMERGENCY_CLAMP"): Promise<ActiveRoute> {
    return this.setTrafficWeights({
      deploymentId,
      candidateWeight: 0,
      predecessorWeight: 100,
      stage: "ABORTED_CLAMPED_TO_PREDECESSOR",
      reason: `EMERGENCY CLAMP: ${reason}`,
      actor,
    });
  }

  /**
   * Retrieves active traffic state for a deployment.
   */
  public static async getTrafficState(deploymentId: string): Promise<ActiveRoute> {
    let route = this.routes.get(deploymentId);
    if (!route) {
      const deployment = await Deployment.findOne({ deploymentId });
      if (!deployment) {
        throw new Error(`Deployment not found for deploymentId: ${deploymentId}`);
      }
      route = await this.initRoute({ deploymentId });
    }
    return route;
  }

  /**
   * Dispatches an incoming HTTP request using deterministic weighted interleaving:
   * Over a sequence of requests, exactly candidateWeight % are routed to candidate,
   * and predecessorWeight % are routed to predecessor.
   */
  public static async dispatchRequest(
    deploymentId: string,
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<"candidate" | "predecessor"> {
    const route = await this.getTrafficState(deploymentId);

    route.totalRequests++;

    let target: "candidate" | "predecessor";

    if (route.candidateWeight === 0) {
      target = "predecessor";
    } else if (route.candidateWeight === 100) {
      target = "candidate";
    } else {
      // Deterministic Bresenham weighted interleaving:
      // (totalRequests * candidateWeight) % 100 < candidateWeight selects candidate
      const metric = (route.totalRequests * route.candidateWeight) % 100;
      target = metric < route.candidateWeight ? "candidate" : "predecessor";
    }

    if (target === "candidate") {
      route.candidateRequests++;
    } else {
      route.predecessorRequests++;
    }

    const targetUrl = target === "candidate" ? route.candidateTargetUrl : route.predecessorTargetUrl;

    await this.forwardHttpRequest(targetUrl, req, res, target);
    return target;
  }

  /**
   * Forwards the HTTP request to the selected container endpoint and pipes the response.
   */
  private static forwardHttpRequest(
    targetUrlStr: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    targetLabel: "candidate" | "predecessor"
  ): Promise<void> {
    return new Promise((resolve) => {
      const parsedUrl = new url.URL(targetUrlStr);

      const options: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          host: `${parsedUrl.hostname}:${parsedUrl.port}`,
          "x-traceops-routed-to": targetLabel,
          "x-forwarded-for": req.socket.remoteAddress || "127.0.0.1",
        },
      };

      const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, {
          ...proxyRes.headers,
          "x-traceops-routed-to": targetLabel,
        });
        proxyRes.pipe(res);
        proxyRes.on("end", () => resolve());
      });

      proxyReq.on("error", (err: any) => {
        if (!res.headersSent) {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "Bad Gateway",
              message: `Target ${targetLabel} container unavailable: ${err.message}`,
              target: targetLabel,
              targetUrl: targetUrlStr,
            })
          );
        }
        resolve();
      });

      req.pipe(proxyReq);
    });
  }

  /**
   * Spawns an in-process HTTP proxy listener on an allocated ingress port.
   */
  public static async startProxyListener(deploymentId: string, requestedPort?: number): Promise<number> {
    const route = await this.getTrafficState(deploymentId);

    if (route.proxyServer && route.ingressPort) {
      return route.ingressPort;
    }

    const portToUse = requestedPort || this.nextIngressPort++;

    const server = http.createServer(async (req, res) => {
      try {
        await this.dispatchRequest(deploymentId, req, res);
      } catch (err: any) {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Routing Error", message: err.message }));
        }
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(portToUse, "0.0.0.0", () => {
        route.ingressPort = portToUse;
        route.proxyServer = server;
        resolve();
      });
      server.on("error", reject);
    });

    return portToUse;
  }

  /**
   * Gracefully shuts down the in-process HTTP proxy listener.
   */
  public static async stopProxyListener(deploymentId: string): Promise<void> {
    const route = this.routes.get(deploymentId);
    if (route && route.proxyServer) {
      await new Promise<void>((resolve) => {
        route.proxyServer?.close(() => {
          route.proxyServer = undefined;
          route.ingressPort = undefined;
          resolve();
        });
      });
    }
  }

  /**
   * Cleans up all active in-memory routes and proxy servers (useful for test resets).
   */
  public static async resetAll(): Promise<void> {
    for (const [id] of this.routes) {
      await this.stopProxyListener(id);
    }
    this.routes.clear();
  }
}

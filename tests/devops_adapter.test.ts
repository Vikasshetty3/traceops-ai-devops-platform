import {
  DevOpsAdapter,
  SafetyGate,
  DevOpsActionRequest,
  SimulationProvider,
  KubernetesProvider,
  IKubernetesApiClient,
} from "../devops-adapter";

// In-Memory Hermetic Mock Client for Kubernetes API Tests
class MockKubernetesApiClient implements IKubernetesApiClient {
  public deployments: Record<string, any> = {
    "checkout-service": {
      metadata: { name: "checkout-service", namespace: "traceops", generation: 1 },
      spec: {
        replicas: 2,
        template: { metadata: { annotations: {} } },
      },
      status: { replicas: 2, readyReplicas: 2, availableReplicas: 2 },
    },
  };

  public configMaps: Record<string, any> = {
    "checkout-config": {
      metadata: { name: "checkout-config", namespace: "traceops" },
      data: { "database.pool.max": "20", "connection.timeout.ms": "1500" },
    },
  };

  public async getDeployment(_namespace: string, name: string): Promise<any> {
    return this.deployments[name] || null;
  }

  public async patchDeploymentScale(
    _namespace: string,
    name: string,
    replicas: number
  ): Promise<any> {
    if (this.deployments[name]) {
      this.deployments[name].spec.replicas = replicas;
      this.deployments[name].status.replicas = replicas;
      this.deployments[name].status.readyReplicas = replicas;
    }
    return { spec: { replicas } };
  }

  public async patchDeployment(
    _namespace: string,
    name: string,
    patch: any
  ): Promise<any> {
    if (this.deployments[name]) {
      if (patch?.spec?.template?.metadata?.annotations) {
        this.deployments[name].spec.template.metadata.annotations = {
          ...this.deployments[name].spec.template.metadata.annotations,
          ...patch.spec.template.metadata.annotations,
        };
      }
    }
    return { metadata: { name }, ...patch };
  }

  public async getConfigMap(_namespace: string, name: string): Promise<any> {
    return this.configMaps[name] || null;
  }

  public async patchConfigMap(
    _namespace: string,
    name: string,
    data: Record<string, string>
  ): Promise<any> {
    if (this.configMaps[name]) {
      this.configMaps[name].data = { ...this.configMaps[name].data, ...data };
    }
    return { metadata: { name }, data };
  }
}

async function testDevOpsAdapter() {
  console.log("🚀 Running Expanded DevOps Execution & Provider Unit Tests...\n");
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${msg}`);
    }
  }

  const validRequest: DevOpsActionRequest = {
    actionId: "ACT-TEST-001",
    service: "Checkout",
    actionType: "SCALE_SERVICE",
    description: "Scale checkout pods to 4",
    payload: { targetReplicas: 4 },
  };

  // ==========================================
  // 1. SAFETY GATE CHECKS
  // ==========================================
  const propCheck = SafetyGate.validateProposal(validRequest);
  assert(propCheck.allowed, "SafetyGate allows valid service and replica bounds");

  const invalidSvcCheck = SafetyGate.validateProposal({
    ...validRequest,
    service: "UnknownMaliciousService",
  });
  assert(!invalidSvcCheck.allowed, "SafetyGate blocks unknown service");

  const invalidReplicaCheck = SafetyGate.validateProposal({
    ...validRequest,
    payload: { targetReplicas: 99 },
  });
  assert(!invalidReplicaCheck.allowed, "SafetyGate blocks replicas > 10");

  const unapprovedExec = await DevOpsAdapter.executeAction("PROPOSED", validRequest);
  assert(
    !unapprovedExec.success && unapprovedExec.error !== undefined,
    "DevOpsAdapter blocks execution when status is 'PROPOSED'"
  );

  const rejectedExec = await DevOpsAdapter.executeAction("REJECTED", validRequest);
  assert(
    !rejectedExec.success,
    "DevOpsAdapter blocks execution when status is 'REJECTED'"
  );

  // ==========================================
  // 2. SIMULATION PROVIDER TESTS
  // ==========================================
  DevOpsAdapter.setProvider(new SimulationProvider());

  const approvedExec = await DevOpsAdapter.executeAction("APPROVED", validRequest);
  assert(
    approvedExec.success && approvedExec.provider === "SimulationProvider",
    "SimulationProvider executes when status is 'APPROVED'"
  );
  assert(
    approvedExec.verification?.verified === true,
    "SimulationProvider returns verified execution result"
  );

  const simDryRun = await DevOpsAdapter.executeAction("PROPOSED", {
    ...validRequest,
    dryRun: true,
  });
  assert(
    simDryRun.success && simDryRun.dryRun === true,
    "SimulationProvider executes safe dry-run preview without approved status"
  );

  const configExec = await DevOpsAdapter.executeAction("APPROVED", {
    actionId: "ACT-TEST-002",
    service: "Checkout",
    actionType: "UPDATE_CONFIG",
    description: "Update pool size",
    payload: { maxPoolSize: 40, timeoutMs: 3000 },
  });
  assert(
    configExec.success && configExec.logs.some((l) => l.includes("database.pool.max = \"40\"")),
    "SimulationProvider correctly patches config in simulation"
  );

  // ==========================================
  // 3. KUBERNETES PROVIDER TESTS (Hermetic Unit Testing)
  // ==========================================
  const mockK8sClient = new MockKubernetesApiClient();
  const k8sProvider = new KubernetesProvider("traceops", mockK8sClient);
  DevOpsAdapter.setProvider(k8sProvider);

  assert(
    DevOpsAdapter.getProviderName() === "KubernetesProvider",
    "DevOpsAdapter switches active provider to KubernetesProvider"
  );

  // 3a. Kubernetes Scale Service
  const k8sScale = await DevOpsAdapter.executeAction("APPROVED", {
    actionId: "ACT-K8S-001",
    service: "Checkout",
    actionType: "SCALE_SERVICE",
    description: "Scale checkout service in K8s",
    payload: { targetReplicas: 4 },
  });
  assert(
    k8sScale.success &&
      k8sScale.provider === "KubernetesProvider" &&
      k8sScale.verification?.verified === true,
    "KubernetesProvider successfully scales deployment to 4 replicas"
  );
  assert(
    mockK8sClient.deployments["checkout-service"].spec.replicas === 4,
    "Deployment replica count updated in Kubernetes cluster state"
  );

  // 3b. Kubernetes Rolling Restart
  const k8sRestart = await DevOpsAdapter.executeAction("APPROVED", {
    actionId: "ACT-K8S-002",
    service: "Checkout",
    actionType: "RESTART_POD",
    description: "Restart checkout deployment pods",
    payload: {},
  });
  assert(
    k8sRestart.success && k8sRestart.logs.some((l) => l.includes("zero-downtime rolling restart")),
    "KubernetesProvider applies rolling restart annotation patch"
  );

  // 3c. Kubernetes Update ConfigMap & Rollout
  const k8sConfig = await DevOpsAdapter.executeAction("APPROVED", {
    actionId: "ACT-K8S-003",
    service: "Checkout",
    actionType: "UPDATE_CONFIG",
    description: "Patch database pool ConfigMap",
    payload: { maxPoolSize: 40, timeoutMs: 3000 },
  });
  assert(
    k8sConfig.success && mockK8sClient.configMaps["checkout-config"].data["database.pool.max"] === "40",
    "KubernetesProvider patches ConfigMap and triggers rollout restart"
  );

  // 3d. Kubernetes Dry-Run Mode
  const k8sDryRun = await DevOpsAdapter.executeAction("PROPOSED", {
    actionId: "ACT-K8S-004",
    service: "Checkout",
    actionType: "SCALE_SERVICE",
    description: "Dry-run scale preview",
    payload: { targetReplicas: 5 },
    dryRun: true,
  });
  assert(
    k8sDryRun.success &&
      k8sDryRun.dryRun === true &&
      mockK8sClient.deployments["checkout-service"].spec.replicas === 4, // state unchanged from dry-run!
    "KubernetesProvider dry-run validates patch without mutating cluster state"
  );

  // 3e. Kubernetes Allowlist Security Check
  const k8sUnknownSvc = await k8sProvider.execute({
    actionId: "ACT-K8S-005",
    service: "MaliciousUnregisteredPod",
    actionType: "SCALE_SERVICE",
    description: "Unauthorized service modification",
    payload: { targetReplicas: 5 },
  });
  assert(
    !k8sUnknownSvc.success && k8sUnknownSvc.error?.includes("not registered"),
    "KubernetesProvider rejects unregistered service names"
  );

  // Reset provider back to default
  DevOpsAdapter.resetProvider();

  console.log(`\nDevOps Adapter Test Summary: ${passed}/${total} PASSED\n`);
  if (passed !== total) process.exit(1);
}

testDevOpsAdapter();

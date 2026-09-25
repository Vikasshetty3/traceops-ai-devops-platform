import fs from "fs";
import path from "path";

export interface ProjectRuntimeInfo {
  port: number;
  portSource: string;
  hasHealthEndpoint: boolean;
  healthEndpoint: string | null;
  healthEndpointSource: string | null;
  isCurlAvailable: boolean;
  isNode: boolean;
  isPython: boolean;
  recommendedHealthCmd: string | null;
  recommendedHealthcheckInstruction: string | null;
  explanation: string;
}

export class ProjectRuntimeInspector {
  /**
   * Deeply inspects repository source, configs, package.json, Dockerfile, and K8s manifests
   * to determine real listening port, health route, and toolchain availability.
   */
  public static inspect(dir: string): ProjectRuntimeInfo {
    // 1. Detect runtime ecosystem
    const isNode =
      fs.existsSync(path.join(dir, "package.json")) ||
      fs.existsSync(path.join(dir, "index.js")) ||
      fs.existsSync(path.join(dir, "server.js"));
    const isPython =
      fs.existsSync(path.join(dir, "requirements.txt")) ||
      fs.existsSync(path.join(dir, "Pipfile")) ||
      fs.existsSync(path.join(dir, "app.py")) ||
      fs.existsSync(path.join(dir, "main.py"));

    // 2. Discover Port
    let port = 0;
    let portSource = "None";

    // A. Check Source Files
    const candidateSourceFiles = [
      "index.js",
      "server.js",
      "app.js",
      "main.js",
      "src/index.js",
      "src/server.js",
      "src/app.js",
      "app.py",
      "main.py",
    ];

    for (const relPath of candidateSourceFiles) {
      const fullPath = path.join(dir, relPath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");

        // Check for process.env.http_port || 8080 or process.env.PORT || 3000
        const envPortMatch = content.match(
          /process\.env\.[A-Za-z0-9_]*port[A-Za-z0-9_]*\s*\|\|\s*(\d{2,5})/i
        );
        if (envPortMatch) {
          port = parseInt(envPortMatch[1], 10);
          portSource = `${relPath} (${envPortMatch[0]})`;
          break;
        }

        // Check const port = 8080
        const constPortMatch = content.match(
          /(?:const|let|var)\s+port\s*=\s*(\d{2,5})/i
        );
        if (constPortMatch) {
          port = parseInt(constPortMatch[1], 10);
          portSource = `${relPath} (port = ${constPortMatch[1]})`;
          break;
        }

        // Check app.listen(8080)
        const listenMatch = content.match(/\.listen\(\s*(\d{2,5})/);
        if (listenMatch) {
          port = parseInt(listenMatch[1], 10);
          portSource = `${relPath} (listen(${listenMatch[1]}))`;
          break;
        }
      }
    }

    // B. Check Kubernetes Manifests (yaml/, k8s/, etc.)
    if (!port) {
      const yamlDirs = [dir, path.join(dir, "yaml"), path.join(dir, "k8s"), path.join(dir, "chart")];
      for (const yDir of yamlDirs) {
        if (fs.existsSync(yDir) && fs.statSync(yDir).isDirectory()) {
          const files = fs.readdirSync(yDir);
          for (const file of files) {
            if (file.endsWith(".yaml") || file.endsWith(".yml")) {
              const content = fs.readFileSync(path.join(yDir, file), "utf-8");
              const containerPortMatch = content.match(/containerPort:\s*(\d{2,5})/);
              if (containerPortMatch) {
                port = parseInt(containerPortMatch[1], 10);
                portSource = `${path.relative(dir, path.join(yDir, file))} (containerPort: ${port})`;
                break;
              }
              const targetPortMatch = content.match(/targetPort:\s*(\d{2,5})/);
              if (targetPortMatch) {
                port = parseInt(targetPortMatch[1], 10);
                portSource = `${path.relative(dir, path.join(yDir, file))} (targetPort: ${port})`;
                break;
              }
            }
          }
          if (port) break;
        }
      }
    }

    // C. Check Dockerfile EXPOSE
    const dockerfilePath = path.join(dir, "Dockerfile");
    let dockerfileContent = "";
    if (fs.existsSync(dockerfilePath)) {
      dockerfileContent = fs.readFileSync(dockerfilePath, "utf-8");
      if (!port) {
        const exposeMatch = dockerfileContent.match(/EXPOSE\s+(\d{2,5})/);
        if (exposeMatch) {
          port = parseInt(exposeMatch[1], 10);
          portSource = `Dockerfile (EXPOSE ${port})`;
        }
      }
    }

    // Fallback if no port found
    if (!port) {
      port = 8080;
      portSource = "Default fallback (no listening port configured)";
    }

    // 3. Discover Health Endpoint
    let healthEndpoint: string | null = null;
    let healthEndpointSource: string | null = null;

    // A. Check Source Code routes
    const filesToSearchRoutes = [
      "index.js",
      "server.js",
      "app.js",
      "routes/index.js",
      "routes.js",
      "src/routes.js",
      "src/index.js",
    ];

    for (const relPath of filesToSearchRoutes) {
      const fullPath = path.join(dir, relPath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        const healthRouteMatch = content.match(
          /\.(?:get|use)\(\s*["'](\/(?:health|healthz|live|ready|status|ping))["']/i
        );
        if (healthRouteMatch) {
          healthEndpoint = healthRouteMatch[1];
          healthEndpointSource = `${relPath} (route ${healthEndpoint})`;
          break;
        }
      }
    }

    // B. Check routes/ directory
    if (!healthEndpoint) {
      const routesDir = path.join(dir, "routes");
      if (fs.existsSync(routesDir) && fs.statSync(routesDir).isDirectory()) {
        const rFiles = fs.readdirSync(routesDir);
        for (const rf of rFiles) {
          if (rf.endsWith(".js") || rf.endsWith(".ts")) {
            const content = fs.readFileSync(path.join(routesDir, rf), "utf-8");
            if (content.includes("health:") || content.includes("health(")) {
              healthEndpoint = "/health";
              healthEndpointSource = `routes/${rf} (handler exported)`;
              break;
            }
          }
        }
      }
    }

    // C. Check Kubernetes Probes
    if (!healthEndpoint) {
      const yamlDirs = [dir, path.join(dir, "yaml"), path.join(dir, "k8s")];
      for (const yDir of yamlDirs) {
        if (fs.existsSync(yDir) && fs.statSync(yDir).isDirectory()) {
          const files = fs.readdirSync(yDir);
          for (const file of files) {
            if (file.endsWith(".yaml") || file.endsWith(".yml")) {
              const content = fs.readFileSync(path.join(yDir, file), "utf-8");
              const probeMatch = content.match(
                /(?:readinessProbe|livenessProbe):[\s\S]*?httpGet:[\s\S]*?path:\s*([^\s]+)/
              );
              if (probeMatch) {
                healthEndpoint = probeMatch[1];
                healthEndpointSource = `${path.relative(dir, path.join(yDir, file))} (${probeMatch[0].split("\n")[0].trim()})`;
                break;
              }
            }
          }
          if (healthEndpoint) break;
        }
      }
    }

    // D. Check README.md
    if (!healthEndpoint) {
      const readmePath = path.join(dir, "README.md");
      if (fs.existsSync(readmePath)) {
        const content = fs.readFileSync(readmePath, "utf-8");
        const readmeMatch = content.match(/\*\s*(\/health\b)/i);
        if (readmeMatch) {
          healthEndpoint = "/health";
          healthEndpointSource = "README.md documented endpoint";
        }
      }
    }

    const hasHealthEndpoint = healthEndpoint !== null;

    // 4. Check Curl availability in Dockerfile
    let isCurlAvailable = false;
    if (dockerfileContent) {
      if (
        /apk\s+.*add\s+.*curl/i.test(dockerfileContent) ||
        /apt(?:-get)?\s+.*install\s+.*curl/i.test(dockerfileContent) ||
        /yum\s+.*install\s+.*curl/i.test(dockerfileContent) ||
        /dnf\s+.*install\s+.*curl/i.test(dockerfileContent)
      ) {
        isCurlAvailable = true;
      }
    }

    // 5. Determine recommended Healthcheck command
    let recommendedHealthCmd: string | null = null;
    let recommendedHealthcheckInstruction: string | null = null;
    let explanation = "";

    if (hasHealthEndpoint && healthEndpoint) {
      if (isCurlAvailable) {
        recommendedHealthCmd = `CMD curl -f http://localhost:${port}${healthEndpoint} || exit 1`;
      } else if (isNode) {
        recommendedHealthCmd = `CMD node -e "require('http').get('http://localhost:' + (process.env.http_port || ${port}) + '${healthEndpoint}', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"`;
      } else {
        recommendedHealthCmd = `CMD wget -q -O - http://localhost:${port}${healthEndpoint} > /dev/null || exit 1`;
      }
      recommendedHealthcheckInstruction = `HEALTHCHECK --interval=15s --timeout=3s ${recommendedHealthCmd}`;
      explanation = `Detected port ${port} from ${portSource} and verified health route ${healthEndpoint} from ${healthEndpointSource}. Curl available: ${isCurlAvailable}. Formulated non-curl healthcheck.`;
    } else {
      explanation = `Detected port ${port} from ${portSource}. No verified application health endpoint available; leaving HEALTHCHECK unchanged.`;
    }

    return {
      port,
      portSource,
      hasHealthEndpoint,
      healthEndpoint,
      healthEndpointSource,
      isCurlAvailable,
      isNode,
      isPython,
      recommendedHealthCmd,
      recommendedHealthcheckInstruction,
      explanation,
    };
  }
}

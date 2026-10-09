# TraceOps AI DevOps Platform — Production Deployment Runbook

**Document:** `docs/PRODUCTION_DEPLOYMENT.md`  
**Phase:** 7.1 — Production Infrastructure Preparation  
**Target Architecture:** Single-Node Hardened Linux Host (Ubuntu 24.04 LTS)  
**Deployment Tooling:** Docker Engine 24+, Docker Compose V2, Caddy Reverse Proxy  
**Current Status:** INFRASTRUCTURE PREPARED — NOT YET DEPLOYED TO PUBLIC INTERNET (Phase 7.2 Activation Gate)

---

## 1. Server Prerequisites

| Component | Minimum Specification | Recommended Specification |
| :--- | :--- | :--- |
| **Operating System** | Ubuntu 24.04 LTS (Noble Numbat) | Ubuntu 24.04 LTS |
| **CPU Architecture** | x86_64 (64-bit), 2 vCPU cores | x86_64 (64-bit), 4 vCPU cores |
| **System Memory (RAM)**| 4 GB physical RAM + 2 GB swap | 8 GB physical RAM + 4 GB swap |
| **Storage** | 30 GB SSD (ext4/xfs) | 60+ GB NVMe SSD |
| **Network** | 1 Static Public IPv4 Address | 1 Static Public IPv4 + IPv6 |
| **System Time (NTP)** | `systemd-timesyncd` active (UTC) | NTP synchronized (< 50ms drift) |

### Time Synchronization Setup
Audit event cryptographic hashes and telemetry correlation require precise UTC timestamps:
```bash
sudo timedatectl set-timezone UTC
sudo timedatectl set-ntp true
timedatectl status
```

---

## 2. DNS Prerequisites

1. Assign a Fully Qualified Domain Name (FQDN) to your platform (e.g. `traceops.example.com`).
2. Create an **A record** in your DNS provider pointing `traceops.example.com` to the server's public IPv4 address.
3. If IPv6 is supported, create an **AAAA record** pointing to the public IPv6 address.
4. Verify DNS propagation across external resolvers:
   ```bash
   dig +short traceops.example.com
   ```
5. Ensure public traffic on ports `80` and `443` routes to this host without intermediate NAT blockage.

---

## 3. Firewall Configuration (UFW)

The platform enforces a strict boundary policy: **Only the Caddy edge reverse proxy is publicly exposed.**

```bash
# Set default boundary rules
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow administrative SSH (restrict to operator IP where applicable)
sudo ufw allow 22/tcp comment 'SSH Administration'

# Allow public web ingress (Edge Reverse Proxy ONLY)
sudo ufw allow 80/tcp comment 'HTTP (Let's Encrypt ACME & HTTPS redirect)'
sudo ufw allow 443/tcp comment 'HTTPS (Caddy Reverse Proxy)'

# Enable firewall
sudo ufw enable
sudo ufw status verbose
```

> [!CAUTION]
> **Strict Port Isolation:** Under no circumstances open firewall ports `27017` (MongoDB), `5000` (Backend API), `5001` (ML Service), `9090` (Prometheus), `9100` (Node Exporter), `8080` (cAdvisor), or `3000` (Grafana) to the public internet.

---

## 4. SSH Hardening Checklist

1. **Authentication:** Require Ed25519 or RSA-4096 public key authentication.
2. Edit `/etc/ssh/sshd_config.d/99-hardened.conf`:
   ```text
   PermitRootLogin no
   PasswordAuthentication no
   X11Forwarding no
   MaxAuthTries 3
   ClientAliveInterval 300
   ClientAliveCountMax 2
   ```
3. Restart SSH service:
   ```bash
   sudo systemctl restart ssh
   ```
4. Optional: Install and enable `fail2ban`:
   ```bash
   sudo apt install -y fail2ban
   sudo systemctl enable --now fail2ban
   ```

---

## 5. Docker Engine & Compose Installation

Install Docker Engine directly from the official upstream repository:

```bash
# 1. Install prerequisites
sudo apt update && sudo apt install -y ca-certificates curl gnupg git

# 2. Add Docker official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# 3. Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 4. Install Docker packages
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 5. Add operator to docker group
sudo usermod -aG docker $USER
newgrp docker

# 6. Verify installation
docker --version
docker compose version
```

---

## 6. Repository Checkout

Clone the repository to the production application directory (e.g. `/opt/traceops`):

```bash
sudo mkdir -p /opt/traceops
sudo chown $USER:$USER /opt/traceops
git clone https://github.com/Vikasshetty3/traceops-ai-devops-platform.git /opt/traceops
cd /opt/traceops

# Verify clean deployment commit
git checkout main # or target release tag
git rev-parse HEAD
```

---

## 7. Environment & Configuration Setup

Create the production `.env` file from the verified `.env.example` template:

```bash
cp .env.example .env
chmod 600 .env
```

Ensure the following variables are configured:

```env
# Application Runtime
NODE_ENV=production
PORT=5000
DOMAIN_NAME=traceops.example.com
ACME_EMAIL=admin@example.com

# Network URLs
FRONTEND_URL=https://traceops.example.com
BACKEND_URL=https://traceops.example.com
CORS_ALLOWED_ORIGINS=https://traceops.example.com

# Database (Internal Docker Bridge)
MONGODB_URI=mongodb://mongodb:27017/requirement_traceable_devops

# Security Keys
JWT_SECRET=GENERATED_STRONG_32_CHAR_SECRET
JWT_EXPIRES_IN=7d

# Google Gemini AI Integration
GEMINI_API_KEY=YOUR_PRODUCTION_GEMINI_KEY

# Microservice URLs (Internal Network)
ML_SERVICE_URL=http://ml-service:5001
PROMETHEUS_URL=http://prometheus:9090

# Observability Dashboard (Grafana)
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=GENERATED_STRONG_GRAFANA_PASSWORD

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_AUTH_MAX=30
RATE_LIMIT_API_MAX=100
```

---

## 8. Secret Generation & Validation

Generate cryptographically secure keys:

```bash
# Generate 256-bit hexadecimal string for JWT_SECRET
openssl rand -hex 32

# Generate secure password for Grafana
openssl rand -base64 24
```

Validate production configuration before starting any containers:

```bash
node scripts/validate_prod_config.js
```

---

## 9. Container Image Build & Immutable Tagging

Build all multi-stage images deterministically:

```bash
# Capture deployment commit SHA
export GIT_COMMIT_SHA=$(git rev-parse --short HEAD)

# Build production images using docker-compose.prod.yml
docker compose -f docker-compose.prod.yml build

# Tag images with immutable Git SHA
docker tag requirement-traceable-devops-backend:latest traceops-backend:${GIT_COMMIT_SHA}
docker tag requirement-traceable-devops-frontend:latest traceops-frontend:${GIT_COMMIT_SHA}
docker tag requirement-traceable-devops-ml-service:latest traceops-ml:${GIT_COMMIT_SHA}
```

---

## 10. Compose Startup & Dependency Ordering

Launch the production stack:

```bash
docker compose -f docker-compose.prod.yml up -d
```

The stack enforces deterministic health dependency resolution:
1. `mongodb` starts and passes `mongosh ping` check.
2. `ml-service` starts and passes `GET /health` probe.
3. `backend` starts, runs schema index checks, seeds baseline ML registry, and passes `GET /health/ready`.
4. `prometheus` starts and scrapes internal endpoints.
5. `grafana` starts and attaches to Prometheus.
6. `frontend` starts and serves static SPA assets.
7. `reverse-proxy` (Caddy) starts, terminates TLS on port 443, and routes ingress.

Verify container status:
```bash
docker compose -f docker-compose.prod.yml ps
```

---

## 11. Health Verification

Verify that all health probes respond with `HTTP 200`:

```bash
# 1. Platform Liveness Probe
curl -i http://localhost/health

# 2. Database Readiness Probe
curl -i http://localhost/health/ready

# 3. Machine Learning Subsystem Health
curl -i http://localhost/api/ml/health

# 4. Verify Prometheus Scrape endpoint is blocked externally
curl -i http://localhost/metrics
# Expected output: HTTP/1.1 403 Forbidden ("Access Denied")
```

---

## 12. HTTPS & TLS Activation

When `DOMAIN_NAME` is configured with a valid public domain (e.g. `traceops.example.com`):
1. Caddy automatically requests Let's Encrypt / ZeroSSL TLS certificates via ACME challenge on port 80/443.
2. Certificates are stored securely in persistent volume `caddy_data`.
3. HTTP requests automatically redirect to HTTPS with 308 Permanent Redirect.
4. Verify HTTPS in browser: `https://traceops.example.com`.

---

## 13. Observability & Telemetry Verification

1. Verify Prometheus telemetry scraping:
   ```bash
   docker exec -it traceops-prod-backend curl -s http://localhost:5000/metrics | grep http_requests_total
   ```
2. Verify Grafana dashboard connectivity:
   - Access Grafana internally or via SSH tunnel:
     ```bash
     ssh -L 3000:localhost:3000 operator@server-ip
     ```
   - Log in with `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD`.
   - Confirm Prometheus datasource is healthy at `http://prometheus:9090`.

---

## 14. Backup & Disaster Recovery Setup

### Host Backup Directory
```bash
sudo mkdir -p /var/backups/traceops
sudo chown $USER:$USER /var/backups/traceops
```

### Scheduled Backup Cron
Create `/etc/cron.d/traceops-backup`:
```cron
# Run daily TraceOps backup at 02:00 UTC
0 2 * * * operator cd /opt/traceops && node scripts/backup_recovery_service.js backup /var/backups/traceops >> /var/log/traceops-backup.log 2>&1
```

### Manual Backup & Integrity Check
```bash
# Create complete snapshot
node scripts/backup_recovery_service.js backup

# Verify SHA-256 cryptographic manifest integrity
node scripts/backup_recovery_service.js verify backups/backup_<timestamp>
```

---

## 15. Deployment Rollback Procedures

### Container Application Rollback
To roll back to a previous Git SHA:
```bash
# 1. Update image tags to previous known-good commit
export PREVIOUS_SHA=<previous-commit-sha>
docker tag traceops-backend:${PREVIOUS_SHA} requirement-traceable-devops-backend:latest
docker tag traceops-frontend:${PREVIOUS_SHA} requirement-traceable-devops-frontend:latest
docker tag traceops-ml:${PREVIOUS_SHA} requirement-traceable-devops-ml-service:latest

# 2. Recreate containers with zero downtime
docker compose -f docker-compose.prod.yml up -d --no-build
```

### ML Governance Predecessor Rollback
If an active model exhibits drift or operational degradation:
```bash
curl -X POST https://traceops.example.com/api/ml/governance/models/mdl-prod-2.0.0/rollback \
  -H "Authorization: Bearer $ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Production metric degradation observed", "trigger": "MANUAL_OPERATOR"}'
```

### Database Restoration
```bash
node scripts/backup_recovery_service.js restore /var/backups/traceops/backup_<timestamp>
```

---

## 16. Troubleshooting Guide

| Symptom | Probable Cause | Remediation |
| :--- | :--- | :--- |
| `HTTP 502 Bad Gateway` on `/api/*` | Backend container initializing or unhealthy | Check `docker compose -f docker-compose.prod.yml logs backend` |
| `HTTP 503 Service Unavailable` on `/health/ready` | MongoDB connection failure | Inspect `docker logs traceops-prod-mongodb` and verify MongoDB URI |
| Caddy fails to obtain SSL certificate | Port 80 blocked by firewall or DNS unpropagated | Ensure UFW allows 80/tcp and verify `dig traceops.example.com` |
| `HTTP 429 Too Many Requests` | IP exceeded sliding-window rate limit | Wait 60 seconds or adjust `RATE_LIMIT_AUTH_MAX` in `.env` |
| Repair validation sandbox failure | Docker daemon socket missing or permissions | Verify `/var/run/docker.sock` is accessible by backend container |

---

## 17. Emergency Procedures

### Freeze Operations & Terminate Ingress
```bash
# Stop public reverse proxy immediately (drops external traffic)
docker compose -f docker-compose.prod.yml stop reverse-proxy
```

### Complete Graceful Stack Shutdown
```bash
docker compose -f docker-compose.prod.yml down
```

### Hard Stack Destruction (Data Preserved in Docker Volumes)
```bash
docker compose -f docker-compose.prod.yml kill
```
*(Volumes `mongo_prod_data`, `prometheus_prod_data`, and `grafana_prod_data` remain 100% intact).*

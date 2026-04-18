# 🔒 AgentGuard — Self-Hosted Deployment Guide

Deploy AgentGuard's full stack on your own infrastructure. All policy enforcement, audit trails, HITL approvals, and the dashboard run on your hardware — no data leaves your environment.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Architecture](#architecture)
4. [Configuration Reference](#configuration-reference)
5. [TLS / SSL Setup](#tls--ssl-setup)
6. [Backup and Restore](#backup-and-restore)
7. [Upgrading](#upgrading)
8. [Monitoring](#monitoring)
9. [Troubleshooting](#troubleshooting)
10. [Security Hardening](#security-hardening)

---

## Prerequisites

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **CPU** | 2 cores | 4 cores |
| **RAM** | 4 GB | 8 GB |
| **Disk** | 20 GB | 100 GB (audit log retention) |
| **Docker** | 24.0+ | Latest |
| **Docker Compose** | v2.20+ | Latest |
| **OS** | Ubuntu 22.04, Debian 12, macOS 13+ | Ubuntu 24.04 LTS |

### Install Docker

```bash
# Linux (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group change to take effect

# Verify
docker --version          # Docker version 26.x.x
docker compose version    # Docker Compose version v2.x.x
```

### Port Requirements

| Port | Service | Configurable? |
|------|---------|---------------|
| 3000 | AgentGuard API | ✅ `API_PORT` |
| 3001 | AgentGuard Dashboard | ✅ `DASHBOARD_PORT` |
| 5432 | PostgreSQL | Internal only |
| 6379 | Redis | Internal only |

> PostgreSQL and Redis are only accessible within the Docker network (`agentguard-net`) — they are not exposed to the host by default.

---

## Quick Start

Three commands to get AgentGuard running:

```bash
# 1. Clone the repository (or download the release tarball)
git clone https://github.com/thebotclub/agentguard.git
cd agentguard

# 2. Run the interactive setup script
bash scripts/self-hosted-setup.sh

# 3. Open the dashboard
open http://localhost:3001
```

The setup script handles everything:
- Generates `JWT_SECRET`, `INTEGRATION_ENCRYPTION_KEY`, `POSTGRES_PASSWORD`, and `ADMIN_KEY`
- Builds all Docker images from source
- Starts all services in dependency order
- Runs database migrations
- Optionally creates an initial admin user
- Verifies all services are healthy

### Manual Setup (without the script)

```bash
# 1. Copy and edit the environment file
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD, JWT_SECRET, INTEGRATION_ENCRYPTION_KEY, ADMIN_KEY

# 2. Build images
docker compose build

# 3. Start services
docker compose up -d

# 4. Check health
curl http://localhost:3000/health
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Network: agentguard-net            │
│                                                              │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │  agentguard-api │    │   agentguard-dashboard          │ │
│  │  Express/Hono   │◄───│   Next.js 15                    │ │
│  │  Port 3000      │    │   Port 3001                     │ │
│  └────────┬────────┘    └─────────────────────────────────┘ │
│           │                                                  │
│  ┌────────▼──────────────────────────────────────────────┐  │
│  │                agentguard-worker                       │  │
│  │          BullMQ background job processors              │  │
│  └────────┬───────────────────────┬───────────────────┬──┘  │
│           │                       │                   │      │
│  ┌────────▼────────┐   ┌──────────▼────────┐         │      │
│  │    postgres      │   │      redis         │         │      │
│  │  PostgreSQL 16   │   │    Redis 7         │         │      │
│  │  Port 5432       │   │    Port 6379       │         │      │
│  │  Volume: pg-data │   │  Volume: redis-data│         │      │
│  └──────────────────┘   └───────────────────┘         │      │
│                                                        │      │
│  ┌─────────────────────────────────────────────────────┘      │
│  │  api-data volume (SQLite fallback, license cache)          │
│  └────────────────────────────────────────────────────────────│
└─────────────────────────────────────────────────────────────┘
```

### Service Dependency Order

```
postgres ──┐
           ├──► agentguard-api ──► agentguard-dashboard
redis ─────┘         │
                     └──────────────► agentguard-worker
```

---

## Configuration Reference

All configuration is done via environment variables in `.env`. Copy from `.env.example`:

```bash
cp .env.example .env
```

### Required Variables

These **must** be set to non-default values before starting in production:

| Variable | Description | Generate with |
|----------|-------------|---------------|
| `POSTGRES_PASSWORD` | PostgreSQL password | `openssl rand -hex 24` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | `openssl rand -hex 32` |
| `INTEGRATION_ENCRYPTION_KEY` | AES-256-GCM key for integration secrets | `openssl rand -hex 32` |
| `ADMIN_KEY` | Admin API key for privileged endpoints | `openssl rand -hex 24` |

> ⚠️ The API will **refuse to start** in production if `JWT_SECRET` or `INTEGRATION_ENCRYPTION_KEY` look like development defaults (contain `dev-`, `change-in-production`, etc.).

### Runtime Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Runtime environment |
| `LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |
| `API_PORT` | `3000` | Host port for the API |
| `DASHBOARD_PORT` | `3001` | Host port for the dashboard |

### Database Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_TYPE` | `postgres` | `postgres` or `sqlite` (dev only) |
| `POSTGRES_PASSWORD` | _(required)_ | PostgreSQL password |
| `DATABASE_URL` | auto-configured | Full Postgres DSN (set automatically in compose) |

### Dashboard Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000` | Public URL of the API (browser-visible) |
| `NEXTAUTH_URL` | `http://localhost:3001` | Full URL of the dashboard (for auth callbacks) |

> **Important:** If you put AgentGuard behind a reverse proxy, set `NEXT_PUBLIC_API_URL` to the **public** URL (e.g., `https://api.agentguard.yourcompany.com`).

### Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_PER_MIN` | `100` | API requests per minute per IP |
| `SIGNUP_RATE_LIMIT_PER_HOUR` | `5` | Account creation rate per IP per hour |

### CORS

| Variable | Default | Description |
|----------|---------|-------------|
| `CORS_ORIGINS` | _(empty)_ | Comma-separated extra allowed origins |

### SSO / JWT Verification

| Variable | Description |
|----------|-------------|
| `JWT_JWKS_URL` | IdP JWKS endpoint (Okta, Azure AD, etc.) |
| `JWT_AUDIENCE` | Expected JWT `aud` claim |
| `JWT_ISSUER` | Expected JWT `iss` claim |

### Slack HITL Integration

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Bot token from Slack app (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | Slack signing secret for request verification |
| `SLACK_CHANNEL_ID` | Default channel for HITL approval requests |

### License

| Variable | Description |
|----------|-------------|
| `AGENTGUARD_LICENSE_KEY` | License key (`AGKEY-...`) — blank for Free tier |

---

## TLS / SSL Setup

For production, always terminate TLS at a reverse proxy in front of AgentGuard. The recommended approach is **Nginx + Certbot** (Let's Encrypt).

### Nginx Reverse Proxy Example

Install Nginx and Certbot:

```bash
sudo apt install nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/agentguard`:

```nginx
# AgentGuard API
server {
    listen 80;
    server_name api.agentguard.yourcompany.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.agentguard.yourcompany.com;

    ssl_certificate     /etc/letsencrypt/live/api.agentguard.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.agentguard.yourcompany.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    # SSE endpoint — disable buffering for real-time events
    location /v1/events/ {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Connection '';
        proxy_buffering    off;
        proxy_cache        off;
        proxy_read_timeout 3600s;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # Regular API
    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
        client_max_body_size 10m;
    }
}

# AgentGuard Dashboard
server {
    listen 80;
    server_name agentguard.yourcompany.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name agentguard.yourcompany.com;

    ssl_certificate     /etc/letsencrypt/live/agentguard.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/agentguard.yourcompany.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;

    location / {
        proxy_pass         http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and obtain certificates:

```bash
sudo ln -s /etc/nginx/sites-available/agentguard /etc/nginx/sites-enabled/
sudo certbot --nginx -d api.agentguard.yourcompany.com -d agentguard.yourcompany.com
sudo nginx -t && sudo systemctl reload nginx
```

Update your `.env` to use the public URLs:

```env
NEXT_PUBLIC_API_URL=https://api.agentguard.yourcompany.com
NEXTAUTH_URL=https://agentguard.yourcompany.com
```

Restart the dashboard: `docker compose restart agentguard-dashboard`

### Alternative: Caddy (automatic HTTPS)

If you prefer Caddy, it handles certificate provisioning automatically:

```caddyfile
# /etc/caddy/Caddyfile
api.agentguard.yourcompany.com {
    reverse_proxy localhost:3000
}

agentguard.yourcompany.com {
    reverse_proxy localhost:3001
}
```

```bash
sudo apt install caddy
sudo systemctl enable --now caddy
```

---

## Backup and Restore

### What to Back Up

| Data | Location | Criticality |
|------|----------|-------------|
| PostgreSQL database | `pg-data` Docker volume | 🔴 Critical |
| Redis state | `redis-data` volume | 🟡 Important (rate limits, caches) |
| Environment file | `.env` | 🔴 Critical (secrets!) |

### Automated Backup Script

Create `/opt/agentguard-backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/opt/agentguard-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
COMPOSE_DIR="/opt/agentguard"  # adjust to your install path

mkdir -p "$BACKUP_DIR"

# PostgreSQL backup
echo "Backing up PostgreSQL..."
docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T postgres \
  pg_dump -U agentguard agentguard | gzip > "$BACKUP_DIR/postgres_${TIMESTAMP}.sql.gz"

# Redis backup (force RDB snapshot)
echo "Backing up Redis..."
docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T redis \
  redis-cli BGSAVE
sleep 2
docker run --rm \
  -v agentguard_redis-data:/data \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf "/backup/redis_${TIMESTAMP}.tar.gz" /data

# Environment file (contains secrets — store securely!)
cp "$COMPOSE_DIR/.env" "$BACKUP_DIR/env_${TIMESTAMP}.env"
chmod 600 "$BACKUP_DIR/env_${TIMESTAMP}.env"

# Cleanup: keep last 7 days
find "$BACKUP_DIR" -name "*.gz" -mtime +7 -delete
find "$BACKUP_DIR" -name "*.env" -mtime +7 -delete

echo "Backup complete: $BACKUP_DIR"
ls -lh "$BACKUP_DIR"/*_${TIMESTAMP}* 2>/dev/null || true
```

Schedule with cron (daily at 2 AM):

```bash
chmod +x /opt/agentguard-backup.sh
echo "0 2 * * * root /opt/agentguard-backup.sh >> /var/log/agentguard-backup.log 2>&1" \
  | sudo tee /etc/cron.d/agentguard-backup
```

### Restore Procedure

```bash
# 1. Stop services (keep postgres running for restore)
docker compose stop agentguard-api agentguard-dashboard agentguard-worker

# 2. Restore PostgreSQL
gunzip -c /opt/agentguard-backups/postgres_TIMESTAMP.sql.gz | \
  docker compose exec -T postgres psql -U agentguard agentguard

# 3. Restore Redis (optional — Redis data is mostly caches and rate limits)
docker run --rm \
  -v agentguard_redis-data:/data \
  -v /opt/agentguard-backups:/backup \
  alpine sh -c "cd /data && tar xzf /backup/redis_TIMESTAMP.tar.gz --strip-components=1"

# 4. Restart services
docker compose up -d

# 5. Verify health
curl http://localhost:3000/health
```

---

## Upgrading

### Standard Upgrade (latest release)

```bash
cd /path/to/agentguard

# 1. Pull latest code
git pull origin main

# 2. Rebuild images
docker compose build

# 3. Apply any new database migrations
docker compose run --rm agentguard-api npx prisma migrate deploy 2>/dev/null || true

# 4. Rolling restart (zero-downtime if you have multiple replicas)
docker compose up -d --no-deps agentguard-api
docker compose up -d --no-deps agentguard-dashboard
docker compose up -d --no-deps agentguard-worker

# 5. Verify
docker compose ps
curl http://localhost:3000/health
```

### Checking the Current Version

```bash
curl http://localhost:3000/health | python3 -m json.tool
# Look for "version" field
```

### Rollback

```bash
# Roll back to a specific git tag
git checkout v0.10.0
docker compose build
docker compose up -d
```

> ⚠️ If you rolled back across a database migration, you may need to restore from backup. Always test upgrades in a staging environment first.

---

## Monitoring

### Health Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Basic liveness check |
| `GET /api/v1/health/detailed` | Full component health (DB, Redis, queues) |

Example:

```bash
curl http://localhost:3000/health
# {"status":"ok","version":"0.9.0","db":"connected","redis":"connected"}

curl http://localhost:3000/api/v1/health/detailed
# {"status":"ok","components":{"database":{"status":"ok","latencyMs":2},"redis":{"status":"ok","latencyMs":1},...}}
```

### Docker Compose Status

```bash
docker compose ps
docker compose top
docker stats  # live CPU/memory per container
```

### Log Access

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f agentguard-api
docker compose logs -f postgres

# Last 100 lines
docker compose logs --tail=100 agentguard-api
```

### Prometheus Metrics (optional)

AgentGuard exposes metrics at `GET /metrics` (Prometheus format) when `METRICS_ENABLED=true`. Scrape with:

```yaml
# prometheus.yml scrape config
scrape_configs:
  - job_name: agentguard
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: /metrics
    scrape_interval: 30s
```

---

## Troubleshooting

### Container won't start

```bash
# Check logs for the failing service
docker compose logs agentguard-api

# Common causes:
# 1. Missing required env var — check .env for POSTGRES_PASSWORD, JWT_SECRET etc.
# 2. Port already in use — check: lsof -i :3000; lsof -i :3001
# 3. Docker out of disk space — check: docker system df
```

### API returns 500 errors

```bash
# Enable debug logging
LOG_LEVEL=debug docker compose up -d agentguard-api

# Check for DB connection issues
docker compose exec agentguard-api node -e "
  const {Pool} = require('pg');
  const p = new Pool({connectionString: process.env.DATABASE_URL});
  p.query('SELECT NOW()').then(r=>console.log('DB OK:', r.rows[0])).catch(console.error).finally(()=>p.end());
"
```

### Database connection failed

```bash
# Verify postgres is healthy
docker compose ps postgres
# Status should show "healthy"

# Test connection manually
docker compose exec postgres psql -U agentguard -d agentguard -c "SELECT version();"

# Check DATABASE_URL in the API container
docker compose exec agentguard-api printenv DATABASE_URL
```

### "JWT_SECRET must be set" startup error

The API refuses to start if `JWT_SECRET` is missing or looks like a dev default. Fix:

```bash
# Generate a strong secret
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
docker compose up -d agentguard-api
```

### Dashboard shows "Cannot connect to API"

This usually means `NEXT_PUBLIC_API_URL` is wrong or the API isn't reachable from the browser:

```bash
# Check what URL the dashboard is trying to reach
docker compose exec agentguard-dashboard printenv NEXT_PUBLIC_API_URL

# If behind a reverse proxy, update .env:
# NEXT_PUBLIC_API_URL=https://api.agentguard.yourcompany.com
docker compose up -d --no-deps agentguard-dashboard
```

### Redis connection issues

```bash
# Test Redis connectivity
docker compose exec redis redis-cli ping
# Expected: PONG

# Check memory usage
docker compose exec redis redis-cli info memory | grep used_memory_human
```

### Out of disk space

```bash
# Show Docker disk usage
docker system df

# Clean up unused images and build cache
docker system prune -f

# Show volume sizes
docker run --rm -v agentguard_pg-data:/data alpine du -sh /data
docker run --rm -v agentguard_redis-data:/data alpine du -sh /data
```

### Performance: evaluate endpoint slow

```bash
# Check policy engine cache hit rate via API
curl -H "x-admin-key: $ADMIN_KEY" \
  http://localhost:3000/api/v1/admin/stats

# Verify Redis is being used for caching
docker compose exec redis redis-cli keys "policy:*" | wc -l
```

---

## Security Hardening

For production deployments in regulated environments:

### 1. Restrict Network Access

```bash
# Firewall: only expose ports 3000/3001 to your reverse proxy
sudo ufw allow from <nginx-ip> to any port 3000
sudo ufw allow from <nginx-ip> to any port 3001
sudo ufw deny 3000
sudo ufw deny 3001
```

### 2. Rotate Secrets Periodically

```bash
# Generate new JWT_SECRET (all existing sessions will be invalidated)
NEW_SECRET=$(openssl rand -hex 32)
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$NEW_SECRET/" .env
docker compose restart agentguard-api

# Generate new ENCRYPTION_KEY (existing encrypted data will need re-encryption)
# WARNING: This will invalidate stored Slack/SSO credentials — re-enter them in the dashboard
NEW_KEY=$(openssl rand -hex 32)
sed -i "s/^INTEGRATION_ENCRYPTION_KEY=.*/INTEGRATION_ENCRYPTION_KEY=$NEW_KEY/" .env
docker compose restart agentguard-api
```

### 3. Keep Images Updated

```bash
# Pull latest base images (security patches)
docker compose pull
docker compose build --no-cache
docker compose up -d
```

### 4. Limit Container Resources

Add resource limits to `docker-compose.yml`:

```yaml
services:
  agentguard-api:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### 5. Enable PostgreSQL SSL

For external PostgreSQL connections, add SSL to `DATABASE_URL`:

```
DATABASE_URL=postgresql://agentguard:password@postgres:5432/agentguard?sslmode=require
```

---

## Support

| Channel | Link |
|---------|------|
| Documentation | [docs.agentguard.tech](https://docs.agentguard.tech) |
| GitHub Issues | [github.com/thebotclub/agentguard/issues](https://github.com/thebotclub/agentguard/issues) |
| Pro Support | [agentguard.tech/support](https://agentguard.tech/support) |

---

*Last updated: March 2026 — AgentGuard v0.10.0*

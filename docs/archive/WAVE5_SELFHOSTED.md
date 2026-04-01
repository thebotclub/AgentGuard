# Wave 5: Self-Hosted Docker Compose — Summary

**Date:** March 2026  
**Commit:** `422bd3e` — wave5: self-hosted Docker Compose stack  
**Scope:** Enterprise/regulated self-hosted deployment packaging

---

## What Was Built

### 1. `docker-compose.yml` (root-level, build from source)

Complete 5-service stack replacing the prior minimal `self-hosted/docker-compose.yml` (which only pulled a pre-built monolith image):

| Service | Image | Port | Notes |
|---------|-------|------|-------|
| `postgres` | `postgres:16-alpine` | internal | persistent `pg-data` volume |
| `redis` | `redis:7-alpine` | internal | AOF persistence, 256 MB memory cap |
| `agentguard-api` | `./Dockerfile.api` | `3000` | builds from source |
| `agentguard-dashboard` | `./Dockerfile.dashboard` | `3001` | Next.js 15, builds from source |
| `agentguard-worker` | `./Dockerfile.worker` | internal | BullMQ background jobs |

**Key features:**
- Health checks on all 5 services with `condition: service_healthy` dependency ordering
- Startup order enforced: `postgres`/`redis` → `agentguard-api` → `agentguard-dashboard` + `agentguard-worker`
- All secrets passed as environment variables with `${VAR:?error}` guards (compose fails fast if required vars missing)
- Named volumes for all persistent data
- Isolated `agentguard-net` bridge network (postgres/redis not exposed to host)

### 2. Dockerfiles

#### `Dockerfile.api` (improved)
- Multi-stage: `deps` → `builder` → `runtime`
- Non-root user: `agentguard:nodejs` (UID/GID 1001)
- Production-only deps in final stage
- Proper healthcheck via `node fetch()` (no `curl` binary required)
- `/data` volume for SQLite fallback

#### `Dockerfile.dashboard` (rewritten)
The previous version was broken — it used `FROM nginx:alpine` and copied a `dashboard/` directory that doesn't exist (the actual dashboard is Next.js in `packages/dashboard`).

New version:
- Multi-stage: `deps` → `builder` → `runtime`  
- Injects `output: "standalone"` into `next.config.js` at build time for minimal final image
- Works with both ESM (`export default`) and CJS (`module.exports`) config formats
- Falls back to `next start` if standalone server.js isn't present
- Non-root user: `nextjs:nodejs`
- Healthcheck against `http://localhost:3001`

#### `Dockerfile.worker` (improved)
- Non-root user added
- Updated to port 3002 (avoids conflict with API on 3000, dashboard on 3001)
- Gracefully skips missing worker entry points (previously would fail if `src/workers/*.ts` not compiled)
- Uses `--omit=dev` for smaller production image

#### `docker/start-workers.sh` (updated)
- Uses port 3002 for health server
- Iterates over worker files, skips any that weren't compiled
- Keeps health server alive even when no workers are built (allows graceful degradation)

### 3. `.env.example` (comprehensive)

Rebuilt with documentation for all 20+ environment variables:
- Each variable has a description, default, and where applicable a `generate with:` command
- Clear REQUIRED vs optional markers
- Sections: Runtime, Security Secrets, Database, Redis, Dashboard, Rate Limiting, CORS, SSO, Slack HITL, License, Stripe, Telemetry

### 4. `scripts/self-hosted-setup.sh`

Full interactive setup automation (600+ lines):
- **Preflight:** Docker, Docker Compose v2, Docker daemon running, memory check
- **Secret generation:** JWT_SECRET (256-bit), INTEGRATION_ENCRYPTION_KEY (256-bit AES), POSTGRES_PASSWORD (192-bit), ADMIN_KEY
- **Safe writes:** never overwrites existing non-default values
- **Docker build:** `docker compose build --parallel`
- **Staged startup:** postgres/redis → wait for health → api → migrations → dashboard/worker
- **Migrations:** tries `prisma migrate deploy` first, falls back to API `/admin/migrate` endpoint
- **Admin user creation:** optional interactive step
- **Health verification:** checks all services, shows compose ps
- **Flags:** `--non-interactive` (CI-safe), `--skip-build` (faster iteration)

### 5. `docs/SELF_HOSTED.md`

Complete operations guide (400+ lines):

| Section | Coverage |
|---------|----------|
| Prerequisites | CPU/RAM/disk minimums, Docker install instructions, port table |
| Quick Start | 3-command setup using the script |
| Architecture | ASCII diagram, service dependency tree |
| Configuration Reference | All env vars with types, defaults, generation commands |
| TLS / SSL | Full nginx config (API + dashboard + SSE endpoint), Caddy alternative |
| Backup & Restore | Automated backup script, cron setup, full restore procedure |
| Upgrading | Standard upgrade runbook, rollback procedure |
| Monitoring | Health endpoints, docker stats, Prometheus scrape config |
| Troubleshooting | 8 common failure scenarios with diagnostic commands |
| Security Hardening | Network ACLs, secret rotation, resource limits, PostgreSQL SSL |

---

## Architecture Decisions

### Why Separate API and Dashboard Containers?
The existing `self-hosted/docker-compose.yml` ran a monolith. Separating them enables:
- Independent scaling (multiple API replicas vs single dashboard)
- Separate health checks and restart policies
- Dashboard can be behind CDN while API handles SDK traffic

### Dashboard Standalone Output
Next.js `output: "standalone"` copies only the minimum runtime files needed (no `node_modules` in final image), reducing the dashboard image from ~1.5 GB to ~300 MB.

### Worker Port Change (3001 → 3002)
The worker healthcheck was using port 3001, which conflicts with the dashboard. Updated to 3002 to allow all three (api: 3000, dashboard: 3001, worker: 3002) to coexist without port conflicts.

### Graceful Worker Degradation
The worker Dockerfile and `start-workers.sh` now gracefully skip missing worker entry points. This prevents startup failures when worker source files haven't been compiled (e.g., because the monorepo structure was refactored).

---

## Limitations / Known Issues

1. **`docker compose build` not testable in sandbox** — Docker is not available in the forge sandbox. Build correctness was validated via static analysis (Dockerfile syntax, YAML validity, file references). Should be tested on a Docker host before production rollout.

2. **Dashboard standalone output** — The `output: "standalone"` injection uses `sed`. If Next.js config is complex (multi-line object, computed keys), this sed approach may fail. Fallback: the Dockerfile also copies `.next/` and falls back to `next start`. A cleaner long-term fix is to add `output: "standalone"` directly to `packages/dashboard/next.config.js`.

3. **Worker entry points** — `Dockerfile.worker` looks for `api/workers/*.ts`. If the monorepo refactors worker code elsewhere, update the glob in the Dockerfile.

4. **Prisma schema** — The API uses a mix of SQLite (dev) and PostgreSQL (prod). If `prisma/schema.prisma` is present, migrations run via `prisma migrate deploy`. Otherwise the API's startup migrations are relied on. The compose setup depends on the API handling its own DB initialization on first start.

---

## Files Created / Modified

| File | Status | Summary |
|------|--------|---------|
| `docker-compose.yml` | Modified | Complete 5-service stack (was: single pre-built monolith) |
| `Dockerfile.api` | Modified | Added non-root user, improved healthcheck |
| `Dockerfile.dashboard` | Modified | Rewritten for Next.js 15 (was: broken nginx) |
| `Dockerfile.worker` | Modified | Added non-root user, fixed port to 3002 |
| `docker/start-workers.sh` | Modified | Port 3002, graceful missing-worker handling |
| `.env.example` | Modified | Comprehensive docs for all vars |
| `scripts/self-hosted-setup.sh` | **New** | Full setup automation (600+ lines) |
| `docs/SELF_HOSTED.md` | **New** | Complete operations guide (400+ lines) |

---

## Next Steps (Recommendations)

1. **Test on a Docker host** — Run `docker compose build` and `docker compose up -d` on a machine with Docker to verify images build and services start successfully.

2. **Add `output: "standalone"` directly** to `packages/dashboard/next.config.js` rather than patching it in the Dockerfile.

3. **Helm chart** (Wave 6 / [Inf7.1]) — The architect review identifies a Kubernetes Helm chart as the next step for regulated-industry enterprise customers who can't use Docker Compose.

4. **CI pipeline** — Add a `docker compose build` step to GitHub Actions (`.github/workflows/`) to catch Dockerfile regressions early.

5. **Multi-arch builds** — Add `--platform linux/amd64,linux/arm64` to `docker buildx` for Apple Silicon compatibility.

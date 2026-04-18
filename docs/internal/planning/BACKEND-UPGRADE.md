# AgentGuard Backend Upgrade — Summary

**Completed:** 2026-03-01  
**Scope:** `api/server.ts` upgraded from in-memory demo → production-grade with SQLite persistence.

---

## What Changed

### 1. SQLite Persistence (`better-sqlite3`)
- On startup, opens `/data/agentguard.db` (Docker volume) with fallback to `./agentguard.db`
- WAL mode enabled for concurrent read performance
- Schema: `tenants`, `api_keys`, `audit_events`, `sessions`, `settings`
- All prepared statements for zero SQL injection surface
- Global kill switch state persisted in `settings` table — survives restarts

### 2. Tenant Signup (`POST /api/v1/signup`)
- Accepts `{ name, email, company? }`
- Validates email format with regex
- Rejects duplicate emails (409)
- Creates tenant + API key in a single SQLite transaction
- API key format: `ag_live_` + 32 hex chars (cryptographically random)
- Returns `{ tenantId, apiKey, dashboard }`
- Rate limited: 5 signups per IP per hour
- Duplicate email → 409; bad email → 400; rate limit → 429

### 3. API Key Auth on `/api/v1/evaluate`
- `X-API-Key` header → looks up tenant, tracks `last_used_at`, stores audit events under tenant_id
- No header → demo mode, audit events stored with `tenant_id = NULL` (displayed as 'demo')
- `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers on all responses
- Tenant kill switch also checked during evaluate

### 4. Per-Tenant Kill Switch (`POST /api/v1/killswitch`)
- Requires valid API key → toggles kill switch for THAT tenant only
- State stored in SQLite `tenants.kill_switch_active` — survives restarts
- `POST /api/v1/admin/killswitch` (with `ADMIN_KEY` env var) → toggles global kill switch
- Global kill switch also persisted in SQLite `settings` table
- `GET /api/v1/killswitch` with API key returns both global + tenant status

### 5. Persistent Audit Trail
- Every evaluation (both `/evaluate` and `/playground/evaluate`) stored in SQLite
- Hash chain: `hash = SHA-256(previous_hash + '|' + tool + '|' + result + '|' + timestamp)`
- Genesis hash is all zeros (from SDK's `GENESIS_HASH` constant)
- `GET /api/v1/audit` (API key required) — paginated with `?limit=&offset=`
- `GET /api/v1/audit/verify` — re-derives all hashes and validates chain integrity

### 6. Usage Stats (`GET /api/v1/usage`)
- Requires API key
- Returns: `totalEvaluations`, `blocked`, `allowed`, `monitored`, `requireApproval`, `last24h`, `topBlockedTools`, `avgResponseMs`

### 7. Dockerfile.api Updated
- Added `python3 make g++` (Alpine build tools for native module compilation)
- Added `better-sqlite3` and `@types/better-sqlite3` to install step
- Created `/data` directory
- Added `VOLUME /data` directive

---

## Backward Compatibility
- All existing endpoints unchanged and working
- Playground endpoints remain public (no auth required)
- `/api/v1/evaluate` still works without API key (demo mode)
- In-memory session state for playground preserved alongside SQLite persistence

---

## New Environment Variables
| Variable | Description |
|----------|-------------|
| `ADMIN_KEY` | Master key for `POST /api/v1/admin/killswitch` |
| `PORT` | API port (default: 3000) |

---

## Dependencies Added
- `better-sqlite3` ^12.6.2 (runtime)
- `@types/better-sqlite3` ^7.6.13 (dev)
- `@types/express` ^5.0.6 (dev, fixes TS errors)
- `@types/cors` ^2.8.19 (dev, fixes TS errors)

---

## Deployment Notes
- Mount `/data` as a persistent volume in Docker Compose / Kubernetes
- Set `ADMIN_KEY` env var for admin operations
- No PostgreSQL or Redis needed — SQLite handles everything
- Zero-downtime restarts: WAL mode ensures safe concurrent access

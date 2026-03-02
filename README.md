# 🛡️ AgentGuard

**Runtime security platform for AI agents — policy engine, audit trail, and kill switch in a single API.**

[![CI](https://github.com/agentguard/agentguard/actions/workflows/deploy-azure.yml/badge.svg)](https://github.com/agentguard/agentguard/actions/workflows/deploy-azure.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js ≥22](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)

## What is AgentGuard?

AgentGuard sits between your AI agent and the tools it calls. Every action is evaluated in under 1ms against your policy rules before it executes.

- **Policy engine** — YAML-defined rules with priority ordering, glob/regex matching, param constraints, and rate limiting
- **Tamper-proof audit trail** — SHA-256 hash-chained event log; every action is permanent and verifiable
- **Kill switch** — halt all agent activity instantly, at global or per-tenant level
- **Multi-tenant** — full tenant isolation with API key auth and per-tenant audit logs

## Architecture

```
  AI Agent
     │
     ▼
┌────────────────────────────────────────────┐
│            AgentGuard API                  │
│                                            │
│  ┌──────────────┐    ┌──────────────────┐  │
│  │ Policy Engine│    │  Kill Switch     │  │
│  │              │    │  (global/tenant) │  │
│  │ Rule 1 ──►─┐ │    └──────────────────┘  │
│  │ Rule 2    │ │                            │
│  │ Rule N    │ │    ┌──────────────────┐    │
│  │           ▼ │    │   Audit Trail    │    │
│  │   ALLOW / BLOCK   │  (hash-chained) │    │
│  │   MONITOR / HITL  └──────────────────┘  │
│  └──────────────┘                          │
│                                            │
│  SQLite (WAL) ◄── persistent events        │
└────────────────────────────────────────────┘
     │
     ▼
  Tool executes (or is blocked)
```

## Quick Start

### Prerequisites
- Node.js ≥ 22
- npm ≥ 10

### Run locally

```bash
git clone https://github.com/agentguard/agentguard
cd agentguard
npm install
npm run dev
```

API is now running at `http://localhost:3000`.

### Run tests

```bash
# Unit tests (policy engine)
npm run test

# E2E tests (requires server running)
npm run test:e2e

# All tests
npm run test:all
```

### Try it immediately

```bash
# Evaluate an action (no auth needed)
curl -X POST http://localhost:3000/api/v1/evaluate \
  -H "Content-Type: application/json" \
  -d '{"tool":"sudo","params":{"command":"cat /etc/shadow"}}'

# Response:
# {"result":"block","matchedRuleId":"block-privilege-escalation","riskScore":450,...}
```

## API Reference

All requests to authenticated endpoints require `X-API-Key: ag_live_<key>` header.

### `GET /`
Returns API version, status, and endpoint directory.

```bash
curl http://localhost:3000/
```

### `GET /health`
Health check — returns uptime, version, kill switch state.

```bash
curl http://localhost:3000/health
# {"status":"ok","engine":"agentguard","version":"0.2.0","uptime":42.1,"killSwitch":false,"db":"sqlite"}
```

### `POST /api/v1/signup`
Create a tenant account and receive an API key.

```bash
curl -X POST http://localhost:3000/api/v1/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme Corp","email":"team@acme.com"}'

# {"tenantId":"...","apiKey":"ag_live_...","message":"Account created..."}
```

**Rate limit:** 5 signups per IP per hour.

### `POST /api/v1/evaluate`
Evaluate an agent action against the policy engine. Auth optional — unauthenticated requests run in demo mode.

```bash
curl -X POST http://localhost:3000/api/v1/evaluate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ag_live_your_key" \
  -d '{"tool":"file_read","params":{"path":"/reports/q4.csv"}}'

# {"result":"allow","matchedRuleId":"allow-read-operations","riskScore":0,"durationMs":0.42}
```

**Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tool` | string | ✅ | Tool name (max 200 chars) |
| `params` | object | ❌ | Tool parameters for rule matching |

**Results:** `allow` · `block` · `monitor` · `require_approval`

### `GET /api/v1/audit`
Get your tenant's persistent, hash-chained audit trail. **Requires auth.**

```bash
curl http://localhost:3000/api/v1/audit \
  -H "X-API-Key: ag_live_your_key"

# {"tenantId":"...","total":42,"limit":50,"offset":0,"events":[...]}
```

Query params: `?limit=50&offset=0`

### `GET /api/v1/audit/verify`
Verify the integrity of the audit hash chain. **Requires auth.**

```bash
curl http://localhost:3000/api/v1/audit/verify \
  -H "X-API-Key: ag_live_your_key"

# {"valid":true,"eventCount":42,"message":"Hash chain verified: 42 events intact"}
```

### `GET /api/v1/usage`
Usage statistics for your tenant. **Requires auth.**

```bash
curl http://localhost:3000/api/v1/usage \
  -H "X-API-Key: ag_live_your_key"

# {"totalEvaluations":100,"blocked":23,"allowed":71,"last24h":15,...}
```

### `GET /api/v1/killswitch`
Get kill switch status (global + tenant if authenticated).

### `POST /api/v1/killswitch`
Toggle your tenant's kill switch. **Requires auth.**

```bash
curl -X POST http://localhost:3000/api/v1/killswitch \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ag_live_your_key" \
  -d '{"active":true}'
```

### `POST /api/v1/admin/killswitch`
Toggle the **global** kill switch — blocks ALL tenants. **Requires `ADMIN_KEY`.**

### Playground Endpoints

The playground is a stateful, session-based demo environment with an in-memory audit trail.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/playground/session` | Create a session (optionally with custom policy) |
| `POST` | `/api/v1/playground/evaluate` | Evaluate with session tracking |
| `GET` | `/api/v1/playground/audit/:sessionId` | In-memory audit trail for session |
| `GET` | `/api/v1/playground/policy` | Active policy document |
| `GET` | `/api/v1/playground/scenarios` | Preset attack scenarios |

**Playground session example:**

```bash
# 1. Create session
SESSION=$(curl -s -X POST http://localhost:3000/api/v1/playground/session | jq -r .sessionId)

# 2. Evaluate actions
curl -X POST http://localhost:3000/api/v1/playground/evaluate \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION\",\"tool\":\"sudo\",\"params\":{\"command\":\"whoami\"}}"

# 3. View audit trail
curl http://localhost:3000/api/v1/playground/audit/$SESSION
```

## Default Policy Rules

The built-in demo policy includes 7 rules (priority = lower number wins):

| Priority | Rule ID | Action | Triggers |
|----------|---------|--------|----------|
| 5 | `block-privilege-escalation` | **block** | `shell_exec`, `sudo`, `chmod`, `chown`, `system_command` |
| 8 | `block-destructive-ops` | **block** | `file_delete`, `rm`, `rmdir`, `unlink`, `drop_table` |
| 10 | `block-external-http` | **block** | `http_request`, `http_post`, `fetch`, etc. to unapproved domains |
| 15 | `require-approval-financial` | **require_approval** | Transactions > $1,000 |
| 20 | `block-pii-tables` | **block** | `db_query` on `users`, `customers`, `employees`, `payroll` |
| 50 | `monitor-llm-calls` | **monitor** | All LLM API calls |
| 100 | `allow-read-operations` | **allow** | `file_read`, `db_read_public`, `get_config`, `list_files` |

Default action: **allow** (fail-open for unmatched tools).

## Deployment

### CI/CD (GitHub Actions → Azure)

The pipeline is defined in `.github/workflows/deploy-azure.yml`:

1. **Validate** — type-check TypeScript, run unit tests
2. **Build & Deploy** — detect changed services, build Docker images via Azure Container Registry, update Container Apps

Required secrets: `ARM_CLIENT_ID`, `ARM_TENANT_ID`, `ARM_SUBSCRIPTION_ID`

### Docker

```bash
# Build
docker build -f Dockerfile.api -t agentguard-api .

# Run
docker run -p 3000:3000 \
  -e ADMIN_KEY=your_admin_key \
  -v /data:/data \
  agentguard-api
```

The container writes its SQLite database to `/data/agentguard.db` (bind-mount a volume for persistence).

### Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | API listen port |
| `NODE_ENV` | `development` | Environment |
| `ADMIN_KEY` | _(unset)_ | Admin key for global kill switch |
| `AG_DB_PATH` | `/data/agentguard.db` | SQLite database path (use `:memory:` for tests) |
| `CORS_ORIGINS` | _(unset)_ | Comma-separated extra CORS origins to allow |

## Project Structure

```
agentguard/
├── api/
│   ├── server.ts              # Express API server (SQLite, auth, routes)
│   ├── phase2-routes.ts       # Phase 2 routes (rate limits, costs, dashboard)
│   └── templates/             # YAML policy templates
├── packages/
│   ├── sdk/                   # Policy engine + API client (TypeScript)
│   │   └── src/
│   │       ├── core/          # Policy engine, types, audit logger
│   │       └── sdk/           # AgentGuard API client
│   ├── python/                # Python SDK (agentguard-tech on PyPI)
│   └── shared/                # Shared schemas and types
├── tests/
│   ├── unit.test.ts           # Policy engine unit tests
│   ├── e2e.test.ts            # End-to-end API tests
│   └── phase1.test.ts         # Phase 1 feature tests (webhooks, templates, agents)
├── landing/                   # Marketing landing page
├── dashboard/                 # Static dashboard SPA
├── demo/                      # Interactive demo / playground UI
├── design/                    # Architecture docs
├── docs/                      # Supplementary docs and reports
├── infra/                     # Azure Bicep / Terraform configs
├── .github/workflows/         # CI/CD pipelines
├── Dockerfile.api             # API Docker image
├── Dockerfile.landing         # Landing page Docker image
├── Dockerfile.dashboard       # Dashboard Docker image
└── package.json               # Workspace root
```

## Contributing

1. Fork the repo and create a branch: `git checkout -b feat/my-feature`
2. Install dependencies: `npm install`
3. Make your changes — keep existing tests green: `npm run test`
4. Add tests for new functionality
5. Lint and type-check: `npm run lint`
6. Open a pull request

### Code style
- TypeScript strict mode
- No `any` types without a comment justifying it
- All new routes need a test in `tests/e2e.test.ts`

## License

MIT — see [LICENSE](./LICENSE).

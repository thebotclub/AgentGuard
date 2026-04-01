# AgentGuard Feature Matrix

> **Last updated:** 2026-03 | **Spec:** [SPEC.md](../SPEC.md) | **Architecture:** [ARCHITECTURE.md](./ARCHITECTURE.md) | **Roadmap:** [ROADMAP.md](./ROADMAP.md)

## Core Security Features

| Feature | Spec | Implementation | Tests | Status |
|---------|------|----------------|-------|--------|
| Policy evaluation engine (YAML DSL) | SPEC §3 | `api/routes/evaluate.ts` | `tests/routes/evaluate.test.ts` | ✅ Shipped |
| Tamper-evident audit log (SHA-256 chain) | SPEC §4 | `api/routes/audit.ts`, `api/db-*.ts` | `tests/routes/audit.test.ts` | ✅ Shipped |
| Kill switch (tenant + agent level) | SPEC §5 | `api/routes/auth.ts`, `api/lib/kill-switch-cache.ts` | `tests/routes/auth.test.ts` | ✅ Shipped |
| Prompt injection detection | SPEC §3.3 | `api/routes/evaluate.ts` | `tests/security/regression.test.ts` | ✅ Shipped |
| Tool call validation | SPEC §3.2 | `api/routes/evaluate.ts` | `tests/security/regression.test.ts` | ✅ Shipped |
| SSRF prevention (webhook URLs) | Phase 5 | `api/routes/webhooks.ts` | `tests/routes/webhooks.test.ts` | ✅ Shipped |

## Agent Lifecycle

| Feature | Spec | Implementation | Tests | Status |
|---------|------|----------------|-------|--------|
| Agent CRUD | SPEC §2 | `api/routes/agents.ts` | `tests/routes/agents.test.ts` | ✅ Shipped |
| Agent validation (dry-run) | Phase 4 | `api/validation-routes.ts` | `tests/routes/validation.test.ts` | ✅ Shipped |
| Agent certification | Phase 4 | `api/validation-routes.ts` | `tests/routes/validation.test.ts` | ✅ Shipped |
| Deployment readiness check | Phase 4 | `api/validation-routes.ts` | `tests/routes/validation.test.ts` | ✅ Shipped |
| Coverage check (CI gate) | Phase 4 | `api/validation-routes.ts` | `tests/routes/validation.test.ts` | ✅ Shipped |

## MCP (Model Context Protocol)

| Feature | Spec | Implementation | Tests | Status |
|---------|------|----------------|-------|--------|
| MCP proxy middleware | Phase 3 | `api/mcp-middleware.ts` | `tests/mcp.test.ts` | ✅ Shipped |
| MCP server config management | Phase 3 | `api/mcp-routes.ts` | `tests/mcp.test.ts` | ✅ Shipped |
| MCP admission control | Phase 4 | `api/mcp-routes.ts` | `tests/mcp.test.ts` | ✅ Shipped |

## Authentication & Tenancy

| Feature | Spec | Implementation | Tests | Status |
|---------|------|----------------|-------|--------|
| Tenant signup & API keys | SPEC §1 | `api/routes/auth.ts` | `tests/routes/auth.test.ts` | ✅ Shipped |
| Bcrypt key hashing (SHA-256 index) | Phase 7 | `api/middleware/auth.ts` | `tests/routes/auth.test.ts` | ✅ Shipped |
| Tenant data isolation (RLS) | Phase 5/7 | `api/db-postgres.ts` | `tests/security/regression.test.ts` | ✅ Shipped |
| Zod request validation (17 schemas) | Phase 5/7 | `api/schemas.ts` | all route tests | ✅ Shipped |
| Redis-backed signup rate limits | Remediation 1.1 | `api/lib/redis-rate-limiter.ts` | `tests/routes/auth.test.ts` | ✅ Shipped |

## Observability & Operations

| Feature | Spec | Implementation | Tests | Status |
|---------|------|----------------|-------|--------|
| Structured request logging (pino) | Remediation 2.1 | `api/middleware/request-logger.ts`, `api/lib/logger.ts` | — | ✅ Shipped |
| SDK correlation headers (X-Trace-ID) | Remediation 1.4 | `packages/sdk/`, `packages/python/` | SDK tests | ✅ Shipped |
| Azure Monitor alerting (10 rules) | Remediation 2.2 | `infra/terraform/modules/azure/monitoring.tf` | terraform fmt | ✅ Shipped |
| Operations runbook | Remediation 2.2 | `docs/RUNBOOK.md` | — | ✅ Shipped |
| OpenAPI spec sync (CI check) | Remediation 2.4 | `api/openapi.yaml`, `.github/workflows/test-coverage.yml` | CI step | ✅ Shipped |

## Webhooks & Integrations

| Feature | Spec | Implementation | Tests | Status |
|---------|------|----------------|-------|--------|
| Webhook CRUD | SPEC §4 | `api/routes/webhooks.ts` | `tests/routes/webhooks.test.ts` | ✅ Shipped |
| Reliable webhook delivery (retries) | Remediation 1.3 | `api/lib/webhook-retry.ts` | `tests/routes/webhook-retry.test.ts` | ✅ Shipped |
| Slack HITL (atomic approval) | Phase 5 | `api/routes/slack-hitl.ts` | `tests/routes/slack-hitl.test.ts` | ✅ Shipped |

## Rate Limits & Cost Attribution

| Feature | Spec | Implementation | Tests | Status |
|---------|------|----------------|-------|--------|
| Per-tenant/agent rate limiting | Phase 2 | `api/middleware/rate-limit.ts` | `tests/routes/rate-limits.test.ts` | ✅ Shipped |
| Cost attribution & aggregation | Phase 2 | `api/routes/costs.ts` | `tests/routes/costs.test.ts` | ✅ Shipped |

## SDKs

| Feature | Spec | Implementation | Tests | Status |
|---------|------|----------------|-------|--------|
| TypeScript SDK | SPEC §6 | `packages/sdk/` | `packages/sdk/tests/` | ✅ Published (npm) |
| Python SDK | SPEC §6 | `packages/python/` | `packages/python/tests/` | ✅ Published (PyPI) |
| Auto-register flow | SPEC §2.1 | SDKs + `api/routes/auth.ts` | SDK integration tests | ✅ Shipped |

## Infrastructure

| Feature | Spec | Implementation | Tests | Status |
|---------|------|----------------|-------|--------|
| PostgreSQL + SQLite dual adapter | Phase 5 | `api/db-interface.ts`, `api/db-postgres.ts`, `api/db-sqlite.ts` | all route tests | ✅ Shipped |
| Azure Container Apps deployment | Phase 1 | `infra/terraform/` | terraform fmt | ✅ Shipped |
| Docker multi-service compose | — | `docker-compose.yml`, `Dockerfile.*` | — | ✅ Shipped |
| Helm charts | — | `deploy/helm/`, `helm/` | — | ✅ Shipped |
| Redis kill switch cache | Remediation 1.2 | `api/lib/kill-switch-cache.ts` | `tests/routes/auth.test.ts` | ✅ Shipped |

## Planned / In Progress

| Feature | Spec | Implementation | Tests | Status |
|---------|------|----------------|-------|--------|
| Real-time dashboard SSE | Remediation 2.6 | — | — | 🔜 Planned |
| Compliance PDF export | Remediation 3.1 | — | — | 🔜 Planned |
| Policy DSL composability | Remediation 3.2 | — | — | 🔜 Planned |
| LangGraph streaming support | Remediation 3.3 | — | — | 🔜 Planned |
| Cloudflare Full/Strict SSL | Phase 7 | — | — | 🔜 Planned |
| In-process SDK evaluation | Future | — | — | 🔜 Planned |
| Enterprise JWT/RS256 auth | Future | — | — | 🔜 Planned |

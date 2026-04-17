# AgentGuard — Comprehensive Audit & Strategic Analysis

**Date:** April 2026
**Auditor:** Dubai, Khaleej Pod Lead — The Bot Club
**Repository:** `/home/node/AgentGuard`
**Version:** v0.9.2 (package.json), docs reference v0.10.0 (README badges)

---

## 1. Executive Summary

- **Impressive scope for a bootstrapped product:** 34+ API endpoints, TypeScript + Python SDKs, CLI, dashboard, MCP proxy, deployment enforcement, compliance reporting, Slack HITL, SSO, SCIM, Stripe billing, SIEM integration, Helm chart, Terraform IaC — all built in ~3 months. The ambition-to-execution ratio is high.
- **Critical test infrastructure is broken:** `npm test` fails due to a Prisma 7 breaking change (`datasource url` moved to `prisma.config.ts`). This means CI is likely failing or tests aren't running at all — a serious red flag for a product that claims 773 passing tests in its README.
- **The codebase has two parallel database systems:** A raw-SQL `IDatabase` interface (in `api/`) coexists with a Prisma ORM (in `packages/api/`). This is not a clean monorepo — it's two codebases sharing a `package.json`, creating confusion about which system is canonical.
- **Security posture is genuinely strong for this stage:** bcrypt-hashed API keys, SHA-256 audit hash chain, SSRF protection, Zod validation on 17 schemas, RLS on 8 tables, JWT+SSO, rate limiting with brute-force protection, CSRF protection, structured logging with request correlation. The security hardening work (Phase 7) was done properly.
- **The biggest risk is scope creep vs. depth:** The roadmap has 44 prioritized items across 4 sprint categories. The product does many things partially rather than a few things excellently. For a pre-revenue startup, this is dangerous.

---

## 2. Critical Issues

### 2.1 ❌ Test Suite Is Broken

**Severity: P0 — Blocks CI, masks regressions**

Running `npm test` produces:
```
Error: Prisma schema validation - (get-config wasm)
error: The datasource property `url` is no longer supported in schema files.
```

Prisma 7 moved `url` and `directUrl` out of `schema.prisma` into `prisma.config.ts`. The `pretest` script runs `npx prisma generate` which fails, preventing any tests from executing.

**Impact:**
- CI is either failing (and being ignored) or the `pretest` step is not configured in CI
- README claims "773 passing tests" and "67% coverage" — these numbers are stale
- No regression protection on any code changes
- Deploy pipeline may be pushing untested code to production

**Fix:** Create `packages/api/prisma.config.ts` and move connection config per Prisma 7 migration guide. Lock Prisma to v6 if migration isn't ready.

### 2.2 ⚠️ Two Competing Database Systems

**Severity: P0 — Architectural confusion**

The codebase has two completely separate database access patterns:

1. **`api/` directory** — Raw SQL via `IDatabase` interface, ~33K lines (db-sqlite.ts: 2,243 lines, db-postgres.ts: 2,740 lines, db-interface.ts: 858 lines). Parameterised queries, manual schema management.

2. **`packages/api/` directory** — Prisma ORM with `schema.prisma` (491 lines), service layer (`packages/api/src/services/`), migration files in `packages/api/prisma/migrations/`.

These two systems manage different but overlapping tables. The `IDatabase` adapter handles the core runtime (audit events, agents, policies, webhooks), while Prisma handles... the same entities plus additional ones (Tenant model with User/Agent/Policy/AuditEvent relations).

**Impact:**
- Schema drift between the two systems is almost certain
- No single source of truth for the data model
- New contributors will be confused about which system to use
- Migration strategies conflict (raw SQL migrations vs Prisma migrations)

**Fix:** Pick one. Given the roadmap explicitly chose raw SQL for pragmatism, either adopt Prisma fully or remove `packages/api/prisma/` and migrate those services to use the `IDatabase` interface.

### 2.3 ⚠️ `server.ts` Still 938 Lines

**Severity: P1 — Maintenance burden**

The Phase 6 goal was `server.ts < 200 lines`. It's still 938 lines with ~30 route imports and extensive inline middleware configuration. The route extraction was done (40+ route files in `api/routes/`), but the wiring/orchestration is still monolithic.

### 2.4 ⚠️ `any` Types in Production Hot Path

**Severity: P1 — Type safety erosion**

The SQLite adapter (`db-sqlite.ts`) has ~20 casts to `any` for dashboard aggregation queries. While SQLite's `.get()` returns dynamic shapes, these could be typed with proper interfaces. The `packages/dashboard/` uses `any` patterns in its API client.

### 2.5 ⚠️ 30+ Remaining `console.log/error/warn` in Production Code

**Severity: P1 — Observability gap**

Despite having pino structured logging (`api/lib/logger.ts`), approximately 30 `console.*` calls remain in production code across `mcp-middleware.ts`, `redis-sentinel.ts`, `redis-pubsub.ts`, `webhook-retry.ts`, `compliance-checker.ts`, `policy-engine-setup.ts`, `slack-hitl.ts`, `otel-exporter.ts`, and others. These bypass the structured logger, losing request ID correlation.

### 2.6 ⚠️ 4 Known Vulnerabilities in Dependencies

**Severity: P1**

```
@hono/node-server: moderate (CWE-22 path traversal in serveStatic)
defu: high
hono: moderate
next: high
```

Notably, `hono` and `@hono/node-server` are listed as dependencies despite the roadmap explicitly stating Express was chosen over Hono. This suggests dead dependencies or the packages/api Prisma-based system uses Hono while api/ uses Express.

---

## 3. Architecture Assessment

### 3.1 What Works Well

| Decision | Assessment |
|----------|-----------|
| **Express 5.x** | Pragmatic. No reason to migrate at current scale. Express 5 async support is adequate. |
| **IDatabase abstraction** | Clean interface, good separation. Swappable backends work. The interface has 35+ typed methods — well-designed. |
| **SQLite for dev/test** | Excellent developer experience. Zero-config local development. |
| **Policy engine in-process** | Sub-millisecond evaluation without network hops. This is the right architecture for the core value prop. |
| **YAML policy DSL** | Human-readable, version-controllable, easy to template. |
| **SHA-256 audit hash chain** | Tamper-evident by design. Genuine differentiator for compliance. |
| **MCP proxy** | First-mover on MCP enforcement. Smart strategic bet. |
| **Feature-gate middleware** | Well-structured (`middleware/feature-gate.ts`). Allows gradual feature rollout. |

### 3.2 Architectural Anti-Patterns

| Issue | Location | Impact |
|-------|----------|--------|
| **Dual DB systems** | `api/` vs `packages/api/` | Confusion, drift, double maintenance |
| **Monolith server.ts** | `api/server.ts` (938 lines) | Hard to navigate, review, test |
| **Route files too large** | `evaluate.ts` (28KB), `scim.ts` (28KB), `policy-git-webhook.ts` (25KB), `stripe-webhook.ts` (14KB) | Should be broken into sub-modules |
| **Fat DB adapters** | `db-sqlite.ts` (98KB), `db-postgres.ts` (115KB) | These contain too much business logic. 2000+ lines per adapter is excessive. |
| **No service layer** | Routes call DB directly | Business logic is spread across route handlers and DB adapters instead of being in a service layer |
| **Dead weight in monorepo** | `remotion/` (video demo tool), `vitepress-docs/` AND `docs-site/` AND `docs/` | Three separate documentation systems. Remotion is marketing tooling in the product repo. |
| **No API versioning** | All endpoints at `/api/v1/` | No versioning strategy documented for breaking changes |

### 3.3 Monorepo Structure Assessment

The workspace setup (`packages/*`) is reasonable but not well-enforced:
```
packages/
├── api/          ← Prisma-based services (conflicts with api/)
├── cli/          ← CLI tool (good, separate concern)
├── compliance/   ← Compliance reporting (good)
├── dashboard/    ← Next.js dashboard (good)
├── python/       ← Python SDK (good)
├── sdk/          ← TypeScript SDK (good)
├── shared/       ← Shared types/schemas (good)
```

The `api/` root-level directory is the actual running server. `packages/api/` is a separate Prisma-based service layer that partially overlaps. This is the structural confusion.

**Verdict:** The monorepo isn't working cleanly. The `packages/api/` Prisma layer should either become the canonical data layer (migrate `api/` to use it) or be eliminated.

---

## 4. Code Quality Score: 6/10

### Justification

**Positive (+):**
- TypeScript throughout, no JavaScript mixing
- Zod validation on 17 schemas with centralized `schemas.ts`
- Consistent file naming and directory structure within `api/`
- Good error handling patterns — dedicated `error-handler.ts` middleware strips stack traces in production
- Constants defined in shared package
- bcrypt + constant-time comparison for API key lookup
- Proper CORS allowlist with production/development separation
- Rate limiting with multiple buckets (auth, general, SCIM, unauth)

**Negative (-):**
- `any` types in production SQLite adapter (~20 instances)
- 30+ unstructured `console.*` calls bypass pino
- Route files exceeding 25KB (evaluate.ts, scim.ts, policy-git-webhook.ts)
- DB adapters contain business logic (should be in services)
- No lint CI gate visible in GitHub Actions
- Prisma 7 breakage unaddressed
- Hono listed as dependency but Express is the actual runtime (dead dep)
- TypeScript type checking is "non-blocking warning" per architecture doc
- Missing: input sanitization for agent names (XSS prevention exists but as allowlist, not sanitization)

**Score breakdown:**
- Type safety: 6/10 (good intent, eroded by `any` casts)
- Error handling: 7/10 (solid middleware, good patterns)
- Code organization: 5/10 (dual DB systems hurt badly)
- Consistency: 6/10 (good within `api/`, confused across monorepo)
- Dependency management: 5/10 (4 known vulns, dead deps, Prisma breakage)
- **Weighted average: 6/10**

---

## 5. Test Coverage Assessment

### 5.1 Test Inventory

| Location | Count | Type |
|----------|-------|------|
| `api/tests/routes/` | 17 files | Route-level integration tests |
| `api/tests/uat/` | 4 files | User acceptance tests (multi-tenant, HITL, kill-switch, onboarding) |
| `api/tests/security/` | 1 file | Security regression tests |
| `tests/` | 4 files | Phase 1, validation, wave2, isolation tests |
| `packages/api/src/services/__tests__/` | 8 files | Unit tests for services |
| `packages/api/src/services/__tests__/uat/` | 4 files | UAT tests |
| `packages/api/src/services/__tests__/integration/` | 2 files | Integration tests |
| `packages/sdk/src/` | 3 files | SDK unit tests |
| `src/core/__tests__/` | 1 file | Core policy engine test |
| **Total test files** | **~44 files** | |

README claims "773 passing tests, 67% coverage." These numbers cannot be verified because the test suite is broken.

### 5.2 What IS Tested (Based on File Analysis)

✅ Route tests: evaluate, audit, agents, auth, health, health-probes, policy, SSO, slack-hitl, agent-hierarchy, pii, events, policy-git-webhook, webhook-retry
✅ UAT: multi-tenant isolation, HITL approval flow, kill-switch, tenant onboarding
✅ Security regression tests exist
✅ Service-level tests: killswitch, audit, policy, HITL, anomaly, agent
✅ SDK tests: local policy engine, client

### 5.3 What's NOT Tested (or Under-Tested)

❌ **Rate limiting** — No dedicated test file visible
❌ **SCIM provisioning** — No test file in `api/tests/`
❌ **Billing/Stripe** — No test file for stripe-webhook.ts
❌ **SIEM integration** — No test for siem.ts
❌ **Compliance reporting** — Limited test coverage
❌ **Redis Sentinel** — No tests for failover behavior
❌ **Database migrations** — No migration rollback tests automated
❌ **Dashboard** — No component tests visible (it's Next.js with pages but no test files in `packages/dashboard/`)
❌ **E2E tests** — `test:e2e` script exists but requires a running instance
❌ **Load testing** — Scripts referenced in docs but no actual k6 scripts in repo

### 5.4 Test Quality Assessment

The test structure shows good intent — dedicated UAT tests, security regression tests, isolation tests. But:
- The test suite is **currently broken** (Prisma 7 incompatibility)
- No coverage gating in CI
- No test for the most critical path: `POST /api/v1/evaluate` under concurrent load
- No chaos/failure injection tests for Redis/DB outages

**Score: 5/10** (would be 7/10 if tests actually ran)

---

## 6. Documentation Quality Score: 8/10

### Justification

**Exceptional documentation for a pre-launch product:**

| Document | Quality | Notes |
|----------|---------|-------|
| ARCHITECTURE.md | Excellent | Honest "implemented vs planned" section. Version 3.0 shows iterative refinement. |
| ROADMAP.md | Excellent | Version 3.0 with explicit "what was planned vs what was built" corrections. |
| ENGINEERING_ROADMAP.md | Outstanding | Four-expert workshop format. Debates, consensus, prioritized list. This is how roadmap docs should be written. |
| PRODUCTION_CHECKLIST.md | Excellent | Step-by-step deployment guide with Docker, K8s, and bare-metal sections. |
| HIGH_AVAILABILITY.md | Very good | Redis Sentinel, PgBouncer, health probes, graceful shutdown — all documented. |
| RUNBOOK.md | Good | Azure-specific but covers common failure modes. |
| SECURITY_HARDENING.md | Very good | Rate limiting, brute-force, input validation, XSS, CSRF, SSRF all documented. |
| SELF_HOSTED.md | Good | Docker Compose deployment guide. |
| compliance-roadmap.md | Good | Maps to EU AI Act, SOC 2, APRA CPS 234. |
| SPEC.md | Good | Free tier spec with technical implementation detail. |
| Blog posts (7 articles) | Good | Thought leadership on agent security, EU AI Act, OWASP. |

**Deductions:**
- Three separate docs systems (`docs/`, `docs-site/`, `vitepress-docs/`) — confusing for contributors
- Archive folder has outdated docs that could mislead (funding applications, old wave plans)
- Some docs reference infrastructure that doesn't exist yet (BullMQ in some runbook sections, while webhooks are still fire-and-forget)
- No API versioning doc
- `IMPLEMENTATION_NOTES.md` referenced but not found in the docs directory

**Score: 8/10** — Best-in-class documentation for this stage. The four-expert workshop roadmap alone demonstrates serious engineering maturity.

---

## 7. Security Assessment (Critical — This IS a Security Product)

### 7.1 Dogfooding Score: 7/10

A security tool must be secure itself. Here's how AgentGuard does:

| Control | Status | Assessment |
|---------|--------|-----------|
| **API key hashing** | ✅ bcrypt + SHA-256 index + constant-time comparison | Best practice |
| **Audit trail integrity** | ✅ SHA-256 hash chain with genesis hash | Excellent |
| **Tenant isolation** | ✅ App-layer + PostgreSQL RLS on 8 tables | Defense in depth |
| **Input validation** | ✅ Zod on 17 schemas, partial manual | Good, needs full coverage |
| **SSRF protection** | ✅ IPv4, IPv6, DNS rebinding, metadata endpoint blocking | Thorough |
| **Rate limiting** | ✅ Multi-bucket, Redis-backed, brute-force protection | Production-grade |
| **CSRF protection** | ✅ Middleware implemented | Good |
| **Security headers** | ✅ Helmet.js, CORS allowlist, trust proxy | Good |
| **Error sanitization** | ✅ Strip stack traces in production | Good |
| **Request correlation** | ✅ pino + requestId + traceId + spanId | Excellent for observability |
| **Graceful shutdown** | ✅ SIGTERM handler, 30s timeout | Good |
| **SQL injection** | ✅ Parameterised queries throughout | No raw string interpolation found |
| **Secrets in code** | ✅ All via environment variables | No hardcoded secrets found |
| **Secrets in .env** | ✅ `.env.example` only | Real `.env` in `.gitignore` |
| **Dependency scanning** | ⚠️ 4 known vulns (2 high) | Needs fixing |
| **SSL** | ⚠️ Flexible (Cloudflare) | Full/Strict planned but not shipped |
| **TLS** | ✅ Cloudflare HTTPS | Origin upgrade needed |
| **Webhook signing** | ❌ Not implemented | Planned |
| **PgBouncer** | ⚠️ Documented but not verified in prod | Connection exhaustion risk at scale |

### 7.2 Security Gaps

1. **Cloudflare Flexible SSL** — The origin connection is HTTP. Any network-level attacker between Cloudflare and Azure can read traffic. This is disqualifying for a security product being evaluated by CISOs.

2. **4 known vulnerabilities** — Two high-severity (defu, next), two moderate (hono, @hono/node-server). The `hono` dependency shouldn't exist if Express is the chosen runtime.

3. **No `security.txt`** — Referenced in roadmap as "10-minute fix" but not shipped.

4. **No HMAC webhook signing** — Webhook payloads aren't signed, so receivers can't verify authenticity.

5. **Test suite broken** — Security regression tests exist but can't run.

### 7.3 Auth Implementation Review

The auth middleware (`api/middleware/auth.ts`) is well-implemented:
- Constant-time bcrypt comparison with dummy hash fallback (prevents timing attacks)
- SHA-256 index for fast key lookup before bcrypt verify
- Legacy plaintext key support during migration (necessary)
- JWT + SSO support via `jwt-auth.ts`
- RLS tenant context via `rls-tenant-context.ts`
- Admin, tenant, and agent key role separation

**One concern:** The legacy plaintext fallback. How long has the migration been running? Every day with plaintext keys in the DB is a day of elevated risk.

---

## 8. Reliability & Ops Assessment

### 8.1 Docker & Deployment

| Aspect | Status |
|--------|--------|
| Dockerfiles | ✅ 7 Dockerfiles (API, dashboard, worker, landing, docs, about, demo) |
| Docker Compose | ✅ Production-ready with health checks, dependency ordering |
| Helm chart | ✅ Chart.yaml + values.yaml (268 lines, well-commented) |
| Terraform | ✅ Azure infrastructure as code (12 modules) |
| CI/CD | ✅ GitHub Actions with OIDC to Azure, image tags with git SHA |
| Health probes | ✅ Three tiers: `/healthz` (liveness), `/readyz` (readiness), `/health` (combined) |
| Graceful shutdown | ✅ Structured sequence with 30s timeout |

### 8.2 Database Migrations

- Prisma migrations exist in `packages/api/prisma/migrations/`
- Rollback scripts exist for 5 migrations (partition, rls, bcrypt)
- `IDatabase.initialize()` auto-creates tables from inline SCHEMA_SQL
- **Risk:** Dual migration systems (Prisma + raw SQL) could conflict

### 8.3 Monitoring Gaps

- No application metrics endpoint (Prometheus `/metrics`)
- OpenTelemetry exporter exists but requires OTEL_EXPORTER_OTLP_ENDPOINT configuration
- No alerting thresholds documented for self-hosted deployments
- No log aggregation guidance for self-hosted

---

## 9. What's Actually Working (Credit Where Due)

### 9.1 Genuinely Impressive

1. **The four-expert workshop roadmap** (ENGINEERING_ROADMAP.md) — This document alone demonstrates more engineering maturity than most startups at this stage. Debates with genuine disagreement and resolution, consensus-building, prioritized implementation lists with effort estimates, risk registers, and "DO NOT BUILD" lists. This is how you plan.

2. **"Implemented vs Planned" honesty** — ARCHITECTURE.md v3.0 explicitly documents what was planned, what was built, and why they diverged. This level of transparency is rare and valuable.

3. **Security hardening execution** — The Phase 7 items (bcrypt, Zod, RLS, CSRF, error sanitization, structured logging) were all actually shipped. Not just documented — shipped.

4. **MCP enforcement** — First-mover on Model Context Protocol policy enforcement. This is a genuine product differentiator.

5. **Deployment enforcement lifecycle** — `registered → validated → certified → deployed` with GitHub Action integration. This is a complete CI/CD security story.

6. **SDK breadth** — Integrations for LangChain, OpenAI, AutoGen, CrewAI, LangGraph, Vercel AI, OpenClaw, A2A, MCP, and Express. That's 10 framework integrations.

7. **Compliance mapping** — EU AI Act, SOC 2, APRA CPS 234, OWASP Agentic Top 10. The compliance report generation from live audit data is a strong enterprise feature.

### 9.2 Solidly Done

8. **Docker Compose for self-hosted** — Clean, production-ready, with health checks and proper dependency ordering.

9. **Helm chart** — Values file is well-commented with sensible defaults. Charts exist for Kubernetes deployments.

10. **Terraform Azure IaC** — 12 modules covering networking, ACR, storage, container apps, monitoring, Key Vault. Proper infrastructure as code.

11. **Blog content** — 7 articles covering agent security fundamentals, EU AI Act compliance, OWASP checklist. Good thought leadership positioning.

12. **SSO + SCIM** — Full enterprise identity lifecycle (provision/deprovision via SCIM, SSO via OIDC).

---

## 10. Strategic Roadmap — Prioritized by Impact

### 🔴 Immediate (This Week) — Unblocks Everything

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 1 | **Fix Prisma 7 breakage** — Create `prisma.config.ts` or lock Prisma to v6 | Tests run again | 2h |
| 2 | **Fix 4 known vulnerabilities** — Update hono, defu, next; or remove unused hono dep | Security baseline | 2h |
| 3 | **Remove or consolidate dual DB systems** — Pick raw SQL or Prisma, not both | Architecture clarity | 2-5d |
| 4 | **Remove dead `console.*` calls** — Replace with structured logger | Observability | 4h |
| 5 | **Reduce server.ts to <200 lines** | Maintainability | 4h |

### 🟡 This Month — Enterprise Credibility

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 6 | **Cloudflare Full/Strict SSL** | CISO disqualification blocker | 2h |
| 7 | **Ship `security.txt`** | Researcher disclosure path | 30m |
| 8 | **Add HMAC webhook signing** | Webhook authenticity | 1d |
| 9 | **Consolidate 3 doc systems into 1** | Contributor clarity | 1d |
| 10 | **TypeScript strict mode + `tsc --noEmit` as CI gate** | Type safety | 2d |
| 11 | **Load test baseline (k6)** | Performance confidence | 1d |
| 12 | **Dashboard component tests** | UI reliability | 2d |

### 🟢 Next Quarter — Product Velocity

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 13 | **Extract business logic from DB adapters** into service layer | Testability | 5d |
| 14 | **Split large route files** (evaluate.ts, scim.ts) | Maintainability | 2d |
| 15 | **Remove `remotion/` from repo** (move to separate repo or delete) | Repo hygiene | 1h |
| 16 | **SIEM integration testing** | Enterprise requirement | 2d |
| 17 | **Automated migration rollback tests** | Deployment confidence | 2d |
| 18 | **Prometheus `/metrics` endpoint** | Observability | 1d |

### ⚪ Backlog — When Demand Exists

| # | Action | Trigger |
|---|--------|---------|
| 19 | ML anomaly detection | 90 days production telemetry |
| 20 | Full SOC 2 Type II | Enterprise customer requirement |
| 21 | Shadow agent discovery | Customer request |
| 22 | Custom SAML | Non-OIDC IdP customer |

---

## 11. Quick Wins (Hours to Days)

1. **Create `prisma.config.ts`** — Fix the test suite immediately. This is blocking everything else.
2. **`npm audit fix`** — Run it and resolve the 4 vulnerabilities.
3. **Remove `hono`/`@hono/node-server` from dependencies** — They're not used if Express is the runtime.
4. **Delete `api/test_schema_temp.ts`** — Temp file checked into the repo.
5. **Ship `/.well-known/security.txt`** — 30 minutes, massive credibility signal.
6. **Replace 30 `console.*` calls with `logger.*`** — 4 hours, immediate observability improvement.
7. **Add `tsc --noEmit` as blocking CI step** — Prevent type regression.
8. **Consolidate docs** — Pick `docs-site/` (VitePress) as the single docs system, migrate content, archive/delete others.
9. **Remove `.DS_Store`** — `echo ".DS_Store" >> .gitignore && git rm .DS_Store`.

---

## 12. Long-Term Bets

### Bet 1: In-Process SDK Evaluation (<5ms)

The current SDK calls the API for every evaluation (~50-150ms round trip). The roadmap correctly identifies that downloading a signed policy bundle and evaluating locally (<5ms) is a massive differentiator. This is worth building because:
- It's the #1 performance story for design partner demos
- It enables offline/off-prem evaluation (enterprise requirement)
- It reduces API server load dramatically
- The signed bundle (Ed25519) prevents tampering

**Investment:** 4d (Sprint 2 in roadmap). **Expected ROI:** High — this is a conversion feature.

### Bet 2: MCP as the Integration Layer

AgentGuard is early on MCP (Model Context Protocol) enforcement. If MCP becomes the standard for agent-to-tool communication (and Anthropic/OpenAI are pushing hard for this), being the "security layer for MCP" is a massive market position.

**Investment:** Already partially shipped. **Risk:** MCP standard may fragment or lose momentum. **Expected ROI:** Very high if MCP wins.

### Bet 3: Compliance-as-a-Feature

The OWASP Agentic Top 10 compliance report, EU AI Act mapping, and audit trail export are features that enterprises need and competitors don't have. Building a "one-click compliance report" is a strong enterprise sales enablement tool.

**Investment:** Partially shipped. **Expected ROI:** Medium-high — accelerates enterprise sales cycles.

---

## 13. Honest Assessment: What's Half-Done vs Production-Ready

| Feature | Status | Assessment |
|---------|--------|-----------|
| Policy evaluation engine | ✅ Production-ready | Core value prop works well |
| Audit trail (hash chain) | ✅ Production-ready | Tamper-evident, verifiable |
| API key auth | ✅ Production-ready | bcrypt-hashed, constant-time |
| Rate limiting | ✅ Production-ready | Multi-bucket, Redis-backed |
| MCP proxy | ✅ Production-ready | Unique differentiator |
| Deployment enforcement | ✅ Production-ready | Full lifecycle with GH Action |
| Slack HITL | 🟡 Working | Delivered but no retry/dead-letter in webhooks |
| SSO/JWT | 🟡 Working | OIDC integrated, SCIM provisioning works |
| Dashboard (Next.js) | 🟡 Working | Functional but no component tests, no loading states documented |
| Billing (Stripe) | 🟡 Working | Stripe webhook handler exists, no test coverage |
| SIEM forwarding | 🟡 Working | Splunk/Sentinel routes exist, no integration tests |
| Compliance reporting | 🟡 Working | Report generation works, PDF export exists |
| Anomaly detection | 🟡 Basic | Rule-based thresholds, no ML |
| Self-hosted Docker | ✅ Production-ready | Clean Compose setup |
| Helm chart | ✅ Available | Well-structured values.yaml |
| CLI tool | ✅ Published | `@the-bot-club/agentguard-cli` on npm |
| Python SDK | ✅ Published | `agentguard-tech` on PyPI |
| TypeScript SDK | ✅ Published | `@the-bot-club/agentguard` on npm |
| Tests | ❌ Broken | Prisma 7 incompatibility |
| Full/Strict SSL | ❌ Not shipped | Flexible SSL only |
| HMAC webhooks | ❌ Not shipped | Unsigned payloads |
| `security.txt` | ❌ Not shipped | Listed as 30-min fix |

---

## 14. Summary Verdict

AgentGuard is an **ambitious, well-documented, mostly-solid security product** with a clear vision and genuine technical depth. The architecture decisions are pragmatic and well-justified. The documentation is among the best I've seen for a pre-launch startup.

**The core problem is scope management.** The product does too many things partially rather than a few things excellently. The dual database system is the most dangerous symptom of this — it suggests features were built without fully resolving architectural decisions first.

**The most critical action is fixing the test suite.** A security product shipping untested code is contradictory to its value proposition. Everything else is secondary until tests run green again.

**The biggest opportunity is the in-process SDK evaluation.** This single feature (4 days of work) transforms the product from "another API gateway" into "agent-native security with <5ms overhead." That's the story that wins design partners and enterprise evaluations.

**Score card:**
- Architecture: 6/10 (good core, confused periphery)
- Code Quality: 6/10 (strong intent, eroded by debt)
- Test Coverage: 5/10 (good structure, currently broken)
- Documentation: 8/10 (excellent for this stage)
- Security Posture: 7/10 (genuine hardening, gaps remain)
- Operational Readiness: 6/10 (Docker/K8s/Terraform ready, monitoring gaps)
- Product-Market Fit: 7/10 (real problem, strong differentiator, early stage)
- **Overall: 6.4/10**

The foundation is strong. The fix list is specific and achievable. The question isn't whether AgentGuard can be production-ready — it can. The question is whether the team can resist building more features long enough to harden what's already shipped.

---

*Audit completed by Dubai, Khaleej Pod Lead — The Bot Club*
*April 2026*

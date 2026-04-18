# AgentGuard 10/10 Remediation

## Vision

Bring AgentGuard from **6.4/10 audit score to production excellence** by systematically addressing every finding from the comprehensive audit (April 2026). The product has a strong foundation — excellent documentation, genuine security hardening, and a clear market differentiator — but is undermined by a broken test suite, architectural confusion, and scope-driven debt. This project turns those weaknesses into strengths.

**Guiding principle:** *Stop building new features. Harden what's already shipped.*

---

## Current State (Audit Baseline)

| Dimension | Score | Target |
|-----------|-------|--------|
| Architecture | 6/10 | 9/10 |
| Code Quality | 6/10 | 9/10 |
| Test Coverage | 5/10 | 9/10 |
| Documentation | 8/10 | 9/10 |
| Security Posture | 7/10 | 10/10 |
| Operational Readiness | 6/10 | 9/10 |
| **Overall** | **6.4/10** | **9.2/10** |

---

## Phase 1 — Foundation (Unblocks Everything)

**Goal:** Restore CI confidence, eliminate known vulnerabilities, and clean up observability gaps so all subsequent work can be validated.

### Tasks

#### 1.1 Fix Prisma 7 Breakage (P0)
- **What:** `npm test` fails because Prisma 7 moved `datasource url` out of `schema.prisma` into `prisma.config.ts`
- **Actions:**
  - Create `packages/api/prisma.config.ts` with connection config per Prisma 7 migration guide
  - OR lock Prisma to v6 if migration isn't ready (`"prisma": "^6.0.0"` in package.json)
  - Verify `npx prisma generate` succeeds
  - Verify `npm test` runs to completion
- **Acceptance Criteria:**
  - `npx prisma generate` exits 0
  - `npm test` runs and reports actual pass/fail counts (not stale "773 tests")
  - CI pipeline passes on a clean branch
  - README test counts updated to reflect reality

#### 1.2 Fix 4 Known Vulnerabilities (P0)
- **What:** `npm audit` reports 4 vulnerabilities (2 high: defu, next; 2 moderate: hono, @hono/node-server)
- **Actions:**
  - Run `npm audit fix` for auto-fixable issues
  - Update `hono` and `@hono/node-server` — or remove them entirely if Express is the runtime (they appear to be dead dependencies)
  - Update `next` to patched version
  - Update `defu` transitive dependency
- **Acceptance Criteria:**
  - `npm audit` reports 0 vulnerabilities
  - `hono` and `@hono/node-server` are removed from dependencies if not imported in runtime code
  - All existing tests still pass after dependency updates

#### 1.3 Remove Dead Dependencies (P1)
- **What:** `hono`/`@hono/node-server` are listed as dependencies but Express is the chosen runtime per architecture docs
- **Actions:**
  - Grep codebase for actual `hono` imports
  - If only used in `packages/api/`, evaluate whether that package is canonical or dead
  - Remove from root `package.json` if unused
  - Remove from `packages/api/package.json` if that system is being deprecated
- **Acceptance Criteria:**
  - `npm ls hono` returns no results or only results in an active package
  - No runtime code imports hono in the main `api/` server

#### 1.4 Replace 30+ `console.*` Calls with Structured Logger (P1)
- **What:** ~30 `console.log/error/warn` calls remain in production code, bypassing pino structured logging and losing request ID correlation
- **Actions:**
  - Audit all `console.*` calls in: `mcp-middleware.ts`, `redis-sentinel.ts`, `redis-pubsub.ts`, `webhook-retry.ts`, `compliance-checker.ts`, `policy-engine-setup.ts`, `slack-hitl.ts`, `otel-exporter.ts`, and others
  - Replace each with `logger.info/warn/error/fatal` using the existing pino instance at `api/lib/logger.ts`
  - Preserve log message intent (don't change what's logged, just how)
- **Acceptance Criteria:**
  - `grep -r "console\.\(log\|error\|warn\)" api/ --include="*.ts"` returns 0 results in production code (test files excluded)
  - All structured log entries include request ID correlation where available
  - No behavioral changes — same information is logged, just through pino

#### 1.5 Clean Up Temp Files and Git Artifacts
- **What:** Temp files and OS artifacts checked into the repo
- **Actions:**
  - Delete `api/test_schema_temp.ts`
  - Remove `.DS_Store` from tracking and add to `.gitignore`
  - Audit for other temp/debug files
- **Acceptance Criteria:**
  - No `test_schema_temp.ts` in repo
  - `.DS_Store` in `.gitignore`
  - No other obviously temp files in tracked files

---

## Phase 2 — Architecture (Clarity & Maintainability)

**Goal:** Resolve the dual-database confusion, decompose the monolithic server.ts, and establish a proper service layer so the codebase is navigable and maintainable.

### Tasks

#### 2.1 Consolidate Database Systems (P0)
- **What:** Two competing DB systems — raw SQL `IDatabase` interface in `api/` (~5,800 lines) and Prisma ORM in `packages/api/` with overlapping table management
- **Actions:**
  - Decide canonical system: raw SQL (`IDatabase`) or Prisma
  - If raw SQL is canonical (recommended per roadmap pragmatism):
    - Deprecate `packages/api/prisma/` and `packages/api/src/services/`
    - Migrate any unique Prisma-managed tables to `IDatabase` schema
    - Remove Prisma dependencies from root package.json
  - If Prisma is canonical:
    - Migrate `api/` route handlers to use Prisma services
    - Remove `db-sqlite.ts`, `db-postgres.ts`, `db-interface.ts`
  - Reconcile schema differences between the two systems
- **Acceptance Criteria:**
  - Single database access pattern throughout the codebase
  - No conflicting schema definitions
  - All existing tests pass after consolidation
  - New contributor onboarding docs reference one system only
  - Migration scripts (Prisma or raw SQL) exist for all tables

#### 2.2 Refactor server.ts Below 200 Lines (P1)
- **What:** `api/server.ts` is 938 lines with ~30 route imports and extensive inline middleware configuration
- **Actions:**
  - Extract middleware registration into `api/middleware/index.ts` (already partial)
  - Extract route registration into `api/routes/index.ts` with grouped registration
  - Create `api/app.ts` that assembles the Express app (middleware + routes)
  - `server.ts` should only: import app, set port, start listening, handle shutdown
  - Follow the Phase 6 goal of `< 200 lines`
- **Acceptance Criteria:**
  - `server.ts` is < 200 lines
  - All routes still registered and functional
  - All middleware still applied in correct order
  - No behavioral changes to the running application
  - Health probes still respond correctly

#### 2.3 Extract Service Layer (P1)
- **What:** Business logic is spread across route handlers and DB adapters instead of being in a service layer. DB adapters (`db-sqlite.ts` at 98KB, `db-postgres.ts` at 115KB) contain too much business logic.
- **Actions:**
  - Create `api/services/` directory with domain services:
    - `policy.service.ts` — policy CRUD, evaluation orchestration
    - `agent.service.ts` — agent registration, hierarchy, key management
    - `audit.service.ts` — audit event creation, hash chain management
    - `webhook.service.ts` — webhook dispatch, retry logic
    - `compliance.service.ts` — compliance report generation
    - `billing.service.ts` — Stripe integration, subscription management
  - Move business logic from DB adapters into services
  - DB adapters should only: connect, query, return typed results
  - Route handlers should only: validate input, call service, format response
- **Acceptance Criteria:**
  - Each DB adapter is < 500 lines (pure data access)
  - Route handlers contain no SQL or business logic
  - Services are independently testable (mock DB interface)
  - All existing tests pass

#### 2.4 Split Large Route Files (P1)
- **What:** Route files exceed maintainable sizes — `evaluate.ts` (28KB), `scim.ts` (28KB), `policy-git-webhook.ts` (25KB), `stripe-webhook.ts` (14KB)
- **Actions:**
  - `evaluate.ts` → `evaluate-policy.ts` + `evaluate-batch.ts` + `evaluate-helpers.ts`
  - `scim.ts` → `scim-users.ts` + `scim-groups.ts` + `scim-helpers.ts`
  - `policy-git-webhook.ts` → `policy-git-webhook-handler.ts` + `policy-git-webhook-validation.ts`
  - `stripe-webhook.ts` → `stripe-webhook-handler.ts` + `stripe-events.ts`
- **Acceptance Criteria:**
  - No route file exceeds 10KB
  - Each sub-module has a clear single responsibility
  - All routes still registered and functional
  - All existing tests pass

#### 2.5 Remove Dead Monorepo Weight
- **What:** `remotion/` (video demo tool) is marketing tooling in the product repo; three documentation systems exist
- **Actions:**
  - Move `remotion/` to separate repo or delete
  - Evaluate `packages/shared/` for unused exports
- **Acceptance Criteria:**
  - `remotion/` no longer in main repo
  - `npm install` is faster (fewer workspace packages)
  - CI build excludes marketing tooling

---

## Phase 3 — Security Hardening (Dogfooding Excellence)

**Goal:** A security product must be unassailable. Close every security gap identified in the audit, starting with the disqualifying ones.

### Tasks

#### 3.1 Upgrade to Cloudflare Full/Strict SSL (P0)
- **What:** Currently using Flexible SSL — origin connection is HTTP, allowing MITM attacks between Cloudflare and Azure. Disqualifying for CISO evaluation.
- **Actions:**
  - Generate origin certificate or upload custom cert to Azure
  - Configure Cloudflare SSL mode to Full (Strict)
  - Update Terraform modules to enforce HTTPS on origin
  - Update PRODUCTION_CHECKLIST.md with strict SSL requirement
- **Acceptance Criteria:**
  - Cloudflare SSL/TLS mode is "Full (Strict)"
  - Origin server rejects non-TLS connections
  - `curl -v https://<origin>` shows valid cert chain
  - Terraform plan reflects strict SSL enforcement

#### 3.2 Implement HMAC Webhook Signing (P1)
- **What:** Webhook payloads aren't signed — receivers can't verify authenticity
- **Actions:**
  - Generate HMAC-SHA256 signature for every outbound webhook payload
  - Include `X-AgentGuard-Signature` header with `t=<timestamp>,v1=<signature>` format
  - Document verification procedure for webhook consumers
  - Add signature verification helper to TypeScript and Python SDKs
- **Acceptance Criteria:**
  - All outbound webhooks include signature header
  - SDK documentation includes verification code samples
  - Test verifies signature is correct for known payload
  - Signature includes timestamp to prevent replay attacks

#### 3.3 Ship `security.txt` (P1)
- **What:** No `/.well-known/security.txt` — researchers have no disclosure path. Listed as "30-minute fix" in roadmap but not shipped.
- **Actions:**
  - Create `security.txt` with contact info, disclosure policy, preferred languages
  - Serve at `/.well-known/security.txt` via Express static or dedicated route
  - Link from footer of dashboard and docs site
- **Acceptance Criteria:**
  - `GET /.well-known/security.txt` returns valid security.txt
  - Content follows RFC 9116 format
  - Contains contact email, disclosure policy, and acknowledgement section

#### 3.4 Enable TypeScript Strict Mode (P1)
- **What:** ~20 `any` casts in production SQLite adapter; TypeScript type checking is "non-blocking warning" per architecture doc
- **Actions:**
  - Enable `"strict": true` in `tsconfig.json`
  - Fix all `any` types in `db-sqlite.ts` with proper typed interfaces for dashboard aggregation queries
  - Fix `any` patterns in `packages/dashboard/` API client
  - Add `tsc --noEmit` as blocking CI step in GitHub Actions
- **Acceptance Criteria:**
  - `tsc --noEmit` exits 0 with strict mode enabled
  - No `any` casts in production DB adapter code
  - CI pipeline blocks on type errors
  - Type safety score improves from 6/10 to 9/10

#### 3.5 Add API Versioning Strategy (P1)
- **What:** All endpoints at `/api/v1/` with no versioning strategy documented for breaking changes
- **Actions:**
  - Document versioning strategy (URL path versioning: v1, v2)
  - Add version-aware routing middleware
  - Add deprecation headers on old versions
  - Create `docs/api-versioning.md`
- **Acceptance Criteria:**
  - API versioning strategy documented and linked from ARCHITECTURE.md
  - Middleware supports version-aware routing
  - Deprecation headers present on older API versions
  - Consumers can pin to specific API version

#### 3.6 Evaluate Legacy Plaintext Key Migration (P2)
- **What:** Auth middleware supports legacy plaintext key fallback. Every day with plaintext keys in the DB is elevated risk.
- **Actions:**
  - Audit how many plaintext keys remain in database
  - Set migration deadline (e.g., 30 days)
  - Add warning log when legacy path is used
  - Add admin API to list/force-migrate remaining plaintext keys
- **Acceptance Criteria:**
  - Admin can query count of remaining plaintext keys
  - Every legacy auth attempt logs a warning
  - Migration deadline documented in ops runbook
  - Plan exists for removing legacy path entirely

---

## Phase 4 — Quality & Testing (Confidence in Every Deploy)

**Goal:** Build a testing infrastructure that catches regressions before production and gives confidence to ship.

### Tasks

#### 4.1 Load Testing Baseline with k6 (P1)
- **What:** No load testing exists. Scripts referenced in docs but no actual k6 scripts in repo. The most critical path (`POST /api/v1/evaluate`) has never been tested under concurrent load.
- **Actions:**
  - Create `tests/load/` directory with k6 scripts:
    - `evaluate-load.js` — Sustained load on evaluation endpoint (target: <50ms p99)
    - `policy-crud-load.js` — Concurrent policy create/read/update
    - `auth-load.js` — Authentication throughput under load
  - Define baseline SLOs: p50 < 10ms, p99 < 50ms, error rate < 0.1%
  - Add `npm run test:load` script
- **Acceptance Criteria:**
  - k6 scripts exist for all 3 critical paths
  - Baseline metrics captured and documented
  - SLOs defined and committed to `tests/load/SLOS.md`
  - Load test runs in CI (non-blocking initially, gating later)

#### 4.2 Dashboard Component Tests (P1)
- **What:** Next.js dashboard has pages but zero test files in `packages/dashboard/`
- **Actions:**
  - Add testing dependencies (jest, react-testing-library, or vitest)
  - Write component tests for:
    - Policy management pages
    - Audit log viewer
    - Agent management
    - Settings/configuration
  - Test loading states, error states, empty states
- **Acceptance Criteria:**
  - Dashboard has > 20 component tests
  - Key user flows tested (create policy, view audit, manage agent)
  - Loading and error states covered
  - `npm run test:dashboard` runs dashboard tests in isolation

#### 4.3 Coverage Gating in CI (P1)
- **What:** No coverage gating exists. README claims 67% but that's stale.
- **Acceptance Criteria:**
  - `npm run test:coverage` reports accurate coverage
  - CI blocks PRs that reduce coverage below current baseline
  - Coverage report posted as PR comment
  - Target: 80% on `api/` routes and services within 2 sprints

#### 4.4 Add Missing Test Files (P1)
- **What:** Critical paths have no test coverage:
  - Rate limiting — no dedicated test
  - SCIM provisioning — no test in `api/tests/`
  - Billing/Stripe — no test for `stripe-webhook.ts`
  - SIEM integration — no test for `siem.ts`
  - Compliance reporting — limited coverage
  - Redis Sentinel — no failover behavior tests
- **Actions:**
  - Create dedicated test files for each gap
  - Integration tests for Stripe webhook signature verification
  - Unit tests for SCIM user/group provisioning
  - Unit tests for SIEM event formatting and dispatch
  - Integration test for rate limiting under burst conditions
- **Acceptance Criteria:**
  - Test files exist for: rate-limiting, SCIM, Stripe, SIEM, compliance, Redis Sentinel
  - Each test file has > 5 meaningful assertions
  - All new tests pass in CI

#### 4.5 Chaos/Failure Injection Tests (P2)
- **What:** No chaos testing for Redis/DB outages
- **Actions:**
  - Create `tests/chaos/` directory
  - Test scenarios:
    - Redis connection loss during evaluation
    - Database connection pool exhaustion
    - Slow upstream responses (> 5s)
    - Concurrent write conflicts
  - Use test containers or mock failures
- **Acceptance Criteria:**
  - Chaos tests verify graceful degradation, not silent failure
  - System recovers automatically when dependency returns
  - Error responses are structured (not 500 with stack traces)
  - Chaos tests run in CI nightly (not per-PR)

#### 4.6 Database Migration Rollback Tests (P2)
- **What:** No automated migration rollback tests. Dual migration systems (Prisma + raw SQL) could conflict.
- **Actions:**
  - Create `tests/migrations/` directory
  - Test each migration can be applied and rolled back
  - Test migration idempotency (safe to run twice)
  - Test migration order dependencies
- **Acceptance Criteria:**
  - Every migration has a corresponding rollback test
  - Rollback tests verify data integrity after reverse migration
  - Idempotency tests pass (migrate up twice = same result)

---

## Phase 5 — Documentation & Ops (Operational Excellence)

**Goal:** Consolidate documentation into a single source of truth and close all monitoring gaps for self-hosted deployments.

### Tasks

#### 5.1 Consolidate Three Documentation Systems (P1)
- **What:** Three separate docs systems exist: `docs/`, `docs-site/` (VitePress), and `vitepress-docs/`
- **Actions:**
  - Pick one system (recommend: `docs-site/` VitePress as it's purpose-built)
  - Migrate unique content from `docs/` and `vitepress-docs/` into `docs-site/`
  - Archive or remove the other two
  - Update all internal links
  - Remove `IMPLEMENTATION_NOTES.md` reference (noted as missing in audit)
- **Acceptance Criteria:**
  - Single docs directory with all content
  - No broken internal links
  - VitePress build succeeds with zero warnings
  - CONTRIBUTING.md references the single docs system

#### 5.2 Prometheus `/metrics` Endpoint (P1)
- **What:** No application metrics endpoint exists. OpenTelemetry exporter exists but requires external configuration.
- **Actions:**
  - Add `prom-client` dependency
  - Create `/metrics` endpoint in Express app
  - Instrument:
    - Request duration histogram (by route, method, status)
    - Policy evaluation duration and count
    - Active connections gauge
    - Error rate counter
    - Database query duration
  - Add default collection interval (every 5s)
- **Acceptance Criteria:**
  - `GET /metrics` returns Prometheus-format metrics
  - Metrics cover: request duration, evaluation latency, error rate, DB performance
  - Helm chart updated with ServiceMonitor for Prometheus scraping
  - Self-hosted docs include Grafana dashboard JSON

#### 5.3 Alerting and Monitoring Guidance (P2)
- **What:** No alerting thresholds documented for self-hosted deployments. No log aggregation guidance.
- **Actions:**
  - Create `docs-site/monitoring.md` with:
    - Recommended alerting thresholds (error rate > 1%, p99 > 500ms, eval queue depth)
    - Log aggregation setup (Loki, ELK, CloudWatch)
    - Dashboard templates (Grafana JSON)
  - Document runbook for common alerts
- **Acceptance Criteria:**
  - Monitoring guide published in docs site
  - At least 5 alerting rules documented with thresholds
  - Grafana dashboard JSON importable and working
  - Log aggregation instructions tested on fresh Docker Compose

#### 5.4 Update All Documentation for Accuracy (P2)
- **What:** Some docs reference infrastructure that doesn't exist yet (BullMQ in runbook sections, webhooks are fire-and-forget). Stale test counts in README.
- **Actions:**
  - Audit all docs for accuracy against current codebase
  - Remove or mark planned-but-not-built features
  - Update README test counts after Phase 1 test restoration
  - Update ROADMAP.md and ARCHITECTURE.md to reflect remediation work
  - Remove outdated archive folder references
- **Acceptance Criteria:**
  - Every doc accurately reflects current codebase state
  - No reference to BullMQ (not implemented)
  - README shows current test counts and coverage
  - No broken cross-document links

---

## Phase 6 — Performance (Strategic Differentiation)

**Goal:** Build the two features that transform AgentGuard from "another API gateway" into "agent-native security with <5ms overhead" — the story that wins enterprise evaluations.

### Tasks

#### 6.1 In-Process SDK Policy Evaluation (P0 — Strategic)
- **What:** Current SDK calls API for every evaluation (~50-150ms round trip). In-process evaluation would be <5ms. This is the #1 performance differentiator for design partner demos.
- **Actions:**
  - Design policy bundle format (JSON with Ed25519 signature)
  - Create bundle signing service on API server (private key signs, public key embedded in SDK)
  - Build policy engine in SDK that evaluates locally from signed bundle
  - Add bundle refresh mechanism (background poll with configurable TTL)
  - Implement offline mode (use cached bundle when API unreachable)
  - Add bundle version tracking for audit trail
- **Acceptance Criteria:**
  - SDK evaluates policies in < 5ms (p99) with cached bundle
  - Bundle is tamper-evident (Ed25519 signature verification)
  - SDK works offline with stale bundle (with warning)
  - Bundle refresh is non-blocking (background thread)
  - Audit trail records bundle version used for each evaluation
  - TypeScript SDK and Python SDK both support in-process evaluation

#### 6.2 Policy Bundle Signing & Distribution (P1)
- **What:** Signed policy bundles prevent tampering and enable offline/off-prem evaluation (enterprise requirement)
- **Actions:**
  - Generate Ed25519 key pair for bundle signing
  - Add `POST /api/v1/bundles` endpoint to create signed bundle
  - Add `GET /api/v1/bundles/latest` for SDK polling
  - Add `GET /api/v1/bundles/:version` for version-specific fetch
  - Store signing key in HSM or Key Vault (production) / env var (dev)
  - Document key rotation procedure
- **Acceptance Criteria:**
  - Bundles are signed with Ed25519 and verifiable
  - Key rotation procedure documented and tested
  - Bundle endpoint returns consistent format with signature
  - SDK can fetch, verify, and cache bundles
  - Bundle size is < 100KB for typical policy sets

#### 6.3 Performance Benchmarking & SLO Dashboard (P2)
- **What:** No performance baselines exist for the core evaluation path
- **Actions:**
  - Create benchmark suite comparing: remote API eval vs in-process eval
  - Publish benchmark results in docs
  - Add performance SLO section to monitoring dashboard
  - Create regression detection in CI (flag if p99 increases > 20%)
- **Acceptance Criteria:**
  - Benchmark results published in docs
  - Remote eval: < 150ms p99 documented
  - In-process eval: < 5ms p99 documented
  - CI detects > 20% performance regression
  - Performance comparison table in README

---

## Success Criteria (Exit Conditions)

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| `npm test` passes | Broken | 100% green | CI green on main |
| Vulnerability count | 4 | 0 | `npm audit` clean |
| Test count | Unknown (stale 773) | > 500 verified | Actual test runner output |
| Code coverage | Unknown (stale 67%) | > 80% on core paths | Coverage report |
| `server.ts` lines | 938 | < 200 | `wc -l` |
| `console.*` in prod | ~30 | 0 | grep count |
| DB systems | 2 competing | 1 canonical | Architecture review |
| SSL mode | Flexible | Full (Strict) | Cloudflare dashboard |
| Webhook signing | None | HMAC-SHA256 | Test verification |
| `security.txt` | Missing | Served at `/.well-known/` | curl check |
| TypeScript strict | Warning only | Blocking CI gate | `tsc --noEmit` in CI |
| Docs systems | 3 competing | 1 canonical | Directory audit |
| `/metrics` endpoint | None | Prometheus format | curl check |
| Eval latency (remote) | Unknown | < 150ms p99 | Load test |
| Eval latency (in-process) | N/A | < 5ms p99 | Benchmark |
| Overall audit score | 6.4/10 | 9.2/10 | Re-audit |

---

## Dependencies Between Phases

```
Phase 1 (Foundation)
    ↓
Phase 2 (Architecture) ← depends on test suite being green
    ↓
Phase 3 (Security) ← can partially parallel with Phase 2
    ↓
Phase 4 (Quality) ← depends on service layer from Phase 2
    ↓
Phase 5 (Docs & Ops) ← can parallel with Phase 4
    ↓
Phase 6 (Performance) ← depends on stable foundation from Phases 1-4
```

**Critical path:** Phase 1 → Phase 2 → Phase 4 → Phase 6
**Parallel track:** Phase 3 and Phase 5 can overlap with other phases

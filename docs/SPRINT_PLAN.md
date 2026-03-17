# AgentGuard Sprint Plan
## Four-Expert Planning Workshop Output
**Date:** March 2026 | **Baseline:** v0.8.0 | **Target:** v1.0.0-enterprise-ready

> **Experts:** 🏗️ Alex (Architect) · 🔐 Sam (Security) · 🎨 Dana (UX/Frontend) · 📊 Casey (Product/PM)

---

## PART 1: ITEM-BY-ITEM EXPERT DEBATES & CONSENSUS

---

### Item 1: Standalone CLI Tool
`npx @the-bot-club/agentguard validate .`

---

**Round 1**

🏗️ **ALEX:** We already have the GitHub Action doing directory scanning. The CLI is just a wrapper around that logic with a nicer stdout format. Two days: extract the scan logic into a shared `@the-bot-club/agentguard-core` package, build the CLI binary on top. Use `commander.js` for arg parsing, `ora` for spinner, `chalk` for colorized output. Ship to npm as a standalone binary.

🔐 **SAM:** The CLI scans directories — which means it reads files. File path traversal is the attack vector. If someone runs `npx @the-bot-club/agentguard validate ../../../etc` we need sandboxed path resolution. Also: the CLI probably needs to read API keys from `.env` files to verify policies exist on the server. Those `.env` files contain production secrets. We must never log them, never include them in error output, and strip them from any telemetry.

🎨 **DANA:** The developer experience for a CLI lives or dies on the first 30 seconds. `npx @the-bot-club/agentguard validate .` should just work. No configuration required to get a meaningful result. Show a progress spinner. Output should be readable without color support (CI environments). And the output format must work in GitHub Actions summary — markdown output mode: `--format markdown > $GITHUB_STEP_SUMMARY`.

📊 **CASEY:** This is our top-of-funnel. A developer runs the CLI before they've ever made an account. It must create an "aha moment" — show them something interesting about their codebase even if they have zero AgentGuard configuration. The key insight: scan for tool usage patterns (LangChain tools, OpenAI function calls, CrewAI tools), show what's unprotected. Make the output feel like a discovery, not an error.

---

**Round 2**

🏗️ **ALEX:** Dana's right that it must work without auth — the scan should be fully local in "offline mode." Only when you want to validate against server-side policies do you need an API key. Two modes: `validate --offline` (local heuristics only) and `validate --api-key=xxx` (server-validated against real policies). Same binary, different depth of check.

🔐 **SAM:** Agreed on two modes. In offline mode, we're doing pattern matching on source files. In API mode, we're sending file paths (not content) to the server for policy matching. Never send file content to the server — just tool names detected and their usage context. Privacy-preserving by design.

🎨 **DANA:** The output I want to see:
```
AgentGuard v0.8.0 — Scanning ./src...

Found 3 agents using 12 tools:
  ✅ send_email — covered by policy: email-safety-v2
  ❌ execute_sql — NOT in any policy (unprotected)
  ⚠️  read_file — policy exists but no HITL configured

Score: 67% coverage (2/3 tools protected)

Run `agentguard init` to add policies for unprotected tools.
```

That summary drives signups. Not walls of JSON.

📊 **CASEY:** Lock the scope: offline scan + pretty output + `--format markdown` for CI summaries. API-key-authenticated policy validation is v1.1 — don't block shipping on it. This thing needs to be publishable to npm by end of sprint 1 regardless.

---

**Round 3**

🏗️ **ALEX:** Agreed on scope lock. The local detection heuristics should cover: LangChain `@tool` decorators, OpenAI function calling patterns, CrewAI `@tool` / `BaseTool` subclasses, LangGraph node actions, and generic async function patterns with `toolName` annotations. Regex + AST-lite parsing (via `@babel/parser` for JS/TS, `ast` module reference for Python files).

🔐 **SAM:** The AST parsing library is a supply chain risk — `@babel/parser` is large and has had CVEs. Alternative: tree-sitter WASM bindings are smaller, faster, and sandboxable. But honestly, for v1 regex is fine for tool detection — the patterns are distinctive enough. Don't add a full AST parser to the CLI binary for v1.

📊 **CASEY:** Regex it is. Ship it.

---

**CONSENSUS — Item 1: Standalone CLI Tool**

- **Priority:** P0 (do now — top of funnel, completes deployment enforcement story)
- **Effort:** 3 days
- **Dependencies:** None (standalone package)
- **Implementation spec:**
  - Package: `packages/cli/` in monorepo
  - Published as `@the-bot-club/agentguard` to npm (or standalone `agentguard-cli`)
  - Entry point: `bin/agentguard.js`
  - Commands: `validate [dir]`, `init`, `version`
  - `validate` flags: `--format text|json|markdown`, `--output file`, `--api-key`, `--config agentguard.json`
  - Offline mode: regex detection of tool patterns across JS/TS/Python files
  - Detected patterns: LangChain `@tool`, OpenAI function definitions, CrewAI BaseTool, generic `toolName` props
  - Output: coverage table, score %, actionable next step
  - GitHub Actions summary: `--format markdown` mode
  - Never log file contents, never log API keys, never send file content to server
  - Path traversal protection: resolve paths within CWD boundary only
- **Testing strategy:**
  - Unit tests: regex patterns against fixture files for each framework (LangChain, CrewAI, etc.)
  - Integration test: run CLI against `test/fixtures/sample-agent-project/`
  - Snapshot tests: assert output format doesn't regress
  - Test offline mode (no API key) and API mode (mock server)
  - Test path traversal: `validate ../../../../etc` must error safely
- **Acceptance criteria:**
  - `npx @the-bot-club/agentguard validate .` runs in a LangChain project and correctly identifies tools
  - Output shows coverage score and actionable suggestions
  - `--format markdown` produces valid GitHub Actions step summary
  - Package published to npm with no install warnings
  - README shows 3-line quickstart

---

### Item 2: Redis Distributed Rate Limiter

---

**Round 1**

🏗️ **ALEX:** In-memory rate limiting breaks the moment we scale to multiple instances. The fix is simple: `ioredis` + sliding window counter. One key per `tenantId:endpoint`, increment with `INCR`, set TTL with `EXPIRE`. The existing rate limit middleware just needs its storage layer swapped from an in-memory `Map` to Redis. One day of work if we keep the same interface.

🔐 **SAM:** Redis as a rate limit store has one failure mode: Redis goes down, rate limits stop working, and now we have unlimited requests. Fail-open is wrong for a security product. The Redis client must have a timeout (50ms), and if Redis is unreachable, we fail to a conservative default: allow the request but flag it, OR use an in-memory fallback that resets on restart (still better than unlimited). Document this explicitly in the fail-safe policy.

📊 **CASEY:** Rate limiting is invisible to users when it works, and painful when it's wrong. The customer experience issue is false positives — a legitimate enterprise customer hitting a rate limit because their agent runs bursty workloads. We need per-tenant configurable limits, not one global limit. This is also a monetization mechanism: rate limit by tier (free: 100/min, team: 1000/min, enterprise: custom).

🎨 **DANA:** Dashboard needs to show rate limit status. "You've used 847/1000 requests this minute" is useful context. A rate limit hit should return a helpful error: `{ error: "rate_limit_exceeded", retryAfterMs: 4200, tier: "team", upgradeUrl: "..." }`. Not just a 429 with no body.

---

**Round 2**

🏗️ **ALEX:** The `ioredis` integration is straightforward. I'll use `rate-limiter-flexible` library which already handles Redis + fallback patterns cleanly and has sliding window algorithm built in. No need to write the Redis INCR logic from scratch.

🔐 **SAM:** `rate-limiter-flexible` is good. Make sure the Redis key includes the tenant ID AND the endpoint — so brute-forcing `/api/v1/auth/login` has its own limit (stricter) separate from `/api/v1/evaluate` (more permissive). Different endpoints get different rate limit profiles.

📊 **CASEY:** Agree. Auth endpoints need a much tighter limit — this also covers item 11 (brute-force protection). Build item 2 and item 11 together. Same Redis infrastructure, same middleware, different profiles.

---

**CONSENSUS — Item 2: Redis Distributed Rate Limiter**

- **Priority:** P0 (required for production reliability at scale)
- **Effort:** 2 days (combined with item 11 brute-force protection)
- **Dependencies:** Redis instance (add to Docker Compose — item 23)
- **Implementation spec:**
  - Library: `rate-limiter-flexible` with `RateLimiterRedis` strategy
  - Redis: Azure Cache for Redis (SaaS) / Redis 7-alpine in Docker Compose (self-hosted)
  - Rate limit profiles:
    - `auth`: 10 req/15min per IP (login, register, password reset)
    - `evaluate`: tier-based per tenant (free: 100/min, team: 1000/min, enterprise: configurable)
    - `api-general`: 500/min per tenant
  - Fail mode: if Redis unreachable within 50ms timeout, use in-memory fallback (warn in logs)
  - 429 response body: `{ error, retryAfterMs, tier, upgradeUrl }`
  - Per-tenant limits stored in `organizations.rate_limit_config JSONB`
  - Retry-After header on 429
- **Testing strategy:**
  - Unit: assert Redis INCR/EXPIRE calls with mocked Redis
  - Integration: fire N+1 requests, assert 429 on N+1
  - Chaos test: Redis down → verify fallback behavior (in-memory, not crash)
  - Load test: concurrent requests from same tenant ID
- **Acceptance criteria:**
  - `/api/v1/auth/login` blocked after 10 attempts in 15 minutes (same IP)
  - `/api/v1/evaluate` respects per-tenant rate limit from organization config
  - Redis failure does not cause 500 errors — graceful fallback
  - 429 response includes `retryAfterMs` and `upgradeUrl`
  - Rate limit counters survive API pod restart (because they're in Redis)

---

### Item 3: In-Process SDK (Local Eval)

---

**Round 1**

🏗️ **ALEX:** The HTTP round-trip to evaluate every tool call is the biggest production complaint we'll hear from design partners. A local eval SDK downloads a compiled policy bundle on startup, caches it, and evaluates in-process. The architecture: `AgentGuard.init()` fetches `GET /api/v1/policy-bundles/{tenantId}` which returns a compiled JSON policy bundle. All subsequent `evaluate()` calls are pure local function calls — no network. Telemetry is batched async and flushed every 5 seconds or 100 events.

🔐 **SAM:** The policy bundle is a trust boundary. If the bundle is tampered — either in transit or at rest in the client's memory — the local eval gives wrong results with no way to detect it. The bundle must be signed. `GET /api/v1/policy-bundles/{tenantId}` returns the bundle + a server signature. The SDK verifies the signature before loading. Use Ed25519 (fast, small keys) for bundle signing.

Policy bundle must also have an expiry timestamp — forced TTL, default 60 seconds. The SDK must re-fetch before expiry. "Stale policies allow outdated rules" is a real attack: if you revoke a policy and the agent is using a cached bundle with no TTL, the revocation has no effect.

🎨 **DANA:** The developer experience for init matters. Nobody wants to deal with async initialization at the module level. The SDK should handle the async startup gracefully:
```typescript
// Ideal: works in both ESM and CJS, handles the async init transparently
const agentguard = AgentGuard.create({ apiKey, policyId, mode: 'local' });

// evaluate() auto-triggers init on first call if not initialized
const result = await agentguard.evaluate({ toolName, toolInput });
// Under the hood: if bundle not loaded, fetch it first (once), then evaluate
```

📊 **CASEY:** The competitive advantage here is latency. Sub-5ms local eval vs 50-150ms HTTP. That's the headline. Make sure we can prove it. The SDK should emit timing metrics: `evaluate.latencyMs` as telemetry event. When we show a design partner a graph of "your latency dropped from 120ms to 3ms," that's the conversion moment. Build the measurement in from day one.

---

**Round 2**

🏗️ **ALEX:** The bundle format needs to be evaluable in both Node.js and Python SDKs. Use JSON — not a binary format. The policy bundle is essentially a decision tree that maps `(toolName, toolInput, agentContext) → action`. Compile the bundle server-side from the raw policy rules. The SDK just needs a JSON evaluator, not a full policy engine.

```typescript
interface PolicyBundle {
  bundleId: string;
  tenantId: string;
  policyId: string;
  version: number;
  expiresAt: string;           // ISO timestamp
  signature: string;           // Ed25519 signature (base64)
  rules: CompiledRule[];       // pre-compiled for fast evaluation
}

interface CompiledRule {
  toolPattern: string;         // glob or exact match
  conditions: Condition[];     // pre-compiled conditions
  action: 'allow' | 'block' | 'warn' | 'monitor' | 'hitl';
  priority: number;            // higher = evaluated first
}
```

🔐 **SAM:** The Ed25519 public key must be distributed with the SDK package — not fetched at runtime (that's a TOFU attack). Bundle the public key in the SDK at publish time. Rotate public keys only with SDK version bumps. The SDK should support multiple public keys simultaneously (for key rotation during transition).

📊 **CASEY:** Keep the bundle simple enough that a Python developer can debug it. The compiled rules should be human-readable JSON — not an opaque binary. If a customer's agent is blocked for a reason they don't understand, they should be able to inspect the bundle and see why. Transparency = trust.

---

**CONSENSUS — Item 3: In-Process SDK (Local Eval)**

- **Priority:** P1 (this sprint — critical for production adoption, design partners will ask for it)
- **Effort:** 4 days
- **Dependencies:** Item 2 (Redis, for bundle cache invalidation signals), existing SDK packages
- **Implementation spec:**
  - New flag: `AgentGuard({ mode: 'local' | 'remote', bundleTtlSeconds: 60 })`
  - Bundle endpoint: `GET /api/v1/policy-bundles/:tenantId` — returns signed JSON bundle
  - Bundle signing: Ed25519, server-side; public key bundled in SDK at publish time
  - SDK lazy-init: auto-fetch bundle on first `evaluate()` call; re-fetch before TTL expiry
  - Local evaluation: JSON rule matching against compiled rules (no HTTP)
  - Telemetry batching: events queued in memory, flushed async every 5s or 100 events
  - Bundle cache: in-memory, with background refresh before TTL
  - Kill switch: server can push `{ invalidate: true }` via bundle response to force re-fetch
  - Node SDK + Python SDK (both updated)
  - Emit `evaluate.latencyMs` telemetry metric
- **Testing strategy:**
  - Unit: evaluate() with mocked bundle, assert correct action per rule
  - Unit: signature verification rejects tampered bundles
  - Integration: init with real server, execute 100 evaluations, measure latency
  - Test TTL expiry: mock clock advancement, assert re-fetch triggered
  - Test bundle cache invalidation
  - Perf test: assert p99 latency < 5ms on local eval (no network)
- **Acceptance criteria:**
  - `evaluate()` in local mode completes in < 5ms p99 on standard hardware
  - Bundle refreshes automatically before TTL expiry (no manual intervention)
  - Tampered bundle rejected with clear error
  - Telemetry batched — never blocks evaluate() call
  - Design partner can verify: HTTP evaluate endpoint latency vs local eval latency in dashboard

---

### Item 4: Enterprise Auth (JWT RS256 + SSO)

---

**Round 1**

🏗️ **ALEX:** We have bcrypt auth now. JWT RS256 means asymmetric signing — the API can verify tokens without calling Auth0/Okta on every request. The architecture: integrate Auth0 (or Okta) for the dashboard OAuth flow. API keys remain for agent-to-API calls (no change there). For the dashboard and management API, add a JWT middleware that verifies RS256 tokens. One-time JWKS endpoint fetch, then local verification.

🔐 **SAM:** RS256 is correct. Add: token expiry enforcement (reject tokens after exp claim), clock skew tolerance (±30s max — not 5 minutes), and refresh token rotation. The JWKS endpoint should be fetched and cached, with a re-fetch on unknown kid (key ID) — not on every request. Also: SSO integration means we're relying on Auth0's security. We should add MFA enforcement at the Auth0 level as a required policy for enterprise tier.

🎨 **DANA:** The login experience must be invisible for SSO users. No AgentGuard login screen — just redirect to their company's IdP. First login should auto-provision the user in our system (JIT provisioning) and assign them to the correct tenant based on their SSO claim. Dashboard flow: click Login → redirect to Okta/Auth0 → land in dashboard. No password screens, no "create account" step.

📊 **CASEY:** Enterprise auth is gating real deals. Every enterprise prospect asks "do you support SSO?" We need to say yes. But I want to be clear about scope: Auth0 integration for the dashboard (OAuth2/OIDC). Okta is the same protocol — if we do Auth0, Okta works too. Don't build bespoke Okta integration. The generic OIDC middleware covers 80% of enterprise IdPs.

---

**Round 2**

🏗️ **ALEX:** Implementation plan: (1) Add `passport-openidconnect` or Auth0's SDK to Express, (2) Add JWKS middleware for RS256 verification, (3) Extend `users` table with `sso_provider`, `sso_subject`, `jit_provisioned`, (4) Update dashboard to support SSO redirect flow.

🔐 **SAM:** Scope creep risk: don't implement SCIM provisioning in v1. SCIM (user sync from enterprise IdP) is a different feature that enterprise customers ask for after SSO is working. SSO first, SCIM in v2. Also: implement role-based access at the JWT claims level — enterprise customers need `admin` vs `reviewer` vs `read-only` roles derived from their IdP groups.

📊 **CASEY:** Role mapping from IdP groups is critical — enterprises won't use SSO if they have to manually assign roles in our dashboard after provisioning. Auth0 supports group → claim mapping. Build the role-claim-to-role mapper. Standard claims: `https://agentguard.dev/roles: ["admin"]`.

---

**CONSENSUS — Item 4: Enterprise Auth (JWT RS256 + SSO)**

- **Priority:** P1 (this sprint — direct revenue gate)
- **Effort:** 4 days
- **Dependencies:** Auth0 account (already have or need), existing user/session system
- **Implementation spec:**
  - Auth0 (or generic OIDC) for dashboard login: OAuth2/OIDC flow
  - JWT RS256 middleware: JWKS endpoint cached, local verification on each request
  - JWKS re-fetch only on unknown `kid`; cache TTL 1 hour
  - Clock skew tolerance: ±30s
  - JIT user provisioning: auto-create user on first SSO login, assign to org by domain
  - Role claims: `https://agentguard.dev/roles` → map to DB roles (admin/reviewer/readonly)
  - API keys unchanged: agent-to-API calls remain API key authenticated
  - `users` table: add `sso_provider VARCHAR`, `sso_subject VARCHAR`, `jit_provisioned BOOL`
  - Dashboard: SSO login button → redirect → callback → session
  - MFA enforcement: configurable at tenant level (Auth0 policy)
  - No SCIM in v1
- **Testing strategy:**
  - Unit: JWKS cache hit/miss behavior
  - Unit: JWT verification rejects expired, tampered, wrong-audience tokens
  - Integration: full SSO login flow with Auth0 test tenant
  - Test JIT provisioning: new user auto-created on first login
  - Test role mapping: admin claim → admin role in dashboard
- **Acceptance criteria:**
  - Enterprise tenant can configure SSO via Auth0 connection
  - SSO login flow: < 3 screens, lands in dashboard
  - JWT verification does not call Auth0 on every API request (local RS256 verify)
  - Role-based access enforced: reviewer cannot access admin endpoints
  - Existing bcrypt auth continues to work for non-SSO tenants

---

### Item 5: Multi-Tenancy Hardening

---

**Round 1**

🏗️ **ALEX:** PgBouncer between the API and Postgres is the main item. Right now, each API instance holds a connection pool. With 10+ concurrent tenants doing heavy evaluate workloads, we'll hit Postgres connection limits. PgBouncer transaction-mode pooling means hundreds of API connections map to a small pool of Postgres connections. Add to Docker Compose, wire connection string through.

🔐 **SAM:** Per-tenant connection limits and query quotas are the security items here. Without them, one bad tenant can run expensive queries that starve other tenants. Add row-level security (RLS) is already in — good. Add: per-tenant statement timeout (`SET LOCAL statement_timeout = '5s'` per connection), per-tenant query rate limiting at PgBouncer level, and monitoring for tenant resource usage.

📊 **CASEY:** This is pure infrastructure — invisible to customers when right, painful when wrong. We need this before we have 10+ tenants. Don't over-engineer: PgBouncer + per-tenant connection limits + statement timeout is enough for v1. The full "per-tenant quotas dashboard" can wait until we have a customer asking about it.

🎨 **DANA:** The one UX surface: when a tenant hits their connection/query limit, the error message must be clear and not expose internal infrastructure details. `"Request timeout — try again"` is acceptable. `"PgBouncer pool exhausted for tenant xyz"` is not.

---

**Round 2**

🏗️ **ALEX:** PgBouncer in Docker Compose is straightforward. For Azure Container Apps (SaaS mode), we deploy PgBouncer as a sidecar or use Azure's built-in connection pooler. Statement timeout in Express middleware: wrap every DB query in a transaction with `SET LOCAL statement_timeout`.

🔐 **SAM:** Add: automatic tenant isolation test. On startup, run a canary query that verifies RLS is enforced — i.e., tenant A cannot read tenant B's data. If the canary fails, refuse to start. Belt-and-suspenders with the existing RLS policies.

📊 **CASEY:** Good idea. Ship the startup isolation check. Cheap safety net.

---

**CONSENSUS — Item 5: Multi-Tenancy Hardening**

- **Priority:** P1 (needed before 10+ tenants — approaching that threshold)
- **Effort:** 3 days
- **Dependencies:** Item 23 (Docker Compose for PgBouncer config)
- **Implementation spec:**
  - PgBouncer: transaction-mode pooling, default pool size 20, max client connections 200
  - Per-tenant statement timeout: `SET LOCAL statement_timeout = '5000'` in DB middleware
  - Per-tenant connection limit: configurable in `organizations.db_config JSONB`
  - Startup canary: verify RLS blocks cross-tenant query before accepting traffic
  - Error sanitization: PgBouncer/Postgres errors mapped to generic user-facing messages
  - Azure SaaS: use PgBouncer sidecar in Container Apps or Azure Connection Pooler
  - Docker Compose self-hosted: PgBouncer as a service in compose file
  - Per-tenant resource usage metrics: queries/sec, connection count → to admin analytics
- **Testing strategy:**
  - Integration: create two tenants, verify tenant A cannot read tenant B's data
  - Load test: 100 concurrent connections → verify PgBouncer handles without dropping requests
  - Chaos: kill one Postgres connection, verify PgBouncer reconnects transparently
  - Test statement timeout: run a deliberately slow query, verify 5s timeout fires
- **Acceptance criteria:**
  - 100 concurrent tenant connections handled without hitting Postgres connection limit
  - Cross-tenant RLS verified by startup canary
  - Statement timeout prevents runaway queries
  - Error messages never expose PgBouncer internals to API consumers

---

### Item 6: SIEM Integrations (Splunk, Sentinel)

---

**Round 1**

🏗️ **ALEX:** Both Splunk HEC (HTTP Event Collector) and Microsoft Sentinel (Log Analytics workspace) accept JSON over HTTPS. The integration is a push worker: when an audit event is written, queue a push to configured SIEM endpoints. Use BullMQ (since we have Redis) for reliable delivery with retries. Same pattern as webhooks — we already have webhook delivery. SIEM is just a new delivery target type.

📊 **CASEY:** SIEM integration is the enterprise tell. If a prospect has Splunk or Sentinel, they're a real enterprise security buyer. This feature will be asked for in every enterprise evaluation. BUT — this is P2, not P1. No current customers need it. Ship Splunk HEC first (more common), Sentinel second. Estimate: 3 days total.

🔐 **SAM:** The SIEM endpoint receives all audit events — that's sensitive. The target URL and auth tokens for SIEM endpoints must be encrypted at rest (use the existing encryption key). Also: the push worker must not retry infinitely — failed SIEM pushes should alert the admin after N failures, not silently drop. Dead letter queue for failed events.

🎨 **DANA:** The dashboard needs a SIEM setup wizard. "Paste your Splunk HEC URL and token → test connection → enable." One page, not a multi-step form. Show last sync status: "Last event pushed 2 minutes ago."

---

**Round 2**

🏗️ **ALEX:** Clean design: extend the existing webhook delivery worker to support SIEM as a channel type. `delivery_channels` table: `type: 'webhook' | 'splunk_hec' | 'sentinel'`. The BullMQ worker dispatches based on type. The Splunk HEC payload format is a thin wrapper around our existing audit event JSON.

🔐 **SAM:** The Splunk HEC token is essentially an API key — it must be stored encrypted in our DB (not plaintext, which is what the webhook secret currently does — that's item 12). Fix webhook secret storage at the same time.

📊 **CASEY:** Agreed — fix item 12 (webhook secret hashing) when building SIEM. Same pattern, same migration.

---

**CONSENSUS — Item 6: SIEM Integrations**

- **Priority:** P2 (next sprint — enterprise feature, no current customers need it)
- **Effort:** 3 days (Splunk HEC + Sentinel) + fixes item 12 in the same PR
- **Dependencies:** Item 2 (Redis/BullMQ), Item 8 (structured logging), Item 12 (secret storage)
- **Implementation spec:**
  - Extend delivery worker: new channel type `splunk_hec` and `sentinel`
  - Splunk HEC: POST `{event: auditEvent, time: epochSeconds, source: "agentguard", sourcetype: "json"}` to HEC URL
  - Sentinel: POST to Log Analytics HTTP Data Collector API with HMAC-SHA256 auth
  - Dead letter queue: after 3 retries with exponential backoff, park in `failed_deliveries` table, alert admin
  - All SIEM credentials encrypted at rest (AES-256-GCM with existing encryption key)
  - Dashboard: SIEM setup UI — URL + token → test connection → enable toggle
  - Last sync status visible in dashboard integration settings
  - Also fixes item 12: migrate webhook secrets to encrypted storage (same migration)
- **Testing strategy:**
  - Unit: Splunk HEC payload format matches expected schema
  - Unit: Sentinel HMAC auth signature correct
  - Integration: mock Splunk HEC server, emit audit event, verify received
  - Test retry: mock server fails 2x, succeeds 3rd — verify delivery
  - Test dead letter: mock server fails 3x — verify event in `failed_deliveries`, admin alerted
- **Acceptance criteria:**
  - Audit events delivered to Splunk HEC within 10 seconds of creation
  - Failed deliveries after 3 retries → dead letter queue + admin alert
  - SIEM credentials never stored in plaintext
  - Dashboard test connection button confirms connectivity before saving
  - Item 12 (webhook secret hashing) fixed in same PR

---

### Item 7: ML Anomaly Detection

---

**Round 1**

📊 **CASEY:** This is P3. We need 30+ days of production telemetry before we can build meaningful baselines. We have no customers in production right now. Building ML anomaly detection before we have data is cargo cult ML — we'll build it and have nothing to train on. Defer until post-launch.

🏗️ **ALEX:** Casey is right on timing, but the architecture decisions matter now. The anomaly detection data model needs to be designed alongside the structured logging work (item 8) or we'll have to migrate later. At minimum: design the feature flag interface and the data aggregation schema. Don't build the ML model yet — but don't lock ourselves out of it with a bad schema.

🔐 **SAM:** The security concern with ML anomaly detection: model poisoning. If an attacker knows we're using their traffic to train baselines, they can poison the baseline over time with slow-walking behaviors. The model must have a training data validation step that can reject anomalous training samples. That's a hard problem. Keep using rule-based detection until we have a security ML researcher review the approach.

🎨 **DANA:** When we do build it, the dashboard view matters. "Your agent's tool call rate spiked 340% at 3am — here are the events" is the experience. Not just "anomaly detected: score 0.87." Provide context.

---

**Round 2**

📊 **CASEY:** Agreed on defer. Document the data requirements so we start collecting the right signals now. When we have 30 days of telemetry from real tenants, we revisit. Ship rule-based thresholds as v1 (simple: if tool_calls/min > 5x 7-day average, alert). That's not ML but it's useful immediately.

🏗️ **ALEX:** Rule-based thresholds in item 8 (structured logging) — add a simple alerting rule engine alongside logging. Very little extra work. Sets up the pattern for ML later.

---

**CONSENSUS — Item 7: ML Anomaly Detection**

- **Priority:** P3 (backlog — wait for production telemetry data)
- **Effort:** 3 weeks (when ready — requires 30 days of real telemetry first)
- **Dependencies:** 30+ days production telemetry, Item 8 (structured logging), real customers
- **Implementation spec (document for future):**
  - Start collecting: tool_calls per tenant per hour, block rate, HITL rate, unique tool names — as time series
  - Rule-based v1 (build now, in item 8): alert if metric > 5x 7-day rolling average
  - ML v2 (post-telemetry): River library (Python, online learning), per-tenant isolation forest baseline
  - Model poisoning mitigation: training data validation, reject samples outside ±3σ of existing distribution
  - Dashboard: anomaly timeline with event drill-down
- **Acceptance criteria (when built):**
  - Correctly flags runaway agent (10x normal tool call rate) within 5 minutes
  - False positive rate < 1% on 7-day rolling window
  - Model update does not regress existing detection accuracy
  - No cross-tenant data in any baseline model

---

### Item 8: Structured Logging

---

**Round 1**

🏗️ **ALEX:** Replace `console.log` with `pino` (fastest Node.js JSON logger, minimal overhead). Every log line gets: `requestId`, `tenantId` (where applicable), `level`, `timestamp`, `service`, `message`. The `requestId` propagated via `AsyncLocalStorage` through the request lifecycle — no need to pass it down manually. One day of work: install pino, create `src/lib/logger.ts`, replace all console.log calls.

🔐 **SAM:** Log sanitization is critical. Right now console.log might be logging request bodies that contain API keys, tool inputs with PII, or policy details. Before we make logs structured and ship them to a SIEM, we need a sanitizer that strips sensitive fields. Schema: `['apiKey', 'authorization', 'password', 'token', 'secret', 'pii.*']` are always redacted before logging.

🎨 **DANA:** For developer experience with self-hosted: the logs in `docker-compose logs` should be readable. Pino supports `pino-pretty` for human-readable output in development mode. `NODE_ENV=development` → pretty logs; `NODE_ENV=production` → JSON. That's standard pino config.

📊 **CASEY:** Structured logging is boring infrastructure but it's what lets us debug production issues without SSH-ing into containers. Ship it early — it pays dividends immediately. P0 for me alongside security headers.

---

**Round 2**

🏗️ **ALEX:** The `requestId` via `AsyncLocalStorage` is the key pattern. Once it's in, every log line automatically carries the request context. Add also: `durationMs` on request completion (response time logging). That alone gives us the performance data to find slow endpoints.

🔐 **SAM:** Add: log sampling for high-volume endpoints. `evaluate()` may be called thousands of times per minute. Log every BLOCK/WARN/HITL action, but only sample 1% of ALLOW actions in production. Otherwise logs become a data firehose and we're inadvertently building a detailed traffic profile that's a breach liability.

📊 **CASEY:** Good point. Configurable log level and sampling rate via environment variables. Ship it.

---

**CONSENSUS — Item 8: Structured Logging**

- **Priority:** P0 (foundation for everything else — do immediately)
- **Effort:** 1.5 days
- **Dependencies:** None (standalone refactor)
- **Implementation spec:**
  - Library: `pino` (production JSON) + `pino-pretty` (dev/human-readable)
  - `src/lib/logger.ts`: singleton logger, level from `LOG_LEVEL` env var
  - `requestId` via `AsyncLocalStorage`: injected at request start, available throughout
  - Log fields: `{ requestId, tenantId, agentId, level, timestamp, service, message, durationMs }`
  - Sanitizer: strip `apiKey, authorization, password, token, secret` from any logged object
  - Log sampling: ALLOW actions at evaluate endpoint sampled at configurable rate (default 10%)
  - BLOCK/WARN/HITL/ERROR: always logged at 100%
  - `NODE_ENV=production` → JSON; `NODE_ENV=development` → pino-pretty
  - Replace all `console.log/warn/error` calls in codebase
  - Rule-based alerting stub: log `{ level: 'warn', event: 'anomaly_threshold_exceeded' }` when metric > 5x 7-day avg (data collection for future ML)
- **Testing strategy:**
  - Unit: logger emits correct JSON fields
  - Unit: sanitizer removes sensitive keys
  - Integration: make API request, capture log output, assert requestId consistent throughout
  - Assert: no `console.log` calls in source (CI lint rule)
- **Acceptance criteria:**
  - Every log line has `requestId` that matches the HTTP request
  - API key never appears in any log output
  - `docker-compose logs agentguard-api` in development shows readable output
  - `pino` replaces all `console.log` calls — verified by CI grep

---

### Item 9: Helmet.js Security Headers

---

**Round 1**

🏗️ **ALEX:** Helmet.js is one npm install and one middleware registration. Thirty minutes. The only decisions: which CSP directives to configure (the dashboard uses React, so we need to allow `'self'` and inline scripts from the build), and whether to allow framing (`SAMEORIGIN` for iframe use in some enterprise dashboards).

🔐 **SAM:** Don't accept defaults. The helmet defaults are reasonable but we should explicitly configure:
```
CSP: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.agentguard.dev
X-Frame-Options: DENY (not SAMEORIGIN — we don't embed ourselves)
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
HSTS: max-age=31536000; includeSubDomains; preload
```

🎨 **DANA:** CSP will break the dashboard if not configured correctly. Every `eval()` or inline script in the React build must be audited. Run the build with CSP enabled and check the browser console for violations before shipping.

📊 **CASEY:** 30 minutes plus an hour to audit CSP violations. Still tiny. P0 — it's a checkbox on every security review questionnaire. Ship immediately.

---

**CONSENSUS — Item 9: Helmet.js**

- **Priority:** P0 (30 minutes — no reason to delay)
- **Effort:** 0.5 days (including CSP audit of dashboard)
- **Dependencies:** None
- **Implementation spec:**
  - `npm install helmet`
  - `app.use(helmet({ contentSecurityPolicy: { directives: { ... } } }))`
  - Explicit CSP directives (no defaults): see Sam's spec above
  - `X-Frame-Options: DENY`
  - HSTS with preload
  - Test with CSP report-only mode first, then enforce
  - Audit React build for CSP violations before enabling enforce mode
- **Testing strategy:**
  - Browser: open dashboard, check console for CSP violations
  - HTTP response headers: assert Helmet headers present (automated test with `supertest`)
  - Clickjacking test: attempt iframe embed, verify blocked
- **Acceptance criteria:**
  - All security headers present in API and dashboard responses
  - Dashboard loads without CSP violations in browser console
  - `X-Frame-Options: DENY` prevents clickjacking

---

### Item 10: Request Timeout

---

**Round 1**

🏗️ **ALEX:** Express doesn't have a built-in request timeout. `connect-timeout` middleware + `res.setTimeout()` on the response. Set a global timeout (30s default), shorter for hot paths like `evaluate()` (5s). When timeout fires, return 503 with `Retry-After` header.

🔐 **SAM:** Timeouts prevent resource exhaustion attacks — an attacker who can keep connections open indefinitely (slowloris-style) will exhaust the thread pool. The timeout must also cover: DB queries (statement_timeout — covered in item 5), external API calls (Lakera, Presidio — wrap in `AbortController` with timeout), and webhook delivery (already async).

📊 **CASEY:** Half a day. Ship with item 9 (both are quick security hardening). P0.

---

**CONSENSUS — Item 10: Request Timeout**

- **Priority:** P0 (30 minutes — ship with Helmet)
- **Effort:** 0.5 days (combined with item 9)
- **Dependencies:** None
- **Implementation spec:**
  - `connect-timeout` middleware: global 30s
  - Per-route override: `evaluate()` → 5s, `hitl/approve` → 10s
  - On timeout: 503 response with `Retry-After: 5` header
  - External API calls (Lakera, Presidio): `AbortController` with 3s timeout
  - DB queries: statement_timeout (item 5) covers this
  - Log timeout events with requestId for debugging
- **Acceptance criteria:**
  - Requests taking > 30s return 503 (not hang indefinitely)
  - `evaluate()` returns 503 after 5s
  - Timeout events logged with requestId and endpoint

---

### Item 11: Brute-Force Protection

---

**Round 1**

🔐 **SAM:** Already covered under item 2. Redis rate limiter with `auth` profile: 10 attempts per IP per 15 minutes on login/register/password-reset endpoints. After 10 failures, return 429 with a generic message (don't confirm whether the account exists). Progressive delay: after 5 failures, add 2-second delay per attempt.

📊 **CASEY:** Combine with item 2 — same implementation, same PR. Zero extra effort if done together.

🏗️ **ALEX:** Agreed. The `rate-limiter-flexible` library supports `blockDuration` (block IP for N seconds after limit exceeded). That's the progressive delay / lockout behavior. Ship together with item 2.

---

**CONSENSUS — Item 11: Brute-Force Protection**

- **Priority:** P0 (combined with Item 2 — zero marginal effort)
- **Effort:** 0 additional days (included in Item 2)
- **Dependencies:** Item 2 (Redis rate limiter)
- **Implementation spec:**
  - Covered entirely by Item 2's `auth` rate limit profile
  - `rate-limiter-flexible` `blockDuration: 900` (15 minute block after 10 failures)
  - Progressive delay: `inMemoryBlockOnConsumed` after 5 failures
  - Generic error message: "Login failed" (do not confirm account existence)
  - IP-based blocking (not account-based — account enumeration risk)
- **Acceptance criteria:**
  - 11th login attempt in 15 minutes returns 429
  - Response does not confirm whether account exists
  - IP blocked for 15 minutes after 10 failures

---

### Item 12: Webhook Secret Hashing

---

**Round 1**

🔐 **SAM:** Currently webhook secrets are stored plaintext. If the DB is breached, all customer webhook secrets are compromised. Webhooks receive sensitive agent action data — an attacker with the secret can impersonate AgentGuard's webhook delivery and inject fraudulent events into the customer's system. Fix: hash stored secrets with bcrypt (same as passwords), or better: store AES-256-GCM encrypted (reversible — needed because we re-send the HMAC on delivery).

🏗️ **ALEX:** Can't bcrypt — we need the original to compute HMAC on webhook delivery. Must be reversible encryption (AES-256-GCM) with the encryption key from environment variables. Migration: one-time script to encrypt all existing plaintext secrets.

📊 **CASEY:** Include in item 6 (SIEM) PR — same pattern, same migration tooling.

---

**CONSENSUS — Item 12: Webhook Secret Hashing**

- **Priority:** P0 (security regression — fix immediately, ship with Item 6 or standalone)
- **Effort:** 0.5 days (migration + encrypt/decrypt wrapper)
- **Dependencies:** Encryption key in environment config (item 8 config abstraction)
- **Implementation spec:**
  - Wrap webhook secret storage with AES-256-GCM encryption/decryption
  - `ENCRYPTION_KEY` from environment variables
  - Migration: `UPDATE webhook_configs SET secret = encrypt(secret, key)` — run on deploy
  - Decrypt only when computing HMAC for delivery
  - New secrets: encrypted before INSERT
- **Acceptance criteria:**
  - Webhook secrets stored as encrypted ciphertext in DB
  - Webhook delivery HMAC still computes correctly
  - Migration completes without disrupting existing webhook deliveries

---

### Item 13: Dashboard Analytics Page

---

**Round 1**

🎨 **DANA:** The analytics page is what turns AgentGuard from a black box into a glass box. Key charts: (1) evaluate call volume over time (line chart, 24h/7d/30d), (2) action distribution pie (allow/block/warn/hitl), (3) block rate trend, (4) top blocked tools. Use a lightweight charting library — Recharts or Chart.js. Don't add a heavy BI tool.

📊 **CASEY:** The metrics that matter for a sales demo: block rate (shows the product is working), evaluate volume (shows adoption), HITL approval rate (shows the workflow is used). Design the page around these three headlines before showing detailed charts.

🏗️ **ALEX:** Backend: we already have platform analytics for admin. Extend the analytics API to be tenant-scoped. New endpoint: `GET /api/v1/analytics/evaluate` with query params for time range. Pre-aggregate in a materialized view or a background job — don't run heavy aggregate queries on the live events table in the hot path.

🔐 **SAM:** Analytics data is tenant-scoped. The endpoint must enforce that a tenant can only see their own analytics — even if they manipulate query params. RLS at the DB level + tenantId in JWT claim verification.

---

**Round 2**

🎨 **DANA:** Three panels on the page:
1. **Volume panel**: evaluate calls/day (bar chart), compare to previous period
2. **Action breakdown**: donut chart of allow/block/warn/hitl proportions
3. **Top risks table**: tools that triggered the most blocks/warns, with drill-through to audit events

All charts should be exportable as PNG for use in board decks.

📊 **CASEY:** Add a "last 7 days summary" email that can be sent to the account owner weekly. That's a passive engagement mechanism that keeps AgentGuard top of mind.

---

**CONSENSUS — Item 13: Dashboard Analytics Page**

- **Priority:** P1 (this sprint — critical for product stickiness and demos)
- **Effort:** 3 days
- **Dependencies:** Item 8 (structured logging for consistent event data)
- **Implementation spec:**
  - New API: `GET /api/v1/analytics/evaluate?from=&to=&granularity=hour|day`
  - Data: pre-aggregated in a scheduled job (runs every 5 minutes) into `analytics_snapshots` table
  - Tenant-scoped: JWT tenantId enforced, RLS backup
  - Frontend: Recharts library, three panels (volume, action breakdown, top risks)
  - Time range selector: 24h / 7d / 30d
  - PNG export of each chart
  - "Summary stats" cards: total evaluations, block rate %, HITL rate %, avg latency
  - Weekly digest email (opt-in): send top-level stats every Monday 9am in user's timezone
- **Testing strategy:**
  - Unit: analytics aggregation query returns correct counts
  - Integration: seed events, hit analytics endpoint, assert response values
  - Visual regression: Playwright screenshot comparison for chart rendering
  - Auth test: tenant A cannot see tenant B's analytics
- **Acceptance criteria:**
  - Analytics page loads within 2 seconds with 30 days of data
  - Block rate trend visible and accurate
  - PNG chart export works
  - Zero cross-tenant data leakage (verified by test)

---

### Item 14: Dashboard OWASP Compliance View

---

**Round 1**

🎨 **DANA:** This is the visual companion to the OWASP report engine (already built per DESIGN_DEBATE.md). The dashboard view should show: a compliance score gauge (e.g., "7/10 OWASP controls covered"), color-coded list of controls (green/yellow/red), and a one-click "Generate Report" button that creates the PDF. Simple and readable.

📊 **CASEY:** This is a premium feature — show it to free tier users as a teaser with upgrade CTA: "Your compliance score is hidden — upgrade to Team to unlock." The report itself is locked behind paid tier. Drives conversion.

🏗️ **ALEX:** The compliance check engine is already designed in DESIGN_DEBATE.md. The dashboard view is a React component that calls `POST /api/v1/compliance/owasp/generate` and renders the result. Two days of frontend work.

🔐 **SAM:** Ensure the compliance score is calculated in real-time against current policy config, not cached. A stale compliance score that shows "covered" when the policy was recently disabled is worse than no score.

---

**CONSENSUS — Item 14: Dashboard OWASP Compliance View**

- **Priority:** P1 (high-value sales tool — pairs with backend already designed)
- **Effort:** 2 days (frontend only — backend designed in DESIGN_DEBATE.md)
- **Dependencies:** OWASP compliance API (build from DESIGN_DEBATE.md spec), Item 13 analytics
- **Implementation spec:**
  - New dashboard page: `/compliance`
  - Compliance score gauge (out of 10)
  - Control list: color-coded (green=covered, yellow=partial, red=not_covered)
  - "Generate Report" button → calls API → offers PDF download
  - Free tier: score gauge visible but controls blurred with upgrade CTA
  - Last report date shown; "Regenerate" button
  - Real-time generation (no cache) — note: ~2s server processing expected
- **Acceptance criteria:**
  - Compliance page renders score gauge correctly
  - PDF download works from dashboard
  - Free tier upgrade CTA visible for locked controls
  - Real-time score: changing a policy and regenerating reflects new score immediately

---

### Item 15: Dashboard MCP Server Management

---

**Round 1**

🎨 **DANA:** This is the UI for registering MCP servers (from DESIGN_DEBATE.md feature 4). The form: server name, target URL, policy assignment, test connection button. After registration, show a list of registered servers with status (active/inactive), tool count, recent call count.

🏗️ **ALEX:** Backend CRUD for MCP servers is part of the MCP policy enforcement feature. The dashboard UI is just a form + list view that calls those endpoints. 1.5 days.

📊 **CASEY:** Important for the demo story: "Register your MCP server, attach a policy, and every MCP tool call is instantly governed." Visual and immediate. This is part of the MCP first-mover narrative.

---

**CONSENSUS — Item 15: Dashboard MCP Server Management**

- **Priority:** P1 (pairs with MCP policy enforcement — builds compelling demo)
- **Effort:** 2 days
- **Dependencies:** MCP server API endpoints (from MCP policy feature)
- **Implementation spec:**
  - Dashboard page: `/mcp-servers`
  - Add server form: name, target URL (with SSRF warning), policy selector, test connection
  - Server list: name, status, tool count, last-seen, delete button
  - Tool inventory view: expand row to see declared tools for each server
  - Audit log link: click server → filtered audit log for that server
- **Acceptance criteria:**
  - Can register and delete MCP servers from dashboard
  - Test connection validates server reachability before saving
  - Tool inventory visible after registration

---

### Item 16: Dashboard Slack Integration Setup

---

**Round 1**

🎨 **DANA:** One-page setup: "Add to Slack" button → OAuth → confirm workspace → configure channel ID + authorized reviewers. Show connection status and "Send test notification" button.

🏗️ **ALEX:** This is the OAuth callback UI for the Slack integration from Item 7 (Slack HITL). The backend OAuth flow is in Item 7. The dashboard UI is a settings page: ~1 day.

📊 **CASEY:** Tie the Slack setup to the onboarding flow (Item 18). Make it a step in the first-time experience: "Setup complete → Optionally add Slack notifications." Users who set up Slack will have much higher activation rates.

---

**CONSENSUS — Item 16: Dashboard Slack Integration Setup**

- **Priority:** P1 (pairs with Item 7 — Slack HITL)
- **Effort:** 1 day
- **Dependencies:** Item 7 (Slack HITL backend OAuth flow)
- **Implementation spec:**
  - Dashboard page: `/settings/integrations/slack`
  - "Add to Slack" button → OAuth redirect
  - Post-OAuth: channel selector, reviewer user ID list
  - Test notification button
  - Connection status indicator (connected/disconnected)
  - Disconnect button
- **Acceptance criteria:**
  - "Add to Slack" completes OAuth and returns to dashboard
  - Test notification delivers to configured Slack channel
  - Disconnect removes stored Slack credentials

---

### Item 17: Demo Site Mobile Polish

---

**Round 1**

🎨 **DANA:** The demo site has basic mobile support but it needs responsive polish: hero section scaling, code samples scrollable horizontally on mobile, CTA buttons thumb-friendly (min 44px), navigation hamburger menu. I'd estimate 1 day of CSS work.

📊 **CASEY:** Mobile traffic to agentguard.dev is likely < 20% given the developer audience, but any conference talk or tweet that links to us will send mobile traffic. Polish it — 1 day is fine.

🏗️ **ALEX:** No backend work. Pure CSS/responsive design. Ship with the marketing updates (Item 22).

---

**CONSENSUS — Item 17: Demo Site Mobile Polish**

- **Priority:** P2 (next sprint — low risk, low priority)
- **Effort:** 1 day
- **Dependencies:** None
- **Implementation spec:**
  - Responsive breakpoints: 320px, 768px, 1024px
  - Hero section: text scales to 28px on mobile (from 48px)
  - Code samples: horizontal scroll on mobile
  - CTA buttons: min-height 44px (iOS HIG compliance)
  - Navigation: hamburger menu below 768px
  - Test: Playwright mobile viewport screenshots
- **Acceptance criteria:**
  - No horizontal scroll on body at 375px viewport width
  - All CTAs tappable without zooming
  - Lighthouse mobile score > 85

---

### Item 18: Onboarding Flow

---

**Round 1**

🎨 **DANA:** This is the single biggest driver of activation. Signup → empty state is where most users bounce. The flow should be: (1) Signup → (2) "Create your first agent" wizard → (3) "Add to your code" SDK snippet → (4) "Make your first evaluate call" → (5) "🎉 First event received!" The wizard should generate real API keys, real policy, and real code snippet personalized to their language (Node/Python).

📊 **CASEY:** The activation metric: user makes at least one successful `evaluate()` call within 24 hours of signup. That's the magic moment. Everything else is vanity. Build the onboarding flow specifically to maximize that metric.

🏗️ **ALEX:** Backend: "first event" listener — when a new tenant's first evaluate event arrives, trigger a welcome webhook (or update their onboarding state). Frontend: progress indicator that polls for the first event. When it arrives, the UI celebrates and moves to the next step.

🔐 **SAM:** During onboarding, the user creates their first API key. The API key is shown exactly once. Make this crystal clear in the UI: "Save this key — we won't show it again." Offer a one-click copy. If they miss it, they can always generate a new one, but don't require them to start over.

---

**Round 2**

🎨 **DANA:** The "language selector" step is important: show Node.js, Python, or cURL code snippet based on their choice. Pre-fill the API key in the snippet. That's the "aha" moment — they paste it into their terminal and it just works. Make the copy-paste experience perfect.

📊 **CASEY:** Add Slack setup as an optional step at the end of onboarding. After their first event, offer "Want to get notified about blocked actions? Set up Slack." Conversion to Slack setup from onboarding = highly engaged users.

---

**CONSENSUS — Item 18: Onboarding Flow**

- **Priority:** P1 (drives activation — highest-leverage UX investment)
- **Effort:** 3 days
- **Dependencies:** Items 7 (Slack setup), Item 13 (analytics for "first event" celebration)
- **Implementation spec:**
  - Multi-step wizard: 5 steps with progress indicator
  - Step 1: "Name your agent" (sets up first agent resource)
  - Step 2: "Choose your policy template" (select from 7 existing templates)
  - Step 3: "Get your API key" (generate key, one-time display, copy button)
  - Step 4: "Add to your code" (language selector: Node/Python/cURL, pre-filled code)
  - Step 5: "Waiting for first event..." (polls `GET /api/v1/onboarding/status`)
  - Step 5b: "🎉 First event received!" → redirect to analytics dashboard
  - Optional post-onboarding: Slack setup CTA
  - `onboarding_state` column in `organizations` table: tracks completed steps
  - Resume from last step on re-login
- **Testing strategy:**
  - E2E: Playwright test completing full onboarding flow to first event
  - Unit: onboarding state machine transitions
  - Test copy button: clipboard API in test environment
- **Acceptance criteria:**
  - New user can go from signup to first successful evaluate call in < 5 minutes
  - API key shown once, copy button works
  - First event triggers celebration state in UI within 10 seconds of arrival
  - Onboarding state persists across browser sessions (resume from step)

---

### Item 19: API Docs (OpenAPI/Swagger)

---

**Round 1**

🏗️ **ALEX:** We have 51 endpoints and Zod validation on every route. Auto-generate OpenAPI spec from Zod schemas using `zod-to-openapi` or `@asteasolutions/zod-to-openapi`. Serve interactive docs at `/api/docs` via Swagger UI or Redoc (Redoc looks more professional). The spec is generated at build time, not runtime.

🎨 **DANA:** Redoc over Swagger UI — it's cleaner, better mobile experience, and renders request/response examples better. Most importantly: add code examples for every endpoint in Node.js and Python. Docs without code examples are useless for developers.

📊 **CASEY:** API docs are a developer acquisition tool. When someone Googles "how to add human-in-the-loop to my AI agent API," they should find our docs. SEO-friendly static docs + sitemap. And: add an "Run in Postman" button — developers immediately click that.

🔐 **SAM:** The spec must not include internal admin endpoints or endpoints that expose infrastructure details. Separate public-facing spec from internal spec. The `/api/docs` endpoint serves the public spec only.

---

**CONSENSUS — Item 19: API Docs (OpenAPI/Swagger)**

- **Priority:** P1 (developer acquisition — SEO and DX)
- **Effort:** 2 days
- **Dependencies:** Zod validation schemas (exist), Item 8 (structured schema understanding)
- **Implementation spec:**
  - `zod-to-openapi`: generate OpenAPI 3.1 spec from existing Zod schemas
  - Redoc: serve at `/api/docs` (public-facing) and `/api/docs/internal` (internal, auth required)
  - Public spec: developer-facing endpoints only (no admin, no internal)
  - Code examples: Node.js + Python for each endpoint (added as x-codeSamples)
  - "Run in Postman" button with collection export
  - Static HTML export for SEO (sitemap-friendly)
  - Versioned: `/api/v1/docs`, update with each API version
- **Acceptance criteria:**
  - `/api/docs` loads Redoc with all 51 public endpoints documented
  - Each endpoint has request/response example
  - Code examples in Node.js and Python for core endpoints (evaluate, HITL, policies)
  - "Run in Postman" button generates importable collection

---

### Item 20: Cloudflare Full/Strict SSL

---

**Round 1**

🏗️ **ALEX:** Generate an origin certificate in Cloudflare dashboard (free), upload to Azure Container Apps as a custom cert, switch Cloudflare SSL mode from Flexible to Full (Strict). 30 minutes.

🔐 **SAM:** This is a P0 security requirement. "Flexible SSL" means traffic between Cloudflare and the origin is unencrypted HTTP. Any network monitor on Azure's backbone can read all API traffic. This is catastrophically bad for a security product. Fix today.

📊 **CASEY:** This is the first thing any security-conscious customer will check. Fix immediately.

---

**CONSENSUS — Item 20: Cloudflare Full/Strict SSL**

- **Priority:** P0 (do now — in progress, 30 minutes)
- **Effort:** 0.5 hours
- **Dependencies:** Cloudflare account access, Azure Container Apps admin
- **Implementation spec:**
  - Generate origin cert: Cloudflare Dashboard → SSL/TLS → Origin Server → Create Certificate
  - Upload cert to Azure Container Apps custom domain configuration
  - Switch Cloudflare SSL mode: Full → Full (Strict)
  - Verify: `curl -I https://api.agentguard.dev` shows TLS all the way through
- **Acceptance criteria:**
  - Cloudflare SSL mode shows "Full (Strict)"
  - Certificate valid, no warnings in browser
  - Origin traffic encrypted (not HTTP)

---

### Item 21: Version Bump v0.8.0

---

**Round 1**

📊 **CASEY:** Publish what we've built. `@the-bot-club/agentguard@0.8.0` to npm, `agentguard-tech@0.8.0` to PyPI. Also publish to ClawHub if that's a distribution channel. This unblocks any developer who wants to use the latest features.

🏗️ **ALEX:** Run the existing publish workflow: bump versions in `package.json` and `setup.py`, build, `npm publish`, `pip publish`. One hour. Should be automated via CI — create a release GitHub Action that triggers on git tags.

🎨 **DANA:** Write the changelog. Clear, concise, links to docs for each new feature. Developers read changelogs to decide whether to upgrade.

---

**CONSENSUS — Item 21: Version Bump v0.8.0**

- **Priority:** P0 (do immediately — current published versions are stale)
- **Effort:** 1 hour
- **Dependencies:** None (can do right now)
- **Implementation spec:**
  - Bump `package.json` → 0.8.0, `setup.py` → 0.8.0
  - `npm publish --access public`
  - `python -m twine upload dist/*`
  - GitHub Release with CHANGELOG.md
  - Create tag-triggered GitHub Action for future releases
- **Acceptance criteria:**
  - `npm install @the-bot-club/agentguard@0.8.0` succeeds
  - `pip install agentguard-tech==0.8.0` succeeds
  - GitHub Release published with changelog

---

### Item 22: Update All Docs/Sites

---

**Round 1**

🎨 **DANA:** The docs and landing page currently describe v0.7.2 capabilities. With 51 endpoints and major new features (MCP, A2A, OWASP compliance, Slack HITL), the docs need a full update. Priority: (1) landing page hero copy reflects current feature set, (2) docs nav has all new features, (3) API reference reflects 51 endpoints.

📊 **CASEY:** The landing page positioning should shift to "Runtime security for AI agents that *do* things" — tool-level enforcement + HITL + audit trail. Lead with the 3 things nobody else has. Update the "what it does" section and the pricing page (if public).

🏗️ **ALEX:** Docs update should be paired with API docs generation (Item 19) — same sprint, cross-reference.

---

**CONSENSUS — Item 22: Update All Docs/Sites**

- **Priority:** P1 (can't send traffic to outdated docs)
- **Effort:** 2 days
- **Dependencies:** Item 19 (API docs), Item 21 (version bump)
- **Implementation spec:**
  - Landing page: update hero, feature grid, positioning copy
  - Docs site: new sections for MCP, A2A, OWASP compliance, Slack HITL, SDK 0.8.0
  - API reference: link to auto-generated Redoc docs (Item 19)
  - Pricing page: update tier descriptions to match new feature set
  - SEO: update meta descriptions, OG tags
- **Acceptance criteria:**
  - Landing page describes current v0.8.0 feature set accurately
  - Docs site has navigation entries for all major features
  - No broken links in docs

---

### Item 23: Docker Compose for Self-Hosted

---

**Round 1**

🏗️ **ALEX:** Covered extensively in DESIGN_DEBATE.md Feature 5 (Self-Hosted Deployment). Docker Compose is the primary deliverable of that feature. The full spec is there: services (api, worker, dashboard, postgres, redis, presidio-analyzer), `install.sh`, `.env.example`. Implement per that spec.

🔐 **SAM:** Key points from DESIGN_DEBATE.md: auto-generate secrets in `install.sh` (never default passwords), postgres/redis ports are internal only (no host port exposure), Docker images signed with Cosign.

📊 **CASEY:** Self-hosted Docker Compose is a revenue unlocker for enterprise. Combine this item with the config abstraction work needed to make all services env-var configurable. These are inseparable.

🎨 **DANA:** The install experience is the product for self-hosted users. Three commands: `git clone`, `cd`, `./install.sh`. That's the README headline. Polish the output of `install.sh` — it should feel professional.

---

**CONSENSUS — Item 23: Docker Compose for Self-Hosted**

- **Priority:** P1 (revenue unlocker for enterprise deals)
- **Effort:** 5 days (includes config abstraction)
- **Dependencies:** Item 8 (structured logging / config abstraction), all existing Dockerfiles
- **Implementation spec:** Per DESIGN_DEBATE.md Feature 5 (Self-Hosted Deployment) spec in full
  - `docker-compose.yml`: api, worker, dashboard, postgres, redis, presidio-analyzer
  - `docker-compose.tls.yml`: Caddy reverse proxy override
  - `install.sh`: secret generation, first-run setup
  - `config.ts`: env-var-based config with validation and sensible defaults
  - License: JWT phone-home validation with 30-day offline grace
  - DB migrations on API startup
  - Telemetry: opt-in only for self-hosted
  - README: 3-command install
- **Acceptance criteria:**
  - Fresh Ubuntu VM: `git clone` + `./install.sh` → AgentGuard running at `http://localhost:8080`
  - No default passwords in compose file
  - Postgres/Redis not exposed on host network
  - All API features work in self-hosted mode

---

### Item 24: Helm Chart

---

**Round 1**

🏗️ **ALEX:** Helm chart is a parameterized Kubernetes deployment. The values file maps to the same env vars as Docker Compose. Services: api (Deployment), worker (Deployment), dashboard (Deployment), postgres (StatefulSet or external), redis (StatefulSet or external). HPA for api and worker.

📊 **CASEY:** P3 — build this only when an enterprise customer asks for Kubernetes deployment. The Docker Compose covers 80% of self-hosted needs. Don't spend time on Helm until we have someone who needs it.

🔐 **SAM:** Helm chart has NetworkPolicy resources — by default, pods can talk to each other. Postgres should only be reachable from api and worker pods, not dashboard or internet. Include NetworkPolicy in the chart.

🎨 **DANA:** The values.yaml must be well-commented. Enterprise Kubernetes admins will customize it — they need to understand every option.

---

**CONSENSUS — Item 24: Helm Chart**

- **Priority:** P3 (backlog — build when first Kubernetes enterprise customer asks)
- **Effort:** 5 days
- **Dependencies:** Item 23 (Docker Compose — Helm mirrors its structure)
- **Implementation spec:**
  - Helm chart: `charts/agentguard/`
  - Deployments: api, worker, dashboard
  - StatefulSets: postgres (optional — support external DB), redis (optional)
  - Services + Ingress with TLS annotations
  - HPA for api + worker
  - NetworkPolicy: postgres accessible only from api/worker pods
  - Well-commented `values.yaml`
  - Publish to Artifact Hub
- **Acceptance criteria:**
  - `helm install agentguard ./charts/agentguard` deploys full stack
  - All features functional in k8s cluster
  - NetworkPolicy prevents unauthorized pod communication

---

### Items 25–29: Business Items (Document Only)

---

**Round 1 — All Four Experts**

📊 **CASEY:** These are founder actions, not engineering tasks. I'm PM, not a lawyer or business strategist. But I'll provide the prioritization and sequencing so engineering work doesn't block on business or vice versa.

🔐 **SAM:** Trademark before Show HN — don't go viral without protecting the brand. Incorporation before any revenue discussions — every enterprise prospect will ask "who is the legal entity?"

🎨 **DANA:** IGP grant is worth pursuing — it's non-dilutive capital. The design partner outreach plan should go out the same week as Show HN to capitalize on inbound traffic.

🏗️ **ALEX:** Show HN timing matters technically: make sure the CLI (Item 1) and SSL (Item 20) are shipped before the post. The demo must work flawlessly. Nothing kills HN momentum like a broken demo.

---

**CONSENSUS — Items 25–29: Business Actions**

| Item | Priority | Timing | Notes |
|------|----------|--------|-------|
| 25. Incorporate Pty Ltd | P0 (business) | This week | Unblocks contracts, invoicing, bank account. AU Pty Ltd via ASIC online: ~A$538, ~24 hours. |
| 26. Trademark filing | P0 (business) | After incorporation | File "AgentGuard" in AU (IP Australia) + US (USPTO). Use Madrid Protocol for both. ~$1,500 total. File before Show HN. |
| 27. Design partner outreach plan | P1 (business) | Same week as Show HN | Target: 5 companies building agents in LangChain/CrewAI. Script: "Free enterprise tier + roadmap input + co-marketing." Channels: LinkedIn + LangChain Discord. |
| 28. Show HN timing | P1 (business) | After Sprint 1 ships | Trigger: CLI published + SSL fixed + docs updated. Tuesday 9am ET is historically the best HN slot. Post from the technical founder's HN account (age matters). |
| 29. IGP grant submission | P2 (business) | Within 30 days | Austrade Innovation Connections / IP Australia IGP. Requires: entity incorporated, IP registered or filed. Non-dilutive ~$50K. Assign to founder task. |

---

## PART 2: SPRINT PLAN

---

## Sprint 1: Foundation, Quick Wins, Top-of-Funnel
**Duration:** 2 weeks | **Goal:** Ship the things that are fastest and unblock everything else

### Sprint 1 Parallel Track A — Security Hardening (Day 1–3)
*Can start immediately, no dependencies, no coordination required*

| Item | Engineer | Days | Why Now |
|------|----------|------|---------|
| **20. Cloudflare Full/Strict SSL** | Any | 0.5h | 30-min fix; security credibility blocker |
| **9. Helmet.js** | Any | 0.5d | 30-min code + 2h CSP audit |
| **10. Request Timeout** | Any | 0.5d | Combine with Helmet.js — same PR |
| **12. Webhook Secret Hashing** | Backend | 0.5d | Security regression — fix now |
| **21. Version Bump v0.8.0** | Any | 1h | Publish what's built right now |

→ **Assign to one engineer. Ship by Day 2. These are all <= 1 day combined.**

---

### Sprint 1 Parallel Track B — Structured Logging (Day 1–2)
*Unblocks everything else that needs request IDs and clean config*

| Item | Engineer | Days | Why Now |
|------|----------|------|---------|
| **8. Structured Logging** | Backend | 1.5d | requestId + pino + config abstraction — foundational |

→ **Start Day 1. Must complete before Track C begins (Track C depends on config abstraction).**

---

### Sprint 1 Parallel Track C — Top-of-Funnel (Day 1–4)
*Can start simultaneously with Track B — no dependencies on each other*

| Item | Engineer | Days | Why Now |
|------|----------|------|---------|
| **1. Standalone CLI Tool** | Backend/Full | 3d | #1 developer acquisition; npm publish; no dependencies |

→ **Start Day 1. Ship CLI by Day 4.**

---

### Sprint 1 Parallel Track D — Rate Limiting + Brute Force (Day 2–4)
*Depends on Redis being available — add Redis to Docker Compose first (1h)*

| Item | Engineer | Days | Why Now |
|------|----------|------|---------|
| **2. Redis Distributed Rate Limiter** | Backend | 2d | Includes Item 11 (brute-force) at zero extra cost |
| **11. Brute-Force Protection** | (included in 2) | — | Part of Item 2 Redis middleware |

→ **Start Day 2 (after Redis added to infra). Ship by Day 4.**

---

### Sprint 1 Parallel Track E — Dashboard Quick Wins (Day 1–5)
*Frontend can work independently while backend tracks run*

| Item | Engineer | Days | Why Now |
|------|----------|------|---------|
| **19. API Docs (OpenAPI/Swagger)** | Frontend/Backend | 2d | Zero dependency; developer acquisition tool |
| **22. Update Docs/Sites** | Frontend | 2d | Can start immediately; marketing priority |

→ **Frontend engineer owns these. Parallel with all backend tracks.**

---

### Sprint 1 Summary

```
Day 1:  ┌─ Track A: SSL + Helmet + Timeout + Webhooks + Version bump (same dev)
        ├─ Track B: Structured Logging starts
        ├─ Track C: CLI Tool starts
        └─ Track E: API Docs starts + Docs/Site updates start

Day 2:  ├─ Track A: DONE ✅
        ├─ Track B: Structured Logging DONE ✅
        ├─ Track C: CLI Tool continuing
        ├─ Track D: Redis Rate Limiter starts
        └─ Track E: API Docs + Docs updates continuing

Day 4:  ├─ Track C: CLI Tool DONE ✅ → npm publish
        ├─ Track D: Redis Rate Limiter + Brute Force DONE ✅
        └─ Track E: API Docs DONE ✅

Day 5:  └─ Track E: Docs/Sites DONE ✅

Sprint 1 Complete: ~Day 5 (1 week with 2 engineers)
```

**Sprint 1 PARALLEL items (no dependencies on each other):**
- Items 20, 9, 10, 12, 21 (security hardening batch)
- Item 8 (structured logging)
- Item 1 (CLI tool)
- Items 2+11 (rate limiter + brute force)
- 22 (docs)

**Sprint 1 SEQU Items 19,ENTIAL dependencies:**
- Item 2 depends on Redis (add Redis in Day 1 infra step — 30 minutes)
- Item 22 benefits from Item 19 (link to generated API docs) — sequence accordingly

---

**Business parallel (Sprint 1 week):**
- Day 1: File for Pty Ltd incorporation (founder, 30 min online)
- Day 2: File trademark in AU (after ACN confirmed)
- Day 5: Prepare Show HN draft (use existing SHOW_HN_DRAFT.md)

---

## Sprint 2: Core Features + Enterprise Readiness
**Duration:** 2 weeks | **Goal:** Ship features that unlock enterprise deals and drive retention

### Sprint 2 Parallel Track A — Enterprise Auth (Day 1–4)
*Depends on: Item 8 config abstraction (done Sprint 1)*

| Item | Engineer | Days | Why Now |
|------|----------|------|---------|
| **4. Enterprise Auth (JWT RS256 + SSO)** | Backend | 4d | Unblocks enterprise deals; design partners will ask |

---

### Sprint 2 Parallel Track B — In-Process SDK (Day 1–4)
*Depends on: Item 8 config abstraction; Item 2 Redis (for cache)*

| Item | Engineer | Days | Why Now |
|------|----------|------|---------|
| **3. In-Process SDK (Local Eval)** | Backend | 4d | Critical for production-grade adoption; < 5ms latency story |

---

### Sprint 2 Parallel Track C — Dashboard: Analytics + Onboarding (Day 1–6)
*Depends on: Item 8 structured logging (done Sprint 1)*

| Item | Engineer | Days | Notes |
|------|----------|------|-------|
| **13. Dashboard Analytics Page** | Frontend | 3d | Recharts + analytics API; parallel with Track A/B |
| **18. Onboarding Flow** | Frontend | 3d | Start Day 4 (after analytics API ready) |

→ **Analytics first (Day 1–3), then Onboarding (Day 4–6).**

---

### Sprint 2 Parallel Track D — Multi-Tenancy Hardening (Day 1–3)
*Depends on: Item 23 Docker Compose (PgBouncer needs compose infra) OR: Deploy PgBouncer to Azure SaaS directly (no compose dependency)*

| Item | Engineer | Days | Notes |
|------|----------|------|-------|
| **5. Multi-Tenancy Hardening** | Backend/DevOps | 3d | PgBouncer + per-tenant limits; infra change |

---

### Sprint 2 Parallel Track E — Slack HITL (Day 1–9)
*Depends on: Item 2 Redis (for HITL timeout worker queue)*

| Item | Engineer | Days | Notes |
|------|----------|------|-------|
| **7. Slack/Teams HITL Integration** | Backend | 9d | Biggest UX lever; drives HITL adoption |
| **16. Dashboard Slack Setup** | Frontend | 1d | Ship Day 9 (after backend OAuth done) |

---

### Sprint 2 Parallel Track F — OWASP Compliance (Day 1–5)
*Depends on: existing policies DB (done)*

| Item | Engineer | Days | Notes |
|------|----------|------|-------|
| **[OWASP backend]** | Backend | 5d | From DESIGN_DEBATE.md spec |
| **14. Dashboard OWASP View** | Frontend | 2d | Start Day 6 (after backend ready) |

---

### Sprint 2 Summary

```
Day 1:  ┌─ Track A: Enterprise Auth starts
        ├─ Track B: In-Process SDK starts
        ├─ Track C: Analytics page starts
        ├─ Track D: Multi-tenancy hardening starts
        ├─ Track E: Slack HITL starts
        └─ Track F: OWASP backend starts

Day 3:  └─ Track D: Multi-tenancy DONE ✅

Day 4:  ├─ Track A: Enterprise Auth DONE ✅
        ├─ Track B: In-Process SDK DONE ✅
        └─ Track C: Analytics DONE ✅ → Onboarding starts

Day 5:  └─ Track F: OWASP backend DONE ✅ → OWASP dashboard starts

Day 7:  └─ Track F: OWASP dashboard DONE ✅

Day 8:  └─ Track C: Onboarding DONE ✅

Day 9:  ├─ Track E: Slack HITL DONE ✅
        └─ Track E: Dashboard Slack Setup DONE ✅

Sprint 2 Complete: ~Day 9 (2 weeks with 2 engineers)
```

**Sprint 2 PARALLEL items (can run simultaneously):**
- Items 4, 3 (different backend domains — auth vs SDK)
- Items 13, 5 (analytics vs infra — different codebases)
- Items 7, OWASP backend (different backend domains)
- Items 13 and 18 are SEQUENTIAL (analytics API needed before onboarding)

**Sprint 2 SEQUENTIAL dependencies:**
- Item 18 (onboarding) starts after Item 13 analytics API ready (Day 4)
- Item 14 (OWASP dashboard) starts after OWASP backend ready (Day 6)
- Item 16 (Slack setup UI) starts after Item 7 backend OAuth ready (Day 8)

---

**Business parallel (Sprint 2 week 1):**
- Show HN post goes live (Tuesday, 9am ET) — trigger: CLI published (Sprint 1 ✅), SSL fixed (Sprint 1 ✅)
- Design partner outreach begins (5 target companies identified, email sequence sent)

---

## Sprint 3: Advanced Features + Self-Hosted + Completion
**Duration:** 2 weeks | **Goal:** Enterprise features, self-hosted deployment, MCP, backlog clearance

### Sprint 3 Parallel Track A — Self-Hosted Docker Compose (Day 1–5)
*Depends on: Item 8 config abstraction (done Sprint 1)*

| Item | Engineer | Days | Notes |
|------|----------|------|-------|
| **23. Docker Compose for Self-Hosted** | Backend/DevOps | 5d | Full spec from DESIGN_DEBATE.md Feature 5 |

---

### Sprint 3 Parallel Track B — MCP Server Policy Enforcement (Day 1–8)
*Depends on: existing evaluate() pipeline (done)*

| Item | Engineer | Days | Notes |
|------|----------|------|-------|
| **[MCP backend]** | Backend | 8d | From DESIGN_DEBATE.md Feature 4 spec |
| **15. Dashboard MCP Management** | Frontend | 2d | Start Day 7 (after MCP backend CRUD ready) |

---

### Sprint 3 Parallel Track C — Multi-Agent A2A Policy Propagation (Day 1–8)
*Depends on: Item 2 Redis (for tool call counter), Item 4 JWT auth (for scoped API keys)*

| Item | Engineer | Days | Notes |
|------|----------|------|-------|
| **[A2A Propagation]** | Backend | 8d | From DESIGN_DEBATE.md Feature 6 spec |

---

### Sprint 3 Parallel Track D — Frontend Polish (Day 1–3)
*No backend dependencies — pure frontend*

| Item | Engineer | Days | Notes |
|------|----------|------|-------|
| **17. Demo Site Mobile Polish** | Frontend | 1d | CSS only; ship early |

---

### Sprint 3 Parallel Track E — SIEM Integrations (Day 1–3)
*Depends on: Item 2 Redis/BullMQ, Item 8 structured logging*

| Item | Engineer | Days | Notes |
|------|----------|------|-------|
| **6. SIEM Integrations (Splunk + Sentinel)** | Backend | 3d | Includes Item 12 fix (already listed as P0 Sprint 1 but if not done, here) |

---

### Sprint 3 Summary

```
Day 1:  ┌─ Track A: Docker Compose self-hosted starts
        ├─ Track B: MCP backend starts
        ├─ Track C: A2A Policy Propagation starts
        ├─ Track D: Mobile Polish starts
        └─ Track E: SIEM integrations starts

Day 1:  └─ Track D: Mobile Polish DONE ✅ (1 day)

Day 3:  └─ Track E: SIEM + Splunk + Sentinel DONE ✅

Day 5:  └─ Track A: Docker Compose self-hosted DONE ✅

Day 7:  ├─ Track B: MCP backend DONE ✅ → MCP dashboard starts
        └─ Track C: A2A DONE ✅

Day 9:  └─ Track B: MCP dashboard DONE ✅

Sprint 3 Complete: ~Day 9 (2 weeks with 2 engineers)
```

**Sprint 3 PARALLEL items:**
- Items 23, MCP, A2A (completely independent domains)
- Item 17 (CSS only — any engineer, any time)
- Item 6 (SIEM — independent backend feature)

**Sprint 3 SEQUENTIAL dependencies:**
- Item 15 (MCP dashboard) starts after MCP backend CRUD ready (Day 7)
- A2A (Item 6 of DESIGN_DEBATE) depends on Item 2 Redis (done Sprint 1) and Item 4 JWT (done Sprint 2)

---

## MASTER SPRINT PLAN TABLE

| # | Item | Priority | Effort | Sprint | Track | Parallel? | Key Dependency |
|---|------|----------|--------|--------|-------|-----------|----------------|
| 20 | Cloudflare Full/Strict SSL | P0 | 0.5h | Sprint 1 | A | ✅ Yes | None |
| 9 | Helmet.js | P0 | 0.5d | Sprint 1 | A | ✅ Yes | None |
| 10 | Request Timeout | P0 | 0.5d | Sprint 1 | A | ✅ Yes | None |
| 12 | Webhook Secret Hashing | P0 | 0.5d | Sprint 1 | A | ✅ Yes | Encryption key in config |
| 21 | Version Bump v0.8.0 | P0 | 1h | Sprint 1 | A | ✅ Yes | None |
| 8 | Structured Logging | P0 | 1.5d | Sprint 1 | B | ✅ Yes | None |
| 1 | Standalone CLI Tool | P0 | 3d | Sprint 1 | C | ✅ Yes | None |
| 2 | Redis Rate Limiter | P0 | 2d | Sprint 1 | D | ✅ Yes | Redis (30-min setup) |
| 11 | Brute-Force Protection | P0 | 0d | Sprint 1 | D | ✅ Yes | Item 2 |
| 19 | API Docs (OpenAPI) | P1 | 2d | Sprint 1 | E | ✅ Yes | None |
| 22 | Update All Docs/Sites | P1 | 2d | Sprint 1 | E | ✅ Yes | Item 19 (soft) |
| 4 | Enterprise Auth (JWT RS256) | P1 | 4d | Sprint 2 | A | ✅ Yes | Item 8 |
| 3 | In-Process SDK (Local Eval) | P1 | 4d | Sprint 2 | B | ✅ Yes | Items 2, 8 |
| 13 | Dashboard Analytics | P1 | 3d | Sprint 2 | C | ✅ Yes | Item 8 |
| 18 | Onboarding Flow | P1 | 3d | Sprint 2 | C | ⚠️ After 13 | Item 13 |
| 5 | Multi-Tenancy Hardening | P1 | 3d | Sprint 2 | D | ✅ Yes | Redis (Item 2) |
| 7 | Slack HITL Integration | P1 | 9d | Sprint 2 | E | ✅ Yes | Item 2 |
| 16 | Dashboard Slack Setup | P1 | 1d | Sprint 2 | E | ⚠️ After 7 | Item 7 |
| OWASP-backend | OWASP Compliance Engine | P1 | 5d | Sprint 2 | F | ✅ Yes | Policies DB |
| 14 | Dashboard OWASP View | P1 | 2d | Sprint 2 | F | ⚠️ After OWASP | OWASP backend |
| 23 | Docker Compose Self-Hosted | P1 | 5d | Sprint 3 | A | ✅ Yes | Item 8 |
| MCP-backend | MCP Policy Enforcement | P1 | 8d | Sprint 3 | B | ✅ Yes | evaluate() pipeline |
| 15 | Dashboard MCP Management | P1 | 2d | Sprint 3 | B | ⚠️ After MCP | MCP backend |
| A2A-backend | Multi-Agent A2A Propagation | P1 | 8d | Sprint 3 | C | ✅ Yes | Items 2, 4 |
| 17 | Demo Site Mobile Polish | P2 | 1d | Sprint 3 | D | ✅ Yes | None |
| 6 | SIEM Integrations | P2 | 3d | Sprint 3 | E | ✅ Yes | Items 2, 8 |
| 7-ML | ML Anomaly Detection | P3 | 3w | Backlog | — | — | 30d production data |
| 24 | Helm Chart | P3 | 5d | Backlog | — | — | Item 23, enterprise customer |

---

## CRITICAL PATH ANALYSIS

```
SPRINT 1 CRITICAL PATH:
  Day 1 ──► SSL (0.5h) ──► DONE
  Day 1 ──► Structured Logging (1.5d) ──► DONE Day 2
           (unblocks Sprint 2 Items 3, 4, 13)
  Day 1 ──► CLI Tool (3d) ──► DONE Day 4 ──► npm publish ──► Show HN trigger

SPRINT 2 CRITICAL PATH:
  Day 1 ──► Enterprise Auth (4d) ──► DONE Day 4
           (unblocks Sprint 3 A2A item which needs scoped JWT)
  Day 1 ──► Slack HITL (9d) ──► DONE Day 9 ──► Sprint 2 gate

SPRINT 3 CRITICAL PATH:
  Day 1 ──► A2A Propagation (8d) ──► DONE Day 8 ──► Sprint 3 gate
  Day 1 ──► MCP Backend (8d) ──► DONE Day 7 ──► MCP Dashboard (2d) ──► DONE Day 9
```

**Longest chain (end-to-end):**
```
Redis (Sprint 1, Day 2) 
  → JWT Auth (Sprint 2, Day 4) 
  → A2A Policy Propagation (Sprint 3, Day 8) 
  = ~5 weeks total
```

---

## SHARED INFRASTRUCTURE REQUIRED BEFORE SPRINT 2

These must be completed in Sprint 1 as they unblock multiple Sprint 2 items:

### 1. Redis Instance
- Add `redis:7-alpine` to Docker Compose
- Configure `REDIS_URL` in environment
- Needed by: Items 2, 3, 5, 7, A2A

### 2. Encryption Key Infrastructure
- `ENCRYPTION_KEY` env var (AES-256-GCM)
- Used by: Item 12 (webhook secrets), Item 7 (Slack tokens), Item 6 (SIEM credentials)
- Generate in `install.sh`; document in `.env.example`

### 3. Config Abstraction (Item 8 deliverable)
```typescript
// src/lib/config.ts
export const config = {
  database: { url: required('DATABASE_URL') },
  redis: { url: required('REDIS_URL') },
  auth: { jwtSecret: required('JWT_SECRET') },
  encryption: { key: required('ENCRYPTION_KEY') },
  detection: {
    lakeraApiKey: optional('LAKERA_API_KEY'),
    presidioUrl: optional('PRESIDIO_URL', 'http://presidio-analyzer:5001'),
  },
  slack: { signingSecret: optional('SLACK_SIGNING_SECRET') },
  license: { key: optional('AGENTGUARD_LICENSE_KEY') },
  telemetry: { enabled: optional('TELEMETRY_ENABLED', 'false') === 'true' },
};
```

### 4. Unified Audit Trail Migration (run once before Sprint 2)
```sql
ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS detection_score FLOAT,
  ADD COLUMN IF NOT EXISTS detection_provider VARCHAR(50),
  ADD COLUMN IF NOT EXISTS detection_category VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pii_entities_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mcp_server_id UUID,
  ADD COLUMN IF NOT EXISTS agent_lineage_ids UUID[],
  ADD COLUMN IF NOT EXISTS slack_user_id VARCHAR(50);
```

---

## RISK REGISTER

| Risk | Likelihood | Impact | Mitigation | Owner |
|------|-----------|--------|-----------|-------|
| Slack OAuth app review delay | Medium | Medium | Submit Slack app review as soon as Slack HITL code is started; review takes 3-7 days | Backend eng |
| Auth0 free tier limits hit during SSO testing | Low | Low | Use Auth0 dev tenant for testing; production auth is Auth0 paid | Backend eng |
| Presidio sidecar increases Docker image size significantly | Medium | Low | Use `presidio-analyzer` slim image; optional sidecar (disabled by default in compose) | Backend eng |
| Redis connection pool exhaustion under load | Medium | High | PgBouncer (Item 5) + Redis connection limit config; load test before Sprint 2 ships | Backend eng |
| CLI false positives on tool detection regex | High | Medium | Build large fixture test suite; allow-list for common false positive patterns | CLI engineer |
| Show HN post lands poorly (low upvotes) | Medium | Medium | Not a blocker for product — design partner outreach is separate channel | Casey/founder |
| Enterprise auth JWKS endpoint rate limits | Low | Medium | Cache JWKS aggressively (1-hour TTL); re-fetch only on unknown `kid` | Backend eng |
| Docker Compose self-hosted config complexity | Medium | Medium | Invest in `install.sh` UX; add `agentguard doctor` command to diagnose config issues | Backend eng |

---

## DEFINITION OF DONE (GLOBAL)

Every item must meet these criteria before marking complete:

- [ ] Code reviewed by at least one other person (or self-review checklist if solo)
- [ ] Tests written and passing (unit + integration minimum)
- [ ] TypeScript strict — no new `any` types
- [ ] No new `console.log` calls (use pino logger after Item 8)
- [ ] Sensitive data (API keys, passwords, PII) not present in any log output
- [ ] Endpoint documented in OpenAPI spec (for API changes)
- [ ] README or docs updated if user-facing behavior changed
- [ ] Migration script written if DB schema changed
- [ ] Deployed to staging and smoke-tested before merging to main

---

## VELOCITY ASSUMPTIONS

| Scenario | Sprint 1 | Sprint 2 | Sprint 3 | Total |
|----------|----------|----------|----------|-------|
| 1 full-stack engineer | 2 weeks | 3 weeks | 3 weeks | ~8 weeks |
| 2 engineers (1 BE + 1 FE) | 1 week | 2 weeks | 2 weeks | ~5 weeks |
| 2 engineers + 1 DevOps | 1 week | 1.5 weeks | 1.5 weeks | ~4 weeks |

**Recommendation:** Two engineers minimum for Sprint 2 — the parallel tracks are genuinely independent and waiting on Slack HITL (9 days) while Auth, SDK, Analytics, and OWASP all block on a single engineer is painful.

---

## SPRINT 1 DAY-BY-DAY PLAN (Prescriptive)

| Day | Engineer 1 (Backend) | Engineer 2 (Frontend/Full) | Business |
|-----|---------------------|--------------------------|----------|
| Mon | SSL + Helmet + Timeout + Webhooks + Version bump (5 items, ~1 day total) | Start API docs generation + Redoc setup | File Pty Ltd incorporation |
| Tue | Start Structured Logging + config.ts + Redis setup | API docs continuing + code examples | — |
| Wed | Structured Logging DONE; Start CLI Tool (regex + pattern matching) | API Docs DONE ✅; Start docs/site updates | File trademark AU |
| Thu | CLI Tool continuing (output formatting + GitHub Actions mode) | Docs/site updates continuing | Draft Show HN post |
| Fri | CLI Tool DONE ✅ → npm publish; Start Redis Rate Limiter | Docs/site updates DONE ✅ | — |
| Mon | Redis Rate Limiter DONE ✅ (includes brute-force) | Review + polish Sprint 1 deliverables | — |

**Sprint 1 ships:** SSL, Helmet, Timeout, Webhook secrets, Version bump, Structured logging, CLI tool, Redis rate limiter + brute force, API docs, Updated docs/sites

---

*Document produced by four-expert planning workshop: Alex (Architect) · Sam (Security) · Dana (UX/Frontend) · Casey (Product/PM)*
*AgentGuard internal planning document — March 2026*
*Next review: end of Sprint 1*
# AgentGuard — Senior Architect Review
## Comprehensive Assessment & Enhancement Roadmap

**Reviewer:** Senior Product Architect (automated review via Forge3/Atlas3)  
**Date:** March 2026  
**Codebase Version:** v0.9.0  
**Baseline Security Review:** SECURITY_REVIEW_V073.md (March 6, 2026)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Assessment](#2-architecture-assessment)
3. [Enhancement Recommendations (Prioritized)](#3-enhancement-recommendations-prioritized)
4. [Product Roadmap — 6 Months](#4-product-roadmap--6-months)
5. [Risk Register](#5-risk-register)

---

## 1. Executive Summary

AgentGuard is a well-conceived runtime security platform with a clear product mission and a technically sound Phase 1 architecture. The codebase demonstrates mature engineering practices: strong TypeScript typing, Zod validation throughout, a clean service-context pattern for multi-tenancy, hash-chained audit integrity, and a proper Policy-as-Code DSL.

**However, the gap between what's documented and what's implemented is material.** The dashboard is a scaffold (7 placeholder cards, no real pages). Key security features have known critical bugs (Slack HITL never fires). The policy engine's condition DSL lacks composability (no AND/OR/NOT). In-process SSE event streaming won't survive horizontal scaling. These are not blocking issues for a focused developer audience, but they are blocking issues for enterprise sales.

**The product is 65% of the way to a credible enterprise security tool.** The remaining 35% is a combination of shipping the dashboard, fixing known security issues, and adding a handful of enterprise-grade features (SSO, audit export, tenant rate limits). The 6-month roadmap below sequences this work to maximize enterprise readiness without sacrificing developer momentum.

**Top 5 concerns in priority order:**

1. 🔴 **Security credibility gap** — A security product with a CRITICAL bug (Slack HITL silently does nothing) and a HIGH-severity SSRF vector cannot be sold to enterprise security teams. Fix these before any enterprise demo.
2. 🔴 **Dashboard is a stub** — The dashboard page.tsx is 85 lines with 6 nav links and no implementations. Every link navigates to a 404. This is the product's face to evaluators.
3. 🟠 **Policy engine expressiveness** — The condition DSL cannot express complex logic (`tool == X AND param.amount > 1000 OR tool == Y`). The `when:` array is AND-only. This limits real-world policy expressiveness.
4. 🟠 **SSE scaling problem** — Real-time events use an in-process connection registry (`Map<tenantId, Map<clientId, client>>`). This fails silently when multiple API instances run — clients on instance A won't receive events published from instance B.
5. 🟡 **JWT secret fallback** — `process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production'` in `auth.ts:13`. If this env var is not set in production, every JWT is signed with a known public key. There is no startup guard preventing this.

---

## 2. Architecture Assessment

### 2.1 Tech Stack Analysis

**Monorepo Structure (Turborepo)**

```
packages/
  api/        — Hono + Prisma + PostgreSQL + Redis (control plane)
  sdk/        — TypeScript SDK (in-process policy engine)
  dashboard/  — Next.js (scaffold only)
  shared/     — Zod schemas + shared types
  cli/        — Scanner CLI
  python/     — Python SDK (LangChain, CrewAI, AutoGen, OpenAI, Vercel AI)
```

**Strengths:**
- Turborepo dependency caching — fast CI builds
- Shared Zod schemas between API and SDK eliminate schema drift
- Python + TypeScript SDKs share a common evaluate API — consistent DX
- Clean `packages/shared` avoids the "publish types separately" anti-pattern

**Weaknesses:**
- `packages/dashboard` is a Next.js shell with zero pages implemented
- `packages/cli` scanner has only 2 test files and limited patterns
- Root `src/` directory appears to be a pre-refactor SDK duplicate that wasn't cleaned up (contains `core/`, `sdk/`, `routes/` at the project root — these seem to be legacy artifacts predating the monorepo restructure)

---

### 2.2 Control Plane (API)

**Framework: Hono on Node.js**

✅ **Good choice.** Hono is lightweight, type-safe, and has native support for Cloudflare Workers/edge deployment if needed in future. The structural routing with `Hono` instances is clean.

**Notable:** The app uses `cors({ origin: '*' })` as the default CORS policy. This is appropriate for a developer SDK product but should be locked down in enterprise deployments (the env var override helps).

**Route Coverage (from app.ts):**
- `/v1/agents` — agent registration and lifecycle
- `/v1/policies` — full CRUD with versioning + compile + test
- `/v1/actions` — evaluate endpoint (the core hot path)
- `/v1/audit` — audit log query
- `/v1/killswitch` — kill switch control
- `/v1/hitl` — human-in-the-loop gates
- `/v1/events` — SSE real-time streaming

The **architecture of the API is sound**. Auth middleware correctly distinguishes JWT (human dashboard users) from ApiKey (agent SDK) paths. ServiceContext is properly injected and propagated.

**Critical gap:** The Packages API (`packages/api`) and the root-level `api/` directory appear to be two separate API codebases. The root-level `api/` directory (referenced in npm scripts: `"dev": "npx tsx api/server.ts"`) is what actually runs in production, while `packages/api` is a newer, cleaner refactor. This is confusing and needs resolution — are these in sync? Which one is deployed?

---

### 2.3 Policy Engine Design Review

**Strengths:**
- Compile-time validation of YAML policy → fail fast on bad policy definitions
- In-process evaluation with micromatch for glob patterns — genuinely sub-10ms
- Correct conflict resolution: `block > require_approval > allow` at same priority
- Monitor rules always accumulate (don't terminate) — correct design
- Rate-limit buckets in-process — works for single-instance, explained correctly

**Critical Gap — Condition Composability:**

The `when:` clause is an implicit AND-list with no OR/NOT operators:

```yaml
# Current DSL — this is AND
when:
  - tool: { matches: ["stripe.*"] }
  - params:
      amount: { gt: 1000 }

# Cannot express:
# (tool == "stripe.charge" AND amount > 1000) OR (tool == "stripe.refund" AND amount > 500)
```

This forces complex policies to be split into multiple rules with adjacent priorities — workable but error-prone and verbose. Real enterprise policies frequently require `OR` logic (e.g., "block if financial tool AND (amount > threshold OR destination is external)").

**Rate-Limit State Distribution:**

The in-process `RateLimitState = Map<string, RateLimitBucket>` correctly works for single-instance deployments but is explicitly noted as a Phase 1 limitation. For multi-instance production deployments, this silently under-counts rate limits. A Redis-backed rate limit is already stubbed in the architecture docs but not implemented.

**Missing Features:**
- No dynamic context variables (e.g., `env.RISK_LEVEL` or `session.userTier`)
- No regex capture groups for parameterized rules
- No policy simulation UI (dry-run with test fixtures only via API)
- No policy inheritance for agent hierarchies (A2A multi-agent patterns)

---

### 2.4 Data Model Assessment

**Schema Quality:** Excellent. The Prisma schema is well-normalized with proper:
- `tenantId` on every model
- Composite indexes `(tenantId, id)` for efficient tenant-scoped queries
- Soft deletes (`deletedAt`) on all entities
- `AuditEvent` hash chain with `prevHash` linking

**Concerns:**

1. **Agent API keys stored in plaintext in `agents` table** — The security review noted this (LOW, pre-existing). Agent keys should be SHA-256 hashed like `ApiKey.keyHash`. A DB dump currently leaks all agent credentials.

2. **PostgreSQL RLS is disabled** — `app.ts` contains:
   ```typescript
   // Note: tenantRLSMiddleware is disabled by default until PostgreSQL RLS is
   // enabled in the database. Uncomment after running migration SQL.
   // app.use('/v1/*', tenantRLSMiddleware);
   ```
   This means tenant isolation relies entirely on application-level `tenantId` filtering. If a query ever omits the tenant filter (developer mistake), data from other tenants would be accessible. This is the classic "N-1 bug waiting to happen."

3. **AuditEvent at scale** — The schema stores audit events in PostgreSQL with no partitioning strategy. At 5M events/day per tenant (per architecture doc estimates), a single `audit_events` table will degrade in query performance within weeks. The ClickHouse migration path is documented for Phase 2, but there's no interim partitioning strategy (PostgreSQL range partitioning by `occurredAt` would help significantly).

---

### 2.5 API Design Review

**Style:** REST with clear resource-based routes. No GraphQL — correct choice for a security product (GraphQL introspection is an attack surface).

**Versioning:** All routes are under `/v1/` — good. But there is no versioning _strategy_ documented (what happens to `/v1/` clients when `/v2/` ships? No deprecation policy, no `Sunset` header).

**Pagination:** Uses cursor-based pagination (`?cursor=<id>`) — correct for audit log queries. But `limit` is capped at 100 with no documented maximum in OpenAPI spec.

**Rate Limiting:** Global rate limiting exists (Redis counters) but:
- No per-tenant rate limit configuration
- No documented rate limit response headers (`X-RateLimit-Remaining`, etc.)
- No per-endpoint differentiation (evaluate endpoint should have different limits than audit query)

**Webhook/Event delivery:** The `AlertWebhook` model exists in the schema but delivery guarantees are unclear. BullMQ is mentioned in the architecture for SIEM push queue, but there's no dead-letter queue, retry policy documentation, or delivery receipt.

---

### 2.6 Frontend Architecture

**Current State: Scaffold Only**

`packages/dashboard/src/app/page.tsx` is 85 lines with:
- A 3×2 grid of `FeatureCard` navigation links
- No actual page implementations (all href links navigate to unimplemented routes)
- No state management (no Zustand, Redux, React Query, or even SWR)
- No API client layer
- No component library

The dashboard is the product's face to enterprise evaluators. In the current state, clicking any navigation card results in a Next.js 404. This is a significant gap.

**What needs to exist (from dashboard page.tsx's own TODO comment):**
- Agent activity feed (WebSocket) — SSE infrastructure exists in API
- Policy violations chart — audit event aggregation endpoint exists
- Kill switch controls — killswitch API exists
- HITL approval queue — hitl API exists
- Audit log viewer — audit API exists

The infrastructure is all there. The frontend simply hasn't been built.

**Recommended Architecture for Dashboard:**
- React Query (TanStack Query) for server state — no Redux needed for this use case
- Real-time events via the existing SSE endpoint (`/v1/events/stream`)
- shadcn/ui or Radix UI + Tailwind for component library (consistent with the existing design system in `design/AGENT_DX_DESIGN.md`)
- Recharts or Tremor for the violations/risk score charts
- No separate state management library beyond React Query's cache

---

### 2.7 Security Posture

**This is critical — AgentGuard IS a security product. Its own security must be flawless.**

#### Known Issues (from SECURITY_REVIEW_V073.md)

| Severity | Issue | Status |
|----------|-------|--------|
| CRITICAL | Slack HITL `sendSlackApprovalRequest` never called — HITL silently does nothing | ❌ Unresolved |
| HIGH | SSRF via Slack `webhookUrl` — any `https://` URL accepted, including AWS IMDS | ❌ Unresolved |
| HIGH | Stale OWASP compliance checks — ASI01/ASI05 return "not_covered" despite features being live | ❌ Unresolved |
| HIGH | Missing `INTEGRATION_ENCRYPTION_KEY` startup guard — production falls back to known dev key | ❌ Unresolved |
| MEDIUM | Slack callback performs DB lookup before HMAC signature verification (ordering oracle) | ❌ Unresolved |
| MEDIUM | TOCTOU race in Slack callback — parallel clicks could both approve | ❌ Unresolved |
| MEDIUM | Telemetry `telemetryRateMap` memory leak — no eviction of old entries | ❌ Unresolved |
| MEDIUM | Compliance report: serial DB calls in `generateOWASPReport` (10-30 round trips) | ❌ Unresolved |
| MEDIUM | Multi-agent GET/DELETE handlers missing try/catch | ❌ Unresolved |

#### Additional Issues Identified in This Review

| Severity | Issue |
|----------|-------|
| HIGH | JWT secret fallback `'dev-secret-change-in-production'` — no startup guard if env var unset |
| HIGH | Agent API keys stored in plaintext in `agents` table — DB dump exposes all credentials |
| HIGH | PostgreSQL RLS disabled — tenant isolation relies entirely on application-level filters |
| HIGH | CORS `origin: '*'` default — appropriate for dev, dangerous if not restricted in production |
| MEDIUM | In-process SSE registry — won't work in multi-instance deployments (clients miss events) |
| MEDIUM | In-process rate-limit state — silently under-counts in multi-instance deployments |
| LOW | Root-level `src/` directory appears to be legacy code duplicate of `packages/sdk/src` |
| LOW | `extractStrings()` in heuristic detection — no depth limit, potential stack overflow |
| LOW | No `Deprecation`/`Sunset` headers for eventual API versioning transitions |

---

### 2.8 Performance & Scalability

**Hot Path (Policy Evaluation):**
- In-process evaluation: ✅ genuinely fast (<10ms p95)
- Redis bundle cache with TTL: ✅ correct architecture
- Async telemetry: ✅ non-blocking

**Scale Concerns:**
1. **SSE with in-process registry** — Single process scales to ~1,000 concurrent SSE connections (Node.js limit). Multi-instance deployment is broken today. Solution: Redis Pub/Sub as the event bus, with each instance subscribing and fanning out to local SSE clients.
2. **Audit event volume** — No table partitioning. PostgreSQL will degrade at >10M rows. Partitioning by month or ClickHouse migration needed before scale.
3. **Rate limit counters** — In-process. Redis-backed rate limiting is already in the architecture; needs to be implemented for multi-instance.
4. **Compliance report** — Serial DB calls (10-30 per report). `Promise.all()` parallelization would fix this.

---

### 2.9 Testing Coverage

**Current state:** 193 passing tests, 67% coverage (per README badges).

**Test distribution:**
- `packages/sdk/src/core/__tests__/policy-engine.test.ts` — policy engine unit tests (solid)
- `tests/unit.test.ts`, `tests/e2e.test.ts` — API integration tests
- `tests/anomaly.test.ts`, `tests/batch-evaluate.test.ts` — feature tests
- `packages/cli/test/` — CLI scanner tests

**Gaps:**
- No dashboard tests (component not built yet)
- No integration tests for Slack HITL (which would have caught the CRITICAL bug)
- No load/performance tests
- No chaos engineering tests (kill switch under network partition, etc.)
- HITL end-to-end flow not tested

**33% uncovered code** at 67% coverage is a material gap for a security product. The uncovered paths are likely the error/edge cases — exactly the paths an attacker would target.

---

## 3. Enhancement Recommendations (Prioritized)

### Category 1: Critical for Credibility

These issues make AgentGuard look insecure or broken. Fix before any enterprise demo.

---

**[C1.1] Fix All CRITICAL/HIGH Security Review Findings**

> *What:* Resolve the 4 unresolved HIGH/CRITICAL issues from SECURITY_REVIEW_V073.md  
> *Why:* A security product with known SSRF and CRITICAL silent-failure bugs cannot be sold to a CISO. Demo failure is guaranteed.  
> *Effort:* S (3-5 days total)  
> *Impact:* H  
> *Dependencies:* None  

Specific fixes required:
1. Wire `sendSlackApprovalRequest` into the evaluate endpoint after `createPendingApproval()`
2. Restrict Slack `webhookUrl` to `https://hooks.slack.com/` prefix only
3. Add startup guard: if `NODE_ENV === 'production'` and `INTEGRATION_ENCRYPTION_KEY` unset, throw and refuse to start
4. Update `checkPromptInjection` (ASI01) and `checkPiiDetection` (ASI05) compliance checker functions to reflect live features

---

**[C1.2] JWT Secret Production Guard**

> *What:* Add startup validation that `JWT_SECRET` env var is set and meets minimum entropy in production  
> *Why:* The current fallback `'dev-secret-change-in-production'` in auth.ts is a known, public string. Any token signed with it is trivially forgeable.  
> *Effort:* S (1 day)  
> *Impact:* H  
> *Dependencies:* None  

```typescript
// On server startup:
if (process.env.NODE_ENV === 'production') {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32 || secret.includes('dev-') || secret.includes('change-in')) {
    throw new Error('FATAL: JWT_SECRET must be set to a strong random secret in production');
  }
}
```

---

**[C1.3] Hash Agent API Keys**

> *What:* Migrate agent API key storage from plaintext to SHA-256 hash (matching the existing `ApiKey.keyHash` pattern)  
> *Why:* A database dump currently leaks all agent credentials. For a security product, this is a critical trust issue.  
> *Effort:* M (3-5 days including migration)  
> *Impact:* H  
> *Dependencies:* Migration script needed for existing agents  

---

**[C1.4] Enable PostgreSQL Row-Level Security**

> *What:* Uncomment `tenantRLSMiddleware` and run the RLS migration SQL  
> *Why:* Application-level tenant filtering is a single point of failure. One missing `tenantScope()` call (developer mistake) leaks cross-tenant data. RLS is the defense-in-depth layer.  
> *Effort:* S (2 days — migration + testing)  
> *Impact:* H  
> *Dependencies:* Staging environment to validate RLS policies  

---

**[C1.5] Implement the Dashboard**

> *What:* Build the 6 core dashboard pages: Agents, Policies, Audit Log, Kill Switch, HITL Queue, Alerts  
> *Why:* Every evaluation begins with "can I see what's happening?" The current scaffold navigates to 404 on every click. This is the product's primary evaluation failure mode.  
> *Effort:* XL (3-4 weeks for full implementation)  
> *Impact:* H  
> *Dependencies:* React Query, component library selection (shadcn/ui recommended)  

Minimum viable dashboard sequence:
1. Audit Log viewer (most impactful — "prove it's working")
2. Kill Switch control (most dramatic — enterprise demos love this)
3. HITL Approval Queue (differentiator)
4. Agent list + status
5. Policy CRUD UI
6. Charts/analytics

---

### Category 2: Policy Engine Enhancements

---

**[P2.1] Add Logical Operators to Policy DSL**

> *What:* Support `when:` blocks with `any:` (OR) and `all:` (AND) nesting, plus `not:` negation  
> *Why:* Real enterprise policies require compound conditions. The current implicit-AND-only DSL forces verbose multi-rule workarounds that are error-prone.  
> *Effort:* M (1-2 weeks)  
> *Impact:* H  
> *Dependencies:* Schema migration (backward-compatible — existing AND-only rules still valid)  

Proposed DSL extension:
```yaml
when:
  any:
    - all:
        - tool: { matches: ["stripe.*"] }
        - params:
            amount: { gt: 1000 }
    - all:
        - tool: { matches: ["transfer.*"] }
        - params:
            destination: { pattern: "acct_ext_*" }
```

---

**[P2.2] Redis-Backed Rate Limit Counters**

> *What:* Replace in-process `RateLimitState` Map with Redis INCR/EXPIRE for rate-limit tracking  
> *Why:* In-process rate limiting silently under-counts in multi-instance deployments. An agent could exceed rate limits by splitting requests across instances.  
> *Effort:* S (2-3 days)  
> *Impact:* M  
> *Dependencies:* Redis (already a dependency)  

---

**[P2.3] Policy Simulation & Visual Debugger**

> *What:* Dashboard UI for policy dry-run — paste a tool call payload and see which rule matches, why, and what the decision would be  
> *Why:* Policy authoring is currently blind. The `POST /policies/:id/test` endpoint exists but has no UI. Visual debugging dramatically reduces policy iteration time and misconfigurations.  
> *Effort:* M (1 week)  
> *Impact:* M  
> *Dependencies:* Dashboard implementation [C1.5]  

---

**[P2.4] Policy Inheritance for Multi-Agent Hierarchies**

> *What:* Allow child agents to inherit parent policies with monotonic restriction (child can only be more restrictive, never less)  
> *Why:* Multi-agent (A2A) architectures are increasingly common. LangGraph, CrewAI multi-agent, and AutoGen all spawn child agents. Without policy inheritance, each child must be manually configured — ops burden scales with fleet size.  
> *Effort:* L (2-3 weeks)  
> *Impact:* H  
> *Dependencies:* A2A agent hierarchy model (already in schema)  

---

**[P2.5] Policy-as-Code Git Integration**

> *What:* GitHub/GitLab webhook to auto-deploy policy changes from a YAML file in the customer's repo  
> *Why:* "Policy as Code" is a core brand promise. Right now it's just "Policy as YAML via API." True Policy-as-Code means the policy lives in the same repo as the agent code, passes PR review, and auto-deploys on merge.  
> *Effort:* M (1-2 weeks)  
> *Impact:* H  
> *Dependencies:* Webhook infrastructure, GitHub App registration  

---

### Category 3: Integration Depth

---

**[I3.1] CrewAI Native Hook Integration**

> *What:* Implement AgentGuard as a proper CrewAI `BaseCallbackHandler` or task callback, not just a pre-execution wrapper  
> *Why:* The current CrewAI integration (`before_tool_execution`) requires manual instrumentation of every tool call. CrewAI's callback system should allow transparent interception.  
> *Effort:* M (1 week)  
> *Impact:* M  
> *Dependencies:* CrewAI v0.80+ callback API  

---

**[I3.2] AutoGen Deep Integration**

> *What:* Implement `agentguard/integrations/autogen.py` as a proper AutoGen agent wrapper that intercepts all `ConversableAgent` tool calls via message hooks  
> *Why:* The AutoGen SDK exists but lacks the deep hook integration of LangChain. AutoGen is gaining significant enterprise adoption for multi-agent workflows.  
> *Effort:* M (1 week)  
> *Impact:* M  
> *Dependencies:* AutoGen 0.4+ API  

---

**[I3.3] LangGraph/LangChain Streaming Support**

> *What:* Support streaming tool calls in the LangChain integration — currently `handleToolStart` is synchronous evaluation but streaming agents may need mid-stream evaluation  
> *Why:* LangGraph is the dominant enterprise orchestration pattern for LangChain. Streaming is the default in production LangGraph deployments.  
> *Effort:* M (1-2 weeks)  
> *Impact:* M  
> *Dependencies:* LangChain streaming callback API  

---

**[I3.4] MCP (Model Context Protocol) First-Class Support**

> *What:* Upgrade the MCP integration beyond basic policy enforcement to include MCP server registry, tool allowlisting via AgentGuard policies, and SSRF protection on MCP server URLs  
> *Why:* MCP is becoming the de facto standard for AI agent tool integration. Early deep support builds vendor lock-in and differentiates from competitors.  
> *Effort:* L (2-3 weeks)  
> *Impact:* H  
> *Dependencies:* SSRF check on server URL registration (HIGH finding from security review must be fixed first)  

---

**[I3.5] OpenTelemetry Export**

> *What:* Emit AgentGuard decisions as OpenTelemetry spans/traces, exportable to Datadog, Honeycomb, Grafana, Jaeger  
> *Why:* Enterprises already have observability stacks. They want AgentGuard data in their existing dashboards, not a new dashboard to learn.  
> *Effort:* M (1 week)  
> *Impact:* M  
> *Dependencies:* `@opentelemetry/sdk-node`  

---

### Category 4: Dashboard & UX

---

**[D4.1] Real-Time Event Streaming Fix**

> *What:* Replace in-process SSE connection registry with Redis Pub/Sub as the event bus  
> *Why:* The current SSE implementation works for single-instance deployments only. Multiple API instances will each have their own registry — clients on instance A miss events published from instance B. This is a silent failure.  
> *Effort:* M (3-5 days)  
> *Impact:* H  
> *Dependencies:* Redis (already a dependency)  

Architecture:
```
API Instance A ──publish──▶ Redis Pub/Sub ──subscribe──▶ API Instance A ──SSE──▶ Browser
                                          ──subscribe──▶ API Instance B ──SSE──▶ Browser
```

---

**[D4.2] HITL Approval Queue — Slack Workflow**

> *What:* Fix the Slack HITL integration and build the HITL approval queue UI in the dashboard  
> *Why:* HITL is a flagship feature. Enterprise security teams won't monitor a dashboard — they need approvals delivered to Slack/Teams where their workflows live. The CRITICAL bug (sendSlackApprovalRequest never called) must be fixed alongside the UI.  
> *Effort:* M (1 week including the bug fix)  
> *Impact:* H  
> *Dependencies:* [C1.1] security fix, dashboard implementation  

---

**[D4.3] Compliance Report PDF Export**

> *What:* One-click PDF export of the OWASP Agentic Security Top 10 compliance report  
> *Why:* This is the enterprise sales accelerant. A CISO can attach a PDF to their security review package. The compliance checker already exists — it just needs correct data (fix [C1.1]) and a PDF renderer.  
> *Effort:* S (2-3 days)  
> *Impact:* H  
> *Dependencies:* Compliance checker bug fix ([C1.1]), `puppeteer` or `react-pdf`  

---

**[D4.4] Onboarding Flow — 5 Minutes to First Evaluate**

> *What:* Interactive onboarding wizard: API key creation → SDK install → first evaluate → see it in the dashboard  
> *Why:* Developer adoption hinges on the first 5 minutes. The ENGINEERING_ROADMAP.md consensus identifies this as a deal-breaker for evaluations.  
> *Effort:* M (1 week)  
> *Impact:* H  
> *Dependencies:* Dashboard implementation  

---

### Category 5: Enterprise Readiness

---

**[E5.1] SSO / SAML 2.0**

> *What:* Support SAML 2.0 and OIDC SSO for enterprise identity providers (Okta, Azure AD, Google Workspace)  
> *Why:* Enterprise IT mandates SSO. Without it, every user needs a separate AgentGuard account — a non-starter for any company with >100 employees. This is a hard gate for regulated enterprise deals.  
> *Effort:* L (2-3 weeks)  
> *Impact:* H  
> *Dependencies:* `passport-saml` or Auth0/Clerk for managed SSO  

---

**[E5.2] Audit Trail Export**

> *What:* Export audit events as CSV, JSON, or JSON-LD with full hash chain for external auditors  
> *Why:* The hash-chained audit trail is a differentiator, but auditors need to consume it externally. Without export, the integrity proof stays locked in the product.  
> *Effort:* S (1-2 days)  
> *Impact:* H  
> *Dependencies:* Streaming export (S3 pre-signed URL for large exports)  

---

**[E5.3] Per-Tenant Rate Limit Configuration**

> *What:* Allow enterprise tenants to configure their own rate limit thresholds via the API  
> *Why:* Enterprise SLA discussions require configurable limits. One-size-fits-all global limits are a blocker for large-volume customers.  
> *Effort:* S (1 day — schema already supports it via TenantPlan)  
> *Impact:* M  
> *Dependencies:* Redis rate limiting implementation  

---

**[E5.4] SCIM Provisioning**

> *What:* SCIM 2.0 endpoint for automated user provisioning/deprovisioning from enterprise directories  
> *Why:* Enterprises use SCIM to manage access automatically. Without it, user management is manual — a security risk (employees who leave remain active) and an ops burden.  
> *Effort:* M (1 week)  
> *Impact:* M  
> *Dependencies:* [E5.1] SSO integration  

---

**[E5.5] Data Residency — Multi-Region Support**

> *What:* Deploy control plane in EU (Frankfurt) and APAC (Singapore) regions, with tenant data pinned to their configured region  
> *Why:* EU enterprises (GDPR) and APAC enterprises (data sovereignty) cannot use a US-only SaaS for processing agent action telemetry. The schema already has `dataResidencyRegion` — needs infrastructure to back it.  
> *Effort:* XL (4-6 weeks)  
> *Impact:* H  
> *Dependencies:* AWS infrastructure in multiple regions, Terraform/Pulumi IaC  

---

### Category 6: API

---

**[A6.1] API Versioning Strategy**

> *What:* Document and implement API versioning policy: lifecycle of `/v1/`, migration path to `/v2/`, `Deprecation` and `Sunset` response headers  
> *Why:* Without a versioning strategy, any breaking change forces immediate migration from all SDK users. This becomes increasingly painful as the SDK user base grows.  
> *Effort:* S (2 days — policy document + header middleware)  
> *Impact:* M  
> *Dependencies:* None  

---

**[A6.2] Rate Limit Response Headers**

> *What:* Return standard `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers on all API responses  
> *Why:* SDK clients need rate limit feedback to implement backoff. Without headers, clients hit 429s without warning.  
> *Effort:* S (1 day)  
> *Impact:* M  
> *Dependencies:* Redis rate limiting  

---

**[A6.3] Webhook Delivery Guarantees**

> *What:* Implement at-least-once webhook delivery with exponential backoff, dead-letter queue, and delivery receipts  
> *Why:* The `AlertWebhook` model exists but delivery semantics are undefined. Enterprise customers expect webhooks to be reliable — missed HITL notifications are a security incident.  
> *Effort:* M (1 week)  
> *Impact:* M  
> *Dependencies:* BullMQ (already referenced in architecture)  

---

**[A6.4] GraphQL Subscription for Real-Time Events (Alternative to SSE)**

> *What:* Evaluate replacing SSE with a GraphQL subscription endpoint for real-time dashboard events  
> *Why:* GraphQL subscriptions over WebSocket have better client library support (Apollo, urql) and more explicit schema contracts. SSE is simpler but less composable for a rich dashboard.  
> *Effort:* L (2-3 weeks)  
> *Impact:* L (SSE is fine if Redis Pub/Sub fix [D4.1] is implemented)  
> *Dependencies:* [D4.1] Redis event bus  
> *Note:* Only pursue this if [D4.1] proves insufficient. SSE with Redis Pub/Sub is the simpler path.  

---

### Category 7: Infrastructure

---

**[Inf7.1] Kubernetes Helm Chart**

> *What:* Provide a production-grade Kubernetes Helm chart for self-hosted enterprise deployments  
> *Why:* The Docker Compose self-hosted option covers small teams. Enterprise infrastructure teams deploy on Kubernetes. Without a Helm chart, self-hosted enterprise is not viable.  
> *Effort:* L (2-3 weeks)  
> *Impact:* H  
> *Dependencies:* Self-hosted Docker Compose is already working (good starting point)  

---

**[Inf7.2] PostgreSQL Audit Event Table Partitioning**

> *What:* Add PostgreSQL range partitioning on `audit_events` by `occurred_at` (monthly partitions)  
> *Why:* At 5M events/day per tenant, an unpartitioned table will degrade in 2-4 weeks of production use. Partition pruning is critical for audit log query performance.  
> *Effort:* M (1 week — migration + testing)  
> *Impact:* H  
> *Dependencies:* Staging environment with representative data volume  

---

**[Inf7.3] OpenTelemetry Infrastructure Instrumentation**

> *What:* Instrument the API with OpenTelemetry traces and metrics, export to Prometheus/Grafana or Datadog  
> *Why:* The product has no observability of its own performance. SLA guarantees (99.9% uptime) are impossible to verify without instrumentation. P99 latency on the evaluate endpoint needs monitoring.  
> *Effort:* M (1 week)  
> *Impact:* H  
> *Dependencies:* None  

---

**[Inf7.4] High-Availability Configuration**

> *What:* Document and test HA configuration: PostgreSQL RDS Multi-AZ, Redis Sentinel (3-node), API pod replication (3+), load balancer health checks  
> *Why:* Enterprise SLA (99.9%) requires HA. The architecture doc specifies Multi-AZ and Redis Sentinel but there's no evidence these are deployed or tested.  
> *Effort:* M (1-2 weeks)  
> *Impact:* H  
> *Dependencies:* Infrastructure provisioning, chaos testing  

---

**[Inf7.5] Dependency Security Scanning**

> *What:* Integrate `npm audit`, `pip-audit`, and Snyk/Dependabot into CI pipeline with blocking on HIGH/CRITICAL CVEs  
> *Why:* The ESLint config includes `eslint-plugin-security` for code scanning but there's no dependency vulnerability scanning in CI. A known-vulnerable dependency in a security product is particularly damaging to credibility.  
> *Effort:* S (1 day)  
> *Impact:* H  
> *Dependencies:* CI pipeline (GitHub Actions already referenced)  

---

## 4. Product Roadmap — 6 Months

### Month 1–2: Foundation & Credibility

**Goal:** Fix all known security issues, build the dashboard, and make the product demo-able to enterprise evaluators.

#### Sprint 1 (Weeks 1–2): Security Emergency Fixes
| Task | Category | Effort | Owner |
|------|----------|--------|-------|
| Fix Slack HITL critical bug | C1.1 | S | Backend |
| Fix SSRF in Slack webhookUrl | C1.1 | S | Backend |
| Add JWT_SECRET production startup guard | C1.2 | S | Backend |
| Add INTEGRATION_ENCRYPTION_KEY startup guard | C1.1 | S | Backend |
| Fix stale OWASP compliance checks | C1.1 | S | Backend |
| Enable PostgreSQL RLS | C1.4 | S | Backend |
| Dependency vulnerability scanning in CI | Inf7.5 | S | DevOps |

#### Sprint 2 (Weeks 3–4): Dashboard Foundation
| Task | Category | Effort | Owner |
|------|----------|--------|-------|
| Dashboard: Audit log viewer | C1.5 | M | Frontend |
| Dashboard: Kill switch controls | C1.5 | S | Frontend |
| Fix SSE Redis Pub/Sub event bus | D4.1 | M | Backend |
| Hash agent API keys | C1.3 | M | Backend |
| Audit trail CSV/JSON export | E5.2 | S | Backend |

#### Sprint 3 (Weeks 5–6): Dashboard Core & Policy UX
| Task | Category | Effort | Owner |
|------|----------|--------|-------|
| Dashboard: HITL approval queue + Slack delivery | D4.2 | M | Full-stack |
| Dashboard: Agent list + status | C1.5 | M | Frontend |
| Dashboard: Policy CRUD UI | C1.5 | M | Frontend |
| Compliance report PDF export | D4.3 | S | Full-stack |
| Onboarding flow | D4.4 | M | Full-stack |

#### Sprint 4 (Weeks 7–8): Security & Stability Hardening
| Task | Category | Effort | Owner |
|------|----------|--------|-------|
| PostgreSQL audit event partitioning | Inf7.2 | M | Backend |
| Per-tenant rate limit configuration | E5.3 | S | Backend |
| Rate limit response headers | A6.2 | S | Backend |
| API versioning strategy + headers | A6.1 | S | Backend |
| Redis-backed rate limit counters | P2.2 | S | Backend |
| OpenTelemetry API instrumentation | Inf7.3 | M | DevOps |
| Fix telemetry rate map memory leak | C1.1 | S | Backend |

**Month 1–2 Milestone:** Product is demo-safe for enterprise evaluations. Dashboard shows real data. All known security issues are resolved. Audit trail is exportable.

---

### Month 3–4: Feature Differentiation

**Goal:** Build the features that differentiate AgentGuard from "just another policy engine" — policy composability, deep integrations, and enterprise access controls.

#### Sprint 5 (Weeks 9–10): Policy Engine Enhancement
| Task | Category | Effort | Owner |
|------|----------|--------|-------|
| Policy DSL logical operators (OR/AND/NOT) | P2.1 | M | Core |
| Policy simulation / visual debugger in dashboard | P2.3 | M | Full-stack |
| Policy-as-Code Git webhook integration | P2.5 | M | Backend |
| Dashboard: Policy violations chart | C1.5 | M | Frontend |

#### Sprint 6 (Weeks 11–12): Integration Depth
| Task | Category | Effort | Owner |
|------|----------|--------|-------|
| CrewAI native callback handler | I3.1 | M | SDK |
| AutoGen deep integration | I3.2 | M | SDK |
| LangGraph streaming support | I3.3 | M | SDK |
| OpenTelemetry span export from SDK | I3.5 | M | SDK |

#### Sprint 7 (Weeks 13–14): MCP & Enterprise Access
| Task | Category | Effort | Owner |
|------|----------|--------|-------|
| MCP first-class support (with SSRF fix) | I3.4 | L | Backend |
| SSO / OIDC integration | E5.1 | L | Backend |
| Webhook delivery guarantees (BullMQ DLQ) | A6.3 | M | Backend |

#### Sprint 8 (Weeks 15–16): Policy Inheritance & HA
| Task | Category | Effort | Owner |
|------|----------|--------|-------|
| Policy inheritance for A2A agents | P2.4 | L | Backend |
| HA configuration testing + docs | Inf7.4 | M | DevOps |
| Kubernetes Helm chart (initial) | Inf7.1 | L | DevOps |

**Month 3–4 Milestone:** Policy engine is enterprise-grade (composable conditions, Git-native). Deep integrations with all major frameworks. SSO enables enterprise account management. Kubernetes Helm chart enables regulated-industry self-hosting.

---

### Month 5–6: Enterprise & Scale

**Goal:** Close the enterprise readiness gap — SCIM, multi-region, compliance certifications in progress, scale validation.

#### Sprint 9 (Weeks 17–18): Compliance & Audit
| Task | Category | Effort | Owner |
|------|----------|--------|-------|
| SCIM 2.0 provisioning | E5.4 | M | Backend |
| SOC 2 Type I evidence collection (start) | — | — | Founder |
| Third-party penetration test | — | — | Founder |
| Enhanced audit log: tamper-proof export for auditors | E5.2 | M | Backend |

#### Sprint 10 (Weeks 19–20): Multi-Region Infrastructure
| Task | Category | Effort | Owner |
|------|----------|--------|-------|
| EU data residency deployment (AWS Frankfurt) | E5.5 | XL | DevOps |
| Tenant data residency configuration UI | E5.5 | M | Frontend |
| Kubernetes Helm chart: production hardening | Inf7.1 | M | DevOps |

#### Sprint 11 (Weeks 21–22): Scale Validation
| Task | Category | Effort | Owner |
|------|----------|--------|-------|
| Load testing: evaluate endpoint at 10K RPM | — | M | QA |
| Load testing: SSE at 1K concurrent connections | — | M | QA |
| Chaos testing: kill switch under Redis failure | — | M | QA |
| ClickHouse migration spike (audit events at scale) | — | M | Backend |

#### Sprint 12 (Weeks 23–24): Enterprise Dashboard
| Task | Category | Effort | Owner |
|------|----------|--------|-------|
| Multi-tenant admin console (for internal use) | — | L | Full-stack |
| Usage analytics dashboard (per-tenant billing data) | — | M | Full-stack |
| SLA monitoring dashboard | — | M | Full-stack |
| API documentation polish + interactive playground | — | M | Docs |

**Month 5–6 Milestone:** Fully enterprise-ready product. Multi-region deployed. SCIM provisioning live. SOC 2 Type I report completed. Helm chart for regulated-industry customers. Load-validated at production scale.

---

## 5. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Enterprise demo fails due to unresolved security bugs | H | H | Sprint 1 is dedicated to security fixes — no demo until complete |
| Dashboard scaffold blocks enterprise evaluation | H | H | Sprint 2-3 priority |
| In-process SSE breaks under horizontal scale | H | M | Sprint 2 fix [D4.1] |
| Agent key DB dump exposes all credentials | M | H | Sprint 2 fix [C1.3] |
| RLS disabled — cross-tenant data leak via developer bug | M | H | Sprint 1 fix [C1.4] |
| Policy engine rate limits silently under-count in multi-instance | M | M | Sprint 4 fix [P2.2] |
| Audit event table performance degrades at scale | M | H | Sprint 4 fix [Inf7.2] |
| Competitor builds deeper LangGraph integration first | M | H | Sprint 6 fast-follow |
| SOC 2 process takes longer than 3 months | H | M | Start now; use "SOC 2 In Progress" letter for pilots |
| JWT secret fallback in production | L | H | Sprint 1 fix [C1.2] — low likelihood if deployment is careful, but catastrophic if exploited |

---

## Appendix: Quick Wins (< 1 Day Each)

These are small fixes with high credibility impact that can be done immediately:

1. **Remove root-level `src/` legacy code** — this duplicate of `packages/sdk/src` is confusing and a maintenance liability
2. **Fix CORS `origin: '*'` default** — add warning log if running in production with wildcard CORS
3. **Add `extractStrings()` depth limit** — prevent potential stack overflow in heuristic detection
4. **Remove unused `randomUUID` import in compliance.ts**
5. **Fix `tenantId ?? 'demo'` dead code in mcp-policy.ts**
6. **Add startup log that lists all active environment variables (redacted)** — makes deployment debugging much easier
7. **Add `/v1/health/ready` liveness vs. readiness distinction** — current `/v1/health` returns 200 even if DB is down

---

*Review completed by Forge3 (Senior Architect mode) on behalf of Atlas3 fleet.*  
*Output: `docs/ARCHITECT_REVIEW.md`*

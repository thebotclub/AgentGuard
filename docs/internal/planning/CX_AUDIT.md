# AgentGuard — Customer Experience & End-to-End Value Audit

**Date:** 2026-04-18  
**Auditor:** Senior Product Auditor (DX, Customer Journey, E2E Value)  
**Scope:** `/home/node/AgentGuard` — current branch  
**Brutally honest. Each dimension scored 1–10.**

---

## Executive Summary

AgentGuard is a product with **genuine technical depth and a compelling value proposition** — runtime security for AI agents is a real problem with few credible solutions. The core engine, SDK, audit trail, and API are well-built. The README and quickstart docs are above-average for this stage.

However, the project suffers from **documentation sprawl, a vanilla JS dashboard that undermines the enterprise pitch, a confusing file structure with multiple doc sites, and several gaps in the self-serve customer journey**. A security team evaluating this would be impressed by the specs but frustrated by the lack of a clear "try → buy → deploy" path.

**Overall: 6.5/10** — Strong bones, needs muscle.

---

## 1. Getting Started (First-Time User Experience)

**Score: 7/10**

### What Works
- **README is strong.** Clear problem statement ("one jailbroken prompt can exfiltrate your database"), immediate code examples in both TypeScript and Python, badges with live links. The architecture diagram (ASCII) is instant-context.
- **Quickstart guide exists** (`vitepress-docs/getting-started/quickstart.md`) and is genuinely well-written. Covers sign-up → first curl → SDK install → understanding decisions → batch evaluate → common first-time issues. This is above-average.
- **SDK package is published** to both npm and PyPI. `npm install @the-bot-club/agentguard` actually works.
- **Python SDK is zero-dependency** — pure stdlib. This is a genuine differentiator for security-conscious teams.
- **Demo playground** at `demo.agentguard.tech` — lets users try before signing up.

### What's Missing
- **The README quickstart is misleading.** It shows `new AgentGuard({ apiKey: process.env.AG_API_KEY })` but doesn't tell you WHERE to get that key. You have to infer "sign up at agentguard.tech" from a later section. First 10 seconds matter — lead with the key step.
- **`npm i` → copy-paste → run is NOT 10 minutes.** The user needs to: create an account, get an API key, understand the four decision types, and realize the default policy is permissive (everything returns `allow`). The quickstart mentions this but buries it under "Common First-Time Issues." It should be in Step 2.
- **No `npx @the-bot-club/agentguard init` or similar scaffolding.** For a DX product, an init command that creates a sample policy file and `.env` template would dramatically reduce friction.
- **Self-hosted path is separate.** The `self-hosted/` directory has its own README, docker-compose, and setup script. But the main README's self-hosted section just says `docker-compose up -d`. These two paths (cloud vs self-hosted) are not reconciled, and a new user has to figure out which one they want.

### Specific Issues
1. README shows `input: { query: 'DROP TABLE users' }` but the SDK method signature uses `tool`/`action`/`input` while the getting-started guide uses `tool`/`params`. **API inconsistency in the first 5 lines.**
2. The docs site quickstart says "no credit card required" — but the pricing table shows Enterprise at $499/mo. Where's the trial-to-paid transition doc?
3. No "copy to clipboard" buttons on code examples in the docs.

---

## 2. Documentation Quality

**Score: 5/10**

### What Works
- **Architecture doc** (`docs/ARCHITECTURE.md`) is comprehensive — 27KB, diagrams, design principles, technology choices, security model. This is genuinely good internal documentation.
- **Feature Matrix** (`docs/FEATURE_MATRIX.md`) maps every feature to spec → implementation → tests → status. Extremely useful for understanding what's real vs aspirational.
- **API docs** — 7,170-line OpenAPI spec with Swagger UI. This is serious.
- **Self-hosted guide** (`docs/SELF_HOSTED.md`) covers TLS, backup, monitoring, troubleshooting, and security hardening. Thorough.
- **Enterprise docs** — SOC 2 readiness assessment, SLA, SSO audit, security policies. This shows enterprise ambition.

### What's Broken
- **Three separate documentation sites with overlapping content:**
  1. `docs/` — 20+ markdown files (architecture, runbooks, feature matrix)
  2. `vitepress-docs/` — VitePress-powered docs site (getting-started, API, integrations)
  3. `docs-site/` — Another docs site with blog posts and guides
  
  A customer doesn't know which to read. The landing page links to `docs.agentguard.tech` (presumably vitepress-docs), but the repo has 30+ markdown files that are NOT in vitepress-docs. Critical docs like RUNBOOK.md, SECURITY_HARDENING.md, HIGH_AVAILABILITY.md are only in `docs/` and may not be published.
- **Onboarding directory has no onboarding content.** `docs/onboarding/` contains two files: an email draft and a person's bio. This is not onboarding documentation.
- **No conceptual "How It Works" page** in the public docs. The architecture overview exists but is deep in `vitepress-docs/architecture/`. A new user needs a 30-second explainer before the quickstart.
- **Blog posts in `docs/blog/`** are not in the vitepress docs site. They're orphaned in the repo.
- **No changelog.** `CHANGELOG.md` does not exist. For a product at v0.9.2, this is a gap.
- **INCONSISTENT_VERSIONS:** Package.json says `0.9.2`, SDK package.json says `0.10.0`, docs reference `v0.9.0`, and the badge says `v0.10.0`. Pick one.

### Specific Issues
1. `vitepress-docs/guide/getting-started.md` and `vitepress-docs/getting-started/quickstart.md` cover the same material differently. Which is canonical?
2. The VitePress docs site only has 17 markdown files. The `docs/` directory has 30+. Many important docs (DATA_ISOLATION, DEPLOYMENT_ENFORCEMENT_ARCH, ENGINEERING_ROADMAP) are not surfaced to customers.
3. No search functionality mentioned for the docs site.

---

## 3. Developer Experience (DX)

**Score: 7/10**

### What Works
- **TypeScript types are excellent.** `packages/sdk/src/core/types.ts` — 400+ lines, all Zod schemas with inferred types. Runtime validation and static types stay in sync. This is how it should be done.
- **Error hierarchy is well-designed.** `ServiceError` base with typed subclasses (`NotFoundError`, `ValidationError`, `PolicyError`) and factory methods (`PolicyError.denied()`, `PolicyError.rateLimited()`). Each error has `httpStatus`, `code`, and `details`. The `isRetryable()` and `isSecurityBlock()` helpers are thoughtful.
- **SDK API surface is clean.** The main `AgentGuard` class has ~20 methods, all clearly named. The README's API reference table maps every method to its purpose.
- **Framework integrations are comprehensive:** LangChain, OpenAI, CrewAI, AutoGen, Express, Fastify, Vercel AI SDK, LangGraph, MCP, OpenClaw, A2A. That's 11 integrations. Each is a separate file in `packages/sdk/src/integrations/`.
- **Policy DSL is YAML-based** with clear semantics (rules, priorities, conditions, severity, budgets). Example policies for devops, finance, and support agents are provided.
- **Zero-dependency Python SDK.** Pure stdlib `urllib`. No version conflicts possible. This matters enormously for security tooling.

### What's Missing
- **SDK `evaluate()` API has inconsistent parameter naming.** README uses `{ tool, action, input }`. Getting-started uses `{ tool, params }`. Quickstart uses `{ tool, action, input }`. The actual client code should be the authority — the docs should match it exactly.
- **No TypeScript strict mode guarantee.** `tsconfig.json` exists but no `strict: true` confirmation visible.
- **No debug/verbose mode.** When a developer's evaluation returns an unexpected result, they have no way to see WHICH rule matched and WHY beyond the `matchedRuleId`. A `debug: true` option that returns rule evaluation trace would save hours.
- **No SDK middleware for popular frameworks beyond Express/Fastify.** A Koa, NestJS, or Hono middleware would expand reach.
- **`PolicyEngine` (local) requires manually constructing a `PolicyBundle` object.** The README shows this but it's ~40 lines of JSON. There should be a `PolicyBundle.fromYaml()` loader or at least a `new PolicyEngine.fromYamlFile(path)` convenience method.
- **No OpenTelemetry integration.** For a product targeting enterprise security teams, distributed tracing is table stakes.

### Specific Issues
1. The SDK README shows `decision.result === 'block'` but the getting-started guide shows `decision.decision === 'block'`. Which is it? (Likely `result` based on the types.)
2. `AgentGuardBlockError` is mentioned in integration docs but not exported from the main index in a discoverable way.
3. No `agentguard.config.ts` / `agentguard.config.yaml` convention for project-level configuration.

---

## 4. Product Completeness

**Score: 7/10**

### What Works (Substantial)
- **Policy evaluation engine** — YAML DSL with conditions (tool matching, param constraints, data class, time windows, budgets), priority-based resolution, four actions (allow/block/monitor/require_approval). 50+ built-in rules.
- **Tamper-evident audit trail** — SHA-256 hash chain with verification endpoint. This is a genuine differentiator.
- **Kill switch** — Tenant and agent-level. Redis-backed for multi-instance.
- **Prompt injection detection** — Heuristic pattern matching with Lakera Guard adapter option.
- **PII detection & redaction** — 9 entity types, scan/redact/mask policies.
- **Batch evaluate** — Up to 50 calls in one request.
- **HITL via Slack** — Approval routing with atomic accept/deny.
- **MCP middleware** — Proxy and enforce policies on MCP server sessions.
- **Agent hierarchy (A2A)** — Parent/child agent modeling with policy inheritance.
- **Compliance templates** — EU AI Act, SOC 2, OWASP Top 10 for Agentic AI, APRA CPS 234.
- **SIEM export** — Splunk, Elastic, Datadog.
- **60+ API endpoints** — Full CRUD for agents, policies, webhooks, rate limits, costs, audit.
- **SCIM provisioning** — Enterprise user management.
- **SSO/SAML** — Enterprise authentication.

### What's Gaps
- **Default policy is permissive.** A new user's first evaluate returns `allow` for everything. The "value moment" — seeing a threat get blocked — requires uploading a custom policy first. This should be flipped: default policy should BLOCK destructive actions (shell_exec with rm, DROP TABLE, etc.) out of the box.
- **Dashboard is vanilla HTML/JS (4,462 lines across 3 files).** For a product targeting enterprise security buyers, the dashboard being a single `index.html` with inline JavaScript undermines credibility. It works, but it doesn't look like a product that costs $499/mo.
- **No real-time updates.** The dashboard polls the API (no SSE/WebSocket). The feature matrix shows "Real-time dashboard SSE" as 🔜 Planned. For a monitoring product, this is a gap.
- **No user management UI.** SCIM and SSO are implemented at the API level, but there's no UI to manage users, roles, or permissions in the dashboard.
- **Compliance reports are mentioned but the PDF export is 🔜 Planned.** SOC 2 readiness assessment exists as a doc, but the platform can't generate audit-ready compliance evidence.
- **Policy editor in the dashboard** — exists as a YAML editor but has no validation feedback, no schema autocomplete, and no visual rule builder.

### Specific Issues
1. The dashboard hardcodes `v0.9.0` in the sidebar footer. Version mismatch with SDK (v0.10.0).
2. Dashboard stores API key in `sessionStorage` — functional but no indication of this to the user. Enterprise security teams will flag this.
3. No RBAC in the dashboard. All users with an API key see everything.

---

## 5. Customer Journey (Evaluation → Trial → Production)

**Score: 5/10**

### What Works
- **Free tier is generous.** 100K events/month, 3 agent seats, 7-day retention. No credit card. This is a solid trial.
- **Pricing page exists** with clear tiers (Free / Pro / Enterprise).
- **Demo playground** requires no signup. Good for top-of-funnel.
- **Self-hosted option** with Docker Compose and Helm charts. Important for security-sensitive customers who can't send data to SaaS.
- **Multiple deployment options:** Docker Compose, Helm, Azure Container Apps, manual.

### What's Broken
- **No guided onboarding flow.** After sign-up, the user is dropped into the dashboard with an API key input field. There's no "Set up your first agent" wizard, no policy editor walkthrough, no sample data to explore.
- **No in-product value demonstration.** The dashboard shows "API warming up" and "Enter your API key." If I'm a CISO evaluating this, I want to SEE it block something immediately — without reading docs.
- **Trial-to-paid transition is undefined.** What happens at 100K events? The self-hosted README says "HTTP 402 with upgrade prompt." But the main README doesn't mention this. How does a customer upgrade? Is there a Stripe checkout? A sales contact form?
- **No ROI calculator or value proposition framework.** A security team needs to justify this purchase. "How much does an AI agent breach cost?" → "AgentGuard prevents that for $149/mo." This narrative exists in blog posts but not as a sales tool.
- **No case studies or testimonials.** For a B2B security product, this is a significant gap.
- **Enterprise sales path is unclear.** $499/mo Enterprise tier — but there's no "Contact Sales" button, no enterprise onboarding guide, no security questionnaire pre-fill, no penetration test report sharing.
- **License enforcement is mentioned** (`AGENTGUARD_LICENSE_KEY`) but the mechanism is opaque. Self-hosted customers need to understand what happens when their license expires.
- **No migration guide** from competitive products (there aren't many, but "Why AgentGuard vs X" comparisons help).

### Specific Issues
1. The self-hosted free tier says 7-day audit retention. The cloud free tier says 30 days. These should match or the discrepancy should be explained.
2. No SLA for the free tier (expected) — but the Pro tier also has no SLA listed in the README (only Enterprise shows 99.9%). Is there a Pro SLA?
3. The blog post "Why Your Agent Needs Security" (001) is a good top-of-funnel piece but there's no clear CTA at the end linking to signup.

---

## 6. Operational Readiness

**Score: 7/10**

### What Works
- **Health checks** — `/health` (basic) and `/health/detailed` (component-level with DB latency). Returns 503 on degradation. Proper k8s probe format.
- **Prometheus metrics** — Custom `MetricsRegistry` with counters, gauges, and histograms. Exposes `/metrics` endpoint. Tracks request counts, durations, active connections, errors. Proper Prometheus exposition format.
- **Rate limiting** — In-memory sliding window on the evaluate hot path. Redis-backed signup rate limiting. Configurable per-tenant and per-agent.
- **Security middleware** — Helmet (headers), CORS, CSRF protection, JWT auth, API key auth with bcrypt hashing, RLS tenant isolation.
- **Structured logging** — Pino with request logger middleware. SDK correlation headers (X-Trace-ID).
- **Docker Compose** with health checks on all services (Postgres, Redis, API, Dashboard, Worker). Proper `depends_on` with `service_healthy`.
- **Helm charts** for Kubernetes deployment.
- **CI/CD pipeline** — GitHub Actions with: npm audit (HIGH+CVEs block deploy), TypeScript typecheck, OpenAPI spec sync check, unit tests with coverage, E2E tests.
- **Azure Monitor alerting** — 10 rules configured via Terraform.
- **Runbook** exists (`docs/RUNBOOK.md`).
- **Backup/restore** documented in self-hosted guide.

### What's Gaps
- **No Grafana dashboards provided.** Metrics are exposed but there's no pre-built Grafana dashboard JSON for customers to import.
- **Redis health not checked in the detailed health endpoint.** Only database health is verified. Redis being down would silently degrade kill switch and rate limiting.
- **No circuit breaker.** If the database is slow, every request waits. No timeout or degradation strategy visible.
- **No backup automation.** Backup is documented as a manual process. For production, automated daily backups with retention policy are expected.
- **No disaster recovery doc.** Runbook exists but DR scenario (total datacenter loss, failover to another region) is not covered.
- **No multi-region deployment guide.** Azure Container Apps + single PostgreSQL instance = single region. Enterprise customers will ask about multi-region.
- **No load testing results shared.** A `load-tests/` directory exists but no published benchmarks for "N evaluations/sec at P99 latency."
- **No SLOs defined.** What's the target latency? What's the error budget? These aren't documented.

### Specific Issues
1. The `/health/detailed` endpoint doesn't check Redis. But Redis is critical for kill switch and rate limiting. This is a monitoring gap.
2. Docker Compose worker healthcheck hits port 3001 (dashboard) instead of the worker's own port. This check will never fail correctly.
3. No `node_exporter` or `cAdvisor` in the Docker Compose for basic host metrics.

---

## 7. Code Quality from a Customer Perspective

**Score: 6/10**

### What Works
- **Monorepo structure is clean.** `packages/sdk/`, `packages/python/`, `packages/compliance/`, `packages/shared/` — clear separation.
- **API layer is well-organized.** `api/routes/` has 40+ route files, each focused. `api/middleware/` has 13 middleware files. `api/services/` separates business logic.
- **`IDatabase` interface** allows swapping SQLite/PostgreSQL. The implementation files (db-postgres.ts, db-sqlite.ts) are large but the abstraction works.
- **Type safety is strong.** Zod schemas on all API endpoints (17 schemas in `api/schemas.ts`). TypeScript throughout.
- **Test coverage** — 773 passing tests (617 JS + 156 Python). Coverage reported at 67%.
- **OpenAPI spec is auto-generated** and checked in CI (sync validation).
- **Security-conscious.** eslint-plugin-security, npm audit as CI gate, CSRF, Helmet, rate limiting.

### What's Missing
- **NO CONTRIBUTING.md.** For a product with "Source available" licensing and GitHub presence, this is a significant gap. A customer who wants to contribute or extend the project has no guidance.
- **No architectural diagrams beyond ASCII.** The architecture doc has one ASCII diagram. For a product with this complexity, a proper diagram (sequence diagrams, data flow, deployment topology) would help customers understand the system.
- **`api/db-postgres.ts` is 115KB.** This single file handles ALL database operations. It's unreadable at this size. It should be split into modules (agents, audit, policies, etc.).
- **`api/db-sqlite.ts` is 97KB.** Same issue.
- **`api/db-interface.ts` is 33KB.** The interface definition alone is massive.
- **No codeowners file.** Who owns what? Enterprise customers considering forking need this.
- **Dashboard is not in a framework.** 4,462 lines of vanilla HTML/JS/CSS. A customer can't extend it, theme it, or embed components. It's a monolith.
- **No `.editorconfig`.** Minor, but contributes to consistency for external contributors.
- **`api/openapi.json` is 322KB and checked into git.** This should probably be generated at build time, not committed. (CI does validate it, but still.)
- **Multiple planning/status files in repo root:** PLAN.md, PROJECT.md, AUDIT.md, AUDIT-FIXES-DONE.md, BACKEND-UPGRADE.md, CLEANUP-DONE.md, FRONTEND-UPGRADE.md, PHASE1-DONE.md, SPEC.md. These are internal development artifacts that shouldn't be in the customer-facing repo view.

### Specific Issues
1. The `packages/sdk/src/sdk/client.ts` is 44KB — one massive file with the entire API client. Should be split into logical modules.
2. No JSDoc on public SDK methods beyond what TypeScript types provide. Enterprise developers expect rich inline docs.
3. The Python SDK has `py.typed` marker but no `mypy` configuration or type checking in CI.
4. No `renovate.json` or `dependabot.yml` — dependency updates appear to be manual.

---

## Dimension Scores Summary

| Dimension | Score | Key Issue |
|-----------|-------|-----------|
| **1. Getting Started** | **7/10** | Good quickstart, but default policy is permissive and first "block" moment requires effort |
| **2. Documentation Quality** | **5/10** | Three overlapping doc sites, orphaned content, no changelog, version inconsistencies |
| **3. Developer Experience** | **7/10** | Strong types and error hierarchy, but API param naming is inconsistent across docs |
| **4. Product Completeness** | **7/10** | Feature-rich engine, but vanilla JS dashboard and no default protective policy |
| **5. Customer Journey** | **5/10** | Good free tier, no guided onboarding, no trial-to-paid flow, no enterprise sales path |
| **6. Operational Readiness** | **7/10** | Solid health checks and metrics, but Redis not monitored, no DR, no SLOs |
| **7. Code Quality** | **6/10** | Clean structure, but massive single files, no CONTRIBUTING.md, no architectural diagrams |

**Overall: 6.5/10**

---

## Top 10 Actions (Prioritized)

### Must-Do (Week 1-2)

1. **Fix default policy.** Ship a "secure by default" template that blocks destructive operations (rm -rf, DROP TABLE, curl to external IPs, etc.). New accounts should be PROTECTED on first evaluate, not wide open.

2. **Consolidate documentation.** Pick ONE docs site (vitepress-docs). Move all customer-facing content there. Archive internal docs to `docs/internal/` or remove from the public tree. Add a changelog.

3. **Add an interactive onboarding wizard.** After signup, walk the user through: create agent → see a blocked evaluation → create first policy → view audit trail. The "aha moment" must happen in under 60 seconds.

4. **Fix API parameter naming inconsistency.** Standardize on `tool`/`action`/`input` (or `tool`/`params`) across README, quickstart, SDK docs, and actual SDK code. One name, everywhere.

### Should-Do (Week 3-4)

5. **Add `CONTRIBUTING.md` and `CODEOWNERS`.** If the license says "source available," customers need to know how to contribute. Include development setup, PR process, and code style guide.

6. **Add a debug/trace mode to the SDK.** `guard.evaluate({ ..., debug: true })` should return the full rule evaluation trace. This is the #1 support request you'll get.

7. **Split the massive database files.** `db-postgres.ts` (115KB) and `db-sqlite.ts` (97KB) are unmaintainable. Split into domain modules (agents, audit, policies, etc.).

8. **Add Redis health check to `/health/detailed`.** Redis is critical infrastructure. Its health must be monitored.

### Nice-to-Have (Month 2+)

9. **Build a proper dashboard.** React/Next.js dashboard with real-time SSE updates, user management UI, visual policy builder, and compliance report generation. The vanilla JS dashboard caps the product's perceived value.

10. **Define and publish SLOs.** "P99 evaluate latency < 50ms. 99.9% availability. Audit log query < 200ms." Put these in the README and SLA document.

---

## Appendix: Positive Highlights

It's easy to focus on gaps. Here's what's genuinely impressive:

- **The error hierarchy** (`PolicyError` with factory methods, `isRetryable()`, `isSecurityBlock()`) is better than most enterprise SDKs I've audited.
- **The hash-chained audit trail** with a verification endpoint is a real differentiator. Not many security products offer provable audit integrity.
- **11 framework integrations** at this stage is remarkable. LangChain, CrewAI, OpenAI, AutoGen, Express, Fastify, Vercel AI SDK, LangGraph, MCP, OpenClaw, A2A.
- **Zero-dependency Python SDK** — pure stdlib. This removes an entire class of supply-chain concerns.
- **Feature Matrix** maps every feature to spec → implementation → tests → status. This level of traceability is rare.
- **SOC 2 readiness at 82%** before formal audit engagement shows security was designed in, not bolted on.
- **The kill switch** — tenant and agent-level, Redis-backed, instant — solves a real incident-response problem.
- **773 tests** with 67% coverage and CI enforcement is solid for this stage.

---

*This audit reflects the state of the repository as of 2026-04-18. Scores are relative to the product's stated market (enterprise AI agent security) and stage (pre-1.0).*

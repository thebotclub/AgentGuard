# CX Audit Remediation Plan

**Branch:** audit-remediation-squash
**Git:** dubai@thebot.club / Dubai (Bot Club)
**Date:** 2026-04-18
**Constraint:** Do NOT touch packages/dashboard/ (Next.js replacement — out of scope)

---

## Phase 1 — Docs & Repo Hygiene (Foundation)

**Goal:** Eliminate version confusion, consolidate doc sprawl, and clean root-level artifacts so a new visitor lands on a coherent, professional repo.

### Task 1.1 — Pin version to 0.10.0 everywhere
- **Deliverable:** Every version reference in the repo says `0.10.0`
- **Actions:**
  - Update `package.json` root: `"version": "0.10.0"`
  - Update hardcoded `SDK_VERSION` in `packages/sdk/src/sdk/client.ts` from `'0.9.0'` → `'0.10.0'`
  - Update dashboard sidebar footer (`dashboard/dashboard.js` or `index.html`) from `v0.9.0` → `v0.10.0`
  - Update any badge URLs in README that reference wrong version
  - Grep for `0\.9\.[02]` across the repo and reconcile
- **Acceptance:** `grep -r "0\.9\." --include="*.ts" --include="*.json" --include="*.html" --include="*.md" .` returns zero results (excluding node_modules, .git, lock files)

### Task 1.2 — Archive root-level planning artifacts
- **Deliverable:** Root directory contains only customer-facing files
- **Actions:**
  - Move to `.planning/archive/` or delete: `AUDIT.md`, `AUDIT-FIXES-DONE.md`, `BACKEND-UPGRADE.md`, `CLEANUP-DONE.md`, `FRONTEND-UPGRADE.md`, `PHASE1-DONE.md`, `PLAN.md`, `PROJECT.md`, `SPEC.md`, `CX_AUDIT.md`, `CX_PLAN.md`
  - Keep: `README.md`, `README_LAUNCH.md`, `CHANGELOG.md` (to be created), `CONTRIBUTING.md` (to be created), `LICENSE.md`
  - Add `.planning/` to `.gitignore` so future planning files don't clutter the repo
- **Acceptance:** `ls *.md | wc -l` returns ≤ 5 files; all others moved or gitignored

### Task 1.3 — Consolidate three doc sites into vitepress-docs/
- **Deliverable:** Single canonical docs source in `vitepress-docs/`
- **Actions:**
  - Identify unique content in `docs/` not present in `vitepress-docs/` (RUNBOOK.md, HIGH_AVAILABILITY.md, DATA_ISOLATION.md, DEPLOYMENT_ENFORCEMENT_ARCH.md, SELF_HOSTED.md, ENGINEERING_ROADMAP.md)
  - Migrate unique customer-facing content into appropriate `vitepress-docs/` sections
  - Move `docs/blog/` posts into `vitepress-docs/blog/`
  - Delete `docs/onboarding/` (contains only email draft + bio, not real docs)
  - Archive `docs-site/` (it's just a landing page; `vitepress-docs/` supersedes it)
  - Update all internal links
  - Update README to point to single docs location
- **Acceptance:**
  - `vitepress-docs/` builds with zero warnings (`npm run docs:build` or equivalent)
  - No broken internal links
  - `docs/` and `docs-site/` removed or archived
  - Critical content (RUNBOOK, HIGH_AVAILABILITY, SELF_HOSTED) accessible via VitePress nav

### Task 1.4 — Create CHANGELOG.md
- **Deliverable:** CHANGELOG.md with entries for recent releases
- **Actions:**
  - Create `CHANGELOG.md` following Keep a Changelog format
  - Backfill entries from git log for 0.9.x and 0.10.0 releases
  - Link to version badges/compare URLs
- **Acceptance:** CHANGELOG.md exists, covers 0.9.0 → 0.10.0, follows standard format

### Task 1.5 — Create CONTRIBUTING.md
- **Deliverable:** CONTRIBUTING.md with dev setup, PR process, code style
- **Actions:**
  - Document: dev environment setup (Node version, npm workspaces)
  - Document: how to run tests (`npm test`, `npm run test:python`)
  - Document: PR process (branch naming, commit style, CI requirements)
  - Document: code style (TypeScript strict, linting)
  - Reference the single docs system for architecture context
- **Acceptance:** CONTRIBUTING.md exists, a new dev can go from clone to first PR using only this file

### Task 1.6 — Remove duplicate getting-started content
- **Deliverable:** One canonical quickstart, no duplicates
- **Actions:**
  - `vitepress-docs/guide/getting-started.md` and `vitepress-docs/getting-started/quickstart.md` cover overlapping material — merge into one
  - Keep `getting-started/quickstart.md` as canonical (it's more detailed)
  - Redirect or remove the other
- **Acceptance:** Single quickstart entry point; no conflicting guides

---

## Phase 2 — Getting Started & First Value Moment

**Goal:** A new user goes from "npm install" to "I just saw a threat get blocked" in under 5 minutes.

### Task 2.1 — Fix README quickstart flow
- **Deliverable:** README leads with API key acquisition, then code, then first block
- **Actions:**
  - Add "Get your API key" as explicit Step 1 with link to signup
  - Show the evaluate call with `{ tool, params }` (matching actual SDK signature)
  - Show an example that returns `block` (e.g., shell_exec with destructive pattern)
  - Add "Why did it block?" callout explaining the default secure policy
  - Remove or relocate the self-hosted section (link to separate self-hosted guide)
- **Acceptance:** Following the README top-to-bottom, a new user gets a `block` result within 5 minutes

### Task 2.2 — Verify default policy is secure-by-default on tenant provisioning
- **Deliverable:** Confirmation that new tenants get the block-default policy
- **Actions:**
  - Read `api/lib/policy-engine-setup.ts` — default action is already `'block'`
  - Trace the tenant provisioning flow: when a new tenant signs up, does `DEFAULT_POLICY` get applied?
  - If not, add logic to `api/routes/policy.ts` or the signup handler to seed the default policy
  - Verify the default policy rules cover: shell_exec destructive commands, SQL injection patterns, external HTTP to suspicious IPs
  - Document the default policy in the quickstart guide
- **Acceptance:**
  - New tenant evaluates `shell_exec` with `rm -rf` → returns `block`
  - Default policy is documented in quickstart
  - No code change needed if provisioning already applies DEFAULT_POLICY

### Task 2.3 — Fix API parameter naming across all docs
- **Deliverable:** Every doc shows `{ tool, params }` matching the SDK
- **Actions:**
  - SDK `evaluate()` signature: `{ tool: string; params?: Record<string, unknown> }` — this is canonical
  - Find all doc references using `{ tool, action, input }` and change to `{ tool, params }`
  - Check: README, quickstart, SDK docs, integration examples, blog posts, vitepress guides
  - Fix the `decision.result` vs `decision.decision` inconsistency (SDK returns `result`)
- **Acceptance:** `grep -r "action.*input" vitepress-docs/ README.md --include="*.md"` returns zero references to the old param names in evaluate examples

### Task 2.4 — Add Mermaid architecture diagrams to docs
- **Deliverable:** Visual architecture diagrams rendered in VitePress/GitHub
- **Actions:**
  - Create Mermaid sequence diagram: "SDK evaluate → API → Policy Engine → Decision"
  - Create Mermaid deployment diagram: "Self-hosted topology (API + Postgres + Redis + Dashboard)"
  - Create Mermaid data-flow diagram: "Agent → SDK → Guard → Policy Check → Audit Trail"
  - Add to `vitepress-docs/architecture/` overview page
  - Remove or update the ASCII-only diagram in `ARCHITECTURE.md`
- **Acceptance:** Three Mermaid diagrams render correctly in VitePress preview; linked from docs nav

### Task 2.5 — Add "How It Works" 30-second explainer page
- **Deliverable:** New page at `vitepress-docs/getting-started/how-it-works.md`
- **Actions:**
  - Create a concise page (under 300 words) explaining: what AgentGuard does, how it intercepts agent tool calls, what a policy decision looks like
  - Include the "SDK evaluate → block/allow" flow diagram
  - Link from the docs homepage and quickstart as prerequisite reading
- **Acceptance:** Page exists, is linked from docs index, readable in under 30 seconds

---

## Phase 3 — SDK & Developer Experience

**Goal:** Make the SDK a joy to use — consistent API, debug visibility, and rich inline docs.

### Task 3.1 — Add debug/trace mode to SDK evaluate()
- **Deliverable:** `guard.evaluate({ tool, params }, { debug: true })` returns rule evaluation trace
- **Actions:**
  - Add `debug` option to `evaluate()` options
  - When enabled, return `debugTrace` array in the response:
    ```ts
    { rulesEvaluated: [...], matchedRule: {...}, evaluationPath: [...], totalTimeMs: number }
    ```
  - Include: each rule checked, why it passed/failed, which rule matched, final decision reasoning
  - Add `DEBUG` log level output to SDK when debug is enabled
  - Works for both local (PolicyEngine) and remote (HTTP) evaluation paths
- **Acceptance:**
  - `evaluate({ tool: 'shell_exec', params: { cmd: 'rm -rf /' } }, { debug: true })` returns `debugTrace` with ≥ 1 rule entry
  - Debug trace includes matched rule ID, condition results, and final decision
  - No debug overhead when `debug: false` (default)

### Task 3.2 — Fix SDK parameter docs to match code
- **Deliverable:** All SDK documentation matches the `{ tool, params }` signature
- **Actions:**
  - Update `packages/sdk/README.md` examples
  - Update `packages/sdk/src/sdk/client.ts` JSDoc on `evaluate()` method
  - Update integration example docs in `vitepress-docs/integrations/`
  - Ensure `result` (not `decision`) is used for the response field in all examples
- **Acceptance:** Every code example in SDK docs compiles and runs against the actual SDK types

### Task 3.3 — Export `AgentGuardBlockError` from SDK main index
- **Deliverable:** `import { AgentGuardBlockError } from '@the-bot-club/agentguard'` works
- **Actions:**
  - Verify the error class exists and is properly typed
  - Add to `packages/sdk/src/index.ts` exports
  - Add usage example in SDK docs and integration guides
- **Acceptance:** `import { AgentGuardBlockError } from '@the-bot-club/agentguard'` resolves without error

### Task 3.4 — Add JSDoc to public SDK methods
- **Deliverable:** Hover documentation in IDEs for all public SDK methods
- **Actions:**
  - Add JSDoc to: `evaluate()`, `evaluateBatch()`, `startSpan()`, `shutdown()`, constructor
  - Include `@example` blocks with runnable code
  - Include `@throws` for error types
  - Keep concise — no essays, just what a developer needs
- **Acceptance:** Hovering over `guard.evaluate()` in VS Code shows description, params, return type, and example

### Task 3.5 — Add `PolicyEngine.fromYamlFile()` convenience method
- **Deliverable:** One-liner to create a local policy engine from a YAML file
- **Actions:**
  - Add static method: `PolicyEngine.fromYamlFile(path: string): PolicyEngine`
  - Parse YAML → PolicyBundle → PolicyEngine
  - Handle file-not-found and parse errors with clear messages
  - Add dependency on `yaml` or `js-yaml` package (check what's already used)
  - Document in SDK README and integration guides
- **Acceptance:** `new PolicyEngine.fromYamlFile('./policy.yaml').evaluate({ tool: 'shell_exec', params: { cmd: 'rm -rf /' } })` returns a valid decision

---

## Phase 4 — Product Completeness (Dashboard & Onboarding)

**Goal:** Make the vanilla dashboard credible and add guided onboarding so new users hit their "aha moment" fast.

**Note:** All work in `dashboard/` (vanilla). `packages/dashboard/` is out of scope.

### Task 4.1 — Add interactive onboarding flow to dashboard
- **Deliverable:** After entering API key, user sees a guided 3-step wizard
- **Actions:**
  - Step 1: "Create your first agent" — pre-fills a sample agent with sensible defaults
  - Step 2: "See it block a threat" — runs a demo `evaluate()` that returns `block` with the default policy
  - Step 3: "View the audit trail" — shows the blocked event in the audit log
  - Store onboarding state in `sessionStorage` to not re-show on return
  - "Skip" button for experienced users
- **Acceptance:** Fresh session → enter API key → wizard appears → complete 3 steps → lands on main dashboard

### Task 4.2 — Fix dashboard version display
- **Deliverable:** Dashboard sidebar shows current version dynamically or at least `v0.10.0`
- **Actions:**
  - Update hardcoded version string in dashboard sidebar
  - Ideally: fetch version from `/api/v1/health` and display it dynamically
  - Fallback: hardcode `v0.10.0` (will be fixed in version pin task)
- **Acceptance:** Dashboard footer shows `v0.10.0` or dynamic version from API

### Task 4.3 — Add "copy to clipboard" buttons to docs code blocks
- **Deliverable:** VitePress code blocks have copy buttons
- **Actions:**
  - VitePress supports this natively — enable `themeConfig.code.copyButtons` or equivalent
  - Verify it works on all code block types (ts, python, bash, yaml)
- **Acceptance:** Every code block in the docs site has a clickable copy button

### Task 4.4 — Improve dashboard API key UX
- **Deliverable:** User understands where their key is stored and can clear it
- **Actions:**
  - Add a small notice: "API key stored in browser session storage. Clear browser data to remove."
  - Add a "Sign out" button that clears `sessionStorage` and shows the key input again
  - Add a "Test Connection" button that calls `/health` before proceeding
- **Acceptance:** User sees a notice about key storage, can sign out, and can test their key before using the dashboard

### Task 4.5 — Add "Why AgentGuard?" comparison content
- **Deliverable:** Page or section comparing AgentGuard to alternatives
- **Actions:**
  - Create `vitepress-docs/guides/why-agentguard.md`
  - Compare: AgentGuard vs building your own guardrails vs general API gateways vs prompt-only security
  - Focus on differentiators: hash-chained audit trail, kill switch, agent hierarchy, 11 integrations
  - Link from docs nav and README
- **Acceptance:** Page exists with comparison table; linked from docs index

---

## Phase 5 — Customer Journey & Operations (Docs Only)

**Goal:** Close the trial-to-paid gap and provide operational guidance — all through documentation, no new backend features.

### Task 5.1 — Document trial-to-paid flow
- **Deliverable:** Clear docs on what happens at limits and how to upgrade
- **Actions:**
  - Document: what happens at 100K events (402 response with upgrade prompt)
  - Document: how to upgrade (Stripe checkout link or sales contact)
  - Document: Pro tier SLA (clarify if there is one, or make it explicit that SLA is Enterprise only)
  - Add "Upgrade" section to vitepress-docs pricing page
  - Reconcile self-hosted free tier (7-day retention) vs cloud free tier (30-day retention) — explain the difference
- **Acceptance:** A free-tier user hitting limits knows exactly what to do next

### Task 5.2 — Add enterprise sales path documentation
- **Deliverable:** Enterprise buyers can self-serve their evaluation
- **Actions:**
  - Create `vitepress-docs/enterprise/` section with:
    - Security questionnaire pre-fill (SOC 2 status, pen test availability, compliance certs)
    - "Contact Sales" CTA with email or form link
    - Security architecture overview for CISO review
    - Deployment options comparison (cloud vs self-hosted vs hybrid)
  - Add "Enterprise" link in docs nav
- **Acceptance:** Enterprise section exists with ≥ 4 pages; CISO-level information available without talking to sales

### Task 5.3 — Document SLOs and monitoring guidance
- **Deliverable:** Published SLO targets and monitoring setup guide
- **Actions:**
  - Define SLOs: evaluate latency p99 < 50ms (remote), audit query < 200ms, 99.9% availability (Enterprise)
  - Create `vitepress-docs/deployment/monitoring.md` with:
    - Grafana dashboard JSON (export from current setup or create template)
    - Recommended alerting thresholds
    - Log aggregation setup (Loki, ELK, CloudWatch)
  - Link from self-hosted guide
- **Acceptance:** Monitoring guide exists with importable Grafana JSON; SLOs documented and linked from README

### Task 5.4 — Fix docs referencing unbuilt features
- **Deliverable:** No docs reference features that don't exist yet
- **Actions:**
  - Search all docs for: "Planned", "Coming Soon", "Roadmap" references to features
  - Mark planned features clearly with `[Planned]` badge or remove references
  - Verify: real-time SSE dashboard (not built), compliance PDF export (not built), visual policy builder (not built)
  - Update RUNBOOK.md if it references BullMQ (not implemented)
  - Remove references to `IMPLEMENTATION_NOTES.md` if it doesn't exist
- **Acceptance:** No doc claims a feature exists when it doesn't; planned features are clearly marked

### Task 5.5 — Add CODEOWNERS file
- **Deliverable:** `CODEOWNERS` at repo root
- **Actions:**
  - Create CODEOWNERS mapping:
    - `packages/sdk/` → SDK team/maintainers
    - `packages/python/` → Python SDK maintainers
    - `api/` → API/backend team
    - `dashboard/` → frontend team
    - `docs/` → docs team
  - Use team names or individual GitHub handles as appropriate
- **Acceptance:** CODEOWNERS exists; PRs get automatic reviewer suggestions

---

## Phase 6 — Code Quality & Polish

**Goal:** Address the code-level audit findings that affect customer perception — massive files, missing config, and repo hygiene.

### Task 6.1 — Split db-postgres.ts and db-sqlite.ts into domain modules
- **Deliverable:** No DB adapter file exceeds 500 lines
- **Actions:**
  - `db-postgres.ts` (115KB) → split into: `db-postgres/agents.ts`, `db-postgres/audit.ts`, `db-postgres/policies.ts`, `db-postgres/webhooks.ts`, `db-postgres/billing.ts`, `db-postgres/index.ts`
  - `db-sqlite.ts` (97KB) → same domain split: `db-sqlite/agents.ts`, `db-sqlite/audit.ts`, etc.
  - `db-interface.ts` (33KB) → split interface by domain
  - Each module implements its slice of the IDatabase interface
  - Index file re-exports the composite
- **Acceptance:**
  - No DB file exceeds 500 lines
  - All 773+ existing tests still pass
  - `IDatabase` interface unchanged (just re-exported from parts)

### Task 6.2 — Add `.editorconfig` and `dependabot.yml`
- **Deliverable:** Consistent code style and automated dependency updates
- **Actions:**
  - Create `.editorconfig` with: indent_style = space, indent_size = 2, charset = utf-8, trim_trailing_whitespace = true, insert_final_newline = true
  - Create `.github/dependabot.yml` with: npm ecosystem, weekly schedule, automerge for dev dependencies
- **Acceptance:** `.editorconfig` exists at root; `dependabot.yml` configured for weekly npm updates

### Task 6.3 — Clean up openapi.json handling
- **Deliverable:** `openapi.json` is generated at build time, not committed
- **Actions:**
  - Add `api/openapi.json` to `.gitignore`
  - Ensure CI generates it during build and validates it
  - If needed, add `npm run generate:openapi` script
  - Keep the validation CI step that checks spec sync
- **Acceptance:** `openapi.json` not in git tracking; CI still validates spec consistency

### Task 6.4 — Add license headers or clarify licensing
- **Deliverable:** LICENSE.md at root with clear terms
- **Actions:**
  - Verify LICENSE.md exists and is accurate
  - Ensure README references the license correctly
  - If "source available" — clarify what that means for users (can they fork? contribute?)
- **Acceptance:** LICENSE.md exists; README links to it; license type is unambiguous

---

## Phase Dependencies

```
Phase 1 (Docs & Hygiene)
    ↓
Phase 2 (Getting Started) ← depends on consolidated docs from Phase 1
    ↓
Phase 3 (SDK & DX) ← can parallel with Phase 2
    ↓
Phase 4 (Dashboard & Onboarding) ← depends on SDK debug mode from Phase 3
    ↓
Phase 5 (Customer Journey) ← can parallel with Phase 4
    ↓
Phase 6 (Code Quality) ← can parallel with Phases 4-5
```

**Critical path:** Phase 1 → Phase 2 → Phase 4
**Parallel tracks:** Phase 3 alongside Phase 2; Phase 6 alongside Phases 4-5

---

## Acceptance Summary

| # | Task | Deliverable | Phase |
|---|------|-------------|-------|
| 1.1 | Pin version 0.10.0 | Zero refs to 0.9.x | 1 |
| 1.2 | Archive root artifacts | ≤ 5 root .md files | 1 |
| 1.3 | Consolidate doc sites | Single vitepress-docs/ | 1 |
| 1.4 | Create CHANGELOG.md | Changelog covering 0.9→0.10 | 1 |
| 1.5 | Create CONTRIBUTING.md | Dev setup → PR guide | 1 |
| 1.6 | Deduplicate quickstarts | One canonical quickstart | 1 |
| 2.1 | Fix README quickstart | Block result in 5 min | 2 |
| 2.2 | Verify secure default policy | New tenant → block on destructive ops | 2 |
| 2.3 | Fix API param naming | All docs use `{ tool, params }` | 2 |
| 2.4 | Mermaid architecture diagrams | 3 diagrams in docs | 2 |
| 2.5 | "How It Works" page | 30-second explainer | 2 |
| 3.1 | SDK debug mode | `debugTrace` in evaluate response | 3 |
| 3.2 | Fix SDK param docs | Docs match SDK signature | 3 |
| 3.3 | Export AgentGuardBlockError | Importable from main index | 3 |
| 3.4 | SDK JSDoc | Hover docs on public methods | 3 |
| 3.5 | PolicyEngine.fromYamlFile() | One-liner YAML loading | 3 |
| 4.1 | Dashboard onboarding wizard | 3-step guided flow | 4 |
| 4.2 | Dashboard version display | Shows v0.10.0 | 4 |
| 4.3 | Copy buttons on code blocks | VitePress copy buttons | 4 |
| 4.4 | Dashboard API key UX | Notice + sign out + test | 4 |
| 4.5 | "Why AgentGuard?" page | Comparison content | 4 |
| 5.1 | Trial-to-paid docs | Upgrade path documented | 5 |
| 5.2 | Enterprise sales docs | CISO evaluation section | 5 |
| 5.3 | SLO & monitoring docs | Grafana JSON + SLOs | 5 |
| 5.4 | Remove unbuilt feature refs | No false claims in docs | 5 |
| 5.5 | CODEOWNERS file | Auto reviewer assignment | 5 |
| 6.1 | Split DB adapter files | No file > 500 lines | 6 |
| 6.2 | .editorconfig + dependabot | Consistency + auto updates | 6 |
| 6.3 | Clean openapi.json handling | Not in git, CI validates | 6 |
| 6.4 | Clarify licensing | Clear LICENSE.md | 6 |

**Total: 29 tasks across 6 phases**

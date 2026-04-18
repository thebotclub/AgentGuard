# AgentGuard 10/10 Remediation — Execution Plan

**Plan Date:** April 2026
**Source Audit:** AUDIT.md (Dubai, Khaleej Pod Lead — The Bot Club)
**Total Estimated Duration:** 4 sprints (~8 weeks)

---

## Sprint Overview

| Sprint | Duration | Theme | Phases Covered | Effort |
|--------|----------|-------|----------------|--------|
| Sprint 1 | 2 weeks | **Unblock & Stabilize** | Phase 1 (Foundation) + Phase 3 (Security quick wins) | ~12 person-days |
| Sprint 2 | 2 weeks | **Architecture Clarity** | Phase 2 (Architecture) | ~15 person-days |
| Sprint 3 | 2 weeks | **Quality Gates** | Phase 4 (Testing) + Phase 5 (Docs & Ops) | ~14 person-days |
| Sprint 4 | 2 weeks | **Performance & Polish** | Phase 6 (Performance) + remaining items | ~10 person-days |

**Total effort: ~51 person-days**

---

## Sprint 1 — Unblock & Stabilize (Weeks 1-2)

**Goal:** Get CI green, close known vulnerabilities, and ship the security quick wins that unblock enterprise credibility.

### Week 1: Test Suite & Dependencies

| Day | Task | Effort | Owner | Blocks |
|-----|------|--------|-------|--------|
| 1-2 | **Fix Prisma 7 breakage** (Task 1.1) — Create `prisma.config.ts` or lock to v6. Get `npm test` green. | 4h | Backend | Everything |
| 1 | **Fix 4 known vulnerabilities** (Task 1.2) — `npm audit fix`, update next/defu, evaluate hono removal | 2h | Backend | Security baseline |
| 1 | **Remove dead dependencies** (Task 1.3) — Audit hono imports, remove if unused | 2h | Backend | Clean deps |
| 2 | **Clean up temp files** (Task 1.5) — Delete `test_schema_temp.ts`, fix `.gitignore` | 30m | Backend | Repo hygiene |
| 2 | **Update README** — Replace stale test counts with actual numbers after fix | 30m | Backend | Honesty |

**Week 1 Deliverable:** CI pipeline passes on main. `npm test` reports actual pass/fail. `npm audit` returns 0.

### Week 2: Observability & Security Quick Wins

| Day | Task | Effort | Owner | Blocks |
|-----|------|--------|-------|--------|
| 3-4 | **Replace 30+ `console.*` calls** (Task 1.4) — Systematic grep-and-replace with pino logger | 4h | Backend | Observability |
| 3 | **Ship `security.txt`** (Task 3.3) — Create RFC 9116 file, serve at `/.well-known/` | 30m | Backend | Researcher path |
| 3 | **Upgrade Cloudflare SSL to Full/Strict** (Task 3.1) — Origin cert, Terraform update | 2h | Infra | CISO credibility |
| 4-5 | **Evaluate legacy plaintext key status** (Task 3.6) — Count remaining, add migration tooling | 3h | Backend | Key hygiene |
| 5 | **Sprint 1 retrospective** — Verify all acceptance criteria, update this plan | 1h | Team | Planning |

**Week 2 Deliverable:** Zero `console.*` in production code. `security.txt` live. SSL Full/Strict confirmed.

### Sprint 1 Acceptance Gate

- [ ] `npm test` runs green in CI
- [ ] `npm audit` reports 0 vulnerabilities
- [ ] `hono`/`@hono/node-server` removed or justified
- [ ] Zero `console.*` calls in production code
- [ ] `security.txt` accessible at `/.well-known/`
- [ ] Cloudflare SSL mode is Full (Strict)
- [ ] README reflects actual test and coverage numbers

---

## Sprint 2 — Architecture Clarity (Weeks 3-4)

**Goal:** Resolve the dual-database confusion, decompose the monolith, and establish a clean service layer.

### Week 3: Database Consolidation & Server Decomposition

| Day | Task | Effort | Owner | Blocks |
|-----|------|--------|-------|--------|
| 1-3 | **Consolidate database systems** (Task 2.1) — Pick canonical system, migrate/deprecate the other. This is the highest-risk task. | 2-5d | Backend | All of Phase 2 |
| 3-4 | **Refactor server.ts below 200 lines** (Task 2.2) — Extract middleware/route registration into modules | 4h | Backend | Maintainability |
| 4 | **Remove remotion/ from repo** (Task 2.5) — Move to separate repo or delete | 1h | Any | Repo hygiene |

**Week 3 Deliverable:** Single database system. `server.ts` < 200 lines.

### Week 4: Service Layer & Route Splitting

| Day | Task | Effort | Owner | Blocks |
|-----|------|--------|-------|--------|
| 5-7 | **Extract service layer** (Task 2.3) — Create `api/services/`, move business logic from DB adapters and route handlers. Start with policy and audit services (most complex). | 3-5d | Backend | Testability |
| 7-8 | **Split large route files** (Task 2.4) — Break evaluate.ts, scim.ts, policy-git-webhook.ts, stripe-webhook.ts into sub-modules | 2d | Backend | Maintainability |
| 9 | **Sprint 2 retrospective** — Architecture review with team, verify acceptance criteria | 1h | Team | Planning |

**Week 4 Deliverable:** Service layer in place. DB adapters < 500 lines each. No route file > 10KB.

### Sprint 2 Acceptance Gate

- [ ] Single database access pattern (no dual systems)
- [ ] `server.ts` < 200 lines
- [ ] Each DB adapter < 500 lines
- [ ] No route file > 10KB
- [ ] `remotion/` removed from repo
- [ ] All existing tests pass after refactoring
- [ ] No behavioral changes to running application

---

## Sprint 3 — Quality Gates (Weeks 5-6)

**Goal:** Build the testing infrastructure that catches regressions and close all documentation/monitoring gaps.

### Week 5: Test Coverage Expansion

| Day | Task | Effort | Owner | Blocks |
|-----|------|--------|-------|--------|
| 1-2 | **Write missing test files** (Task 4.4) — Rate limiting, SCIM, Stripe webhook, SIEM, compliance, Redis Sentinel | 3d | Backend | Coverage |
| 2-3 | **Dashboard component tests** (Task 4.2) — Add testing infra, write 20+ component tests | 2d | Frontend | UI reliability |
| 3-4 | **Load testing baseline with k6** (Task 4.1) — Create scripts for evaluate, policy CRUD, auth. Capture baselines. | 1d | Backend | Perf confidence |
| 4 | **Coverage gating in CI** (Task 4.3) — Add coverage reporting, set minimum threshold, post as PR comment | 4h | Backend | Quality gate |

**Week 5 Deliverable:** Test coverage > 80% on core paths. Load test baselines captured. Coverage gate in CI.

### Week 6: Chaos Testing & Documentation

| Day | Task | Effort | Owner | Blocks |
|-----|------|--------|-------|--------|
| 5-6 | **Chaos/failure injection tests** (Task 4.5) — Redis loss, DB pool exhaustion, slow upstreams | 2d | Backend | Resilience |
| 6-7 | **Migration rollback tests** (Task 4.6) — Test every migration up and down | 1d | Backend | Deploy confidence |
| 7-8 | **Consolidate docs systems** (Task 5.1) — Pick VitePress, migrate content, archive others | 1d | Docs | Contributor clarity |
| 8-9 | **Update all docs for accuracy** (Task 5.4) — Remove stale references, update counts, fix links | 1d | Docs | Trust |
| 9 | **Sprint 3 retrospective** — Quality review, verify coverage numbers | 1h | Team | Planning |

**Week 6 Deliverable:** Chaos tests passing. Docs consolidated. All docs accurate.

### Sprint 3 Acceptance Gate

- [ ] Test files exist for: rate-limiting, SCIM, Stripe, SIEM, compliance, Redis Sentinel
- [ ] Dashboard has > 20 component tests
- [ ] Load test baselines documented in `tests/load/SLOS.md`
- [ ] Coverage gate blocks PRs below threshold
- [ ] Chaos tests verify graceful degradation
- [ ] Migration rollback tests exist for every migration
- [ ] Single documentation system (VitePress)
- [ ] No broken doc links, no stale references

---

## Sprint 4 — Performance & Polish (Weeks 7-8)

**Goal:** Build the strategic performance differentiator and close remaining gaps.

### Week 7: Observability & Security Completion

| Day | Task | Effort | Owner | Blocks |
|-----|------|--------|-------|--------|
| 1-2 | **Prometheus `/metrics` endpoint** (Task 5.2) — Add prom-client, instrument routes, update Helm chart | 1d | Backend | Monitoring |
| 2-3 | **Alerting & monitoring guidance** (Task 5.3) — Thresholds, runbooks, Grafana dashboard JSON | 1d | Backend/Docs | Ops readiness |
| 3-4 | **HMAC webhook signing** (Task 3.2) — Sign all outbound webhooks, add SDK verification helpers | 1d | Backend | Webhook trust |
| 4-5 | **TypeScript strict mode** (Task 3.4) — Enable strict, fix all `any` casts, add `tsc --noEmit` to CI | 2d | Backend | Type safety |
| 5 | **API versioning strategy** (Task 3.5) — Document strategy, add version-aware middleware | 1d | Backend | API lifecycle |

**Week 7 Deliverable:** Prometheus metrics live. Webhooks signed. Strict TypeScript in CI.

### Week 8: In-Process SDK Evaluation (The Differentiator)

| Day | Task | Effort | Owner | Blocks |
|-----|------|--------|-------|--------|
| 6-7 | **Policy bundle signing & distribution** (Task 6.2) — Ed25519 signing, bundle endpoints, key rotation docs | 2d | Backend | SDK performance |
| 7-8 | **In-process SDK evaluation** (Task 6.1) — Local policy engine, bundle cache, offline mode. TypeScript SDK first, then Python. | 2d | SDK | Enterprise story |
| 8-9 | **Performance benchmarking** (Task 6.3) — Remote vs in-process comparison, SLO dashboard, CI regression detection | 1d | Backend | Data-driven claims |
| 9-10 | **Final verification & re-audit prep** — Run full test suite, verify all acceptance criteria, prepare scorecard | 1d | Team | Ship readiness |

**Week 8 Deliverable:** In-process SDK evaluates in < 5ms. Benchmarks published. All phases complete.

### Sprint 4 Acceptance Gate

- [ ] `GET /metrics` returns Prometheus-format metrics
- [ ] Alerting thresholds documented with Grafana dashboard
- [ ] All outbound webhooks include HMAC-SHA256 signature
- [ ] `tsc --noEmit` passes in strict mode, blocking in CI
- [ ] API versioning strategy documented and middleware in place
- [ ] Policy bundles are signed with Ed25519
- [ ] SDK evaluates policies in < 5ms p99 (in-process)
- [ ] Performance comparison table in README
- [ ] All acceptance criteria from all phases verified

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **DB consolidation breaks existing features** | Medium | High | Do it early (Sprint 2), comprehensive test suite from Sprint 1 catches regressions |
| **Prisma 7 migration is deeper than expected** | Low | High | Fallback: lock to Prisma v6 instead of migrating |
| **In-process SDK evaluation doesn't hit < 5ms** | Low | Medium | Profile early; worst case it's still < 20ms which is 10x improvement |
| **Cloudflare SSL config requires Azure changes** | Medium | Medium | Coordinate with infra team in Sprint 1, don't leave it late |
| **Strict TypeScript surfaces hundreds of errors** | Medium | Medium | Phase it: fix DB adapter first, then routes, then strict mode |
| **Sprint 2 DB consolidation takes > 5 days** | Medium | Medium | Accept partial progress — deprecate one system, full removal can continue into Sprint 3 |

---

## Effort Summary by Phase

| Phase | Tasks | Estimated Effort | Sprint |
|-------|-------|-----------------|--------|
| Phase 1 — Foundation | 5 tasks | 10 person-hours | Sprint 1 |
| Phase 2 — Architecture | 5 tasks | 15 person-days | Sprint 2 |
| Phase 3 — Security Hardening | 6 tasks | 8 person-days | Sprint 1 (quick wins) + Sprint 4 |
| Phase 4 — Quality & Testing | 6 tasks | 10 person-days | Sprint 3 |
| Phase 5 — Documentation & Ops | 4 tasks | 4 person-days | Sprint 3 + Sprint 4 |
| Phase 6 — Performance | 3 tasks | 5 person-days | Sprint 4 |
| **Total** | **29 tasks** | **~51 person-days** | **4 sprints** |

---

## Daily Standup Questions

For each sprint, the team should answer:

1. **Is CI green?** (Sprint 1 onward — this is the canary)
2. **Are we on the critical path?** (Phase 1 → 2 → 4 → 6)
3. **Any acceptance criteria at risk?** (Check phase gates)
4. **Any new debt discovered?** (Add to backlog, don't scope-creep current sprint)

---

## Definition of Done

A task is "done" when:

1. Code is reviewed and merged to main
2. All existing tests pass (CI green)
3. New tests written for the change (if applicable)
4. Documentation updated (if applicable)
5. Acceptance criteria from PROJECT.md verified
6. No `console.*` calls introduced (lint rule should catch this)
7. TypeScript strict mode passes (`tsc --noEmit`)

---

## Post-Remediation: Re-Audit Checklist

After Sprint 4, run this verification:

- [ ] `npm test` — all green
- [ ] `npm audit` — 0 vulnerabilities
- [ ] `tsc --noEmit` — 0 errors in strict mode
- [ ] `grep -r "console\.\(log\|error\|warn\)" api/` — 0 results
- [ ] `wc -l api/server.ts` — < 200
- [ ] `npm ls hono` — not found (or justified)
- [ ] `curl /.well-known/security.txt` — returns valid content
- [ ] `curl /metrics` — returns Prometheus metrics
- [ ] Cloudflare SSL mode — Full (Strict)
- [ ] Webhook signature verification — passing
- [ ] Load test results — within SLO
- [ ] Coverage report — > 80% on core paths
- [ ] In-process SDK benchmark — < 5ms p99
- [ ] Single docs system — VitePress only
- [ ] Target score: **9.2/10**

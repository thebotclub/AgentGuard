# AgentGuard Consistency and Production Readiness Plan

## Goal

Make the public AgentGuard product, repository, docs, SDK examples, and deployable API contract consistent enough for a credible alpha/private-beta production push.

## Scope

- Treat the currently deployed Express API contract as canonical: `/`, `/health`, and `/api/v1/*`.
- Do not merge PR #3 wholesale. It is a broad feature/refactor sweep with unresolved security concerns.
- Use PR #3 only as a patch reference for low-risk docs/version/security fixes.
- Fix default branch consistency issues directly:
  - version drift
  - README/docs examples
  - public API route references
  - high-severity dependency audit findings
  - Python 3.14 test compatibility
  - over-strong maturity and customer claims
- Verify locally and with live smoke tests before pushing.

## Non-Goals

- No SCIM, Stripe, GitOps, metrics, or signed bundle feature expansion from PR #3 unless required to fix a blocker.
- No large backend framework migration.
- No DNS/domain change.

## Subagent Challenge Summary

The review subagent blocked the initial idea of using PR #3 as the base because it:

- changes 143 files and adds major new security-sensitive features;
- contains unresolved review findings around CSP, rate limiting, SSRF, webhook signatures, async errors, and metrics output;
- weakens the npm audit gate;
- may publish `0.10.0` docs before production actually serves the new contract.

The revised plan is surgical: fix public consistency and security hygiene from `main`, then deploy only after staging/production smoke checks pass.

## Execution Steps

1. Create a clean branch from `main`.
2. Normalize repo/package versioning for the current public release.
3. Update README and docs examples to use `{ tool, params }`, `agentguard-tech`, and deployed `/api/v1/*` routes.
4. Mark Hono `/v1` control-plane code as next/internal in docs rather than public canonical API.
5. Remove or soften unverified customer, SOC 2, SLA, and enterprise maturity claims from public pages/docs.
6. Resolve high-severity `npm audit --audit-level=high` findings without bypassing the gate.
7. Fix Python tests for modern Python event-loop behavior.
8. Add or update smoke checks for live routes and package examples where practical.
9. Run verification:
   - `npm ci`
   - `npx prisma generate --schema=packages/api/prisma/schema.prisma`
   - `npm run typecheck`
   - `npm run test:unit`
   - `npm audit --audit-level=high`
   - `PYTHONPATH=packages/python python3 -m unittest discover -s packages/python/tests -p 'test_*.py'`
   - live API smoke checks for `/`, `/health`, and `/api/v1/evaluate`
10. Push branch, open/update PR, wait for checks, then merge/deploy only if checks are clean or residuals are explicitly documented and acceptable.

## Confidence Gates

- No high-severity dependency audit findings.
- README quickstart matches actual SDK request shape.
- Live/docs route references do not point users at 404s.
- Python tests pass on the local available Python runtime.
- Public copy reflects alpha/private-beta maturity rather than implying audited enterprise adoption.

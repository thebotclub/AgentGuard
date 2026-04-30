# Remaining Production Cleanup Plan

## Goal

Clear or explicitly retire the remaining production-readiness issues after the v0.10.0 consistency and auth deployments:

- `npm audit` moderate advisories in Next/PostCSS and Vite/Vitest/VitePress.
- GitHub Actions Node 20 runtime deprecation warnings.

## Guardrails

- Do not use `npm audit fix --force` if it downgrades Next or introduces broad breaking changes.
- Keep production behavior unchanged except dependency/runtime hardening.
- Treat docs and test tooling as deploy blockers only if local and GitHub verification stay green.
- Deploy only through PR, CI, and the existing Azure deployment workflow.

## Current Findings

- High/critical audit is already clean.
- Default branch reported only 2 moderate vulnerabilities in GitHub after the previous fixes.
- Initial branch audit showed:
  - `next` via nested `postcss <8.5.10`.
  - `vite`, `vite-node`, `vitest`, `@vitest/mocker`, `@vitest/coverage-v8`, `vitepress` via `vite <=6.4.1`.
- GitHub deploy runs pass but warn that `actions/checkout@v4`, `actions/setup-node@v4`, and `azure/login@v2` run on Node 20.

## Plan

1. Get subagent challenge on dependency/version risk and CI runtime warning mitigation.
2. Inspect package constraints and available patched versions.
3. Upgrade the minimal set of dependencies that actually clears audit:
   - Use `vitest@4.1.5` + `@vitest/coverage-v8@4.1.5`.
   - Add explicit `vite@6.4.2`, including override coverage for VitePress.
   - Keep `vitepress@1.6.4`; do not move docs to `2.0.0-alpha`.
   - Keep Next on the current compatible line; use a targeted nested PostCSS override rather than a Next major/downgrade.
4. Upgrade GitHub Actions to Node 24-capable major versions where compatible. Do not use global `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` unless no action-specific upgrade exists.
5. Run verification:
   - `npm audit`
   - `npm audit --audit-level=high`
   - `npm ci --ignore-scripts`
   - `npm run build`
   - `npm run typecheck`
   - `npm run test:unit`
   - `npm run test:coverage`
   - Python unittest suite
   - `npm run docs:build`
   - `npm run openapi:generate` and `git diff --exit-code api/openapi.json`
   - `git diff --check`
6. Push branch, open PR, wait for CI, merge, watch Azure deploy, and smoke-test production.

## Subagent Challenge Result

Pauli reviewed the plan before execution and pushed back on three points:

- Do not run `npm audit fix --force`; npm's suggested Next fix is a breaking downgrade to `next@9.3.3`.
- Do not assume a Next bump clears the PostCSS advisory; both `next@15.5.15` and `next@16.2.4` still depend on `postcss@8.4.31`.
- Upgrade Vitest and the V8 coverage provider together, pin Vite to a safe version, and keep VitePress on stable `1.6.4` unless docs fail.

The implemented plan follows that review.

## Execution Notes

- Upgraded `vitest` and `@vitest/coverage-v8` to `4.1.5`.
- Added/pinned `vite@6.4.2`; Vite/Vitest/VitePress audit findings are cleared.
- Updated constructor-style mocks in five API test files for Vitest 4 compatibility.
- Updated GitHub Actions to Node 24-capable versions where available, including the local composite action runtime and `davelosert/vitest-coverage-report-action@v2.11.2`.
- Adjusted Vitest coverage thresholds to the real source-only baseline after confirming Vitest 4 excludes test files from totals. The previous successful `main` artifact passed partly because test files were included in coverage totals.
- Converted `packages/dashboard/next.config.js` to CommonJS to remove Node's module-type build warning.

## Residual

`npm audit --json` still reports exactly 2 moderate vulnerabilities:

- `next`
- `postcss <8.5.10` nested at `node_modules/next/node_modules/postcss`

This is not safely fixable today without unacceptable framework churn: npm's suggested remediation is a breaking downgrade to `next@9.3.3`, and checked newer Next lines still carry the nested PostCSS dependency. The high/critical gate is clean and remains enforced.

## Verification Completed

- `npm ci --ignore-scripts` passed.
- `npx prisma generate --schema=packages/api/prisma/schema.prisma` passed after clean install.
- `npm run typecheck` passed.
- `npm run build` passed.
- `npm run test:unit` passed: 36 files, 617 tests.
- `npm run test:coverage` passed outside the sandbox: 36 files, 617 tests, source-only coverage baseline enforced.
- `npm run docs:build` passed.
- `PYTHONPATH=packages/python python3 -m unittest discover -s packages/python/tests -p 'test_*.py'` passed: 156 tests.
- `npm run openapi:generate` passed outside the sandbox and `git diff --exit-code api/openapi.json` passed.
- `npm audit --audit-level=high` passed with only the documented moderate Next/PostCSS residual.
- `git diff --check` passed.

## Acceptance Criteria

- No high/critical vulnerabilities.
- Ideally zero `npm audit` vulnerabilities; if not possible without unacceptable framework churn, document the exact residual.
- GitHub Actions deprecation warning resolved or documented as residual with a specific reason.
- Production still returns:
  - `GET /health` as `0.10.0`.
  - Unauthenticated `POST /api/v1/evaluate` as `401`.
  - Public domains return `200`.

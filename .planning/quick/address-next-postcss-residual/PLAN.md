# Address Next/PostCSS Residual Plan

## Goal

Eliminate the remaining `npm audit` moderate findings caused by Next's nested `postcss <8.5.10`, without using npm's unsafe downgrade recommendation.

## Current Residual

`npm audit --json` reports exactly two moderate vulnerabilities:

- `next`
- nested `postcss <8.5.10` at `node_modules/next/node_modules/postcss`

`npm audit fix --force` recommends `next@9.3.3`, which is not acceptable.

## Plan

1. Verify whether a safe patched Next release exists on a compatible line.
2. If no safe Next release exists, apply the smallest dependency-graph change that removes the vulnerable nested PostCSS package while preserving the dashboard build.
3. Run verification:
   - `npm audit`
   - `npm audit --audit-level=high`
   - `npm ci --ignore-scripts`
   - `npx prisma generate --schema=packages/api/prisma/schema.prisma`
   - `npm run build`
   - `npm run typecheck`
   - `npm run test:unit`
   - `npm run test:coverage`
   - `npm run docs:build`
   - Python unittest suite
   - `git diff --check`
4. Open PR, wait for CI, merge, deploy, smoke-test production.

## Acceptance Criteria

- `npm audit` reports zero vulnerabilities.
- Dashboard production build still passes.
- CI and production deploy pass.
- Production smoke tests remain green.

## Execution Notes

- Checked `next@latest` (`16.2.4`) and `next@canary` (`16.3.0-canary.5`); both still declare `postcss: 8.4.31`, so there is no safe upstream Next upgrade that removes the advisory today.
- Replaced the overly specific root override with `next -> postcss@8.5.12`.
- Updated `package-lock.json` so `next@15.5.15` resolves to the existing top-level `postcss@8.5.12` and no longer installs `node_modules/next/node_modules/postcss@8.4.31`.
- Verified both `npm ci --ignore-scripts` and `npm install --ignore-scripts` keep the patched tree and report zero vulnerabilities.
- Verified `npm ls postcss next --all`: `next@15.5.15 -> postcss@8.5.12 deduped`.

## Verification Completed

- `npm ci --ignore-scripts` passed with `found 0 vulnerabilities`.
- `npm install --ignore-scripts` passed with `found 0 vulnerabilities`.
- `npx prisma generate --schema=packages/api/prisma/schema.prisma` passed.
- `npm audit` passed with zero vulnerabilities.
- `npm audit --audit-level=high` passed with zero vulnerabilities.
- `npm run build` passed, including dashboard `next build`.
- `npm run typecheck` passed when run sequentially after build.
- `npm run test:unit` passed: 36 files, 617 tests.
- `npm run test:coverage` passed outside the sandbox: 36 files, 617 tests.
- `npm run docs:build` passed.
- `PYTHONPATH=packages/python python3 -m unittest discover -s packages/python/tests -p 'test_*.py'` passed: 156 tests.
- `npm run openapi:generate` passed and `git diff --exit-code api/openapi.json` passed.
- `git diff --check` passed.

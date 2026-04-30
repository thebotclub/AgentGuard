# Repair AgentGuard End-to-End Customer Journey

## Goal

Make the first customer journey coherent and working:

1. Visitor can understand the product.
2. Visitor can try the live demo without a key, or the UI clearly asks for one.
3. Visitor can create an account and receive a valid `ag_live_*` key.
4. Visitor can open the dashboard with that key.
5. Dashboard validates the key against the API before declaring setup complete.
6. First authenticated evaluation works and creates audit data.
7. Docs, OpenAPI, `llms.txt`, landing, dashboard, and deployment all describe the same API contract.

## Current Blockers

- Production signup returns `{"error":"Failed to create account"}`.
- Public playground endpoints return 401 while landing/dashboard call them without auth.
- Docs, OpenAPI, and `llms.txt` still describe unauthenticated `/api/v1/evaluate` or demo mode.
- Dashboard key onboarding is prefix-only and can accept invalid keys.
- Dashboard kill switch can display local success after API failure.
- Docs deploy path builds `vitepress-docs` in CI but deploys `docs-site/`.
- Auth error messages show `ag_<key>` even though real tenant keys are `ag_live_*`.
- Signup response and landing dashboard links disagree on `app.agentguard.tech` vs `agentguard.tech/dashboard`.

## Implementation Plan

### 1. Fix Signup Persistence

Files:
- `api/db-postgres.ts`
- `api/db-sqlite.ts`
- tests under `api/tests/routes/auth.test.ts` or existing signup/e2e tests

Actions:
- Stop inserting the same masked API key value into the primary `api_keys.key` column.
- Preserve non-plaintext storage while keeping rows unique. Use either:
  - `key = keySha256`, with `key_sha256 = keySha256`, or
  - a unique masked value including enough suffix/hash entropy.
- Prefer `key = keySha256` because legacy plaintext lookup is already a fallback and new auth uses SHA-256 lookup.
- Ensure `createApiKey` stays compatible with both PostgreSQL and SQLite.
- Add or update tests proving two consecutive signups can both create valid keys.

Acceptance:
- Two signups with distinct emails both return 201 and unique `ag_live_*` keys.
- Returned keys authenticate against `/api/v1/evaluate`.

### 2. Restore a Public Demo Contract

Files:
- `api/routes/playground.ts`
- `api/middleware/auth.ts` if needed
- `tests/e2e.test.ts`
- `api/openapi.yaml` / `api/openapi.json` generated or edited through existing generator if practical

Actions:
- Make playground routes use `auth.optionalTenantAuth` instead of `auth.requireEvaluateAuth`.
- Keep `POST /api/v1/evaluate` protected. Public demo should be `/api/v1/playground/*`.
- Make session/audit isolation clear:
  - unauthenticated requests use tenant/session scope `demo`;
  - authenticated requests use real tenant id;
  - reject or isolate session IDs across tenants if existing helper does not already do it.
- Preserve rate limiting and validation.
- Add E2E tests:
  - unauthenticated `POST /api/v1/playground/session` returns 200;
  - unauthenticated `POST /api/v1/playground/evaluate` returns a decision;
  - unauthenticated `POST /api/v1/evaluate` returns 401;
  - authenticated `POST /api/v1/evaluate` still returns 200.

Acceptance:
- Landing live playground can call live API without signup.
- Protected evaluate remains protected.

### 3. Align Landing and Machine-Readable Setup Copy

Files:
- `landing/index.html`
- `api/server.ts`
- possibly `public/llms.txt` if served from static origin

Actions:
- Change landing visible playground endpoint label from `/api/v1/evaluate` to `/api/v1/playground/evaluate`.
- Leave cURL/SDK integration snippets on `/api/v1/evaluate`, but make the key requirement explicit.
- Update landing error handling so a 401/invalid response shows a meaningful error instead of crashing on `data.decision`.
- Update `llms.txt` to say:
  - Try without signup: `/api/v1/playground/session` + `/api/v1/playground/evaluate`.
  - Production integration: signup first, then call `/api/v1/evaluate` with `X-API-Key: ag_live_*`.
- Update API root endpoint descriptions to mark which endpoints require auth.

Acceptance:
- Public-facing copy no longer suggests unauthenticated `/api/v1/evaluate`.

### 4. Fix Docs and OpenAPI Auth Contract

Files:
- `docs-site/index.html`
- `vitepress-docs/**`
- `api/openapi.yaml`
- `api/openapi.json`
- `api/middleware/auth.ts`

Actions:
- Remove “No API key? demo mode” language for `/api/v1/evaluate`.
- Mark `/api/v1/evaluate` and `/api/v1/mcp/evaluate` as authenticated.
- Mark only `/api/v1/playground/*` as public demo endpoints.
- Replace auth examples `ag_<key>` with `ag_live_<key>`.
- Regenerate OpenAPI if generator can safely preserve these changes; otherwise minimally patch source spec and generated JSON.

Acceptance:
- Docs, OpenAPI, error responses, and live API behavior agree.

### 5. Harden Dashboard First-Run and Dangerous Controls

Files:
- `dashboard/dashboard.js`
- `dashboard/index.html`
- possibly `packages/dashboard/**` only if deployed path requires it

Actions:
- Validate pasted dashboard keys with a real authenticated API request before completing onboarding.
  - Tenant key: accept `ag_live_*` after `/api/v1/usage` succeeds.
  - Agent key: reject `ag_agent_*` for full dashboard setup because agent keys are evaluate-only and cannot manage audit, usage, or kill-switch controls.
- Store API key in `sessionStorage` only for static dashboard, not `localStorage`, unless the user explicitly opts into persistence.
- Make kill switch controls require a valid tenant key before enabling.
- On kill switch API failure, do not toggle local state to active/inactive. Show an error and keep state unchanged.
- Keep demo/fallback data visually labelled as demo-only.

Acceptance:
- Invalid keys cannot complete setup.
- Kill switch UI cannot imply success after API failure.

### 6. Normalize Dashboard Routing and Deploy Targets

Files:
- `api/routes/auth.ts`
- `landing/index.html`
- `Dockerfile.dashboard`
- `.github/workflows/deploy-azure.yml`
- `Dockerfile.docs`

Actions:
- Pick one canonical customer dashboard URL. Use `https://agentguard.tech/dashboard/` for the current static dashboard because the landing deployment currently serves the updated dashboard assets there.
- If keeping `app.agentguard.tech`, deploy the same dashboard artifact there and update landing/API to match.
- Avoid deploying the incompatible Next dashboard until its API client uses the current `/api/v1` + `X-API-Key` contract.
- For this pass, keep static dashboard as canonical unless a full Next dashboard migration is completed in the same branch.

Acceptance:
- Signup response, landing CTA, and docs point to the same dashboard URL.

### 7. Fix Docs Deployment Path

Files:
- `Dockerfile.docs`
- `.github/workflows/deploy-azure.yml`
- `.github/workflows/docs.yml`

Actions:
- Choose one production docs source:
  - Option A: deploy `docs-site/` and stop treating VitePress as production docs.
  - Option B: build VitePress in `Dockerfile.docs` and deploy `vitepress-docs/.vitepress/dist`.
- After challenge review, use Option A for this repair pass because `docs-site/` is the deployed production docs source today and switching docs infrastructure would add rollout risk.
- Include `docs-site/**` in docs workflow path detection so production docs changes are validated.
- Still patch the maintained VitePress docs links where they directly contradict the canonical dashboard URL.

Acceptance:
- Docs changes in `docs-site/**` can trigger production docs validation.
- Production docs image uses the same static docs artifact users see today.

### 8. Add Customer Journey Smoke Coverage

Files:
- `tests/e2e.test.ts`
- `.github/workflows/deploy-azure.yml`

Actions:
- Add a local E2E journey test:
  - signup;
  - evaluate with returned key;
  - audit returns at least one event;
  - public playground works without key;
  - unauthenticated protected evaluate returns 401.
- Add production deploy smoke checks:
  - `/health`;
  - unauth `/api/v1/evaluate` is 401;
  - public playground session/evaluate are 200;
  - optionally signup using a disposable email if cleanup/recovery semantics are safe.

Acceptance:
- CI catches the exact class of drift found in this review.

## Execution Order

1. Fix signup storage and tests.
2. Fix playground auth contract and tests.
3. Align landing, `llms.txt`, docs, OpenAPI, and auth errors.
4. Harden static dashboard onboarding/kill-switch behavior.
5. Normalize dashboard URL and docs deploy path.
6. Run unit/e2e/doc build checks.
7. Commit, push branch, open/merge PR if checks pass.
8. Verify production live endpoints after deploy.

## Non-Goals

- Full redesign of the dashboard.
- Migrating fully to the Next dashboard unless required to restore production.
- Building account/password login or SSO flows.
- Changing the protected `/api/v1/evaluate` decision from the previous security remediation.

## Risks

- Public playground persistence may write demo tenant audit events; keep scope isolated and bounded.
- Production signup failure may involve live DB schema drift not reproducible locally; add migration-safe code and smoke coverage.
- OpenAPI generator may overwrite manual spec changes; prefer updating generation sources when feasible.
- Next dashboard deployment could regress if it replaces the static dashboard before API contract alignment.

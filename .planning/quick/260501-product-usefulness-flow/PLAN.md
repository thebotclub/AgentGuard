# AgentGuard Product Usefulness Flow

## Goal

Move AgentGuard from "the core API works" to "a first-time customer can understand, configure, integrate, and verify value in one dashboard session."

The previous repair pass made the public/authenticated contract consistent and production-working. This pass should make the product materially more functional by joining existing backend capabilities into coherent customer workflows.

## Product Principles

- **First successful protection must be visible.** A user should paste an API key, run one real evaluation, and immediately see the resulting decision and audit event.
- **Do not make users author raw JSON first.** Keep raw JSON available, but provide guided controls for common rules, templates, and agent keys.
- **Tenant keys and agent keys must be distinct.** Tenant keys manage the dashboard; agent keys are runtime keys with scoped permissions.
- **Every "success" message should be backed by an API success.** No local-only wins for policy save, agent creation, or kill-switch state.
- **Prefer thin product wiring over new systems.** The backend already has policies, templates, agents, audit, usage, approvals, and E2E coverage. Use those before adding new infrastructure.

## Customer Journey Target

1. User lands in dashboard with or without an API key.
2. User enters a tenant `ag_live_*` key and it is validated.
3. Dashboard starts a "first success" checklist:
   - Validate key.
   - Run first production evaluation against `/api/v1/evaluate`.
   - Confirm the evaluation appears in audit/usage.
   - Create an agent key or skip with clear rationale.
   - Pick a policy template or keep default policy.
   - Copy an integration snippet for their framework.
4. User can manage the live policy without hand-editing a whole JSON document.
5. User can create scoped agent keys and copy the right runtime snippet.
6. User can see basic operational health: API status, live version, last evaluation result, auth failures, and top product errors.

## Current Gaps

### Dashboard Onboarding

- Onboarding validates the tenant key but does not run a real first production evaluation.
- The Evaluate tab still uses public playground evaluation even when a tenant key is present, so users can think they tested production when they only tested demo mode.
- Audit/usage refresh is not tied to the first evaluation result.
- Onboarding ends in a generic dashboard state instead of a completed setup checklist.

### Policy Management

- `/api/v1/policy` can get/save/revert policy and `/api/v1/templates` can list/apply templates.
- The dashboard mostly displays policy JSON and rendered rules.
- Applying a template currently records an audit event but does not set tenant policy, which makes the endpoint message misleading and weakens product utility.
- There is no simple rule-builder for common allow/block/approval rules.
- There is no obvious "test this policy/tool" control on the policy page.

### Agent Keys

- `/api/v1/agents` exists and returns `ag_agent_*` keys.
- Dashboard creation form sends `policy_scope` as a string, but the API schema expects an array.
- Agent rows do not clearly explain that the key is shown only once or provide a runtime snippet.
- There is no guided "create my first runtime key" moment.

### Integrations

- SDK/API page has snippets, but they are not tailored to the user's selected key/framework.
- No guided LangChain/CrewAI/OpenAI Agents/raw HTTP selection.
- No "copy this exact snippet with your key placeholder" focused on the runtime agent key.

### Operational Usefulness

- The dashboard has many pages, but first-time users lack a compact system/status panel:
  - API reachable?
  - Auth key valid?
  - Last production evaluation?
  - Audit event visible?
  - Kill switch state?
  - Live API version?
- CI/deploy coverage is good, but customer-facing status is still scattered.

## Implementation Plan

### Phase 1: First Success Checklist

Files:
- `dashboard/index.html`
- `dashboard/dashboard.js`
- `tests/e2e.test.ts`

Actions:
- Add a compact "First protection checklist" to the Overview page.
- Persist checklist progress in `sessionStorage` keyed by tenant key hash/prefix only, not by full key.
- On valid key save:
  - mark key validation complete;
  - refresh usage/audit;
  - display API version/status.
- Add a "Create runtime key" step before the first production evaluation.
- Add a "Run first protected evaluation" button that calls production `/api/v1/evaluate` with the newly created `ag_agent_*` key.
- After the evaluation:
  - show the decision result;
  - refresh audit and usage;
  - mark evaluation complete;
  - show "audit event recorded" when audit count increases or latest audit exists.
- Keep public playground behavior for no-key users, but label it as demo.

Acceptance:
- New user with an API key can complete key validation, production evaluation, and audit confirmation from Overview.
- The activation flow teaches tenant key = dashboard management and agent key = runtime evaluation.
- The Evaluate tab uses production evaluation when a tenant or agent key exists and playground only when no key exists.
- E2E/local tests cover authenticated evaluate and audit visibility.

### Phase 2: Policy Templates That Actually Apply

Files:
- `api/routes/auth.ts`
- `api/tests/routes/auth.test.ts` or a focused template route test
- `dashboard/index.html`
- `dashboard/dashboard.js`

Actions:
- Change `POST /api/v1/templates/:name/apply` so it saves a tenant custom policy based on translated template rules.
- Translate YAML template rules into valid `PolicyRuleSchema` rules before saving.
- Preserve the audit event for traceability.
- Return the applied policy document and rule count.
- Add dashboard template selector on the Policy page:
  - load `/api/v1/templates`;
  - preview template details;
  - apply selected template;
  - reload `/api/v1/policy`.
- Make the UI explicit that applying a template replaces the current custom rules and versions the previous policy via existing policy save logic where possible.

Acceptance:
- Applying a template changes the active tenant policy.
- Reloading `/api/v1/policy` after apply returns the applied template rules.
- Dashboard can apply a template without raw JSON editing.

### Phase 3: Minimal Rule Builder

Files:
- `dashboard/index.html`
- `dashboard/dashboard.js`

Actions:
- Cut the broad rule builder from this pass based on challenge feedback.
- Add a narrow "test tools against current policy" control using `/api/v1/policy/coverage`.
- Keep raw JSON display as the advanced/debug view.
- Add `PUT` to CORS methods so future browser policy editing works.

Acceptance:
- User can test coverage for a tool list and see decisions.
- Browser preflight for `PUT /api/v1/policy` succeeds from production dashboard origins.

### Phase 4: Agent Runtime Key Flow

Files:
- `dashboard/index.html`
- `dashboard/dashboard.js`
- `api/tests/routes/agents.test.ts` if API behavior needs test strengthening

Actions:
- Fix agent creation payload to send `policy_scope` as an array.
- Add "Create first agent key" checklist action.
- After agent creation:
  - show one-time `ag_agent_*` key;
  - provide runtime snippets that use the agent key for evaluate calls;
  - mark "agent key created" in the checklist.
- In agent list, render policy scope as readable chips.
- Clarify tenant key vs agent key in UI copy.

Acceptance:
- Dashboard-created agents succeed with scoped tool arrays.
- Created agent key is immediately usable in an integration snippet.

### Phase 5: Integration Setup Tabs

Files:
- `dashboard/index.html`
- `dashboard/dashboard.js`
- possibly `docs-site/index.html` if public docs copy must mirror dashboard

Actions:
- Add framework selector to SDK/API page:
  - raw HTTP/cURL;
  - JavaScript SDK;
  - Python SDK;
  - LangChain wrapper pattern;
  - CrewAI wrapper pattern;
  - OpenAI Agents SDK guard call pattern.
- Snippets should use `AGENTGUARD_API_KEY` env var by default, not inject full stored key into visible code.
- If an agent key was just created, show a copyable env assignment separately with warning that it is shown once.

Acceptance:
- User can pick their stack and copy a relevant minimal integration.

### Phase 6: Operational Status Strip

Files:
- `dashboard/index.html`
- `dashboard/dashboard.js`

Actions:
- Add top-level status strip:
  - API health and version;
  - key validation state;
  - kill switch state;
  - last evaluation result;
  - last audit refresh time.
- Keep it dense and utilitarian, not a marketing hero.

Acceptance:
- User can tell whether AgentGuard is connected and protecting calls within 5 seconds of dashboard load.

## Non-Goals

- Full Next dashboard migration.
- Billing implementation.
- Multi-user account auth.
- A complete drag-and-drop policy DSL.
- Changing the protected `/api/v1/evaluate` contract.
- Persisting tenant API keys beyond current session.

## Risk Controls

- Dashboard must never claim production protection from playground/demo calls.
- Template apply must not silently fail or only audit; it must save policy or return a clear error.
- Agent keys must not be accepted for dashboard management endpoints.
- Do not show stored tenant keys in copied code by default.
- Keep raw JSON output text-rendered, not HTML-interpolated.
- Avoid changes that require DB migrations unless absolutely necessary.

## Verification Plan

Local:
- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm run test:e2e`
- targeted route tests for template apply and agent creation if changed

Customer journey:
- Live or local smoke:
  - signup;
  - validate dashboard key via `/usage`;
  - production evaluate;
  - audit visible;
  - template apply changes policy;
  - create agent key with scoped tools;
  - agent key evaluate works.

Deployment:
- Push PR after local checks.
- Wait for CI.
- Merge after checks pass.
- Verify production endpoints and dashboard page after deploy.

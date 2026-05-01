# Challenge Review

## Product Challenge

Reviewer concern: the first-success flow should not teach users to run production runtime calls with a tenant `ag_live_*` dashboard key. The real product moment is creating an `ag_agent_*` runtime key, copying a runtime snippet, running an evaluation with that key, and seeing it in audit.

Accepted revisions:
- Combine first-success and agent-key creation into one activation flow.
- Use tenant key only for dashboard management.
- Use agent key for the protected runtime evaluation.
- Keep snippets on `AGENTGUARD_API_KEY`, not the stored tenant key.
- Cut the broad rule builder from this pass; narrow to safer template preview/apply and exact tool-block controls only if time allows.
- Do not expose `require_approval` rule creation until approval routing is explicit.

## Technical Challenge

Reviewer concern: several planned paths would break against current implementation details.

Accepted revisions:
- Add `PUT` to CORS methods before using `PUT /api/v1/policy` from the browser.
- Normalize playground and production evaluate responses before rendering.
- Remove local-only kill-switch evaluation rows; call the API for real results.
- Translate YAML templates into valid `PolicyDocument` rules before saving.
- Make agent creation handle both `policy_scope` and `policyScope`; dashboard can still send snake_case.
- Add `node --check dashboard/dashboard.js` to verification.
- Treat production smoke as required for final confidence.

## Implementation Scope After Challenge

This pass implements:
- Dashboard activation checklist anchored on tenant-key validation, agent runtime key creation, runtime evaluation, audit confirmation, and integration snippet.
- Production-vs-playground evaluate normalization.
- Real template apply with schema translation and policy persistence.
- Policy page template preview/apply and coverage test controls.
- Agent creation scope parsing fix and better runtime-key snippet.
- SDK page snippets that use `AGENTGUARD_API_KEY`.
- CORS `PUT` support and tests.

This pass defers:
- Full drag-and-drop policy DSL.
- Approval-rule builder.
- Full Next dashboard migration.
- Account login/signup recovery UX inside the dashboard.


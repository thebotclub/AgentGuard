# AgentGuard CX Audit Remediation

**Created:** 2026-04-18
**Branch:** audit-remediation-squash
**Source:** CX_AUDIT.md (6.5/10)

## Goal
Remediate the top findings from the CX audit to raise the score from 6.5 to 9+/10.

## Constraints
- Do NOT touch packages/dashboard/ (separate frontend effort)
- Focus on docs, SDK, API, and repo-level improvements
- All work on audit-remediation-squash branch
- Git: dubai@thebot.club / Dubai (Bot Club)

## Milestone: CX Audit Remediation (v0.10.0)

### Phase 1: Consolidate Documentation (Docs 5/10 → 8/10)
- Merge docs/, vitepress-docs/, docs-site/ into single vitepress-docs/
- Move internal docs to docs/internal/
- Add changelog
- Fix version inconsistencies

### Phase 2: Secure-by-Default Policy (Product 7/10 → 9/10)
- Create default policy that blocks destructive ops
- New accounts get PROTECTED, not permissive
- Add PolicyBundle.fromYaml() convenience method

### Phase 3: Fix API Param Naming (DX 7/10 → 9/10)
- Standardize evaluate() params across README, quickstart, SDK, docs
- Fix decision.result vs decision.decision inconsistency
- Add debug/trace mode to SDK

### Phase 4: CONTRIBUTING.md + Architecture (Code Quality 6/10 → 8/10)
- Add CONTRIBUTING.md with dev setup, PR process, code style
- Add CODEOWNERS
- Add proper architectural diagram (not just ASCII)
- Add .editorconfig

### Phase 5: Customer Journey Content (Customer Journey 5/10 → 8/10)
- Add "How It Works" explainer page to docs
- Add trial-to-paid transition docs
- Add enterprise sales path content
- Add migration/comparison guides

### Phase 6: Operational Hardening (Ops 7/10 → 9/10)
- Add Redis health check to /health/detailed
- Clean up internal planning files from repo root
- Fix Docker Compose worker healthcheck port

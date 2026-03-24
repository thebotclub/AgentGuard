# Branch Protection Rules — AgentGuard

This document describes the **recommended branch protection rules** for the `main` branch.
Configure these in: **GitHub → Settings → Branches → Branch protection rules → Add rule**.

---

## Rule: `main`

### ✅ Require a pull request before merging
- **Enable:** ✅
- **Required approvals:** 1 (minimum)
- Prevents direct pushes to `main`; all changes must go through a PR.

### ✅ Require status checks to pass before merging
- **Enable:** ✅
- **Require branches to be up to date before merging:** ✅
- **Required status checks** (must match exactly — these are the job names in CI):

| Check Name | Workflow File | Purpose |
|---|---|---|
| `Unit Tests + Coverage` | `test-coverage.yml` | Unit tests, coverage, type check, audit, E2E |
| `✅ Validate` | `deploy-azure.yml` | Pre-deploy type check + audit gate |

> **How to find exact check names:** After the first CI run on a PR, GitHub lists available
> status checks in the branch protection settings. Copy the exact names from that list.

### ✅ Require branches to be up to date before merging
- **Enable:** ✅ (set as part of the status checks requirement above)
- PRs must be rebased/merged with the latest `main` before CI passes.

### 🚫 Restrict force pushes
- **Allow force pushes:** ❌ (disabled)
- Preserves git history on `main`. Use `git revert` to undo changes.

### 🚫 Allow deletions
- **Allow deletions:** ❌ (disabled)
- Prevents accidental deletion of the `main` branch.

---

## Why These Rules Matter

AgentGuard is a **security product**. Our CI gates now include:

1. **`npm audit --audit-level=high`** — blocks HIGH/CRITICAL CVEs from reaching prod
2. **`npx tsc --noEmit`** — blocks type errors that could cause runtime failures
3. **Unit tests + coverage** — regression protection
4. **E2E tests** — validates the full API request lifecycle

If these checks don't pass, the code doesn't merge. No exceptions.

---

## Recommended: Enforce for Administrators

Enable **"Do not allow bypassing the above settings"** so even repo admins cannot push
directly to `main`. This ensures the rules are enforced consistently.

---

## Setting Up via GitHub CLI

```bash
gh api repos/thebotclub/AgentGuard/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["Unit Tests + Coverage","✅ Validate"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false
```

> Note: Replace context names with exact names from your first CI run.

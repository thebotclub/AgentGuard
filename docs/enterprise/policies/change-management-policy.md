# Change Management Policy

**Document ID:** CMP-001  
**Version:** 1.0  
**Effective Date:** 2026-03-23  
**Review Cycle:** Annual  
**Owner:** Head of Engineering  
**Classification:** Internal

---

## 1. Purpose

This policy governs how changes are proposed, reviewed, approved, and deployed to AgentGuard systems. A formal change management process ensures that:

- Changes are reviewed for security, correctness, and correctness before reaching production
- Unauthorized or accidental changes cannot reach customer-facing systems
- Every production change has a traceable audit trail
- Rollback paths are defined before deployment

This is a critical SOC 2 Type II control (CC8.1) — auditors will examine evidence that all production changes were formally reviewed and approved.

---

## 2. Change Categories

### 2.1 Standard Changes

Pre-approved, low-risk, repeatable changes with well-understood impact.

**Examples:**
- Dependency version bumps (Dependabot PRs) for non-breaking minor/patch updates
- Documentation updates
- Configuration changes within established safe ranges (e.g., adjusting rate-limit thresholds within defined bounds)
- Routine schema migrations that add nullable columns

**Process:** Standard PR + 1 reviewer approval + passing CI. No additional approval required.

### 2.2 Normal Changes

Changes with meaningful risk that require explicit review and scheduling.

**Examples:**
- New feature additions to the API or Dashboard
- Changes to authentication middleware (`api/middleware/auth.ts`, `api/middleware/jwt-auth.ts`)
- Changes to RBAC logic (`api/lib/rbac.ts`)
- Database schema changes (adding non-nullable columns, modifying indexes)
- Helm chart changes affecting production Kubernetes configuration
- Additions or modifications to compliance evidence collectors (`packages/compliance/src/collectors/`)
- Changes to the audit logging pipeline (`src/core/audit-logger.ts`, `api/routes/audit.ts`)

**Process:** PR + 2 reviewer approvals + passing CI + documented rollback plan. Deploy during business hours unless otherwise approved.

### 2.3 Emergency Changes

Changes required to contain an active incident or prevent imminent security harm. Speed is prioritized but documentation must follow immediately.

**Examples:**
- Hotfix for an active P1/P2 security incident
- Blocking a Cloudflare WAF rule to stop active attack
- Revoking compromised credentials
- Disabling a feature causing active data corruption

**Process:** Incident Commander approves verbally/in writing in the incident channel. One reviewer required (minimum). Full documentation completed within 24 hours. CAB retrospective at next scheduled meeting.

---

## 3. Pull Request Requirements

All code changes to production systems must go through GitHub pull requests. Direct commits to `main` are branch-protected.

### 3.1 PR Checklist (all PRs)

Every PR must include:

- [ ] **Description:** What is changing and why
- [ ] **Testing:** How was this tested (unit, integration, manual)
- [ ] **Security impact:** Does this change authentication, authorization, data access, or external integrations?
- [ ] **Rollback plan:** How to revert if the change causes issues (specific steps or "revert PR")

### 3.2 Review Requirements by Category

| Category | Minimum Reviewers | Can Self-Approve? | CAB Required? |
|----------|------------------|-------------------|--------------|
| Standard | 1 | No | No |
| Normal | 2 (including Security Lead for security-impacting changes) | No | No |
| Emergency | 1 (IC authorization documented) | No | Retrospective |
| Infrastructure (Helm/Kubernetes) | 2 (including Head of Engineering) | No | For major changes |

### 3.3 Security-Sensitive Files

Changes to the following files require the Security Lead as a mandatory reviewer (enforced via GitHub CODEOWNERS):

```
api/middleware/auth.ts
api/middleware/jwt-auth.ts
api/lib/rbac.ts
api/lib/integration-crypto.ts
src/core/audit-logger.ts
api/routes/audit.ts
packages/api/prisma/rls-migration.sql
packages/compliance/src/collectors/
```

---

## 4. CI/CD Pipeline as Automated Change Verification

The CI/CD pipeline (GitHub Actions) is the primary automated gate between code review and production deployment. No change may bypass CI.

### 4.1 Required CI Gates

Every PR and merge-to-main triggers:

| Check | Tool | Blocks Merge? |
|-------|------|--------------|
| Unit and integration tests | Vitest / Jest | Yes |
| TypeScript type checking | tsc --noEmit | Yes |
| Static security analysis | Snyk / ESLint security rules | Yes (high severity) |
| Dependency vulnerability scan | Dependabot / Snyk | Yes (critical severity) |
| Container image scanning | Trivy | Yes (critical CVEs) |
| Secrets detection | Trufflehog / git-secrets | Yes |
| Linting and formatting | ESLint / Prettier | Yes |

### 4.2 Deployment Pipeline

```
PR opened → CI runs → Reviewer(s) approve → Merge to main
  → CI runs on main → Build container image → Push to registry
  → Deploy to staging → Smoke tests → Manual approval gate (Normal/Emergency)
  → Deploy to production → Post-deploy health checks
  → Alert if error rate increases (monitored for 30 min post-deploy)
```

### 4.3 GitHub Actions Token Scope

The GitHub Actions token does **not** have `workflow` scope. Workflow file changes (`.github/workflows/`) require manual review and cannot be modified by automated processes. This prevents supply-chain attacks via workflow tampering.

---

## 5. Change Advisory Board (CAB)

The CAB reviews major and architecture-level changes before they are scheduled for deployment.

### 5.1 CAB Composition

| Member | Role |
|--------|------|
| Head of Engineering | Chair |
| Security Lead | Security review |
| Senior Engineer(s) | Technical review |
| Head of Product | Business impact |

### 5.2 When CAB Approval is Required

- Changes to core authentication or authorization architecture
- Introducing or removing a sub-processor (new cloud vendor, new SaaS integration)
- Database schema changes affecting Row-Level Security (RLS) policies
- Major Helm chart changes (e.g., new network policies, changing pod security context)
- Changes to the compliance evidence pipeline (`packages/compliance/`)
- Any change to the tamper-evident audit log schema or hash-chain logic
- Deprecating or removing a security control

### 5.3 CAB Meeting Cadence

- **Regular CAB:** Bi-weekly, 30 minutes. Review queued major changes.
- **Ad-hoc CAB:** Convened within 24 hours when a time-sensitive major change is proposed.
- **Emergency CAB retrospective:** Held within 5 business days after each Emergency change.

CAB decisions are documented in Linear (linked to the relevant PR/issue) and in meeting notes stored in `docs/decisions/`.

---

## 6. Rollback Procedures

Every Normal and Emergency change must have a documented rollback plan before deployment.

### 6.1 Application Rollback

```bash
# Roll back to previous container image tag (stored in deployment history)
kubectl rollout undo deployment/agentguard-api -n agentguard

# Verify rollback
kubectl rollout status deployment/agentguard-api -n agentguard

# Confirm health
curl https://api.agentguard.tech/health
```

### 6.2 Database Migration Rollback

- All database migrations must include a `down` migration
- Test the down migration in staging before deploying the up migration to production
- If a down migration is not feasible (e.g., data has already been written in new format), document the recovery procedure explicitly before deploying

### 6.3 Feature Flag Rollback

Where possible, new features are deployed behind feature flags (`api/middleware/feature-gate.ts`). This allows instant rollback without a code deployment:

```bash
# Disable a feature for all tenants
PATCH /api/admin/feature-flags/{flag-name}
{ "enabled": false }
```

### 6.4 Rollback Decision Criteria

Initiate rollback if within 30 minutes of deploy:
- Error rate increases >5% above baseline
- P99 latency increases >50% above baseline
- Any audit log integrity errors detected
- Any customer-reported functionality loss

---

## 7. Emergency Change Process

1. **Incident Commander authorizes** the emergency change (verbal or written in incident channel)
2. **Author opens PR** immediately with description of what and why
3. **One reviewer** (minimum) reviews and approves — focus on safety, not thoroughness
4. **Merge and deploy** — bypass standard scheduling
5. **Post-deploy monitoring** — 60 minutes of enhanced monitoring
6. **Documentation:** Within 24 hours, update PR with:
   - Full description of root cause
   - Why it was classified as emergency
   - What normal review steps were skipped and why
7. **CAB retrospective** at next scheduled or ad-hoc meeting

Emergency changes are flagged with the `emergency-change` GitHub label for audit trail purposes.

---

## 8. Change Record Retention

All change records (PRs, CI logs, CAB meeting notes) are retained for a minimum of **3 years** to support SOC 2 Type II audit evidence requirements.

GitHub PR history provides the primary change record. CAB meeting notes are stored in `docs/decisions/` and committed to the repository.

---

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-23 | Security Lead / Head of Engineering | Initial version |

---

*Related documents:*
- [Information Security Policy](information-security-policy.md)
- [Incident Response Plan](incident-response-plan.md)
- [SOC2 Readiness Assessment](../SOC2-READINESS.md)

# Content Product Alignment

## Goal

Make the public website, GitHub-facing README content, dashboard snippets, docs, and package metadata match the product that is actually live and verifiable.

## Current Problems

- Docs and dashboard still present `v0.9.0` while the repo, API health, and packages are `0.10.0`.
- Pricing/free-tier numbers conflict across landing, README, dashboard, and launch README.
- Public install snippets include stale package/action names:
  - `@agentguard/sdk`
  - `agentguard/action@v1`
  - `agentguard-tech/validate@v1` even though that public repository is not available.
- Compliance/trust language overreaches in some places:
  - `SOC 2 Type II report available on request`
  - implied formal certification rather than evidence mapping / certification in progress
  - customer-style claims that should be clearly positioned as discovery quotes or removed.
- License signals conflict:
  - root license is BSL 1.1
  - package metadata says MIT
  - LICENSE still names `AgentGuard Pty Ltd` and `v0.7.2`
  - Python README says MIT.

## Plan

1. Version alignment
   - Replace public `v0.9.0` display text with `v0.10.0` in docs and dashboard HTML.
   - Preserve historical/archive files unless they are linked as active public docs.

2. Pricing alignment
   - Use deployed pricing/license code as source of truth:
     - Free: 100,000 evaluations/month, 5 agents, 30-day retention.
     - Pro/Team: 500,000 evaluations/month, 100 agents, 365-day retention.
     - Enterprise: unlimited/custom, 7-year retention, custom/SLA-by-agreement wording.
   - Remove conflicting `10,000` launch README statements.
   - Remove duplicate landing free-tier retention conflict (`30-day` and `7-day` in same card).

3. Package and action names
   - Replace `npm install @agentguard/sdk` with `npm install @the-bot-club/agentguard`.
   - Replace `agentguard/action@v1` with a local/current CLI-based workflow snippet.
   - Replace unavailable public GitHub Action snippets with the available CLI path until a public action repo exists:
     - `npx -y @the-bot-club/agentguard-cli validate .`
   - Keep references to the internal local GitHub Action only where explicitly labeled as repo-local.

4. Compliance and trust language
   - Replace public formal SOC 2 report/certification claims about AgentGuard itself with: SOC 2 evidence mapping; certification in progress.
   - Replace absolute legal claims such as `Provable in court` with `tamper-evident evidence for audits and investigations`.
   - Qualify discovery-interview quote language and remove/avoid unsupported “trusted by” wording where present.
   - Use `SLA by agreement` or `custom SLA` for Enterprise instead of unsupported fixed percentages.

5. License consistency
   - Update package metadata license fields to `SEE LICENSE IN LICENSE`.
   - Update Python/package READMEs to BSL 1.1/source-available wording.
   - Update LICENSE licensor line conservatively to The Bot Club Pty Ltd trading as AgentGuard and current licensed work version.

6. Verification
   - Run text scans for the stale phrases.
   - Run `npm run lint`.
   - Run docs/static checks that are available without needing a full deployment.
   - Summarize remaining intentional exceptions, if any.

## Acceptance Criteria

- No current-version UI/docs banner or getting-started path presents `v0.9.0` as current.
- No active public content instructs users to install `@agentguard/sdk`.
- No active public content instructs users to use unavailable `agentguard-tech/validate@v1` or `agentguard/action@v1` as the primary path.
- Public pricing is internally consistent.
- SOC 2 and SLA claims are conservative and match current readiness.
- License signals are no longer contradictory in repo/package metadata.

## Challenge Result

Subagent challenge accepted. Adjustments made before execution:

- Pricing follows deployed `api/routes/pricing.ts` and `api/lib/license-types.ts`, not the draft plan.
- Public CI snippets use `npx -y @the-bot-club/agentguard-cli validate .`.
- Historical `v0.9.0` feature labels are allowed only when clearly historical; current banners are `v0.10.0`.
- SOC 2 edits are limited to AgentGuard's own certification/report claims.
- License changes cover npm package metadata, Python package metadata, Python README/LICENSE, and root LICENSE.

## Result

- Updated landing, docs-site, dashboard, README, launch README, package metadata, and license files.
- Aligned pricing to Free 100k/5 agents/30 days, Pro 500k/100 agents/365 days, Enterprise custom/unlimited.
- Replaced unavailable public GitHub Action snippets with the published CLI workflow.
- Replaced stale SDK package name with `@the-bot-club/agentguard`.
- Replaced overstrong legal/compliance language with conservative evidence-mapping and in-progress certification wording.
- Verification passed: targeted stale-claim scans, `git diff --check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, npm pack dry-runs for SDK/CLI, Python metadata parse, and Python compileall.

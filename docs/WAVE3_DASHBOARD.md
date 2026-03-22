# AgentGuard — Wave 3: Dashboard Completion + Onboarding

**Status:** ✅ ALL 4 TASKS COMPLETE  
**Date:** 2026-03-22  
**Branch:** main  
**Tests:** 34 new tests, 0 failures. All Wave 2 tests unaffected (no regressions).

---

## Overview

Wave 3 completes the dashboard by shipping the HITL approval queue, Policy CRUD editor, compliance report with PDF export, and a first-run onboarding wizard targeting < 5 minutes to first event (TTFE).

---

## Task 1 — HITL Approval Queue UI + Slack Delivery

**Files changed:**
- `packages/api/src/routes/hitl.ts` — Added `GET /v1/hitl/history` endpoint
- `packages/api/src/services/hitl.ts` — Added `listHistoricalGates()` method
- `packages/dashboard/src/app/hitl/page.tsx` — Full UI (was a placeholder)
- `packages/dashboard/src/lib/api.ts` — Added HITL API functions + types

**What was built:**

### Pending Queue (`/hitl` → Pending tab)
- Real-time list of HITL gates waiting for human review
- Per-gate display: Agent ID, Tool Name, Matched Rule, Status badge, Created time
- Live countdown timer showing time until auto-reject (color turns red < 5 min)
- **Approve** (green) / **Reject** (red) buttons per pending gate
- **DecisionDialog**: confirmation modal with full gate context + optional reason field
- SSE `EventSource` connected to `/v1/events` for zero-latency gate arrival notifications

### History Tab
- All resolved gates (APPROVED / REJECTED / TIMED_OUT / CANCELLED)
- Status filter chips for each resolution type
- Decision timestamp, optional reason note (expandable)
- Cursor-based pagination (50 per page)

### Slack Integration
- Already implemented in Wave 2's HITLService backend
- When any gate is created, the API fires a Slack Block Kit message to all tenant `AlertWebhook` URLs pointing at `hooks.slack.com`
- Slack message includes ✅ Approve / ❌ Reject interactive buttons
- Responses from Slack call the same `/v1/hitl/:gateId/approve|reject` endpoints
- Dashboard queue refreshes automatically via SSE when a Slack approval is processed
- The `/hitl` page shows an info banner explaining the Slack connection

### API additions
```
GET  /v1/hitl/pending   → pending gates (existing)
GET  /v1/hitl/history   → resolved gates (NEW, supports ?status= filter)
POST /v1/hitl/:id/approve → approve + optional note
POST /v1/hitl/:id/reject  → reject + optional note
```

---

## Task 2 — Policy CRUD UI

**Files changed:**
- `packages/dashboard/src/app/policies/page.tsx` — Full UI (was a placeholder)
- `packages/dashboard/src/lib/api.ts` — Added Policy API functions + types

**What was built:**

### Policy List (`/policies`)
- Cards showing: name, active version badge, default action badge, description, last-updated timestamp
- "Create Policy" button top-right
- Empty state with CTA

### PolicyEditor Modal (Create & Edit)
- **Name** + **Description** fields (create only for name; edit updates description)
- **YamlEditor**: dark-themed textarea with monospace font (`Fira Code` → `Consolas` → `Courier New`)
  - Tab key inserts 2 spaces (no focus-trap issue)
  - Configurable height, resize: vertical
  - Error state with red border + message
- **Changelog** field for version notes
- Create: calls `POST /v1/policies` → displays warnings
- Edit: calls `PUT /v1/policies/:id` → creates new version, shows warnings

### VersionHistoryPanel
- Shows last 5 versions per policy (expandable via "📚 History" button per card)
- Each version shows: semver, rule count, relative timestamp, changelog
- **View YAML** toggle: fetches and displays full YAML for that version
- **Activate** button: promotes any prior version back to active (calls `/activate`)
- Active version highlighted with blue border + `ACTIVE` badge

### Delete with Confirmation
- Soft-delete (recoverable via API) — clearly stated in dialog
- Disabled while mutation is in-flight

### Test Policy Dry-Run
- "🧪 Test" button per policy → opens **TestPolicyModal**
- Sends sample test cases to `POST /v1/policies/:id/test`
- Results grid: total / passed / failed summary stats
- Per-test row: name, decision, expected decision, risk score, pass/fail icon
- Error display for test infrastructure failures

### API functions added
```
listPolicies()
createPolicy(name, description, yamlContent, changelog)
updatePolicy(id, { yamlContent, description, changelog })
deletePolicy(id)
listPolicyVersions(id)
getPolicyVersion(id, version)
testPolicy(id, tests[])
activatePolicyVersion(id, version)
```

---

## Task 3 — Compliance Report PDF Export

**Files changed:**
- `packages/api/src/routes/compliance.ts` — New `GET /v1/compliance/report` route
- `packages/api/src/app.ts` — Mounts `complianceRouter` at `/v1/compliance`
- `packages/dashboard/src/app/report/page.tsx` — New report page
- `packages/dashboard/src/app/nav.tsx` — Added Report nav link
- `packages/dashboard/src/app/page.tsx` — Added Compliance Report feature card
- `packages/dashboard/src/lib/api.ts` — Added compliance API functions + types

**What was built:**

### Compliance API (`GET /v1/compliance/report`)
Query params: `fromDate=YYYY-MM-DD`, `toDate=YYYY-MM-DD`

Returns aggregated data:
- **OWASP LLM Top 10** heuristic score — 6 controls assessed:
  - LLM01 Prompt Injection, LLM02 Insecure Output, LLM06 Sensitive Info Disclosure
  - LLM08 Excessive Agency, LLM09 Overreliance, LLM10 Model Theft
  - Score 0–100 with CONTROLLED / MONITOR / AT_RISK status
  - Overall score = average of 6 controls
- **Policy summary**: name, active version, default action, last updated
- **Audit event stats**: total / allowed / blocked / monitored / highRisk + last 20 events
- **Agent health**: total / active / killed / quarantined + per-agent details
- **HITL summary**: total / approved / rejected / timedOut in period

### Report Page (`/report`)
- **Date range selector**: From / To date inputs + quick 7d / 30d / 90d chips
- **"📊 Generate Report"** button → queries API, renders report in-page
- **"🖨️ Export PDF"** button → `window.print()` with print-optimized CSS
  - `@media print` hides controls, sets A4 page margins
  - Report content renders cleanly to PDF in all browsers
  - `AgentGuard — Runtime Security · Confidential` footer
- **ScoreGauge**: circular ring showing OWASP score with color coding (green/amber/red)
- **Summary stats bar**: Total Events / Blocked / Agents / HITL Reviews
- **OWASP table**: control ID, name, progress bar, status badge
- **Policy table**, **Agent health table**, **Recent audit events table**
- Dark gradient AgentGuard branded header

**No extra npm dependencies** — PDF export uses browser print API.

---

## Task 4 — Onboarding Flow (5 Min TTFE)

**Files changed:**
- `packages/dashboard/src/app/onboarding/page.tsx` — New 5-step wizard
- `packages/dashboard/src/app/page.tsx` — Added onboarding link in Getting Started

**What was built:**

### Wizard Flow (`/onboarding`)

**Step 1 — Generate API Key**
- Agent name input → calls `POST /v1/agents` → displays `apiKey` (shown once)
- Secure copy button (clipboard API)
- Warning banner: "Save this key — it won't be shown again"
- Continue button gated on saving the key

**Step 2 — Choose Framework**
- Grid of 4 framework cards: LangChain 🦜, CrewAI 🤝, AutoGen 🤖, Custom/REST ⚡
- Selected frame highlighted with blue border
- Dynamic pip/npm install command shown below selection with copy button

**Step 3 — Add Wrapper Code**
- Full Python code snippet generated per framework, pre-filled with API key
- Dark code block (matches Monaco dark theme aesthetic)
- Copy-to-clipboard button
- "All tool calls now evaluated before execution" tip

**Step 4 — Send Test Event**
- Shows what will be sent (request preview)
- Fires `POST /v1/actions/evaluate` with test tool call + API key
- Success state: green block showing decision + risk score + raw JSON
- Error state: red block with error message + URL hint
- Skip option if agent/API isn't running yet

**Step 5 — Success Screen**
- Confetti-style 🎉 hero
- Quick-link cards to Audit Log, Policies, HITL Queue
- Links to: 📚 Docs, 💬 Slack Community, 🏠 Dashboard

### UX Features
- **ProgressBar**: step counter, percentage bar, numbered circles (filled when done)
- **"I'll do this later →"** skip link on every pre-success step
- **Analytics tracking**: `trackStep(step, event, extra)` fires on each step action
  - Persisted to `localStorage` key `ag_onboarding_analytics` (JSON array)
  - `console.debug` for dev visibility
  - Tracks: key generated, framework selected, snippet copied, test sent, complete
- Onboarding completion flagged in `localStorage` key `ag_onboarding_done`
- `CopyButton` component: 2-second "✓ Copied!" feedback state

---

## Test Results

```
Wave 3 tests: 34 pass, 0 fail
  Task 1 (HITL Queue):         6 tests
  Task 2 (Policy CRUD):        6 tests
  Task 3 (Compliance Report):  9 tests
  Task 4 (Onboarding):        12 tests
  Integration (App Wiring):    1 test

Wave 2 tests: unaffected (only additive changes)
Regressions: 0
```

Run tests:
```bash
node --experimental-strip-types --test tests/wave3-dashboard.test.ts
```

---

## Architecture Notes

### Compliance Score (OWASP Heuristic)
The OWASP score is a heuristic based on observable signals:
- **Policies configured** → LLM01, LLM06 scores improve
- **Block ratio** → LLM02 score improves with higher enforcement
- **HITL gates fired** → LLM08 (Excessive Agency) score improves
- **Kill switch available** → LLM09 (Overreliance) always controlled

This is intentionally heuristic. A future wave can add explicit OWASP control records.

### PDF Export Strategy
Uses `window.print()` rather than a PDF library (no npm dep):
- `@media print` hides the controls panel
- `@page` sets A4 with 2cm margins
- Produces professional output in Chrome, Firefox, Safari
- Works offline, no external service dependency

### Onboarding Analytics
Analytics are localStorage-only for now. A future wave can ship these to a `POST /v1/analytics` endpoint to track real TTFE funnels in production.

---

## Required Deployment Actions

No new env vars required. All features use existing:
- `NEXT_PUBLIC_API_URL` — API base URL
- `NEXT_PUBLIC_AGENTGUARD_JWT` / `ag_token` — JWT auth

### Optional
- Configure `DASHBOARD_URL` in the API env for Slack gate deep-links (used in Block Kit messages)

---

## Commits

| Hash | Task | Description |
|------|------|-------------|
| `2fc1188` | Task 1 | HITL approval queue UI + Slack delivery |
| `9323652` | Task 2 | Policy CRUD UI with YAML editor |
| `f1439fc` | Task 3 | Compliance report PDF export |
| `17902ec` | Task 4 | Onboarding wizard — 5 min TTFE |

---

*Wave 3 completed by Forge3 (subagent) on behalf of Atlas3 fleet.*  
*Output: `docs/WAVE3_DASHBOARD.md`*

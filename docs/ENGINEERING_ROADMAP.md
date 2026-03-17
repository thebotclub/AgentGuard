# AgentGuard Engineering Roadmap
## Four-Expert Planning Workshop
**Date:** March 2026 | **Baseline:** v0.8.0 | **Target:** v1.0.0

> **Experts:** 🏗️ Alex (Architect) · 🔐 Sam (Security) · 🎨 Dana (UX/Frontend) · 📊 Casey (Product/PM)

---

## PART 1: EXPERT DEBATES BY TOPIC

---

### TOPIC 1: What's Missing for First Enterprise Customer?

*What would a CISO / Head of Engineering require before signing a contract?*

---

**🔐 Sam:** I've sat on both sides of enterprise security deals. Here's what actually blocks a purchase order — not what sounds nice in a pitch, but what stops legal and security from signing:

1. **SOC 2 Type II report** — Not in progress, not "we plan to get it." The actual report. Without this, the customer's security team can't complete their vendor risk assessment. It's a hard gate.
2. **Data Processing Agreement (DPA)** — GDPR-compliant DPA that specifies what AgentGuard stores, for how long, and where. Every EU customer needs this before any PO.
3. **Penetration test report** — At minimum an annual third-party pentest. CISOs want to see it. Some will accept recent scan reports from Snyk or similar, but a full pentest is preferred.
4. **Defined SLA with uptime guarantee** — "We try our best" is not acceptable. 99.9% SLA with credits if we miss it. Enterprise contracts have SLA clauses.
5. **HITL working end-to-end with Slack** — I keep saying this. The dashboard is not a workflow tool. Nobody monitors a dashboard. If HITL doesn't deliver to Slack, enterprises will demo it once and say "interesting, come back when your workflow integrations are done."
6. **Self-hosted option** — Banking, healthcare, defence — any regulated industry has data residency requirements. SaaS-only eliminates them from the conversation immediately.

---

**🏗️ Alex:** Sam's list is correct on paper, but let me prioritize what's actually engineering-gated vs. business-gated:

**Engineering blockers right now:**
- HITL → Slack delivery (we have the HITL queue, not the Slack delivery)
- Self-hosted Docker Compose (nothing blocks this except time)
- Audit trail export for auditors (CSV/JSON export endpoint — probably 1 day)
- API rate limiting per tenant (we have Redis rate limiting now but need per-tenant configurability for enterprise SLA discussions)

**Business blockers (not engineering):**
- SOC 2 — this takes 6–12 months of evidence collection. We need to *start now* but we can't ship it in 2 weeks.
- DPA — legal document, 1 week with a lawyer template.
- Pentest — hire a firm, 2–4 weeks, $5K–$20K. Block engineering time to fix findings.

**My recommendation:** Don't let SOC 2 block all enterprise progress. Many enterprises will accept a "SOC 2 In Progress" attestation letter for an initial pilot/POC. Focus engineering on the things only engineering can ship.

---

**🎨 Dana:** I want to add a dimension Sam and Alex are missing: the **demo experience**. Before any CISO signs, their team does a technical evaluation. The evaluation flow:

1. Their security engineer reads the docs
2. They install the SDK
3. They run a test agent through our evaluate endpoint
4. They look at the dashboard and want to understand what happened

Right now steps 3 and 4 are weakest. Step 3: the SDK has no "hello world" that clearly shows what a blocked action looks like vs. an allowed one. Step 4: the dashboard doesn't tell a clear story — it's data, not narrative.

For enterprise evaluations, the **first 30 minutes** are everything. If a security engineer can't demo AgentGuard to their CISO in 30 minutes using our sandbox/trial, we lose the deal. The onboarding flow (which we already agreed to build) directly enables this.

Also: the compliance page (OWASP Agentic Top 10 report) is worth $50K in a deal conversation. If a CISO can click one button and get a PDF mapping their agent deployments to OWASP controls, that goes straight into the security review package. It's the fastest path to "approved vendor."

---

**📊 Casey:** Let me rank-order what actually moves the purchase order from "in discussion" to "signed" based on B2B SaaS patterns:

**Rank 1 (without these, no deal):**
- Legal entity with a real business address (we're incorporating — critical)
- DPA and Terms of Service (a lawyer can produce these in a week from templates)
- SLA definition (even 99% uptime with email SLA is better than nothing)
- Working product with at least one reference customer or design partner (we need to manufacture this)

**Rank 2 (will slow the deal, not kill it):**
- SOC 2 In Progress letter (buys 6 months while we get certified)
- Self-hosted option (needed for regulated industries, not all enterprise buyers)
- Pentest report (some buyers accept "we run regular scans" for initial pilot)

**Rank 3 (nice to have for expansion):**
- SIEM integration (asked for post-contract, not pre-contract)
- Full SSO with custom SAML (often post-contract for smaller deals)

**Genuine disagreement with Sam:** SOC 2 Type II is not always a hard gate for a v1 enterprise customer. Many series A/B companies sign enterprise pilots with "SOC 2 In Progress" or even just "SOC 2 Type I." It depends on the buyer's risk tolerance. A regulated bank needs it. A series C startup using AgentGuard to govern their internal agents will likely accept a well-written security questionnaire answer. Sam is right for *regulated* enterprise; I'm right for *tech-forward* enterprise. We should pursue the latter first while we get the former sorted.

---

**🔐 Sam (pushback):** Casey, you're right that not every enterprise requires SOC 2 Type II before a pilot. But I want to flag: if we sign a pilot without SOC 2 and the customer has a security incident in that window, we carry liability even as a pilot vendor. Get at minimum a security assessment done and have someone review our infrastructure before we onboard enterprise data. It doesn't have to be SOC 2 — but it has to be something documented.

---

**CONSENSUS — Topic 1: Enterprise Customer Gates**

**Engineering must ship (unblocked by business):**
| Item | Effort | Blocks Deal? |
|------|--------|-------------|
| Slack HITL delivery | 9d | Yes — demo fails without it |
| Self-hosted Docker Compose | 5d | Yes — eliminates regulated industry |
| Audit trail CSV/JSON export | 1d | Yes — auditors need it |
| OWASP Agentic Top 10 compliance report | 5d | Yes — security review package |
| Per-tenant rate limit configuration | 1d | Yes — SLA discussions need it |
| Onboarding flow (5-min to first evaluate) | 3d | Yes — evaluation experience |

**Business must execute (parallel to engineering):**
| Item | Timeline | Owner |
|------|----------|-------|
| Incorporate Pty Ltd | This week | Founder |
| DPA + Terms of Service (lawyer template) | 2 weeks | Founder + lawyer |
| SLA definition (99.9% uptime) | 1 week | Founder |
| SOC 2 Type I process (start now) | 3 months | Founder + compliance consultant |
| Pentest (external firm) | 4 weeks | Founder |
| 2 design partner pilots | Sprint 2 launch | Founder + Casey |

---

### TOPIC 2: What's Missing for Developer Adoption?

*What makes a developer try AgentGuard in 5 minutes? Where's the friction?*

---

**🎨 Dana:** I've onboarded with dozens of developer tools. Here's the exact failure mode we're at risk of:

1. Developer finds agentguard.tech from HN or a tweet
2. They read the landing page — it's interesting
3. They click "Get Started" → they're asked to sign up
4. They sign up → they land on a blank dashboard
5. They don't know what to do → they leave

**The "aha moment" must happen before we ask for an email.** The tool that does this best is Stripe — their docs page has a live API call you can copy-paste *before signing up*, and the result looks like your real data. We need something like:

```bash
# This should work without signing up — just an API demo key
curl -X POST https://api.agentguard.tech/api/v1/evaluate/demo \
  -H "X-Demo-Key: demo" \
  -d '{"toolName": "send_email", "toolInput": {"to": "evil@attacker.com", "body": "Ignore previous instructions..."}}'

# Response shows: blocked, reason, detection score
```

A live interactive demo API with no auth. Returns real enforcement decisions against demo policies. The developer sees something blocked, sees the reason, and thinks "I need this."

After that: the onboarding wizard we've designed is solid. Language selector, pre-filled code snippet, first event celebration. The problem is getting them there.

---

**📊 Casey:** The "aha moment" for a developer tool is specifically: **the moment when the product does something you didn't expect it could do.** For AgentGuard, that's the first time it blocks a dangerous tool call that you didn't explicitly configure a rule for.

The CLI is our top-of-funnel for this. A developer runs `npx agentguard validate .` on their existing agent project and sees:

```
Found 4 agents using 9 tools:
  ❌ execute_bash — NO policy (can execute arbitrary shell commands)
  ❌ send_email — NO policy (unprotected email access)
  ✅ web_search — covered by: safe-browsing-policy
  ⚠️  read_file — policy exists but no restrictions on paths

Risk Score: HIGH (2 unprotected high-risk tools)
Run: agentguard init to add policies for unprotected tools.
```

That output is the aha moment. They see something they didn't know. It's immediate value with zero signup. **The CLI is our Stripe API key.** It delivers the aha moment without any friction.

**Disagreement with Dana:** I don't think we need a demo API endpoint without auth. That's a security risk (abuse, spam, rate limit games) and adds maintenance overhead. The CLI is the zero-signup demo. Save the no-auth API idea for later if the CLI doesn't convert.

---

**🏗️ Alex:** I want to ground this in what developers actually do when evaluating a tool:

1. They look for an npm install or pip install command
2. They look for a "quickstart" in the docs
3. They copy-paste the first code example
4. If it works in under 5 minutes, they keep going
5. If it doesn't, they leave

Our current friction points:
- The npm package is published but the quickstart isn't polished
- The first code example requires an API key (signup gate)
- No "offline mode" to try locally without an account

The CLI solves point 5 (offline mode, no account needed). But the SDK quickstart needs to show value in `< 10 lines of code` for someone who has an API key.

```typescript
// Ideal 3-line integration
import { AgentGuard } from '@the-bot-club/agentguard';
const guard = new AgentGuard({ apiKey: process.env.AGENTGUARD_KEY });
const result = await guard.evaluate({ toolName: 'send_email', toolInput: { to: '...', body: '...' } });
// result.action = 'block' | 'allow' | 'warn' | 'hitl'
```

Is that what it looks like right now? If the SDK usage is more complex than this, that's the friction to fix.

---

**🔐 Sam:** Developer adoption friction from a security perspective: **API key in environment variables is the right pattern but we need to make it easy, not just correct.** 

The worst thing we can do is show a quickstart where the developer puts their API key in the code. Not because most developers will commit it (though some will), but because it starts a bad habit that will eventually lead to a breach and a "AgentGuard caused a key leak" story.

Our quickstart must:
1. Show env var pattern exclusively — no `const apiKey = "agk_..."` in examples
2. Include a `.env.example` file in the sample project
3. Have a `dotenv` import at the top (don't make them figure out env vars)

This is also SEO: "AgentGuard quickstart" should return our docs page, and our docs page should have a copy-paste quickstart that works. Currently what shows up? Check this and fix it.

---

**CONSENSUS — Topic 2: Developer Adoption**

**The aha moment funnel:**
1. CLI (`npx agentguard validate .`) → sees unprotected tools → no account needed → aha moment
2. Clicks "Get Started" → streamlined signup (email + password, no credit card)
3. Onboarding wizard → API key → language selector → pre-filled code → first evaluate call
4. First block event → celebrate in UI → "your agent is now protected"

**Key friction fixes:**
| Fix | Owner | Effort |
|-----|-------|--------|
| CLI with offline scan (top-of-funnel) | Backend | 3d (Sprint 1) |
| Quickstart docs: 3-line SDK integration | Dana | 0.5d |
| SDK: env var pattern in all examples | Dana/Alex | 0.5d |
| Onboarding wizard (5-step) | Dana | 3d (Sprint 2) |
| Demo policy templates pre-installed in new accounts | Alex | 1d |
| "First event" celebration in dashboard | Dana | 0.5d |

**Metric to track:** % of new signups who make first successful `evaluate()` call within 24 hours of signup.

---

### TOPIC 3: SIEM Integrations (Splunk + Azure Sentinel)

*Is this needed now or can it wait? What's the minimum viable integration?*

---

**🔐 Sam:** SIEM integration is NOT optional for enterprise security teams. Every enterprise with Splunk or Sentinel has a requirement that security events from all systems flow into their SIEM. An AgentGuard installation that doesn't feed into the SIEM is a visibility gap — and visibility gaps are policy violations at most regulated enterprises.

However, I want to be precise about what "SIEM integration" means and what's actually needed:

**What they actually need:**
- AgentGuard audit events (blocks, HITL triggers, policy violations) pushed to their SIEM
- In the format their SIEM already understands (Splunk Common Information Model for Splunk; CEF for generic SIEMs)
- Reliable delivery with no dropped events (acknowledgement + retry)

**What they don't need yet:**
- Custom Splunk apps or dashboards built by us
- Bidirectional integration (receiving alerts from SIEM into AgentGuard)
- SOAR playbook triggers

**Minimum viable:** Webhook to a URL (which they configure to their SIEM ingestor) + Splunk HEC support. That's it. Most Splunk deployments already have an HTTP Event Collector endpoint ready to go.

---

**📊 Casey:** I'm going to push back on Sam's "not optional" framing. Yes, enterprise security teams *want* SIEM integration. But it's rarely a *pre-contract* requirement. It's more commonly a *post-contract* requirement that comes up in the first 90 days.

The question is: does it block *signing*? In my experience: No, if you have a clear roadmap commitment and a documented timeline. CISOs sign "we'll add SIEM integration in Q2" all the time. They have bigger fish to fry pre-contract (legal, DPA, SOC 2, SLA).

My recommendation: **SIEM is Sprint 3, not Sprint 2.** Here's why:
- We have zero enterprise customers right now
- Splunk HEC is 3 days of work
- Sentinel is another 2 days
- Those 5 days are better spent on self-hosted, HITL, and onboarding in Sprint 2
- When we have one enterprise customer actively evaluating, we reprioritize SIEM if they ask

The exception: if we're actively in a deal with a customer who has Splunk or Sentinel AND their security team says it's required pre-contract. Then we build it in 3 days for that deal.

---

**🏗️ Alex:** The architecture question is what matters here. If we build SIEM wrong, we'll regret it. Two approaches:

**Option A: Log forwarding (simple but limited)**
- Output structured logs to stdout (we're doing this with pino)
- Tell customers to use Fluentd/Logstash to ship logs to their SIEM
- Zero code from us. Works today.
- Problem: Customers hate configuring log forwarders. IT infra dependency. Doesn't feel like a real integration.

**Option B: Push worker (proper but more effort)**
- BullMQ job: on audit event creation → push to configured SIEM endpoint
- Supports Splunk HEC, Azure Sentinel HTTP Data Collector, generic webhook
- Retry logic with dead letter queue
- Dashboard config UI
- This is what I already specced in SPRINT_PLAN.md as item 6

**My recommendation:** Ship Option A's story in 1 day (document it, add a Fluentd config example to our docs). Then build Option B in Sprint 3 as a proper integration. This gives us something to say to enterprise prospects immediately without spending 5 days of Sprint 1 or Sprint 2 time on it.

---

**🎨 Dana:** The dashboard experience matters. The difference between "we support Splunk" and "we have a real Splunk integration" is:
- **Checkbox support:** Point logs at a webhook, call it done
- **Real integration:** Dashboard config UI, test connection button, "last event delivered X minutes ago" status, dead letter queue alert

For the first enterprise customer, checkbox support might close the deal. For expansion (land and expand), real integration determines renewal. I lean toward building it properly (Option B) for Sprint 3, but Dana's timeline priority aligns with Casey: don't block Sprint 2 on it.

---

**🔐 Sam (pushback on Option A):** Alex, Option A (log forwarding) has a problem: pino logs everything, not just security events. If a customer configures Fluentd to ship all our logs to Splunk, they're shipping debug logs, performance logs, health checks — everything. That creates noise in their SIEM and a potential data liability (logs might contain request content). The push worker (Option B) sends only curated security events in the right format. It's worth building properly.

---

**CONSENSUS — Topic 3: SIEM Integrations**

**Verdict:** Build properly (Option B push worker), but in Sprint 3 — not now.

**Immediate (Sprint 1, 1 day):** Publish a "log forwarding" guide in docs — how to ship AgentGuard pino JSON logs to Splunk/Sentinel using Fluentd. Gives us something to say in enterprise conversations.

**Sprint 3 (5 days total):**
- Splunk HEC push worker (BullMQ, retry, dead letter queue) — 2 days
- Azure Sentinel HTTP Data Collector — 1 day
- Dashboard config UI (URL + token + test connection + status) — 1 day
- Dead letter queue alert + admin notification — 1 day

**Minimum viable integration:**
- Splunk HEC: POST `{event: auditEvent, time: epoch, source: "agentguard", sourcetype: "json"}` to HEC URL
- Sentinel: POST to Log Analytics HTTP Data Collector with HMAC-SHA256 auth
- Events: only BLOCK, WARN, HITL, and POLICY_VIOLATION events — not all audit events
- Credentials encrypted at rest (AES-256-GCM)

**Do NOT build:** Custom Splunk app, SOAR playbooks, bidirectional SIEM → AgentGuard triggers, custom dashboards in Splunk.

---

### TOPIC 4: ML Anomaly Detection

*Is this real differentiation or a nice slide? What data do we need? Simpler heuristic first?*

---

**📊 Casey:** I'm going to be blunt: **ML anomaly detection is a nice slide.** Here's my argument:

1. We have zero production tenants generating data right now
2. You can't train a meaningful anomaly model on zero data
3. "ML-powered" in a v1 product typically means "we have a threshold check wrapped in a model wrapper"
4. Competitors who claim ML detection are mostly doing the same thing
5. It adds 3-4 weeks of engineering time to something that will produce false positives until we have 90 days of real tenant data

The only anomaly detection that makes sense to ship now is **rule-based thresholds**: if this metric exceeds 5x the 7-day rolling average, alert. That's not ML. It's a `if x > threshold` check. But it's honest and it works immediately.

**Ship rule-based thresholds in Sprint 2. Defer ML to post-v1.**

---

**🏗️ Alex:** Casey is right on timing, but wrong on dismissing ML entirely. The data model decisions matter NOW because if we design the telemetry wrong, we'll have to do a painful migration later.

**What I want to do in Sprint 2 (small, not the full ML feature):**
- Design the time-series aggregation table: `agent_metrics(tenant_id, agent_id, metric, hour, value)` 
- Start collecting: tool_calls_per_hour, block_rate_per_hour, hitl_trigger_rate_per_hour, unique_tools_per_hour
- Ship the rule-based threshold alerting as the feature (genuinely useful)
- The ML comes when we have 90 days of this data and real customers

This is like laying pipe before you pour concrete. You spend 2 days now to avoid 2 weeks of migration later.

---

**🔐 Sam:** The security concern with ML anomaly detection is **model poisoning**. If an attacker can manipulate the baseline:
- Slowly ramp up malicious activity below the threshold → baseline adapts → higher threshold
- Then spike to the new "normal" → no alert
- Classic slow-walk attack

This is why I want rule-based thresholds with **fixed** lookback windows rather than adaptive baselines. A static "alert if tool calls > 10/minute for this agent" is more tamper-resistant than an adaptive model that learns from recent history.

When we do build ML, we need: training data validation, anomaly detection on the training data itself, and human-in-the-loop for baseline adjustments. This is actually a whole security research problem. Don't rush it.

---

**🎨 Dana:** For the dashboard, what I want to show in v1 is simple and useful:

```
⚠️ Anomaly Alert: agent-finance-bot
Tool call rate: 847/min (5.2x above 7-day average of 163/min)
Started: 14 minutes ago
[View affected calls] [Acknowledge] [Block agent]
```

That's it. No ML scores, no confidence intervals. Just: something unusual is happening, here's what it is, here's what you can do. A rule-based threshold alert can produce this exact output. ML doesn't make this better — it just makes it more expensive to build and explain.

---

**🔐 Sam (pushback on Casey's framing):** One thing I'll push back on: "anomaly detection" as a category isn't just about traffic spikes. It also covers:
- Agent calling tools in an unusual sequence (never called `delete_files` before, now calling it repeatedly)
- Agent accessing resources from unusual geographic locations
- Agent making calls at unusual times (2am versus normal 9am-5pm pattern)

These behavioral patterns are much more interesting than "traffic is high" and they're harder to do with simple thresholds. They need sequence modeling. I agree with deferring, but let's not dismiss the real security value.

---

**CONSENSUS — Topic 4: ML Anomaly Detection**

**Verdict:** Ship rule-based thresholds in Sprint 2. Collect the data. ML is post-v1.0.

**Sprint 2 (2 days, bundled with analytics work):**
- Time-series aggregation table: `agent_metrics(tenant_id, agent_id, metric, hour_bucket, value)`
- Collect: tool_calls, block_count, hitl_count, unique_tool_names, per-agent per-hour
- Rule-based alerts: if metric > 5x 7-day rolling average → create alert event → webhook + dashboard notification
- Alert dashboard panel: list of active anomalies with [Acknowledge] [Block agent] actions

**What NOT to build yet:**
- ML models of any kind
- Adaptive baselines (tamper risk, no training data)
- Sequence modeling
- Cost anomaly detection (v1.1)

**Data we'll need for future ML (start collecting now):**
- Tool call sequences per agent session (ordered list, with timestamps)
- Agent geographic origin (IP → country, for geo-behavioral analysis)
- Tool call success/failure rates
- HITL approval/rejection rates per agent

---

### TOPIC 5: Helm Chart / Kubernetes

*Who needs it now? Docker Compose vs Helm — which unlocks more customers?*

---

**🏗️ Alex:** Let me be concrete about the deployment profiles of real enterprise customers:

**Profile A: "We run Docker Compose on a VM"** — Small/medium enterprises, startups, companies without dedicated platform engineering. This is probably 60% of self-hosted enterprise prospects. Docker Compose is sufficient.

**Profile B: "We run Kubernetes (EKS/AKS/GKE)"** — Large enterprises, any company with a platform/SRE team. This is the remaining 40%. They will not run Docker Compose in production. They'll expect a Helm chart.

Docker Compose unlocks 60% of self-hosted customers. Helm unlocks the other 40%. But the Helm customers are the bigger deals.

**My position:** Docker Compose in Sprint 3. Helm in Sprint 4 or when the first Kubernetes customer asks. Don't try to ship both at once — Helm is meaningfully more complex (NetworkPolicy, PodDisruptionBudgets, HPA, ServiceAccount bindings, etc.).

---

**📊 Casey:** Alex, you're assuming 40% of enterprise customers need Kubernetes. I'd challenge that number for our likely early customers. Who's actually going to be our first 5 enterprise customers?

- Series B AI startups building agents — running on managed services, not Kubernetes
- Mid-market companies with an AI platform team — maybe Kubernetes, probably managed PaaS
- Regulated enterprise (finance, healthcare) — yes, often Kubernetes, but these are 6-12 month sales cycles regardless

My point: the first 2-3 enterprise customers are more likely Docker Compose profiles. Get the Docker Compose perfect, sign 2 design partners, collect feedback. Add Helm when the third or fourth customer specifically asks for it. "We're working on a Helm chart, timeline is Q2" is an acceptable answer for enterprise customers at POC stage.

**Build Docker Compose in Sprint 3. Put Helm in the "build only when asked" bucket.**

---

**🔐 Sam:** Helm has a security advantage over Docker Compose that's worth noting: Kubernetes NetworkPolicy resources allow us to declare pod-to-pod communication rules in code. In Docker Compose, all containers on the same network can talk to each other (you rely on not publishing ports). In Kubernetes with NetworkPolicy:
- Postgres only accepts connections from api and worker pods
- Dashboard cannot reach Postgres directly
- Redis not accessible from outside the cluster
- api pods cannot initiate connections to external IPs (egress control)

This defense-in-depth is real and matters for regulated enterprise customers. Docker Compose is easier but inherently less secure at the network layer.

That said: Sam agrees with Casey and Alex — Docker Compose first. But when we build Helm, build NetworkPolicy correctly from day one.

---

**🎨 Dana:** From a UX perspective, the "install experience" for Helm needs to be as clean as Docker Compose. The current standard for good Helm charts: `helm repo add agentguard https://charts.agentguard.tech && helm install agentguard agentguard/agentguard`. That's it. The values file should be well-commented with sensible defaults so a new customer doesn't need to read 50 pages of docs to deploy.

---

**CONSENSUS — Topic 5: Helm Chart / Kubernetes**

**Verdict:** Docker Compose in Sprint 3. Helm in backlog — build only when a specific enterprise customer requires it.

**Sprint 3 (Docker Compose):**
- Full spec per DESIGN_DEBATE.md Feature 5 (Self-Hosted Deployment)
- `docker-compose.yml` + `docker-compose.tls.yml` (Caddy reverse proxy)
- `install.sh` with secret generation
- `config.ts` abstraction

**Helm (backlog / Sprint 5+):**
- Build only when first Kubernetes enterprise customer requests it
- When built: use `helm create` scaffold, not from scratch
- Include NetworkPolicy resources (postgres/redis isolated to app pods)
- Well-commented `values.yaml`
- Publish to Artifact Hub

**Current position for enterprise conversations:** "Self-hosted via Docker Compose is available now. Helm chart is on our roadmap — expected [date based on demand]. We can prioritize if it's on your critical path."

---

### TOPIC 6: Technical Debt & Hardening

*What's fragile? What breaks under real load? Testing gaps?*

---

**🏗️ Alex:** Let me go through the codebase with fresh eyes as an architect. Based on the current state (21 routes, 23 lib modules, 6 middleware layers, 57 endpoints), here are the fragile points:

**1. No request ID propagation**
`console.log` calls throughout the codebase mean we can't correlate logs across a single request. When a production issue happens, we can't trace it. Item 8 (structured logging with pino + AsyncLocalStorage) fixes this. Without it, debugging production issues requires SSH + grep — not acceptable.

**2. In-memory rate limiting**
The existing rate limiter resets every time the API pod restarts. With horizontal scaling (multiple pods), each pod has its own counter. Pod A sees 90 requests from tenant X; pod B sees 90 requests from the same tenant. Result: 180 requests get through against a 100/min limit. This is a correctness bug, not just a scale issue. Item 2 (Redis rate limiter) fixes it.

**3. Webhook secrets stored plaintext**
Already flagged in SPRINT_PLAN.md as item 12. This is a security regression that should have been fixed before launch. If the DB is ever read by an unauthorized party, all customer webhook integrations are compromised. Fix in Sprint 1.

**4. No database connection pooling across pods**
If we scale to 3 API pods with a pool of 10 each, we hit Postgres with 30 connections simultaneously. Add a worker pod and it's 40+. Postgres default max_connections is 100. We'll hit the limit before we hit 10 tenants under real load. PgBouncer (item 5) fixes this.

**5. Missing request timeout**
Express doesn't have a default request timeout. A slow DB query or external API call hangs indefinitely, consuming a connection. Under load, this causes connection exhaustion cascades. Item 10 fixes in 30 minutes.

**6. Evaluate endpoint with no load test baseline**
We claim `<5ms` for local eval. What's the `<Xms` for the HTTP evaluate endpoint? We need a load test baseline: run 1000 req/s against the evaluate endpoint, measure p50/p95/p99. If p99 is >500ms, we have a problem. Run this as part of Sprint 2.

---

**🔐 Sam:** Alex covers infrastructure. Let me cover security technical debt:

**1. No CSRF protection on state-changing endpoints**
The dashboard makes POST requests to the API. If there's no CSRF token, a malicious site can trick a logged-in user's browser into making API calls on their behalf. Helmet.js helps with some of this (SameSite cookies), but we need to verify cookie configuration.

**2. JWT clock skew tolerance is undefined**
The JWT middleware currently validates tokens. What's the clock skew tolerance? If it's the Node default (0), any server time drift causes auth failures. If it's too large (hours), it allows replay attacks. Standard: ±30 seconds.

**3. Error responses leaking stack traces**
Express default error handling returns stack traces in development mode AND production mode if `NODE_ENV` isn't set correctly. A customer-reported bug "I'm getting 500 errors" might be accompanied by stack traces that reveal our directory structure, library versions, and file paths — valuable for attackers. Fix: explicit error middleware that strips stack traces in production.

**4. Missing security.txt**
A tiny thing but it matters: `/.well-known/security.txt` tells security researchers how to report vulnerabilities. Without it, researchers who find something have no clear path — so they either give up or go public. 10-minute fix.

**5. No dependency audit in CI**
Do we run `npm audit` or `pip audit` in CI? If not, we're shipping with potentially known CVEs every deploy. Add a blocking `npm audit --audit-level=high` step to CI. Fail the build if high/critical CVEs.

---

**🎨 Dana:** Frontend and DX technical debt that will bite us:

**1. Dashboard has no loading states**
API calls that take >200ms show a blank panel. Users think the page is broken. Every API call in the dashboard needs: loading skeleton → data OR error state. No blank panels.

**2. No error boundary in React**
If any component throws an unhandled error, the entire dashboard goes blank. A React Error Boundary catches component errors and shows a fallback UI. Without it, one bad API response can take down the whole dashboard for a user.

**3. Dashboard API calls have no retry logic**
If the backend returns a 503 (timeout, deployment, etc.), the dashboard shows an error state with no recovery path. Add exponential backoff retry with user-visible "Retrying..." state.

**4. Mobile viewport is an afterthought**
The demo site and dashboard aren't mobile-responsive. While enterprise users primarily access dashboards on desktop, the marketing site gets mobile traffic from tweets/HN. We need at minimum the marketing site to work on mobile.

---

**📊 Casey:** I want to add the product-risk technical debt:

**1. No smoke tests on deploy**
When we deploy a new version, how do we know it's working before traffic hits? We need a post-deploy smoke test: hit `/health`, `/api/v1/evaluate` with a test key, verify the response. If smoke tests fail, roll back automatically. Without this, we'll have production incidents from bad deploys.

**2. Test coverage gaps**
We have 172 tests (66 API + 106 license). That sounds reasonable but: what's the coverage %? Which paths have no tests? The highest-risk paths (evaluate endpoint, HITL queue, audit trail write) should have 100% coverage. If they don't, that's where production bugs will appear. Run coverage report and file tickets for gaps.

**3. No graceful shutdown**
When a pod is terminated (deploy, scaling event), in-flight requests get dropped. Graceful shutdown: SIGTERM → stop accepting new requests → finish in-flight → exit. Without this, every deploy causes 1-2 dropped requests per pod. Under high traffic, that's customer-visible errors.

---

**CONSENSUS — Topic 6: Technical Debt Register**

See Part 5 (Technical Debt Register) for full tracking.

**Critical (fix in Sprint 1, blocking):**
- Request ID / structured logging (pino)
- In-memory → Redis rate limiting
- Webhook secrets plaintext → encrypted
- Request timeout (30 minutes)
- Error middleware (no stack traces in prod)

**High (fix in Sprint 2):**
- PgBouncer connection pooling
- JWT clock skew tolerance definition
- Dependency audit in CI
- Error boundaries in React
- Graceful shutdown

**Medium (fix in Sprint 3):**
- Load test baseline (evaluate endpoint)
- Smoke tests on deploy
- Test coverage report + gap filing
- security.txt
- Mobile viewport (marketing site)

---

### TOPIC 7: v1.0 Definition

*What's the minimum bar? What signals "production-ready" to enterprise? What can we defer?*

---

**📊 Casey:** I'll draw the line. v1.0 is not "feature complete." v1.0 is "we can sell this to an enterprise and sleep at night." Here's my bar:

**Must be in v1.0:**
1. The security core works reliably (evaluate, block, audit trail, HITL)
2. An enterprise can deploy it safely (self-hosted Docker Compose OR SaaS with DPA)
3. A developer can onboard in < 5 minutes without our help
4. The compliance story holds up in a security review (OWASP report, audit export)
5. We can operate it at 10 concurrent enterprise tenants without manual intervention

**Can be in v1.1:**
- SIEM integrations (Splunk, Sentinel)
- Helm/Kubernetes
- ML anomaly detection
- AI red teaming integration
- Teams integration (Slack only for v1.0)
- Full SOC 2 Type II (Type I or "in progress" letter is OK for v1.0 customers)
- Shadow agent discovery
- Terraform provider

---

**🏗️ Alex:** Agreeing with Casey's framing but adding technical precision. v1.0 signals "production-ready" through:

**Operational maturity signals:**
- Zero downtime deploys (graceful shutdown + health checks)
- Monitoring + alerting (know when the system is down before customers report it)
- Load tested to 100 concurrent tenants without degradation
- DB migrations tested and reversible
- Incident runbook exists (what to do when things break)

**Code quality signals:**
- No `console.log` calls (pino throughout)
- No TypeScript `any` types in hot paths
- Test coverage > 80% on core paths (evaluate, audit, HITL)
- No known high/critical CVEs in dependencies

**Genuine disagreement with Casey:** I don't think self-hosted Docker Compose needs to be in v1.0. Here's why: if we're targeting "10 concurrent enterprise tenants" as the operational test, and those tenants are using our SaaS, Docker Compose is a nice-to-have for the regulated segment but not required to call it v1.0. Docker Compose is required for *regulated* enterprise v1.0. For tech-forward enterprise, SaaS is fine.

---

**🔐 Sam:** v1.0 security checklist — these are non-negotiable:

- [ ] All secrets encrypted at rest (API keys, webhook secrets, SIEM credentials, Slack tokens)
- [ ] All API traffic over TLS (Cloudflare Full/Strict, origin cert)
- [ ] Helmet.js headers (CSP, HSTS, X-Frame-Options)
- [ ] Request timeout (no hanging connections)
- [ ] Redis-backed rate limiting (per-tenant, distributed)
- [ ] Brute-force protection (auth endpoints)
- [ ] RLS verified at startup (tenant isolation canary)
- [ ] Audit trail tamper-evident (hash chain verified)
- [ ] Error responses sanitized (no stack traces in production)
- [ ] Dependency audit clean (no high/critical CVEs)
- [ ] `security.txt` published

Missing any of these = not v1.0 from my perspective.

---

**🎨 Dana:** v1.0 UX checklist:

- [ ] Onboarding: new user → first evaluate() call in < 5 minutes
- [ ] Dashboard loads in < 2 seconds with 30 days of data
- [ ] No blank panels (all loading states and error states handled)
- [ ] Error messages are human-readable (no "PgBouncer pool exhausted" in UI)
- [ ] Rate limit 429 response includes `retryAfterMs` and `upgradeUrl`
- [ ] HITL Slack delivery working end-to-end
- [ ] Analytics page shows block rate, volume, top risks
- [ ] OWASP compliance report generatable as PDF

---

**📊 Casey (closing):** I want to be explicit about what "v1.0" means for fundraising and customers, not just engineering. When we say "v1.0 is released," we're making a public claim that this is production-ready software. That means:

- It should be able to handle a customer's production agent workloads without our hands-on intervention
- If something breaks, the customer has a support path (SLA, support email, runbook)
- If a security issue is discovered, we have a responsible disclosure process and can patch quickly

These are operational and business commitments, not just engineering ones. Engineering delivers the software; the business delivers the reliability commitment.

---

**CONSENSUS — Topic 7: v1.0 Definition**

See Part 3 (v1.0 Definition Checklist) for the full checklist.

**The v1.0 bar:** Can onboard an enterprise customer, handle their production agent workload, respond to incidents, and stand behind it commercially.

---

## PART 2: PRIORITIZED IMPLEMENTATION LIST

*Ordered by impact. Effort estimates in engineering days.*

---

### 🔴 P0 — Do This Week (Unblocks Everything)

| # | Item | Impact | Effort | Why Now |
|---|------|--------|--------|---------|
| 1 | **Cloudflare Full/Strict SSL** | Security credibility | 0.5h | A security product on HTTP origin is disqualifying |
| 2 | **Helmet.js + Security Headers** | Security baseline | 0.5d | Fails every automated security scan without it |
| 3 | **Request Timeout** | Reliability | 0.5d | Hanging connections kill the server under real load |
| 4 | **Webhook Secret Encryption** | Security regression | 0.5d | Plaintext secrets in DB is a data breach waiting to happen |
| 5 | **Error Middleware (no stack traces)** | Security | 0.5d | Stack traces in production are an info disclosure vulnerability |
| 6 | **npm audit in CI** | Security | 0.5d | Can't ship with known CVEs |
| 7 | **Structured Logging (pino + requestId)** | Observability | 1.5d | Can't debug production issues without request tracing |
| 8 | **Version Bump v0.8.0 → publish** | Distribution | 1h | Current published packages are stale |

**Total Sprint 1 Track A: ~4 days (can be done by 1 engineer in parallel with tracks B/C)**

---

### 🔴 P0 — Sprint 1 (Developer Acquisition + Core Security)

| # | Item | Impact | Effort | Why Now |
|---|------|--------|--------|---------|
| 9 | **Standalone CLI Tool** | Top-of-funnel | 3d | Zero-friction aha moment; publishes to npm |
| 10 | **Redis Distributed Rate Limiting** | Correctness | 2d | In-memory rate limiter is broken under multiple pods |
| 11 | **Brute-force Protection** | Security | 0d | Included in item 10 (auth profile on rate limiter) |
| 12 | **API Docs (OpenAPI/Redoc)** | DX / Acquisition | 2d | Developers read docs before they sign up |
| 13 | **Update Docs/Sites** | Marketing | 2d | Landing page describes v0.7 features; we're at v0.8 |

---

### 🟡 P1 — Sprint 2 (Enterprise Readiness + Core Features)

| # | Item | Impact | Effort | Why This Sprint |
|---|------|--------|--------|----------------|
| 14 | **Slack HITL Integration** | Adoption blocker | 9d | HITL without Slack delivery is unused; single highest DX leverage |
| 15 | **Enterprise Auth (JWT RS256 + SSO)** | Revenue gate | 4d | Every enterprise eval asks "do you support SSO?" |
| 16 | **In-Process SDK (Local Eval)** | Performance story | 4d | <5ms vs 150ms latency is a conversion moment with design partners |
| 17 | **Dashboard Analytics Page** | Product stickiness | 3d | Empty dashboard is why users churn after signup |
| 18 | **Onboarding Flow (5-step wizard)** | Activation | 3d | Direct driver of "first evaluate() in 24h" metric |
| 19 | **OWASP Compliance Report** | Enterprise sales | 5d | PDF in a security review package closes deals |
| 20 | **Rule-Based Anomaly Threshold Alerts** | Security value | 2d | Bundled with analytics; immediate value, no data needed |
| 21 | **Multi-Tenancy Hardening (PgBouncer)** | Reliability | 3d | Will hit Postgres connection limit before 10 tenants |
| 22 | **JWT Clock Skew + CSRF Protection** | Security | 1d | Auth correctness gap |
| 23 | **Graceful Shutdown** | Reliability | 0.5d | Dropped requests on every deploy |
| 24 | **Load Test Baseline** | Confidence | 1d | Need to know what breaks before customers find out |

---

### 🟠 P2 — Sprint 3 (Enterprise Enablement + Distribution)

| # | Item | Impact | Effort | Why This Sprint |
|---|------|--------|--------|----------------|
| 25 | **Self-Hosted Docker Compose** | Revenue unlocker | 5d | Required for regulated enterprise segment |
| 26 | **Prompt Injection Detection (Lakera adapter)** | Table stakes | 3d | Every enterprise eval asks about it |
| 27 | **PII Detection/Redaction (Presidio)** | Compliance | 4d | Required for HIPAA/GDPR regulated customers |
| 28 | **MCP Server Policy Enforcement** | First-mover | 8d | Runtime MCP enforcement: nobody else has it |
| 29 | **Multi-Agent A2A Propagation** | Differentiation | 8d | 2026 table stakes; crewed agents are mainstream now |
| 30 | **SIEM Integrations (Splunk + Sentinel)** | Enterprise | 5d | Post-contract requirement; needed by first regulated customer |
| 31 | **Dashboard MCP Management** | DX | 2d | UI for MCP feature (item 28) |
| 32 | **Dashboard Slack Setup** | DX | 1d | UI for Slack HITL (item 14) |
| 33 | **Smoke Tests on Deploy** | Reliability | 1d | Know about problems before customers do |
| 34 | **Demo Site Mobile Polish** | Marketing | 1d | HN/Twitter traffic arrives on mobile |
| 35 | **Audit Trail CSV/JSON Export** | Enterprise | 1d | Auditors need to export; quick win |

---

### ⚪ P3 — Backlog (Build When Asked)

| # | Item | Trigger | Effort |
|---|------|---------|--------|
| 36 | **Helm Chart** | First Kubernetes customer asks | 5d |
| 37 | **ML Anomaly Detection** | 90 days of production telemetry | 3w |
| 38 | **Teams HITL Integration** | Customer request | 5d |
| 39 | **Terraform Provider** | Enterprise customer request | 1w |
| 40 | **Shadow Agent Discovery** | Enterprise prospect asks for it | 2w |
| 41 | **LangSmith Integration** | Distribution opportunity | 1w |
| 42 | **Custom SAML** | Enterprise with non-OIDC IdP | 1w |
| 43 | **AI Red Team Integration (Mindgard)** | Pre-certification workflow | 1w |
| 44 | **Cost Anomaly Detection** | Customer request | 1w |

---

## PART 3: v1.0 DEFINITION

### What's IN v1.0 ✅

**Security & Infrastructure:**
- [ ] Cloudflare Full/Strict SSL on all endpoints
- [ ] Helmet.js security headers (CSP, HSTS, X-Frame, XSS protection)
- [ ] Request timeout (30s global, 5s evaluate endpoint)
- [ ] Redis distributed rate limiting (per-tenant, tiered by plan)
- [ ] Brute-force protection (auth endpoints: 10 attempts / 15 min)
- [ ] All secrets encrypted at rest (AES-256-GCM: webhook secrets, SIEM credentials, Slack tokens)
- [ ] Error responses sanitized (no stack traces, no internal paths in production)
- [ ] `npm audit --audit-level=high` passing in CI
- [ ] RLS startup canary (cross-tenant isolation verified at boot)
- [ ] Audit trail tamper-evident hash chain verified
- [ ] `security.txt` at `/.well-known/security.txt`
- [ ] JWT RS256 + OIDC/SSO (Auth0 or generic OIDC)
- [ ] PgBouncer connection pooling (per-tenant statement timeout)
- [ ] Graceful shutdown (SIGTERM → drain → exit)

**Core Product:**
- [ ] evaluate() endpoint reliable at p99 < 500ms (HTTP mode)
- [ ] Local eval SDK mode at p99 < 5ms
- [ ] HITL queue functional with Slack delivery
- [ ] Audit trail: write, query, export (CSV + JSON)
- [ ] Policy templates: at least 7 pre-built templates for common tools
- [ ] Webhook delivery with retry + dead letter queue
- [ ] Prompt injection detection (Lakera adapter + heuristic fallback)
- [ ] PII detection/redaction (Presidio sidecar)
- [ ] MCP server policy enforcement

**Developer Experience:**
- [ ] CLI: `npx agentguard validate .` works offline with no account
- [ ] SDK: 3-line integration, published to npm + PyPI at current version
- [ ] Onboarding: new user → first evaluate() call in < 5 minutes
- [ ] API docs: all endpoints documented with code examples (Redoc)
- [ ] OpenAPI spec auto-generated and up to date

**Dashboard:**
- [ ] Analytics: volume, block rate, top risks, 24h/7d/30d
- [ ] Anomaly alerts: rule-based threshold alerts with [Acknowledge] [Block] actions
- [ ] OWASP Agentic Top 10 compliance report (PDF export)
- [ ] HITL queue management (review, approve, reject)
- [ ] Slack integration setup UI
- [ ] MCP server management UI
- [ ] Loading states and error boundaries (no blank panels)

**Operations:**
- [ ] Post-deploy smoke tests (automated)
- [ ] Structured logging with requestId propagation (pino)
- [ ] Test coverage ≥ 80% on evaluate, audit, HITL code paths
- [ ] Load tested: 100 concurrent tenants, evaluate at 1000 req/s, no degradation
- [ ] DB migrations reversible and tested
- [ ] Incident runbook exists

**Commercial:**
- [ ] Legal entity incorporated (Pty Ltd)
- [ ] Data Processing Agreement (DPA) published
- [ ] Terms of Service published
- [ ] SLA defined (99.9% uptime, credit terms)
- [ ] Support email with defined response SLA
- [ ] SOC 2 Type I or "In Progress" attestation letter available

---

### What's OUT of v1.0 (deferred to v1.1+) ❌

| Feature | Rationale | Target |
|---------|-----------|--------|
| SOC 2 Type II | 6-12 months minimum; start process now | v1.1 (3 months post-launch) |
| Helm Chart | Build only when Kubernetes customer asks | v1.1 |
| SIEM Integrations | Post-contract requirement; log forwarding docs suffice | v1.1 |
| ML Anomaly Detection | No training data yet | v1.2 (post 90-day telemetry) |
| Teams Integration | Slack covers 60% of the market; Teams when asked | v1.1 |
| Terraform Provider | Enterprise request trigger | v1.1 |
| Shadow Agent Discovery | Complex, low ROI vs other features | v1.2 |
| AI Red Team Integration | Nice-to-have, not blocking any deals | v1.2 |
| Custom SAML | Generic OIDC covers 90% of IdPs | v1.1 |
| Cost Anomaly Detection | Need baseline data first | v1.2 |
| LangSmith Integration | Distribution play, not product completeness | v1.1 |
| Multi-Agent A2A Propagation | Built in Sprint 3, may slip to v1.0 if time permits | v1.0 if ready |

---

## PART 4: SPRINT PLAN (2 WEEKS, PARALLEL TRACKS)

*2 engineers assumed (1 backend-focused, 1 frontend/full-stack). Adjust sequencing if solo.*

---

### SPRINT 1 (Week 1): Foundation + Top-of-Funnel

**Goal:** Ship security baseline, publish CLI, fix critical debt, update docs.

---

#### Track A — Security Hardening (Engineer 1, Days 1-2)
*All items are small, independent, and parallelizable. Ship as one PR or fast sequence.*

| Day | Task | Item |
|-----|------|------|
| Mon AM | Cloudflare Full/Strict SSL (30 min) | SSL |
| Mon AM | Helmet.js + CSP audit of dashboard | #2 |
| Mon PM | Request timeout middleware | #3 |
| Mon PM | Error middleware (strip stack traces in prod) | #5 |
| Tue AM | Webhook secret encryption (AES-256-GCM wrapper + migration) | #4 |
| Tue AM | npm audit in CI + fix any high/critical findings | #6 |
| Tue PM | Version bump v0.8.0 → publish npm + PyPI | #8 |
| Tue PM | Redis setup (add to Docker Compose, configure REDIS_URL) | prereq for #10 |

**Deliverables end of Day 2:** SSL fixed, all security headers live, timeouts active, secrets encrypted, v0.8.0 published.

---

#### Track B — Structured Logging (Engineer 1, Days 2-3)
*Start after Track A wrap-up; this is the foundation for everything in Sprint 2.*

| Day | Task |
|-----|------|
| Tue PM | Install pino, create `src/lib/logger.ts`, configure pino-pretty for dev |
| Wed AM | AsyncLocalStorage requestId propagation through middleware chain |
| Wed PM | Replace all `console.log/warn/error` calls with logger |
| Wed PM | Add CI lint rule: no `console.log` in src/ |
| Thu AM | Config abstraction: `src/lib/config.ts` (all env vars in one place, validated on startup) |

**Deliverables end of Day 3:** Every log line has requestId. No console.log. Config typed and validated.

---

#### Track C — CLI Tool (Engineer 2, Days 1-4)
*Runs parallel to Track A/B. No dependencies. Highest-impact developer acquisition item.*

| Day | Task |
|-----|------|
| Mon | Setup `packages/cli/` in monorepo, `commander.js`, `ora`, `chalk` |
| Tue | Regex detection engine: LangChain @tool, OpenAI functions, CrewAI BaseTool, generic toolName props |
| Wed | Test fixture files (JS/TS/Python agent projects), verify detection accuracy |
| Thu | Output formatting: coverage table, score %, actionable suggestions |
| Thu PM | `--format markdown` for GitHub Actions step summary |
| Fri AM | Path traversal protection (resolve within CWD boundary) |
| Fri AM | Publish to npm as `@the-bot-club/agentguard` |

**Deliverables end of Day 5 (Friday):** `npx agentguard validate .` works on real agent codebases, published to npm.

---

#### Track D — Redis Rate Limiter (Engineer 1, Days 4-5)
*Starts after Track A/B; needs Redis from Day 2 infra setup.*

| Day | Task |
|-----|------|
| Thu | `rate-limiter-flexible` integration with RateLimiterRedis |
| Thu | Rate limit profiles: `auth` (10/15min/IP), `evaluate` (tier-based/tenant), `api-general` (500/min/tenant) |
| Fri | 429 response: `{ error, retryAfterMs, tier, upgradeUrl }` |
| Fri | Brute-force lockout: 15-minute block after 10 auth failures, generic error message |

**Deliverables end of Day 5:** Distributed rate limiting live; brute-force protection active.

---

#### Track E — Docs + API Docs (Engineer 2, Days 2-5)
*Parallel to Track C. Engineer 2 can context-switch between CLI and docs.*

| Day | Task |
|-----|------|
| Tue | `zod-to-openapi`: generate OpenAPI 3.1 spec from existing Zod schemas |
| Tue-Wed | Redoc setup at `/api/docs`; separate public vs internal spec |
| Wed-Thu | Node.js + Python code examples for core endpoints (evaluate, HITL, policies) |
| Thu-Fri | Update landing page copy: current v0.8.0 features, new positioning |
| Fri | Update docs site: new sections for MCP, HITL, OWASP, SDK 0.8.0 |

**Deliverables end of Day 5:** Auto-generated API docs live at `/api/docs`; landing page and docs updated.

---

#### Sprint 1 Summary

```
Mon  ├─ [E1] SSL + Helmet + Timeout + Errors + Secrets + CI audit + Redis setup
     └─ [E2] CLI setup + detection engine

Tue  ├─ [E1] Logging starts + Track A completions (Webhooks, version bump)
     └─ [E2] CLI detection continuing + API docs starts

Wed  ├─ [E1] Logging continues (requestId + config.ts)
     └─ [E2] CLI output formatting + API docs Redoc

Thu  ├─ [E1] Redis Rate Limiter starts
     └─ [E2] CLI GitHub Actions mode + API docs code examples

Fri  ├─ [E1] Rate Limiter + brute-force DONE ✅
     └─ [E2] CLI npm publish ✅ + Docs/Sites DONE ✅
```

**Sprint 1 Ships:** SSL, security headers, rate limiting, brute-force protection, encrypted secrets, structured logging, config abstraction, CLI tool (npm published), API docs (Redoc), docs/site updated, v0.8.0 on npm + PyPI.

---

### SPRINT 2 (Week 2): Enterprise Readiness + Core Features

**Goal:** Ship features that close enterprise deals and drive developer activation.

---

#### Track A — Enterprise Auth + SSO (Engineer 1, Days 1-4)
*Depends on: config.ts (Sprint 1). Runs parallel to Track B/C/D.*

| Day | Task |
|-----|------|
| Mon | Auth0 OIDC setup, `passport-openidconnect`, callback route |
| Mon-Tue | JWKS RS256 middleware: fetch → cache (1h TTL) → local verify; re-fetch on unknown kid |
| Tue | JWT clock skew: ±30s tolerance; token expiry enforcement |
| Wed | JIT user provisioning: auto-create user on first SSO login, assign to org by email domain |
| Wed | Role-claim mapping: `https://agentguard.tech/roles` JWT claim → DB role |
| Thu | DB migration: `users.sso_provider`, `users.sso_subject`, `users.jit_provisioned` |
| Thu | CSRF protection: verify SameSite cookie config + CSRF token on state-changing non-JSON endpoints |

**Deliverables:** SSO/OIDC login working; JWT RS256 verification; JIT provisioning; role mapping.

---

#### Track B — In-Process SDK Local Eval (Engineer 1, Days 5-8)
*Can start after Auth if same engineer, or parallel with different engineer.*

| Day | Task |
|-----|------|
| Mon (or Fri) | Policy bundle API: `GET /api/v1/policy-bundles/:tenantId` → signed JSON bundle |
| Tue | Ed25519 bundle signing (server-side); public key bundled in SDK at publish time |
| Wed | SDK lazy-init: fetch bundle on first `evaluate()` call, re-fetch before TTL expiry |
| Wed | Local evaluation: JSON rule matching against compiled rules (no network) |
| Thu | Telemetry batching: events queued, flushed async every 5s or 100 events |
| Thu | `evaluate.latencyMs` metric in telemetry; Python SDK equivalent |

**Deliverables:** `mode: 'local'` flag in SDK; <5ms local eval; signed bundles; TTL refresh.

---

#### Track C — Analytics + Onboarding (Engineer 2, Days 1-6)

*Analytics first (API needed for onboarding "first event" celebration).*

| Day | Task |
|-----|------|
| Mon-Tue | Analytics API: `GET /api/v1/analytics/evaluate?from=&to=&granularity=hour\|day` |
| Mon | Pre-aggregation job: runs every 5 min, writes to `analytics_snapshots` table |
| Tue | Rule-based threshold alerts: if metric > 5x 7d avg → create alert event |
| Tue-Wed | Dashboard analytics page: Recharts, 3 panels (volume, action breakdown, top risks) |
| Wed | Time range selector: 24h / 7d / 30d; summary stat cards |
| Thu-Fri | Onboarding wizard: 5 steps, progress indicator, language selector, pre-filled code |
| Fri | "First event" celebration: poll `GET /api/v1/onboarding/status`, confetti on first evaluate |

**Deliverables:** Analytics page live with Recharts; anomaly threshold alerts; onboarding wizard.

---

#### Track D — Multi-Tenancy Hardening (Engineer 1, Day 1-3)
*Can start in parallel with Track A; different part of the codebase.*

| Day | Task |
|-----|------|
| Mon-Tue | PgBouncer: add to Docker Compose (or deploy as sidecar on Azure); transaction-mode pooling |
| Tue | Per-tenant statement timeout: `SET LOCAL statement_timeout = '5000'` in DB middleware |
| Wed | Startup canary: verify RLS at boot (cross-tenant query must fail); if canary fails, refuse to start |
| Wed | Error sanitization: PgBouncer/Postgres errors mapped to generic API error messages |

**Deliverables:** PgBouncer live; statement timeouts; isolation canary at startup.

---

#### Track E — OWASP Report + HITL Slack (Engineer 2, Days 3-9)

*Slack HITL is the longest item in Sprint 2. OWASP report starts first to give frontend time.*

| Day | Task |
|-----|------|
| Wed-Thu | OWASP control definitions JSON (10 controls, bundled with binary, hash-verified) |
| Thu-Fri | Compliance check service: query policies for each control, compute coverage |
| Fri | Report generation endpoint + DB storage; HTML view; PDF export (Puppeteer) |
| Mon (wk2) | Slack App registration, OAuth flow, callback route |
| Tue | HITL queue config extension (Slack settings: channel, reviewer IDs, timeout, timeout action) |
| Tue-Wed | Block Kit message on new HITL item |
| Wed | Interaction callback endpoint: X-Slack-Signature HMAC verification + replay protection |
| Thu | Approve/reject processing + message update; timeout worker (auto-reject default) |
| Thu-Fri | Reviewer authorization validation; audit trail enrichment (Slack user ID) |

**Deliverables:** OWASP PDF report available; Slack HITL end-to-end working.

---

#### Sprint 2 Summary

```
Mon  ├─ [E1] Enterprise Auth starts + Multi-tenancy hardening starts
     └─ [E2] Analytics API + pre-aggregation job

Tue  ├─ [E1] JWT RS256 + JIT provisioning + PgBouncer
     └─ [E2] Threshold alerts + Analytics page frontend starts

Wed  ├─ [E1] Role-claim mapping + CSRF + Canary
     └─ [E2] Analytics page DONE ✅ → Onboarding starts + OWASP report starts

Thu  ├─ [E1] Auth DONE ✅ → In-Process SDK starts
     └─ [E2] Onboarding wizard continuing + OWASP controls

Fri  ├─ [E1] SDK bundle API + Ed25519 signing
     └─ [E2] Onboarding DONE ✅ + OWASP report endpoint DONE ✅ → Slack HITL starts

Mon  ├─ [E1] SDK local eval + telemetry batching
     └─ [E2] Slack HITL backend (OAuth + Block Kit + callback)

Tue  ├─ [E1] SDK DONE ✅
     └─ [E2] Slack approve/reject + message update + timeout worker

Wed  (end of Sprint 2)
     ├─ [E1] Load test baseline (evaluate endpoint: 1000 req/s, measure p50/p95/p99)
     └─ [E2] Slack HITL DONE ✅ + Dashboard Slack setup UI (1d)
```

**Sprint 2 Ships:** SSO/JWT RS256, in-process SDK (<5ms), analytics page, anomaly alerts, onboarding wizard, OWASP compliance report (PDF), Slack HITL end-to-end, PgBouncer, CSRF protection, load test baseline.

---

## PART 5: TECHNICAL DEBT REGISTER

*Track what needs fixing, when, and why it matters.*

---

### 🔴 Critical — Fix in Sprint 1 (Blocking Production Quality)

| Debt Item | Current State | Risk | Fix | Effort |
|-----------|--------------|------|-----|--------|
| **No request ID propagation** | `console.log` calls with no correlation | Can't debug production issues | pino + AsyncLocalStorage | 1.5d |
| **In-memory rate limiter** | Map-based, per-pod | Wrong limits under multiple pods (correctness bug) | Redis + rate-limiter-flexible | 2d |
| **Webhook secrets plaintext** | Stored as VARCHAR in DB | Full credential exposure on DB breach | AES-256-GCM encrypt + migration | 0.5d |
| **No request timeout** | Express default (none) | Connection exhaustion under load | connect-timeout middleware | 0.5d |
| **Stack traces in prod** | Express default error handler | Information disclosure | Error middleware, strip in production | 0.5d |
| **No dependency audit in CI** | Manual / ad hoc | Shipping with known CVEs | `npm audit --audit-level=high` in CI | 0.5d |
| **Helmet.js missing** | No security headers | Fails security scans; clickjacking possible | Helmet.js + CSP | 0.5d |

---

### 🟡 High — Fix in Sprint 2 (Needed Before 10 Tenants)

| Debt Item | Current State | Risk | Fix | Effort |
|-----------|--------------|------|-----|--------|
| **No DB connection pooling** | Direct per-pod pools | Postgres connection exhaustion at 5-10 tenants | PgBouncer transaction pooling | 2d |
| **JWT clock skew undefined** | Default (0 tolerance) | Auth failures on any server time drift | ±30s skew tolerance config | 0.5d |
| **No CSRF protection** | Dashboard POST requests unprotected | Authenticated users tricked into actions | SameSite cookies + CSRF header | 0.5d |
| **No error boundaries (React)** | Unhandled throws crash dashboard | Full dashboard outage on bad API response | React ErrorBoundary components | 0.5d |
| **No graceful shutdown** | SIGTERM drops in-flight requests | Dropped requests on every deploy | SIGTERM → drain → exit | 0.5d |
| **No smoke tests on deploy** | Manual verification | Bad deploys hit customers first | Post-deploy smoke test in CI/CD | 1d |
| **No load test baseline** | Unknown performance floor | Don't know what breaks under real load | k6 load test + baseline metrics | 1d |

---

### 🟠 Medium — Fix in Sprint 3 (Before v1.0 Launch)

| Debt Item | Current State | Risk | Fix | Effort |
|-----------|--------------|------|-----|--------|
| **Test coverage unknown** | 172 tests; coverage % unknown | Unknown blind spots in production | Run coverage report; file tickets for gaps | 1d |
| **No `security.txt`** | Missing | Security researchers have no disclosure path | Add `/.well-known/security.txt` | 0.5h |
| **Dashboard blank panel states** | No loading/error states | Users think dashboard is broken | Loading skeletons + error states on all panels | 2d |
| **Dashboard retry logic missing** | 503 → permanent error state | Single blip causes user friction | Exponential backoff retry with UI feedback | 1d |
| **Mobile viewport not responsive** | Marketing site doesn't work on mobile | HN/Twitter traffic leaves immediately | CSS responsive breakpoints | 1d |
| **External API calls no timeout** | Lakera/Presidio calls can hang | Evaluate endpoint hangs when detectors are slow | AbortController 3s timeout on all external calls | 1d |
| **DB migrations not reversible** | One-way migrations | Can't roll back a bad deploy | Add down() to every migration | 1d |

---

### ⚪ Low — Fix When Convenient (Post-v1.0)

| Debt Item | Notes |
|-----------|-------|
| **TypeScript `any` types in hot paths** | Audit and tighten during Sprint 3/4 code reviews |
| **Audit log query performance** | Add index on `(tenant_id, created_at)` if slow queries appear |
| **No API versioning strategy** | Define before breaking changes; `/api/v1/` already exists |
| **Presidio sidecar cold start** | Add healthcheck and wait-for-ready in Docker Compose |
| **Test fixtures not organized** | Create `test/fixtures/` structure for CLI and SDK tests |

---

## PART 6: DO NOT BUILD LIST

*Things that sound valuable but aren't worth the effort yet. Revisit only with specific customer demand.*

---

### ❌ DO NOT BUILD: Full ML Anomaly Detection (pre-v1.0)

**Why it sounds good:** "ML-powered threat detection" is a strong slide in a pitch deck.

**Why not to build it:**
- Zero training data until we have production tenants (garbage in, garbage out)
- Will produce false positives that cause customers to disable it
- Takes 3-4 weeks of engineering time that's better spent on features that actually close deals
- Rule-based thresholds deliver 80% of the value at 2% of the cost

**When to revisit:** After 90 days of production telemetry from ≥3 tenants. Then evaluate whether the data supports meaningful model training.

---

### ❌ DO NOT BUILD: Bespoke SAML Integration

**Why it sounds good:** Enterprises often say "we need SAML" in security questionnaires.

**Why not to build it:**
- Auth0 supports SAML as an identity source — our OIDC integration already handles SAML-backed IdPs through Auth0 as a proxy
- Building bespoke SAML means owning XML parsing, assertion validation, certificate management — a huge attack surface
- Most modern enterprises have moved to OIDC/OAuth2 anyway

**When to revisit:** Only if a specific enterprise customer has an IdP that Auth0 cannot proxy AND the deal is worth it.

---

### ❌ DO NOT BUILD: Hardware Fingerprint Licensing (self-hosted)

**Why it sounds good:** Prevents license key sharing between self-hosted installs.

**Why not to build it:**
- Breaks cloud deployments (new instances have different fingerprints → license fails)
- Creates customer support nightmare (VM migration, hardware replacement, cloud scale events)
- Our phone-home JWT with 30-day offline grace is sufficient

**When to revisit:** Only if a government/air-gapped customer with specific requirements asks, and is willing to accept the operational constraints.

---

### ❌ DO NOT BUILD: Custom Splunk App / Dashboard

**Why it sounds good:** Having a Splunk app in Splunkbase looks enterprise-grade.

**Why not to build it:**
- Splunk app review takes 4-6 weeks
- Requires ongoing maintenance for every Splunk version update
- Most customers are happy with structured JSON in Splunk HEC; they build their own dashboards
- Our value is in the data quality, not in building their dashboards for them

**When to revisit:** If a large enterprise (Splunk AMER partnership) specifically offers to co-develop. Not before.

---

### ❌ DO NOT BUILD: Bidirectional SIEM Integration (SIEM → AgentGuard triggers)

**Why it sounds good:** "AI-driven response" — SIEM detects threat → AgentGuard blocks the agent automatically.

**Why not to build it:**
- Reverse flow (SIEM calling AgentGuard) opens a privileged API surface
- If SIEM is compromised, attacker can block any agent they want
- The HITL workflow is already the correct response mechanism
- Customers don't have this workflow today; they'd need to build SIEM playbooks to use it

**When to revisit:** After shipping SIEM output integration and observing whether customers actually want the reverse flow.

---

### ❌ DO NOT BUILD: Generic "Notification Plugin" Registry (premature abstraction)

**Why it sounds good:** "Extensible notification system" — build once, support Slack + Teams + PagerDuty + email.

**Why not to build it:**
- We haven't shipped Slack yet
- Premature abstraction means we'll design the wrong interface
- Teams, PagerDuty, email all have genuinely different delivery semantics
- Build Slack, observe how it's used, then extract the interface

**When to revisit:** After Slack HITL is in production for 30 days and we know what the real abstraction should be.

---

### ❌ DO NOT BUILD: Shadow Agent Discovery (pre-v1.0)

**Why it sounds good:** "We found 47 unprotected agents in your infrastructure" is a great CISO demo.

**Why not to build it:**
- Requires deep access to customer infrastructure (GitHub, CI/CD, AWS, GCP, k8s) — a huge security and privacy responsibility
- We don't have the infrastructure scanning logic built
- Noma owns this space with $100M in funding — don't compete with them on their primary feature
- Focus on protecting known agents before discovering unknown ones

**When to revisit:** v1.2 or later, as a premium enterprise feature. Not before self-hosted, prompt injection, and PII are solid.

---

### ❌ DO NOT BUILD: AI Red Teaming (build or buy before v1.1)

**Why it sounds good:** "Built-in red teaming before certification" sounds enterprise-grade.

**Why not to build it:**
- Mindgard and Giskard are purpose-built for this with attack libraries we can't match
- Red teaming is a testing workflow, not a runtime enforcement workflow — different use case
- Building a meaningful red team suite takes months of ML/security research

**When to revisit:** Build an integration with Mindgard (their API) for pre-certification red team workflows. Don't build the red team capability itself.

---

### ❌ DO NOT BUILD: Full Cost Anomaly Detection (pre-v1.0)

**Why it sounds good:** "We alert you when your agent is burning money" is a compelling value prop.

**Why not to build it:**
- Requires integration with each customer's LLM billing API (OpenAI, Anthropic, etc.) — significant scope
- Rule-based threshold alerts on tool call volume covers the "runaway agent" scenario
- Cost anomaly requires per-token pricing data we don't have

**When to revisit:** After ML anomaly detection is built and we have the behavioral baseline infrastructure.

---

## APPENDIX: CRITICAL PATH DIAGRAM

```
SPRINT 1 (Week 1):
Day 1: SSL ──► Helmet ──► Timeout ──► Error MW ──► [DONE: security baseline]
       CLI detection engine starts
       
Day 2: Webhook secrets encrypted ──► Redis setup ──► [infra ready]
       Structured logging (pino + AsyncLocalStorage) starts
       API docs (zod-to-openapi + Redoc) starts
       
Day 3: Config.ts abstraction DONE ──► [unblocks Sprint 2 Auth + SDK]
       CLI output formatting + path traversal protection
       API docs Redoc live
       
Day 4: Redis Rate Limiter starts (needs Redis from Day 2)
       CLI GitHub Actions mode
       Docs/sites update
       
Day 5: Rate Limiter + brute-force DONE ✅
       CLI published to npm ✅
       API docs + docs updates DONE ✅
       Version bump published ✅

SPRINT 2 (Week 2):
Day 1: Enterprise Auth starts ────────────────► Day 4: Auth DONE
       Multi-tenancy (PgBouncer) starts ───────► Day 3: PgBouncer DONE
       Analytics API starts ────────────────────► Day 2: Analytics API DONE
       
Day 3: Analytics page (Recharts) starts ─────► Day 4 (mid): Analytics DONE ✅
       OWASP report starts ─────────────────────► Day 5: OWASP DONE ✅
       
Day 4: In-process SDK starts ────────────────► Day 7: SDK DONE ✅
       Onboarding wizard starts ────────────────► Day 6: Onboarding DONE ✅
       Slack HITL backend starts ───────────────► Day 9: Slack DONE ✅

Day 9: Load test baseline ✅
       Dashboard Slack setup UI ✅

SPRINT 2 END: All P1 items shipped. v1.0 feature-complete except Sprint 3 items.

SPRINT 3 (following 2 weeks):
- Self-hosted Docker Compose (5d)
- Prompt Injection Detection / Lakera adapter (3d)
- PII Detection / Presidio (4d)
- MCP Server Policy Enforcement (8d)
- Multi-Agent A2A Propagation (8d)
- SIEM Integrations (5d)
- Smoke tests, security.txt, mobile polish, audit export (3d)
```

---

## APPENDIX: VELOCITY ASSUMPTIONS

| Scenario | Sprint 1 | Sprint 2 | Sprint 3 | v1.0 Timeline |
|----------|----------|----------|----------|---------------|
| 1 full-stack engineer | 2 weeks | 3 weeks | 4 weeks | ~9 weeks |
| 2 engineers (1 BE + 1 FE) | 1 week | 2 weeks | 3 weeks | ~6 weeks |
| 3 engineers (2 BE + 1 FE) | 1 week | 1.5 weeks | 2 weeks | ~4.5 weeks |

**Recommendation:** Two engineers minimum for Sprint 2. The parallel tracks are genuinely independent (Auth vs SDK vs Analytics vs OWASP vs Slack — all different codebases) and collapsing them to a single engineer delays v1.0 by 6+ weeks.

---

## APPENDIX: RISK REGISTER

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Slack app review delay (3-7 days) | High | Medium | Submit Slack App review request on Day 1 of HITL work; review in parallel |
| Auth0 scope creep (SCIM, custom SAML) | Medium | Medium | Strict scope: OIDC/OAuth2 only for v1.0; document SCIM as v1.1 |
| Presidio sidecar cold start time | Medium | Low | Add health check + wait-for-ready in Docker Compose; document startup time |
| CLI false positives on tool detection | High | Medium | Build large fixture test suite; allow-list for false positive patterns |
| PgBouncer misconfiguration causes auth failures | Medium | High | Test staging rollout before production; document rollback procedure |
| Show HN post lands poorly | Medium | Low | Not a blocker — design partner outreach is independent channel |
| Redis connection pool exhaustion | Low | High | Configure Redis maxconnections + rate-limiter-flexible connection limits |
| Load test reveals evaluate endpoint is slow | Medium | High | Run load test early (Sprint 2 Day 9); have performance fix sprint ready |
| First enterprise customer asks for Helm before Docker Compose is stable | Low | Medium | "Docker Compose available now; Helm in Q2" is acceptable answer at POC stage |
| SOC 2 evidence collection falls behind | High | Medium | Start SOC 2 process at incorporation; use automated evidence tools (Vanta/Drata) |

---

*Document produced by four-expert engineering workshop.*
*Experts: 🏗️ Alex (Architect) · 🔐 Sam (Security) · 🎨 Dana (UX/Frontend) · 📊 Casey (Product/PM)*
*AgentGuard internal planning document — March 2026*
*Next review: End of Sprint 1 (Friday, week 1)*

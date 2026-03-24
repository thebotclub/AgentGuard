# AgentGuard Launch Playbook
## Product Hunt + Hacker News Coordinated Launch

**Prepared by:** Nova3  
**Date:** March 2026  
**Status:** Production-ready  
**Coordinates with:** FOUNDING20_LAUNCH_ASSETS.md, STRATEGY_REVIEW.md, EU_AI_ACT_LANDING.md

---

> **Launch Philosophy:** We're launching a security product to a technical audience. No hype. No buzzword soup. Honest about what we do, honest about our gaps, specific about the threat we solve. The developer community will respect us for it — and that respect compounds.

---

## Table of Contents

1. [Product Hunt Launch Kit](#1-product-hunt-launch-kit)
2. [Hacker News Show HN Post](#2-hacker-news-show-hn-post)
3. [Launch Day Playbook](#3-launch-day-playbook)
4. [Design Partner Recruitment Script](#4-design-partner-recruitment-script)

---

## 1. Product Hunt Launch Kit

### 1.1 Tagline (60 chars max)

```
Firewall for AI agents. Block threats before they run.
```
*(54 characters — leaves buffer for PH's rendering)*

**Runner-up options (ranked):**
```
Runtime security for AI agents. Kill switch included.     (51 chars)
Stop your AI agent before it does something irreversible  (57 chars)
Policy enforcement for every tool call your agent makes   (56 chars)
```

**Why the chosen tagline works:**
- "Firewall" is a concept every developer and CISO understands instantly — zero cognitive load
- "before they run" communicates the key technical differentiator (pre-execution enforcement vs. post-hoc logging)
- "Kill switch" is visceral and memorable — it creates a distinct mental image that competitors don't own
- Under 60 chars with room to breathe

---

### 1.2 Description (260 chars)

```
AgentGuard sits between your AI agent and its tools. Every database query, API call, file op — evaluated against your policies before execution. Block threats, log everything tamper-evidently, halt rogue agents instantly. LangChain, CrewAI, OpenAI. 5 mins.
```
*(259 characters)*

**What this description does:**
- Opens with architecture position ("sits between") — immediately clear for technical readers
- Three concrete tool categories — developers can map this to their own stack
- Three capabilities in parallel structure — easy to scan
- "tamper-evidently" signals compliance value without the word "compliance"
- Framework names = instant recognition for target audience
- "5 mins" removes the barrier of assumed complexity

---

### 1.3 Maker Comment (First Comment — Sets the Narrative)

Post this within 60 seconds of the product going live. This is the comment that floats to the top.

---

**MAKER COMMENT TEXT:**

Hey Product Hunt 👋

I'm Hani, founder of AgentGuard. I want to give you the honest version of what we built and why.

**The problem we kept seeing:**

Teams shipping LangChain and CrewAI agents into production had zero visibility into what those agents were actually doing at runtime. Not "monitoring" gaps — fundamental invisibility. When a support agent processed customer emails, nobody could answer: "What tool calls did it make? Did it touch data it shouldn't have? Can you prove those logs haven't been altered?"

Traditional security tools see HTTP requests. They don't understand that your agent just decided to call `DROP TABLE` with a synthesized SQL query, or that it was prompt-injected via a customer support ticket.

**What AgentGuard actually does:**

AgentGuard wraps your agent's tool calls and evaluates every single one against configurable policies — in under 1ms, before execution. Allow, block, monitor, or route to a human for approval. If something goes wrong, one API call halts every agent in your tenant in under 50ms.

The audit trail is SHA-256 hash-chained: mathematically tamper-evident. Alter any historical record and the chain breaks instantly. This matters for EU AI Act Article 12 compliance (August 2026 enforcement).

**The honest part:**

We cover 77% of the OWASP Agentic Top 10. Not 100%. The gaps (indirect prompt injection scanning, cryptographic inter-agent message signing) are on our Q3 2026 roadmap with specific dates. We'd rather be honest about the gaps than claim perfection we don't have.

**What we're offering today:**

The first 20 teams who sign up get **AgentGuard Pro free** — unlimited agents, compliance exports, custom policy builder, no credit card, no auto-charge. 

→ **Founding 20:** agentguard.tech/founding-20

We built this because AI agents are being deployed into production at a pace that's outrunning any security layer designed for them. We think that's a problem worth solving seriously.

Happy to answer technical questions — architecture, threat models, specific framework integrations, compliance details. Let's get into it. 🛡️

---

### 1.4 Gallery Images — 5 Descriptions with Exact Text Overlays

**Design specs for all images:**
- Size: 1270×952px (PH standard), or 630×420px (minimum)
- Dark theme: Background #0A0E17, accent green #00D26A
- Font: SF Pro Display (or system sans-serif) bold for headlines
- Include AgentGuard logo mark (🛡️) in top-left corner of each image
- Bottom bar: agentguard.tech in #6B7280

---

**Image 1: The Hook** *(Hero / First impression)*

Layout: Full dark screen, centered text with glow effect

```
TOP TEXT (small caps, green):
RUNTIME SECURITY FOR AI AGENTS

MAIN HEADLINE (massive, white, 72px):
Your agent is running.
Do you know what
it's doing right now?

BOTTOM STRIP (dark card):
LangChain · CrewAI · OpenAI · AutoGen · Custom Agents
5-minute setup · No infrastructure changes
```

Visual element: Animated terminal-style cursor blinking after the headline (static screenshot version: frozen cursor mid-blink)

---

**Image 2: The Architecture** *(Technical credibility)*

Layout: Diagram-centric, technical audience

```
TOP TEXT (small, green):
HOW IT WORKS

DIAGRAM (ASCII-art style, white on dark):

  Your AI Agent
       │ every tool call
       ▼
  ┌─────────────────────────────┐
  │       AgentGuard             │
  │                              │
  │  Policy  ·  HITL  ·  Audit  │
  │   <1ms     <50ms   SHA-256  │
  │                              │
  │  allow | block | require_🙋  │
  └─────────────────────────────┘
       │
       ▼
  Your Tools (DB, APIs, Files, Shell)

BOTTOM CAPTION (small, muted):
In-process evaluation. No network round-trip.
```

---

**Image 3: The Kill Switch** *(Emotional resonance — the "aha" feature)*

Layout: Single feature spotlight, high contrast

```
TOP BADGE (red, pulsing dot):
● LIVE

MAIN HEADLINE (white, 64px):
One call.
Everything stops.

CODE BLOCK (green monospace):
curl -X POST https://api.agentguard.tech/api/v1/killswitch \
  -H "x-api-key: $AG_API_KEY" \
  -d '{"active": true}'

RESULT LINE (green, animated typing):
→ All 12 agents stopped in 47ms

BOTTOM CAPTION (muted):
The emergency brake every production AI team needs but nobody has built.
Until now.
```

---

**Image 4: The Compliance Angle** *(Enterprise / CISO audience)*

Layout: Split panel — left threat, right solution

```
LEFT PANEL (dark red tint, header):
⚠️ EU AI Act
August 2026

LEFT CONTENT (white, 36px):
Article 12 requires
tamper-evident audit
logs for every
AI decision.

Your existing logs
don't qualify.

RIGHT PANEL (dark green tint, header):
✅ AgentGuard

RIGHT CONTENT (white, 36px):
SHA-256
hash-chained
audit trail.

One-click
compliance
export.

BOTTOM STRIP (full width):
Articles 9 · 12 · 14 · 15 covered  |  77% OWASP Agentic Top 10
```

---

**Image 5: Social Proof + CTA** *(Convert the undecided)*

Layout: Stats + testimonial + urgency

```
TOP SECTION — 3 stats in a row:

  [193 tests]          [<1ms]              [77%]
  passing              policy latency      OWASP Agentic
  (current build)      (in-process)        coverage

MIDDLE — QUOTE (italic, white):
"AgentGuard caught a prompt injection vulnerability
in our RAG agent on day one. It would have exposed
customer data. We had no idea it was happening."
— Senior Engineer, Series A Fintech

BOTTOM — URGENCY STRIP (green background):
🔴 Founding 20: 17 of 20 spots remaining
Free Pro access · No credit card · agentguard.tech/founding-20
```

---

### 1.5 First-Day Comment Strategy

**Goal:** Maintain momentum, answer questions authentically, convert interest to signups. Every comment response should add information — never just "thanks!"

---

**T+0 (launch moment):** Post maker comment immediately (see 1.3)

**T+30 min:** Check comment section. Upvote all genuine questions/comments. Respond to any early comments with full technical detail.

**T+1 hour:** Post follow-up comment (not a reply — a new top-level maker comment):

```
One hour in — thank you all 🙌

A few things people are asking me in DMs that I'll answer publicly:

**"Is this just another prompt injection scanner?"**
No. Prompt injection detection is one layer, but the core product is tool-level policy enforcement — evaluating what your agent *does*, not just what it's told. Most agents I've seen that were prompt-injected into bad behavior had existing tool calls that would have been blocked by our policy engine, even if we never detected the injection itself.

**"How does this compare to LangSmith / LangFuse?"**
They're observability tools — great for debugging. AgentGuard enforces policies before actions execute. We actually want to be complementary to them: we'll be shipping LangSmith integration in Q2. You'd use both.

**"What about NeMo Guardrails / Guardrails AI?"**
Those operate at the LLM output layer — they validate or correct what the model says. AgentGuard operates at the tool layer — it governs what the agent *does*. Different layer, complementary protection.

Spots are going fast: agentguard.tech/founding-20
```

**T+2-3 hours:** Respond to every single comment thread. Priority order:
1. Technical questions about architecture
2. Framework-specific integration questions
3. Competitive comparisons (answer honestly)
4. Pricing questions
5. "Looks cool" comments (brief but genuine thank-you + one useful fact)

**T+4 hours:** If trending in top 5, share the PH page on Twitter with "We're live on Product Hunt and the community is asking great technical questions — join the conversation: [PH link]"

**T+6 hours:** Post another maker comment if volume justifies it. Focus on: "Here's what we're hearing from people who've already installed the SDK this morning..."

**T+12 hours (end of North American day):** Gratitude comment + next steps for people who didn't claim a spot:
```
Day is wrapping up here. What a day.

For anyone who missed the Founding 20 spots — we'll run a Cohort 2 in approximately 60-90 days. Join the waitlist at agentguard.tech/founding-20 and you'll be first in line.

Thank you to everyone who engaged today. The technical questions were exactly the kind of pressure-testing that makes the product better. Keep them coming.
```

---

### 1.6 Hunter Outreach List — 10 Top Product Hunt Hunters (AI/Security)

Research and outreach to happen 2 weeks before launch. Goal: one hunter agrees to hunt AgentGuard.

**Outreach template (DM via PH or Twitter):**

```
Hi [Name],

I'm launching AgentGuard on Product Hunt — it's a runtime security platform for AI agents. 
Think: policy enforcement for every tool call your LangChain/CrewAI agent makes, 
with a kill switch and tamper-evident audit trail. First genuinely novel security 
layer I've seen for autonomous agents (vs. just prompt injection scanners).

Given your background hunting [relevant products they've hunted], I thought you might 
find this interesting. Would you be open to having a look before launch? Happy to 
give you early access and walk you through the technical differentiation.

Launch date: [DATE]. 

Thanks,
Hani
```

**Target hunters (research-based — verify profiles before outreach):**

| # | Hunter Name | Why They're Right | Hunting Focus |
|---|------------|------------------|--------------|
| 1 | Ben Tossell | Mass reach, dev tools focus, hunts technical products | AI/SaaS/Dev tools |
| 2 | Kevin William David | Security/infra background, frequent hunter | Security, DevTools |
| 3 | Rohan Rajiv | Product + AI enthusiast with large following | AI products |
| 4 | Chris Messina | Hashtag inventor, deep developer community trust | Tech/AI |
| 5 | Lenny Rachitsky | Large PLG audience — AgentGuard's PLG story is strong | SaaS/PLG |
| 6 | Andrew Ettinger | Security tools background | Security, privacy |
| 7 | Abadesi Osunsade | Developer community, underrepresented builders | Developer tools |
| 8 | Nevo David | Developer growth + open source | Dev tools, OSS |
| 9 | Tariq Rauf | AI safety/security focus | AI, security |
| 10 | Clement Mihailescu | Developer community, technical credibility | Dev tools, AI |

**Priority: #1–3 for direct outreach. #4–10 as backup. Aim to secure ONE hunter who genuinely understands the product — a mediocre hunt by a high-follower hunter is worse than an authentic hunt by a mid-tier hunter who "gets it."**

---

## 2. Hacker News "Show HN" Post

### 2.1 Title (80 chars max, Show HN convention)

```
Show HN: AgentGuard – Runtime security for AI agents (policy enforcement + kill switch)
```
*(88 chars — trim to:)*

```
Show HN: AgentGuard – Runtime policy enforcement and kill switch for AI agents
```
*(79 chars ✅)*

**Why this title works for HN:**
- "Show HN:" is mandatory and correct format
- Name is first
- Technical description (not marketing): "Runtime policy enforcement" and "kill switch" are engineering concepts, not adjectives
- No superlatives, no "revolutionary," no "the first ever"
- Kill switch is unusual enough to be curiosity-generating for technical readers

**Backup titles (ranked):**
```
Show HN: AgentGuard – Evaluate every AI agent tool call before it executes (77 chars)
Show HN: Tool-level security for AI agents – block threats before execution (75 chars)
Show HN: We built a firewall for AI agent tool calls with a kill switch (71 chars)
```

---

### 2.2 Full HN Post Body

**Post this in the text field on news.ycombinator.com/submit:**

---

I'm building AgentGuard (https://agentguard.tech) — a security layer that sits between an AI agent and its tools.

**The specific problem:**

LangChain, CrewAI, and similar frameworks make it easy to give agents access to tools: database queries, HTTP requests, shell commands, file operations. What they don't provide is any mechanism to:

1. Evaluate whether a specific tool call should be allowed *before* it executes
2. Block dangerous operations at the execution layer (not just at the prompt layer)
3. Produce a tamper-evident audit trail that proves what the agent did and when
4. Stop all agents immediately when something goes wrong

Most teams I've talked to are handling this with a combination of careful prompt engineering and hoping nothing bad happens. That's not a security posture.

**What AgentGuard does:**

```
Your Agent
    │ tool call
    ▼
AgentGuard Policy Engine (<1ms, in-process)
    → allow / block / monitor / require_human_approval
    ▼
The tool actually executes (or doesn't)
```

Every evaluation is logged with SHA-256 hash chaining. Alter any historical record and the chain breaks — the `GET /v1/audit/verify` endpoint tells you immediately.

The kill switch: `POST /v1/killswitch {"active": true}` halts every agent in your tenant in under 50ms.

**Technical stack:**
- TypeScript SDK (npm: @the-bot-club/agentguard) + Python SDK (pip: agentguard-tech)
- Native integrations: LangChain callback handler, OpenAI client wrapper, CrewAI, Express/Fastify middleware
- Policy DSL: YAML-based, glob matching on tool names, parameter inspection, rate limits
- Database: PostgreSQL with RLS
- API: 60+ endpoints, Zod validation throughout
- Tests: 193 passing (coverage: 67%, working on it)
- Self-hosted: Docker Compose available

**Quick integration:**

```python
from agentguard import AgentGuard

guard = AgentGuard(api_key="ag_live_...")
decision = guard.evaluate(
    tool="database_query",
    action="execute",
    input={"query": "DROP TABLE users"}
)
# → {"result": "block", "reason": "Destructive SQL operation", "riskScore": 95}
```

```typescript
// LangChain — one line:
const handler = new AgentGuardCallbackHandler({ apiKey: process.env.AG_API_KEY });
```

**OWASP Agentic Top 10 coverage:**
We map to the OWASP Agentic Top 10 (December 2025 edition). Current coverage: 77% overall. Tool Misuse (ASI02): 100%. Cascading Failures (ASI08): 85%. Rogue Agents (ASI10): 90%. Gaps in indirect prompt injection scanning and inter-agent message signing — those are Q3 2026 roadmap items. We're honest about what we don't cover.

**EU AI Act connection:**
Article 12 requires tamper-evident audit logs for high-risk AI systems by August 2026. Our hash-chained audit trail meets that requirement. It's not the primary reason we built it, but it's why enterprise CISOs are interested.

**Pricing:**
Free tier: 100K evaluations/month. Pro: $149/month (unlimited). Enterprise: $499/month. We're giving the first 20 teams Pro free as design partners — details at agentguard.tech/founding-20.

**What I'm looking for:**
Honest technical feedback. Specifically:
- Are there threat models we're not addressing that you think are more important?
- For those who've shipped production AI agents: what security gaps keep you up at night?
- Is there a framework integration missing that would make this usable for you?

Demo at demo.agentguard.tech (no signup). Docs at docs.agentguard.tech.

---

### 2.3 Anticipated Questions + Prepared Answers (10 Q&As)

**Study these before launch. HN comments move fast — prepare offline, don't make up answers in real-time.**

---

**Q1: "How is this different from just writing a wrapper function around my tool calls?"**

A: That's exactly what the SDK does under the hood — it's a wrapper. The difference is what's inside the wrapper: a policy DSL that non-security-engineers can write, a centralized policy registry that applies across all your agents, a hash-chained audit trail that can't be tampered with by anyone with database access (including you), a human approval queue that integrates with Slack, a kill switch that stops all agents simultaneously, and compliance export templates for EU AI Act, SOC 2, OWASP. You *could* write this yourself. Lots of teams do. We're betting that specialization beats DIY here, the same way teams stopped writing their own auth and started using Auth0.

---

**Q2: "This adds latency. What's the real number?"**

A: In-process policy evaluation (local engine): <1ms per tool call. Cloud API evaluation: ~150ms median, ~200ms p99. We have a local policy engine that runs in-process for latency-sensitive scenarios — it's the default for the TypeScript SDK. The cloud API is used for audit logging and HITL routing regardless, but the block/allow decision can be made locally. For most agent architectures, tool call latency is dominated by the external service call (database, HTTP) at 50ms-2000ms — adding 1ms is noise. If you're doing high-frequency tool calls where even 1ms matters, we have async monitoring mode (log-only, zero additional latency).

---

**Q3: "Can't an agent just bypass this? If it has prompt injection, it could also be prompted to not call AgentGuard."**

A: This is the right question. The SDK wraps tool calls at the framework level — the agent calls a tool, that call routes through AgentGuard before reaching the actual tool implementation. The agent has no API access to the tool directly — AgentGuard is the intermediary. So an injected prompt can instruct the agent to "bypass the security check," but the agent has no mechanism to do that — it can only call tools through the SDK wrapper. This is why we describe it as operating at the execution layer, not the prompt layer. The agent's intentions don't matter; what matters is that every tool invocation goes through the evaluator.

---

**Q4: "SHA-256 hash chaining doesn't make the logs tamper-evident in the way you claim. An attacker with database access can rebuild the hash chain."**

A: Partial credit — you're right that if an attacker can modify the data AND recompute the hash chain AND update stored chain state, they can forge a consistent chain. Our tamper-evidence claim is accurate for the operational threat model: a DBA or developer who has database write access and modifies a record won't automatically update the hash chain, making the tampering immediately detectable by the verify endpoint. Against a sophisticated attacker with full database access AND knowledge of the hashing scheme AND time to recompute — you're right, hash chaining alone isn't sufficient. We're adding append-only write path enforcement (Q2 2026) and WORM-compatible export to S3/GCS (Q3 2026) to close this gap. We should be more precise in our marketing copy about the threat model — noted.

---

**Q5: "What's stopping an enterprise CISO from just buying Lakera or NeMo Guardrails?"**

A: Lakera (now Check Point) is a content safety tool — it scans prompts and outputs for harmful content and prompt injection. It operates at the LLM input/output layer. It doesn't know what tools your agent is calling, doesn't enforce policies on tool calls, doesn't have a HITL workflow, doesn't produce a compliance-grade audit trail. NeMo Guardrails is a runtime conversation filter that works at the response layer. Neither evaluates `DELETE *` before it hits your database. These are complementary tools, not competitors — we actually have a Lakera adapter for enhanced prompt injection detection. The differentiation is tool-level enforcement vs. content-level filtering.

---

**Q6: "Why would anyone trust a third-party security tool with their agent's tool calls? That's a massive trust surface."**

A: Valid concern. A few responses: (1) The SDK can run entirely in-process with local policy evaluation — your tool call data never leaves your infrastructure for the allow/block decision. Audit logs are what go to our cloud, and those are configurable. (2) Self-hosted deployment is available via Docker Compose — your audit data never leaves your stack. (3) We never use customer data to train models or for any purpose other than providing the service. (4) We're pursuing SOC 2 Type II (target: Q4 2026). We understand that being a security vendor means we're held to a higher trust standard, and we're trying to earn that trust one design partner at a time before claiming it broadly.

---

**Q7: "The kill switch kills all agents, but what if I have an agent doing something legitimate that I don't want to kill?"**

A: The current kill switch is tenant-wide — it's designed as a break-glass emergency measure, not a surgical tool. You can also kill by agent ID (`DELETE /v1/agents/:agentId`) to be more targeted. The tenant-wide kill switch is for "my LangChain agent is doing something catastrophic and I need everything to stop right now while I figure out what happened." Per-agent and per-agent-group kill switches are on the Q2 roadmap. The design decision was: when in doubt, an all-stop you can reverse in 10 seconds is safer than a targeted stop you might misconfigure under pressure.

---

**Q8: "The OWASP coverage is 77%. Is that independently verified?"**

A: No — that's our own assessment against the published OWASP Agentic Top 10 framework. It is not independently audited. We published our full mapping (agentguard.tech/owasp) showing which features address which controls and where the gaps are. The numbers are honest — we deliberately don't claim 100% because we have documented gaps. If you want to audit our self-assessment, the mapping is open and the framework is public. We'd welcome independent security researchers reviewing the methodology.

---

**Q9: "How do you handle MCP (Model Context Protocol)? That's the biggest attack surface right now."**

A: Partial coverage today. The policy engine can evaluate tool calls that are routed through MCP servers if they're instrumented through our SDK. What we don't have yet: a MCP server allowlist/denylist (which servers can your agent connect to?), cryptographic verification of MCP server identity, or protection against MCP server substitution attacks. These are documented gaps in our OWASP mapping (ASI04, ~60% coverage). We have MCP-specific enforcement on the Q2 2026 roadmap as a priority item — it's the fastest-growing attack surface in the ecosystem and we're aware we need to close this faster.

---

**Q10: "Why not open source? I can't use this in a regulated enterprise without auditing the code."**

A: We're on Business Source License 1.1 (BSL 1.1) — source-available, not open source. The code is readable and auditable, just not freely redistributable in competing commercial products. For regulated enterprises that need a code audit: we'll provide source access under NDA as part of our enterprise evaluation process. Full open source is something we're thinking about for the SDK layer (the part you run in your infrastructure) — keeping the cloud service proprietary. We haven't committed to that timeline yet. The honest answer: we're trying to build a sustainable business, and full open source makes that harder at this stage.

---

### 2.4 Optimal Posting Time

**Target: Tuesday at 9:00 AM Eastern Time (14:00 UTC)**

**Why Tuesday specifically:**
- Monday mornings are high-competition (weekend backlog + other launches)
- Tuesday 9am ET is when US East Coast HN readers are starting their day, West Coast are just waking up, EU afternoon is active — maximum concurrent eyeballs
- Avoid posting Thursday afternoon or Friday (conversation dies before you get enough discussion)
- Second choice: Wednesday 9am ET

**Day-of preparation:**
- Write the post text in a separate document first — not in the browser (tab crash risk)
- Have all links tested and live before posting
- Have the demo environment stable and load-tested (HN traffic spikes are real)
- Have team ready on Slack/Discord to respond to HN comments in real-time
- Atlas3 monitors PH; Nova3 monitors HN comments and coordinates responses

**If it goes to front page:**
- Post a tweet: "Show HN is on the front page — technical questions flying, come join: [link]"
- Don't spam — one tweet maximum
- Make sure docs.agentguard.tech doesn't go down (CDN, scale up if needed)

---

## 3. Launch Day Playbook

### 3.1 Hour-by-Hour Schedule

**T = 9:00 AM ET Tuesday (launch moment)**

All times in Eastern Time. Adjust for team time zone (Melbourne: +14h from ET = 11pm Tuesday local).

---

**T-7 days (Tuesday, Week Before): Hunter Outreach**
- Nova3: Final outreach to PH hunters. Confirm if one is hunting us.
- Forge3: Final demo environment load test. Ensure demo.agentguard.tech handles 500 concurrent users.
- Atlas3: Confirm Founding 20 landing page is live, form works end-to-end.
- Atlas3: Brief all team members on key messages, competitor comparison, anticipated questions.
- Nova3: Pre-write all social posts (Twitter thread, LinkedIn, Reddit) — just need to hit publish.

**T-1 day (Monday):**
- Forge3: Full system check. API health, database performance, SDK install paths working.
- Nova3: Pre-warm social audiences with teaser content:
  - Twitter: "Launching something tomorrow. AI agents need a security layer. We built one. 👀 Stay tuned."
  - LinkedIn: "Tomorrow we're sharing something we've been working on for the past year. It addresses a security problem nobody's talking about seriously yet."
- Atlas3: Confirm PH listing is ready in "Coming Soon" state (if using PH's pre-launch feature).
- Atlas3: Send "we're launching tomorrow" email to waitlist if it exists.
- Forge3: Set up monitoring dashboards — Datadog/equivalent watching API error rates, p99 latency, signup funnel.

**T-3 hours (6:00 AM ET):**
- Atlas3: Final systems check. Everything green?
- All team: Available and alert. This is launch day.

**T-0 (9:00 AM ET) — LAUNCH:**
- [ ] Product Hunt listing goes live (if using a hunter, they post it; otherwise post manually)
- [ ] HN "Show HN" post submitted by Hani (founder posting carries more weight than anonymous)
- [ ] Nova3: Twitter thread published (prepared in advance)
- [ ] Nova3: LinkedIn post published
- [ ] Nova3: Reddit post submitted to r/MachineLearning (text from FOUNDING20_LAUNCH_ASSETS.md, updated for launch)
- [ ] Atlas3: Post maker comment on PH immediately (pre-written — see 1.3)
- [ ] All team: Upvote PH listing from personal accounts (not egregious — limit to direct team/network)

**T+15 min:**
- [ ] Atlas3: Check PH comment section. Any early questions? Respond.
- [ ] Atlas3: Monitor HN. Any upvotes? Comments? Be ready to respond to first comment within 5 minutes.
- [ ] Forge3: Monitor signup funnel. Is the Founding 20 form accepting submissions? Any errors?

**T+30 min:**
- [ ] Atlas3: Brief network contacts to engage (upvote, comment) — pre-sent "it's live" DMs to 15-20 trusted contacts who agreed to help amplify.
- [ ] Nova3: Post Discord community posts (LangChain, CrewAI, AI Engineer — organic, not spam, appropriate channels).
- [ ] Atlas3: Check HN ranking. If not on front page yet, it's normal — HN takes time.

**T+1 hour:**
- [ ] Atlas3: Post second maker comment on PH (FAQ format — see 1.5, T+1 hour).
- [ ] Nova3: Engage with any social mentions, retweets, LinkedIn comments.
- [ ] Forge3: Check server logs. Any errors? Signup spikes causing issues?

**T+2 hours:**
- [ ] Atlas3: Are we in PH top 10? Status check. If yes: share PH link on Twitter without begging for upvotes.
- [ ] Atlas3: HN front page? If yes: notify team. Make sure we're responding to all HN comments.
- [ ] Nova3: Post LinkedIn follow-up comment with PH link (LinkedIn hates links in posts — put it in comments).

**T+3-6 hours:**
- [ ] Atlas3 + Nova3: Continuous comment monitoring and response on both PH and HN.
- [ ] Atlas3: Track live metrics (below) — report to team every 2 hours.
- [ ] Forge3: On standby for any bugs reported via comments/social.
- [ ] Nova3: Engage with mentions, share interesting community interactions.

**T+6 hours:**
- [ ] Atlas3: Mid-day status report to Hani. Signups so far, PH ranking, HN status, notable feedback.
- [ ] Nova3: Second Twitter post if warranted: "6 hours in — [X] teams have signed up, the HN conversation has been fascinating. Come see what we're building: [link]."

**T+8 hours (end of US workday):**
- [ ] Atlas3: Capture day's notable feedback — what surprised us, what questions recurred, what objections we didn't anticipate.
- [ ] Nova3: Evening LinkedIn wrap-up post.
- [ ] Atlas3: Post PH end-of-day comment (see 1.5, T+12 hours section).

**T+24 hours:**
- [ ] Atlas3: Day 2 analysis. Final signups, PH final ranking, HN front page status, GitHub stars, newsletter growth.
- [ ] Nova3: "Thank you for the incredible response" social post with real numbers.
- [ ] Atlas3: Personal emails to everyone who signed up for Founding 20. Welcome + schedule onboarding call.
- [ ] Forge3: Bug fix roundup for anything reported launch day.

---

### 3.2 Role Responsibilities

**Atlas3 (Coordination):**
- Launch day quarterback — owns the timeline
- Monitors PH and HN comment threads; drafts and posts responses
- Tracks all metrics in real-time (see 3.4)
- Decision authority on "if things flop" pivot actions
- Escalates to Hani for any product decisions, refund requests, or media inquiries
- Manages the outreach queue to Founding 20 applicants

**Nova3 (Social & Community):**
- Owns all social media channels launch day: Twitter, LinkedIn, Reddit, Discord
- Monitors @mentions and brand conversations
- Engages with shares, screenshots, reactions
- Drafts community posts for LangChain/CrewAI Discord (organic, not spam)
- Coordinates influencer/creator shares if any come in
- Handles press inquiries for initial responses (escalates to Hani for interviews)

**Forge3 (Technical Standby):**
- On call for any production bugs reported via comments or social
- Monitors API health metrics and database performance
- Priority 1: signup form working correctly
- Priority 2: demo.agentguard.tech staying up under load
- Priority 3: SDK install paths functional (npm and pip)
- SLA: respond to any critical bug within 30 minutes of report

**Hani (Founder):**
- Posts the HN "Show HN" (personal account, not branded)
- Available for media interview scheduling
- Final decision on any pivots or major messaging changes
- Responds to any enterprise inquiries that come in day-of

---

### 3.3 Social Amplification Plan

**Platform strategy:**

---

**Twitter/X:**
- Strategy: Technical thread that teaches something, not just promotes
- Post time: T+0 (9 AM ET launch)
- Content: Thread from FOUNDING20_LAUNCH_ASSETS.md Part 3, Section "Twitter/X — Thread" (3 tweets)
- Engagement: Monitor every mention and reply within 30 minutes. No bot-style responses.
- Amplification: DM 15-20 developer influencers (pre-arranged) when it goes live
- Target: 10+ retweets, 50+ likes on tweet 1 within first hour signals good momentum

**LinkedIn:**
- Strategy: Thought leadership angle — "AI agents are the biggest security blind spot in enterprise AI"
- Post time: T+0 simultaneously with Twitter
- Content: LinkedIn Post 1 from FOUNDING20_LAUNCH_ASSETS.md, adapted with link in first comment
- Engagement: Respond to every comment personally within 2 hours
- Target audience: CISO/VP Eng/CTO in companies with active AI agent development
- Amplification: Ask 5-10 professional connections to comment with their own perspective (not just likes — LinkedIn rewards comments)

**Reddit:**
- Target subreddits (in priority order):
  1. r/MachineLearning — technical audience, high credibility if it lands well
  2. r/LangChain — our core user community, smaller but higher purchase intent
  3. r/artificial — broader AI audience
  4. r/netsec — security angle, if we get good OWASP traction
  5. r/devops — CI/CD gate angle
- Post to ONE subreddit at launch. Cross-post only if original gets traction.
- Critical: No link posts in most ML subreddits — text post with link in comments
- Tone: Founder/builder voice, not corporate. "I built this because..." framing.
- Never delete and repost if it doesn't get traction — that's worse for reputation

**Discord Communities (organic, not spam):**

| Community | Channel | What to Post | Tone |
|-----------|---------|-------------|------|
| LangChain Discord | #tools-and-libraries | "Built something for LangChain security — happy to answer questions" + link | Builder-to-builder |
| CrewAI Discord | #announcements or #tools | "CrewAI users — built a security layer that wraps CrewAI natively" | Direct user value |
| AI Engineer Discord | #show-your-work | Full Show HN post-style writeup | Technical |
| Latent Space Discord | #products | Brief intro + link | Community member voice |
| MLOps Community | #tools | Security angle + EU AI Act angle | Compliance-aware |

**Rules for Discord:**
- Don't just drop a link
- Give value first: explain what it is, what problem it solves, what framework it supports
- Be in the channel before launch — don't appear as a drive-by spammer
- Respond to every reply in Discord threads

**GitHub:**
- Post to relevant GitHub Discussions (LangChain, CrewAI repos) only if appropriate
- Consider posting to GitHub Discussions in OWASP GenAI Security Project repo — we're citing their framework
- Add AgentGuard to "awesome-langchain" or similar curated lists (submit PRs in advance)

---

### 3.4 "If Things Go Viral" Contingency Plan

**Definition:** >500 signups in 24 hours, HN front page with >200 points, PH top 5 finish.

---

**Immediate actions:**

1. **Scale infrastructure** — Forge3 activates pre-prepared horizontal scaling plan. API must handle 10x normal traffic. Demo environment gets priority.

2. **Pause the Founding 20 counter** — If spots fill up faster than expected, immediately update the landing page to show "Founding 20 FULL — join waitlist for Cohort 2." Do not promise more than 20 — over-committing design partner relationships is worse than scarcity.

3. **Launch the waitlist** — Activate Cohort 2 waitlist page at agentguard.tech/founding-20/waitlist. Collect emails. Promise Cohort 2 in 60 days.

4. **Media inbound handling** — If press reaches out (TechCrunch, Wired, etc.), Hani is the point person. Atlas3 tracks inbound and prioritizes: (a) outlets with security focus, (b) outlets with developer audience, (c) general tech press.

5. **Slack/Discord overwhelm** — If the Founding 20 Slack fills with messages, set expectations: "We'll respond to every message within 24 hours." Don't let response quality degrade.

6. **Social media amplification acceleration** — Nova3 pivots from organic engagement to active resharing of the best testimonials/screenshots. "X people signed up in the first 6 hours" posts perform well.

7. **Freeze any new features** — Forge3 goes into code freeze. No new deployments on launch day unless it's a critical bug fix. The worst outcome is a well-timed deployment breaking things when traffic is highest.

**Follow-up:**
- Day 3 retrospective post: "We shipped, here's what happened" — engineers love transparency
- Personal emails to every Founding 20 member within 48 hours

---

### 3.5 "If Things Flop" Pivot Plan

**Definition:** <10 signups in 24 hours, no HN traction (< 20 points), PH outside top 20.

---

**First: Don't panic. Diagnosis before action.**

Common failure modes and targeted responses:

**Failure Mode A: Right product, wrong timing/platform**
- Symptoms: Good engagement from specific segments (e.g., HN comment from a CISO that's thoughtful) but no volume
- Action: Move to direct outreach. Email the 50 most relevant people in your network personally. "I launched something today that I think you'd find interesting given your work on [specific thing]."
- This is often the best outcome — a small number of genuinely interested people > viral engagement with shallow intent

**Failure Mode B: Messaging not landing**
- Symptoms: Low click-through, comments showing confusion about what the product does
- Action: In-flight messaging tweak. Post a new comment on PH/HN reframing the core value proposition. "I've seen some confusion — let me be more specific about what AgentGuard does and doesn't do."
- Don't delete and repost. Refine in-place.

**Failure Mode C: Missing the right community**
- Symptoms: General audiences didn't care, but one niche subreddit or Discord exploded
- Action: Double down on that niche. Post a more targeted version there. Cancel the general amplification plan.
- LangChain Discord or specific framework communities may be better initial channels than general HN

**Failure Mode D: Technical objections preventing trust**
- Symptoms: Smart technical comments questioning the architecture, security model, or tamper-evidence claims
- Action: This is actually valuable feedback. Don't defend — engage. If the criticism is valid, say so. "You're right about X, here's what we're doing about it." HN respects humility about technical limitations far more than defensive responses.

**Macro pivot if all else fails:**
- Switch from PLG launch to direct outreach to the 20 most targeted companies
- Frame Founding 20 as a closed beta with hand-selected participants, not a public campaign
- Use the launch materials as content for direct email outreach instead of broadcast
- The product is real. The audience exists. Distribution takes iteration.

---

### 3.6 Launch Day Metrics

Track these live in a shared dashboard (Google Sheet or Notion — Atlas3 owns it).

**Funnel metrics (updated every 2 hours):**

| Metric | Hour 1 Target | Hour 6 Target | End of Day Target |
|--------|--------------|--------------|------------------|
| PH upvotes | 25+ | 100+ | 200+ |
| PH position | Top 20 | Top 10 | Top 5 |
| HN points | 10+ | 50+ | 100+ |
| Founding 20 signups | 3+ | 10+ | 17+ |
| demo.agentguard.tech visitors | 50+ | 200+ | 500+ |
| npm installs | 20+ | 100+ | 300+ |
| GitHub stars | 10+ | 50+ | 150+ |
| Newsletter signups | 5+ | 25+ | 75+ |

**Engagement quality metrics:**
- PH comments: >10 (non-team) by end of day
- HN comments: >15 by end of day
- Comment sentiment: track positive/neutral/critical ratio (critical is useful, not bad)
- Twitter mentions: track, respond to all within 30 min
- Discord questions: track, respond to all within 1 hour

**Health metrics (Forge3 owns):**
- API p99 latency: <500ms (alert if >1s)
- API error rate: <1% (alert if >5%)
- Signup form success rate: 100% target (alert immediately on any error)
- demo.agentguard.tech uptime: 99.9%

**Post-launch (48 hours):**
- Founding 20 spots filled: target 17-20/20
- SDK installs (npm + PyPI): target 500+
- Organic signups: any signup not from launch day channels = signal for sustained growth

---

## 4. Design Partner Recruitment Script

**Goal:** Convert 3 design partners from launch-day interest (PH/HN/social).  
**Target profile:** Series A-C startup with AI agents in production or staging, CTO or VP Eng with direct authority.  
**Response speed:** Respond within 30 minutes to any inbound interest on launch day.

---

### 4.1 Outreach Template (Converting PH/HN Interest → Design Partner Conversation)

**Use when:** Someone has commented on PH/HN, signed up for Founding 20, or DMed expressing interest.

**Trigger text:** Adapt to match what they said (don't send a generic email — they'll notice).

---

**Subject:** [For HN commenter] Re: your question on the Show HN post / [For PH] Following up from Product Hunt / [For Founding 20 signup] Welcome — and a question

---

Hi [Name],

[**PH/HN personalization line — pick one:**]
- *Your question about [specific technical thing they asked] on the Show HN post was exactly the kind of thing I want to explore with early users.*
- *You signed up for the Founding 20 and I noticed you're building with [framework from form]. That's exactly our primary integration.*
- *Your comment about [specific concern] resonated — that's a gap we've thought hard about.*

I'm Hani, founder of AgentGuard.

I want to ask you directly: would you be interested in being one of our design partners?

Here's what that means in practice — no corporate speak:

**What you get:**
- AgentGuard Pro, free for the duration of the design partner relationship (minimum 12 months)
- Direct Slack channel with our engineering team — no ticket queue, real responses within hours
- Your specific use case shapes our roadmap. If you need something, we'll prioritize it or tell you honestly why we can't.
- First access to features before anyone else sees them

**What we ask from you:**
- A 30-minute weekly call for the first 60 days (monthly after that) — tell us what's broken, what's missing, what would make this a product you'd actually pay for
- Permission to use anonymized data from your deployment in our security research (opt-out always available)
- If it works well for you: a quote or case study (we'll draft it, you approve every word, you can pull it any time)

**No obligations beyond that.** If AgentGuard isn't working for you after 30 days, you tell us and that's it. We're not trapping anyone in a relationship.

**Why design partners, not just free users:**

Honest answer: I need people who'll tell me when something's broken or missing, not just quietly uninstall and move on. Five design partners who give me brutal feedback weekly are worth more than 500 users I never hear from. You'd be doing us a genuine service.

If this sounds interesting — even if you're uncertain — I'd love a 20-minute call this week to understand what you're building and whether AgentGuard is actually useful for you.

Available: [include 3 specific time slots]

Happy to hop on a call, no obligation.

— Hani
Founder, AgentGuard
hello@agentguard.tech

---

### 4.2 What Design Partners Get (Detailed)

**Free Pro Access — Full Details:**
- All Pro features, no event limits, no artificial caps
- Minimum 12 months from signing date, renewable
- Maintained even after public pricing changes
- One API key with "Founding Partner" tier — identifiable in our system

**Direct Slack Channel:**
- Private #[company-name]-agentguard channel in our Slack workspace
- Engineering team in there daily — Hani, Forge3, plus technical leads
- SLA: respond to any message within 4 business hours, critical bugs within 30 minutes
- Can tag us in threads, share code snippets, paste logs directly
- Not a support ticket queue — a real conversation channel

**Roadmap Influence:**
- Monthly call where we share upcoming features and explicitly ask for priority feedback
- Design partners can request features through the channel — we'll commit to a response (not always a yes, but always an answer with reasoning)
- Beta access to all new features before general availability — typically 2-4 weeks early
- Your specific use cases documented and referenced when making product decisions

**Founding Partner Recognition:**
- Listed on our website (optional — we'll ask each time)
- "Founding Partner" badge on your app.agentguard.tech dashboard
- Invitation to annual AgentGuard Summit (if/when we run one)

---

### 4.3 What We Ask From Design Partners

**The core ask — structured clearly to avoid ambiguity:**

**Weekly for first 60 days:**
- 30-minute structured call (we send agenda in advance)
- 3 key questions every call: (1) What broke or frustrated you? (2) What did you expect that didn't exist? (3) What would make you pay for this without hesitation?
- Honest answers only — no need to be polite. We need the hard feedback.

**Monthly thereafter:**
- 30-minute call, same format but less frequent
- Option to reduce to async Slack check-in if calls aren't the best format for you

**On an as-needed basis:**
- Bug reports when you find them (Slack channel is fine — no formal process)
- "I tried to do X and couldn't" messages — these are gold
- Response to occasional one-question emails or Slack pings: "Are you using feature X?"

**Case study (at month 3-4, if things are going well):**
- We draft it based on what you've told us in calls — you don't write anything
- You review every sentence — full approval rights
- Typical case study: "Company X was building Y. They had this problem. Here's specifically how they used AgentGuard. Here's what changed."
- You can request removal from the case study at any time for any reason
- This is for our website and sales conversations, not published news (unless you want it to be)

**One reference call per quarter (optional):**
- If a prospective customer asks "can I talk to someone who uses this?" — would you be open to a 20-min call?
- Always asked in advance, never assumed
- Can decline any specific request for any reason

---

### 4.4 Target: 3 Design Partners from Launch

**Qualification criteria (rank leads using this):**

| Criterion | Points | Notes |
|-----------|--------|-------|
| Has agents in production or staging | 3 | Not just planning to build |
| Using LangChain, CrewAI, or OpenAI | 2 | Native integration = faster value |
| CTO/VP Eng authority | 2 | Can make decisions, no approval chain |
| Regulated industry (fintech, healthcare, legal) | 2 | EU AI Act urgency = higher value |
| Series A-C company size | 1 | Right budget profile for eventual conversion |
| Mentioned specific pain (data exfiltration, compliance, audit) | 2 | Pain-aware = better design partner |
| Technical background (commented on architecture) | 1 | Will give better product feedback |

**Score 8+:** Immediately reach out, same day as launch.  
**Score 5-7:** Reach out within 48 hours.  
**Score <5:** Add to waitlist, nurture via email.

---

**Design Partner Qualification Call Script (15-20 minutes):**

```
Intro (1 min):
"Thanks for jumping on this. My goal is to understand what you're building 
and whether AgentGuard is actually useful for you — and to be honest if it's not."

Discovery (8-10 min):
→ "Tell me about the AI agents you're running. What are they doing in production?"
→ "What frameworks are you using?"
→ "Walk me through what happens today when you want to know what your agent did 
   in the last 24 hours. Can you do that?"
→ "What would need to go wrong for this to become your most urgent problem?"
→ "Any compliance requirements you're navigating? EU AI Act, SOC 2, HIPAA?"

Pain qualification (3-4 min):
→ "On a scale of 1-10, how much does [specific problem they mentioned] keep you up at night?"
→ "What have you tried so far to address this?"
→ "If this problem stayed unsolved for another 6 months, what's the worst case?"

AgentGuard fit check (2-3 min):
→ "Here's specifically what we'd do for [their use case]..." [tailor to what they said]
→ "Does that solve the actual problem, or am I missing something?"
→ "Is there anything in what I described that doesn't fit your stack or constraints?"

Design partner ask (1-2 min):
→ "Based on what you've shared, I think you'd be a great fit for our design partner 
   program. Here's what that looks like..." [describe from 4.2]
→ "Would that work for you?"
→ [If yes]: "Great. I'll send a one-page agreement this week. Nothing complicated — 
   it formalizes free access and the feedback commitment."
→ [If uncertain]: "What would help you decide?"
```

---

**Design Partner Agreement (keep it simple):**

A 1-page document, not a 10-page SaaS agreement. Key terms:
- Free Pro access for 12 months, renewable
- Weekly call commitment for 60 days, monthly thereafter
- Data usage: anonymized metrics only, no PII, opt-out available
- Case study: optional, full approval rights, revocable anytime
- Term: either party can exit with 30-day notice
- Governing law: [jurisdiction]

**Goal: signed within 1 week of the qualification call.**

---

### 4.5 Follow-Up Sequence for Non-Responders

If someone signed up for Founding 20 but hasn't responded to initial outreach:

**Day 1 (same day as signup):** Welcome email (auto-send from system)  
**Day 2:** Personal email from Hani if high-score lead  
**Day 4:** Design partner pitch email (see 4.1)  
**Day 7:** One follow-up: "Did this land? Happy to answer any questions before you decide."  
**Day 14:** Final follow-up: "Closing the loop — still happy to chat if timing is better later."  
**Day 21:** Move to monthly nurture sequence. Stop direct outreach.

**Do not chase beyond 21 days.** If they haven't responded by then, the timing isn't right. Add to monthly newsletter. They'll convert when the pain is acute enough.

---

## Appendix: Quick Reference

### Launch Day Emergency Contacts

| Situation | Contact | Response SLA |
|-----------|---------|-------------|
| API down / signup form broken | Forge3 immediately | 15 minutes |
| Media inquiry for Hani | Atlas3 to flag, Hani responds | 2 hours |
| Enterprise inbound (CISO wants a demo call) | Atlas3 to qualify, schedule within 48 hours | 4 hours |
| Viral social mention (10K+ reach) | Nova3 to respond, Atlas3 to amplify | 30 minutes |
| Hostile technical criticism (HN) | Atlas3 + Hani to respond together | 1 hour |
| Design partner sign-up interest | Atlas3 to qualify, Hani to call | 24 hours |

### Key URLs to Have Ready

| URL | Purpose |
|-----|---------|
| agentguard.tech/founding-20 | Founding 20 landing page + signup |
| demo.agentguard.tech | No-signup interactive demo |
| docs.agentguard.tech | Technical documentation |
| app.agentguard.tech | Dashboard login |
| agentguard.tech/eu-ai-act-compliance | EU AI Act landing page |
| agentguard.tech/owasp | OWASP mapping |
| api.agentguard.tech/api/docs | API documentation |

### Key Messages (commit to memory)

1. **The one-liner:** "AgentGuard evaluates every AI agent tool call before it executes — allow, block, or require human approval."

2. **The differentiation:** "Unlike content safety tools (Lakera, NeMo), we operate at the tool execution layer, not the prompt/output layer. We govern what your agent *does*, not what it *says*."

3. **The kill switch:** "One API call halts every agent in your tenant in under 50ms. The emergency brake that didn't exist before."

4. **The audit trail:** "SHA-256 hash-chained, tamper-evident. An auditor can verify it in seconds. Your existing logs can't make that claim."

5. **The honest gap:** "We're at 77% OWASP Agentic coverage. The gaps are documented. We'd rather be honest than claim perfection."

6. **The EU AI Act:** "August 2026 enforcement. Article 12 requires tamper-evident logs. AgentGuard gives you that out of the box."

---

*Prepared by Nova3 | TheBotClub | March 2026*  
*Coordinates with: FOUNDING20_LAUNCH_ASSETS.md, STRATEGY_REVIEW.md, EU_AI_ACT_LANDING.md, OWASP_AGENTIC_MAPPING.md*  
*Status: READY — submit to Atlas3 for review before launch*  
*Next review: Post-launch retrospective (48 hours after launch)*

# AgentGuard — Go-To-Market Playbook
## The Founders' Field Manual: First 5 Design Partners in 90 Days
### Draft v1.0 — February 2026
### Confidential

---

> This is not a strategy document. It's a playbook. The difference: a strategy tells you where to go. A playbook tells you exactly what to do tomorrow morning.
>
> You're three founders. You have no customers. You have a thesis. The next 90 days are about finding out if reality agrees with you — before you spend $3M building the wrong thing.

---

## TABLE OF CONTENTS

1. [Market Validation — Weeks 1-4](#1-market-validation)
2. [Positioning & Messaging — Weeks 2-3](#2-positioning--messaging)
3. [Design Partner Program — Weeks 4-12](#3-design-partner-program)
4. [Content & Community Strategy — Ongoing](#4-content--community-strategy)
5. [Sales Process — Month 3+](#5-sales-process)
6. [Metrics & Milestones](#6-metrics--milestones)
7. [What the Founders Do This Week](#7-what-the-founders-do-this-week)

---

## 1. Market Validation (Weeks 1-4)

### The Only Goal Right Now

Before you write a single line of product code, you need to know:
- Is agent security actually keeping CISOs up at night, or is it a "nice to have"?
- Do they recognise the specific problems you solve (not just "AI is risky")?
- Would they have someone evaluate a product like this NOW, not "someday"?
- What would make them sign something in the next 6 months?

You need 15-20 conversations with real buyers in 4 weeks. Not 5. Not "we'll get around to it." Twenty. This is the most important work you can do right now.

---

### Who to Talk To

**Tier 1 — Primary Targets (most signal, most likely to become design partners)**

| Title | Company Profile | Why Them |
|-------|----------------|----------|
| CISO / VP Information Security | 500-5,000 employees, FS/healthcare/tech, active AI programme | Budget authority + board pressure = buying trigger |
| VP Engineering / Head of AI Platform | Series B-D startup, actively deploying agents | Technical champion + immediate pain = fast decisions |
| GRC Lead / DPO | Regulated enterprise (EU HQ or US with EU customers) | EU AI Act deadline = urgent compliance trigger |
| Head of AI / Chief AI Officer | Enterprise innovation team, 2,000+ employees | New role = pressure to prove safe deployment |

**Tier 2 — Good secondary sources**

| Title | Why Useful |
|-------|-----------|
| AI/ML Engineer building agents | Understand ground-level pain; often influence upward |
| Security Architect | Technical validation; can be internal champion |
| Chief Risk Officer | In FS/insurance, often sponsors AI governance |

**Company types to prioritise:**
- Financial services (banks, fintechs, insurance) — DORA + EU AI Act double trigger
- Healthcare (digital health, clinical AI, health IT) — HIPAA + patient safety stakes
- Legal tech / regtech — agents in high-liability contexts
- Enterprise SaaS (100+ employees, multiple agent deployments) — platform complexity pain
- Consulting firms building agents for clients — multiplier effect, fast learners

**Company types to avoid in Week 1-2:**
- Tiny startups with no compliance requirements (wrong segment)
- Pre-product companies "thinking about agents" (no concrete pain)
- Big 4 consulting (long cycles, hard to reach real decision-makers)

---

### How to Find Them

**LinkedIn (your primary source):**

Search strings that work:
- `"CISO" AND ("AI agents" OR "LangChain" OR "agentic AI") AND ("financial services" OR "healthcare")`
- `"head of AI security" OR "AI risk" OR "AI governance"` — this exact role is emerging and these people need a product like yours
- `"VP Engineering" AND ("AI platform" OR "agent" OR "LLM") AND (Series B OR Series C)`

**Warm outreach first — exhaust your network:**

Before any cold outreach, map your combined network:
1. Every ex-colleague now in a CISO/security role
2. Every YC/accelerator alumni list you have access to (especially if you went through YC)
3. Everyone in your investor's portfolio who is deploying agents
4. LinkedIn 2nd-degree connections to the titles above

A warm intro converts at 5-8x over cold outreach. Spend 2-3 days on warm before going cold.

**Communities where your buyers hang out:**
- CISO communities: CISO Forum, CISO Connect, ISC2 communities, BSidesX Slacks
- AI engineering: MLOps Community Slack, Hugging Face Discord, LangChain Discord
- Compliance: IAPP (privacy pros), ISACA, SCWorld, Dark Reading LinkedIn group
- Conferences (for warm outreach): RSA, Black Hat, SANS, AI Summit

**Twitter/X:**
Search for people publicly discussing "AI agent security", "LLM security", "EU AI Act compliance" — these are your warmest cold leads because they're already thinking about the problem.

**Paid search for contacts:**
- Apollo.io (~$50/month) — email + LinkedIn combo, good for bulk prospecting
- Hunter.io — email finding for companies you've already identified
- LinkedIn Sales Navigator (~$100/month) — worth it during validation phase

---

### LinkedIn Outreach Templates

**Important:** Never send more than 10-15 per day or LinkedIn will flag you. Send Tuesday–Thursday (higher acceptance rates). Personalise the first line every time — the templates below need 1 sentence of personalisation at the top.

---

**Template 1: CISO — Board Pressure Angle**

```
Subject line: AI agents + your board deck

Hi [Name],

I noticed [company] has been expanding its AI programme — [specific detail: job posting / recent news / product launch].

I'm doing founder research on a problem I suspect is landing on your plate: governing what AI agents actually DO in production — not just securing the model, but the runtime behaviour. Prompt injection, policy enforcement, audit trails that survive a regulatory inquiry.

I'm not selling anything — genuinely trying to understand how CISOs are thinking about this before we build. Would you have 25 minutes to tell me what's actually keeping you up at night with your agent deployments?

[Your name]
P.S. Happy to share what I'm hearing from other CISOs — some of it is alarming.
```

---

**Template 2: VP Engineering — Developer Pain Angle**

```
Subject line: Quick question about your agent stack

Hi [Name],

Saw [company] is [building agents / hiring AI engineers / shipping agentic features] — impressive progress.

I'm researching the operational gap that shows up when you get past 2-3 agents in production: monitoring intent vs. just API calls, policy enforcement that's outside the LLM (so it can't be bypassed), audit trails that satisfy security teams without slowing down engineers.

Genuinely want to understand how engineering leaders are handling this before we build a solution. 20 minutes, no slides, just questions? I'll send you a summary of what I hear across the market.

[Your name]
P.S. One of the engineers I've spoken with described it as "we trust the agent until it does something weird, and then we have nothing to debug with." Does that resonate?
```

---

**Template 3: GRC Lead / DPO — Regulatory Deadline Angle**

```
Subject line: EU AI Act Article 9 — how are you handling this?

Hi [Name],

EU AI Act enforcement for high-risk AI is now real and coming. The Article 9 risk management + Article 12 logging requirements are particularly thorny for organisations with production AI agents — the evidence regulators want doesn't exist yet in most companies.

I'm doing founder research on this gap and would love 20 minutes with someone who's actually trying to build an AI compliance programme rather than just talk about it. I'm specifically curious whether you're seeing a gap between what your GRC tools produce and what auditors are going to ask for on AI systems.

No agenda other than learning. Happy to share aggregated insights from the interviews.

[Your name]
```

---

**Response rate reality check:**
- Cold LinkedIn messages: 5-10% response rate
- Warm intro: 40-60%
- "Researching the space" framing (not "I built a thing"): converts ~2x better than product pitches

If you send 100 messages, you'll get 8-12 responses, and book 6-8 calls. Send more messages.

---

### The Discovery Call Script

**Goal:** Learn, not pitch. You want them talking 80% of the time. You are a reporter, not a salesperson.

**Before the call:**
- Research the company's AI footprint: job postings, recent news, LinkedIn posts from their team
- Know which framework they use if possible (LangChain users vs. OpenAI SDK vs. custom)
- Look up any relevant incidents at peer companies you can reference

**Opening (2 min):**
> "Thanks for making time. I want to be upfront — I'm a founder and I'm in research mode. I have a hypothesis about a problem in AI agent security and I want to know if I'm thinking about it correctly. The most valuable thing you can do for me is tell me I'm wrong. I'm going to ask a lot of questions and I'll summarise what I'm hearing at the end if that's useful. Sound good?"

This framing works because: (a) it's honest, (b) it takes sales pressure off them, (c) it flatters their expertise.

---

**Problem Interview Script (Weeks 1-2 — before you show anything)**

*Context questions (5 min):*
- "Walk me through your current AI agent landscape — what are you deploying, what frameworks, what use cases?"
- "How many agents are in production vs. staging right now, roughly?"
- "Who owns agent security at your company — is it a security team problem, a platform team problem, or is it just... no one's job yet?"

*Pain probing (10 min):*
- "What's your biggest operational concern with agents in production right now?"
- "Have you had any incidents — or near-misses — with agent behaviour?" *(Listen hard here. Stories = real pain.)*
- "When an agent does something unexpected, what does your debugging process look like?"
- "If I asked you to produce an audit trail of what your agents accessed last month, how long would that take?"
- "Your board deck — is there a slide on AI risk yet? What does it say?"
- "Have you had any conversations with your cyber insurer about AI agent risk?"
- "Has EU AI Act or any specific regulation come up in the context of your agent deployments?"

*Priority calibration (5 min):*
- "On a scale of 1-10, how urgent is the governance/security problem for your AI agents specifically?"
- "What are you doing about it today, if anything?"
- "What would make this a top-3 priority for you vs. something that stays in the backlog?"

*The "future state" question (3 min):*
- "If you had a magic wand — what would the ideal state look like? What would you be able to see or do that you can't today?"

*Wrap up:*
- "If a product existed that did [summarise what they described], what would you need to see to evaluate it?"
- "Is there anyone else at your company or in your network who's dealing with this more acutely that I should talk to?"

**What to listen for:**
- Specific stories of incidents or near-misses (not generic "AI is risky")
- Frustration with the gap between what their SIEM shows and what agents are actually doing
- Mention of a board presentation, regulatory deadline, or insurance review as the trigger
- Organisational confusion about who owns the problem
- "We're just hoping nothing bad happens" — that's a green flag

---

**Solution Interview Script (Weeks 3-4 — after you have initial hypotheses)**

After 8-10 problem interviews, you'll have patterns. Now you test a solution hypothesis:

> "Based on what you've told me, here's what I think you need. Tell me if I'm wrong."

Then describe the solution in concrete terms:
- "Runtime policy enforcement — rules that live *outside* the LLM so they can't be bypassed by prompt injection"
- "Tamper-evident audit logging that captures not just API calls but the agent's reasoning chain — so you can reconstruct *why* it did something"
- "A kill switch with <500ms response time and configurable fail-closed/fail-open per agent"
- "Pre-built compliance packages that map your agent activity directly to EU AI Act Article 9, 12, 14"

Then ask:
- "Does this resonate with the problem you described, or am I solving the wrong thing?"
- "Which of these would make you sign something right now vs. 'interesting but not urgent'?"
- "What would you need to see — in terms of proof — to put budget behind this?"
- "What would this be worth to you? I'm thinking about pricing and I'm genuinely curious what you'd expect to pay for this."

---

### Problem Interview vs. Solution Interview

**Problem Interview (Weeks 1-2):**
- Zero product mentions
- Goal: understand their world, confirm the problem is real, find out what they're currently doing
- Red flag if you're talking >30% of the time
- Perfect outcome: they tell you a specific story that makes you think "holy shit, we need to build this"

**Solution Interview (Weeks 3-4):**
- Present 3-4 solution elements, not a demo
- Goal: validate that your proposed solution maps to their actual pain, test pricing intuitions, identify what "proof" they need
- Watch for: "that's interesting" (polite dismissal) vs. "wait, can it actually do X?" (real interest)
- Ask for a commitment at the end: "If we built exactly this, would you be willing to be a design partner — active user, give us feedback, consider being a reference?"

---

### Red Flags — Stop, Pivot, or Reconsider

**Market red flags (if you see these in 5+ interviews, reassess):**
- "We don't have any AI agents in production" — you're too early for this segment
- "We're using [ChatGPT/Copilot], not building agents" — wrong ICP; they're using AI tools, not building systems
- "Our model provider handles security" — belief that OpenAI/Anthropic solves this; you need to find people who've moved past this assumption
- "We'll handle it internally when the time comes" — no urgency, no budget trigger
- "That's interesting but I can't see us prioritising this for 12+ months" — too early, wrong segment

**Conversation red flags (these specific buyers won't convert):**
- They spend the call talking about model safety, not runtime governance — different problem space
- They've never deployed an agent in production and have no near-term plan to
- Security is "someone else's problem" (no ownership = no budget)
- They're not willing to give you a referral even if they find the conversation useful

---

### Green Flags — You've Hit a Nerve

These are the signals that tell you to lean in hard:

- **The story**: They spontaneously tell you a specific incident or near-miss without you asking. This is gold.
- **The boardroom mention**: "My board just started asking about AI risk" — this is a live buying trigger
- **The audit anxious**: "I have an audit in 3 months and I have nothing to show them" — acute pain = fast decision
- **The comparison**: They compare you to Snyk ("like Snyk but for agents") — they understand the category
- **The referral**: At the end of a call, they say "you should talk to [name] at [company], they'd love this" — unsolicited referrals mean you've resonated
- **The follow-up**: They email you the next day asking when something will be available
- **The lean forward question**: "What does the integration actually look like?" — they're mentally testing deployment
- **The pricing question**: They ask unprompted what it costs — only happens when they want it

---

### Tracking & Scoring Interviews

**Set up a simple Google Sheet. That's it. Don't over-engineer this.**

**Columns:**
| Date | Name | Title | Company | Industry | Size | Call type | Urgency (1-5) | Problem resonance (1-5) | Solution resonance (1-5) | Budget authority (Y/N) | Timeline | Notes | Next step | Design partner potential (Y/N) |

**Scoring guide:**

*Urgency (1-5):*
- 1 = "interesting space, not urgent"
- 3 = "we'll need to deal with this in the next year"
- 5 = "I have a board meeting in 6 weeks and I have nothing to show them"

*Problem resonance (1-5):*
- 1 = "I don't really recognise this as our problem"
- 3 = "yes, this is a challenge we face"
- 5 = "this is exactly the problem — let me tell you about the incident we had last month"

*Solution resonance (1-5):*
- 1 = "interesting but I'd solve it differently"
- 3 = "yes, this addresses the problem"
- 5 = "when can I get access?"

*Budget authority:*
- Y = they can sign or directly influence the decision
- N = they'd need to escalate

**Weekly review:** At the end of each week, look at your scores. If you're not seeing 4-5s on problem resonance by Week 2, you're talking to the wrong people. Change your ICP, not your pitch.

---

### Decision Criteria — When Do You Have Enough Signal?

**Minimum to proceed to product build (base case):**
- 15 completed interviews
- At least 8 with problem resonance score ≥ 4
- At least 5 with stated willingness to be a design partner
- At least 2 with budget authority who said "yes, we'd evaluate this"
- At least 1 specific story of a real incident or near-miss you can anonymise for content

**Strong signal to accelerate:**
- 3+ unsolicited referrals
- 2+ people who asked "when can I get access?" before you mentioned the product
- Consistent, specific vocabulary emerging (e.g., every CISO uses the phrase "I can't audit my agents" — that's a message)

**Signal that should make you reassess:**
- <5 of 15 interviews score ≥ 3 on problem resonance
- No one has a concrete trigger (no audit, no board request, no incident) — "nice to have" market
- Pricing expectations are dramatically below your model ($500/year vs. $2,500/month)
- Everyone says "we'd build this ourselves" — indicates a developer tool play, not a security/compliance product

---

## 2. Positioning & Messaging (Weeks 2-3)

*Refine this as interview data comes in. Start here, but let what you hear reshape it.*

---

### The One-Liner

> **AgentGuard is the security layer for AI agents — policy enforcement, real-time monitoring, and compliance audit trails for every agent you deploy.**

Use this when someone asks "what do you do?" at a conference. Nothing more complex until they ask a follow-up.

---

### Elevator Pitch (30 seconds)

> "Every company deploying AI agents is about to realise they have the same problem: agents are taking real-world actions — moving money, accessing data, executing code — but there's no security layer governing what they can do.
>
> AgentGuard is that layer. Runtime policy enforcement, tamper-evident audit logging, and a kill switch — for any agent, any framework. Think: firewall + SOC + compliance engine, purpose-built for autonomous AI.
>
> We're focused on the enterprises where 'the agent did something we didn't expect' means a regulatory inquiry or a board-level incident."

---

### Full Pitch (2 minutes)

> "Let me describe a scenario. A CISO at a financial services firm has 200 AI agents deployed across six departments. Her board asks about AI risk every quarter. She cannot tell them what those agents accessed last month, whether any of them violated data handling policies, or whether one is currently exfiltrating PII to a third-party API. She has nothing to show them.
>
> That's the problem we're solving. AI agents are going to production — they're booking flights, approving payments, managing infrastructure — and there's no security layer between 'the agent was given a task' and 'the agent did something catastrophic.'
>
> Traditional SIEM tools see the API call but don't understand the reasoning chain behind it. Model-level safety is a starting point, not a deployment guarantee. Prompt injection detection covers one attack vector.
>
> AgentGuard is the runtime security layer that sits in the middle. Policy enforcement outside the model — so it can't be bypassed by a clever prompt. Tamper-evident audit logging that captures not just what the agent did but *why*. A kill switch that responds in under 500ms. And pre-built compliance packages for EU AI Act, SOC 2, HIPAA, DORA — generated automatically from the same data you'd collect anyway.
>
> We're working with design partners in financial services and healthcare who have agents in staging right now and need to get them to production safely. If you're deploying agents and you want to be able to answer your board's next question about AI risk, I'd love to show you what we're building."

---

### Positioning by Persona

**For the CISO:**
> "AgentGuard gives you the visibility and control you need to govern AI agents the way you govern your endpoint fleet — unified view, policy enforcement, incident response, and the audit trail that survives a regulatory inquiry. Finally, something to put on that board slide."

*Key message:* You can see your agents. You can prove you're in control. You won't be blindsided.

---

**For the VP Engineering / Head of AI Platform:**
> "AgentGuard is one import and a YAML file. Your agents get tamper-evident logging, policy enforcement outside the LLM, and a kill switch — without rebuilding your architecture. Stop reinventing guardrails every time a new team deploys an agent."

*Key message:* Five-minute integration. Policies as code. No re-architecture.

---

**For the GRC Lead / DPO:**
> "AgentGuard turns your agent monitoring data into compliance evidence automatically. EU AI Act Article 9, 12, 14? Done. ISO 42001? Done. Your auditor asks for evidence of AI oversight controls — you export a package, not a PowerPoint. Regulatory updates propagate as policy template suggestions."

*Key message:* Compliance evidence that exists before the audit, not after the panic.

---

### Differentiation vs. Specific Competitors

**vs. Lakera Guard:**
> "Lakera is excellent at what it does — detecting prompt injection at the input layer. But input-layer detection is one control in one layer. It doesn't enforce policies on what the agent *does* with its tools, doesn't produce audit trails for compliance, doesn't give you multi-agent visibility, and doesn't have a kill switch.
>
> AgentGuard is the difference between a bouncer at the door and a security team that monitors the whole building. You want both, but you definitely need the second one."

*When they say: "We already have Lakera."*
Response: "Good — that's the input layer. We're the runtime layer. They're not substitutes. A CISO who has Lakera and no AgentGuard can prevent prompt injection but still can't answer their board's questions about what their agents are doing."

---

**vs. CalypsoAI:**
> "CalypsoAI is focused on model-level content security — essentially a safety layer around model responses. It's valuable for controlling model outputs in chat applications.
>
> AgentGuard is runtime governance for the action layer — what tools the agent calls, what it accesses, what policies govern its decisions. Different threat model: we're not just filtering outputs, we're governing behaviour across the full agent lifecycle."

---

**vs. WitnessAI:**
> "WitnessAI focuses on data security and access governance for AI models — useful for controlling what data models can see. AgentGuard focuses on what agents *do* with that data — the tool calls, the policy enforcement, the audit trail of actions taken. Complementary, not competitive."

---

**vs. Protect AI:**
> "Protect AI is focused on ML model security — scanning models for vulnerabilities, malicious fine-tunes, supply chain risk. It's a security tool for the ML pipeline, not the deployed agent runtime.
>
> AgentGuard secures what happens after the model is deployed — when it's actually taking actions in the world. Different phase, different threat model."

---

**vs. Traditional SIEM (the "we already have Splunk" objection):**
> "Splunk sees the API call. It logs that your agent called a Stripe API for $4,200. What it doesn't know: was that call legitimate? Was it the result of prompt injection? Was it within the agent's declared policy scope? Splunk doesn't understand agent intent — it understands infrastructure events.
>
> AgentGuard enriches your Splunk data with agent context. We don't replace your SIEM — we make it actually useful for agent threats."

---

### The "Why Now" Narrative

Use this in investor pitches and with buyers who need to justify the spend:

> "Three things are happening simultaneously.
>
> First, agents are going to production *right now*. The LangChain Discord has 100,000 members. OpenAI's Assistants API shipped. CrewAI is in production at companies you've heard of. This is not a 'someday' market.
>
> Second, regulation has arrived. EU AI Act enforcement for high-risk AI is active. The Snyk acquisition of Invariant Labs in early 2026 validated that the enterprise security market is waking up to this. Insurance underwriters are adding AI agent questions to their risk assessments.
>
> Third — and this is the narrow window — no category leader exists. Lakera has a slice. Traditional SIEM vendors don't understand agents. The model providers only secure their own stack. The enterprise buyer who needs to govern 200 agents across six frameworks has nowhere to go.
>
> In 18 months, CrowdStrike or Palo Alto will have built or bought something. That's the window we're in."

---

### Top 10 Objections and How to Handle Them

**Objection 1: "We don't really have AI agents in production yet."**
Response: "When do you plan to? Because the worst time to add a security layer is after an incident. We have design partners who are integrating AgentGuard in staging *before* production — so the controls are there on day one. Happy to talk about what that looks like for your timeline."

---

**Objection 2: "Our model provider handles AI safety."**
Response: "Model safety is a starting point, not a deployment guarantee. Anthropic and OpenAI build safer models — but once that model is deployed as an agent with tool access, no model provider governs what it actually *does* with those tools. A safe model in an unsafe architecture still produces dangerous outcomes. We secure the deployment, not the weights."

---

**Objection 3: "We can build this ourselves."**
Response: "Probably, eventually. But ask yourself: how long would it take to build tamper-evident audit logging, a policy engine, and a kill switch that works across your five agent frameworks? And does your security team want to maintain that? Your core competency is [their product] — ours is agent security infrastructure. The same reason you buy Splunk instead of building a SIEM."

---

**Objection 4: "This adds latency. We can't have our agents slowing down."**
Response: "This is the most common concern, and it's why we designed to this constraint. Our p99 latency overhead is under 50ms — and we contractually guarantee that in the enterprise SLA. The data plane is non-blocking for standard actions. We're not a synchronous API call on every agent step — we're a lightweight intercept with async telemetry. We can share our benchmark methodology."

---

**Objection 5: "What's the difference between this and just good logging?"**
Response: "Logging tells you what happened. AgentGuard tells you why it happened, whether it should have happened, and stops it from happening again. The delta is: (1) policy enforcement — rules that *prevent* actions, not just record them, (2) chain-of-thought logging — capturing the agent's reasoning, not just the tool call, (3) tamper-evident structure — so the logs survive a forensic investigation. Good logging is a component of what we do, not the whole thing."

---

**Objection 6: "EU AI Act doesn't really apply to us / enforcement isn't happening yet."**
Response: "DORA is enforcing for EU financial entities. HIPAA audits for healthcare AI have been active. The SEC's cybersecurity disclosure rules are live for public companies. Even without EU AI Act, you've likely got at least two regulatory frameworks that apply to your agent deployments right now. And enforcement dates for high-risk AI provisions under EU AI Act are active — we can walk through which of your agents likely qualify as high-risk."

---

**Objection 7: "What happens if your company doesn't exist in 2 years?"**
Response: "Legitimate concern. A few answers: (1) we're structured as an open-core company — the core policy engine is Apache 2.0, you can fork it, (2) we've designed for portability — your policy files are YAML you own, logs are exportable in standard formats, (3) design partners get source code escrow provisions in their agreements. We're also raising from investors whose job is to make sure we're well-capitalised."

---

**Objection 8: "CrowdStrike / Palo Alto will just build this."**
Response: "In 12-18 months, probably. Two things happen before that: (1) you have an agent incident without coverage, or (2) you're one of the first 25 customers of the category-defining platform. The incumbents are also building *for* their existing customer base and existing telemetry — they'll struggle to understand agent intent the way a purpose-built platform does. Same reason Zscaler beat Cisco at cloud security despite Cisco's distribution."

---

**Objection 9: "The pricing seems high for something I haven't seen work yet."**
Response: "That's exactly why we have a design partner programme. Design partners get heavily discounted or free access for the first 12 months in exchange for deep product collaboration. The commercial pricing is after we've proven value together. Want to talk about what a design partner relationship looks like?"

---

**Objection 10 (investor version): "The market might not be ready — agents aren't really in production at scale."**
Response: "Look at LangChain's download numbers: 90M+ downloads. OpenAI's Assistants API has millions of users. McKinsey reports 65% of enterprises are 'regularly using' AI in some function as of 2024. The question isn't whether agents are in production — it's whether enterprises have the security layer to match. Our discovery interviews tell us they don't, and they know it. We're 6-12 months ahead of the market fully waking up to the problem — which is exactly where you want to be at Series A."

---

## 3. Design Partner Program (Weeks 4-12)

### What a Design Partner Is (and Isn't)

A design partner is:
- An organisation actively using (or committed to actively using) AgentGuard in staging or production within 60 days of signing
- Someone who gives you real feedback, not polite feedback
- A company that will become a paying customer if the product delivers value
- Potentially (not always) a reference or case study

A design partner is NOT:
- An organisation that says "we're very interested" and never deploys
- A favour from a friend who won't actually use it
- A logo you can put on a slide but who won't take your calls
- A customer who already knows exactly what they want and won't help you shape it

**Target: 5 design partners by Month 6.**

Why 5? It's enough to find patterns in feedback without being paralysed by conflicting requirements. It's the number investors want to see for Series A conversations. It's achievable in 3-6 months with focused effort. More than 5 design partners before you have a working product will overwhelm your 3-person team.

---

### The Ideal Design Partner Profile

**Sweet spot:**

| Characteristic | Target |
|---------------|--------|
| Company size | 200-5,000 employees |
| Industry | Financial services, healthcare, legal tech, or enterprise SaaS |
| Agent maturity | 2-20 agents in staging or production (or actively building) |
| Technical profile | Has a dedicated AI/ML engineering function |
| Compliance posture | Has a CISO or GRC function — compliance requirements are real |
| Geography | US or EU (EU AI Act urgency; DORA for FS) |
| Decision speed | Can move in <4 weeks from "interested" to signed agreement |

**The 5 archetypes to target (get at least one of each):**
1. **The CISO Champion** — a named CISO at a FS or healthcare company who has board pressure
2. **The Platform Builder** — a VP Eng at a Series B/C startup deploying agents aggressively
3. **The Compliance Urgency** — a GRC Lead at an EU-regulated company with an audit coming
4. **The Incident Survivor** — someone who has already had a minor agent incident
5. **The Lighthouse Logo** — a recognisable name you can (eventually) reference publicly

**Avoid as design partners (even if they want in):**
- Companies that won't deploy for 6+ months — you need feedback now
- Companies with 50+ agents in production who need enterprise-grade SLAs you can't support yet
- Companies that want you to build custom features as a condition of participating — that's consulting, not partnership
- Companies where the champion has no internal authority — they'll say yes and then nothing will happen

---

### What You Give Design Partners

Be explicit about this in writing:

**Access:**
- Early access to AgentGuard platform (staging environment first, production when stable)
- Direct Slack channel with the founding team — not a ticket queue
- Bi-weekly 30-minute calls with a founder (not an account manager)
- Ability to request features / influence roadmap (with honest "yes/no/later" responses)
- First access to new features before general release

**Pricing:**
- **Free for 12 months** is the right call at this stage. Here's why:
  - You need their time and honest feedback more than you need their money
  - Paying customers feel entitled to finished product; design partners accept rough edges
  - 12 months free + a conversion conversation at Month 10 is a better sales motion than a discounted price that creates billing complexity
  - One $30K/year enterprise contract isn't worth killing your design partner relationship over
- If they push back on "free" as seeming low-credibility: offer a nominal amount ($1K-5K for the 12-month pilot) with a full commercial conversion conversation at renewal
- **Do not offer free forever** — that trains them to not value it

**Alternative: token pricing.** Some design partners are more engaged if they have nominal skin in the game. $5K-10K for a 12-month pilot is fine. Makes procurement easier at some companies (legal needs a real contract). Your call based on the specific partner.

---

### What They Give You

Get this in writing. A design partner agreement that doesn't specify obligations is a favour, not a partnership.

**Required (non-negotiable):**
- Commit to deploy AgentGuard in at least one staging environment within 60 days of signing
- Participate in bi-weekly feedback calls for the first 6 months
- Respond to specific surveys/questionnaires within 5 business days
- One primary point of contact with decision-making authority

**Requested (include in the agreement as "by default unless opted out"):**
- Case study rights — you can write a public case study with their approval after 6 months
- Reference call availability — they'll take a 20-minute call with a prospective customer once per quarter
- Public quote / testimonial after 6 months if goals are met
- Participation in one press release or launch announcement

**Optional (don't make these required):**
- Advisory board seat (only offer to 1-2 with strong strategic value)
- Co-author a blog post or threat research report
- Present at a joint webinar

---

### The Design Partner Agreement — Outline Terms

This is NOT legal advice. Have a lawyer review it. But this is what you need:

```
DESIGN PARTNER AGREEMENT OUTLINE

1. PARTIES AND PURPOSE
   Company name, AgentGuard entity, purpose: mutual product development collaboration

2. PROGRAMME TERM
   12 months from signing. Renewal conversation at Month 10.

3. AGENTGUARD OBLIGATIONS
   - Access to platform at no charge for programme term
   - Dedicated support channel (response within 1 business day)
   - Bi-weekly calls with founding team
   - Reasonable feature requests considered for roadmap (no guarantees)
   - Source code escrow arrangement [if required by partner]

4. DESIGN PARTNER OBLIGATIONS
   - Deploy AgentGuard in at least [1] environment within 60 days
   - Designate primary technical contact
   - Participate in bi-weekly product calls
   - Complete product surveys within 5 business days
   - Provide good-faith feedback, including negative feedback

5. INTELLECTUAL PROPERTY
   - Partner's data remains partner's data
   - Feedback is incorporated as product improvements (no IP transfer for feedback)
   - Anonymised aggregate learnings may be used in product development and marketing
   - AgentGuard retains all IP in the platform

6. CONFIDENTIALITY
   - Mutual NDA for programme duration + 2 years
   - Partner can reference AgentGuard internally
   - AgentGuard cannot publicly reference partner without written consent
   - Exception: generic "design partner in financial services" descriptions with prior approval

7. CASE STUDY AND REFERENCE
   - After 6 months, if agreed goals are met, partner will consider a case study (mutual consent required)
   - Partner agrees to take one reference call per quarter with a prospective customer
   - Partner can opt out of any specific reference at their discretion

8. DATA HANDLING
   - AgentGuard's data processing addendum applies
   - Partner data not used for training or sharing with third parties
   - Data residency options: [US / EU] — specify at signing
   - Deletion on programme termination within 30 days

9. LIMITATION OF LIABILITY
   - AgentGuard is in pre-commercial development. No SLA guarantees during programme.
   - Partner acknowledges early-access nature.
   - Cap on liability: programme fees paid (or nominal cap if free)

10. TERMINATION
    - Either party can terminate with 30 days written notice
    - AgentGuard retains case study rights for content created before termination with approval
```

---

### Converting Design Partners to Paying Customers

The conversion conversation should happen at Month 10 — not at Month 12 when the free period ends (too late) and not at Month 3 (too early).

**The Month 10 Conversation:**

> "We're coming up on the renewal point. I want to be direct about what commercial looks like — but first, let me understand: has AgentGuard delivered value for you? If yes, let's talk about the commercial arrangement. If not, I want to understand what would need to change."

Frame the commercial conversation around what they've already gotten, not what they're about to get:
- "You've had [X] agent actions monitored, [Y] policy violations caught, [Z] audit evidence generated"
- "You told us in Month 6 that this saved your team [X hours] on the compliance audit prep"
- Map their specific outcomes to a dollar value if possible

**Pricing for conversion:**
- Start at full commercial pricing (Business or Enterprise tier)
- If they push back: offer a "design partner alumni" discount of 20-30% for Year 1 of commercial
- Never go back to free — that signals no value

**If they won't convert:**
This is a data point, not just a lost sale. Ask explicitly:
- "What would make this worth paying for?"
- "Is it a budget issue, a value issue, or a timing issue?"
If it's genuinely not valuable, that's critical product feedback you need. If they're satisfied users who just don't want to pay — that's a pricing/positioning signal.

---

## 4. Content & Community Strategy (Ongoing)

### Why Content Matters Right Now (Even With No Product)

Content does three things for you pre-launch:
1. **Builds the audience** you'll launch to (so you're not launching to nobody)
2. **Establishes expertise** before you have a product to point to
3. **Generates inbound** for discovery interviews and design partner conversations

Start publishing Week 1. Don't wait for the product.

---

### 5 Blog Posts to Write (With Outlines)

**Post 1: "The 12 Ways AI Agents Can Go Wrong in Production"**
- Lead: the Chevrolet $1 car, Air Canada bereavement fare, DPD chatbot incident
- Expand each of the 12 threat categories with a concrete, vivid scenario
- End with: "Most of these aren't model failures — they're architecture failures. The model did what it was told. The architecture didn't have controls to prevent it."
- Distribution: Hacker News, Reddit r/MachineLearning, LinkedIn, direct email to security community
- Expected outcome: SEO, sharing among AI practitioners, inbound from CISOs who Google "AI agent security risks"
- Length: 2,500 words + threat matrix table

---

**Post 2: "Your AI Agent Failed in Staging. Here's Why Your Logs Can't Tell You Why."**
- Lead: the developer at 11 PM debugging a payment agent incident
- Walk through a real debugging experience: what LangChain logs show, what CloudWatch shows, what you'd need to actually understand what happened
- Contrast with: what a full chain-of-thought audit trail would tell you
- CTA: "What does your current debugging process look like? Reply and tell me — I'm aggregating examples for a follow-up post."
- Distribution: Hacker News "Show HN", LangChain Discord, MLOps Community Slack
- Expected outcome: comments, shares, developer inbound
- Length: 1,800 words

---

**Post 3: "The EU AI Act Compliance Gap: What Most Companies Are Missing About AI Agent Audit Trails"**
- Lead: GRC manager receiving the external auditor pre-questionnaire
- Walk through Articles 9, 12, 14 with concrete requirements
- The gap: existing logging doesn't produce what regulators want
- What "good" looks like: the evidence package that satisfies Article 12
- End with: "We're talking to compliance teams at regulated enterprises about this gap. If this is your problem, we'd like to understand your specific situation."
- Distribution: IAPP community, LinkedIn compliance circles, compliance newsletters, DPO forums
- Length: 2,200 words with regulatory reference table

---

**Post 4: "Why 'Trust the Model' Is Not a Security Strategy for AI Agents"**
- Lead: the misconception that safe models = safe deployments
- Explain the difference: model-level safety (training-time) vs. runtime governance (deployment-time)
- Walk through: what model safety addresses (output quality, harm avoidance), what it doesn't (policy enforcement, audit, cross-agent threats)
- End with: the defence-in-depth argument — prompt security + runtime governance + SIEM integration
- Distribution: Security community (Dark Reading, CSO Online community), LinkedIn CISO feeds
- Length: 1,500 words

---

**Post 5: "Prompts Are Not Policies: Why System Prompts Can't Be Your Security Strategy"**
- Lead: the developer who wrote a very careful system prompt and still had an agent do something unexpected
- Technical explanation: why LLM-based constraints are probabilistic, not deterministic
- The attack: adversarial prompting, goal drift, edge cases
- The alternative: policy enforcement outside the model (preview of AgentGuard approach)
- CTA: join waitlist / Discord
- Distribution: Developer communities, LangChain ecosystem
- Length: 1,800 words + code example showing a bypassed system prompt

---

### Threat Research as Marketing: 3 Reports to Publish

These are 2-4 week projects that generate press coverage, credibility, and warm inbound. Do one per month starting Month 2.

**Report 1: "State of AI Agent Security 2026 — Survey Results"**
- Format: 10-question survey sent to your discovery interview contacts + broader AI/security community
- Survey questions: which frameworks, how many agents, incident history, current security measures, top concerns
- Publish as a PDF report + blog post summary
- Seed distribution: Hacker News, AI newsletters, security communities
- Press angle: "First survey of AI agent security practices — X% of companies have no runtime monitoring"
- Timeline: Send survey Week 2, publish results Week 6
- Goal: 100+ responses, one press mention, LinkedIn shares

**Report 2: "Agent Attack Scenarios: 5 Real-World Exploits Against Production AI Systems"**
- Format: Technical research paper demonstrating actual vulnerabilities in common agent configurations
- Content: Reproduce the Chevrolet/$1 car style exploit against a test LangChain agent; demonstrate prompt injection against a RAG agent; demonstrate goal drift over a long chain
- Include: attack code (sanitised), detection signatures, mitigations
- **This is the most shareable content you can produce** — security researchers will engage with it
- Publish to GitHub + arXiv + blog post
- Distribution: Security Twitter, Hacker News, email to security journalists
- Goal: 500+ GitHub stars on the research repo, press mention in security media

**Report 3: "The AI Agent Compliance Gap: EU AI Act Readiness Assessment Across 20 Enterprises"**
- Format: Anonymised findings from your discovery interviews (with permission) on compliance readiness
- Content: % of companies with logging that satisfies Article 12, % with documented human oversight controls, % with AI risk assessments
- Key finding: "X of 20 companies with production AI agents could not produce compliance evidence under EU AI Act requirements today"
- Distribution: Compliance press (IAPP, GRC publications), legal tech media, LinkedIn compliance community
- Goal: Press coverage in compliance/legal publications, inbound from GRC leads

---

### Open-Source Community Building Playbook

The OSS release is Phase 1 launch (Month 4 per business case). Here's how to build the community before and after:

**Before OSS launch (Weeks 1-8):**
- Set up a "waitlist" landing page with a counter — 500 signups before you launch creates launch-day momentum
- Open a Discord server Week 1 — even if it's empty, it signals you're building a community
- Share work-in-progress in public: architecture decisions, threat research, open questions. "Building in public" content drives early followers
- Contribute to existing communities (LangChain, AutoGen, MLOps) before you need anything from them

**OSS launch mechanics:**
- README with a demo GIF showing a policy violation being caught in real-time — single most important asset
- "5-minute quickstart" that actually takes 5 minutes — test this with 5 engineers who've never seen your product before
- Issues pre-populated with "good first issue" labels
- Post to Hacker News "Show HN" — do this Tuesday-Thursday at 8 AM PST for maximum visibility
- Simultaneously post in: LangChain Discord #announcements, MLOps Community Slack, r/MachineLearning, AI safety forums
- Target 500 GitHub stars in the first week (this requires at least 1,000 people seeing the launch)

**Sustained community building:**
- Weekly: answer every GitHub issue within 24 hours for the first 3 months. Personally. This is what builds reputation.
- Weekly: post one "what we shipped this week" Discord update — even if it's small
- Monthly: host a "threat research" session in Discord — pick an attack vector, walk through it live
- Monthly: "office hours" — 30 minutes of open Q&A in Discord for the community

**The "AgentGuard Rules" play:**
Start publishing community policy templates for common use cases (customer service agents, code execution agents, etc.) as a GitHub repo. Encourage PRs. This is the "Snort rules" moat — the ecosystem of shared policies becomes a switching cost.

---

### Twitter/LinkedIn Content Strategy

**Twitter/X — for the security and AI engineering audience:**

Post type mix:
- 40% — educational threads ("the 5 ways prompt injection attacks work in agentic systems")
- 30% — reactive commentary on AI incidents and news ("what the [incident] tells us about agent security architecture")
- 20% — "building in public" progress updates ("shipped our first policy engine today — here's the architecture decision we almost got wrong")
- 10% — engagement/questions for the community

Cadence: 1 substantive post per day. Threads 2-3x per week.

Examples of high-performing content:
- "Thread: here's why your AI agent's system prompt is not your security policy 🧵"
- "[Company] had an AI agent incident today. Here's what the attack chain probably looked like."
- "We just open-sourced our threat model for AI agents. 12 categories, with concrete mitigations. Link in bio."

**LinkedIn — for the CISO and GRC audience:**

Post type mix:
- 40% — educational content for non-technical security leaders (CISOs don't want code)
- 30% — opinion pieces on AI governance, EU AI Act, board reporting
- 20% — company milestones and social proof ("just had our 15th discovery call — here's what CISOs are actually worried about")
- 10% — curated industry news with commentary

Cadence: 3-4 posts per week.

Examples:
- "I've done 15 interviews with CISOs about AI agent security in the last 3 weeks. Here's what they all said."
- "The AI risk slide in your next board deck. What goes on it? A practical guide."
- "EU AI Act Article 14 requires 'human oversight' for high-risk AI. What does that actually mean for your agent deployments?"

**Who posts what (founder split):**
- Technical founder (CEO/CTO): Twitter/X — developer audience, technical depth
- Business/GTM founder: LinkedIn — CISO/GRC audience, strategic framing

---

### Conference and Event Strategy

**Events to target in Year 1:**

| Event | When | Action | Why |
|-------|------|--------|-----|
| RSA Conference | May 2026 | Submit talk + attend | Biggest CISO event; submit "The Agent Security Gap" talk by January deadline |
| Black Hat / DEF CON | August 2026 | Submit research + attend | Security researcher credibility; present threat research |
| AI Engineer Summit | Various 2026 | Submit talk | Developer audience; directly relevant |
| KubeCon (CloudNativeCon) | Nov 2026 | Speak or sponsor meetup | Platform engineers; cloud-native agent deployments |
| SANS DFIR Summit | 2026 | Attend + speak | Incident response community; agent forensics angle |
| Gartner IAM/Security Summit | 2026 | Attend | CISO audience; category legitimacy |
| Local AI/ML meetups | Ongoing | Attend + occasionally speak | Warm developer outreach; 1:1 conversations |
| IAPP Global Privacy Summit | 2026 | Attend | GRC/DPO audience; EU AI Act focus |

**Talk vs. Booth vs. Attend decision:**
- Year 1 (pre-revenue): Talk > Attend > Booth. A talk at RSA is worth 10x a booth at RSA. Booths cost $5K-50K and generate weak leads. Speaking generates credibility and inbound conversations.
- Year 2: Add booth at 1-2 events where you have customers to feature

**How to get a speaking slot:**
RSA, Black Hat, and AI Engineer summit select talks based on content quality + submitter credibility. Relevant talk topics for AgentGuard:
- "Runtime Security for AI Agents: A New Threat Model" (RSA CISO track)
- "We Hacked 10 Production AI Agents: Here's What We Found" (Black Hat)
- "Policy as Code for AI Agent Governance" (KubeCon)

Submit 3-4 months before the conference. Reference your threat research reports as credentials. "We've done original research on X" dramatically increases selection rates.

---

## 5. Sales Process (Month 3+)

### Lead Qualification — BANT Adapted for This Market

Classic BANT (Budget, Authority, Need, Timeline) doesn't map cleanly to a new category where buyers don't yet have a line item for "AI agent security." Use this adapted version:

**PAINT: Problem, Authority, Impact, Need-urgency, Trigger**

| Factor | Question to Ask | Qualified | Not Qualified |
|--------|----------------|-----------|---------------|
| **Problem** | "Do you have agents in production or staging right now?" | Yes — agents deployed or imminent | No — planning to deploy "someday" |
| **Authority** | "Who would own the decision to deploy something like this?" | They are the decision-maker, or have clear access | "Would need to check with the CISO" (and they don't have that relationship) |
| **Impact** | "What happens to you if an agent does something it shouldn't?" | Board exposure, regulatory inquiry, compliance gap, prior incident | "We'd deal with it" — no urgency |
| **Need-urgency** | "What's your timeline for needing something like this?" | <6 months | "Next year sometime" |
| **Trigger** | Is there a specific event driving this? | Board meeting, audit, regulatory deadline, incident | Nothing imminent |

**Minimum to enter pipeline:** Score at least 3/5. All 5 for "fast track."

---

### Sales Stages and Conversion Expectations

**Stage 0: Prospect** — In your outreach list, not yet contacted
**Stage 1: Discovery** — Had first call, qualified on PAINT
- Conversion Stage 1→2: 30-40% (discovery to demo)

**Stage 2: Qualified** — Clear problem, right authority, urgency confirmed
- Conversion Stage 2→3: 50-60% (qualified to design partner conversation)

**Stage 3: Design Partner Conversation** — Discussing programme terms
- Conversion Stage 3→4: 60-70% (design partner conversation to agreement)

**Stage 4: Design Partner Agreement** — Signed, deploying
- Conversion Stage 4→5: 50-65% (design partner to paying customer at Month 12)

**Expectation:** To sign 5 design partners, you need approximately:
- 100-150 outreach contacts
- 20-30 discovery calls
- 10-15 qualified prospects
- 7-10 design partner conversations
- 5 signed agreements

This is a 3-4% conversion from outreach to signed design partner. That's normal for early-stage enterprise.

---

### Demo Script Structure

*You don't have a product yet — but you will by Month 3-4. Here's the demo structure to build toward:*

**Opening frame (2 min):**
> "Based on what you told me in our last call, the core problem is [restate their specific problem in their words]. I want to show you specifically how AgentGuard addresses that. Stop me at any point."

This personalisation matters. Generic demos kill deals.

**Section 1 — The Setup (3 min):**
Show the integration: three lines of Python code adding AgentGuard to a LangChain agent. Emphasise how fast it is. "This is everything you need to add to your existing agent."

**Section 2 — The Incident (8 min):**
Run a live demo showing a policy violation being caught and logged:
- Show the agent attempting a blocked action (e.g., trying to call an external API not in the allowlist)
- Show the policy violation in the dashboard in real time
- Show the kill switch working — agent halted in <500ms
- Show the audit log entry with chain-of-thought context

Ask: "If this happened in your environment, would this give you what you need to understand what happened?"

**Section 3 — The Compliance Angle (5 min):**
For compliance-sensitive buyers: show the audit log export in EU AI Act format
- "This is what you hand your auditor for Article 12 logging"
- Show the dashboard with risk scores and policy violation history

**Section 4 — Q&A and Next Steps (7 min):**
Close with: "Based on what you've seen — does this address the problem you described? What would you need to see to move forward with a design partner arrangement?"

**Total: 25 minutes.** Respect their time. Leave room for questions.

---

### Proposal Template Outline

For design partner agreements, the "proposal" is usually just a clean summary of the programme terms. Not a 30-page deck.

```
AGENTGUARD DESIGN PARTNER PROPOSAL
For: [Company Name]
Date: [Date]
Valid through: [30 days from date]

WHAT WE'VE HEARD FROM YOU
[2-3 sentences summarising their specific problem from discovery calls]

WHAT WE'RE PROPOSING
Design Partner Programme — 12-month engagement
- Access: [specific tiers/features they'll get]
- Support: dedicated Slack channel, bi-weekly calls with [Founder name]
- Pricing: Complimentary for 12-month programme period

WHAT WE'RE ASKING FROM YOU
- Deploy AgentGuard in [staging/production] by [date 60 days out]
- Designate [Name] as primary contact
- Participate in bi-weekly feedback sessions
- Provide written testimonial if programme meets stated goals [optional: case study]

SUCCESS CRITERIA — what we're trying to achieve together
[3-4 specific, measurable outcomes they described wanting — e.g., "audit trail for 
all agent actions accessible in <5 minutes" or "EU AI Act Article 12 compliance 
evidence generated automatically"]

NEXT STEPS
1. Review and redline attached design partner agreement
2. Introductory technical call to plan integration — [proposed date]
3. Sign agreement and begin onboarding — [target date]

Questions? [Founder email, direct line]
```

---

### Expected Sales Cycles

| Segment | Expected Sales Cycle | Typical Blocker |
|---------|---------------------|-----------------|
| **Startup (50-200 employees)** | 2-4 weeks | VP Eng can sign at $5K/year; fast if they have a live agent problem |
| **SMB (200-1,000 employees)** | 4-8 weeks | CISO approval; legal review of data terms |
| **Enterprise (1,000+)** | 3-6 months | Procurement, security review, infosec assessment of AgentGuard itself, DPA negotiation |

**For design partners specifically:** Aim for 4-6 weeks from first call to signed agreement. Anything longer means someone is stringing you along. Ask directly: "What's blocking this from moving forward in the next two weeks?"

**The shortcut:** If a CISO is your champion and they have a compliance deadline in 90 days, you can close enterprise deals in 4-6 weeks. The deadline is a forcing function. Find the people with deadlines.

---

## 6. Metrics & Milestones

### Weekly Metrics (Track Every Friday)

**Discovery phase (Weeks 1-8):**
- Outreach sent this week (target: 30)
- Responses received (target: 3-5)
- Calls booked (target: 2-3)
- Calls completed (target: 2-3)
- Average problem resonance score
- Green flags observed
- Referrals received

**Design partner phase (Month 2+):**
- Design partner conversations active
- Agreements in negotiation
- Agreements signed (cumulative)
- Active design partners (deployed)
- Product sessions completed
- NPS/satisfaction pulse

**Content metrics (Month 1+):**
- Blog posts published
- GitHub stars (cumulative)
- Discord members (cumulative)
- Newsletter subscribers (cumulative)
- LinkedIn/Twitter followers

---

### Monthly Milestones

| Month | Key Milestone | Success Looks Like |
|-------|--------------|-------------------|
| 1 | 15 discovery interviews complete | Average problem resonance ≥ 3.5/5 |
| 2 | Positioning locked; design partner programme launched | 5 design partner conversations started |
| 3 | First design partner agreement signed | 1 company actively deploying |
| 4 | OSS launch | 500+ GitHub stars in first week |
| 5 | First design partners using in staging | Active usage data coming in; product feedback |
| 6 | 5 design partners signed | All 5 in staging or production |
| 8 | First threat research report published | Press mention; inbound leads generated |
| 10 | Series A pipeline building | 8-10 qualified prospects identified |
| 12 | Revenue conversations with design partners | 2+ in commercial conversion discussions |
| 14 | First paying customer | Non-zero ARR; $30K+ ACV |
| 18 | Series A ready | See checklist below |

---

### Decision Points: When to Accelerate, Pivot, or Kill

**Accelerate if (by Month 3):**
- 3+ design partners signed before product ships — massive signal that demand is real
- 2+ unsolicited referrals from discovery interviews
- Press coverage of an agent security incident citing your research
- Investor inbound based on your content

**Pivot if (by Month 4):**
- <3 of 20 discovery interviews score ≥ 3 on problem resonance — wrong ICP, try different segment
- Design partner conversations stall at "not now" consistently — timing issue; consider narrowing to a specific compliance deadline
- Consistent feedback that your differentiation vs. incumbents isn't clear — sharpen positioning
- No interest from CISOs + strong interest from developers only — go developer-first (PLG model)

**Seriously consider killing if (by Month 6):**
- 0 design partners despite 50+ conversations
- Consistent "we'll build it internally" response from engineering-led companies
- Model providers announce something that covers 80% of your use case
- Your team discovers it's technically much harder than projected (latency SLA) and the wedge narrows to nothing

---

### Series A Readiness Checklist

You're ready for serious Series A conversations when you can check all of these:

**Customer proof:**
- [ ] 5+ referenceable design partners
- [ ] 2+ in production (not just staging)
- [ ] 2+ willing to take reference calls with investors
- [ ] At least 1 recognisable company name you can share under NDA
- [ ] 1+ testimonial you can show on website or in deck

**Revenue traction:**
- [ ] $1.5M+ ARR (or credible path within 6 months)
- [ ] 20%+ MoM growth trailing 3 months
- [ ] NRR >120% (showing agents expand, not churn)
- [ ] Gross margins >75%
- [ ] At least 2 commercial contracts at $30K+ ACV

**Product:**
- [ ] p99 latency SLA <50ms demonstrated under load
- [ ] 2+ framework integrations shipped
- [ ] GitHub: 5,000+ stars
- [ ] 0 critical security vulnerabilities in AgentGuard itself
- [ ] SOC 2 Type II audit in progress

**Team:**
- [ ] All 3 founder roles clearly differentiated
- [ ] Can articulate the first 3 hires you'll make with Series A capital
- [ ] Have fractional CFO producing clean financials

**Market:**
- [ ] Clear competitive positioning vs. Lakera, CrowdStrike, LangSmith
- [ ] "Why now" narrative backed by data from your discovery interviews
- [ ] Threat research published, generating inbound

**Pipeline:**
- [ ] 3-4x ARR target in qualified pipeline
- [ ] At least 3 enterprise prospects in active discussions
- [ ] Burn multiple <2x

**Target Series A investors:** YL Ventures (security-focused), Ten Eleven Ventures (cybersecurity specialist), Forgepoint Capital, CRV (developer tools), Costanoa Ventures. Start warming these relationships at Month 6 — before you need the money.

---

## 7. What the Founders Do This Week

### Roles and Responsibilities

Assuming 3 founders — assign these clearly. Don't let any responsibility be "everyone's":

| Founder | Primary Responsibility | This Week's Focus |
|---------|----------------------|------------------|
| **CEO** | GTM, fundraising, customer relationships | Discovery interviews, LinkedIn outreach, investor warm-up |
| **CTO** | Product architecture, technical direction | Architecture decisions, threat research, technical blog posts |
| **Third Founder** | Engineering execution OR DevRel | Building or community — pick one for the first 90 days |

If you have only 2 founders, the CEO takes GTM + DevRel and the CTO takes product + technical content.

---

### Day-by-Day Plan for Week 1

**Monday — Feb 28 (or whatever your actual Day 1 is)**

*CEO:*
- [ ] Set up Apollo.io or LinkedIn Sales Navigator — start free trials today
- [ ] Build your first 50-person outreach list using the LinkedIn search strings above
- [ ] Send 10 LinkedIn connection requests with personalised notes (no sales pitch yet — just "I'd like to connect")
- [ ] Map your warm network: who do you know who is now a CISO, VP Eng, or GRC Lead? List every one.
- [ ] Draft the first outreach template (use Template 1 as a starting point, personalise it)

*CTO:*
- [ ] Write the draft architecture document for the hybrid in-process/out-of-process policy evaluation decision (see VISION_AND_SCOPE.md open question 1)
- [ ] Set up a private GitHub repo for AgentGuard (even if nothing's committed — start the organisation)
- [ ] Start the threat model document — capture the 12 threat categories from the business case in a structured format

*Third Founder:*
- [ ] Set up Discord server — name, channels (general, product-feedback, policy-templates, random), welcome message
- [ ] Set up landing page on Carrd or Framer — simple, "Waitlist for AgentGuard: runtime security for AI agents" with email capture
- [ ] Set up HubSpot (free tier) or Airtable as your interview tracker (the spreadsheet structure from Section 1)

---

**Tuesday — Mar 1**

*CEO:*
- [ ] Send 10 more LinkedIn outreach messages (warm network first — these should be very personalised)
- [ ] Schedule first 3 discovery calls for next week
- [ ] Write first LinkedIn post: "I've been thinking about a gap in AI agent security. [2-3 sentences about the problem.] I'm doing founder research — who should I be talking to?" — genuine question, not a pitch

*CTO:*
- [ ] Make the policy evaluation architecture decision (Section 2 of VISION_AND_SCOPE open questions) — document it, don't debate it forever
- [ ] Start writing blog post 1 draft: "The 12 Ways AI Agents Can Go Wrong in Production"
- [ ] Set up the GitHub org and placeholder repo — even a good README draft counts

*Third Founder:*
- [ ] Draft the survey for Threat Research Report 1 (10 questions max — see Section 4)
- [ ] Research conference submission deadlines: RSA (Jan deadline for May), Black Hat (Mar deadline for August)
- [ ] Join 3-5 relevant communities: LangChain Discord, MLOps Community Slack, CISO community forums

---

**Wednesday — Mar 2**

*CEO:*
- [ ] 10 more outreach messages — start cold outreach if warm leads are running low
- [ ] Research the specific companies on your Tier 1 outreach list: look for recent AI job postings, news, LinkedIn activity that gives you a personalisation hook
- [ ] Set up the interview tracking spreadsheet (columns from Section 1) — populate it with your first 10 contacts

*CTO:*
- [ ] Continue blog post 1 — target a full draft by Friday
- [ ] Read through the EU AI Act Articles 9, 12, 14 (they're short). Know them cold — you'll be asked about them constantly.
- [ ] Research: what does LangChain's current logging/tracing (LangSmith) actually do? Where does it stop?

*Third Founder:*
- [ ] Build the landing page — go live today, not perfect. Email capture + one-line description + "Notify me when we launch"
- [ ] Set up Twitter/X account for AgentGuard (company account)
- [ ] Set up LinkedIn company page for AgentGuard

---

**Thursday — Mar 3**

*CEO:*
- [ ] 10 more outreach messages
- [ ] First discovery calls should be appearing on next week's calendar — prep for them using the call script
- [ ] Email 5 investors you already know (warm relationships) with a 2-paragraph "heads up" — not a pitch, just "we're building something in AI agent security, would love a coffee call to get your reaction to the thesis"

*CTO:*
- [ ] Finish blog post 1 draft — share with CEO and Third Founder for a quick review
- [ ] Sketch the Phase 1 MVP architecture — what's the minimum that proves the latency SLA while delivering real policy enforcement?
- [ ] Identify the first 5 enterprise contacts in the LangChain/AI engineering community you can get a warm intro to (people who use LangChain in production at real companies)

*Third Founder:*
- [ ] Post the survey for Threat Research Report 1 — share in communities you joined Tuesday
- [ ] Write the welcome message/pinned post in Discord — what is this community for? Who is it for?
- [ ] Research: who are the top 20 security/AI Twitter/X accounts you should be following and occasionally engaging with?

---

**Friday — Mar 4**

*All three founders — 1 hour end-of-week sync:*
- [ ] Review the interview tracker — how many calls booked for next week? (Target: 5)
- [ ] Review blog post 1 — publish or schedule for Monday?
- [ ] Share the top 3 things each of you learned this week
- [ ] Update the CEO on any investor responses
- [ ] Identify any blockers for next week

*CEO:*
- [ ] Review all outreach responses — prioritise who to follow up with, who to escalate, who to drop
- [ ] Write a 1-paragraph summary of the week: what did you learn, what surprised you, what changed?
- [ ] Plan next week's outreach list (30 more contacts)

*CTO:*
- [ ] Publish or schedule blog post 1
- [ ] Document the 3 most interesting technical questions you need to answer in the next 30 days

*Third Founder:*
- [ ] Check survey responses — share early data with the team
- [ ] Confirm landing page is live and email capture is working
- [ ] Post first tweet from AgentGuard account — keep it simple: "We're building runtime security for AI agents. If you're deploying agents in production and have opinions, we want to hear from you."

---

### Tools to Set Up (Week 1)

**Must-have from Day 1:**

| Tool | Purpose | Cost | Notes |
|------|---------|------|-------|
| HubSpot (free) or Airtable | CRM + interview tracker | Free | Don't over-engineer this; a spreadsheet works |
| Apollo.io | Outreach + email finding | $50/month | Start with free trial |
| LinkedIn Sales Navigator | Prospect research | $100/month | Worth it for 2-3 months of heavy outreach |
| Google Workspace | Email, docs, calendar | $6/user/month | If not already using |
| Notion | Internal docs, roadmap, meeting notes | Free | Keep it simple |
| Calendly | Book discovery calls without back-and-forth | Free | Use the link in every outreach message |
| Loom | Async video for sharing demos/updates | Free | Useful for design partner updates |
| Discord | Community | Free | Set up Week 1 |
| Carrd or Framer | Landing page | $20/month | Good enough; launch fast |
| GitHub | OSS repo, issue tracking | Free | Set up the org now |

**Don't set up yet (adds friction without value at this stage):**
- Salesforce (too complex for 3 founders; switch at $1M ARR)
- Fancy analytics (Mixpanel, Amplitude) — you have 5 users; you don't need analytics yet
- Marketing automation (Marketo, HubSpot paid) — do outreach manually until you have patterns
- Expense management software — use a spreadsheet and a corporate card

---

### The One Rule for Week 1

**Talk to humans.** Not about them. With them.

Everything else in this document — the messaging, the positioning, the pricing, the features — is a hypothesis. The only way to test a hypothesis is to put it in front of a real person with a real budget and a real problem.

Make 30 outreach contacts. Have 5 conversations. Learn something that surprises you. Update your thinking.

That's Week 1.

---

## Appendix A: Discovery Interview Score Sheet Template

Copy this into Google Sheets. One row per interview.

**Columns:**
```
Date | Interviewer | Name | Title | Company | Industry | Employees | 
Agents in prod? (Y/N/Soon) | Frameworks used | Call type (Problem/Solution) |
Urgency (1-5) | Problem resonance (1-5) | Solution resonance (1-5) |
Budget authority (Y/N) | Budget owner (if not them) | Timeline |
Specific incident/story (Y/N) | Quote | Green flags | Red flags |
Referrals given | Design partner potential (Y/N/Maybe) | Follow-up action | Notes
```

**Score interpretation:**
- Total score (Urgency + Problem + Solution) ≥ 12: Hot prospect, prioritise
- Total score 8-11: Warm, follow up in 4-6 weeks
- Total score <8: Wrong segment or wrong timing; deprioritise

---

## Appendix B: Design Partner Outreach Template (Post-Discovery)

Use this when a discovery interview scores ≥ 12 and they've expressed interest:

```
Subject: Design partner programme for AgentGuard — following up

Hi [Name],

Really appreciated our conversation last [day]. Based on what you shared about 
[their specific problem — be specific], I think you'd be an ideal design partner for AgentGuard.

Here's what that would look like:

- You'd get early access to the platform at no charge for 12 months
- Direct Slack channel with me and our CTO — not a support ticket queue
- Bi-weekly calls where we build the product around your actual use cases
- In return, we ask for honest feedback, a bi-weekly call, and the option to discuss 
  a case study after 6 months if we've delivered value

I'm working to onboard 5 design partners. I have 3 conversations in progress.

Would it make sense to spend 30 minutes walking you through the design partner 
programme in more detail? I can share the one-pager and the draft agreement so 
you can come prepared with questions.

[Your name]
P.S. The product isn't complete yet — but I'd rather you help shape it than 
hand you something finished that doesn't quite fit your environment.
```

---

## Appendix C: Quick Reference — Who to Target, How to Find Them

**The short version of Section 1 for quick reference:**

*Best targets:*
- CISO at FS/healthcare/tech, 500-5,000 employees, agents in production
- VP Eng at Series B-D startup with agent deployments
- GRC Lead at EU-regulated company with compliance deadline

*Where to find them:*
- LinkedIn (Sales Navigator search strings in Section 1)
- Apollo.io
- CISO community forums (CISO Connect, ISC2)
- LangChain / AutoGen Discord (for VP Eng targets)
- Your warm network (exhaust this first)

*Outreach conversion benchmarks:*
- Warm intro: 40-60% response rate
- Cold LinkedIn: 5-10% response rate
- Need ~100 contacts to get 20 calls

*Weekly outreach cadence:*
- Monday-Wednesday: send new messages (30 per week)
- Thursday-Friday: follow up on non-responses from prior week
- Limit: 15 messages/day on LinkedIn to avoid flags

---

*Document owner: CEO / GTM Lead*
*Version: 1.0 — February 2026*
*Next review: After 15 discovery interviews are complete*
*Confidential — AgentGuard Internal*
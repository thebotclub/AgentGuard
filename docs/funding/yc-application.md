# AgentGuard — Y Combinator Application (Spring 2026)

> **Status:** Late submission. Deadline passed Feb 9, 2026. Still reviewing.

---

## 1. Company Name

**AgentGuard**

---

## 2. One-Line Description

`Runtime governance and policy enforcement for autonomous AI agents.`

*(59 characters)*

---

## 3. What Does Your Company Do?

Companies are deploying AI agents that take real actions — writing code, sending emails, executing API calls, moving money. There is currently no standard way to enforce what those agents are and aren't allowed to do at runtime.

AgentGuard is a policy engine that sits between an AI agent and the actions it wants to take. Developers define rules in plain declarative syntax; AgentGuard evaluates every action in under a millisecond and blocks violations before they happen. Every decision is logged to a tamper-proof, SHA-256 hash-chained audit trail.

---

## 4. How Far Along Are You?

**Live in production. Not a demo.**

- **agentguard.tech** — public landing page
- **app.agentguard.tech** — developer dashboard with real signup, API key provisioning, usage analytics
- **api.agentguard.tech** — policy evaluation API, serving live requests
- **demo.agentguard.tech** — interactive investor demo with real backend

**Technical state:**
- Policy engine: 7 rule types, sub-millisecond evaluation (P99 < 1ms)
- Audit trail: SHA-256 hash chain, cryptographically tamper-evident
- Per-tenant kill switch: instant agent suspension without code changes
- TypeScript SDK published, framework-agnostic
- 63 unit tests passing, full CI/CD pipeline via GitHub Actions
- Deployed on Azure Container Apps (auto-scaling, zero-downtime)
- SQLite persistence, real API key flow, live usage tracking

We built the core product in 6 weeks. The infrastructure is production-grade, not a prototype.

---

## 5. Why Did You Pick This Idea?

Every company that connected to the internet eventually needed a firewall. Not because they chose to — because the internet forced them to.

AI agents are doing the same thing to enterprise infrastructure that the internet did in the 1990s. The attack surface isn't just prompts anymore — it's actions. An agent that can browse the web, call APIs, write files, and execute code is not a chatbot. It's software with legs.

The insight that drove us: **governance is not optional for autonomous systems**. The moment an agent takes an action that can't be undone — sends an email, deletes a record, executes a trade — you need a policy layer. The question is whether companies build it themselves (fragile, inconsistent, expensive) or buy it (fast, auditable, compliant). We're building the layer they'll buy.

We started because we couldn't find it. We looked for runtime agent governance tooling before building AgentGuard and found nothing. Prompt security, yes. LLM guardrails, yes. Runtime action-level policy enforcement for autonomous agents — nothing.

---

## 6. What's New About What You're Doing?

Existing AI security products protect the LLM's inputs and outputs — they scan prompts for jailbreaks, filter toxic responses, redact PII. That's necessary but insufficient.

AgentGuard protects **actions**, not words. We intercept what the agent is about to *do*, not what it's about to *say*.

**What's technically novel:**

1. **Declarative policy engine.** Rules are written in a human-readable policy syntax, not code. A CISO can read an AgentGuard policy file. A compliance auditor can read it. This is intentional — governance documents should be legible to non-engineers.

2. **Sub-millisecond evaluation.** Policy evaluation adds < 1ms P99 latency. Agents aren't slowed down in any meaningful way. This matters because latency overhead is the #1 objection from developers evaluating security tools.

3. **Tamper-proof audit trail.** Every decision — allow or block — is written to an append-only log where each entry is hashed to the previous. You can prove, cryptographically, that the log hasn't been modified. This is what compliance teams actually need.

4. **Framework-agnostic.** Works with LangChain, AutoGen, CrewAI, or any custom agent. One SDK, any framework.

5. **Kill switch.** Per-tenant, instant agent suspension. No redeploy required. When something goes wrong, you stop it in one API call.

---

## 7. What Do You Understand That Others Don't?

**The buyer and the user are different people — and most AI security companies are building for only one.**

Prompt security tools are built for developers: easy to integrate, technical docs, GitHub-first. They get developer adoption but stall at procurement because the CISO never asked for them and doesn't understand the value.

Enterprise security products are built for CISOs: compliance checklists, audit reports, risk frameworks. They get budget approval but stall at deployment because developers hate them.

Agent governance will be different from both. Here's why:

- The **CISO** will demand it. The EU AI Act, SOC 2, and emerging agent-specific regulations are creating compliance requirements that mandate audit trails and access controls for autonomous systems. CISOs will put "AI agent governance" on the checklist — and vendors will need to check the box.

- The **developer** will implement it. Integration happens at the SDK level. If the SDK is bad, developers work around it or build their own. If the SDK is excellent, adoption spreads virally through engineering teams.

You need both. A product that CISOs will mandate and developers will love. That's what we're building — and we know from experience in enterprise software that almost nobody gets both right. We're designing AgentGuard from day one with this dual-constituency in mind: declarative policies that CISOs can audit, a TypeScript SDK that developers actually enjoy using.

The other thing we understand that most don't: **the governance layer will be more defensible than the agent layer**. Agents are commoditizing fast. The policy engine that governs all of them — across providers, frameworks, and use cases — is where the durable value accumulates.

---

## 8. How Will You Make Money?

**Usage-based SaaS with enterprise tier.**

| Tier | Price | Limit |
|------|-------|-------|
| Free | $0 | 10,000 policy evaluations/month |
| Pro | $299/month | 1M evaluations/month |
| Enterprise | Custom | Unlimited + SLA + SSO + compliance reports |

Revenue logic:
- Free tier seeds developer adoption and provides real product feedback
- Pro tier converts teams that hit the usage cap (natural upgrade trigger)
- Enterprise tier is the actual business: six-figure ACV, annual contracts, procurement-driven

Enterprise buyers are motivated by two things: (1) compliance requirements they can't ignore, and (2) audit evidence their legal team needs. We price for both — enterprise pricing includes automated compliance reports and SOC 2 evidence packages.

Long-term, we expect >80% of revenue to come from enterprise contracts, with the free/pro tiers functioning as a funnel.

---

## 9. How Will You Get Users?

**Three overlapping motions:**

**1. Developer-led adoption (bottom-up)**
The TypeScript SDK is open-source. Developers who are already building agents find AgentGuard when they search for "AI agent safety" or "agent policy enforcement." We write the docs well, make the getting-started experience < 5 minutes, and let usage spread through engineering orgs naturally.

**2. Content and community**
We're documenting the agent governance problem publicly — writing about the 7 market gaps we've identified, the technical architecture of our policy engine, the compliance implications of the EU AI Act for AI agent deployers. This builds authority and inbound. Developers share useful content.

**3. Compliance-driven enterprise sales (top-down)**
As EU AI Act enforcement ramps up in 2026-2027, enterprises will receive compliance questionnaires that ask about AI agent governance. We position AgentGuard as the answer to that questionnaire. Sales motion: CISO/CTO conversation → compliance checklist mapping → enterprise contract. We can reach these buyers through the compliance advisory ecosystem (the same consultants who sold SOC 2 tooling in 2018-2020).

The flywheel: developer adoption creates case studies → case studies enable enterprise sales → enterprise contracts fund deeper developer tooling.

---

## 10. Who Are Your Competitors?

**Direct competitors in AI/agent security:**

| Company | Focus | Status |
|---------|-------|--------|
| Invariant Labs | LLM trace monitoring | **Acquired by Snyk** (2025) |
| Protect AI | AI/ML model security | **Acquired by Palo Alto Networks** (2025) |
| Lakera | Prompt injection, LLM input/output | Independent, ~$20M raised |
| Prompt Security | Prompt firewall | Independent |
| CalypsoAI | LLM content filtering | Enterprise-focused |

**The critical gap:** All of these companies focus on LLM input/output safety — what goes into the model and what comes out. None of them govern **what the agent does** with the model's output.

This is the distinction that matters:
- Lakera stops a prompt injection from reaching the LLM ✓
- AgentGuard stops the agent from *acting on* a malicious instruction ✓

These are complementary, not competing. But the action layer is currently unguarded — and that's where the actual risk lives for enterprise deployments.

The acquisition signals confirm the market is real. Snyk and Palo Alto didn't pay for research projects — they bought companies with traction because they needed AI security capabilities. The next wave of acquisitions will be in the governance layer. We intend to either be that acquisition or the company that acquires.

---

## 11. What's Your Advantage?

**We're the only company building declarative runtime governance for AI agent actions. Not prompt security. Not LLM monitoring. Agent governance.**

Specific advantages:

1. **First-mover in the right layer.** Prompt security is a solved problem (multiple well-funded companies). Agent governance is not. We have time to build the reference architecture before the space gets crowded.

2. **The policy-as-code model is defensible.** Once an enterprise writes their agent policies in AgentGuard's policy syntax, they don't want to rewrite them for a competitor. Policy lock-in is gentler than database lock-in but more durable than API lock-in.

3. **Audit trail creates a moat.** Compliance teams build workflows around audit evidence. Once the AgentGuard audit trail is wired into a SOC 2 evidence package or an EU AI Act compliance report, switching costs are high.

4. **Speed.** We shipped a production-grade system in 6 weeks. Most enterprise security companies take 6 months to ship a beta. This velocity matters in a market that's moving fast.

---

## 12. How Did You Meet Your Co-Founders?

Built by a technical founder with a background in enterprise software and a clear view of where AI agent deployment is headed. The insight came from watching enterprises struggle to govern AI agents in production — building ad hoc policy checks in application code, maintaining no audit trail, having no mechanism to stop a runaway agent without a redeploy.

*(Co-founder details to be provided — adapt to actual team composition.)*

---

## 13. Who Writes Code?

The technical founder writes all production code. The policy engine, audit trail, SDK, dashboard, and infrastructure were designed and built by the founding team. We have not outsourced development.

The codebase is TypeScript (API + SDK), deployed on Azure Container Apps, with GitHub Actions CI/CD. 63 unit tests, full coverage of the policy engine's core evaluation logic.

---

## 14. Progress / Metrics

**What's live:**
- Production API serving real requests: `api.agentguard.tech`
- Developer dashboard with real user accounts: `app.agentguard.tech`
- Interactive investor demo (live backend): `demo.agentguard.tech`
- Public landing page: `agentguard.tech`

**Technical metrics:**
- Policy evaluation latency: P99 < 1ms
- Policy engine rules: 7 types implemented
- Test suite: 63 unit tests, all passing
- CI/CD: GitHub Actions → Azure Container Apps (zero-downtime deploys)
- Audit trail: SHA-256 hash chain, append-only, cryptographically verified
- SDK: TypeScript, published, framework-agnostic

**Business signals:**
- Real signup flow live (not a waitlist)
- Real API key provisioning working
- Usage analytics tracking active

We are past the "does this work" stage. We are in the "who needs this and how do we reach them" stage.

---

## 15. Biggest Risk and How We'll Address It

**Risk: Market timing. Enterprises might not be ready to buy agent governance tooling yet.**

This is a real risk. If enterprise agent deployments are 12-18 months behind where we think they are, we're selling to a market that isn't ready to buy.

**Why we don't think that's the case:**
- Major enterprises (JPMorgan, Goldman, Microsoft, Salesforce) have publicly announced large-scale AI agent deployments in 2025-2026
- The EU AI Act went into effect in 2024 with phased enforcement — enterprises with AI systems face compliance requirements *now*
- Insurance underwriters are starting to ask about AI governance as part of cyber insurance renewals
- The Snyk/Invariant and Palo Alto/Protect AI acquisitions show strategic buyers believe the market is real *today*

**If we're early, our plan:**
- The free tier keeps us in front of developers who will need this in 6-12 months
- We use the early period to become the reference architecture — write the standards, publish the research, be the name people cite when they think "agent governance"
- We pursue design partner relationships with enterprises that are already deploying agents (they exist; we can name them) to refine the product with real production requirements

The risk is not "will anyone ever need this" — it's "how long until they're ready to pay." Our seed capital buys us 18 months to find out.

---

## 16. One-Minute Founder Video Script

---

*[Record in a quiet room. One camera angle. No slides. Look directly at the camera. Speak at a normal pace — not rushed.]*

---

**[0:00 - 0:08]**
"Hi, I'm [Name], founder of AgentGuard. We build runtime governance for AI agents."

**[0:08 - 0:22]**
"Here's the problem: companies are deploying AI agents that take real actions — calling APIs, sending emails, executing code, moving data. There's no standard way to enforce what those agents are allowed to do. They're running on trust."

**[0:22 - 0:38]**
"AgentGuard is a policy engine that sits between an agent and the actions it wants to take. You write rules in plain English — 'never delete production data,' 'always require human approval before sending external emails' — and we enforce them in real time, under a millisecond, with a cryptographically tamper-proof audit log."

**[0:38 - 0:50]**
"The product is live. We have a real API, a real dashboard, a real SDK. You can sign up today at agentguard.tech. The investor demo is at demo.agentguard.tech — it's not a mockup, it's running on our production backend."

**[0:50 - 1:00]**
"We're raising a $6M seed on a $24M pre-money valuation — 20% dilution. SAFE notes with a $30M cap, 20% discount. We're based in Australia, building for a global market. I'd love to talk. AgentGuard — governance for the agent era."

---

*[End. Do not add "thank you." Do not wave. Just stop.]*

---

## Appendix: Key Links

| Resource | URL |
|----------|-----|
| Landing page | https://agentguard.tech |
| Developer dashboard | https://app.agentguard.tech |
| API endpoint | https://api.agentguard.tech |
| Investor demo | https://demo.agentguard.tech |
| GitHub (private) | https://github.com/koshaji/agentguard |

---

*Prepared for Y Combinator Spring 2026 batch review. Late application.*

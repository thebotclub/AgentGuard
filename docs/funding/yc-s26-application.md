# Y Combinator Summer 2026 (S26) Application — AgentGuard

> **Status:** DRAFT — Needs Hani's personal details before submission
> **Batch:** Summer 2026 (S26)
> **Last updated:** 2026-03-11

---

## ⚠️ FIELDS HANI MUST FILL IN PERSONALLY

These fields require your personal information and cannot be drafted for you.

### Founder Profile
- **Full legal name:** Hani Kashi
- **Email:** `[YOUR EMAIL]`
- **Phone:** `[YOUR PHONE]`
- **Age:** `[YOUR AGE]`
- **Gender:** `[YOUR GENDER]`
- **City / Country:** `[YOUR CITY]`, Australia
- **LinkedIn URL:** `[YOUR LINKEDIN]`
- **GitHub URL:** https://github.com/koshaji
- **Personal website:** `[IF ANY]`

### Education
- **University:** `[YOUR UNIVERSITY]`
- **Degree & field:** `[e.g., BSc Computer Science]`
- **Graduation year:** `[YEAR]`
- **Any other degrees/certifications:** `[IF ANY]`

### Work & Founder Background
- **Employer history (relevant roles):** `[LIST KEY ROLES — title, company, years. Focus on technical/leadership roles]`
- **Previous startups (if any):** `[NAME, WHAT IT DID, OUTCOME — even if it failed, YC loves this]`
- **Have you applied to YC before?** `[YES/NO — if yes, which batch and what company]`
- **Have you participated in any other incubator/accelerator?** `[YES/NO — details]`

### The "Successfully Hacked" Question
> *Please tell us about the time you most successfully hacked some (non-computer) system to your advantage.*

`[WRITE 2-3 SENTENCES. This is a creativity/resourcefulness test. Think: getting into events, negotiating deals, gaming a process, building something scrappy. Doesn't need to be tech-related.]`

### Personal Commitment
- **Are you working on this full-time?** `[YES/NO — and since when]`
- **Do you have any other commitments (jobs, school)?** `[DETAILS]`
- **Would you relocate to SF for the batch if required?** `[YES/NO]`

### Legal / Financial (Verify these)
- **How much money does the company have in the bank?** `[$X AUD / $X USD]`
- **Monthly burn rate:** `[$X/month — hosting, domains, services]`
- **Runway:** `[X months]`
- **Have you raised any money?** `[YES/NO — if yes, how much, from whom, on what terms]`
- **Other stockholders or investors:** `[LIST ANY]`
- **Planned equity breakdown:** `[e.g., Hani Kashi — 100%]`

### 1-Minute Video
> Record an unscripted, authentic 1-min video. Webcam is fine. No slides, no music, no editing.

**Suggested structure:**
- [0-10s] "I'm Hani, solo founder of AgentGuard."
- [10-30s] "AI agents are making real-world decisions — booking flights, writing code, moving money — but nobody checks what they're doing before they do it. AgentGuard sits between the agent and every tool call, enforcing security policies in real-time."
- [30-50s] "We're live — v0.9 on Azure, SDKs on npm and PyPI, 193 tests, 60+ API endpoints. The EU AI Act enforces in August 2026, and every company running agents will need exactly this."
- [50-60s] "I need YC to go from working product to market leader before the compliance wave hits."

### Referral
- **Were you referred by a YC alum?** `[NAME, BATCH — if yes]`
- **Referral code:** `[IF ANY]`

---

## APPLICATION ANSWERS

---

### 1. Company Name

The Bot Club Pty Ltd (trading as AgentGuard)

---

### 2. Company URL

https://agentguard.tech

---

### 3. Demo URL

https://demo.agentguard.tech

*(Also: docs at https://docs.agentguard.tech, source at https://github.com/thebotclub/AgentGuard)*

---

### 4. Describe your company in 50 characters or less

Runtime security for AI agents.

---

### 5. What is your company going to make?

AgentGuard intercepts every tool call an AI agent makes — file access, API calls, database queries, code execution — and evaluates it against configurable security policies before it executes. Sub-millisecond latency. Hash-chained audit trail for compliance. Drop-in SDKs for LangChain, CrewAI, AutoGen, OpenAI, and Vercel AI SDK.

Think of it as a firewall that sits between AI agents and the real world.

---

### 6. Category

**AI / Security / Developer Tools**

---

### 7. Where are the founders based?

Australia

---

### 8. Is this a response to a YC Request for Startups (RFS)?

Yes — AI Safety. AgentGuard directly addresses the need for runtime guardrails on autonomous AI agents, which is a core YC RFS area.

---

### 9. Why did you pick this idea to work on? Do you have domain expertise in this area?

I was building AI agents and realized nothing existed to prevent them from doing dangerous things at runtime. Prompt engineering isn't security — it's suggestions. Model alignment doesn't stop a perfectly aligned agent from executing a tool call that violates your security policy.

I built AgentGuard because I needed it. The existing options are: (1) trust the model, (2) build custom guardrails from scratch for every project, or (3) don't deploy agents. None of those scale.

`[HANI: Add 1-2 sentences about your specific technical background that makes you qualified — e.g., years in security, infrastructure, or AI development]`

---

### 10. What's new about what you're making? What substitutes do people resort to today?

**Today's substitutes are all inadequate:**

1. **Prompt engineering** — "Please don't delete production databases" is not a security policy. Models ignore instructions unpredictably.
2. **Custom middleware** — Teams build one-off guardrails per project. Fragile, inconsistent, no audit trail.
3. **Container/infra security** (Snyk, Wiz) — Secures the box the agent runs in, not what the agent *does*. An agent with valid credentials can still exfiltrate data.
4. **AI governance platforms** (Credo AI) — Focus on bias, fairness, and model cards. Don't inspect runtime behavior.

**What's new:** AgentGuard operates at the tool-call layer — the exact boundary where AI decisions become real-world actions. No one else does this. We evaluate intent before execution, enforce policies declaratively, and produce a cryptographically verifiable audit trail.

---

### 11. Who are your competitors, and who might become competitors?

**No direct competitor** inspects AI agent tool calls at runtime.

**Adjacent players:**
- **Snyk, Wiz, CrowdStrike** — Container and cloud security. They protect infrastructure, not agent behavior. Could build this but it's a different architecture and mental model.
- **Credo AI, Holistic AI** — AI governance. Focus on model bias/fairness auditing, not runtime enforcement.
- **Guardrails AI, NeMo Guardrails** — Prompt/output guardrails for LLMs. They filter text. We enforce tool-call policies. Different layer entirely.

**Emerging open-source:** Projects like ironcurtain, clawmoat, and agentmesh are appearing on GitHub — they validate the category exists, but they're early-stage libraries, not platforms.

**Moat:** First-mover with production-grade platform (60+ endpoints, SDKs on npm/PyPI), hash-chained audit trail for compliance, and sub-millisecond latency that doesn't break agent workflows.

---

### 12. What do you understand about your business that other companies in it just don't get?

The security boundary for AI agents is the tool call, not the prompt and not the container. Every other approach tries to make the *model* safer. But a perfectly safe model can still execute a catastrophic tool call if the tool-call layer is unguarded.

Companies will figure this out the hard way when their agent deletes a production database, exfiltrates customer data, or sends an unauthorized payment. We're building the solution before the disasters make headlines.

---

### 13. How will you make money? / Revenue Model

**SaaS pricing — pay per seat, usage-included tiers:**

| Tier | Price | Included |
|------|-------|----------|
| Free | $0/mo | 100K events/month, 1 project |
| Pro | $149/mo | 1M events, 5 projects, advanced policies |
| Enterprise | $499/mo | Unlimited events, SSO, custom policies, SLA |

Pricing is live on Stripe today. Revenue is pre-revenue — we're focused on getting the product right before pushing sales. Enterprise contracts will be the primary revenue driver.

**Long-term:** Usage-based pricing for high-volume customers (per-million events). Compliance reporting add-ons when EU AI Act enforcement begins August 2026.

---

### 14. How far along are you?

- **v0.9.0** shipped and live on Azure
- **193+ automated tests**, 60+ REST API endpoints
- **Published SDKs:** npm (`@agentguard/sdk`) and PyPI (`agentguard`)
- **Integrations:** LangChain, CrewAI, AutoGen, OpenAI Agents SDK, Vercel AI SDK
- **Live demo:** demo.agentguard.tech
- **Documentation site:** docs.agentguard.tech
- **Stripe billing:** configured and live (Free / Pro / Enterprise tiers)
- **Hash-chained audit trail:** cryptographically verifiable event log
- **Sub-millisecond policy evaluation latency**

This is a working, production-deployed platform — not a prototype.

---

### 15. How long have you been working on this? Full-time or part-time?

`[HANI: Fill in — e.g., "X months full-time since [DATE]" or "Started part-time in [MONTH], went full-time in [MONTH]"]`

---

### 16. Which of the following best describes your progress?

**Launched — live product with published SDKs, documentation, and demo.**

---

### 17. Do you have revenue?

Pre-revenue. Pricing and Stripe billing are live. Focused on product completeness (v1.0) and initial design partners before pushing sales.

---

### 18. How many active users or customers do you have?

`[HANI: Fill in honestly — even if it's "0 paying, X GitHub stars, Y npm downloads" — YC respects honesty. If you have any design partners or LOIs, mention them here.]`

---

### 19. How much money do you spend per month?

`[HANI: Fill in — Azure hosting, domains, services, your own living costs if bootstrapping. Be specific, e.g., "$800/mo — $400 Azure, $100 domains/services, $300 misc"]`

---

### 20. How much money does your company have in the bank?

`[HANI: Fill in]`

---

### 21. How long is your runway?

`[HANI: Fill in — e.g., "8 months at current burn"]`

---

### 22. Have you applied to YC before?

`[HANI: YES/NO — details]`

---

### 23. Have you participated in any other accelerator or incubator?

`[HANI: YES/NO — details]`

---

### 24. How will you get users?

**Phase 1 (Now → YC batch):** Developer-first distribution.
- Open-source SDK with generous free tier (100K events/mo) — zero friction to start.
- Content marketing: "How to secure your LangChain agent in 5 minutes" tutorials.
- Ship integrations for every major agent framework (5 done, more coming).
- Engage AI agent developer communities (LangChain Discord, r/LocalLLaMA, AI Twitter).

**Phase 2 (During/post-YC):** Enterprise pull from compliance.
- EU AI Act enforcement begins August 2026 — enterprises will need audit trails for agent behavior.
- Target security teams at companies already deploying AI agents (fintechs, healthtech, legal tech).
- Design partner program: 5-10 companies get white-glove onboarding in exchange for case studies.

**Phase 3 (Scale):** Platform network effects.
- Shared policy templates ("PCI-DSS for AI agents", "HIPAA agent policies") create community flywheel.
- Marketplace for custom policy rules.

---

### 25. Who desperately needs this?

1. **Engineering teams deploying AI agents in production** — they know their agents can do dangerous things but have no systematic way to prevent it. Today they either don't deploy or build fragile custom guardrails.

2. **Compliance/security teams at enterprises** — they're being asked to approve AI agent deployments but have no audit trail and no runtime controls. They're blocking deployment because they can't prove safety.

3. **Regulated industries (finance, health, legal)** — they want agents but regulators require explainability and control. AgentGuard gives them both.

---

### 26. Why now? What's changed in the world that makes this the right time?

Three forces are converging simultaneously:

1. **AI agents went from research to production in 2025.** OpenAI Agents SDK, LangChain, CrewAI, AutoGen — every major framework now supports tool-calling agents. Millions of developers are building agents that take real-world actions.

2. **EU AI Act enforcement begins August 2026.** Article 9 requires risk management for high-risk AI systems, including logging and human oversight. Every company running agents in the EU (or serving EU customers) will need exactly what we provide.

3. **The first agent security incidents are happening.** Prompt injection attacks, unintended tool executions, data exfiltration via agents — these are moving from theoretical to real. The market is about to learn why runtime agent security matters.

We're 5 months ahead of the compliance deadline with a production-ready platform.

---

### 27. What's your long-term vision?

AgentGuard becomes the standard security layer for all AI agent deployments — the way Cloudflare became the default for web traffic and Stripe became the default for payments.

Every AI agent that interacts with the real world should pass through a policy enforcement layer. We want to be that layer. Start with tool-call security → expand to agent identity, inter-agent trust, and cross-organization agent governance.

The endgame is the security infrastructure for the agent economy.

---

### 28. If you had any other ideas you considered applying with, what were they?

`[HANI: If you have other ideas, list 1-2 briefly. If not, leave blank or write "AgentGuard is the only idea — this is the problem I'm obsessed with."]`

---

### 29. AI Safety Disclosure (150 chars)

Policy engine evaluates tool calls pre-execution. No PII stored. Hash-chained audit trail. All evaluation runs locally — no data sent to third parties.

---

### 30. Have you incorporated?

Yes. **The Bot Club Pty Ltd** (ABN 99 695 980 226), registered in Australia. Registered business name: "Agent Guard."

---

### 31. Anything else you'd like us to know?

I'm a solo technical founder. I built every line of AgentGuard — the platform, the SDKs, the integrations, the docs, the demo, the billing. I ship fast and I ship complete.

The AI agent security market doesn't exist yet as a category. By August 2026, when the EU AI Act enforces, every company running agents will need runtime security and audit trails. I want AgentGuard to be the obvious answer when they go looking.

I'm not waiting for the market — I'm building the category.

`[HANI: Add anything personal that makes your story compelling — immigration story, unique background, why you're obsessed with this problem, any domain expertise in security or AI]`

---

## SUBMISSION CHECKLIST

- [ ] All `[HANI: ...]` fields filled in with real data
- [ ] Bank balance, burn rate, and runway numbers verified
- [ ] 1-minute video recorded (webcam, unscripted, quiet room)
- [ ] Video uploaded to unlisted YouTube or Loom link
- [ ] Demo site (demo.agentguard.tech) is live and working
- [ ] GitHub repo is public and presentable
- [ ] Application read aloud to catch awkward phrasing
- [ ] Asked someone outside tech to read the 50-char description — do they get it?
- [ ] Checked YC S26 deadline and submitted before it
- [ ] Referral code added (if you have a YC alum contact)

---

## TIPS FOR HANI

1. **Be brutally honest about traction.** YC funds pre-revenue companies all the time. Don't inflate numbers. "Zero revenue, working product, compliance deadline in 5 months" is a compelling story.

2. **The "successfully hacked" question matters more than you think.** It reveals how you think. Pick something creative and specific. Not a coding story — a real-world hack.

3. **Solo founder isn't a dealbreaker** but address it directly. YC has funded many solo founders (e.g., Pebble, DropBox started as effectively solo). Show you can execute alone AND that you know when/how you'll hire.

4. **The video is make-or-break.** Partners watch every video. Be natural. Talk to the camera like you're explaining to a smart friend. Passion > polish.

5. **"Why now" is your strongest card.** EU AI Act + agent adoption explosion + no incumbent = perfect timing. Lead with this in the video.

6. **Apply early.** YC does rolling reviews. Earlier = more chances for interview slots.

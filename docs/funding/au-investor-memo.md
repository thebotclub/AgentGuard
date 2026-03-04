# AgentGuard — Investor Memo
**Seed Round · $6M · $24M Pre-Money Valuation · March 2026**

*Confidential. Not for distribution.*

**Contact:** founders@agentguard.tech
**Demo:** demo.agentguard.tech · **Product:** agentguard.tech

---

---

# PAGE 1 — THE OPPORTUNITY

---

## The Problem

Enterprises are deploying autonomous AI agents that browse the web, call APIs, write code, execute transactions, and send communications — without any enforceable runtime governance layer. Every enterprise security framework (SOC 2, ISO 27001, EU AI Act) assumes that systems acting on behalf of the company are governed by access controls and auditable policies. AI agents are not. The risk is not theoretical: a misconfigured agent with access to production systems can cause irreversible harm before any human is aware it's happening.

The existing AI security market addresses LLM input/output safety — filtering what goes into models and what comes out. No production-ready solution exists for governing what agents *do* with their model output at runtime.

## The Solution

AgentGuard is a runtime policy engine that intercepts agent actions before execution. Developers integrate a lightweight TypeScript SDK; security teams define policies in a declarative, human-readable syntax. Every action — allowed or blocked — is written to a SHA-256 hash-chained audit trail that proves, cryptographically, the log has not been tampered with.

The result: enterprises can deploy autonomous AI agents with the same governance posture they apply to human operators — defined permissions, enforced limits, and complete auditability. A per-tenant kill switch allows instant agent suspension without code changes or redeployment.

## Market Size

The AI security market attracted **$6.34 billion in investment in 2025**, with the agent governance sub-segment still nascent. We are entering at the ground floor of a segment that will be mandatory — not optional — for any enterprise running autonomous agents.

Adjacent markets that anchor the TAM:
- **AI/ML security:** $6.34B invested (2025), growing at >40% CAGR
- **Cloud workload security:** $4.2B market (comparator for runtime enforcement tools)
- **GRC/compliance automation:** $15B+ market (audit trail and policy management as compliance infrastructure)

Conservative 5-year SAM estimate: **$2.1B** (enterprises with >100-person engineering teams running AI agents in production, requiring SOC 2 or equivalent compliance).

## Timing — Why Now

Three forces have converged in 2026 to make agent governance a present-tense problem, not a future one:

**1. The agent deployment wave is here.**
JPMorgan, Goldman Sachs, Salesforce, Microsoft, and hundreds of mid-market enterprises have publicly announced or deployed AI agents in production in 2025. The move from LLM-as-chatbot to LLM-as-worker is no longer experimental — it's operational.

**2. Regulatory pressure is real.**
The EU AI Act's risk-based framework went into effect in 2024. High-risk AI systems require documented governance, audit trails, and human oversight mechanisms. Enterprises operating in the EU (or selling to EU customers) face enforcement exposure. Their legal teams are asking questions their security teams can't yet answer.

**3. The acquisition wave validates the market.**
**Snyk acquired Invariant Labs** (2025) — Snyk, the world's largest developer security platform, paid to acquire AI security capability. **Palo Alto Networks acquired Protect AI** (2025) — the world's largest network security company bought its way into AI security. These are not research investments; they are strategic acquisitions by buyers who believe the market is immediate. The next acquisition wave will be in agent-specific governance. We intend to be the category leader before it arrives.

---

---

# PAGE 2 — THE PRODUCT & TRACTION

---

## What's Built

AgentGuard is live in production. All URLs below serve real traffic from a real backend.

| System | URL | Status |
|--------|-----|--------|
| Landing page | agentguard.tech | Live |
| Developer dashboard | app.agentguard.tech | Live — real signup, API key provisioning, usage analytics |
| Policy evaluation API | api.agentguard.tech | Live — serving real requests |
| Investor demo | demo.agentguard.tech | Live — real backend, not a mockup |

**SDKs published:**
- `npm install @the-bot-club/agentguard` (TypeScript)
- `pip install agentguard-tech` (Python)

**v0.2.0 capabilities (all live):**
- Policy engine (7 rule types, declarative YAML, sub-millisecond)
- SHA-256 hash-chained audit trail (tamper-evident, paginated, verifiable)
- Per-tenant and per-agent kill switch
- Webhook alerts (Slack, Teams, PagerDuty integration)
- Agent identity and scoped policies (per-agent API keys)
- 5 compliance templates (SOC 2, APRA CPS 234, EU AI Act, OWASP Agentic, Financial Services)
- Rate limiting (sliding window, per-agent or per-tenant)
- Cost attribution (per-agent, per-tool spend tracking)
- Real-time decision dashboard (stats, live feed, agent activity)

**Tech stack:** TypeScript · Azure Container Apps · SQLite · GitHub Actions CI/CD
**Test coverage:** 11 e2e test suites, 63 unit tests, all passing · Full CI pipeline on every commit
**Evaluation latency:** P99 < 1ms

## Architecture

AgentGuard operates as a sidecar policy enforcement layer. When an agent wants to take an action, it calls the AgentGuard SDK with the action context (action type, parameters, requesting agent, tenant). The SDK forwards this to the evaluation API, which loads the tenant's policy ruleset (7 rule types: resource access, rate limits, scope restrictions, human-in-the-loop gates, time-window controls, environment isolation, and data classification) and evaluates them against the action in under a millisecond. The decision — ALLOW or BLOCK, with reason — is returned to the agent, and the full decision record is appended to the tenant's audit chain (each entry includes a SHA-256 hash of the previous entry, making the chain cryptographically tamper-evident). All policy definitions are stored as declarative JSON, readable by non-engineers. The per-tenant kill switch is a single flag that, when set, causes all subsequent evaluations for that tenant to return BLOCK, regardless of policy — enabling instant suspension without application redeployment.

## Early Traction & Signals

- **Real product, real users.** Signup flow is live. API key provisioning is live. This is not a waitlist.
- **6-week build to production.** Full policy engine, audit trail, SDK, dashboard, and CI/CD shipped in 6 weeks. This is the velocity of a team that knows what it's building.
- **Design partner conversations open.** We are actively engaging enterprises that are deploying AI agents in production and need governance tooling now. These conversations will convert to paid design partner relationships in Q2 2026.
- **Market timing confirmed.** The Snyk and Palo Alto acquisitions are our strongest external validation signal. Enterprise security buyers are spending, not waiting.

## Go-to-Market

**Phase 1 — Developer adoption (Months 1-6)**
The SDK is open-source. Developers building agents find AgentGuard through search, content, and community. The getting-started experience is under 5 minutes. Free tier (10K evaluations/month) removes friction. Goal: 50 active design partners with production usage.

**Phase 2 — Enterprise conversion (Months 6-18)**
Design partners with compliance requirements convert to Enterprise contracts. Sales motion: developer usage creates internal champions → CISO/CTO engagement → procurement. Compliance-driven urgency (EU AI Act, SOC 2, cyber insurance) accelerates deal cycles.

**Phase 3 — Platform expansion (Month 18+)**
Add MCP (Model Context Protocol) security, multi-agent governance, and HITL gate orchestration. Expand from policy enforcement to full agent governance platform. Series A.

## Business Model

| Tier | Price | Volume | Target |
|------|-------|--------|--------|
| Free | $0/month | 10K evaluations/month | Individual developers, proof-of-concept |
| Pro | $299/month | 1M evaluations/month | Small teams, startups in production |
| Enterprise | Custom (est. $50K-$250K ACV) | Unlimited + SLA + SSO + compliance reports | Enterprise with compliance requirements |

Revenue is usage-based within tiers, with enterprise contracts on annual terms. We expect >80% of revenue from enterprise tier within 24 months.

## Competitive Landscape

| | **AgentGuard** | **Invariant Labs** | **Lakera** | **Protect AI** | **CalypsoAI** |
|---|---|---|---|---|---|
| **Focus** | Agent runtime governance | LLM trace monitoring | Prompt injection / LLM I/O | AI/ML model security | LLM content filtering |
| **Stage** | Seed (live product) | Acquired by Snyk (2025) | Series A | Acquired by Palo Alto (2025) | Series B |
| **Funding** | Raising $6M | ~$8M pre-acquisition | ~$20M | ~$38M pre-acquisition | ~$22M |
| **Key differentiator** | Declarative policy engine for agent *actions*, tamper-proof audit chain, <1ms latency | Trace replay and anomaly detection | Prompt firewall, jailbreak prevention | ML model vulnerability scanning | Enterprise LLM content controls |
| **Covers agent actions?** | ✅ Yes — core product | ❌ No — LLM I/O only | ❌ No — prompt layer only | ❌ No — model layer only | ❌ No — content layer only |

**The critical insight:** Every competitor operates at the LLM input/output layer. AgentGuard is the only solution that governs what the agent *does* with its model output — the action layer where real-world risk is created.

---

---

# PAGE 3 — THE ASK

---

## The Raise

**Raising:** $6M seed round
**Pre-money valuation:** $24M ($30M post-money)
**Structure:** SAFE notes ($30M cap, 20% discount) or priced equity round — flexible based on lead investor preference
**Dilution:** ~20%
**Use of funds:** 18-month runway to Series A milestones

## Use of Funds

| Category | Allocation | Details |
|----------|-----------|---------|
| **Engineering** | 60% ($3.6M) | Hire 5 engineers: 2 backend (policy engine, API), 1 frontend (dashboard), 1 DevRel/SDK, 1 security/compliance |
| **Go-to-Market** | 20% ($1.2M) | Sales lead, content/community, enterprise sales motion, design partner program |
| **Compliance & Legal** | 10% ($600K) | SOC 2 Type II audit, EU AI Act compliance documentation, IP protection, entity structure |
| **Operations** | 10% ($600K) | Infrastructure scaling, Azure costs, tooling, G&A |

## 18-Month Milestones

**Month 6:**
- 50 active design partners (teams with production agent deployments using AgentGuard)
- 3 enterprise contracts signed (combined ACV >$150K)
- MCP security module shipped
- SOC 2 Type II audit initiated

**Month 12:**
- $500K ARR
- 200+ active developer accounts
- SOC 2 Type II certification achieved
- Multi-agent governance module in beta
- 2-3 enterprise contracts in the $100K+ ACV range

**Month 18 (Series A readiness):**
- $1.5M ARR (on path to $3M run rate)
- 500+ developer accounts, 15+ enterprise accounts
- EU AI Act compliance module GA
- Series A raise: $18-25M at $80-100M valuation (3-4x step-up from seed)

## Team

**[Technical Founder / CEO]**
Background in enterprise software and AI infrastructure. Designed and built the AgentGuard policy engine, audit trail, SDK, dashboard, and CI/CD infrastructure — shipped production-grade system in 6 weeks. Direct experience with the enterprise compliance problem that AgentGuard solves.

*(Additional team members to be introduced at first meeting. We are hiring a senior engineer and a GTM lead immediately post-close.)*

## Why Australia

**We are building a global company from an Australian base — and that's an advantage, not a constraint.**

- **APAC enterprise market:** Australia is the natural entry point for APAC enterprise sales. Financial services (the highest-value vertical for agent governance) is concentrated in Sydney and Melbourne. We have proximity competitors like Atlassian and Canva have demonstrated that global enterprise companies can be built from Australia.

- **Government co-investment:** Australia's National AI Centre and CSIRO's Data61 actively fund AI infrastructure companies. ATO and DISR programs offer non-dilutive capital for qualifying technology companies. We intend to layer government grants on top of venture funding.

- **Lower burn, longer runway.** Sydney engineering talent costs 30-40% less than San Francisco for equivalent capability. Our $6M seed buys 18+ months of Australian-based runway versus 10-12 months in the US. This matters for hitting Series A milestones before needing to raise again.

- **Time zone coverage.** UTC+10/11 covers APAC business hours with US overlap in mornings. A lean Australian team serves APAC enterprise clients without the overhead of international offices.

We will establish a US entity (Delaware C-Corp or equivalent) as part of the seed close to facilitate US enterprise sales and a future US-based Series A.

## Why Blackbird / Square Peg

You've backed companies that became global category leaders from an Australian base — Canva, Atlassian, SafetyCulture, Deputy. AgentGuard is building in a category that doesn't exist yet, from a country that is increasingly competitive in enterprise software.

We are not pitching a lifestyle business. We are building the governance infrastructure for the agent era — and we intend to own that category.

---

## Contact & Links

| | |
|---|---|
| **Email** | founders@agentguard.tech |
| **Demo** | https://demo.agentguard.tech |
| **Product** | https://agentguard.tech |
| **Dashboard** | https://app.agentguard.tech |
| **API** | https://api.agentguard.tech |
| **GitHub** | https://github.com/onebot/agentguard *(private — access on request)* |

---

*This memo is confidential and intended solely for the named recipient. Not for distribution or reproduction without prior written consent.*

*AgentGuard Pty Ltd · Sydney, Australia · March 2026*

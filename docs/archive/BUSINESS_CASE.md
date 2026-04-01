# AgentGuard — Business Case
## Cybersecurity for the Agentic Era
### Confidential — February 2026

---

## Executive Summary

**AI agents are going production. Security isn't keeping up. That's a $30B problem — and we're building the solution.**

In 2025, enterprises will deploy more autonomous AI agents than they hired human employees. These agents execute code, move money, access sensitive data, and make decisions — with no security layer governing what they can do. AgentGuard is the runtime security platform that monitors, constrains, and audits AI agents across any framework. Think: **firewall + SOC + compliance engine, purpose-built for autonomous AI.**

The market window is 18 months. Regulation is landing (EU AI Act enforcement begins August 2025), enterprises are deploying agents now, and no category leader exists. We're building the category-defining platform.

**We're raising $3M seed to ship the product, land 25 enterprise design partners, and own this category before the incumbents wake up.**

---

## Why Now — The Convergence

Five forces are converging simultaneously to create a once-in-a-decade market opportunity:

### 1. Enterprise Agent Adoption Hit Escape Velocity (2024–2026)
- Gartner predicts 33% of enterprise software will include agentic AI by 2028, up from <1% in 2024
- OpenAI, Google DeepMind, Anthropic, and Microsoft all shipped agentic frameworks in 2024
- McKinsey estimates agentic AI will unlock $2.6T–$4.4T in annual economic value

### 2. Agent Failures Are Making Headlines
- Chevrolet's AI chatbot was manipulated into offering a $1 car (Dec 2023)
- Air Canada held liable for its chatbot's false promises (Feb 2024)
- DPD's chatbot was prompt-injected into swearing at customers
- These are *chatbots* — agents with tool access will produce catastrophic failures at scale

### 3. Regulation Is No Longer Theoretical
- **EU AI Act:** enforcement begins August 2025 — Articles 9, 14, and 15 directly mandate what AgentGuard provides
- **US Executive Order 14110** on AI safety sets federal procurement requirements
- **NIST AI RMF 1.0 + AI 600-1**, **ISO/IEC 42001**, **DORA**, **NIS2**, **SEC Cybersecurity Rules**
- Enterprises pursuing certification need demonstrable controls now

### 4. The Incumbents Can't Pivot Fast Enough
- Traditional SIEM/SOAR vendors understand infrastructure, not agent intent
- Model providers build model-level safety — not runtime governance for deployed agents
- There's a structural gap between "safe models" and "secure agent deployments" — that's us

### 5. Insurance and Liability Are Crystallising
- Cyber insurers are beginning to exclude AI agent incidents from standard policies
- Enterprises need demonstrable controls to maintain coverage
- AgentGuard monitoring = quantifiable risk reduction = lower premiums

---

## The Problem

AI agents are moving from demos to production. They're booking flights, writing code, managing infrastructure, handling finances, and making decisions with real-world consequences.

**But there's no security layer between "agent was given a task" and "agent did something catastrophic."**

### The Full Threat Landscape

| Threat Category | Description | Severity |
|----------------|-------------|----------|
| **Prompt Injection** | Agents manipulated by malicious inputs to act against owner's intent | Critical |
| **Data Poisoning via Agent Memory** | Persistent backdoors in RAG stores/vector DBs influencing all future decisions | Critical |
| **Cross-Agent Prompt Injection** | Compromised agent injects malicious instructions through the agent graph — lateral movement via language | Critical |
| **Tool Confusion & Parameter Manipulation** | Agent tricked into calling wrong tool or passing malicious parameters | High |
| **Goal Drift** | Subtle deviation from instructions over long reasoning chains | High |
| **Privilege Escalation** | Agents acquiring access beyond what was intended | High |
| **Capability Accumulation** | Incremental permission grants that aggregate into catastrophic access | High |
| **Shadow Actions** | Side-effects the user never asked for (exfiltration, spending, API calls) | High |
| **Multi-Agent Cascade Failures** | Agents "fixing" each other's fixes in emergent, systemic failure loops | High |
| **Resource Exhaustion DoS** | Agents manipulated into runaway cloud resource consumption | Medium |
| **Timing Attacks on HITL** | Malicious actions queued during low oversight periods, exploiting approval fatigue | Medium |
| **Confidentiality via Inference** | Agents inferring sensitive data (M&A, layoffs) from permitted access patterns | Medium |

**What a CISO actually worries about:** *"I have 200 agents deployed across 6 departments. I can't tell you what they accessed yesterday, whether any of them violated our data handling policies, or if one is currently exfiltrating PII to a third-party API. My board asks about AI risk every quarter and I have nothing to show them."*

### Real-World Attack Scenarios

**"The Insider Agent"** — A departing employee configures their AI agent to exfiltrate customer data before access revocation. Each individual action is within policy — only the agent's intent chain reveals the pattern. Traditional DLP misses it entirely.

**"The Supply Chain Compromise"** — A widely-used agent framework pushes an update that subtly modifies credential handling. Looks like a performance optimisation in code review. In practice, agents leak auth tokens to an attacker-controlled endpoint. Hundreds of enterprises compromised simultaneously.

**"The Cascading Agent Failure"** — An infrastructure agent remediates a minor issue. Its fix triggers a secondary issue. A second agent "fixes" that. Within 30 minutes, seven agents have each corrected the previous agent's correction — complete production outage. No individual agent acted outside policy. The failure is emergent.

**"The Market Manipulation"** — A trading firm's research agent encounters a poisoned data source. Analysis shifts subtly, producing signals that benefit an attacker's short position. Discovered only after a $20M loss triggers investigation.

**"The Compliance Catastrophe"** — Healthcare agents store PHI in non-compliant logging, discuss patient details across sessions, and make triage recommendations constituting unlicensed medical advice. Simultaneous HIPAA, malpractice, and licensing violations. Exposure: $50M+.

---

## The Opportunity

### Market Sizing — Bottom-Up

| Segment | Sizing Logic | 2027 Estimate |
|---------|-------------|---------------|
| **TAM** | 500K+ enterprises globally × $20K avg. agent security spend | **$10B+** |
| **SAM** | ~80K enterprises in regulated industries × $35K avg. spend | **$2.8B** |
| **SOM** | Achievable in 3 years with seed-stage resources | **$8.5M ARR** |

**Category creation precedent:** Cloud security (Zscaler, Wiz) went from $0 to $10B+ in 6 years. The shift from "AI safety research" to "AI security product" follows the same pattern as "network research" → "firewalls" in the 1990s.

---

## The Solution: AgentGuard

A runtime security layer that monitors, constrains, and audits AI agents — regardless of which model or framework powers them.

### Core Capabilities

**1. Policy Engine (the "Firewall")**
Declarative policies (YAML/JSON, version-controlled) defining what agents CAN and CANNOT do. Action-level permissions, budget/rate limits, scope boundaries. Directly implements EU AI Act Art. 9 and NIST AI RMF GOVERN function.

**2. Real-Time Monitoring (the "SOC")**
Every agent action logged with full context (intent → plan → execution → result). Anomaly detection, chain-of-thought inspection, risk scoring dashboard. Implements EU AI Act Art. 12–13 and ISO 42001 §6.1.2.

**3. Kill Switch & Intervention**
Instant halt, human-in-the-loop gates for high-risk actions, graceful degradation, automatic circuit breakers. Configurable fail-closed/fail-open per agent criticality tier. Implements EU AI Act Art. 14.

**4. Audit & Compliance**
Complete audit trail with tamper-evident logging. Pre-built compliance reports: SOC 2, ISO 27001, ISO 42001, EU AI Act, HIPAA, PCI-DSS, DORA, NIS2. Evidence packaging for regulatory inquiries. Court-admissible forensic chain of custody.

**5. Multi-Agent Governance**
Agent-to-agent visibility, collusion prevention, hierarchical permissions, coordination policies. Cross-agent threat correlation and lateral movement detection.

---

## Architecture — Zero-Trust Agent Security

```
                    ┌─────────────────────────────────────────┐
                    │         AgentGuard Control Plane          │
                    │  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
                    │  │ Policy   │ │ Identity │ │ Threat   │ │
                    │  │ Engine   │ │ & AuthZ  │ │ Intel    │ │
                    │  └──────────┘ └──────────┘ └──────────┘ │
                    │  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
                    │  │ Anomaly  │ │Compliance│ │ Incident │ │
                    │  │Detection │ │ Engine   │ │ Response │ │
                    │  └──────────┘ └──────────┘ └──────────┘ │
                    │  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
                    │  │ Forensics│ │ Supply   │ │ ASPM     │ │
                    │  │ & Replay │ │ Chain    │ │ Scoring  │ │
                    │  └──────────┘ └──────────┘ └──────────┘ │
                    └────────────────┬────────────────────────┘
                                     │
                    ┌────────────────┴────────────────────────┐
                    │       AgentGuard Data Plane (per-agent)  │
                    │  ┌──────────────────────────────────┐   │
                    │  │ Identity Verification (mTLS/JWT) │   │
                    │  │ Action Policy Check              │   │
                    │  │ Data Classification Gate         │   │
                    │  │ Resource Budget Enforcement      │   │
                    │  │ Telemetry & Chain-of-Thought Log │   │
                    │  │ Kill Switch Listener             │   │
                    │  └──────────────────────────────────┘   │
                    └────────────────┬────────────────────────┘
                                     │
            ┌────────────────────────┼────────────────────────┐
            │                        │                        │
    ┌───────┴───────┐       ┌───────┴───────┐       ┌───────┴───────┐
    │  Agent A      │       │  Agent B      │       │  Agent C      │
    │  (Sandboxed)  │       │  (Sandboxed)  │       │  (Sandboxed)  │
    └───────┬───────┘       └───────┬───────┘       └───────┬───────┘
            │                        │                        │
    ┌───────┴───────┐       ┌───────┴───────┐       ┌───────┴───────┐
    │ Tool Access   │       │ Tool Access   │       │ Tool Access   │
    │ (Proxied)     │       │ (Proxied)     │       │ (Proxied)     │
    └───────────────┘       └───────────────┘       └───────────────┘
```

### Zero-Trust Principles

- **Agent Identity:** Cryptographically verifiable identity per instance, mTLS for all communication, short-lived rotatable credentials
- **Continuous Verification:** Re-evaluate permissions on every action, context-aware access, behavioural baselines
- **Microsegmentation:** Dynamic permission scoping, network-level isolation, data views not raw tables
- **Least Privilege:** Zero permissions by default, time-bounded JIT elevation, 90-day recertification

### Deployment Options
- **SDK/middleware** — wraps agent frameworks (5-minute setup)
- **Proxy/gateway** — intercepts all agent-tool calls (zero-code)
- **SaaS dashboard + API** — cloud-hosted control plane
- **On-prem / VPC** — for regulated industries (HIPAA, FedRAMP)

**Technical moat:** <50ms p99 latency overhead. Security teams don't get blamed for performance degradation.

### Supply Chain Security

- **Model provider risk:** Behaviour regression testing, version pinning, multi-provider failover, output consistency monitoring
- **Framework risk:** SBOM generation, dependency vulnerability scanning, provenance verification
- **Third-party agent risk:** Component sandboxing, marketplace security certification, runtime isolation
- **Data pipeline risk:** RAG provenance tracking, input sanitisation, ingested data anomaly detection

---

## Incident Response & Forensics

### Agent-Specific IR Playbooks
Pre-built response procedures for each threat category. Automated containment: isolate compromised agent, preserve state, block lateral movement. Blast radius analysis across downstream agents.

### Forensic Capabilities
- Full session recording with tamper-evident, append-only, cryptographically chained logs
- Chain-of-thought preservation — reasoning, not just actions
- Tool call recording with exact parameters, responses, latency
- Environmental context capture — what was in the agent's context window at decision time
- Timeline reconstruction correlated with system events
- Memory state snapshots (working memory, RAG context, conversation history)

### Agent SOAR Integration
- Detection rules tuned for agent threats (not repurposed network rules)
- Auto-quarantine on threat signature match
- SIEM/SOAR enrichment (Splunk, Sentinel, Chronicle) — not replacement
- Threat intel feeds for agent vulnerabilities and framework CVEs

---

## Competitive Landscape & Moat

| Player | What They Do | Their Gap | Our Advantage |
|--------|-------------|-----------|---------------|
| **Traditional SIEM** (Splunk, CrowdStrike, Palo Alto) | Monitor infrastructure & endpoints | Don't understand agent intent or reasoning chains | We parse agent cognition, not just packets |
| **AI Safety Labs** (Anthropic, OpenAI) | Build safer models | Model-level only; no runtime governance once deployed | We secure the deployment, not the weights |
| **Prompt Security** (Lakera, Rebuff) | Block prompt injection at input | Single attack vector; no policy, audit, or governance | We cover input → reasoning → action → outcome |
| **API Gateways** (Kong, Apigee) | Rate-limit and manage APIs | No agent context or compliance mapping | We understand *why* the call is being made |
| **GRC Platforms** (Vanta, Drata) | Compliance automation for traditional IT | No agent-specific controls or real-time monitoring | We generate the evidence they need for AI compliance |

### Defensibility (The Moat)

1. **Data network effect:** More agents monitored → better anomaly detection → better product → more customers. Compounds.
2. **Policy ecosystem:** Community-contributed templates create switching costs. "AgentGuard Rules" becomes the standard language (like Snort rules for IDS, OPA for infrastructure).
3. **Integration breadth:** Deep SDK integrations with every major framework. First-mover advantage — frameworks standardise on whoever integrates first.
4. **Compliance lock-in:** Audit trails, evidence packages, regulatory reports — auditors don't like change.
5. **Category ownership:** "AgentGuard" becomes synonymous with agent security the way "Salesforce" means CRM.

---

## Business Model

### Hybrid Pricing: Platform Fee + Usage + Compliance Modules

| Tier | Platform Fee | Usage Component | Compliance Modules |
|------|-------------|----------------|-------------------|
| **Free / OSS** | $0 | 3 agents, 10K actions/mo | — |
| **Team** | $499/mo | +$0.001/action above 100K/mo | — |
| **Business** | $2,500/mo | +$0.0008/action above 500K/mo | $1,500/mo per module |
| **Enterprise** | $8,000–25,000/mo | Custom action pricing | $3K–8K/mo per module, bundled |
| **Platform/OEM** | Negotiated minimum | Revenue share 12–18% | White-label |

### Unit Economics by Tier

| Metric | Team | Business | Enterprise |
|--------|------|----------|------------|
| **ACV** | $6K | $36K | $120K |
| **Gross Margin** | 85% | 83% | 78% |
| **CAC** | $2K (PLG) | $18K (inside sales) | $55K (field sales) |
| **LTV (3-yr, 120% NRR)** | $20K | $125K | $430K |
| **LTV:CAC** | 10x | 6.9x | 7.8x |
| **Payback (months)** | 4 | 8 | 14 |
| **Logo Churn (annual)** | 20% | 12% | 5% |

**Why this works:** Platform fee = predictable base revenue. Usage metering = captures value as agent deployments scale. Compliance modules = high-margin, sticky NRR driver. Eliminates "agent seat" definition gaming.

**Net revenue retention target: 135% by Year 3** — driven by agent proliferation within accounts and compliance module attach.

---

## Go-To-Market Strategy

### Buyer Personas

| Persona | Title | Pain Point | Buying Trigger | Deal Size |
|---------|-------|-----------|----------------|-----------|
| **Security Champion** | CISO / VP Security | "I can't govern what I can't see" | Board asks about AI risk; audit finding | $30K–100K ACV |
| **Platform Builder** | VP Eng / Head of AI | "We need guardrails before production" | Agent failure in staging; compliance blocker | $10K–40K ACV |
| **Compliance Driver** | GRC Lead / DPO | "EU AI Act is 6 months away" | Regulatory deadline; certification requirement | $20K–60K ACV |
| **Innovation Leader** | CDO / CTO | "We want to move fast safely" | Wants to unlock more agent use cases | $15K–50K ACV |

### Phased Execution

**Phase 1 — Developer Love (Months 1–6)**
- Open-source core policy engine (Apache 2.0)
- Integrate with top 5 agent frameworks (LangChain, CrewAI, AutoGen, OpenAI Assistants, Anthropic tool use)
- Agent identity framework, tamper-evident logging, SIEM integration (Splunk + Sentinel)
- **KPIs:** 5K GitHub stars, 1K weekly active OSS users, 500 Discord members

**Phase 2 — Enterprise Wedge (Months 6–12)**
- Target regulated industries — compliance-first messaging tied to EU AI Act timeline
- Convert OSS power users into enterprise design partners
- Zero-trust policy framework, IR playbooks, forensic replay, agent SBOM generation
- **KPIs:** 25 design partners, $500K pipeline, 3–8 paying enterprise customers

**Phase 3 — Platform Play (Months 12–24)**
- Cloud marketplace listings (AWS Bedrock, Azure AI, GCP Vertex)
- "AgentGuard Verified" certification for agent marketplaces
- ASPM dashboard, cross-agent threat correlation, regulatory change management
- **KPIs:** $2M+ ARR, 100+ customers, 140%+ NRR, 30K+ GitHub stars

---

## Financial Projections

### Scenario Analysis

#### Bull Case (15% probability) — Category creation hits, catalytic security event

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| ARR | $350K | $4.5M | $18M |
| Enterprise Customers | 8 | 50 | 180 |
| Gross Margin | 82% | 81% | 80% |
| Net Burn | ($1.4M) | ($2.5M) | ($1.5M) |
| Path to CF+ | — | — | Q4 Year 3 |

#### Base Case (55% probability) — Steady execution, market develops on schedule

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| **Enterprise Customers** | 3 | 25 | 100 |
| **Team/Business Customers** | 20 | 80 | 280 |
| **ARR (exit)** | $150K | $2.0M | $8.5M |
| **Revenue (recognised)** | $85K | $1.2M | $5.8M |
| **Gross Profit** | $68K | $960K | $4.6M |
| **Headcount** | 8 | 18 | 42 |
| **Total OpEx** | $1.7M | $3.8M | $8.5M |
| **Net Burn** | ($1.6M) | ($2.8M) | ($3.9M) |
| Path to CF+ | — | — | Q3 Year 4 |

#### Bear Case (30% probability) — Agent adoption stalls, incumbents bundle

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| ARR | $60K | $600K | $2.5M |
| Enterprise Customers | 1 | 10 | 35 |
| Net Burn | ($1.5M) | ($2.0M) | ($2.8M) |
| Survival plan | Cut to 4 by M12 | Bridge or pivot | Acqui-hire option |

### Burn Multiple Trajectory (Base Case)

| Year | Net Burn | Net New ARR | Burn Multiple |
|------|----------|-------------|---------------|
| Year 1 | $1.6M | $150K | 10.7x (investing in product) |
| Year 2 | $2.8M | $1.85M | **1.5x** (efficient growth) |
| Year 3 | $3.9M | $6.5M | **0.6x** (best-in-class) |

*The burn multiple trajectory — from 10.7x to 0.6x — is the financial story. This is what Series A investors want to see.*

### Path to Cash-Flow Positive (Base Case)

| Quarter | Revenue | OpEx | Net Burn |
|---------|---------|------|----------|
| Y1 Q1 | $0 | $195K | ($195K) |
| Y1 Q2 | $5K | $285K | ($280K) |
| Y1 Q3 | $20K | $345K | ($325K) |
| Y1 Q4 | $60K | $420K | ($360K) |
| Y2 Q1 | $120K | $550K | ($430K) |
| Y2 Q2 | $200K | $650K | ($450K) |
| **Series A close (~$10M)** | | | |
| Y3 Q3 | $1.6M | $2.1M | ($500K) |
| Y3 Q4 | $2.3M | $2.4M | ~breakeven |
| **Y4 Q1** | **$3.0M** | **$2.6M** | **+$400K CF+** |

Total capital required: ~$13M ($3M seed + $10M Series A).

### Comparable Benchmarks

| Company | GTM Model | Seed → $1M ARR | Key Insight |
|---------|-----------|----------------|-------------|
| **Snyk** | Dev-first, OSS → enterprise | ~18 months | Most comparable — similar GTM. Honest analogy. |
| **Orca Security** | Category creation, regulated enterprise | ~12 months | Agentless cloud security playbook |
| **Cyera** | Data security posture, regulated | ~12 months | Fast enterprise adoption in regulated verticals |

*We benchmark to Snyk, not Wiz. Snyk's developer-first, OSS-led, compliance-driven expansion is the executable playbook.*

---

## Compliance Framework Mapping

| Framework | Key Requirements | AgentGuard Capability |
|-----------|-----------------|----------------------|
| **EU AI Act** | Risk management (Art. 9), Record-keeping (Art. 12), Transparency (Art. 13), Human oversight (Art. 14), Robustness (Art. 15) | Policy engine, audit trail, dashboards, kill switch, anomaly detection |
| **NIST AI RMF** | GOVERN, MAP, MEASURE, MANAGE functions | Full lifecycle coverage |
| **ISO/IEC 42001** | Risk assessment, operational planning, performance evaluation | Automated scoring, policy enforcement, compliance dashboards |
| **DORA** | ICT risk management for EU financial services | Agent resilience testing, incident reporting |
| **NIS2** | Expanded EU cybersecurity for essential entities | Infrastructure security, breach reporting |
| **SOC 2 Type II** | Logical access, system operations, change management | Access controls, monitoring, audit trails |
| **HIPAA** | Technical safeguards, policies & procedures | Data access policies, audit logs, encryption enforcement |
| **PCI-DSS v4.0** | Access restriction, logging & monitoring, policies | Action-level controls, comprehensive logging |
| **FedRAMP** | Federal cloud deployment controls | Mapped to FedRAMP baselines (Phase 3 roadmap) |
| **SEC Cybersecurity Rules** | Material incident disclosure, board reporting | Incident determination, executive reporting |

---

## Key Risks & Mitigations

| Risk | Prob. | Mitigation |
|------|-------|-----------|
| **Market timing** — agent adoption slower than projected | 30% | Keep burn <$130K/mo for 9 months; product also secures traditional LLM API usage (broader TAM); maintain 6+ months runway always |
| **Platform bundling** — providers ship "good enough" security | 40% | Framework-agnostic aggregation layer; compliance depth platforms won't invest in; partner don't compete |
| **Enterprise sales cycles** — 6–9 months vs. 3–4 | 50% | PLG cash flow while enterprise gestates; design partner pricing; land at $20–30K departmental budget then expand |
| **Pricing erosion** — OSS alternatives compress pricing | 25% | Compliance modules = pricing moat; usage-based component; proprietary anomaly ML |
| **Key person risk** — losing any founder at 4–8 people | 35% | 4-year vesting, aggressive documentation, cross-training, "break glass" senior hire relationships |
| **Negative unit economics at scale** — on-prem complexity | 20% | Separate professional services margins; deployment automation; $150K minimum ACV for on-prem |

---

## The Ask — $3M Seed

### Use of Proceeds

| Category | Amount | Allocation |
|----------|--------|-----------|
| **Engineering** | $1.1M (37%) | 3 engineers + CTO (founders below-market). Core platform, SDK integrations, anomaly detection ML |
| **Go-To-Market** | $0.45M (15%) | DevRel hire, OSS community, content. Enterprise AE starts Month 8. |
| **Infrastructure** | $0.2M (7%) | Cloud compute, CI/CD, SOC 2 readiness (via Vanta/Drata, ~$80K) |
| **Operations** | $0.25M (8%) | Legal ($80K — incorporation, IP, contracts), finance, insurance |
| **Working Capital** | $0.4M (13%) | Enterprise AR buffer (DSO 75–95 days), payment timing gap |
| **Reserve** | $0.6M (20%) | Buffer for slow market, extended sales cycles, opportunistic hires |
| **Total** | **$3.0M** | **~18 months runway** |

### Monthly Burn Trajectory

| Months | Headcount | Monthly Burn |
|--------|-----------|-------------|
| 1–3 | 4 (founders + 1 eng) | $65K |
| 4–6 | 6 (+2 eng) | $95K |
| 7–9 | 7 (+DevRel) | $115K |
| 10–12 | 8 (+AE) | $140K |
| 13–18 | 9–10 | $155–160K |

### 18-Month Milestones

| Milestone | Target |
|-----------|--------|
| OSS launch with 5 framework integrations | Month 4 |
| First enterprise design partner | Month 6 |
| $500K pipeline | Month 12 |
| 25 enterprise design partners | Month 14 |
| $1.5–2.5M ARR | Month 18 |
| Series A ready | Month 14–15 |

### Series A Triggers

| Metric | Target for Series A |
|--------|-------------------|
| ARR | $1.5–2.5M |
| ARR Growth | 20%+ MoM (trailing 3 months) |
| Enterprise Logos | 8–15 referenceable |
| NRR | >120% |
| Gross Margin | >75% |
| Logo Retention | >90% annual |
| Pipeline | 3–4x ARR target |
| Burn Multiple | <2x |

### Expected Series A Terms (2027)

| Parameter | Range |
|-----------|-------|
| Round size | $8–15M |
| Pre-money valuation | $30–60M |
| Dilution | 20–25% |
| Target investors | YL Ventures, Ten Eleven, Forgepoint, CRV, Costanoa |

---

## What Enterprise Buyers Need to See

Based on CSO validation interviews, these are the enterprise requirements AgentGuard must satisfy:

**Must-Haves for PO:**
1. Detection efficacy proof — false positive/negative rates against standardised agent attack benchmark
2. SIEM integration (Splunk/Sentinel) that enriches existing alerts
3. Performance SLA with contractual guarantees (<50ms p99)
4. Configurable fail-closed/fail-open per agent criticality tier
5. Data residency options including on-prem
6. SOC 2 Type II for AgentGuard itself
7. Policy/log export for portability — no vendor lock-in on security controls

**Differentiators:**
8. Red team as a service for agent-specific penetration testing
9. Board-ready AI risk reporting (one-click executive summaries)
10. Pre-negotiated insurance terms with demonstrable premium reduction
11. Agent Security Posture Management (ASPM) — continuous fleet assessment

---

## Board Q&A — Pre-Answered

**"What's our exposure if an agent goes rogue?"** Quantified risk based on comparable incidents. Air Canada case extrapolated to enterprise scale = $5–50M+ per event.

**"Can't our existing security tools handle this?"** No. Traditional SIEM/SOAR understands infrastructure, not agent intent chains. Clear gap analysis available.

**"What about CrowdStrike / Palo Alto entering?"** 12–18 month window before they build or acquire. First-mover advantage in category definition. Framework-agnostic positioning means we're complementary, not competitive.

**"How do we measure ROI?"** Incidents prevented, audit hours saved, compliance costs reduced, insurance premium reduction, MTTD/MTTR for agent threats.

**"How does this scale?"** 200 agents today → 2,000 in 18 months. Cost curve and architecture both designed for 100x scale.

---

## Founding Team Requirements

| Role | Why Critical | Ideal Background |
|------|-------------|-----------------|
| **CEO / Technical Co-Founder** | Product + vision | Agent/LLM engineering + systems security; OSS credibility |
| **CTO / Security Architect** | Enterprise credibility | 10+ years cybersecurity; SIEM/SOAR/EDR; enterprise sales support |
| **Head of Developer Relations** | Community + adoption | Built 1K+ contributor communities; content creation |
| **First Enterprise AE** (Month 8) | Pipeline → revenue | Sold cybersecurity to CISOs; $500K+ quota carrier |
| **Fractional CFO** (Month 9) | Series A readiness | Financial reporting package, cohort analysis |

---

## The One-Liner

> **"Every company deploying AI agents will need AgentGuard — the same way every company with a network needed a firewall. We're building that firewall."**

---

## Next Steps

1. **Validate** — 15 enterprise discovery calls with CISOs and AI platform leads
2. **Build** — MVP: open-source policy engine wrapping LangChain + OpenAI Assistants (8-week sprint)
3. **Prove** — Document 5 real agent failure modes as threat research + marketing
4. **Fund** — Close $3M seed: 3–4 angels + 1 lead institutional investor
5. **Launch** — OSS release + Product Hunt + Hacker News + CISO roundtable series
6. **Partner** — LOIs from 3 enterprise design partners before close of seed

---

*Document version: 3.0 — Final merged business case with CSO security review and CFO financial stress-test*
*Confidential — February 2026*

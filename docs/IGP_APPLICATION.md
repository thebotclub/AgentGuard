# Industry Growth Program — Application Draft
## AgentGuard | Early-Stage Commercialisation Stream
### Target: A$50,000 – A$250,000

---

## Prerequisites Checklist
- [ ] Register Pty Ltd (ASIC) → get ACN
- [ ] Register ABN (abr.gov.au — free, instant once incorporated)
- [ ] Register for GST (if expecting >$75K revenue, or voluntarily)
- [ ] Apply for Advisory Service at business.gov.au
- [ ] Receive Advisory Service report
- [ ] Submit grant application

---

## Section 1: Business Overview

**Business Name:** AgentGuard Pty Ltd
**ABN:** [TBD — after registration]
**Industry:** Software — AI Security / Cybersecurity
**Location:** Australia
**Employees:** 1 (founder)
**Annual Turnover:** Pre-revenue (< $20M threshold ✅)
**Website:** https://agentguard.tech

**Business Description:**
AgentGuard is a runtime security platform for AI agents. As organisations deploy autonomous AI agents that can execute code, access databases, write files, and make API calls, there are currently no standardised security controls governing what these agents can do. AgentGuard fills this gap by providing policy enforcement at both deploy-time (CI/CD gates) and runtime (sub-millisecond evaluation of every tool call), with a tamper-evident audit trail for regulatory compliance.

---

## Section 2: Innovation Description

**What is the innovation?**
AgentGuard is the first platform to combine three enforcement points for AI agent security in a single product:

1. **Deployment Gate (CI/CD Integration):** A static analysis scanner and GitHub Action that inspects agent code before deployment, identifies all tool capabilities (file access, shell execution, database queries, HTTP calls), and blocks deployment if any tool lacks a security policy. This is analogous to container image scanning, but applied to AI agent behaviour.

2. **Runtime Policy Engine:** A sub-millisecond evaluation API that intercepts every tool call an AI agent makes in production. Each call is evaluated against configurable policies (block, allow, monitor, human-approval) and the decision is returned in <1ms — fast enough to sit in the agent's execution loop without perceptible latency.

3. **Tamper-Evident Audit Trail:** Every evaluation decision is logged with a SHA-256 hash chain, creating a cryptographically verifiable record of all agent actions. This enables compliance evidence generation for frameworks including the EU AI Act (Article 11 — technical documentation), SOC 2, APRA CPS 234, and the Australian AI Ethics Framework.

**What makes it novel?**
- No existing product combines deploy-time scanning with runtime enforcement for AI agents
- Container security vendors (Snyk, Aqua, Wiz) scan container images but do not inspect agent behaviour
- AI governance platforms (Credo AI, Holistic AI) focus on model bias/fairness, not runtime tool execution
- AgentGuard is the first to apply the "shift-left security" paradigm from DevSecOps to the AI agent lifecycle

**Technology Readiness Level (TRL):** TRL 6 — System prototype demonstrated in a relevant environment
- Full API with 34 endpoints deployed on Azure Container Apps
- Production PostgreSQL database with row-level security
- Published SDKs on npm and PyPI
- GitHub Action for CI/CD integration
- 116+ automated tests passing
- Live demo at https://demo.agentguard.tech

---

## Section 3: NRF Priority Area Alignment

**Primary:** Enabling Capabilities
**Secondary:** Defence Capability

AgentGuard directly enables safe deployment of AI agents across all NRF priority sectors. As government agencies and enterprises in resources, agriculture, medical science, defence, and renewables adopt AI agents, they need runtime security controls to meet regulatory requirements. AgentGuard provides the enabling security infrastructure layer.

**Defence relevance:** The Australian Department of Defence's AI Strategy emphasises responsible AI deployment. AgentGuard's audit trail and policy enforcement directly support Defence AI governance requirements, particularly for autonomous systems operating under human-on-the-loop supervision.

---

## Section 4: Market Opportunity

**Global AI Security Market:** $28B by 2028 (Gartner)
**Agent Runtime Security (SAM):** $4.2B
**Initial Target (SOM — Regulated Industries):** $840M

**Why Australia?**
- Australian Prudential Regulation Authority (APRA) CPS 234 requires information security controls for regulated entities deploying AI
- The Australian AI Ethics Framework recommends audit trails for AI decision-making
- Australian enterprises in finance (CBA, ANZ, Macquarie) and healthcare are actively deploying AI agents
- First-mover advantage in the Australian market before US competitors expand here

**EU AI Act (August 2026):**
The EU AI Act begins enforcement in August 2026, creating global compliance demand. Any Australian company selling to EU customers (or processing EU citizen data) will need AI audit trails. AgentGuard provides this out of the box.

**Competitive Landscape:**
| Competitor | Focus | Gap |
|-----------|-------|-----|
| Snyk / Aqua / Wiz | Container scanning | Don't inspect agent behaviour |
| Credo AI / Holistic AI | Model governance | No runtime enforcement |
| Prompt Security | LLM prompt injection | Don't cover tool execution |
| **AgentGuard** | **Agent runtime security** | **First to market** |

---

## Section 5: Commercialisation Plan

**Business Model:** Usage-based SaaS

| Tier | Price | Target |
|------|-------|--------|
| Free | $0/month | Individual developers, open-source projects |
| Pro | $99/month | Startups and SMEs (50K evaluations/mo) |
| Enterprise | Custom | Regulated industries (unlimited, on-prem option) |

**Go-to-Market Strategy:**
1. **Developer adoption (Q1-Q2 2026):** Open-source CLI tool, free tier, Show HN, developer community engagement
2. **Design partners (Q2 2026):** 3-5 companies using AgentGuard free for 12 months in exchange for feedback and case studies
3. **Paid conversion (Q3-Q4 2026):** Convert design partners and inbound leads to Pro/Enterprise tiers
4. **Channel partnerships (2027):** Integration with CI/CD platforms (GitHub, GitLab, Azure DevOps) and cloud marketplaces

**Revenue Projections:**
- Month 6: 10 tenants, $0 (free tier, design partners)
- Month 12: 50 tenants, 5 paying → ~$6K MRR
- Month 18: 200 tenants, 30 paying → ~$30K MRR
- Month 24: 500 tenants, 100 paying → ~$100K MRR

---

## Section 6: Use of Grant Funds (A$150,000 requested)

| Category | Amount | Description |
|----------|--------|-------------|
| Engineering | $90,000 (60%) | Senior engineer hire (6-month contract) — build in-process SDK, SIEM integrations, compliance reporting |
| Cloud Infrastructure | $15,000 (10%) | Azure production hosting, PostgreSQL, CDN, monitoring for 12 months |
| Security Certification | $20,000 (13%) | SOC 2 Type I audit preparation and certification |
| Go-to-Market | $15,000 (10%) | Conference sponsorships (PyCon AU, AusCERT), content marketing |
| Legal / IP | $10,000 (7%) | Trademark registration (AU + US), patent provisional filing |

**Co-funding commitment:** Founder will match with equivalent time investment (valued at $150,000 at market engineering rates) and existing infrastructure spend (~$5,000 to date).

---

## Section 7: Team Capability

**Founder: Hani Kashi**
[ADD YOUR BACKGROUND HERE — key points to include:]
- Years of experience in software engineering / security / AI
- Previous roles or companies
- Relevant certifications or education
- Why you're uniquely positioned to build this

**Advisors:** [Add if any]

**Technical Capability Demonstrated:**
- Built and shipped MVP in 48 hours
- 34 API endpoints, production PostgreSQL, bcrypt auth, Zod validation, RLS
- Published SDKs on npm and PyPI
- GitHub Action for CI/CD integration
- 116+ automated tests
- 4 marketing videos (Remotion — programmatic)
- 6 live production endpoints on Azure with Cloudflare CDN

---

## Section 8: Project Milestones

| Milestone | Timeline | Deliverable |
|-----------|----------|-------------|
| M1: Design Partners | Month 1-3 | 3+ companies actively using AgentGuard |
| M2: In-Process SDK | Month 2-4 | Zero-latency SDK for Python/Node (no API call needed) |
| M3: Compliance Reports | Month 3-5 | EU AI Act + SOC 2 report generation from audit logs |
| M4: First Revenue | Month 4-6 | First paying customer on Pro tier |
| M5: SIEM Integration | Month 5-7 | Splunk + Azure Sentinel push integration |
| M6: SOC 2 Type I | Month 6-9 | Certification completed |
| M7: 50 Tenants | Month 9-12 | Platform scaling milestone |

---

## Appendix: Links & Evidence

- **Live Product:** https://agentguard.tech
- **API:** https://api.agentguard.tech/health
- **Dashboard:** https://app.agentguard.tech
- **Documentation:** https://docs.agentguard.tech
- **Demo:** https://demo.agentguard.tech
- **GitHub:** https://github.com/AgentGuard-tech/agentguard
- **npm SDK:** https://www.npmjs.com/package/@the-bot-club/agentguard
- **PyPI SDK:** https://pypi.org/project/agentguard-tech/
- **Terms of Service:** https://about.agentguard.tech/legal/terms.html
- **Privacy Policy:** https://about.agentguard.tech/legal/privacy.html

---

*Draft prepared March 2026. Submit via business.gov.au once Pty Ltd is registered.*

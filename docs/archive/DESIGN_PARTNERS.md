# AgentGuard Design Partner Targets
## Prospective Design Partner Research — Confidential

**Prepared:** March 2026  
**Purpose:** Identify 10–15 high-fit design partner candidates for AgentGuard's AI agent runtime security platform  
**Selection Criteria:** Verified production agent deployments, documented security exposure, regulated or high-stakes operating contexts, public references available for credibility triangulation

---

## Executive Summary

The companies profiled below represent the leading edge of agentic AI deployment in production environments. Each has publicly documented their agent architecture, is operating in a domain where agent failures carry material risk (regulatory, financial, reputational, or safety), and is therefore predisposed to invest in runtime security tooling.

Unlike traditional software buyers, these organisations have already crossed the "AI experimentation" threshold and are now grappling with the hard operational realities of agents acting autonomously in production — making them ideal design partners for AgentGuard's early product definition and go-to-market validation.

The list covers Australian-headquartered companies, US-based product and platform leaders, and regulated-industry enterprises spanning finance, healthcare, legal, and DevOps.

---

## Tier 1: Anchor Design Partners (Highest Fit)

*These organisations have the most detailed public footprint, clear security exposure, and a named stakeholder who owns the problem AgentGuard solves.*

---

### 1. Uber Technologies
**HQ:** San Francisco, CA, USA  
**Size:** ~32,000 employees; public (NYSE: UBER)  
**Sector:** Marketplace / Transport / Logistics

#### Agent Deployment
Uber operates one of the most sophisticated documented multi-agent infrastructures of any public company. Production systems include:

- **Validator & Autocover** — IDE-embedded agents for real-time security checks, best-practice validation, and automated test generation across a 5,000-engineer codebase
- **Finch** — Conversational AI for financial analysis, orchestrating a Supervisor agent plus a SQL Writer agent via LangGraph and Uber's internal Generative AI Gateway
- **Enhanced Agentic RAG** — LangGraph-powered Q&A automation via an internal abstraction layer called "Langfx"
- **Code Migration Agents** — Stateful, checkpointed agents processing thousands of files in long-running tasks

**Framework:** LangGraph (primary), with internal Langfx wrapper; LangSmith for observability

**Published claim:** Agents have saved an estimated **21,000 developer hours** across the engineering org.

#### Why They Care About Runtime Security
Uber's agents have direct write access to production code, internal databases, and financial systems. The Finch agent queries live financial data via SQL; Validator executes checks against active codebase. A prompt injection or privilege escalation in these systems is not a theoretical risk — it is a direct path to code corruption, financial data leakage, or broken production infrastructure. Their Langfx abstraction also means security gaps in LangGraph propagate silently.

#### Contact Approach
- **Head of Generative AI / AI Platform** (search LinkedIn for Uber's AI Infrastructure team lead)
- Engineering blog authors on the Finch and Validator posts are named engineers — warm outreach via those posts
- Attend or reach out via **QCon** or **AI Engineer World's Fair** — Uber engineers regularly present there

#### Public References
- [How Uber Built AI Agents That Saved 21,000 Developer Hours](https://blog.tmcnet.com/blog/rich-tehrani/ai/how-uber-built-ai-agents-that-saved-21000-developer-hours.html)
- [Unlocking Financial Insights with Finch](https://www.uber.com/blog/unlocking-financial-insights-with-finch/)
- [Enhanced Agentic RAG at Uber](https://www.uber.com/blog/enhanced-agentic-rag/)
- [LangChain: Top 5 LangGraph Agents in Production 2024](https://blog.langchain.com/top-5-langgraph-agents-in-production-2024/)

---

### 2. Elastic N.V.
**HQ:** Mountain View, CA, USA  
**Size:** ~3,500 employees; public (NYSE: ESTC)  
**Sector:** Security Operations / Observability / Enterprise Search

#### Agent Deployment
Elastic's **AI Assistant for Security** is a production LangGraph agent that reached 350+ enterprise users in 2024. Capabilities include:

- Alert summarisation and remediation recommendation
- ES|QL query generation from natural language
- Automatic Import and Attack Discovery workflows
- SIEM query conversion across competing platforms

**Framework:** Migrated from LangChain (launched June 2023) to **LangGraph** in 2024 for stateful orchestration. Uses **LangSmith** for tracing, cost estimation, and regression prevention. Model-agnostic by design (OpenAI, Azure OpenAI, AWS Bedrock).

#### Why They Care About Runtime Security
Elastic *sells security products* — their agents operate inside customer SIEM environments, accessing live security telemetry, alert queues, and detection rule sets. A compromised or misbehaving agent inside a SOC is both a product liability and a brand catastrophe. They also have every incentive to adopt runtime security tooling to demonstrate their own security posture to enterprise buyers. The pain here is existential, not optional.

#### Contact Approach
- **VP of Engineering, AI Platform** or **Head of AI/ML** — Elastic has a dedicated GenAI engineering team
- Authors of the LangChain/LangGraph blog post are named engineers — direct LinkedIn outreach
- **Elastic{ON}** conference is an ideal venue; Elastic actively showcases their AI features there

#### Public References
- [Building Automatic Import and Attack Discovery with LangChain](https://www.elastic.co/blog/building-automatic-import-attack-discovery-langchain)
- [LangChain Partners with Elastic to Launch the Elastic AI Assistant](https://blog.langchain.com/langchain-partners-with-elastic-to-launch-the-elastic-ai-assistant/)
- [Top 5 LangGraph Agents in Production 2024 — #2 Elastic](https://blog.langchain.com/top-5-langgraph-agents-in-production-2024/)

---

### 3. Komodo Health
**HQ:** San Francisco, CA, USA  
**Size:** ~600 employees; private (Series E, $220M+ raised)  
**Sector:** Healthcare Analytics / Life Sciences

#### Agent Deployment
Komodo Health launched **MapAI™** in September 2024 inside their MapLab platform — a production multi-agent system built on LangChain and LangGraph, operating against a dataset of **330 million de-identified patient journeys**.

Architecture:
- Central intelligence agent interprets natural language queries
- Delegates to specialised agents querying the Healthcare Map™
- Models tested and deployed: Llama 3.1, Mistral 7B, Phi-3
- Designed for non-technical users (clinical development, medical affairs, commercialisation)

**Framework:** LangChain + LangGraph. API-first, automated LLM lifecycle management, HIPAA/SOC 2 compliant.

#### Why They Care About Runtime Security
MapAI processes healthcare data covering a third of the US population. An agent executing out-of-bounds queries, leaking PHI, or being manipulated via indirect prompt injection (e.g., through a malformed query result) is a HIPAA breach. The stakes include federal regulatory action, civil liability, and loss of enterprise contracts. Additionally, Komodo's buyers (pharma, biotech, health systems) conduct intensive security reviews — demonstrable runtime security is a procurement requirement, not a nice-to-have.

#### Contact Approach
- **Chief Technology Officer** or **VP of AI/ML Engineering**
- LangChain named Komodo Health as a case study — the engineering lead on that case study is an accessible warm target
- Pharma/biotech conferences (e.g., **DPharm**, **HIMSS**) are natural venues

#### Public References
- [Komodo Health Unveils New GenAI Offerings](https://www.komodohealth.com/press/komodo-health-unveils-new-generative-ai-offerings-to-enable-real-time-insights-across-330-million-patient-journeys/)
- [Healthcare Data Analytics Democratization with MapAI](https://www.zenml.io/llmops-database/healthcare-data-analytics-democratization-with-mapai-and-llm-integration)
- [Insights from Building a Conversational Assistant — Komodo Health](https://www.komodohealth.com/perspectives/insights-from-building-a-conversational-assistant/)
- [Top 5 LangGraph Agents in Production 2024 — Honourable Mention](https://blog.langchain.com/top-5-langgraph-agents-in-production-2024/)

---

### 4. AppFolio
**HQ:** Santa Barbara, CA, USA  
**Size:** ~1,800 employees; public (NASDAQ: APPF)  
**Sector:** Property Management SaaS (Real Estate)

#### Agent Deployment
AppFolio built **Realm-X Assistant** using LangGraph and LangSmith — a production AI copilot saving property managers over **10 hours per week** by handling:

- Natural language queries against property management data
- Bulk messaging to residents and vendors
- Scheduling, billing, work orders, and unit management

Key engineering decisions: parallel branch execution for action determination, fallback handling, and QA bots. LangSmith used for production monitoring (error rates, cost, latency), dynamic few-shot prompting (lifted text-to-data accuracy from ~40% to ~80%), and CI-integrated evaluation.

**Framework:** LangGraph (migrated from LangChain); LangSmith for observability

#### Why They Care About Runtime Security
Realm-X agents act on behalf of property managers against live tenant data, financial records, and vendor accounts. An agent that executes an unintended bulk message, modifies billing records erroneously, or can be manipulated via injected content in a vendor message is an immediate customer trust and legal liability risk. AppFolio operates in a regulated environment (fair housing laws, financial data) and is a public company with investor scrutiny on product reliability.

#### Contact Approach
- **VP of Engineering** or **Director of AI/ML** — AppFolio has a documented AI engineering team
- The LangChain case study blog is authored by named AppFolio engineers — warm outreach vector
- **NARPM** (National Association of Residential Property Managers) or **NAA Apartmentalize** are target venues

#### Public References
- [LangChain Customer Case Study: AppFolio](https://blog.langchain.com/customers-appfolio/)
- [Top 5 LangGraph Agents in Production 2024 — #4 AppFolio](https://blog.langchain.com/top-5-langgraph-agents-in-production-2024/)
- [Realm-X Innovation Spotlight — AppFolio](https://www.appfolio.com/articles/realm-x-innovation-spotlight)

---

### 5. Replit
**HQ:** San Francisco, CA, USA  
**Size:** ~150 employees; private (raised $97M+ to date)  
**Sector:** Developer Tools / Cloud IDE

#### Agent Deployment
Replit Agent is a **production multi-agent system** (ranked #1 in LangChain's 2024 LangGraph production survey) that converts natural language prompts into fully deployed applications. Architecture:

- **Planning agent** — decomposes user intent
- **Code agent** — writes and modifies code
- **Package agent** — manages dependencies
- **Deployment agent** — pushes to production infrastructure

Features horizontal scaling, task queues, automatic retries, and human-in-the-loop review steps. LangSmith is used for trace visibility across hundreds of steps per trace. Replit's viral launch tested LangGraph at scale limits and directly drove LangSmith roadmap improvements.

**Framework:** LangGraph (primary), LangSmith; agents execute real code in user sandboxes

#### Why They Care About Runtime Security
Replit agents write and execute code in sandboxed environments — but sandboxes are not perfect boundaries. An agent manipulated via prompt injection could generate malicious code, exfiltrate user project data, or exploit the execution environment. At Replit's scale (tens of millions of users), a security incident would be catastrophic. Additionally, Replit's infrastructure becomes a potential attack vector if agent outputs are weaponised. They have both product security and platform security motivations.

#### Contact Approach
- **CTO** or **Head of AI** — Replit's AI team is small and directly reachable
- The LangChain case study is authored by Replit engineers — direct outreach
- **AI Engineer World's Fair** and **GitHub Universe** are natural venues

#### Public References
- [Replit LangGraph Case Study — LangChain](https://www.langchain.com/breakoutagents/replit)
- [Top 5 LangGraph Agents in Production 2024 — #1 Replit](https://blog.langchain.com/top-5-langgraph-agents-in-production-2024/)
- [Building Reliable AI Agents for Application Development](https://www.zenml.io/llmops-database/building-reliable-ai-agents-for-application-development-with-multi-agent-architecture)

---

## Tier 2: Strong Design Partner Candidates

*Well-documented agent deployments in high-stakes domains; clear security motivation; slightly longer sales cycle or earlier-stage AI maturity.*

---

### 6. Harvey AI
**HQ:** San Francisco, CA, USA  
**Size:** ~680 employees (2025); private (valued at $5B as of June 2025)  
**Sector:** Legal Technology / AI for Law Firms

#### Agent Deployment
Harvey is the leading AI platform for global law firms, with 235 customers across 42 countries and 28% of Am Law 100 firms by end-2024. In 2024 it introduced **Harvey Agents** with custom evaluations benchmarking against human lawyers. Key capabilities:

- Document analysis and contract comparison at scale
- Multilingual translation across 40+ jurisdictions
- Case research and legal drafting
- Custom workflow automation for enterprise law firms (A&O Shearman has 4,000 staff on platform)

**Framework:** Built on OpenAI GPT and Anthropic Claude, customised with firm-specific proprietary data; proprietary agent orchestration layer (not publicly disclosed as LangChain/CrewAI, but agentic multi-step workflows are explicit in their product)

#### Why They Care About Runtime Security
Law firms operate under strict duty of confidentiality. Client matter data is among the most legally protected information in existence — privilege, confidentiality, and conflict-of-interest rules apply. A Harvey agent that leaks matter data across client boundaries, or that is manipulated via injected content in a document being analysed, triggers professional responsibility violations, malpractice exposure, and regulatory sanction. Harvey's procurement process for Am Law 100 firms already includes rigorous security review — runtime security is a legitimate differentiator.

#### Contact Approach
- **CTO** or **Head of AI/ML Engineering** — Harvey's engineering leadership is findable via LinkedIn
- Harvey Academy team may also be an entry point for product feedback partnerships
- **ILTA (International Legal Technology Association)** annual conference is the premier venue

#### Public References
- [Harvey 2024 Year in Review Report](https://www.harvey.ai/downloadable/year-in-review/2024/Harvey-2024-year-in-review.pdf)
- [Introducing Harvey Agents](https://www.harvey.ai/blog/introducing-harvey-agents)
- [Harvey + A&O Shearman Customer Story](https://www.harvey.ai/customers/a-and-o-shearman)

---

### 7. PagerDuty
**HQ:** San Francisco, CA, USA  
**Size:** ~900 employees; public (NYSE: PD)  
**Sector:** IT Operations / Incident Management (DevOps)

#### Agent Deployment
PagerDuty's **AI Agent Suite** (launched late 2024) operates inside enterprise production incident response workflows:

- **SRE Agent** — surfaces incident context, recommends and executes diagnostics, creates self-updating runbooks
- **Scribe Agent** — transcribes Zoom calls and Slack conversations into structured incident summaries
- **Shift Agent** — detects and resolves on-call scheduling conflicts autonomously
- **Insights Agent** — analyses historical PagerDuty data for proactive recommendations

Powered by **AWS Bedrock** (proprietary GenAI models, not publicly confirmed as LangChain/AutoGen). Integrated with Logz.io for AI-driven root cause analysis that chains directly to automated Slack notifications and remediation actions.

Reported outcome: up to **50% faster incident resolution** for early adopters.

#### Why They Care About Runtime Security
PagerDuty agents have access to production infrastructure context, runbooks, and in some configurations can execute remediation actions. An agent that misdiagnoses an incident and auto-executes the wrong remediation action (e.g., restarting the wrong service, or being prompted to take an action via injected log content) could *cause* an outage rather than resolve one. This is a direct product liability risk. Additionally, PagerDuty serves critical infrastructure (banks, hospitals, telcos) — their customers' CISOs will ask how PagerDuty's agents are secured.

#### Contact Approach
- **Chief Product Officer** or **VP of AI Engineering**
- PagerDuty publishes a regular AI/agentic AI survey — their research team is an accessible entry point
- **PagerDuty Summit** (annual conference) or AWS re:Invent (where they announced 2024 AI features)

#### Public References
- [PagerDuty Debuts New AI Features for Incident Response](https://siliconangle.com/2024/10/08/pagerduty-debuts-new-ai-features-incident-response-platform/)
- [PagerDuty + AWS: Transforming Digital Operations with AI](https://aws.amazon.com/isv/case-studies/how-pagerduty-and-aws-transform-digital-operations-with-ai/)
- [PagerDuty Agentic AI Survey 2025](https://www.pagerduty.com/newsroom/agentic-ai-survey-2025/)

---

### 8. Abridge
**HQ:** Pittsburgh, PA, USA  
**Size:** ~200 employees; private (raised $250M in Feb 2025 at reported $850M+ valuation)  
**Sector:** Healthcare AI / Clinical Documentation

#### Agent Deployment
Abridge is the market share leader in ambient AI clinical documentation. In production across 150+ health systems including UPMC, Yale New Haven, and Kaiser Permanente:

- Real-time transcription of clinician-patient conversations
- Automated clinical note generation across 55+ specialties in 28 languages
- **Contextual Reasoning Engine** for revenue cycle, prior authorisation, and order workflows
- EHR integration (primary: Epic), with notes pushed directly to patient records

Processes **50 million conversations per year**. Proprietary "Ears" AI system (custom medical speech recognition + clinical note generation). Provenance tracking allows clinicians to validate every note element against audio.

**Framework:** Proprietary (custom-built for medical accuracy); not publicly disclosed as LangChain/CrewAI, but the Contextual Reasoning Engine represents multi-step agentic reasoning

#### Why They Care About Runtime Security
Clinical notes become part of the permanent medical record — errors, hallucinations, or manipulation of Abridge's output have direct patient safety implications. A prompt injection via a malicious phrase spoken in a patient encounter (however unlikely) that alters a clinical note is a class of risk that healthcare CISOs take seriously. HIPAA, HITECH, and state medical record laws create significant legal exposure. Abridge's buyers (large health systems with in-house legal and compliance teams) demand rigorous security attestation. Runtime security tooling that demonstrates real-time behavioural monitoring of their AI pipeline would strengthen their compliance narrative.

#### Contact Approach
- **CTO** (Abridge is an engineering-first company; CTO is a direct decision-maker)
- **Head of Clinical AI** or **Head of Safety**
- **HIMSS** and **HLTH** conferences are premier venues; Abridge presents regularly
- NEJM AI publication is a credibility signal — engagement via the academic/clinical angle works

#### Public References
- [How Abridge Became One of the Most Talked-About Healthcare AI Startups — TechCrunch](https://techcrunch.com/2024/06/18/how-abridge-became-one-of-the-most-talked-about-healthcare-ai-startups/)
- [Building Trusted Healthcare AI — Abridge Blog](https://www.abridge.com/blog/building-trusted-healthcare-ai)
- [The Engineering Behind Healthcare LLMs with Abridge](https://www.outofpocket.health/p/the-engineering-behind-healthcare-llms-with-abridge)

---

### 9. Atlassian
**HQ:** Sydney, NSW, Australia 🇦🇺  
**Size:** ~12,000 employees; public (NASDAQ: TEAM)  
**Sector:** Developer Tools / Enterprise Collaboration SaaS

#### Agent Deployment
Atlassian's **Rovo** platform reached General Availability in late 2024–2025, deploying agents across Jira, Confluence, Jira Service Management, Bitbucket, and Talent:

- **20+ out-of-the-box agents** for code generation, OKR creation, translation, Databricks querying
- **Custom agents via Rovo Studio** — no-code agent builder for enterprise-specific workflows
- **Rovo Dev** — coding agent (GA 2025) for bug fixes, code reviews, refactoring; integrates with GitHub and Bitbucket
- **AIOps in Jira Service Management** — agents for service operations and incident triaging
- Long-running workflows (days/weeks) with human-in-the-loop controls

**Framework:** Atlassian Intelligence (proprietary platform); Model Context Protocol (MCP) integrations with GitHub, Figma, Box, HubSpot planned

#### Why They Care About Runtime Security
Rovo agents have access to every piece of organisational knowledge in the Atlassian ecosystem — Jira tickets, Confluence pages, code repositories, HR data (via Talent), and customer service records. A Rovo agent acting on behalf of a user could expose confidential project data, commit code with security vulnerabilities, or be manipulated via content injected into a Confluence page. For enterprise customers (banks, government, defence contractors), this is a CISO-level concern. Atlassian's Trust & Security team is already large and active — they are predisposed to engage with security tooling that addresses agent-specific gaps.

#### Contact Approach
- **Chief Security Officer (CSO)** or **Head of AI Trust & Safety**
- Atlassian's AI engineering team presents regularly at **Team Summit** and **Atlassian events**
- Australian presence: HQ in Sydney — a warm local introductory meeting is feasible

#### Public References
- [Atlassian Rovo AI Agents at Work — Atlassian Blog](https://www.atlassian.com/blog/announcements/rovo-ai-agents-at-work)
- [Rovo Dev: The Coding Agent — Atlassian](https://siliconangle.com/2025/10/08/atlassian-gives-rovo-ai-major-upgrade-developers-new-tools/)
- [Jira Service Management Agentic AI — Atlassian](https://www.atlassian.com/blog/announcements/jira-service-management-agentic-ai)

---

### 10. ANZ Banking Group
**HQ:** Melbourne, VIC, Australia 🇦🇺  
**Size:** ~40,000 employees; public (ASX: ANZ)  
**Sector:** Retail & Commercial Banking (Regulated)

#### Agent Deployment
ANZ is the first Australian bank to deploy large-scale AI agents via **Salesforce Agentforce**, rolling out to business bankers with:

- Consolidation of data from **20 internal systems** into a single agentic interface
- Real-time customer insights and account summaries for relationship managers
- Task automation reducing manual lookup time — estimated saving of approximately **one working month per year** per banker
- First large-scale Agentforce deployment in Asia-Pacific

**Framework:** Salesforce Agentforce (proprietary; built on Atlas Reasoning Engine and Agentforce Platform)

#### Why They Care About Runtime Security
ANZ operates under APRA CPS 234 (information security), the Privacy Act, and ASIC regulatory oversight. Their agents have access to customer financial records across 20 banking systems. A misbehaving agent (whether through model error, prompt manipulation, or tool misuse) that exposes customer data, executes an unauthorised transaction, or gives incorrect financial guidance triggers immediate regulatory exposure. APRA's operational risk requirements demand demonstrable controls over AI systems. AgentGuard-style runtime monitoring would directly support ANZ's APRA attestation obligations.

#### Contact Approach
- **Chief Information Security Officer (CISO)** or **Head of AI Risk & Governance**
- **Head of Technology Transformation** — ANZ has a named executive for digital/AI change programmes
- Warm entry via **FST Media** (Financial Services Technology) or **FINSIA** events in Australia
- Salesforce relationship team at ANZ is also an indirect warm path

#### Public References
- [ANZ Rolls Out AI Agents for Business Bankers — Computer Weekly](https://www.computerweekly.com/news/366638802/ANZ-rolls-out-AI-agents-for-business-bankers)
- [Australia's Banking Giants Accelerate into Agentic Intelligence](https://www.ausbizconsulting.com.au/posts/australias-banking-giants-accelerate-into-generative-ai-and-agentic-intelligence)

---

### 11. Commonwealth Bank of Australia (CBA)
**HQ:** Sydney, NSW, Australia 🇦🇺  
**Size:** ~50,000 employees; public (ASX: CBA)  
**Sector:** Retail & Commercial Banking (Regulated)

#### Agent Deployment
CBA has the most advanced public AI programme of any Australian bank. In production since 2024:

- **Compass AI** — GenAI assistant for business bankers, answering queries from internal knowledge bases **3× faster** than traditional methods; 500,000+ questions handled since July 2024
- **Customer Engagement Engine (CEE)** — ML system handling personalised customer interactions at scale
- **ChatGPT Enterprise** rollout across 27,600+ staff (in collaboration with OpenAI)
- **AI factory** built with AWS since 2023, accelerating GenAI deployment
- Ranked **#5 globally in AI maturity for banking** (Evident AI Index 2024)

**Framework:** AWS Bedrock and OpenAI APIs (proprietary orchestration); Compass AI's internal architecture is not publicly disclosed

#### Why They Care About Runtime Security
CBA is subject to APRA CPS 234, AUSTRAC anti-money-laundering obligations, and the Australian Privacy Act. They have publicly committed to six AI governance principles including reliability, security, and accountability. Their 2025 AI adoption report explicitly calls out the need for ongoing monitoring and guardrails. With 50,000+ employees and millions of customers in the loop, a rogue agent behaviour at CBA scale is not a minor incident — it's a front-page event. CBA's in-house AI governance and risk teams actively evaluate tooling that supports their regulatory posture.

#### Contact Approach
- **Chief AI Officer** or **Executive General Manager, Data & AI**
- **CISO** for security-framing conversations
- Warm entry via **AWS partnership** or **Australian Computer Society (ACS)** events
- CBA publishes an annual AI report — the team producing that report is the right stakeholder

#### Public References
- [CBA Announces Australia-First AI Plan — CyberDaily](https://www.cyberdaily.au/digital-transformation/13188-cba-announces-australia-first-ai-plan-but-has-it-learned-from-its-mistakes)
- [CBA Our Approach to Adopting AI — December 2025 Report](https://www.commbank.com.au/content/dam/commbank-assets/about-us/docs/our-approach-to-adopting-ai-december-2025.pdf)
- [Evident AI Banking AI Maturity Report — CBA #5](https://evidentinsights.com/bankingbrief/banks-ai-hiring-surge/)

---

## Tier 3: Pipeline Targets (Strong Long-Term Fit)

*Validated production deployments; slightly less public technical detail or longer path to security-specific procurement, but represent important market segments and geographic diversity.*

---

### 12. Macquarie Bank
**HQ:** Sydney, NSW, Australia 🇦🇺  
**Size:** ~6,000 employees (Bank division); public via Macquarie Group (ASX: MQG)  
**Sector:** Retail & Business Banking / Wealth Management (Regulated)

#### Agent Deployment
Macquarie Bank has arguably the most ambitious AI agent programme of any Australian bank:

- **Q AI Agent** — Customer-facing 24/7 agent for account queries and service requests ("Macquarie Intelligence"), with 30+ AI-augmented products planned for 2025
- **Gemini Enterprise** rollout — All Australian retail banking employees received Google Gemini for Personal Agents (document summarisation, research, drafting) and Enterprise Agents (code generation, client conversation summaries, system design)
- 99% employee training completion rate; 3,000+ internal AI demos conducted

**Framework:** Google Cloud Vertex AI / Gemini Enterprise (proprietary Google infrastructure)

#### Why They Care About Runtime Security
Same APRA/Privacy Act obligations as ANZ and CBA. Additionally, Macquarie's wealth management division handles ultra-high-net-worth client portfolios — agent errors or data leakage in that segment carry extreme reputational and legal risk. Their Q agent is customer-facing, making runtime behavioural monitoring a product differentiator, not just an internal control.

#### Contact Approach
- **Chief Data, Digital and AI Officer** (named appointment: Ashwin Sinha, October 2025)
- **Head of Technology Risk** — Macquarie is an engineering-culture bank; risk and engineering co-own AI governance

#### Public References
- [Macquarie Bank Rolling Out Agentic AI — Technology Decisions](https://www.technologydecisions.com.au/content/it-management/news/macquarie-bank-rolling-out-new-agentic-ai-capabilities-1753041739)
- [Macquarie Bank Rolls Out AI Agent to Personalise Customer Support — Computer Weekly](https://www.computerweekly.com/news/366637713/Macquarie-Bank-rolls-out-AI-agent-to-personalise-customer-support)
- [Macquarie + Google Cloud Press Release](https://www.googlecloudpresscorner.com/2025-10-09-Macquarie-Bank-Democratizes-Agentic-AI,-Scaling-Customer-Innovation-with-Gemini-Enterprise)

---

### 13. LinkedIn (Microsoft)
**HQ:** Sunnyvale, CA, USA  
**Size:** ~20,000 employees; subsidiary of Microsoft (NASDAQ: MSFT)  
**Sector:** Professional Networking / B2B SaaS

#### Agent Deployment
LinkedIn was named by LangChain as one of a small group of companies using **LangGraph in production** in 2024. The specific use cases focus on professional networking enhancements and internal tooling. LinkedIn's broader AI portfolio includes AI-powered job matching, content recommendation, and hiring workflow automation deployed at scale (1B+ users).

**Framework:** LangGraph confirmed; specific internal applications not fully disclosed

#### Why They Care About Runtime Security
At LinkedIn's scale, an agent that misbehaves in user-facing workflows — whether surfacing inappropriate content, leaking private profile data, or being manipulated to generate misleading professional recommendations — is both a trust-and-safety and regulatory issue. The EU AI Act and GDPR create specific obligations around automated decision-making in employment contexts. LinkedIn's Trust & Safety team is one of the most sophisticated at any social platform.

#### Contact Approach
- **VP of Engineering, AI Platform** or **Head of Trust & Safety Engineering**
- Microsoft/LinkedIn AI teams are active at **GitHub Universe**, **Microsoft Build**, and **NeurIPS**

#### Public References
- [Is LangGraph Used in Production? — LangChain Blog](https://blog.langchain.com/is-langgraph-used-in-production/)
- [LangChain State of AI Agents Report 2024](https://blog.langchain.com/langchain-state-of-ai-2024/)

---

### 14. Klarna
**HQ:** Stockholm, Sweden  
**Size:** ~5,000 employees (post-restructuring); public (NYSE: KLAR, IPO 2024)  
**Sector:** Buy Now Pay Later / Consumer Fintech (Regulated)

#### Agent Deployment
Klarna deployed an OpenAI-powered AI customer service agent at extraordinary scale:

- **2.3 million customer chats** handled in the first month of deployment (early 2024)
- Resolution in **2 minutes vs. 11 minutes** for human agents
- Equivalent workload of **700 full-time agents**
- Deployed across 35+ languages for simple payment queries, status checks, and FAQ resolution
- Guardrails: whitelisted data sources (help centre + customer accounts only), mandatory human handoff for fraud, disputes, and account access issues

**Framework:** OpenAI API direct (not publicly confirmed as LangChain/AutoGen); robust custom guardrail architecture

#### Why They Care About Runtime Security
Klarna's agent has access to live customer financial accounts. Klarna is regulated in Sweden, the EU (PSD2), and multiple US states. Their guardrail architecture (whitelisting, mandatory handoffs) is evidence they have already experienced or anticipated the exact attack vectors AgentGuard addresses. By 2025 they had pivoted to a human-AI hybrid model after encountering quality issues — a design partner conversation about what runtime visibility they wished they had would be highly productive. Additionally, Klarna's recent NYSE IPO puts them under intense scrutiny on AI governance.

#### Contact Approach
- **Chief Technology Officer** or **VP of AI Engineering**
- **Head of Risk & Compliance** — PSD2 and GDPR create specific regulatory hooks
- **Money20/20** (Europe or USA) is the ideal venue — Klarna is a fixture there

#### Public References
- [Klarna Customer Service: From AI-First to Human-Hybrid Balance — PromptLayer](https://blog.promptlayer.com/klarna-customer-service-from-ai-first-to-human-hybrid-balance/)
- [Klarna AI Customer Service Lessons — PolyAI](https://poly.ai/blog/klarna-ai-customer-service-lessons)
- [Klarna AI Press Coverage — Reuters, Bloomberg (multiple, 2024)](https://www.reuters.com/technology/klarna-says-its-ai-assistant-does-work-700-people-2024-02-27/)

---

### 15. Morgan Stanley
**HQ:** New York, NY, USA  
**Size:** ~80,000 employees; public (NYSE: MS)  
**Sector:** Investment Banking / Wealth Management (Regulated)

#### Agent Deployment
Morgan Stanley has achieved the deepest production AI adoption of any major investment bank:

- **AI @ Morgan Stanley Assistant** — GPT-4-powered LLM querying 100,000+ internal documents; **98% adoption rate** among 16,000+ financial advisor teams
- **Parable** — AI for data analysis and report summarisation in production
- Expansion into banking, risk, and role-specific copilots underway
- Pre-deployment testing framework for every AI use case before production rollout

**Framework:** OpenAI GPT-4 (direct API); proprietary orchestration developed with OpenAI partnership; not disclosed as LangChain/AutoGen but represents agentic RAG at institutional scale

#### Why They Care About Runtime Security
Morgan Stanley advisors use the AI Assistant to surface and act on client data across 100,000 internal documents. A single instance of an agent cross-contaminating client data (e.g., surfacing one client's portfolio detail to an advisor serving a different client) constitutes a material regulatory breach under SEC, FINRA, and fiduciary duty rules. Morgan Stanley's rigorous pre-deployment testing process is evidence of security awareness — but static testing doesn't catch runtime manipulation or emergent behaviours. Their Chief Risk Officer and CISO teams are natural stakeholders.

#### Contact Approach
- **Head of Applied AI** or **Chief Data Officer**
- **Chief Information Security Officer (CISO)** for the security framing
- Morgan Stanley presents at **OpenAI DevDay**, **Fortune CEO Summit**, and major banking conferences; their AI team leaders are publicly named
- Warm path via the Morgan Stanley / OpenAI partnership relationship

#### Public References
- [Morgan Stanley AI @ Morgan Stanley Assistant — Business Insider](https://www.businessinsider.com/wall-street-banks-ai-strategy-jpmorgan-goldman-citi-bofa-2025)
- [Training the Street: State of AI in Finance 2025](https://trainingthestreet.com/the-state-of-ai-in-finance-2025-global-outlook/)

---

## Strategic Analysis

### Why These Companies, Why Now

The convergence of three factors creates an urgent and receptive audience for AgentGuard:

1. **Production velocity outpacing security**: All 15 companies above have moved agents into production faster than they have developed corresponding security controls. LangSmith and similar observability tools track *what happened* — they do not prevent or intercept *what is happening*.

2. **Regulatory gravity**: Finance companies face APRA (AU), SEC/FINRA (US), and PSD2/GDPR (EU). Healthcare companies face HIPAA. Legal platforms face professional conduct rules. Every regulated company on this list has a compliance function that will eventually mandate runtime security for AI agents — the question is when, not if.

3. **Incident awareness is rising**: OWASP's 2025 Top 10 for GenAI explicitly lists agent behaviour hijacking, prompt injection, and tool misuse as top risks. The GitHub Copilot RCE (CVE-2025-53773) and multiple documented healthcare AI manipulations have moved these from theoretical to real in the minds of enterprise CISOs.

### Prioritisation Framework

| Priority | Company | Rationale |
|----------|---------|-----------|
| **1** | Uber | Most sophisticated LangGraph deployment; documented security agents; large engineering org that can run a pilot at scale |
| **2** | Elastic | Sells security products; agents in SOC environments; brand alignment with AgentGuard's value proposition |
| **3** | Komodo Health | Highest regulatory exposure; HIPAA creates procurement mandate for security controls; named engineering team reachable |
| **4** | ANZ Banking Group | Australian HQ advantage; APRA mandate; first-mover in Agentforce creates urgency |
| **5** | Abridge | $250M raise with healthcare systems as buyers who demand security attestation; clinical stakes highest of all |
| **6** | AppFolio | Smaller scale = faster design partner cycle; named LangGraph engineers = direct outreach |
| **7** | Replit | Agent execution at scale; developers are the audience; security is existential to platform trust |

### Recommended Outreach Sequencing

**Phase 1 (Months 1–3):** Target Tier 1 companies with warm technical outreach — specifically the named engineers in LangChain/LangGraph case studies. These are practitioners, not gatekeepers, and they own the exact problems AgentGuard solves.

**Phase 2 (Months 3–6):** Leverage any Tier 1 relationships to open Tier 2 doors, particularly the Australian banking targets (ANZ, CBA, Macquarie) where a reference from a credible US tech company carries significant weight.

**Phase 3 (Months 6–12):** Approach Morgan Stanley and Klarna — these require more enterprise sales motion and benefit from a case study or proof-of-concept from earlier design partners.

### Key Objections to Prepare For

- *"We have LangSmith / observability already"* → AgentGuard provides runtime *intervention*, not just observation. Tracing is forensics; runtime security is prevention.
- *"Our agents are sandboxed"* → Sandboxes prevent escapes; they don't prevent agents from being manipulated to take harmful actions *within* their authorised scope.
- *"We review agent outputs before they act"* → Human-in-the-loop works for low-volume, low-urgency tasks. At Klarna's 2.3M chats/month or Uber's code migration scale, HITL is not operationally viable at every decision point.

---

## Appendix: AI Agent Security Threat Landscape

*Context for conversations with design partners about why runtime security is now a first-class concern.*

The OWASP 2025 Top 10 for Agentic AI (released December 2025) identifies the following as primary risks in production agent deployments:

- **LLM01: Prompt Injection** — Attackers embed instructions in data, emails, or documents that override the agent's intended behaviour. Success rates of 50–84% in tested environments.
- **Agent Behaviour Hijacking** — Malicious inputs cause agents to pursue different goals than intended, including data exfiltration and privilege escalation.
- **Tool Misuse / Domino Effect** — Agents with broad tool access can be manipulated into cascading actions that damage production systems.
- **Unauthorized Data Access** — Agents that query databases or APIs can be prompted to retrieve and expose information outside their intended scope.

Documented real-world incidents include:
- Medical AI manipulation via instructions hidden in lab reports and medical images (Nature study, 2024)
- GitHub Copilot RCE via prompt injection editing configuration files (CVE-2025-53773)
- 97% of organisations reported GenAI security incidents; 80% observed risky agent behaviours (industry survey, 2025)

**The gap:** Existing defences (LangSmith, HITL, input filtering, sandboxing) are necessary but insufficient. None provide real-time, in-flight behavioural monitoring that can intercept anomalous agent actions before they complete. That is the runtime security gap AgentGuard addresses.

---

*Document classification: Confidential — AgentGuard internal use only*  
*Research basis: Public sources, published case studies, engineering blogs, conference talks, and company announcements. All citations sourced from verified public materials.*  
*Next review: Update after initial outreach phase (90 days)*

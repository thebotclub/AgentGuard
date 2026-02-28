# AgentGuard — Vision & Scope
## Product Vision Document v1.0
### Confidential — February 2026

---

> *"Every company deploying AI agents will need AgentGuard — the same way every company with a network needed a firewall."*

---

## 1. Product Vision

### Mission Statement

AgentGuard's mission is to make AI agents safe to deploy at enterprise scale — providing the runtime security layer that monitors, constrains, and audits autonomous AI agents across any framework, so that organisations can capture the transformative value of agentic AI without accepting catastrophic, uncontrollable risk. We are building the category-defining security infrastructure for the agentic era: the firewall, SOC, and compliance engine that enterprises will rely on as AI agents become as ubiquitous as employees.

---

### 3-Year Vision: The World With AgentGuard

By early 2029, the question "can we deploy this agent safely?" has a clear answer: *"Is AgentGuard on it?"*

**Developers** don't think twice about agent security. They add one import, declare a policy file, and push to production — knowing that AgentGuard handles the rest the same way Let's Encrypt handled TLS: invisibly, correctly, and without charging for every cert renewal. The developer community has organically developed thousands of shared policy templates on the AgentGuard policy registry, the same way Snort rules and OPA policies became community standards. "AgentGuard Rules" is the lingua franca of agent constraints.

**Enterprise security teams** have real visibility into their agent fleets. The CISO at a Fortune 500 bank can open a single dashboard and see 3,000+ agents across six business units — what they accessed, what they blocked, what anomalies surfaced yesterday — the same way they view their endpoint fleet in CrowdStrike. Agent threats are routed into Splunk and Microsoft Sentinel as enriched, actionable alerts, not raw telemetry dumps. Agent incidents have playbooks. The AI risk section of the board deck writes itself.

**Regulated industries** have a clear path to compliance. EU AI Act Article 9 (risk management), Article 12 (logging), Article 14 (human oversight), and Article 15 (robustness) are all met with AgentGuard's default configuration. Healthcare organisations deploying clinical AI agents have HIPAA audit trails that survive OCR investigations. Financial firms subject to DORA can demonstrate ICT resilience for their AI-powered trading and risk systems. AgentGuard's pre-built compliance packages reduce regulatory prep from months to days.

**The category is real.** "AI agent security" is a recognised line item in enterprise security budgets, the way cloud security and endpoint detection became distinct from general IT. AgentGuard sits at the centre: framework-agnostic, model-agnostic, cloud-agnostic — the Switzerland of agent security infrastructure.

---

### Core Value Propositions

#### For Developers
- **Ship faster, break less.** Policy as code means security doesn't slow you down — it catches problems before they reach production. Five-minute integration with LangChain, AutoGen, CrewAI, or raw OpenAI SDK calls.
- **Don't become a headline.** Guardrails enforce what your agent is *supposed* to do — catching drift, injection, and out-of-scope tool use before a journalist does.
- **Sensible defaults, full control.** Community policy templates for common use cases (customer service agents, code agents, data analysis agents). Override anything. Version control everything.

#### For CISOs
- **See your whole agent fleet.** For the first time, a unified view of every agent action, risk score, and policy violation across the organisation — not scattered logs across 12 different tools.
- **Prove you're in control.** Board-ready AI risk reports, regulatory evidence packages, and a contractual performance SLA (<50ms p99) that stands behind the security claim.
- **Stop the worst cases.** Kill switch and human-in-the-loop gates for high-risk actions. Configurable fail-closed/fail-open per agent tier. Automatic circuit breakers when anomalies spike. Real-time containment, not post-incident forensics.

#### For Compliance Teams (GRC / DPO)
- **Regulation is a product feature, not an afterthought.** Pre-built compliance reports for EU AI Act, SOC 2, ISO 42001, HIPAA, PCI-DSS v4.0, DORA, and NIS2 — generated from the same audit trail you'd have anyway.
- **Evidence that survives scrutiny.** Tamper-evident, cryptographically chained logs. Court-admissible forensic chain of custody. Regulators ask, you produce — not scramble.
- **Stay ahead of the rules.** Regulatory change management built in. When the EU AI Act implementing acts update, AgentGuard policy templates update. You don't re-build your compliance programme from scratch.

---

## 2. Problem Statement

### The Core Gap

AI agents are going to production. They are booking flights, executing trades, managing infrastructure, writing and deploying code, and interacting with customers — with real-world consequences, in real time, at scale. And there is **no security layer** between "the agent was given a task" and "the agent did something catastrophic."

This isn't a hypothetical. It's already happening with chatbots — which are agents with training wheels. When agents get tool access, the blast radius increases by orders of magnitude.

---

### Pain Points — With Real Examples

#### Pain Point 1: Zero Runtime Visibility

When an agent takes an action, current tooling records *that* it happened — not *why*, not *whether it should have*, and not *what the chain of reasoning was that led there*. A LangChain agent calling a Stripe API to issue a refund produces a log entry that looks identical whether the refund was legitimate or the result of prompt injection. Existing SIEM tools (Splunk, Microsoft Sentinel, Chronicle) were built to correlate network events, authentication logs, and endpoint telemetry — they have no concept of "agent reasoning chain" or "did this action deviate from the agent's declared intent."

**Real example:** DPD's customer service chatbot was prompt-injected by a user in December 2023, causing it to swear at customers and criticise DPD publicly. The incident was discovered not by monitoring, but because the user posted a screenshot on social media. A deployed agent with tool access — the ability to issue refunds, cancel orders, escalate to human queues — running the same vulnerability would cause *operational* damage, not just reputational.

**Real example:** Air Canada was held liable in February 2024 for a false promise made by their chatbot regarding bereavement fares. The Canadian Civil Resolution Tribunal ruled that Air Canada was responsible for its agent's output. Future cases involving agents that execute transactions will carry the same liability — but with financial consequences attached to every action.

#### Pain Point 2: No Policy Enforcement Layer

Developers building agents define what the agent *should* do in a system prompt. There is no enforcement mechanism. If the model drifts, misinterprets, or is manipulated, there is nothing between the agent's decision and the tool call that executes it. This is the equivalent of building a web application with no input validation — trusting that the user will only do what they're supposed to do.

**Real example:** Chevrolet's AI assistant was manipulated by a user in December 2023 into agreeing to sell a car for $1 by presenting the transaction as a "legally binding offer" within the conversation. The agent had no policy layer checking whether the proposed action was within its operational scope.

**The developer pain:** A developer at a Series B fintech deploying an accounts-payable automation agent cannot write a system prompt that reliably enforces "never approve a payment over $50,000 without human review." The LLM will comply most of the time. It will fail under adversarial conditions, novel edge cases, and when a bad actor specifically probes its boundaries. Policy enforcement needs to be *outside* the model, not embedded in it.

#### Pain Point 3: Compliance Evidence Doesn't Exist

EU AI Act enforcement began August 2025. Articles 9, 12, 13, 14, and 15 collectively require risk management systems, human oversight mechanisms, transparency measures, and robustness controls for high-risk AI systems. Enterprises deploying agents in healthcare, finance, HR, and critical infrastructure almost certainly trigger high-risk classification.

When a regulator asks "show me your AI oversight controls," the current state of play at most enterprises is: *"We have the model provider's terms of service and a system prompt that we wrote in Notion."* That is not a compliance programme. It is not a risk management system. It will not satisfy Article 9.

**The GRC pain:** A Data Protection Officer at a German bank deploying AI agents for credit decisioning needs documented risk assessments, human oversight logs, and audit trails showing every agent decision — not because their engineers didn't try to build this, but because no standard tooling exists to produce it. They're being asked to demonstrate ISO/IEC 42001 compliance with spreadsheets and meeting notes.

#### Pain Point 4: Multi-Agent Cascade Risk

Individual agent behaviour is hard enough to govern. When agents interact — in CrewAI crews, AutoGen conversations, LangChain pipelines with sub-chains — the failure modes compound. An agent compromised by prompt injection can *instruct downstream agents*. An agent "fixing" another agent's mistake can trigger a cascade that no individual agent initiated.

**Hypothetical (plausible) example:** An infrastructure management agent detects a high memory process and kills it to free resources. A second monitoring agent detects the service went down and attempts to restart it. The first agent detects the restarted process consuming memory and kills it again. Within minutes, seven agents are cycling a critical database service, producing a production outage. No individual agent violated its policy. The failure is emergent and systemic.

No existing monitoring tool understands agent-to-agent communication well enough to detect this class of failure.

---

### Why Existing Solutions Are Insufficient

| Solution Category | What It Does | Why It Fails for Agents |
|---|---|---|
| **SIEM / SOAR** (Splunk, Microsoft Sentinel, CrowdStrike) | Correlates infrastructure, network, and endpoint events | Sees the API call; doesn't understand the agent intent behind it. Can't reason about whether a Stripe API call was legitimate or the result of injection. Has no concept of "reasoning chain." |
| **Model Safety** (Anthropic Constitutional AI, OpenAI moderation) | Builds safer models at training time | Model-level safety is a starting point, not an endpoint. A safe model deployed in an unsafe agentic architecture (over-permissioned tools, no runtime constraints) still produces dangerous outcomes. Safety at the weights level ≠ security at the deployment level. |
| **Prompt Security** (Lakera Guard, Rebuff) | Detects and blocks prompt injection at input | Single attack vector, single integration point. Doesn't cover: reasoning drift, tool parameter manipulation, policy enforcement, cross-agent threats, audit compliance, or goal drift over long chains. A necessary layer, not a sufficient one. |
| **API Gateways** (Kong, Apigee, AWS API Gateway) | Rate limiting, authentication, routing for APIs | No understanding of agent context. Rate limiting a Stripe call doesn't help if you don't know whether the agent *should* be making that call. Governance without intent is noise. |
| **GRC Platforms** (Vanta, Drata, Secureframe) | Compliance automation for traditional IT controls | Generates evidence for SOC 2 and ISO 27001 — controls designed for human-operated systems. Has no agent-specific control framework, no real-time monitoring capability, no runtime enforcement. Generates the *framework* but not the *evidence* for AI-specific regulations. |
| **Cloud Security** (Wiz, Orca) | Posture management for cloud infrastructure | Excellent for misconfigurations, vulnerabilities, and cloud resource exposure. Zero coverage of agent behaviour, reasoning, or policy enforcement. |

**The structural gap:** Every existing tool secures either the *infrastructure* the agent runs on, the *model* that powers it, or the *input* it receives. None secure the *runtime behaviour* of the agent itself — the intent, reasoning, tool calls, outputs, and decisions made autonomously in production.

---

### The "Hair on Fire" Moment — By Persona

**Developer:** It's 11 PM. A customer emails saying your AI agent sent them a refund confirmation for $4,200 — an order they never made. You check the logs. The agent called your payment API. The parameters look valid. You have no idea whether this was legitimate, a bug, or the result of someone manipulating the agent through a crafted support ticket. You have no audit trail of *why* the agent made that call. You're about to wake up your CTO.

**CISO:** Your quarterly board presentation is tomorrow. The board deck has a slide on AI risk — added by the CFO after reading about the SEC's new cybersecurity disclosure rules. You have 200+ agents deployed across six departments. You cannot tell the board what those agents accessed last month, whether any of them touched customer PII in a non-compliant way, or whether any of them were manipulated. You have nothing to put on that slide. The meeting is at 9 AM.

**GRC/Compliance Lead:** Your company's external auditor just sent a pre-audit questionnaire with a new section: "AI System Controls." The questions include: "Describe your human oversight controls for AI decision-making," "Provide evidence of AI system logging covering the past 12 months," and "Demonstrate your risk assessment process for high-risk AI applications." Your deadline is three weeks. Your current documentation consists of Confluence pages and a shared Notion workspace last updated eight months ago.

**Platform Engineer:** Your team just onboarded the fifth internal team deploying agents on your platform. Each team is using a different framework: LangChain, AutoGen, direct OpenAI API, Anthropic Claude SDK, and a custom wrapper. Each is doing secrets management differently, logging differently, and handling errors differently. You have no unified view of agent behaviour across the platform. When something goes wrong — and it will — you'll spend days correlating disparate logs to reconstruct what happened.

---

## 3. Target Users & Personas

---

### Persona 1: The Developer Building Agents

**Title:** Senior Software Engineer / AI Engineer / ML Engineer  
**Company Stage:** Series A–C startup or enterprise innovation team  
**Age:** 25–38  
**Tools:** LangChain, AutoGen, CrewAI, OpenAI SDK, Python, VS Code, GitHub, Datadog

#### Goals
- Ship agents to production quickly and confidently
- Not spend time building custom guardrails, monitoring, or logging infrastructure
- Prove the agent works safely in staging before the CISO blocks production deployment
- Have a clear answer when asked "what happens if the agent does something wrong?"
- Not get paged at 2 AM because an agent went rogue

#### Frustrations
- System prompts are not reliable policy enforcement — they break under adversarial conditions
- Building custom logging for agent actions is tedious and non-standard across frameworks
- Security review blocks production deploys because there's no evidence of controls
- Debugging agent failures requires reconstructing intent from incomplete logs
- Every team re-invents the same guardrail wheel

#### Day in the Life
7:30 AM: Pulls overnight run results. Three agent invocations failed with ambiguous errors — unclear whether they were blocked by the model, failed on tool calls, or hit rate limits. Spends 45 minutes correlating logs across Datadog, CloudWatch, and the framework's built-in verbose logging.

10:00 AM: Security review meeting for the upcoming production agent deployment. CISO team asks about data access controls, audit logging, and human oversight. Developer has answers for the first — they carefully scoped tool permissions. The second and third? "We log to CloudWatch" and "it's LLM-based, so it's probabilistic." Meeting ends without approval.

2:00 PM: Investigates a staging incident where the agent approved a low-confidence action it should have escalated. Spends two hours reconstructing the reasoning chain from scattered logs. Concludes the system prompt wasn't specific enough. Updates the prompt. Still can't be sure it won't happen again.

5:00 PM: Tries to write a post-mortem. Discovers the logging doesn't capture enough to explain what happened with sufficient confidence. Writes "root cause: model behaviour under edge case" and hopes it doesn't come up in the next security review.

#### Buying Triggers
- Production incident caused by agent behaviour
- Security team blocks deployment pending "control evidence"
- Team is onboarding non-engineers to build agents and needs guardrails they can't configure manually
- A new framework integration isn't supported by their custom logging solution
- CTO mandates consistent agent governance across all teams

#### Ideal AgentGuard Experience
One `pip install agentguard` and three lines of code. Zero friction integration. The developer gets observability for free, policy enforcement through a YAML file they can check into their repo, and something concrete to show in the security review.

---

### Persona 2: The CISO

**Title:** CISO / VP of Information Security / VP of Technology Risk  
**Company:** 1,000–50,000 employee enterprise in financial services, healthcare, or technology  
**Age:** 42–58  
**Tools:** CrowdStrike Falcon, Splunk SIEM, Microsoft Sentinel, ServiceNow GRC, Vanta

#### Goals
- Understand and govern the AI agent attack surface across the organisation
- Give the board and executive leadership real answers about AI risk
- Ensure AI agent deployments don't create regulatory or compliance exposure
- Detect and respond to agent-specific threats before they become incidents
- Not be blindsided by a breach or incident involving an AI system they didn't know existed

#### Frustrations
- Can't see what agents are doing — existing SIEM tools surface infrastructure events, not agent behaviour
- Business units are deploying agents faster than security can review them
- No vendor can explain the actual threat model for production AI agents
- Traditional security controls (DLP, IAM, network monitoring) don't map cleanly to agent risk
- Has to answer board questions about AI security with no data to back the answers

#### Day in the Life
8:00 AM: Weekly threat briefing. The threat intel team flags a new attack technique: indirect prompt injection via poisoned web pages retrieved by RAG agents. No existing detection rule covers this. The team doesn't have a clear answer on which agents are vulnerable or how to assess exposure.

10:30 AM: Meeting with the AI platform team about a new agent deployment in the finance department — an AP automation agent that can approve payments under $100K. CISO asks for a data flow diagram, access controls documentation, and monitoring plan. Gets a Confluence page with a system prompt and a screenshot of the LangChain code. Declines approval pending a proper control review.

2:00 PM: Call with their cyber insurer's risk engineering team. The insurer has added a new questionnaire section: AI agent controls. Questions include human oversight procedures, incident response playbooks for AI events, and access control evidence. CISO doesn't have satisfactory answers. The insurer indicates premium increases may apply.

4:00 PM: Quarterly board prep. The AI risk slide needs updating. Has nothing new to add — still no visibility, still no metrics. Writes "AI governance programme under development" and moves on.

#### Buying Triggers
- Board explicitly asks for an AI risk report
- Cyber insurer raises premiums or adds AI-specific requirements
- A peer company has a public AI agent incident
- Regulators request evidence of AI controls (EU AI Act, SEC Cybersecurity Rules)
- Internal audit flags AI agent governance as a material gap
- Business unit deploys an agent that causes a minor incident — the "warning shot"

#### Ideal AgentGuard Experience
A unified dashboard showing every agent across the organisation: framework, model, risk tier, recent anomalies, policy violations. Enriched alerts in Splunk that say "Agent X attempted to exfiltrate customer PII to external domain — blocked by AgentGuard policy AG-127" — not raw API call logs they have to interpret. One-click board reports. A contractual SLA they can show the auditor.

---

### Persona 3: The GRC / Compliance Lead

**Title:** Head of GRC / Data Protection Officer / Chief Compliance Officer / AI Risk Manager  
**Company:** Regulated enterprise — banking, insurance, healthcare, critical infrastructure  
**Age:** 35–52  
**Tools:** ServiceNow GRC, Archer, Vanta, Drata, OneTrust, Excel (regrettably)

#### Goals
- Demonstrate compliance with EU AI Act, ISO/IEC 42001, HIPAA, DORA, or NIS2 as applicable
- Build and maintain a documented AI risk management programme that satisfies auditors
- Ensure AI agent decisions are auditable and defensible in regulatory inquiries
- Stay ahead of emerging AI regulation rather than scrambling after enforcement actions
- Give the board an accurate, evidence-based view of AI regulatory exposure

#### Frustrations
- AI regulation is moving faster than governance frameworks can keep up
- Developers deploy agents without notifying compliance — shadow AI is rampant
- Existing GRC tools (Vanta, Drata) don't have AI-specific control frameworks
- Audit evidence for AI systems is either non-existent or scattered across engineering notebooks
- Legal uncertainty around AI liability means the risk exposure is hard to quantify

#### Day in the Life
9:00 AM: External counsel sends an update on EU AI Act delegated acts — two new implementing regulations clarifying Article 9 obligations for high-risk AI in credit decisioning. GRC Lead needs to assess whether existing AI deployments are now out of compliance and document the gap assessment.

11:00 AM: Quarterly AI inventory review. Last quarter: 47 AI systems catalogued. This quarter: engineering reports 61 new agent deployments. 14 of those are in scope for EU AI Act high-risk classification. Documentation for all 14: system prompts, a Jira ticket, and a Slack thread.

2:00 PM: Meeting with internal audit. They're planning an AI controls audit next quarter. They want to see: risk assessments per AI system, evidence of human oversight controls, logging that covers the past 12 months, and an incident response procedure for AI-specific events. GRC Lead's current plan to produce this involves 6 weeks of manual documentation work and interviews with 15 different engineering teams.

4:30 PM: Joins a webinar on DORA compliance for AI systems in financial services. The presenter says firms need to demonstrate ICT risk management for AI tools by January 2025. GRC Lead is taking notes and feeling increasingly behind.

#### Buying Triggers
- Regulatory deadline approaching (EU AI Act, DORA enforcement, HIPAA audit)
- External audit finding related to AI controls
- Legal counsel advises on regulatory exposure from undocumented AI deployments
- Peer organisation receives enforcement action or regulatory inquiry related to AI
- Board risk committee requests an AI risk register with evidence

#### Ideal AgentGuard Experience
AgentGuard generates compliance evidence automatically from the same runtime data that's already being collected for monitoring. EU AI Act Article 12 logging? Done. ISO 42001 §6.1.2 risk assessment evidence? Produced from the policy configuration and anomaly logs. A compliance dashboard that maps each deployed agent to relevant regulatory requirements, flags gaps, and generates the documentation package for external audit. Regulatory updates propagate as policy template suggestions, not as emergency re-engineering projects.

---

### Persona 4: The Platform Engineer

**Title:** Senior Platform Engineer / Staff Infrastructure Engineer / Head of AI Platform  
**Company:** 500–5,000 employee tech company or enterprise with a centralised AI platform team  
**Age:** 30–45  
**Tools:** Kubernetes, Terraform, AWS / GCP / Azure, GitHub Actions, Datadog, PagerDuty, OpenTelemetry

#### Goals
- Provide a secure, reliable, governed platform for internal teams to deploy AI agents
- Enforce consistent security and operational standards across diverse agent deployments
- Reduce the operational burden of supporting 10+ internal teams each doing agents differently
- Integrate agent observability into existing platform monitoring without rebuilding everything
- Be able to respond to incidents involving agents as effectively as incidents involving services

#### Frustrations
- Every team uses a different agent framework with different logging conventions — no unified observability
- Secrets management for agent tool credentials is inconsistent and often insecure
- Agent workloads have different failure modes than microservices — existing runbooks don't apply
- Can't enforce organisational security policies across heterogeneous agent deployments
- Post-incident investigation for agent failures is painful — reconstructing what happened is manual and slow

#### Day in the Life
8:30 AM: PagerDuty alert: an agent in the data team's pipeline has been running for 4 hours with no completion signal. Not an error — just stuck. The agent is consuming GPU and network resources. Platform engineer needs to figure out whether to kill it, whether it's making progress, and whether the human who kicked it off is aware. None of this is easily answerable from existing monitoring.

10:00 AM: A new team wants to deploy an agent using AutoGen. The platform team's existing agent integration patterns are all LangChain-based. The team needs to build new logging adapters, credential injection patterns, and policy enforcement hooks from scratch — or tell the team they can't use their preferred framework.

1:00 PM: Security team requests a full audit log for an agent that ran last month. The platform engineer needs to pull logs from five different sources — CloudWatch, the agent framework's own verbose logs, the tool call API logs, the model provider's logging API, and a custom structured log — and stitch them together. This takes most of the afternoon.

3:30 PM: Planning session for the next platform quarter. One of the asks: "support multi-agent workflows where agents call other agents." The platform engineer knows this will multiply the observability and security complexity by an order of magnitude. Doesn't have a clear path forward.

#### Buying Triggers
- Multi-team agent deployment at scale makes the "build it yourself" approach untenable
- A production incident exposes the inadequacy of current agent observability
- Security team or compliance team sets requirements the platform can't currently meet
- A new framework needs to be supported and the cost of building custom integration is prohibitive
- Organisation adopts a "secure by default" platform mandate that covers AI agents

#### Ideal AgentGuard Experience
An OpenTelemetry-compatible integration that slots into the existing platform stack. A single SDK or sidecar that works with any agent framework — LangChain, AutoGen, CrewAI, raw OpenAI calls — without requiring team-specific customisation. Policy enforcement as a platform-level control the platform team administers, not a per-team responsibility. Datadog and PagerDuty integration so agent alerts route through the same channels as service alerts. An incident replay capability that reconstructs agent sessions without manual log stitching.

---

## 4. Product Principles

These principles are not aspirational marketing — they are technical and product constraints that govern every architectural and feature decision. When a proposed feature conflicts with a principle, the principle wins unless there is an explicit, documented exception.

---

### Principle 1: Security Should Be Invisible (< 50ms Overhead)

**What this means:** AgentGuard must not be the reason an agent is slow. Security that causes performance degradation creates organisational pressure to bypass it. The p99 latency overhead of AgentGuard's policy check and logging path must be under 50 milliseconds — not as a stretch goal, but as a contractual SLA and a hard architectural constraint.

**Why it matters:** CISOs don't get blamed for security incidents. They get blamed for security that breaks performance SLAs. If AgentGuard adds 500ms to every agent step, it will be ripped out of production and replaced with nothing — which is worse. The sub-50ms SLA is the reason enterprises can say yes.

**How we enforce it:** The data plane is designed as a non-blocking path. Policy evaluation happens asynchronously for low-risk actions; synchronous only for high-risk gates. Telemetry is buffered and shipped out-of-band. Latency benchmarks run in CI against real agent workloads. Regression in p99 latency blocks release.

**Implications:** We will not build features that require synchronous calls to an external ML model for every agent action. We will not build features that require taking a full heap dump of agent state on every step. We will not sacrifice the latency SLA to build a shinier dashboard.

---

### Principle 2: Policy as Code

**What this means:** AgentGuard policies are YAML/JSON files, version-controlled in Git, reviewed in pull requests, deployed with CI/CD, and auditable by humans. Policy configuration is not a GUI-only operation. Every security constraint an organisation applies to their agents has a text representation that a developer can read, a reviewer can audit, and a regulator can inspect.

**Why it matters:** "Policy as code" has become the standard for infrastructure (Terraform, Pulumi), security posture (OPA, Checkov), and access control (Cedar, Rego). It works because it brings engineering discipline — version history, peer review, rollback, testing — to what was previously ad-hoc configuration. Agent policies should be no different. The EU AI Act Article 9 requires documented risk management systems — policy-as-code produces that documentation automatically.

**How we enforce it:** The AgentGuard policy schema is the primary interface. The dashboard is a visualisation layer on top of policy files, not an independent source of truth. Policy changes made in the UI produce a Git commit. Policy diffs are surfaced in PR reviews. Policy tests are a first-class feature — you can write unit tests against policy files before deploying.

**Implications:** We will not build a "configure everything in the UI" product that produces undocumented configuration state. We will invest in a policy schema that is expressive enough for real enterprise use cases while remaining human-readable.

---

### Principle 3: Framework Agnostic

**What this means:** AgentGuard works with LangChain, AutoGen, CrewAI, OpenAI Assistants, Anthropic's tool use SDK, LlamaIndex, Semantic Kernel, Haystack, DSPy, custom frameworks, and anything that hasn't been invented yet. No enterprise goes all-in on a single agent framework. AgentGuard will not require them to.

**Why it matters:** Framework lock-in is the single biggest objection from platform engineers and pragmatic CTOs. A security tool that only works with LangChain is adopted by LangChain shops and abandoned when they migrate. Framework neutrality is a technical moat — the integration breadth creates switching costs that compound over time.

**How we enforce it:** The AgentGuard data plane exposes framework-specific SDKs (LangChain callback handler, AutoGen hook, OpenAI SDK wrapper) and a framework-agnostic REST/gRPC API for custom integrations. Behaviour is identical regardless of which integration path is used. Integration test suite covers all supported frameworks. No core feature is exclusive to any framework integration.

**Implications:** We will prioritise integration breadth over framework-specific depth in the early roadmap. Every new framework integration is a force multiplier for TAM. We will not optimise the product for the LangChain experience at the expense of non-LangChain users.

---

### Principle 4: Open Core

**What this means:** The core AgentGuard policy engine, logging pipeline, and basic monitoring are open source under the Apache 2.0 licence. Enterprise features — compliance modules, advanced anomaly detection, multi-tenant management, SIEM integrations, and executive reporting — are commercial. The OSS layer is genuinely useful on its own; it is not a trial or a crippled version.

**Why it matters:** Developer adoption requires trust, and trust requires transparency. An open-source core that developers can read, audit, fork, and contribute to creates the community that drives organic growth. Snyk's developer-first, OSS-led expansion is the model — the OSS product wins hearts; the commercial product wins budgets. The OSS layer also creates the policy template ecosystem that becomes a competitive moat.

**How we enforce it:** The OSS and commercial codebases are clearly separated. OSS features are never retroactively moved to commercial. The OSS policy engine is the *exact same engine* used in the commercial product — not a fork. Community contributions to OSS are welcomed and merged. Commercial features build *on top of* the OSS layer, never replacing or breaking it.

**Implications:** We will not ship a "community edition" that is deliberately worse than the commercial product in ways that punish developers. We will invest in OSS community infrastructure (Discord, documentation, contributor guides) as a product investment, not a marketing expense.

---

### Principle 5: Defence in Depth

**What this means:** AgentGuard is not a single security layer — it is multiple overlapping layers that each fail safely. Prompt injection detection at the input layer. Policy enforcement at the action layer. Anomaly detection at the behavioural layer. Kill switch at the operational layer. Audit at the forensic layer. Compromising one layer does not compromise the system.

**Why it matters:** Any single security control can fail. A policy engine that catches 99% of malicious actions still misses 1%. The 1% is where the catastrophic incidents live. Defence in depth ensures that a missed policy check is caught by anomaly detection; that anomaly detection is supplemented by human-in-the-loop gates; that gates are backed by kill switches. An attacker who defeats one layer faces the next.

**How we enforce it:** Each layer is independently testable and independently deployable. Features are tagged by the layer they operate at. A feature that claims to operate at multiple layers without explicit design review is a smell. The threat model for each layer explicitly documents what it does *not* protect against — and confirms that another layer covers the gap.

**Implications:** We will not ship a product that claims to be "the" agent security solution as a single point of control. We position as a layer in a broader security architecture — one that works *with* existing SIEM, EDR, and prompt security tools, not instead of them.

---

## 5. Scope — Phase 1 MVP (Months 1–6)

### Objective

Deliver a product that a developer can integrate in 30 minutes, that a platform engineer trusts in production, and that a CISO can point to in a security review. Prove the latency SLA at scale. Land five design partners who are actively using it in staging or production.

---

### What's IN Scope

#### Core Policy Engine
- YAML-based policy definition supporting: allowed/denied tool categories, resource budget limits (API spend caps, token budgets, time limits), data classification gates, action blocklists and allowlists, and configurable fail-closed/fail-open behaviour per policy scope
- Policy versioning with Git-native workflow (policies are files, not database records)
- Policy evaluation API: synchronous (blocking) for high-risk actions, asynchronous (non-blocking, advisory) for standard monitoring
- Policy unit testing framework — write tests against policy files before deploying
- Pre-built policy templates for common agent archetypes: customer service agent, code execution agent, data retrieval agent, financial transaction agent
- Community policy registry (read-only in Phase 1 — share via GitHub)

#### Basic Monitoring & Observability
- Per-action event stream: tool call, parameters, result, latency, policy decision, anomaly flags
- Agent session reconstruction — full chain-of-thought log for post-incident analysis
- Risk scoring per action: low / medium / high / critical based on configurable rule set
- Dashboard: real-time agent activity feed, risk score distribution, policy violation log, anomaly alerts
- Alerting: email and webhook (Slack, PagerDuty) for high-severity events

#### Kill Switch & Intervention
- Instant agent halt via API (programmatic) and dashboard UI (manual)
- Human-in-the-loop gate: configurable policy rule that pauses agent and requests human approval before executing a flagged action. Approval via dashboard, Slack, or API callback
- Configurable escalation: automatic pause after N policy violations in a session
- Fail-safe defaults: if AgentGuard data plane is unreachable, policy is fail-closed (agent halts) or fail-open (agent continues with alert) based on per-agent configuration

#### Audit Logging
- Tamper-evident, append-only log of all agent actions with cryptographic chaining (each log entry references the hash of the previous entry)
- Structured log schema: timestamp, agent ID, session ID, action type, tool called, parameters (with PII-redacted view), policy decision, outcome, latency
- Log export: JSON, CSV, SIEM-ready CEF/LEEF format
- 90-day log retention in SaaS; configurable in enterprise tier
- Basic forensic replay: reconstruct an agent session from logs in the dashboard

#### LangChain Integration
- Native LangChain callback handler — one import, one line of configuration
- Covers: tool invocations, LLM calls, chain executions, agent iterations
- Zero change required to existing LangChain agent code beyond adding the callback
- Tested against LangChain v0.2.x and v0.3.x

#### OpenAI SDK Integration
- Wrapper for `openai.chat.completions.create` and Assistants API that transparently instruments all calls
- Tool call interception for function calling and Assistants tool use
- Tested against `openai` Python SDK v1.x

#### Infrastructure
- SaaS deployment: single-tenant cloud (AWS us-east-1 default; EU region for GDPR customers)
- SDK: Python package (`agentguard`), published to PyPI
- REST API for all core operations (policy management, event query, kill switch)
- Dashboard: web UI (React) for monitoring, alerts, and kill switch
- Agent identity: API key per agent (Phase 1); mTLS in Phase 2

#### Basic SIEM Integration
- Splunk: HTTPS Event Collector (HEC) integration — AgentGuard events push to Splunk index
- Microsoft Sentinel: Log Analytics workspace integration via Data Connector API
- Common schema: AgentGuard event schema maps to a Sentinel/Splunk-parseable JSON structure

---

### What's OUT of Scope for Phase 1

The following are explicitly deferred. They are on the roadmap but will not ship in the first six months. Committing to them now would risk shipping nothing.

| Feature | Rationale for Deferral | Target Phase |
|---|---|---|
| **Multi-agent governance** (agent-to-agent visibility, collusion detection, cascading failure detection) | Requires cross-agent event correlation infrastructure not needed for single-agent use cases. Phase 1 secures individual agents. | Phase 2 (Months 7–12) |
| **MCP (Model Context Protocol) security** | MCP ecosystem is evolving rapidly — premature to build deep integration. Monitor for stabilisation. | Phase 2–3 |
| **Compliance reporting modules** (EU AI Act, HIPAA, DORA pre-built reports) | Core audit log is the prerequisite. Compliance report templates layer on top. Design partners inform which regulations to prioritise first. | Phase 2 (Months 7–12) |
| **On-premises deployment / VPC** | Significant infrastructure investment. Required for FedRAMP and HIPAA-strict buyers. After SaaS is stable. | Phase 2–3 |
| **Advanced anomaly detection / ML behavioural baseline** | Requires sufficient data volume to train useful models. Seed with rules-based detection; layer ML when data is available. | Phase 2 |
| **CrewAI, AutoGen, LlamaIndex integrations** | Phase 1 covers the two highest-adoption frameworks. Additional integrations added in Phase 2 based on design partner demand. | Phase 2 |
| **Agent identity (mTLS / JWT)** | API key sufficient for Phase 1. Cryptographic identity required for enterprise trust but complex to implement correctly. | Phase 2 |
| **Supply chain security** (SBOM, dependency scanning, model version pinning) | Critical long-term, but not a blocker for initial enterprise adoption. | Phase 3 |
| **Red team as a service** | Professional services offering. Needs product maturity before adding service delivery complexity. | Phase 3 |
| **Cloud marketplace listings** (AWS Bedrock, Azure AI, GCP Vertex) | Phase 1 is direct install. Marketplace is a distribution channel for Phase 3 scale. | Phase 3 |

---

### Phase 1 Success Criteria

All three criteria must be met by the end of Month 6 to declare Phase 1 a success and proceed to Phase 2 with confidence.

| Criterion | Target | Measurement Method |
|---|---|---|
| **Design Partners** | 5 organisations actively using AgentGuard in staging or production | Signed design partner agreements; bi-weekly check-in calls; product telemetry confirming active usage |
| **GitHub Stars** | 1,000 stars on the open-source policy engine repository | GitHub API |
| **p99 Latency SLA** | < 50ms overhead per agent action (policy evaluation + logging path) | Load test results from CI against reference agent workloads (1K, 10K, 100K actions/hour); SLA documented in product spec |

**Supporting indicators** (not blockers, but tracked):
- 500+ Discord members
- 100+ weekly active OSS users (defined as: at least one policy check in the trailing 7 days)
- At least one design partner providing written testimonial or case study content
- Zero critical security vulnerabilities in AgentGuard itself reported by external researchers

---

## 6. Success Metrics

Metrics are organised by category and by phase. Phase 1 metrics are the operating dashboard for the first six months. Phase 2–3 metrics are directional targets for planning, not commitments.

---

### Adoption Metrics

These measure whether the product is reaching users and providing value.

| Metric | Phase 1 Target (M6) | Phase 2 Target (M12) | Phase 3 Target (M24) | Notes |
|---|---|---|---|---|
| **GitHub Stars** | 1,000 | 5,000 | 30,000 | OSS policy engine repo |
| **PyPI Weekly Downloads** | 500 | 5,000 | 50,000 | `agentguard` package |
| **Weekly Active OSS Users** | 100 | 1,000 | 10,000 | ≥1 policy check in trailing 7 days |
| **SaaS Weekly Active Orgs** | 5 (design partners) | 30 | 200 | Orgs with ≥1 active agent |
| **Framework Coverage** | LangChain + OpenAI SDK | + AutoGen, CrewAI, LlamaIndex | + Semantic Kernel, custom | Number of supported frameworks |
| **Policy Templates Published** | 10 (curated) | 50 (community) | 500 (community registry) | Templates in policy registry |

---

### Revenue Metrics

These measure whether the product is building a sustainable business.

| Metric | Phase 1 Target (M6) | Phase 2 Target (M12) | Phase 3 Target (M24) |
|---|---|---|---|
| **ARR** | $0 (design partner phase) | $150K | $2M |
| **Pipeline** | $250K (qualified) | $500K | $5M |
| **Design Partners** | 5 (signed) | 25 (with upsell conversations) | — |
| **First Paying Customer** | — | Months 7–9 | 100+ customers |
| **Net Revenue Retention** | N/A | 110% | 135% |
| **Gross Margin** | N/A | >80% | >80% |
| **ACV (Enterprise)** | Design partner discount | $30–60K | $80–120K |

**Revenue milestone definitions:**
- *Design partner*: Signed agreement committing to use AgentGuard in exchange for direct product input, discounted/free pricing for 12 months, and a reference commitment if goals are met
- *First paying customer*: Full commercial contract at non-discounted pricing
- *Paying customer*: Active commercial contract; ARR > $0

---

### Product Metrics

These measure whether the product is working as designed.

| Metric | Target | Notes |
|---|---|---|
| **p99 Latency (policy check + log)** | < 50ms | Measured under production load; CI regression gate |
| **p50 Latency** | < 10ms | Standard path, no high-risk gate invoked |
| **False Positive Rate** | < 2% | % of legitimate agent actions flagged as policy violations |
| **False Negative Rate** | < 5% | % of actual policy violations not detected (measured against test suite) |
| **Kill Switch RTC** | < 500ms | Time from kill switch trigger to confirmed agent halt |
| **Integration Time (new user)** | < 30 minutes | Time from `pip install` to first policy check logged, measured in user research |
| **Log Completeness** | > 99.9% | % of agent actions that produce a log entry |
| **Dashboard Load Time** | < 2s | P95 for primary monitoring view |
| **API Uptime** | > 99.9% | Monthly SLA |
| **Framework Coverage** | 2 (Phase 1) → 5 (Phase 2) | Number of officially supported frameworks |

**False positive rate is critical.** A security tool with a high false positive rate gets turned off. We will track false positives by policy rule, by agent type, and by framework — and treat high false positive rules as bugs to fix.

---

### Community Metrics

These measure whether we're building a community around the product, not just a product.

| Metric | Phase 1 Target (M6) | Phase 2 Target (M12) | Phase 3 Target (M24) |
|---|---|---|---|
| **Discord Members** | 500 | 2,000 | 10,000 |
| **Contributor PRs (OSS)** | 20 | 100 | 500 |
| **Policy Templates Shared (community)** | 10 (curated by us) | 50 | 500 |
| **Forum/GitHub Issues Resolved** | 80% within 48h | 90% within 24h | 90% within 24h |
| **Developer Content** (blog, talks, tutorials) | 4 pieces | 20 pieces | 100 pieces |
| **Newsletter / Email List** | 1,000 | 5,000 | 25,000 |

**Community health indicators** (qualitative, tracked monthly):
- Are community members helping each other in Discord without prompting from the team?
- Are external contributors submitting PRs to add framework integrations?
- Are policy templates being shared and reused across organisations?
- Is the community generating content (blog posts, videos, talks) about AgentGuard independently?

---

## 7. Risks & Open Questions

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Latency SLA is unachievable at scale** — policy evaluation under high-throughput loads exceeds 50ms p99 | Medium | Critical | Architecture review before commit: async logging path, in-process policy evaluation (no network hop for low-risk actions), aggressive benchmarking from day one. If async isn't sufficient, consider agent-side evaluation with server-side audit. |
| **Framework API instability** — LangChain, AutoGen, OpenAI SDK ship breaking changes that break AgentGuard integrations | High | High | Pin to tested versions; maintain compatibility matrix; fast-follow releases. Dedicated integration test suite per framework running against HEAD of each framework repo. |
| **Log completeness under failure conditions** — AgentGuard data plane failure causes lost audit events | Medium | High | Append-only, durable log buffer in the SDK (local disk + async upload). Fail-safe: if log cannot be confirmed durable, treat as high-severity alert. Never drop events silently. |
| **Policy engine expressiveness gap** — real enterprise use cases require policy logic that YAML can't express | Medium | High | Early design partner engagement to validate policy schema against real requirements. Escape hatch: custom policy functions (evaluated as code) for complex cases. Avoid over-engineering the schema before seeing real requirements. |
| **Agent identity spoofing** — in Phase 1 (API key model), a compromised key allows agent identity forgery | Medium | Medium | Acceptable for Phase 1 given design partner context. mTLS in Phase 2 is the mitigation. Document the limitation explicitly. Short-lived API keys with rotation as an interim control. |
| **Data plane single point of failure** — AgentGuard outage causes agent fleet outage (fail-closed configuration) | Low | Critical | High availability architecture from day one: multi-AZ deployment, graceful degradation, configurable fail-open for non-critical agents. SLA: 99.9% uptime. Chaos engineering tests quarterly. |
| **Supply chain attack on AgentGuard itself** — attacker compromises AgentGuard SDK distribution | Low | Critical | PyPI signing (Sigstore), reproducible builds, SBOM for AgentGuard's own dependencies, SOC 2 Type II for our infrastructure. The security tool must be more secure than what it protects. |

---

### Market Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Agent adoption slower than projected** — enterprises don't deploy production agents at scale in 2026 | 30% | High | Product also adds value securing LLM API usage (non-agentic) — broader TAM. Compliance value proposition remains even for limited deployments. Keep burn lean for 9 months to preserve runway for delayed market. |
| **Platform bundling** — OpenAI, Anthropic, or AWS ship "good enough" agent security features built in | 40% | Medium | Framework-agnostic aggregation is the moat — they can only secure their own platform. Compliance depth and framework breadth are not economically rational for model providers to replicate. Position as complementary: "We work with your model provider's safety features, not instead of them." |
| **Incumbent acquisition** — CrowdStrike, Palo Alto, or Microsoft acquires a competitor in the space | 30% | Medium | Increases enterprise awareness of the category (good). Acqui-hire target valuation goes up (good if we're acquired; bad if competitor is). Focus on community moat — open-source ecosystem is harder to acquire and integrate than a product. |
| **Pricing pressure** — community expects enterprise features for free; enterprise expects lower pricing | 35% | Medium | Clear OSS/commercial boundary defined and maintained. Enterprise pricing anchored to compliance value (quantifiable ROI: audit hours saved, insurance premium reduction, incident cost avoided). |
| **Regulatory delay** — EU AI Act enforcement dates slip; reduces urgency for compliance buyers | 20% | Medium | Multiple regulatory triggers (DORA for financial services, HIPAA for healthcare, SEC cybersecurity rules) mean no single regulation is the entire thesis. Compliance is a tailwind, not the only wind. |
| **Reputational risk** — a prominent security incident in an AgentGuard-protected system damages brand | 10% | Critical | No security tool prevents 100% of incidents. Messaging: AgentGuard reduces risk and improves detectability — not "if you have AgentGuard, nothing bad will happen." Incident response playbook for PR events. |

---

### Competitive Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Lakera Guard expands scope** — moves from prompt injection to broader agent policy enforcement | 40% | Medium | Lakera's existing product and customer expectation is input-layer security. Pivoting to runtime governance is a product re-architecture. We'll have 12–18 months of lead time. Deeper compliance integration is hard to replicate quickly. |
| **Snyk expands to AI agent security** — leverages existing developer trust and distribution | 25% | High | Snyk's developer trust is the most direct competitive concern. Mitigation: build equally strong developer trust through OSS, community, and frictionless onboarding. Partner opportunity: Snyk secures the code; AgentGuard secures the runtime. |
| **Wiz or Orca adds agent security to cloud posture** | 30% | Medium | Cloud posture and agent runtime are different problem spaces. Their strength is infrastructure misconfigurations; ours is agent behaviour. Complementary until they explicitly compete. |
| **LangChain / LangSmith expands into security** | 35% | High | LangSmith already has observability for LangChain agents. If they add policy enforcement and compliance, they have a distribution advantage for LangChain users. Mitigation: framework-agnostic positioning makes AgentGuard the choice for non-LangChain workloads; depth of compliance capabilities LangSmith would not prioritise. |

---

### Key Decisions Still Needed

The following questions are unresolved and must be decided by Month 2 to avoid blocking downstream work. Each has a proposed resolution and a decision owner.

**1. Policy evaluation location: in-process vs. out-of-process**

*The question:* Does the AgentGuard policy engine run in-process (inside the agent's Python runtime, as part of the SDK) or out-of-process (as a separate service the SDK calls over the network)?

*Trade-offs:* In-process is faster (no network hop) and works offline, but limits what policies can do (no cross-agent correlation) and makes policy updates require SDK updates. Out-of-process enables richer policies and centralised management, but adds network latency and a dependency.

*Proposed resolution:* Hybrid — in-process evaluation for synchronous blocking checks (using a locally-cached policy bundle); out-of-process for async telemetry, audit logging, and complex anomaly detection. Policy bundles refresh on a configurable interval.

*Decision owner:* CTO. *Deadline:* Month 1.

---

**2. OSS licence: Apache 2.0 vs. BSL (Business Source Licence)**

*The question:* Apache 2.0 allows anyone to fork, modify, and commercialise the OSS core. BSL (used by HashiCorp, Elastic) restricts commercial use until a time-delay converts it to Apache 2.0.

*Trade-offs:* Apache 2.0 maximises community trust and adoption. BSL protects against a cloud provider offering AgentGuard as a managed service without contributing. Elastic's BSL shift in 2021 created significant community backlash.

*Proposed resolution:* Apache 2.0 for the OSS core. The moat is community, integration breadth, and compliance depth — not licence restriction. If a cloud provider commoditises the OSS layer, the enterprise commercial layer remains differentiated.

*Decision owner:* CEO. *Deadline:* Before OSS launch.

---

**3. Design partner selection criteria**

*The question:* Which five design partners do we target first? What industries, company sizes, and use cases give us the most signal and the most referenceable outcomes?

*Proposed framework for selection:*
- At least two regulated industries (financial services, healthcare) — validates compliance value proposition
- At least two different agent frameworks (one LangChain-heavy, one OpenAI SDK-heavy) — validates framework-agnostic positioning
- At least one company with a named CISO who would reference us — validates enterprise buyer persona
- Company size: 200–5,000 employees (small enough to move fast, large enough to have a real compliance requirement)
- Active agent deployment in staging or production within 30 days of signing — no design partners who are "planning to deploy agents someday"

*Decision owner:* CEO + Head of Sales. *Deadline:* Month 1.

---

**4. Incident disclosure policy for AgentGuard itself**

*The question:* If AgentGuard experiences a security incident — a breach, a data exposure, a critical vulnerability — what is our disclosure policy?

*Why this is urgent:* As a security product, our own security posture is a core trust signal. Enterprises will ask. The policy needs to be written before the first enterprise sales conversation, not after the first incident.

*Proposed resolution:* Responsible disclosure with a 90-day CVE process for vulnerabilities in AgentGuard's own code. Immediate notification to affected customers for data incidents. Public post-mortem within 30 days of resolution for any P0 incident. SOC 2 Type II audit in Year 1.

*Decision owner:* CTO + Legal. *Deadline:* Month 2.

---

**5. Data residency and privacy architecture for SaaS**

*The question:* Agent audit logs contain potentially sensitive data — tool call parameters, user messages, PII that the agent processed. Where is this data stored? How long? What access controls apply? What is the GDPR/CCPA data handling approach?

*Why this is urgent:* EU customers will ask this before signing any design partner agreement. Healthcare customers will ask about HIPAA-compliant data handling. Getting the architecture wrong now means expensive re-architecture later.

*Proposed resolution:* SaaS data plane in AWS eu-west-1 for EU customers, us-east-1 for US customers. PII redaction built into the SDK's logging path (configurable redaction rules). Customer data is not used for AgentGuard model training without explicit opt-in. Data Processing Agreements available from day one.

*Decision owner:* CTO + Legal. *Deadline:* Month 1.

---

### Appendix: Regulatory Reference

Key regulations that directly inform AgentGuard's product requirements:

- **EU AI Act (Regulation 2024/1689):** In force August 2024; high-risk AI provisions enforced August 2026 (extended). Articles 9 (risk management), 12 (record-keeping), 13 (transparency), 14 (human oversight), 15 (accuracy and robustness) are the primary hooks.
- **NIST AI RMF 1.0 (January 2023) + AI 600-1 (July 2024):** Voluntary framework in the US; increasingly referenced in federal procurement. GOVERN, MAP, MEASURE, MANAGE functions align to AgentGuard's policy engine, monitoring, and kill switch capabilities.
- **ISO/IEC 42001:2023:** First international standard for AI management systems. §6.1.2 (risk assessment), §8.4 (operational planning), §9 (performance evaluation) are directly addressable by AgentGuard's audit and policy capabilities.
- **DORA (EU 2022/2554):** Applies to EU financial entities. ICT risk management obligations (Chapter II) and incident reporting (Chapter III) apply to AI systems used in financial services. Enforcement: January 2025.
- **HIPAA Security Rule (45 CFR Part 164):** Technical safeguards (§164.312) and policies & procedures (§164.316) apply to AI agents processing PHI. OCR enforcement has explicitly extended to AI-assisted healthcare decision tools.
- **PCI-DSS v4.0:** Requirement 7 (restrict access), Requirement 10 (log and monitor), Requirement 12 (policy framework). Applies to any agent that touches cardholder data or payment systems.
- **SEC Cybersecurity Disclosure Rules (effective December 2023):** Require public companies to disclose material cybersecurity incidents within four business days and annual cybersecurity risk management disclosures. AI agent incidents may qualify as material.
- **NIS2 Directive (EU 2022/2555):** Expanded EU cybersecurity obligations for essential entities. Article 21 risk management measures apply to AI-powered critical infrastructure.

---

*Document owner: Vision & Strategy Lead*
*Version: 1.0 — February 2026*
*Next review: Month 3 (post-design partner intake)*
*Confidential — AgentGuard Internal*

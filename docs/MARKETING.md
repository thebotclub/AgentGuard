# AgentGuard — Marketing & Website Copy

> **Internal reference document** — copy for website, ads, pitch decks, and product marketing.  
> Last updated: March 2026

---

## Headline Options

### Option A — Action/Consequence
> **Your AI agents are executing actions in production. Who's watching?**

### Option B — Category Definition
> **AgentGuard — The Security Layer Your AI Agents Are Missing**

### Option C — Pain/Relief
> **One prompt injection away from a breach. AgentGuard stops it before it executes.**

---

## Subheadline

> Runtime security for AI agents. AgentGuard evaluates every tool call — database queries, shell commands, HTTP requests, file operations — against configurable policies before execution. Block threats. Log everything. Stay in control.

**Shorter variant (for hero sections):**
> Policy enforcement for AI agents. Block dangerous actions before they execute.

---

## Value Proposition (1-liner)

> AgentGuard is a security firewall for AI agent tool calls — sitting between your LLM and its tools, evaluating every action in real-time.

---

## Feature Descriptions (Benefit-Focused)

### ⚡ Sub-Millisecond Policy Evaluation
**Feature:** In-process policy engine with zero network round-trips.  
**Benefit:** Your agents run at full speed. No added latency, no cold-start delays, no SLA impact. Security that's invisible to your users.

### 🔴 Instant Kill Switch
**Feature:** One API call halts every agent in your tenant — cascades to all child agents.  
**Benefit:** When something goes wrong, you stop it in seconds — not after a PagerDuty escalation chain. Enterprise incident response, built in.

### 📋 Tamper-Evident Audit Trail
**Feature:** SHA-256 hash-chained log of every evaluation decision.  
**Benefit:** When your compliance team asks "what did that agent do on March 10th?", you have a cryptographically verifiable answer. Not just logs — *provable* logs.

### 🕵️ Prompt Injection Detection
**Feature:** Heuristic pattern matching with optional Lakera Guard integration. Detects instruction overrides, role-play jailbreaks, system prompt leakage, and multi-turn escalation.  
**Benefit:** Your agents don't fall for tricks. Malicious inputs get caught before they become catastrophic actions.

### 🔐 PII Detection & Redaction
**Feature:** Auto-detects and redacts 20+ PII patterns — SSNs, emails, credit cards, phone numbers, and more — before logging.  
**Benefit:** You get the security visibility you need without accidentally creating a compliance liability in your own audit logs.

### 🤝 Human-in-the-Loop Approvals
**Feature:** Route high-risk actions to a Slack approval queue. Reviewers approve or deny with one click.  
**Benefit:** For actions that need a human eye — large transfers, sensitive data access, production deployments — your team stays in the loop without blocking the agent for low-risk work.

### 🏗️ Framework Integrations
**Feature:** Drop-in support for LangChain, CrewAI, OpenAI, Vercel AI SDK, Express middleware. TypeScript and Python SDKs.  
**Benefit:** No rewrite required. Add AgentGuard to your existing agent in 3 lines of code. Works with whatever you're already using.

### 📊 Compliance Templates Out of the Box
**Feature:** Pre-built policy templates for EU AI Act, SOC 2, OWASP LLM Top 10, APRA CPS 234, and Financial Services.  
**Benefit:** Start compliant, not compliant-adjacent. Import a template, customise to your context, and hand your auditor a package — not a prayer.

---

## Use Case Descriptions

### 🏦 Financial Services — Preventing Unauthorized Transactions
**Scenario:** A major bank deploys an AI agent to handle customer service requests — balance inquiries, transfer initiation, account changes.

**The risk:** A sophisticated customer submits a carefully crafted message that tricks the agent into initiating an unauthorized transfer. Without a security layer, the agent executes the tool call because the LLM decided it was appropriate.

**With AgentGuard:** Every transfer initiation triggers a policy check. Transfers above defined thresholds require human approval. All actions are logged with tamper-evident audit trails for regulatory review. If the agent is manipulated, the dangerous action is blocked before execution — and the security team is alerted instantly.

**Outcome:** Regulatory compliance, zero unauthorized transactions, full audit trail for APRA/SOC 2 reviews.

---

### 🏥 Healthcare — Protecting Patient Data
**Scenario:** A healthcare provider uses an AI agent to assist clinicians — pulling patient records, scheduling appointments, generating care summaries.

**The risk:** The agent has access to sensitive patient data. A prompt injection attack in a retrieved patient note instructs the agent to exfiltrate records to an external endpoint.

**With AgentGuard:** PII detection catches patient identifiers before they're logged. Policy rules block outbound HTTP requests to unauthorized domains. HIPAA-aligned audit trail captures every data access for compliance review. The kill switch can halt all agents instantly if a breach is suspected.

**Outcome:** HIPAA compliance, no unauthorized data exfiltration, complete access audit trail.

---

### 🚀 SaaS Platform — Protecting Multi-Tenant Infrastructure
**Scenario:** A developer tools company builds an AI coding assistant that can read, write, and execute code in customer environments.

**The risk:** A malicious actor crafts code comments designed to manipulate the agent into executing system commands, reading environment variables, or escalating privileges across tenant boundaries.

**With AgentGuard:** Shell execution policies block commands outside defined scope. Cross-tenant data access is prevented at the policy layer. Every code operation is logged. The CI/CD integration validates agent configurations before deployment, preventing misconfigured agents from reaching production.

**Outcome:** Multi-tenant security, no privilege escalation, compliance-ready audit logs for enterprise customers.

---

### 🤖 Enterprise Automation — Governing a Fleet of Agents
**Scenario:** A logistics enterprise deploys 50+ agents handling procurement, inventory, communications, and reporting — each with different tool access and risk profiles.

**The risk:** As the fleet grows, visibility drops. Which agent accessed the procurement system? Which one sent that external email? Did anyone review the policy for the new inventory agent before it went live?

**With AgentGuard:** Centralised policy management across all agents. Per-agent audit trails with anomaly detection. The certification workflow validates new agents against declared tool inventories before deployment. The dashboard gives security teams a live view of what every agent is doing, right now.

**Outcome:** Governance at scale, security team confidence, audit-ready for enterprise customer due diligence.

---

## FAQ

### What exactly does AgentGuard intercept?
AgentGuard evaluates **tool calls** — the actions your AI agent takes in the world. This includes database queries, HTTP requests, shell commands, file operations, API calls, and any other tool your agent has access to. We don't intercept or modify the LLM's reasoning — we evaluate what it decides to *do*.

### How does it integrate with my existing agent?
Drop-in integrations for LangChain, CrewAI, OpenAI Assistants, and Vercel AI SDK. For other frameworks, use the `evaluate()` SDK method directly — it's one function call before each tool execution. Full integration typically takes under 30 minutes.

### What's the latency impact?
The policy engine runs **in-process** — no network call during evaluation. Typical evaluation time is under 1ms. For cloud-validated calls (human-in-the-loop, remote policy fetch), add ~150ms. Your agent pipeline won't notice.

### Does it work with Python?
Yes. `pip install agentguard-tech` gives you full SDK parity with the TypeScript version, including LangChain and CrewAI integrations.

### Can I self-host?
Yes. `git clone` + `docker-compose up`. Full self-hosted guide at [agentguard.dev/self-hosted](https://agentguard.dev/self-hosted). Your data stays on your infrastructure.

### How does the kill switch work?
One API call (or one click in the dashboard) sets the `kill_switch_active` flag for your tenant. Every subsequent `evaluate()` call returns `blocked` — immediately, for every agent. The cascade happens at the policy evaluation layer, not at the agent level, so it works regardless of what framework or language your agents use.

### What compliance frameworks are supported?
Built-in policy templates for: EU AI Act (Articles 5, 9, 12, 14), SOC 2 (CC1-9), OWASP Top 10 for LLMs, APRA CPS 234, and Financial Services Baseline. Templates are a starting point — you customise them to your specific requirements.

### What's the pricing?
**Free:** 100,000 events/month, 3 agent seats — enough for development and small production workloads.  
**Pro:** $149/mo — unlimited events, unlimited agents, SSO, SIEM export, 1-year audit retention.  
**Enterprise:** $499/mo — custom retention, 99.9% SLA, dedicated support, on-prem option.  
[See full pricing →](https://agentguard.dev/#pricing)

### Is the source code available?
Yes. Business Source License 1.1 — source available, free to use, with enterprise licensing for commercial self-hosting at scale. [Read the license →](https://github.com/thebotclub/AgentGuard/blob/main/LICENSE)

---

## CTA Copy

### Primary CTAs
- **"Start for free — 100K events/month"**
- **"Add security to your agent in 5 minutes"**
- **"Try the live demo — no signup required"**
- **"Get started free →"**

### Secondary CTAs
- **"Read the docs"**
- **"View the GitHub repo"**
- **"Talk to us about Enterprise"**
- **"See it block a real attack →"** (links to demo)

### Email/Newsletter CTA
- **"Security briefings for AI teams. No noise, no spam."**
- **Subject line for nurture:** "Your agents are running. Are they safe?"

---

## Competitive Positioning

### vs. "We trust the LLM"
Most teams rely on prompt engineering and instruction tuning to constrain agent behaviour. This is not security. Prompt injection attacks are specifically designed to bypass instructed constraints. AgentGuard is a **deterministic policy layer** — it doesn't care what the LLM decided; it evaluates what the action *is*.

### vs. Traditional WAFs / API Gateways
Web application firewalls and API gateways secure HTTP traffic. They don't understand the semantic context of an agent action — who the agent is, what policy governs it, why it's making this call, or whether it was manipulated. AgentGuard is **agent-aware**: it evaluates actions in the context of agent identity, policy scope, and declared tool inventory.

### vs. LLM Safety Guardrails (Guardrails AI, NeMo)
Input/output guardrails scan text. AgentGuard evaluates **actions**. A guardrail might catch a prompt injection attempt in the user's message — but it won't catch the agent executing a dangerous database query three tool calls later because of indirect injection in a retrieved document. We secure the execution layer, not just the conversation layer.

### vs. SIEM / Observability Platforms
Observability tells you what happened. AgentGuard **prevents** it. Our audit trail is a by-product of real-time policy enforcement — not a separate logging pipeline. You get both: prevention and provability.

### vs. "We'll build it ourselves"
Building a policy engine, audit system, framework integrations, compliance templates, kill switch, and PII redaction in-house takes months and requires ongoing maintenance. AgentGuard is production-ready today. Start in 5 minutes; spend your engineering capacity on your product.

---

## Messaging Matrix

| Audience | Primary Pain | Key Message | Proof Point |
|----------|-------------|-------------|-------------|
| **Security Engineers** | No visibility into agent actions | Audit trail + policy enforcement for every tool call | SHA-256 hash chain, 34 API endpoints |
| **Compliance/GRC** | Regulatory exposure (EU AI Act) | Pre-built templates; audit-ready logs | EU AI Act, SOC 2, OWASP templates |
| **AI/ML Engineers** | Don't want to slow agents down | <1ms in-process evaluation; drop-in integrations | Latency benchmarks, 3-line integration |
| **CISOs** | Can't govern what they can't see | Fleet-wide visibility + instant kill switch | Dashboard demo, kill switch API |
| **DevOps** | Agent deployment without security gates | CI/CD integration; certification before production | GitHub Action, `agentguard validate` |

---

*Maintained by Nova3 / TheBotClub marketing. Update after each product release.*

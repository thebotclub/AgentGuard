# AgentGuard Market Scan — Agent Security Landscape
**Research Date:** March 2026  
**Prepared by:** Vector (Competitive Intelligence)  
**Classification:** Internal Strategy Document

---

## Executive Summary

The AI agent security market is exploding. Broad AI security is growing at 65%+ CAGR — from ~$0.7B in 2024 toward $110B by 2034. The agent-specific security sub-market is smaller but faster: it's where every large security company is placing bets right now, with 7 major acquisitions closing in 2025 alone (Check Point/Lakera, CrowdStrike/Pangea, F5/CalypsoAI, Palo Alto/Protect AI, Snyk/Invariant Labs, and others).

**The core finding:** Most competitors focus on *content safety* (prompt injection, PII, toxicity) or *observability* (tracing, evals). Very few have AgentGuard's specific combination: **tool-level policy enforcement + HITL approval queues + deployment certification + audit chain**. That combination is genuinely differentiated — and it's what enterprises actually need for regulated AI agents doing real things in the world.

The window to establish category leadership is 12–18 months before well-funded platforms expand into this niche.

---

## 1. Direct Competitors

### 1.1 LangChain / LangSmith

**What they do:** LangSmith is LangChain's observability and evaluation platform for LLM applications. It provides tracing, debugging, evaluation datasets, and monitoring. Guardrails are not a first-class primitive — they're more of a monitoring overlay.

**Key Features:**
- Full trace capture (inputs, outputs, intermediate steps)
- Evaluation datasets and automated testing
- Human annotation queues for labeling traces
- Alerting and anomaly detection
- Playground for prompt iteration
- Self-hosted or cloud

**Security-specific capabilities:**
- No native tool-level policy engine
- No HITL approval for agent actions (has annotation queues for evaluation, not runtime blocking)
- No deployment certification concept
- AgentSmith vulnerability (CVE, CVSS 8.8) disclosed Oct 2024 — malicious proxy could intercept API keys. Patched Nov 2024.

**Pricing:**
- Developer: Free (5K traces/month, 1 seat)
- Plus: $39/seat/month (10K traces, up to 10 seats)
- Enterprise: $100K+/year (custom, self-hosting, SSO/RBAC, unlimited traces)

**Funding/Traction:** LangChain raised $25M Series A (Sequoia, 2023). One of the most widely used agent frameworks. LangSmith has very high developer adoption due to LangChain ecosystem lock-in.

**Team size:** ~100 employees.

**Threat level to AgentGuard:** MEDIUM. They have distribution but no security depth. They could add policies, but it would be bolt-on. Risk is they block AgentGuard integrations or build "good enough" guardrails.

---

### 1.2 Guardrails AI (guardrailsai.com)

**What they do:** "The AI Reliability Platform" — a Python framework for adding validation, output formatting, and safety checks to LLM calls. Recently pivoted to broader reliability positioning (synthetic data, evals, production guardrails).

**Key Features:**
- 65+ pre-built validators (output validators, not tool-call validators)
- Custom validator creation
- Production guardrail deployment via managed service
- Private Guardrails Hub for enterprise
- Observability dashboards

**Security-specific capabilities:**
- Validates LLM outputs (hallucination detection, format compliance, PII)
- Does NOT have tool-level allow/block policy engine
- Does NOT have HITL approval queues
- Does NOT have deployment certification
- Focus is on output quality/safety, not agentic tool-use governance

**Pricing:**
- Open Source: Free (Apache 2.0), self-hosted
- Guardrails Pro: Usage-based per validation (pricing on request), VPC deployment, GPU infrastructure, SLAs, dedicated support

**Funding:** Series A stage; specific amount not publicly disclosed as of research date.

**GitHub:** ~95 repos in the org; active maintenance; healthy contributor activity.

**Team size:** ~30-50 employees (estimated).

**Threat level to AgentGuard:** LOW-MEDIUM. Different focus (output validation vs. tool-call governance). Could compete at the "content check" layer but misses the agentic policy/HITL/certification angle entirely.

---

### 1.3 Lakera (lakera.ai) — Acquired by Check Point

**What they do:** Real-time LLM security guardrails. Best known for Lakera Guard, an API-based prompt injection and content safety layer. Acquired by Check Point in 2025.

**Key Features (Lakera Guard):**
- Real-time prompt injection detection
- Jailbreak blocking
- PII detection and DLP
- Content moderation (violence, self-harm, toxicity)
- Data leakage prevention
- Sub-50ms latency via parallel processing
- Adaptive calibration (learns from app traffic patterns)
- Multilingual support (100+ languages)
- Security Center dashboard
- API Application Firewall
- AI red teaming simulations
- SOC2, GDPR, NIST compliant

**Integration:** API-first, works with any LLM (GPT-4, LLaMA, etc.), Grafana/Splunk/SIEM integrations.

**What they DON'T have:**
- Tool-level policy engine (allow/block specific tools)
- HITL approval workflows for agent actions
- Deployment certification
- Audit trail with hash chain
- Key rotation

**Pricing:** Enterprise custom. No public pricing. Estimated $60K–$200K/year range for enterprise.

**Funding:** $30M total ($10M seed + $20M Series A, Atomico, Citi Ventures, Dropbox Ventures, July 2024). Now part of Check Point.

**Traction:** 35%+ of Fortune 100 companies. Dropbox is a named customer.

**Team size:** ~50-100 employees pre-acquisition.

**Post-acquisition implications:** Check Point integration means Lakera Guard becomes part of a $2B+ security vendor portfolio. Will likely get enterprise distribution but lose startup agility. AgentGuard should differentiate on agentic-specific features that Check Point won't prioritize quickly.

**Threat level to AgentGuard:** HIGH for the content safety layer, LOW for tool governance/HITL/certification.

---

### 1.4 Prompt Armor (promptarmor.com)

**What they do:** Third-party AI vendor risk assessment and monitoring. Not runtime protection — more of a security compliance tool for assessing what AI vendors do with your data.

**Key Features:**
- Identify AI components in vendor offerings
- Assess against OWASP LLM Top 10, NIST AI RMF, MITRE Atlas (26 risk vectors)
- Monitor for changes in AI scope/permissions
- Map AI asset relationships
- Vendor risk reports (e.g., reports on specific AI products)

**What they DON'T have:**
- Runtime blocking or detection
- Tool-level policy enforcement
- HITL approval
- Any SDK/developer tooling

**Pricing:** Enterprise, contact-based. Demo-driven sales.

**Target customer:** Legal, compliance, InfoSec teams evaluating third-party AI vendors — NOT developers building agents.

**Threat level to AgentGuard:** LOW. Completely different use case (procurement risk vs. runtime security).

---

### 1.5 Rebuff AI (rebuff.ai / protectai/rebuff)

**What they do:** Open-source, self-hardening prompt injection detection framework. Part of the Protect AI portfolio.

**Key Features:**
- Heuristic-based input filtering
- LLM-as-judge for injection detection
- VectorDB storage of known attack embeddings
- Canary token injection for leak detection
- Self-hardening (learns from detected attacks)

**Status:** Alpha-stage. Not production-grade per their own documentation. Research/experimental.

**GitHub:** protectai/rebuff — active but early stage.

**Threat level to AgentGuard:** NEGLIGIBLE. Experimental tool, narrow scope.

---

### 1.6 NVIDIA NeMo Guardrails

**What they do:** Open-source toolkit for adding programmable safety rails to LLMs and AI agents. Enterprise deployable with NVIDIA NIM microservices.

**Key Features:**
- Content safety across 23 categories
- Jailbreak prevention and prompt injection blocking
- PII detection (PERSON, EMAIL, etc.), GDPR/CCPA support
- Topic control (off-topic detection)
- RAG grounding and hallucination detection
- Malicious URL/IP detection
- Colang language for defining rail state machines
- GPU-accelerated with ~0.5s latency for 5 parallel guardrails
- Integrates with LangChain, LlamaIndex, LangGraph
- Partners: Palo Alto Networks, Private AI

**What they DON'T have:**
- Tool-level allow/block/warn policy engine
- HITL approval for agent actions
- Deployment certification
- Audit trail with hash chain
- GitHub Action integration

**Pricing:** Open source (free). Enterprise deployment with NVIDIA NIM adds infrastructure costs.

**Traction:** Backed by NVIDIA — massive distribution through the NVIDIA ecosystem. Integrated with hundreds of AI applications. Strong in enterprises already using NVIDIA hardware.

**Threat level to AgentGuard:** MEDIUM. Good distribution, but focused on content safety not tool governance. The Colang state machine approach is powerful but complex.

---

### 1.7 Arthur AI (arthur.ai)

**What they do:** Enterprise ML/AI monitoring, evaluation, and governance platform spanning traditional ML, generative AI, and agentic AI.

**Key Features:**
- Real-time monitoring and guardrails
- Data drift detection
- Hallucination rate monitoring
- PII/sensitive data handling detection
- Toxicity detection
- Custom domain evaluations
- Federated control plane/data plane (keeps data in customer environment)
- SOC 2 compliance, RBAC
- Targets banking, healthcare, insurance

**What they DON'T have:**
- Tool-level policy enforcement for agentic workflows
- HITL approval queue
- Deployment certification primitive
- Key rotation

**Pricing:** Enterprise custom. No public pricing.

**Funding:** Series B stage. Exact amounts not found in research.

**Target:** AI teams at enterprises (Fortune 100), compliance officers.

**Threat level to AgentGuard:** LOW-MEDIUM. Monitoring/observability focus. Could expand into policy enforcement but starting from monitoring makes tool-level control hard to bolt on.

---

### 1.8 Galileo AI (rungalileo.io / galileo.ai)

**What they do:** LLM observability and evaluation platform with production guardrails via their Luna evaluation foundation models.

**Key Features:**
- 20+ out-of-the-box evaluations (RAG, agents, safety, security)
- Luna EFMs: 30x cheaper than GPT-3.5, 97% lower cost, <50ms latency
- Production monitoring of 100% traffic
- Hallucination, prompt injection, PII detection
- Agent action/escalation control
- Multi-agent graph/timeline visualization
- Auto-tuned metrics from live feedback (>95% accuracy without ground truth)
- Integrates with NVIDIA NeMo, Zendesk, Intercom

**What they DON'T have:**
- Tool-level allow/block policy engine
- HITL approval workflow
- Deployment certification
- Key rotation, audit trail with hash chain

**Pricing:** No public pricing. Enterprise-focused with free trial. Funded startup.

**Funding:** Not publicly disclosed in research; SF-based, Fortune 100 customers.

**Threat level to AgentGuard:** LOW-MEDIUM. Strong on evals and observability but light on enforcement. Could expand into policy enforcement.

---

### 1.9 Protect AI (protectai.com) — Acquired by Palo Alto Networks

**What they do:** End-to-end AI security platform — model scanning, red teaming, runtime protection, and AI security posture management.

**Key Products:**
- **Guardian:** AI model scanning for vulnerabilities
- **Recon:** Red teaming for AI applications
- **Layer:** Runtime protection and deep visibility

**Key Features:**
- AI model scanning (484K+ models scanned)
- CVE discovery (2,520+ CVEs submitted)
- huntr bug bounty community (17K+ researchers)
- AI security posture management
- Runtime threat detection
- Also owns Rebuff AI (prompt injection)

**What they DON'T have:**
- Developer-facing tool-level policy SDK
- HITL approval queue for agent actions
- Deployment certification workflow
- GitHub Action for policy-as-code

**Pricing:** Not public. Enterprise sales. Revenue ~$18.3M at acquisition.

**Funding:** $108.5M total before Palo Alto Networks acquisition (April 2025).

**Team:** ~87 employees at acquisition.

**Post-acquisition:** Now part of Palo Alto Networks' Prisma Cloud AI security suite. Will get PANW's massive enterprise distribution.

**Threat level to AgentGuard:** MEDIUM-HIGH long term (PANW distribution), LOW-MEDIUM short term (different focus: ML security vs. agentic runtime).

---

### 1.10 Invariant Labs — Acquired by Snyk

**What they do:** ETH Zurich research spinout building provably-secure agent guardrails. Acquired by Snyk to strengthen Snyk's AI/agent security.

**Key Products:**
- **Invariant Guardrails:** Contextual, real-time detection of PII, secrets, prompt injection, hidden threats
- **Invariant Explorer:** Agent trace visualization and debugging
- **MCP-Scan:** Vulnerability scanning for MCP servers
- **Invariant Gateway:** Zero-config proxy for tracing agent-LLM interactions

**Key Features (unique):**
- Formal security guarantees (verified with proofs)
- Browser agent safety (blocked 100% of BrowserART harmful tasks)
- Static analysis, OCR, HTML parsing for hidden threat detection
- Policy verification with formal proofs
- Multi-agent system support
- MCP server vulnerability scanning

**What they DON'T have (before Snyk):**
- Commercial HITL approval queue
- Deployment certification
- GitHub Action integration
- Key rotation
- Broad enterprise features

**Funding:** Pre-acquisition funding not disclosed. Now part of Snyk's portfolio.

**Threat level to AgentGuard:** MEDIUM. Strong on agent-specific threats and MCP security. The Snyk acquisition gives them developer distribution through Snyk's 1M+ developer user base. This is a real competitive threat for developer-focused segments.

---

### 1.11 Lasso Security (lasso.security)

**What they do:** AI security platform for LLMs focused on content anomaly detection, privacy, and AI application security. Tel Aviv-based, public sector focus.

**Key Features:**
- Autonomous monitoring of all GenAI interactions
- Context-aware access control
- Runtime protection
- Secure LLM integration
- Red and Blue teaming
- 99.8% accuracy, <50ms latency
- 570x more cost-effective than cloud-native guardrails (their claim)
- Defense against 3,000+ attack types
- FedRAMP High, DoD SRG, ITAR, CJIS compliance (via AWS GovCloud)

**Awards:** 2024 Gartner Cool Vendor for AI Security, 2024 Top InfoSec Innovator.

**What they DON'T have:**
- Tool-level policy engine for agent tool calls
- HITL approval queue
- Deployment certification
- Developer SDK focus

**Pricing:** Enterprise custom. No public pricing.

**Funding:** Not publicly disclosed. Tel Aviv, well-funded based on market recognition.

**Target:** Enterprises and US government/defense sectors.

**Threat level to AgentGuard:** LOW-MEDIUM. Strong on regulated/government sector. Limited developer focus.

---

### 1.12 CalypsoAI (calypsoai.com) — Acquired by F5

**What they do:** Enterprise AI security platform with real-time protection, testing, and observability. RSAC Innovation Sandbox finalist 2025. Acquired by F5 ($180M, Sept 2025).

**Key Features:**
- Real-time enforcement at AI decision points
- Seamless Integration API
- Adaptive guardrails
- Policy-based access controls
- SIEM/SOAR compatibility
- Model/vendor-agnostic
- 96%+ accuracy, <100ms latency

**What they DON'T have:**
- Tool-level agentic policy engine
- HITL approval
- Deployment certification
- GitHub Action / developer workflow

**Pricing:** Enterprise custom SaaS.

**Funding:** $45M total; acquired by F5 for $180M.

**Traction:** 450%+ YoY ARR growth pre-acquisition; Fortune 500 customers; 70-100% year-1 account expansion.

**Post-acquisition:** Now part of F5 — major application delivery and security vendor. Will integrate into F5's BIG-IP and distributed cloud offerings.

**Threat level to AgentGuard:** LOW (for developers). MEDIUM (for enterprises already in F5 ecosystem).

---

### 1.13 Pangea (pangea.cloud) — Acquired by CrowdStrike

**What they do:** "Security as a Service" — API platform providing security primitives for developers, including AI-specific guardrails (AI Guard, Prompt Guard).

**Key AI Security Features:**
- AI Guard: Configurable recipes for OWASP Top 10 LLM risks
- Prompt Guard: Jailbreak blocking (99%+ efficacy, <30ms)
- PII scanning and redaction (50+ types)
- Bulk JSON encryption and format-preserving encryption
- Content moderation (100+ languages)
- Threat intelligence (CrowdStrike, DomainTools integrations)
- Tamperproof audit logging
- AI traffic monitoring and governance
- Vault: Quantum-safe cryptography
- AuthN/AuthZ with RBAC/ReBAC/ABAC

**What they DON'T have:**
- Tool-level allow/block/warn for specific agent tools
- HITL approval queue
- Deployment certification
- Key rotation specifically for AI agents

**Pricing:** API usage-based (via Pangea User Console). Specific pricing not public.

**Funding:** Pre-acquisition funding not disclosed. Acquired by CrowdStrike in 2024/2025.

**Post-acquisition:** Now part of CrowdStrike's Falcon platform. CrowdStrike has 24K+ enterprise customers.

**Threat level to AgentGuard:** MEDIUM. Strong developer API approach. With CrowdStrike distribution, could become the default security layer for Falcon-customer AI deployments.

---

### 1.14 Noma Security

**What they do:** Comprehensive AI agent security platform — discovery, posture management, supply chain scanning, and runtime protection. Well-funded ($100M) with Fortune 500 customers.

**Key Features:**
- Comprehensive agent discovery (including shadow AI)
- Agentic Risk Map (blast radius visualization)
- Agent posture management (dangerous risk combinations)
- Runtime protection (prompt injection, tool abuse, data leakage)
- Supply chain scanning (MCP servers, third-party APIs, model dependencies)
- Agentic red teaming
- Compliance audit trails
- Covers: ServiceNow, Salesforce AgentForce, Microsoft Copilot, LangChain, CrewAI, GitHub Copilot
- Gartner AI TRiSM leader; Fortune 500 adoption

**What they DON'T have:**
- Developer-first SDK (enterprise-only GTM)
- GitHub Action / CI integration
- Deployment certification workflow
- Key rotation

**Pricing:** Enterprise custom. No public pricing.

**Funding:** $100M total (Evolution Equity, Ballistic Ventures, Databricks Ventures).

**Team:** ~50-150 employees.

**Threat level to AgentGuard:** HIGH for enterprises. This is AgentGuard's closest competitor at the enterprise level. They have more funding, bigger brand, and deeper feature set for enterprise discovery/posture management. AgentGuard must differentiate on developer experience and tool-level control specificity.

---

### 1.15 Descope

**What they do:** Authentication/identity platform expanding into "Agentic Identity" — managing identity, credentials, and access control for AI agents.

**Key Features (Agentic Identity Hub):**
- Per-agent cryptographic identities
- Scoped, time-bound credentials
- Agent registration and verification (Assessment Flows)
- User Consent Flows (HITL for identity operations)
- End-to-end audit logging with SIEM export
- Scope-based access control via policy engine
- MCP server security (OAuth 2.1, DCR)
- Credential vault for OAuth tokens/API keys
- Agent lifecycle management (registration → offboarding)

**What they DON'T have:**
- Tool-call level allow/block at runtime
- Hash-chained audit trail
- Deployment certification for agents
- Direct agent execution control

**Pricing:** Usage-based. $35M new funding (Sept 2024, $88M total seed).

**Threat level to AgentGuard:** MEDIUM. Strong on identity/auth layer. Overlaps on credentials/key management. They own the identity plane; AgentGuard owns the execution plane. Natural integration opportunity, but could compete.

---

### 1.16 Zenity

**What they do:** Security and governance for enterprise AI agents — focused on SaaS AI (Microsoft Copilot, Salesforce AgentForce, ChatGPT Enterprise).

**Key Features:**
- Agent surface mapping across enterprise SaaS
- AISPM (AI Security Posture Management)
- AI Detection and Response (AIDR)
- Behavior-based threat detection
- Policy enforcement with automated remediation
- Covers: ChatGPT Enterprise, Salesforce, Microsoft Copilot Studio, Azure AI Foundry, Google Vertex AI, Amazon Bedrock, OpenAI AgentKit
- Click-to-fix remediation (delete risky agents/files)
- ChatGPT Enterprise Compliance API integration

**What they DON'T have:**
- Runtime tool-call level policy engine for custom agents
- HITL approval queue
- Deployment certification
- Developer SDK

**Pricing:** Enterprise custom.

**Target:** Security/IT teams at large enterprises using existing AI SaaS platforms.

**Threat level to AgentGuard:** LOW-MEDIUM. Enterprise-SaaS focused; doesn't compete for custom agent builders.

---

### 1.17 Mindgard

**What they do:** Automated AI red teaming platform from UK university research. Tests AI systems, agents, guardrails for vulnerabilities.

**Key Features:**
- Automated adversarial attack simulation
- Attack library (thousands of scenarios)
- System-level testing (models + agents + tools + APIs)
- MITRE ATLAS, OWASP LLM Top 10, NIST AI RMF mapping
- Runtime vulnerability detection
- CI/CD pipeline integration
- Burp Suite extension
- SOC 2 Type II, ISO 27001

**Target:** Security teams, AI red teamers, compliance teams.

**Threat level to AgentGuard:** LOW. Testing/assessment tool, not runtime enforcement. Potential partner.

---

## 2. Open Source Projects

### 2.1 guardrails-ai/guardrails (GitHub)

- **Stars:** ~5K+ (estimated from activity level)
- **Language:** Python
- **Focus:** LLM output validation and formatting
- **Key capabilities:** 65+ validators, custom validator creation, structured output enforcement
- **Limitation for AgentGuard comparison:** Output-focused, not tool-call-level; no HITL, no deployment cert
- **Activity:** Actively maintained; Guardrails Index benchmarking tool launched Feb 2025
- **Business model:** Open core → Guardrails Pro enterprise tier

### 2.2 NVIDIA/NeMo-Guardrails (GitHub)

- **Stars:** ~4K+ (estimated)
- **Language:** Python
- **Focus:** Programmable safety rails using Colang DSL
- **Key capabilities:** Content safety, jailbreak prevention, PII, topic control, RAG grounding
- **Limitation:** Content safety focus, not tool-execution governance; complex Colang language
- **Activity:** Actively maintained; enterprise version via NVIDIA NIM

### 2.3 protectai/rebuff (GitHub)

- **Stars:** ~900 (early stage)
- **Language:** Python
- **Focus:** Prompt injection detection
- **Status:** Alpha, not production-ready
- **Activity:** Limited; primarily research

### 2.4 MCP Security Projects

**MCP-Scan (Invariant Labs, now Snyk):**
- Scans MCP server configurations for vulnerabilities
- Detects: hardcoded credentials, tool poisoning, excessive permissions
- Status: Open source, actively maintained
- Relevance: AgentGuard should consider MCP server security scanning feature

**mcp-remote:** Known RCE vulnerability (CVE-2025-6514, CVSS 9.6) in versions 0.0.5-0.1.15. Fixed in 0.1.16+.

**Astrix MCP Secret Wrapper:** Open source wrapper that injects secrets from vaults (AWS Secrets Manager) into MCP environment variables, preventing hardcoded credentials in MCP configs. Released 2025 following analysis of 5,200+ open-source MCP servers.

**Key finding:** 5,200+ open-source MCP servers analyzed; widespread hardcoded credential problem. This is a greenfield opportunity for AgentGuard's key rotation and secrets management features to extend into MCP server management.

### 2.5 A2A (Agent-to-Agent) Security Projects

**Google A2A Protocol (now Linux Foundation):**
- Open-source protocol for inter-agent communication
- Security features: OAuth 2.0, API keys, RBAC with JWT, HTTPS/TLS 1.2+, mTLS, VPC/IP whitelisting
- Agent Cards mechanism for capability advertisement
- Major contributors: AWS, Microsoft, Salesforce, ServiceNow
- Relevance: AgentGuard should support A2A policy enforcement for multi-agent workflows

**OWASP Agentic Top 10 (2026 edition):**
- ASI01: Agent Goal Hijack (prompt injection)
- ASI02: Tool Misuse
- ASI03: Identity & Privilege Abuse
- ASI04: Agentic Supply Chain Vulnerabilities
- ASI06: Data and Model Poisoning
- This is becoming the compliance framework enterprises will reference; AgentGuard should map features to OWASP Agentic Top 10.

### 2.6 Tool-Use Security Frameworks

- **LangChain Tool Calling:** Callback hooks available for tool interception but no native security layer
- **OpenAI Function Calling:** No native policy enforcement; relies on application-layer controls
- **AWS AgentCore Identity:** AWS re:Invent 2025 — enhanced authentication for AI agents restricting to authorized services
- **Microsoft Semantic Kernel:** A2A protocol integration; no native tool-call security layer
- **CrewAI:** No native security; relies on underlying tools

**Key gap:** No major open-source framework has tool-call level allow/block/warn as a first-class security primitive. AgentGuard fills this gap in the open-source ecosystem — this is the strongest PLG argument.

---

## 3. Feature Gap Analysis

| Feature | AgentGuard | Lakera | Guardrails AI | NeMo | Noma | Pangea | Invariant | Descope | Galileo |
|---------|-----------|--------|---------------|------|------|--------|-----------|---------|---------|
| **Tool-level allow/block/warn** | ✅ | ❌ | ❌ | ❌ | Partial | ❌ | Partial | ❌ | ❌ |
| **Policy engine (allow/block/monitor lists)** | ✅ | ❌ | Partial | Partial | ✅ | Partial | Partial | Partial | ❌ |
| **HITL approval queue** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Partial | ❌ |
| **Deployment certification (validate/certify)** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Audit trail with hash chain** | ✅ | ❌ | ❌ | ❌ | Partial | Partial | ❌ | Partial | ❌ |
| **Key rotation** | ✅ | ❌ | ❌ | ❌ | ❌ | Via Vault | ❌ | Via Vault | ❌ |
| **Webhook notifications** | ✅ | ❌ | ❌ | ❌ | Partial | ❌ | ❌ | ❌ | ❌ |
| **Node SDK** | ✅ | Partial | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ |
| **Python SDK** | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **CLI** | ✅ | ❌ | Partial | ❌ | ❌ | Partial | ❌ | ❌ | ❌ |
| **GitHub Action** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Prompt injection detection** | ❌ | ✅ | Partial | ✅ | ✅ | ✅ | ✅ | ❌ | Partial |
| **PII detection/redaction** | ❌ | ✅ | Partial | ✅ | ✅ | ✅ | ✅ | ❌ | Partial |
| **Content moderation** | ❌ | ✅ | ✅ | ✅ | Partial | ✅ | ❌ | ❌ | Partial |
| **Agent discovery/inventory** | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | Partial | Partial | ❌ |
| **AI red teaming** | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Observability/traces** | Partial | Partial | Partial | ❌ | ✅ | Partial | ✅ | ✅ | ✅ |
| **MCP server security** | ❌ | ❌ | ❌ | ❌ | Partial | ❌ | ✅ (MCP-Scan) | Partial | ❌ |
| **A2A/multi-agent support** | ❌ | ❌ | ❌ | ❌ | Partial | ❌ | Partial | Partial | ❌ |
| **Templates / policy library** | ✅ | ❌ | ✅ | Partial | ❌ | ❌ | ❌ | ❌ | ❌ |
| **OWASP Agentic mapping** | ❌ | Partial | ❌ | Partial | Partial | Partial | ✅ | ✅ | ❌ |
| **Open source** | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Self-hostable** | ❌ | Enterprise | ✅ | ✅ | ❌ | Limited | ✅ | Limited | Limited |

**AgentGuard's unique combination:** Tool-level policy + HITL + Deployment Certification + Hash-chain audit + GitHub Action = **no competitor has this full stack**. This is the moat.

**AgentGuard's gaps vs. the market:**
1. No prompt injection / content safety detection (everyone else has this)
2. No agent/shadow AI discovery (Noma, Zenity)
3. No AI red teaming (Mindgard, Lakera, Noma)
4. No MCP server scanning (Invariant/Snyk)
5. Limited observability/trace visualization
6. No OWASP Agentic Top 10 compliance mapping
7. No self-hosted option (reduces enterprise adoption)
8. No A2A / multi-agent policy enforcement

---

## 4. Features We Should Add

### Priority 1: Table Stakes (Must Have)

**1a. Prompt Injection Detection**
- Every enterprise AI security evaluation starts here. Without it, AgentGuard fails the first line of the security checklist.
- Approach: Partner with or license Lakera Guard or NeMo, OR build a lightweight classifier. Don't need to be the best at this — need to have it. A simple HITL-flagging integration ("suspected injection → queue for human review") would be more differentiated than a standalone blocker.
- Differentiation: Other tools detect and drop. AgentGuard detects and routes to HITL — more enterprise-friendly for compliance.

**1b. PII Detection & Redaction**
- Required for HIPAA, GDPR, financial compliance use cases.
- Approach: Integrate Microsoft Presidio (open source) or similar as a built-in validator in the policy engine.
- AgentGuard angle: PII detected in tool calls → block OR redact before execution → log to audit trail.

**1c. OWASP Agentic Top 10 Compliance Report**
- Low-cost, high-value feature: generate a compliance report mapping AgentGuard's enforcement coverage to OWASP Agentic Top 10.
- This becomes the sales enablement tool. Security teams need to show CISOs they've addressed these risks.

### Priority 2: High Differentiation (Should Build)

**2a. Self-Hosted / VPC Deployment**
- Enterprises with regulated data (banking, healthcare, defense) CANNOT send data to SaaS. This blocks enterprise sales right now.
- Approach: Docker Compose + Helm chart. Self-hosted mode with all features except cloud dashboard.
- Competitive advantage: Most SaaS competitors don't offer this or charge enterprise premium.

**2b. MCP Server Policy Enforcement**
- MCP is the new attack surface. 5,200+ MCP servers have credential exposure issues. CISOs are waking up to this.
- Build: Policy rules that apply to MCP tool calls specifically. Extend key rotation to cover MCP secrets.
- AgentGuard + MCP-level control = unique in market right now.
- First-mover opportunity: Invariant/Snyk has MCP-Scan (scanning), but no one has runtime MCP policy enforcement with HITL.

**2c. Agent Identity & Credential Vault**
- AI agents need non-human identities with scoped, rotatable credentials.
- Descope is building this; AgentGuard should build it into the key rotation feature.
- Feature: Assign agent IDs, store credentials in AgentGuard vault, rotate on schedule, log all credential usage.
- Competitive position: Descope focuses on identity; AgentGuard can own identity + execution control together.

**2d. Multi-Agent Policy Propagation (A2A)**
- As agents spawn sub-agents (CrewAI, AutoGen patterns), policy needs to propagate.
- Feature: Parent-agent policy automatically applies to child agents. Policy inheritance model.
- This is table stakes for 2026 as multi-agent systems become mainstream.

**2e. Shadow Agent Discovery**
- Feature: Scan CI/CD pipelines and infrastructure (GitHub Actions, AWS Lambda functions, Kubernetes deployments) to identify AI agents that aren't registered with AgentGuard.
- This is how Noma gets enterprise CISOs excited. "You have 47 agents and only 12 are secured."

### Priority 3: Revenue and Moat (Build for Differentiation)

**3a. Policy-as-Code with GitOps**
- Extend the GitHub Action to support full policy-as-code workflow:
  - Policy files live in repo as YAML
  - PR reviews trigger policy validation in CI
  - Merges auto-deploy policy updates
  - Policy versioning with rollback
- This is the "Terraform for AI agent security" narrative. Infrastructure engineers will love it.

**3b. AI Red Team Integration**
- Don't build red teaming — integrate with Mindgard or Giskard via API.
- Feature: "Run red team scan before certifying deployment." Pre-certification red team becomes part of the certification workflow.
- This makes AgentGuard's deployment certification much stronger.

**3c. Compliance Dashboard (SOC 2 / ISO 42001 / EU AI Act)**
- Build a compliance posture dashboard that shows:
  - Which agents are certified
  - Which OWASP Agentic risks are covered
  - Audit trail exports for auditors
  - EU AI Act high-risk system checklist
- This is a $50K–$200K conversation opener with regulated enterprises.

**3d. Cost Anomaly Detection**
- Agentic security isn't just safety — it's cost safety.
- Feature: Detect unusual tool call patterns that may indicate runaway agents (excessive API calls, abnormal spend patterns).
- Alert, block, or route to HITL based on cost thresholds.
- This is something no one else is building and every enterprise deploying agents will care about.

**3e. LangSmith / LangFuse Integration**
- Enterprises using LangSmith for observability want AgentGuard for enforcement.
- Build bidirectional integration: AgentGuard policy violations show up in LangSmith traces; LangSmith-detected anomalies can trigger AgentGuard HITL queues.
- This is a huge distribution play — meet developers where they already are.

### Priority 4: Ecosystem (Grow Distribution)

**4a. Open-Source Core**
- Consider open-sourcing the core policy engine under Apache 2.0 (similar to Guardrails AI's model).
- Keep HITL dashboard, certification, enterprise features commercial.
- This gives AgentGuard the GitHub star flywheel and community adoption that Lakera and Noma lack.
- The "security tool you can trust because you can read the code" message resonates with developers.

**4b. Terraform Provider**
- Infrastructure teams want to manage AgentGuard policies via Terraform.
- A published Terraform provider puts AgentGuard in every DevOps tooling conversation.

**4c. Slack/Teams HITL Interface**
- Human reviewers shouldn't need to log into a dashboard to approve agent actions.
- Feature: HITL approval requests delivered to Slack/Teams channels. Approve or reject with a button click.
- This dramatically reduces HITL friction and increases enterprise adoption.

---

## 5. Pricing Intelligence

### What Competitors Charge

| Competitor | Model | Estimated Range |
|-----------|-------|-----------------|
| LangSmith | Seat-based + usage | Free → $39/seat/mo → $100K+/year |
| Guardrails AI | Free OS + per-validation | Free → custom Pro |
| Lakera Guard | Enterprise custom | $60K–$200K/year (estimated) |
| NeMo Guardrails | Free open source | $0 (infra costs for NIM) |
| Pangea | API usage-based | Tiered; enterprise custom |
| Protect AI | Enterprise custom | $100K+/year (estimated) |
| CalypsoAI | Enterprise custom | $50K–$150K/year (estimated) |
| Arthur AI | Enterprise custom | $100K–$300K/year (estimated) |
| Noma | Enterprise custom | $100K–$500K/year (estimated) |

**Industry benchmarks:**
- Safety/governance frameworks: $30K–$100K/year
- Agent orchestration/security platforms: $60K–$200K/year
- Full enterprise AI security suite: $100K–$500K/year

### AgentGuard Pricing Recommendation

**Tier 1: Developer (Free)**
- Up to 10K tool evaluations/month
- 1 agent deployment
- Community policy templates
- 14-day audit retention
- Community support
- Goal: Drive adoption, GitHub stars, word-of-mouth

**Tier 2: Team ($149/month or $1,499/year)**
- Up to 500K tool evaluations/month
- 5 agent deployments
- HITL queue (up to 3 reviewers)
- 90-day audit retention + CSV export
- Webhook notifications
- Email support
- Goal: Startups and growing teams

**Tier 3: Growth ($499/month or $4,999/year)**
- Up to 5M tool evaluations/month
- 25 agent deployments
- Unlimited HITL reviewers
- 1-year audit retention + API export
- Deployment certification
- Key rotation
- Slack/Teams HITL integration
- Priority support
- Goal: Scale-ups and series A/B companies

**Tier 4: Enterprise (Custom, starting $2,000/month)**
- Unlimited evaluations
- Unlimited agents
- Self-hosted VPC option
- SSO / RBAC
- Custom retention / compliance exports
- SOC 2 / HIPAA business associate agreement
- EU AI Act compliance mapping
- Dedicated CSM
- SLA guarantees
- Custom policy templates
- Goal: Fortune 500, regulated industries, public sector

**Usage-Based Add-ons:**
- Additional evaluations: $0.001 per evaluation (beyond plan limits)
- HITL seat: $20/month/additional reviewer
- Extended retention: $5/month per 30 additional days

**Rationale:**
- Developer free tier creates a developer community flywheel
- Team tier captures the "serious startup" segment Guardrails AI misses
- Growth tier hits the sweet spot for series A/B companies before enterprise
- Enterprise ACV of $24K–$60K+ is achievable and competitive
- Usage-based overage creates natural upsell pressure

---

## 6. Go-to-Market Insights

### How Competitors Acquire Users

**Lakera:** Developer content marketing (Gandalf game — viral prompt injection playground), conference presence (Black Hat, RSA), enterprise sales team. Fortune 100 reference customers (Dropbox, Citi) close enterprise deals.

**Guardrails AI:** Open source PLG. Python package on PyPI → free users → Pro conversion. Blog content on AI validation/guardrails.

**NeMo Guardrails:** NVIDIA distribution (embedded in NVIDIA developer resources, NVIDIADGX Cloud). No marketing needed — reaches AI engineers through the NVIDIA ecosystem.

**Protect AI:** Developer community (huntr bug bounty with 17K researchers), security conference presence, MLOps community. Acquired through developer trust in the security research community.

**Noma:** Enterprise sales, CISO relationships, Gartner reports, RSA conference, analyst briefings.

**Pangea:** Developer API-first (developer.pangea.cloud), docs-first approach, free tier, startup program.

**Invariant/Snyk:** Research papers, ETH Zurich credibility, GitHub presence, Snyk's existing developer community.

### What Channels Work

**For Developer Adoption (AgentGuard's Primary Lever):**
1. **GitHub:** Open-source core or at minimum a solid GitHub presence. Stars = credibility. GitHub Action = where developers already are.
2. **Hacker News:** Show HN post drives quality developer traffic. The AI security angle resonates there. (Note: there's already a SHOW_HN_DRAFT.md in the project — prioritize this.)
3. **Twitter/X:** AI developer community is highly active. Build in public. Share what you're learning about agent security threats.
4. **Discord/Slack communities:** LangChain Discord, HuggingFace community, AI Engineer community — these are where developers ask "how do I secure my agent?"
5. **Dev.to and Medium:** Tutorial content ("How to add HITL to your LangChain agent in 5 minutes") drives organic search traffic.

**For Enterprise Sales:**
1. **Gartner AI TRiSM reports:** Getting listed as a representative vendor (even as a niche player) is worth the analyst engagement investment.
2. **RSA and Black Hat:** Where CISOs and AppSec teams shop for security vendors.
3. **LinkedIn:** Security buyer persona is heavily LinkedIn. Thought leadership on agent security risks.
4. **Partner with frameworks:** LangChain, CrewAI, AutoGen integrations. When a developer installs a framework and sees "AgentGuard integration available," that's distribution.
5. **Compliance-driven:** EU AI Act (effective Aug 2026 for high-risk systems) and emerging US AI regulations will force enterprises to add governance. Be the "we help you comply" vendor.

### Messaging That Resonates

**For Developers:**
- "Add runtime security to your AI agent in 3 lines of code"
- "Your agent did something? Know exactly what, why, and who approved it."
- "Fail safe, not fail silent."
- Problem-first: "Your agent has access to your database, email, and calendar. What happens when someone prompts it wrong?"

**For Security Teams:**
- "Tool-level policy enforcement for AI agents" (the feature they don't know they need until they hear it)
- "Every agent action is auditable and immutable"
- "Human approval for high-risk agent actions — before they happen"
- Map to OWASP Agentic Top 10 for immediate credibility

**For CISOs/Compliance:**
- "Certify your AI agents before they reach production"
- "Audit trail that satisfies your auditors"
- "Compliance documentation built in"
- EU AI Act and SOC 2 Type II angle

**Anti-patterns to avoid:**
- "AI guardrails" — too generic, associated with content safety
- "LLM security" — dated, doesn't capture agentic specificity
- Leading with prompt injection — everyone claims this; it's expected now

**Winning positioning statement:**
> "AgentGuard is the runtime security platform for AI agents that actually *do things*. Tool-level policy enforcement, human-in-the-loop approvals, and tamper-proof audit trails — so you can deploy AI agents confidently."

### Acquisition Trends as GTM Signal

7 major acquisitions in 2025 (Lakera→Check Point, Pangea→CrowdStrike, CalypsoAI→F5, Protect AI→Palo Alto Networks, Invariant→Snyk, etc.) signal that:

1. **Large security vendors are buying, not building.** If AgentGuard builds real traction, it becomes an acquisition target.
2. **The acquirers' gaps are AgentGuard's opportunity.** Check Point now has Lakera (content safety). They don't have tool-level governance. Palo Alto now has Protect AI (ML scanning). They don't have HITL. These gaps persist post-acquisition.
3. **Distribution through partnerships is faster than direct sales.** The acquirers are looking to integrate AI security into existing offerings — AgentGuard can partner with the ones who have gaps in the tool-governance/HITL/certification space.

---

## 7. Competitive Landscape Summary Map

```
                    CONTENT SAFETY ←————————————————→ TOOL GOVERNANCE
                         |                                      |
  HIGH ENTERPRISE  →  Noma, Zenity                    AgentGuard ← UNIQUE
                        |                               
  MID MARKET     →   Lakera, CalypsoAI           
                        |
  DEVELOPER/OSS  →   Guardrails AI, NeMo         Pangea (API), Invariant
                        |
  OBSERVABILITY  →   LangSmith, Galileo, Arthur
                        
  IDENTITY       →   Descope
  
  RED TEAM       →   Mindgard, Protect AI Recon
```

**AgentGuard's whitespace:** Tool governance + HITL + Certification, developer-accessible, policy-as-code. No one owns this.

---

## 8. Recommended 90-Day Product Priorities

Based on this analysis:

1. **Ship prompt injection detection** (week 1-2): Partner or build basic classifier. Don't let this be a checkbox failure in enterprise evals.
2. **Add PII detection to policy engine** (week 2-4): Microsoft Presidio integration. Required for first regulated enterprise customer.
3. **Publish OWASP Agentic Top 10 mapping** (week 1): Marketing/documentation effort. Zero code. Huge credibility gain.
4. **Build Slack/Teams HITL integration** (week 3-6): Removes #1 HITL friction point. Differentiated from all competitors.
5. **Self-hosted Docker option** (week 4-8): Unblocks all regulated enterprise deals. Current blocker.
6. **MCP server policy support** (week 6-10): First mover advantage. CISOs asking about MCP security now.
7. **LangSmith integration** (week 4-8): Distribution play. Reach LangSmith's existing user base.
8. **Policy-as-Code GitOps workflow** (week 8-12): Differentiation for platform/DevOps teams.

---

## 9. Key Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| LangChain adds native tool-level policies | Medium | High | Move faster on developer experience; open-source core |
| Noma moves downstream to developers | Medium | High | Own the "developer-first" position; pricing, docs, DX |
| Large cloud (AWS, Azure, GCP) provides built-in agent security | High | Very High | Integrate with cloud-native tools; position as cloud-agnostic |
| Open-source clone of AgentGuard's core features | High | Medium | Community, brand, enterprise features, network effects |
| Check Point/Lakera expands from content safety to tool governance | Low | High | Differentiate hard on HITL+certification; enterprise focus |
| Market confusion between AgentGuard and AI safety/alignment | Medium | Low | Clear messaging: "runtime security for agentic actions" |

---

*Report compiled from web research, company websites, funding databases, and security conference coverage. Pricing ranges are estimates based on market intelligence — actual figures require direct vendor engagement. Market dynamics in AI security are moving extremely fast; recommend refreshing this scan quarterly.*

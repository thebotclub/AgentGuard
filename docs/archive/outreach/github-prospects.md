# AgentGuard — GitHub Prospect List

> Generated: 2026-03-11
> Source: GitHub API search for LangChain / CrewAI / AutoGen agent projects with recent activity (pushed after 2026-02-09), <500 stars, excluding big-company repos.
> Emails: Only publicly listed GitHub profile emails included.

---

## Section A: Agent Security Builders (Adjacent / Potential Partners)

These developers are building agent security tools — they understand the problem space deeply. Outreach angle: collaboration, integration, comparison, or community building.

| Username | Email | Repo | Framework / Stack | Personalisation Hook |
|----------|-------|------|-------------------|---------------------|
| **provos** | — | [ironcurtain](https://github.com/provos/ironcurtain) (⭐116) — Secure runtime for autonomous AI agents with policy from plain-English constitutions | Node.js, TypeScript | Niels Provos (Mountain View) built a "constitution-based" security runtime for agents. He openly admits it's a research prototype and says "when someone writes 'secure,' you should be skeptical." Great opening for a peer conversation about what production-grade agent security actually looks like. |
| **darfaz** | — | [clawmoat](https://github.com/darfaz/clawmoat) (⭐25) — Security moat for AI agents: runtime protection against prompt injection, tool misuse, data exfiltration | Node.js, npm package | ClawMoat focuses on the defensive perimeter — prompt injection, tool misuse, data exfil. Published on npm. Could be a natural integration partner or someone who'd appreciate AgentGuard's complementary approach. |
| **angelnicolasc** | — | [agentmesh](https://github.com/angelnicolasc/agentmesh) (⭐4) — Deterministic governance middleware for AI agents, no LLM in the eval loop | Python, supports LangGraph/CrewAI/AutoGen | Nick (Buenos Aires) is building AgentMesh — "the governance layer between your agent and everything it can touch." Claims <2ms policy eval, 798 tests passing. He's an entrepreneur explicitly building in the agent governance space. Direct competitor but also potential ally. Website: useagentmesh.com |
| **log-bell** | — | [avakill](https://github.com/log-bell/avakill) (⭐4) — Open-source safety firewall for AI agents, intercepts tool calls before execution | Python, YAML policies, works with OpenAI/Anthropic/LangChain | Logan Bell (Austin, TX) built AvaKill — "one YAML policy" to block dangerous agent operations. 2,108 tests, 63/63 red team attacks blocked. His "firewall" framing is adjacent to AgentGuard's "runtime security" angle. |
| **PlawIO** | team@plaw.io | [veto](https://github.com/PlawIO/veto) (⭐5) — Authorization kernel for AI agents: block, allow, or escalate tool calls with YAML rules | TypeScript + Python SDKs | Plaw (US) calls Veto "sudo for AI agents" — deterministic-first with LLM fallback. Published on both npm and PyPI. They have a team email, suggesting a small company. Good partner/integration candidate. |
| **AdityaBelhekar** | — | [AgentShield](https://github.com/AdityaBelhekar/AgentShield) (⭐1) — Real-time security runtime for AI agents, wraps LangChain/AutoGen/CrewAI with invisible monitoring | Python, LangChain/AutoGen/CrewAI | AgentShield's pitch is "the only runtime that secures AI agents from the inside" — wraps existing agents with no code changes. Early stage (v0.1.0). Could be interested in comparing approaches or collaborating. |
| **amabito** | keita.a.0609@gmail.com | [veronica-core](https://github.com/amabito/veronica-core) (⭐2) — Runtime containment for LLM agents: token budgets, concurrency gates, adversarial hardening | Python, zero dependencies | Keita A. (Japan) is building VERONICA to "stop LLM agent runs from burning money." Focused on cost containment — retry cascades, infinite loops, surprise API bills. 4,837 tests, 94% coverage. His angle is cost; AgentGuard's is security. Complementary. |
| **dean0x** | — | [mino](https://github.com/dean0x/mino) (⭐2) — Secure sandbox for AI coding agents with temporary credentials and filesystem isolation | Rust, OrbStack + Podman | Dean Sharon built Mino as a sandboxing wrapper using rootless containers. Published on both crates.io and npm. Focused on coding agents specifically — a narrower use case where AgentGuard could add value on the policy/governance layer. |
| **xcanwin** | — | [manyoyo](https://github.com/xcanwin/manyoyo) (⭐1) — AI Agent CLI security sandbox for running agents in YOLO/SOLO mode safely | Python | Chinese security expert at a major e-commerce company. Built manyoyo specifically so people can run `claude --dangerously-skip-permissions` safely. Niche but relevant — clearly cares about agent runtime safety. |
| **markamo** | — | [envpod-ce](https://github.com/markamo/envpod-ce) (⭐1) — Zero-trust governance environments for AI agents | Unknown | Early-stage zero-trust governance project for agents. Minimal public info but the framing aligns perfectly with AgentGuard's mission. |
| **yeasy** | — | [carapace](https://github.com/yeasy/carapace) (⭐1) — Runtime security for AI agents, works with OpenClaw/LangChain/CrewAI | Python | Baohua Yang (Bay Area) — experienced open-source contributor building runtime security specifically for agent frameworks. Multi-framework support makes this directly relevant. |

---

## Section B: Agent Builders (Potential Customers)

These developers are building AI agents with tool calling and would benefit from runtime security. Outreach angle: "your agents call tools autonomously — how do you prevent them from going off the rails?"

| Username | Email | Repo | Framework / Stack | Personalisation Hook |
|----------|-------|------|-------------------|---------------------|
| **realyinchen** | — | [AgentHub](https://github.com/realyinchen/AgentHub) (⭐75) — Modular AI agent platform with FastAPI + React frontend | LangChain, LangGraph | Nicholas (Hefei, China) built a full agent platform with multiple LangChain/LangGraph agents and a web UI. 75 stars shows real traction. Agents do tool orchestration — perfect candidate for "what happens when your agent calls the wrong tool?" |
| **ThirdKeyAI** | info@thirdkey.ai | [Symbiont](https://github.com/ThirdKeyAI/Symbiont) (⭐34) — Rust-native AI agent runtime with zero-trust security, multi-tier sandboxing, Cedar policy | Rust, MCP tools | ThirdKey.AI (US) is building a full trust stack — zero-trust, Cedar policies, cryptographic audit trails. They're a small AI safety company already thinking about governance. Could be a customer, partner, or integration target. Website: thirdkey.ai |
| **yaalalabs** | hello@yaalalabs.com | [agent-kernel](https://github.com/yaalalabs/agent-kernel) (⭐24) — Multi-cloud, framework-agnostic AI agent runtime for OpenAI/CrewAI/LangGraph/Google ADK | CrewAI, LangGraph, OpenAI, Google ADK | Yaala Labs (Colombo, Sri Lanka) is building a multi-cloud agent deployment platform. They support 4+ frameworks and deploy to AWS/Azure. Production-focused — security at the deployment layer is a natural sell. Website: yaalalabs.com |
| **romanklis** | — | [openclaw-contained](https://github.com/romanklis/openclaw-contained) (⭐19) — Runs AI agents in sandboxed Docker containers with capability-based security | Docker, capability-based security | Roman (Switzerland) built a capability-based security model where agents start with minimal permissions and must request new ones. He's already thinking about least-privilege for agents — AgentGuard's policy enforcement would complement his container isolation. |
| **jovanSAPFIONEER** | — | [Network-AI](https://github.com/jovanSAPFIONEER/Network-AI) (⭐16) — TypeScript/Node multi-agent orchestrator with shared state, guardrails, adapters for 14 AI frameworks | TypeScript, 14 framework adapters | Jovan Marinovic built a "traffic light for AI agents" — multi-agent orchestrator with guardrails for 14 frameworks. The breadth of framework support means he's already thinking about cross-framework governance. |
| **botextractai** | — | [ai-langchain-react-agent](https://github.com/botextractai/ai-langchain-react-agent) (⭐13) + [ai-autogen-tools](https://github.com/botextractai/ai-autogen-tools) (⭐9) | LangChain, AutoGen | Bruno Bosshard (Brisbane, Australia) at botextract.ai builds ML/GenAI solutions. Has both LangChain and AutoGen agent repos with Python REPL tool access — agents that can execute arbitrary code. Classic security risk vector. Website: botextract.ai |
| **kweaver-ai** | — | [sandbox](https://github.com/kweaver-ai/sandbox) (⭐8) — High-performance code execution service for AI agent apps with multi-layered security isolation | Custom runtime | KWeaver (Shanghai) built a dedicated sandbox runtime for agent code execution with multi-layered isolation. They're already solving the execution security problem — AgentGuard could add the policy/governance layer on top. Website: kweaver.ai |
| **Genesis1231** | — | [Eva01](https://github.com/Genesis1231/Eva01) (⭐2) — AI being with mind, feelings, memory; multimodal, multilingual, modular | LangChain, multimodal | Adam built Eva01 as a persistent AI agent with memory, voice, face recognition, and tool calling. A fully autonomous agent with a "life" — exactly the kind of system that needs runtime security guardrails. |
| **djsoftware1** | — | [runai](https://github.com/djsoftware1/runai) (⭐2) — AI terminal integration for task automation with AutoGen multi-agents | AutoGen | David Joffe builds runai as an "AI extension of your terminal" — cross-platform task automation with AutoGen agents. Agents that run terminal commands need security boundaries. Website: djoffe.com |
| **nuyeo** | bluelayzxx@gmail.com | [sendbird-agent](https://github.com/nuyeo/sendbird-agent) (⭐1) — Customer support AI agent with RAG and tool calling | LangChain, FastAPI | Yeonu (Seoul) built a customer support agent with RAG and tool calling via LangChain. Customer-facing agents with tool access are high-stakes — security matters for production deployment. |
| **sergiogaiotto** | sergio.gaiotto@gmail.com | [supeRAG](https://github.com/sergiogaiotto/supeRAG) (⭐1) — Advanced RAG system with Deep Agents, LangChain/LangGraph, Pinecone, reranking | LangChain, LangGraph, Pinecone | Sergio Gaiotto (São Paulo) built an advanced RAG system with agentic generation and system prompts for guardrails. He's already thinking about guardrails in his agent pipeline — AgentGuard could formalise what he's doing ad-hoc. |
| **jawahar-singamsetty** | — | [retrivis.ai-server](https://github.com/jawahar-singamsetty/retrivis.ai-server) (⭐1) — Production-grade multimodal RAG backend with agentic generation and guardrails | LangChain, FastAPI, Supabase pgvector | Jawahar S R built a production RAG backend that explicitly mentions "guardrails" in the description. He's deploying agents with guardrails already — a natural audience for a dedicated runtime security solution. |
| **Lochan09** | — | [AgenticInsight](https://github.com/Lochan09/AgenticInsight) (⭐1) — AI-native code audit platform using CrewAI + FastAPI | CrewAI, FastAPI, Google Gemini | Lochan built an AI code auditor using CrewAI that scans for security vulnerabilities and performance issues. Ironic opportunity: his tool audits code security, but who audits the agent? |
| **dhia7an** | — | [agent-sdk](https://github.com/dhia7an/agent-sdk) (⭐1) — Lightweight agent SDK for Node.js with tool calls, planning, multi-agent handoffs | Node.js, custom SDK | Building a lightweight agent SDK focused on "transparent, message-first agents." SDK authors are high-leverage targets — if AgentGuard integrates at the SDK level, every downstream user benefits. |
| **tareksyria** | — | [SREAgents](https://github.com/tareksyria/SREAgents) (⭐0) — AI-driven SRE agents for automating operations with natural language and monitoring tools | AI agents, monitoring tools | Tarek is building SRE agents that automate infrastructure operations. Agents with access to production infrastructure are the highest-risk category — a compelling security story. |
| **CharlesDaniel52** | — | [YAML-Multi-Agent-Orchestrator](https://github.com/CharlesDaniel52/YAML-Multi-Agent-Orchestrator) (⭐1) — Declarative multi-agent AI workflows in YAML | Multi-agent orchestration | Building a YAML-based multi-agent orchestrator. Declarative workflow definitions could integrate naturally with declarative security policies. |

---

## Summary

| Category | Count | With Public Email |
|----------|-------|-------------------|
| Agent Security Builders (partners/competitors) | 11 | 2 (PlawIO: team@plaw.io, amabito: keita.a.0609@gmail.com) |
| Agent Builders (potential customers) | 16 | 4 (ThirdKeyAI: info@thirdkey.ai, yaalalabs: hello@yaalalabs.com, nuyeo: bluelayzxx@gmail.com, sergiogaiotto: sergio.gaiotto@gmail.com) |
| **Total** | **27** | **6** |

## Outreach Priority

### Tier 1 — High-value, have email
1. **ThirdKeyAI** (info@thirdkey.ai) — Already building agent security; potential partner
2. **yaalalabs** (hello@yaalalabs.com) — Multi-cloud agent platform; production-focused customer
3. **PlawIO** (team@plaw.io) — Building "sudo for agents"; natural integration partner
4. **amabito** (keita.a.0609@gmail.com) — Building cost containment for agents; complementary product
5. **sergiogaiotto** (sergio.gaiotto@gmail.com) — Using guardrails in production RAG; warm lead
6. **nuyeo** (bluelayzxx@gmail.com) — Customer-facing agent with tool calling

### Tier 2 — High-value, no email (reach via GitHub issues/discussions)
7. **provos** (ironcurtain, 116⭐) — Research prototype in agent security; thought leader
8. **darfaz** (clawmoat, 25⭐) — Security moat for agents; direct peer
9. **realyinchen** (AgentHub, 75⭐) — Full agent platform with tool orchestration
10. **angelnicolasc** (agentmesh) — Entrepreneur building agent governance middleware
11. **log-bell** (avakill) — Safety firewall for agents; Austin TX
12. **romanklis** (openclaw-contained) — Capability-based agent sandboxing
13. **jovanSAPFIONEER** (Network-AI) — Multi-agent orchestrator with guardrails for 14 frameworks
14. **botextractai** (both LangChain + AutoGen repos) — Brisbane ML consultant

### Tier 3 — Relevant but lower signal
15-27. Remaining prospects — smaller projects but still in the target audience. Best approached through community engagement (starring repos, opening issues, conference meetups).

---

## Notes
- **Excluded**: microsoft/agent-governance-toolkit (big company), GurenMurasaki/Job-Applications-Multi-Ai-Agents (spam/download bait), FelipeDaza7/swarm-tools (spam/download bait)
- **longzhi** (longzhi@gmail.com) building clawhive (Rust AI agent platform with security sandbox, 37⭐) could also be a good partner — omitted from main table as framework didn't match LangChain/CrewAI/AutoGen specifically but worth noting
- Many developers without public emails can be reached via GitHub Discussions, issue comments, or by finding them on Twitter/LinkedIn through their profile links
- All emails sourced exclusively from public GitHub profiles via the API

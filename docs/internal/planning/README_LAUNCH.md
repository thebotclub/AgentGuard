<div align="center">

<!-- LOGO PLACEHOLDER: replace with actual SVG/PNG logo -->
<img src="assets/agentguard-logo.png" alt="AgentGuard" width="120" height="120" />

# AgentGuard

**Runtime policy enforcement for AI agents.**

[![Build](https://img.shields.io/github/actions/workflow/status/thebotclub/agentguard/test-coverage.yml?branch=main&label=build&logo=github)](https://github.com/thebotclub/agentguard/actions)
[![Coverage](https://img.shields.io/badge/coverage-67%25-yellow)](https://github.com/thebotclub/agentguard/actions)
[![License](https://img.shields.io/badge/license-BSL_1.1-orange)](LICENSE)
[![npm](https://img.shields.io/npm/v/@the-bot-club/agentguard?color=4f46e5&logo=npm)](https://www.npmjs.com/package/@the-bot-club/agentguard)
[![PyPI](https://img.shields.io/pypi/v/agentguard-tech?color=4f46e5&logo=pypi)](https://pypi.org/project/agentguard-tech/)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/thebotclub)
[![Tests](https://img.shields.io/badge/tests-193_passing-brightgreen)](https://github.com/thebotclub/agentguard/actions)

[**Website**](https://agentguard.tech) · [**Docs**](https://docs.agentguard.tech) · [**Pricing**](https://agentguard.tech/pricing) · [**Demo**](https://demo.agentguard.tech) · [**Twitter/X**](https://x.com/agentguardtech)

</div>

---

> AgentGuard sits between your AI agent and its tools. Every tool call — database queries, API requests, file operations, shell commands — is evaluated against configurable policies before execution. Block threats. Log everything. Kill rogue agents instantly.

---

## ✨ Features

- 🔴 **Kill Switch** — One API call halts every agent in your tenant. Instantly. No waiting, no exceptions.
- ⚡ **Sub-millisecond policy engine** — Evaluations run in-process. Zero network latency on the hot path.
- 🔍 **Prompt injection detection** — Heuristic + Lakera Guard adapter. Catches instruction overrides, role-play jailbreaks, and system-prompt leakage.
- 🔗 **Hash-chained audit trail** — SHA-256 tamper-evident log. Cryptographically provable. Court-admissible.
- 🤝 **Framework-native SDKs** — LangChain, CrewAI, AutoGen, LangGraph, MCP. Drop-in wrappers, zero boilerplate.
- 📋 **Compliance policy templates** — SOC 2, EU AI Act, OWASP Agentic Top 10, APRA CPS 234, Financial Services baselines out of the box.
- 🔔 **Webhook + HITL alerts** — HMAC-signed webhooks on block/kill events. Route to Slack, PagerDuty, or your own systems.
- 🆔 **Agent identity & scoping** — Per-agent API keys with policy scopes. Know exactly which agent did what.

---

## 🚀 Quick Start

Three commands to your first policy enforcement:

```bash
# 1. Install
npm install @the-bot-club/agentguard
```

```typescript
// 2. Wrap your agent
import { AgentGuard } from '@the-bot-club/agentguard';

const guard = new AgentGuard({ apiKey: process.env.AG_API_KEY });
```

```typescript
// 3. Evaluate before every tool call
const decision = await guard.evaluate({
  tool: 'database_query',
  action: 'execute',
  input: { query: 'DROP TABLE users' }
});
// → { result: 'block', reason: 'Destructive SQL operation', riskScore: 95 }
```

> **Python?** `pip install agentguard-tech` — same API, same policies.

Free tier includes 10,000 tool-call evaluations/month. [Sign up →](https://agentguard.tech/signup)

---

## 🏗️ Architecture

```
Your AI Agent (LangChain / CrewAI / AutoGen / custom)
       │
       │  every tool call
       ▼
┌──────────────────────────────────────────────────────┐
│                   AgentGuard SDK                      │
│                 (in-process, <1ms)                    │
│                                                        │
│   Policy Cache ──► Local Evaluator ──► Decision       │
│        ▲                                   │          │
│        │ sync (background)                 │ allow /  │
│        │                                  ▼  block    │
│   ┌────┴──────────────────────────────────────────┐   │
│   │            AgentGuard Cloud API                │   │
│   │                                                │   │
│   │  ┌──────────┐  ┌──────────┐  ┌────────────┐  │   │
│   │  │  Policy  │  │  Kill    │  │   Audit    │  │   │
│   │  │  Engine  │  │  Switch  │  │   Trail    │  │   │
│   │  │ (rules)  │  │ (<50ms)  │  │ (SHA-256)  │  │   │
│   │  └──────────┘  └──────────┘  └────────────┘  │   │
│   │                                                │   │
│   │  ┌──────────┐  ┌──────────┐  ┌────────────┐  │   │
│   │  │  Prompt  │  │  HITL    │  │  Webhook   │  │   │
│   │  │  Inject. │  │ Approval │  │  Dispatch  │  │   │
│   │  │ Detector │  │          │  │            │  │   │
│   │  └──────────┘  └──────────┘  └────────────┘  │   │
│   └────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
       │
       │  result + audit record
       ▼
Your Tool (database / API / filesystem / shell)
```

**Decision latency:**
- Local policy cache hit: `<1ms`
- Remote policy evaluation: `~15ms`
- Kill switch check: `<50ms`

---

## 🔌 Integrations

| Framework | Package | Install | Docs |
|-----------|---------|---------|------|
| **LangChain** (JS/Python) | `@the-bot-club/agentguard-langchain` | `npm i @the-bot-club/agentguard-langchain` | [Guide →](https://docs.agentguard.tech/integrations/langchain) |
| **CrewAI** | `agentguard-crewai` | `pip install agentguard-crewai` | [Guide →](https://docs.agentguard.tech/integrations/crewai) |
| **AutoGen** | `agentguard-autogen` | `pip install agentguard-autogen` | [Guide →](https://docs.agentguard.tech/integrations/autogen) |
| **LangGraph** | `@the-bot-club/agentguard-langgraph` | `npm i @the-bot-club/agentguard-langgraph` | [Guide →](https://docs.agentguard.tech/integrations/langgraph) |
| **MCP (Model Context Protocol)** | built-in | configure `mcp_servers.json` | [Guide →](https://docs.agentguard.tech/integrations/mcp) |
| **Express / Fastify** | `@the-bot-club/agentguard-middleware` | `npm i @the-bot-club/agentguard-middleware` | [Guide →](https://docs.agentguard.tech/integrations/express) |
| **OpenAI Assistants** | built-in | SDK flag `{ openai: true }` | [Guide →](https://docs.agentguard.tech/integrations/openai) |

---

## 💡 Example: Kill Switch

```bash
# Instantly halt all agents in your tenant
curl -X POST https://api.agentguard.tech/api/v1/killswitch \
  -H "x-api-key: $AG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"active": true, "reason": "Suspicious activity detected"}'

# Re-enable when safe
curl -X POST https://api.agentguard.tech/api/v1/killswitch \
  -H "x-api-key: $AG_API_KEY" \
  -d '{"active": false}'
```

## 💡 Example: Compliance Template

```bash
# Apply SOC 2 starter policy in one call
curl -X POST https://api.agentguard.tech/api/v1/templates/soc2-starter/apply \
  -H "x-api-key: $AG_API_KEY"
# → 10 rules activated. Audit evidence generation enabled.
```

---

## 📦 SDK Reference

| Method | Description |
|--------|-------------|
| `guard.evaluate(call)` | Evaluate a single tool call. Returns `allow`, `block`, `monitor`, or `require_approval`. |
| `guard.evaluateBatch(calls[])` | Evaluate up to 50 tool calls in one request. |
| `guard.killSwitch.activate(reason)` | Activate the kill switch for your tenant. |
| `guard.killSwitch.check()` | Check if kill switch is active (cached, <1ms). |
| `guard.audit.query(filters)` | Query tamper-evident audit log. |
| `guard.agents.create(name, scope)` | Create a scoped agent identity. |

Full API reference: [docs.agentguard.tech/api](https://docs.agentguard.tech/api)

---

## 🔐 Security

- **BSL 1.1 license** — free for non-commercial and small commercial use; contact us for enterprise terms
- **SOC 2 Type II** — report available on request
- **Data residency** — US (default), EU available on Enterprise
- **Responsible disclosure:** [security@agentguard.tech](mailto:security@agentguard.tech) · [SECURITY.md](SECURITY.md)

---

## 💰 Pricing

| | Free | Pro | Enterprise |
|---|---|---|---|
| Tool calls/month | 10,000 | 500,000 | Unlimited |
| Agents | 3 | Unlimited | Unlimited |
| Audit retention | 30 days | 365 days | Unlimited |
| Kill switch | ✅ | ✅ | ✅ |
| Compliance templates | ✅ | ✅ | ✅ |
| HITL approvals | ❌ | ✅ | ✅ |
| MCP proxy | ❌ | ✅ | ✅ |
| Price | $0 | $149/mo | Custom |

[Full pricing →](https://agentguard.tech/pricing)

---

## 🤝 Community & Support

- 💬 **Discord:** [discord.gg/thebotclub](https://discord.gg/thebotclub)
- 🐦 **Twitter/X:** [@agentguardtech](https://x.com/agentguardtech)
- 📖 **Docs:** [docs.agentguard.tech](https://docs.agentguard.tech)
- 🐛 **Issues:** [GitHub Issues](https://github.com/thebotclub/agentguard/issues)
- 📧 **Enterprise:** [sales@agentguard.tech](mailto:sales@agentguard.tech)

---

## 📄 License

AgentGuard is licensed under the [Business Source License 1.1](LICENSE). Free for non-production and qualifying small commercial use. See [agentguard.tech/pricing](https://agentguard.tech/pricing) for commercial terms.

---

<div align="center">
Built by <a href="https://thebot.club">TheBotClub</a> · Part of the <a href="https://thebot.club/platform">AI Agent Governance Stack</a>
</div>

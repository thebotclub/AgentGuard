<div align="center">
  <img src="https://agentguard.tech/logo.svg" width="120" alt="AgentGuard">
  <h1>🛡️ AgentGuard</h1>
  <p><strong>Runtime security for AI agents — the first CI/CD gate for AI deployments</strong></p>
  
  <p>
    <a href="https://agentguard.tech"><img src="https://img.shields.io/badge/Website-Live-brightgreen"></a>
    <a href="https://docs.agentguard.tech"><img src="https://img.shields.io/badge/Docs-v0.7.2-blue"></a>
    <a href="https://demo.agentguard.tech"><img src="https://img.shields.io/badge/Demo-Live-green"></a>
    <img src="https://img.shields.io/badge/API-42%20endpoints-blue">
    <img src="https://img.shields.io/badge/Tests-66%20passing-green">
  </p>
</div>

---

## The Problem

AI agents are deploying into production **without security guardrails**. Unlike containerized microservices, AI agents:
- Execute arbitrary code and shell commands
- Access databases, APIs, and file systems directly
- Can exfiltrate data, transfer funds, or delete resources
- Are probabilistic — system prompts can be jailbroken

**There's no container scanning equivalent for AI agents.** AgentGuard is that equivalent.

## Why AgentGuard?

| Capability | AgentGuard | Competitors |
|-----------|------------|-------------|
| **CI/CD Deployment Gate** | ✅ Native GitHub Action | ❌ None |
| **Local PolicyEngine (<1ms)** | ✅ In-process, no network | ❌ Cloud-only |
| **Kill Switch** | ✅ Instant tenant-wide halt | ❌ None |
| **Hash-Chained Audit Trail** | ✅ Cryptographically tamper-evident | ❌ Basic logging |
| **Policy Templates** | EU AI Act, SOC 2, APRA, OWASP | Partial |
| **LangChain/CrewAI/AutoGen** | ✅ Native SDK wrappers | ❌ Prompt scanning only |

## Market Opportunity

- **$4.4B** spent on AI security in 2025 (Gartner)
- **EU AI Act enforcement begins August 2026** — all high-risk AI systems require technical documentation and human oversight
- **Every company deploying AI agents** needs runtime security — this is a land grab

## Product

```
┌─────────────────────────────────────────────────────────────────┐
│                      Your AI Agent                              │
├─────────────────────────────────────────────────────────────────┤
│  Tools: database_query, http_post, shell_exec, file_write...   │
└────────────────────────────┬────────────────────────────────────┘
                           │ every tool call
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AgentGuard                                   │
│  ┌─────────────────┐  ┌────────────────┐  ┌───────────────┐ │
│  │  Policy Engine  │  │  Kill Switch   │  │ Audit Trail   │ │
│  │  (<1ms local)  │  │  <50ms global │  │ SHA-256 chain │ │
│  └────────┬────────┘  └───────┬────────┘  └───────┬───────┘ │
│           │                   │                   │           │
│           ▼                   ▼                   ▼           │
│     [allow/block/monitor/require_approval]                   │
└─────────────────────────────────────────────────────────────────┘
```

## Features

### 🚀 CI/CD Gate
Block unsafe agent deployments before they reach production:
```yaml
- name: AgentGuard Policy Check
  uses: agentguard/agentguard-action@v1
  with:
    api-key: ${{ secrets.AGENTGUARD_API_KEY }}
    tools: [database_query, http_post, shell_exec]
    fail-on: block
```

### ⚡ Sub-Millisecond Local Engine
In-process policy evaluation with zero network latency:
```typescript
import { AgentGuard } from '@the-bot-club/agentguard';

const guard = new AgentGuard({ apiKey: process.env.AG_API_KEY });
const decision = guard.evaluate({ tool: 'http_post', params: { url: 'https://evil.com' } });
// → { result: 'block', riskScore: 75, reason: 'External HTTP not allowlisted' }
```

### 🔴 Kill Switch
One API call halts every agent in your tenant instantly:
```bash
curl -X POST https://api.agentguard.tech/api/v1/killswitch \
  -H "X-API-Key: $AG_API_KEY" \
  -d '{"active": true}'
```

### 📋 Compliance Templates
Pre-built policies for regulated industries:
- **EU AI Act** — Articles 5, 9, 12, 14
- **SOC 2** — CC1-9 mapped to agent controls  
- **APRA CPS 234** — Australian financial services
- **OWASP Top 10 for Agentic AI**
- **Financial Services Baseline** — AML, KYC, insider trading

### 🔗 Tamper-Evident Audit
Every evaluation is logged with cryptographic hash chaining — provable in court:
```bash
curl https://api.agentguard.tech/api/v1/audit/verify -H "X-API-Key: $AG_API_KEY"
# → { "valid": true, "eventCount": 15247, "message": "Hash chain verified" }
```

## Technical Specs

| Metric | Value |
|--------|-------|
| **API Endpoints** | 42 |
| **Policy Rules** | 50+ built-in |
| **Latency (local)** | <1ms |
| **Latency (cloud)** | ~200ms |
| **Auth** | bcrypt + SHA-256 key lookup |
| **Validation** | Full Zod schemas |
| **Database** | PostgreSQL with RLS |
| **Tests** | 66 passing |

## SDKs

```bash
# Node.js
npm install @the-bot-club/agentguard

# Python  
pip install agentguard-tech

# CLI
npx @the-bot-club/agentguard-cli validate ./
```

## Who's It For?

- **Financial services** — APRA CPS 234, SOX compliance
- **Healthcare** — HIPAA, patient data protection
- **Enterprise IT** — SOC 2, data exfiltration prevention
- **AI-first companies** — Security as a differentiator

## The Team

AgentGuard is built by [Hani Kashi](https://linkedin.com/in/hanikashi) with deep expertise in:
- AI agent architecture (LangChain, CrewAI, AutoGen)
- Security engineering (infrastructure, compliance)
- Enterprise SaaS development

## License

[Business Source License 1.1](LICENSE) — Free to use. Enterprise licensing available.

## Contact

- 📧 hello@agentguard.tech
- 🌐 [agentguard.tech](https://agentguard.tech)
- 📖 [docs.agentguard.tech](https://docs.agentguard.tech)
- 🎮 [demo.agentguard.tech](https://demo.agentguard.tech)

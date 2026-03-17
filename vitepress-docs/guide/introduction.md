# Introduction

## What is AgentGuard?

AgentGuard is a runtime security layer for AI agents. It intercepts every tool call your agent makes and evaluates it against a configurable policy before allowing execution.

```
Your AI Agent
     │ every tool call
     ▼
┌─────────────────────────────────────────────┐
│              AgentGuard                      │
│                                             │
│  Policy Engine ─── Kill Switch ─── Audit   │
│    (<1ms)          (<50ms)       (SHA-256)  │
│                                             │
└─────────────────────────────────────────────┘
     │ allowed calls only
     ▼
  Your Tools
```

## Why AgentGuard?

As AI agents become more capable, they also become more dangerous. A single compromised agent can:

- Exfiltrate sensitive data through HTTP requests
- Escalate privileges via shell commands
- Execute arbitrary code
- Delete critical files or databases
- Inject malicious content into downstream systems

AgentGuard gives you **real-time visibility and control** over what your agents are actually doing.

## Key Features

| Feature | Description |
|---------|-------------|
| **Policy Engine** | YAML-based rules with priority ordering, conditions, and conflict resolution |
| **Kill Switch** | Instantly terminate any agent or entire hierarchies |
| **Audit Trail** | SHA-256 chained, tamper-evident log of every decision |
| **PII Detection** | Auto-detect and redact 20+ PII patterns before logging |
| **Human-in-Loop** | Route high-risk actions to human approval queue |
| **OWASP Compliance** | Built-in checks for LLM Top 10 vulnerabilities |
| **MCP Governance** | Policy enforcement for Model Context Protocol servers |
| **Multi-Agent** | Agent hierarchy management, A2A trust, parent-child relationships |

## Architecture Overview

AgentGuard consists of:

1. **Policy Engine** — Evaluates tool calls against rules in <1ms
2. **API Server** — Express REST API with 60+ endpoints
3. **TypeScript SDK** — Drop-in wrapper for any agent framework
4. **Python SDK** — `pip install agentguard-tech`
5. **CLI** — `npx agentguard scan` for policy coverage analysis

## Getting Started

Head to the [Getting Started guide](/guide/getting-started) to install AgentGuard in minutes.

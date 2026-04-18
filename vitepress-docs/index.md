---
layout: home

hero:
  name: "🛡️ AgentGuard"
  text: "Runtime Security for AI Agents"
  tagline: Every tool call, evaluated before it executes. Block threats, log everything, and stay in control — without slowing your agents down.
  actions:
    - theme: brand
      text: Get Started Free →
      link: /guide/getting-started
    - theme: alt
      text: Live Demo (no signup)
      link: https://demo.agentguard.tech
    - theme: alt
      text: GitHub
      link: https://github.com/thebotclub/AgentGuard

features:
  - icon: ⚡
    title: Sub-Millisecond Evaluation
    details: Policy engine runs in-process — zero network round-trips. Your agents run at full speed. Security that's invisible to your users.
  - icon: 🔒
    title: Policy-Based Control
    details: Define allow/block/require-approval rules for any tool call using YAML or the API. 7 built-in compliance templates for EU AI Act, SOC 2, OWASP LLM Top 10, and more.
  - icon: 🚨
    title: Instant Kill Switch
    details: One API call halts every agent in your tenant. Cascades to all child agents. Incident response in seconds, not minutes.
  - icon: 📋
    title: Tamper-Evident Audit Trail
    details: SHA-256 chained log of every decision. Cryptographically verifiable — provable in a regulatory inquiry or court. Nothing can be silently erased.
  - icon: 🕵️
    title: Prompt Injection Detection
    details: Catches instruction overrides, role-play jailbreaks, system prompt leakage, and multi-turn escalation — before they become dangerous actions.
  - icon: 🔐
    title: PII Detection & Redaction
    details: Auto-detects and redacts 20+ PII patterns (SSNs, emails, credit cards, phone numbers) before they appear in your audit logs.
  - icon: 🤝
    title: Human-in-the-Loop
    details: Route high-risk actions to Slack for human approval. One click to approve or deny — agents wait, humans decide.
  - icon: 🏗️
    title: Drop-In Integrations
    details: LangChain, CrewAI, OpenAI, Vercel AI SDK, Express/Fastify middleware. TypeScript and Python SDKs. Add security in 3 lines of code.
---

## Why AgentGuard?

AI agents have access to your production databases, APIs, shell environments, and file systems. One compromised prompt can exfiltrate data, corrupt infrastructure, or execute unauthorized transactions.

**AgentGuard is the security layer between your agent's decisions and its actions.**

```typescript
import { AgentGuard } from '@the-bot-club/agentguard';

const guard = new AgentGuard({ apiKey: process.env.AGENTGUARD_API_KEY });

const decision = await guard.evaluate({
  tool: 'database_query',
  params: { query: 'DROP TABLE users' }
});

// → { result: 'block', reason: 'Destructive SQL operation', riskScore: 95 }
```

**Free tier: 100,000 events/month. No credit card required.**

[Get started →](/guide/getting-started) | [See the API reference →](/api/overview) | [Try the demo →](https://demo.agentguard.tech)

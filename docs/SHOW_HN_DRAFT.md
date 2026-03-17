# Show HN Draft

## Posting Checklist
- [ ] Repo is public
- [ ] README polished ✅
- [ ] All sites live ✅ (agentguard.dev, docs, demo, app, api)
- [ ] npm + PyPI at v0.9.0 ✅
- [ ] Demo playground working ✅
- [ ] Hani available to respond to comments for first 2 hours
- [ ] Best time: Tuesday–Thursday, 8-10am EST (13:00-15:00 UTC)

---

**Title:** Show HN: AgentGuard – Runtime security layer for AI agents (open source)

**URL:** https://github.com/thebotclub/AgentGuard

**Text:**

Hi HN,

AI agents are shipping to production with access to databases, APIs, shell commands, and file systems — but no security layer between the agent's decision and the action. We built AgentGuard to fix that.

AgentGuard evaluates every tool call against configurable policies before execution. Think of it as a firewall for AI agent actions.

**What it does:**

- Policy engine evaluates tool calls in <1ms (runs in-process, no network round-trip)
- Kill switch halts every agent in your tenant with one API call
- Hash-chained audit trail — tamper-evident, SHA-256 linked, verifiable
- Prompt injection detection (heuristic + Lakera adapter)
- PII detection & redaction (9 entity types, detect/redact/mask)
- Batch evaluate — 50 tool calls in one request
- Pre-built compliance templates (EU AI Act, SOC 2, OWASP Top 10, APRA)

**Integrations:**

Drop-in support for LangChain, CrewAI, OpenAI, Vercel AI SDK, Express/Fastify middleware. TypeScript and Python SDKs.

```typescript
import { AgentGuard } from '@the-bot-club/agentguard';
const guard = new AgentGuard({ apiKey: process.env.AG_API_KEY });

const decision = await guard.evaluate({
  tool: 'database_query',
  action: 'execute',
  input: { query: 'DROP TABLE users' }
});
// → { result: 'block', reason: 'Destructive SQL operation', riskScore: 95 }
```

**Stack:** Express, PostgreSQL, Zod validation on all endpoints, bcrypt key hashing, 60+ API endpoints, 193 tests passing.

**Pricing:** Free tier at 100K events/month. Pro ($149/mo) and Enterprise ($499/mo) for SSO, SIEM export, and SLA.

We're a small team in Australia. The repo has been private while we built it — this is our first public release. Would genuinely appreciate feedback on whether this solves a real problem for you, and what's missing.

Try the interactive demo: https://demo.agentguard.dev
Docs: https://docs.agentguard.dev
npm: `npm install @the-bot-club/agentguard`

---

## Anticipated HN Questions & Answers

**"How is this different from just writing policy checks in my code?"**
You could. But AgentGuard gives you a centralized policy engine, audit trail, kill switch, compliance templates, and framework integrations out of the box. Same reason you use a WAF instead of writing HTTP validation by hand.

**"What about latency?"**
The local PolicyEngine runs in-process in <1ms. Cloud API is ~150ms. For most agent workflows, this is negligible — your LLM calls take 1-10 seconds.

**"Is this just prompt scanning?"**
No. We evaluate *actions* (tool calls), not just inputs. Prompt injection scanning is one feature, but the core value is blocking dangerous tool executions before they happen.

**"BSL 1.1 isn't open source"**
Correct — it's source-available. You can read, modify, and self-host. The license converts to Apache 2.0 after 4 years. We chose BSL (same model as HashiCorp, Sentry, MariaDB) because we're bootstrapped and need to sustain development.

**"Why not just use guardrails.ai / Rebuff / LLM Guard?"**
Those focus on prompt/output validation. AgentGuard focuses on *tool call security* — what happens after the LLM decides to act. Different layer, complementary.

**"EU AI Act — is this actually required?"**
For high-risk AI systems (Article 6), yes — technical documentation, human oversight, and risk management are mandatory from August 2026. AgentGuard's audit trail and compliance reports directly address Articles 9, 12, and 14.

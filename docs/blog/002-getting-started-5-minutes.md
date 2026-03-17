# Getting Started with AgentGuard in 5 Minutes

Your AI agent can call APIs, query databases, run shell commands, and write files. That's the power of agents — they don't just talk, they act.

It's also the threat surface.

**AgentGuard** adds a security evaluation layer between your agent's decisions and its actions. Every tool call gets checked against a policy before it executes. Dangerous actions get blocked. Everything gets logged. You stay in control.

Here's how to get started in 5 minutes.

---

## Step 1: Install the SDK

**TypeScript / Node.js:**

```bash
npm install @the-bot-club/agentguard
```

**Python:**

```bash
pip install agentguard-tech
```

No heavy dependencies. No config files. Just a package.

---

## Step 2: Get Your API Key

Sign up at [agentguard.dev](https://agentguard.dev) — the free tier gives you **100,000 events per month**, no credit card required.

Grab your API key from the dashboard. It'll look like `ag_live_abc123...`.

```bash
export AGENTGUARD_API_KEY="ag_live_your_key_here"
```

---

## Step 3: Evaluate Your First Tool Call

The core primitive is `guard.evaluate()`. Call it before any tool execution in your agent loop.

### TypeScript

```typescript
import { AgentGuard } from '@the-bot-club/agentguard';

const guard = new AgentGuard({
  apiKey: process.env.AGENTGUARD_API_KEY,
});

// Before executing a tool call:
const decision = await guard.evaluate({
  tool: 'database_query',
  action: 'execute',
  input: { query: 'DROP TABLE users' },
  context: {
    agentId: 'my-agent',
    userId: 'user_123',
  }
});

if (decision.result === 'block') {
  // Don't execute — log and return safe response
  console.warn('Blocked:', decision.reason);
} else {
  // Safe to run your tool
  const result = await runDatabaseQuery(decision.input);
}
```

**Response:**
```json
{
  "result": "block",
  "reason": "Destructive SQL operation (DROP) blocked on production database",
  "riskScore": 95,
  "policy": "sql-safety-production",
  "eventId": "evt_7f3a9b2c"
}
```

### Python

```python
from agentguard import AgentGuard
import os

guard = AgentGuard(api_key=os.environ["AGENTGUARD_API_KEY"])

decision = guard.evaluate(
    tool="shell_exec",
    action="run",
    input={"cmd": "rm -rf /"},
    context={
        "agent_id": "my-agent",
        "user_id": "user_123",
    }
)

if decision.result == "block":
    print(f"Blocked: {decision.reason}")
else:
    # Safe to execute
    subprocess.run(decision.input["cmd"], shell=True)
```

---

## Step 4: Drop-In Framework Integrations

If you're using a popular framework, we have native integrations that hook in automatically — no manual `evaluate()` calls needed.

### LangChain (TypeScript)

```typescript
import { AgentGuardCallbackHandler } from '@the-bot-club/agentguard/integrations/langchain';
import { AgentExecutor } from 'langchain/agents';

const executor = new AgentExecutor({
  agent,
  tools: yourTools,
  callbacks: [
    new AgentGuardCallbackHandler({ apiKey: process.env.AGENTGUARD_API_KEY })
  ],
});

// Every tool call is now evaluated by AgentGuard automatically
const result = await executor.invoke({ input: userMessage });
```

### LangChain (Python)

```python
from agentguard.integrations.langchain import AgentGuardCallbackHandler
from langchain.agents import AgentExecutor

executor = AgentExecutor(
    agent=agent,
    tools=tools,
    callbacks=[AgentGuardCallbackHandler(api_key="ag_live_...")],
)

result = executor.invoke({"input": user_message})
```

### OpenAI (TypeScript)

```typescript
import { createGuardedOpenAI } from '@the-bot-club/agentguard/integrations/openai';

const openai = createGuardedOpenAI(openaiClient, {
  apiKey: process.env.AGENTGUARD_API_KEY,
});

// All tool calls through this client are evaluated
```

### Express Middleware

```typescript
import { agentGuardMiddleware } from '@the-bot-club/agentguard/integrations/express';

app.use('/agent', agentGuardMiddleware({
  apiKey: process.env.AGENTGUARD_API_KEY,
}));
```

---

## Step 5: Define Your Policy

AgentGuard ships with sensible defaults. Customise with a YAML policy to match your specific requirements.

```yaml
id: my-production-policy
name: Production Security Policy
version: 1.0.0
default: block

rules:
  - id: allow-safe-reads
    action: allow
    when:
      - tool:
          in: [file_read, db_read_public, http_get]
    priority: 100

  - id: block-destructive-sql
    action: block
    when:
      - tool: database_query
        input.query:
          matches: "^(DROP|DELETE|TRUNCATE|ALTER)"
    severity: critical
    priority: 10

  - id: require-approval-for-payments
    action: hitl_required
    when:
      - tool: payment_initiate
    priority: 5
    notifySlack: true
```

Upload your policy:

```bash
curl -X POST https://api.agentguard.dev/api/v1/policies \
  -H "x-api-key: $AGENTGUARD_API_KEY" \
  -H "Content-Type: application/yaml" \
  --data-binary @my-production-policy.yaml
```

Or use one of the built-in compliance templates:

```bash
# List available templates
curl https://api.agentguard.dev/api/v1/policies/templates \
  -H "x-api-key: $AGENTGUARD_API_KEY"
```

Templates available: `eu-ai-act`, `soc2`, `owasp-llm-top10`, `apra-cps234`, `financial-services-baseline`, `customer-service`, `code-agent`.

---

## What You Now Have

In under 5 minutes, your agent went from:
- ❌ Unrestricted tool access
- ❌ No visibility into what it's doing
- ❌ No way to stop it if something goes wrong

To:
- ✅ Every tool call evaluated against policy before execution
- ✅ Real-time audit trail with tamper-evident logging
- ✅ Kill switch ready (`POST /api/v1/killswitch`)
- ✅ Dashboard at [app.agentguard.dev](https://app.agentguard.dev) showing live activity

---

## What Gets Blocked Automatically

Out of the box (before any policy customisation), AgentGuard's default policy blocks:

| Action | Risk | Default behaviour |
|--------|------|-------------------|
| `DROP`, `DELETE`, `TRUNCATE` SQL | Critical | Block |
| `rm -rf` / destructive filesystem ops | Critical | Block |
| HTTP POST to private IP ranges | High | Block |
| Shell command with `sudo` or privilege escalation | High | Block |
| PII in tool outputs destined for logging | Medium | Redact |

Customise any of these with your own policy rules.

---

## What's Next

- **[Policy Engine Guide](/guide/policy-engine)** — Deep dive on rule syntax, priority, conflict resolution
- **[API Reference](/api/overview)** — Full REST API documentation
- **[Architecture Overview](/architecture/overview)** — How AgentGuard fits in your stack
- **[Self-Hosted Deployment](https://github.com/thebotclub/AgentGuard/blob/main/self-hosted/README.md)** — Run it on your own infrastructure

---

## Support

- **Dashboard:** [app.agentguard.dev](https://app.agentguard.dev)
- **Docs:** [docs.agentguard.dev](https://docs.agentguard.dev)
- **GitHub Issues:** [github.com/thebotclub/AgentGuard/issues](https://github.com/thebotclub/AgentGuard/issues)
- **Live Demo:** [demo.agentguard.dev](https://demo.agentguard.dev) — try it without signing up

---

*AgentGuard is built by [The Bot Club Pty Ltd](https://agentguard.dev), trading as AgentGuard. Licensed under BSL 1.1.*

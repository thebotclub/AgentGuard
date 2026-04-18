# Quickstart — 5 Minutes to Your First Evaluation

This guide gets you from zero to a working AgentGuard integration in under 5 minutes.

## Step 1: Get an API Key

Sign up at [agentguard.tech](https://agentguard.tech) — no credit card required.  
Free tier: **100,000 evaluations/month**.

Once signed in, copy your API key from the dashboard. It looks like:

```
ag_live_a1b2c3d4e5f6...
```

::: tip Test vs Production
- `ag_live_*` — production key (real evaluations, billed usage)
- `ag_test_*` — sandbox key (no billing, safe to commit in tests)
:::

## Step 2: Make Your First Evaluation

The evaluation endpoint is the core of AgentGuard. Send it a tool call; it returns a decision.

### Using curl

```bash
curl -X POST https://api.agentguard.tech/api/v1/evaluate \
  -H "x-api-key: $AGENTGUARD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "shell_exec",
    "params": { "cmd": "rm -rf /etc" }
  }'
```

**Expected response (blocked):**

```json
{
  "success": true,
  "data": {
    "result": "block",
    "riskScore": 95,
    "reason": "Destructive shell command targeting system directories",
    "matchedRuleId": "block-destructive-commands",
    "duration_ms": 0.8
  }
}
```

### Safe call example

```bash
curl -X POST https://api.agentguard.tech/api/v1/evaluate \
  -H "x-api-key: $AGENTGUARD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "file_read",
    "params": { "path": "/app/data/report.csv" }
  }'
```

**Expected response (allowed):**

```json
{
  "success": true,
  "data": {
    "result": "allow",
    "riskScore": 5,
    "reason": "Read-only file operation — within policy",
    "matchedRuleId": "allow-safe-reads",
    "duration_ms": 0.6
  }
}
```

## Step 3: Install the SDK

### TypeScript / Node.js

```bash
npm install @the-bot-club/agentguard
```

```typescript
import { AgentGuard } from '@the-bot-club/agentguard';

const guard = new AgentGuard({
  apiKey: process.env.AGENTGUARD_API_KEY!,
});

const decision = await guard.evaluate({
  tool: 'database_query',
  action: 'execute',
  input: { query: 'SELECT * FROM users WHERE id = $1', params: ['123'] },
});

if (decision.result === 'block') {
  throw new Error(`AgentGuard blocked this action: ${decision.reason}`);
}

// Safe to proceed
console.log(`Allowed — risk score: ${decision.riskScore}`);
```

### Python

```bash
pip install agentguard-tech
```

```python
import os
from agentguard import AgentGuard

guard = AgentGuard(api_key=os.environ["AGENTGUARD_API_KEY"])

decision = guard.evaluate(
    tool="database_query",
    action="execute",
    input={"query": "SELECT * FROM users WHERE id = %s", "params": ["123"]},
)

if decision["result"] == "block":
    raise PermissionError(f"AgentGuard blocked: {decision['reason']}")

print(f"Allowed — risk score: {decision['riskScore']}")
```

## Step 4: Understanding Decisions

Every evaluation returns one of four results:

| Result | Meaning | What to do |
|--------|---------|------------|
| `allow` | Safe — proceed normally | Execute the tool call |
| `monitor` | Allowed but logged for review | Execute; the event is flagged |
| `block` | Policy violation — halt | Do NOT execute; surface the reason to the user or agent |
| `require_approval` | High-risk — needs human sign-off | Queue for human review; wait for approval via dashboard or webhook |

### Response fields

```typescript
interface EvaluationDecision {
  result: 'allow' | 'monitor' | 'block' | 'require_approval';
  riskScore: number;        // 0–1000 (higher = riskier)
  reason?: string;          // Human-readable explanation
  matchedRuleId?: string;   // Which policy rule triggered
  suggestion?: string;      // Safer alternative (on block)
  alternatives?: string[];  // Other tools that would be allowed
  duration_ms: number;      // Evaluation time
}
```

## Step 5: Batch Evaluate (Optional)

For pipelines with multiple tool calls, evaluate them in a single request:

```typescript
const results = await guard.evaluateBatch([
  { tool: 'database_query', params: { table: 'orders' } },
  { tool: 'http_post', params: { url: 'https://api.stripe.com/charges' } },
  { tool: 'file_write', params: { path: '/tmp/output.json' } },
]);

for (const item of results) {
  if (item.result === 'block') {
    console.error(`Blocked: ${item.tool} — ${item.reason}`);
  }
}
```

```bash
# curl equivalent
curl -X POST https://api.agentguard.tech/api/v1/evaluate/batch \
  -H "x-api-key: $AGENTGUARD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "calls": [
      { "tool": "database_query", "params": { "table": "orders" } },
      { "tool": "http_post", "params": { "url": "https://api.stripe.com" } }
    ]
  }'
```

## Common First-Time Issues

### 401 Unauthorized

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Invalid API key" } }
```

**Fix:** Double-check `x-api-key` header (lowercase). Ensure no leading/trailing spaces.

### 429 Too Many Requests

**Fix:** Free tier allows 100K events/month; unauthenticated requests are capped at 10/min per IP. Add your API key to every request.

### Everything returns `allow` (no blocks)

You haven't uploaded a custom policy yet. The default policy is permissive.  
→ See the [Policy Engine guide](/guide/policy-engine) to create your first rule set.

### `result: "require_approval"` but no notification received

Set up a webhook to receive approval callbacks:

```bash
curl -X POST https://api.agentguard.tech/api/v1/webhooks \
  -H "x-api-key: $AGENTGUARD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "url": "https://your-app.com/agentguard/webhook", "events": ["approval.required"] }'
```

## Next Steps

- [Policy Engine](/guide/policy-engine) — Define your own allow/block rules
- [LangChain Integration](/integrations/langchain) — Drop-in guard for LangChain agents
- [CrewAI Integration](/integrations/crewai) — Guard for CrewAI crews
- [AutoGen Integration](/integrations/autogen) — Guard for Microsoft AutoGen agents
- [Architecture Overview](/getting-started/architecture) — How it all fits together
- [API Reference](/api/overview) — Full REST API docs (144 endpoints)

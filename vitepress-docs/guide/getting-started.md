# Getting Started

AgentGuard is a runtime security platform that sits between your AI agent and its tools. Every tool call is evaluated against configurable policies before execution.

## Installation

### TypeScript / Node.js SDK

```bash
npm install @the-bot-club/agentguard
```

### Python SDK

```bash
pip install agentguard-tech
```

## Quick Setup

### 1. Sign Up

Create an account at [agentguard.tech](https://agentguard.tech) and get your API key.

### 2. Initialize the SDK

```typescript
import { AgentGuard } from '@the-bot-club/agentguard';

const guard = new AgentGuard({
  apiKey: process.env.AGENTGUARD_API_KEY,
});
```

### 3. Evaluate a Tool Call

```typescript
const result = await guard.evaluate({
  agentId: 'my-agent',
  tool: 'file_write',
  params: { path: '/etc/passwd', content: '...' },
});

if (result.decision === 'block') {
  throw new Error(`Blocked by AgentGuard: ${result.reason}`);
}
```

### 4. Define Your Policy

```yaml
id: my-policy
name: Production Security Policy
version: 1.0.0
default: block

rules:
  - id: allow-safe-reads
    action: allow
    when:
      - tool:
          in: [file_read, db_read_public]
    priority: 100

  - id: block-system-commands
    action: block
    when:
      - tool:
          in: [shell_exec, sudo, system_command]
    severity: critical
    priority: 5
```

## Batch Evaluate (Advanced)

Evaluate up to 50 tool calls in a single request — useful for pipelines and pre-flight checks:

```typescript
const results = await guard.evaluateBatch([
  { tool: 'database_query', params: { table: 'users' } },
  { tool: 'http_post', params: { url: 'https://api.example.com' } },
  { tool: 'shell_exec', params: { cmd: 'ls -la' } },
]);

// results[].result: 'allow' | 'block' | 'monitor' | 'hitl_required'
```

## Kill Switch

If an agent goes rogue, halt everything with a single call:

```bash
curl -X POST https://api.agentguard.tech/api/v1/killswitch \
  -H "x-api-key: $AGENTGUARD_API_KEY" \
  -d '{"active": true}'
```

Or via the dashboard at [app.agentguard.tech](https://app.agentguard.tech).

## Next Steps

- [API Reference](/api/overview) — Full REST API documentation
- [Architecture Overview](/architecture/overview) — How AgentGuard fits in your stack
- [Roadmap](/roadmap) — What's coming in v1.0 and beyond

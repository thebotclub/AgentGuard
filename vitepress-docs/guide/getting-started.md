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

## Next Steps

- [Policy Engine Guide](/guide/policy-engine) — Learn how policies work
- [API Reference](/api/overview) — Full REST API documentation
- [TypeScript SDK](/guide/sdk-typescript) — SDK configuration options

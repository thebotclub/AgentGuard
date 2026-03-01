# @thebotclub/agentguard

**Runtime security for AI agents** — policy engine, audit trail, kill switch, and cloud API client.

[![npm version](https://img.shields.io/npm/v/@thebotclub/agentguard)](https://www.npmjs.com/package/@thebotclub/agentguard)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Overview

AgentGuard gives you production-grade guardrails for AI agents:

- 🛡️ **Policy Engine** — evaluate tool calls against a YAML policy DSL (local, zero-latency)
- 📋 **Audit Trail** — append-only, tamper-evident hash chain of every action
- 🔴 **Kill Switch** — instantly halt one agent or all agents
- 🌐 **Cloud API Client** — connect to the hosted AgentGuard API
- 🔗 **LangChain Integration** — drop-in wrapper for LangChain tools

---

## Installation

```bash
npm install @thebotclub/agentguard
```

Requires Node.js 18+ (uses native `fetch`).

---

## Quick Start — Cloud API Client

```typescript
import { AgentGuard } from '@thebotclub/agentguard';

const guard = new AgentGuard({ apiKey: 'ag_your_api_key' });

// Evaluate an agent action before executing it
const decision = await guard.evaluate({
  tool: 'send_email',
  params: { to: 'user@example.com', subject: 'Hello' },
});

if (decision.result === 'allow') {
  // Safe to proceed
  console.log('Action allowed, risk score:', decision.riskScore);
} else if (decision.result === 'block') {
  console.error('Action blocked:', decision.reason);
} else if (decision.result === 'require_approval') {
  console.log('Waiting for human approval...');
}
```

### Get Usage Statistics

```typescript
const usage = await guard.getUsage();
console.log(usage);
```

### Get Audit Trail

```typescript
const audit = await guard.getAudit({ limit: 50, offset: 0 });
console.log(audit.events);
```

### Activate Kill Switch

```typescript
// Halt all agents immediately
await guard.killSwitch(true);

// Resume operations
await guard.killSwitch(false);
```

---

## PolicyEngine — Local Evaluation

For zero-latency, in-process policy evaluation without a network call:

```typescript
import { PolicyEngine, PolicyBundle } from '@thebotclub/agentguard';

// Load your compiled policy bundle (from AgentGuard Control Plane or local YAML)
const bundle: PolicyBundle = {
  policyId: 'my-policy',
  version: '1.0.0',
  compiledAt: new Date().toISOString(),
  defaultAction: 'block',
  rules: [
    {
      id: 'allow-read-tools',
      priority: 100,
      action: 'allow',
      toolCondition: { in: ['read_file', 'list_directory', 'search'] },
      paramConditions: [],
      contextConditions: [],
      dataClassConditions: [],
      timeConditions: [],
      severity: 'low',
      riskBoost: 0,
      tags: ['read-only'],
    },
    {
      id: 'block-delete',
      priority: 200,
      action: 'block',
      toolCondition: { matches: ['*delete*', '*remove*', '*drop*'] },
      paramConditions: [],
      contextConditions: [],
      dataClassConditions: [],
      timeConditions: [],
      severity: 'critical',
      riskBoost: 500,
      tags: ['destructive'],
    },
  ],
  toolIndex: {
    '*': [0, 1],
  },
  checksum: 'abc123',
  ruleCount: 2,
};

const engine = new PolicyEngine(bundle);

const decision = engine.evaluate({
  id: crypto.randomUUID(),
  agentId: 'agent-1',
  tool: 'read_file',
  params: { path: '/data/config.json' },
  inputDataLabels: [],
  timestamp: new Date().toISOString(),
});

console.log(decision.result);    // 'allow'
console.log(decision.riskScore); // 0
```

---

## AuditLogger

```typescript
import { AuditLogger } from '@thebotclub/agentguard';

const logger = new AuditLogger();

// Log an action decision
const event = logger.log({
  agentId: 'agent-1',
  sessionId: 'session-abc',
  policyVersion: '1.0.0',
  tool: 'send_email',
  params: { to: 'user@example.com' },
  decision: 'allow',
  matchedRuleId: 'allow-email',
  monitorRuleIds: [],
  riskScore: 10,
  reason: 'Matched allow-email rule',
  durationMs: 1.2,
});

// Verify the entire audit chain
const { valid, invalidAt } = logger.verify();
console.log('Chain valid:', valid); // true
```

---

## KillSwitch

```typescript
import { KillSwitch } from '@thebotclub/agentguard';

const ks = new KillSwitch();

// Register agent check in your tool execution loop
ks.on('halt', ({ tier, reason }) => {
  console.error(`HALT [${tier}]:`, reason);
});

// Before every tool call:
if (ks.isHalted('agent-1')) {
  throw new Error('Agent is halted');
}

// Halt globally
ks.haltGlobal('Security incident detected');

// Halt a specific agent
ks.haltAgent('agent-1', 'Exceeded rate limit');
```

---

## LangChain Integration

```typescript
import { AgentGuardToolWrapper } from '@thebotclub/agentguard';
import { DynamicTool } from 'langchain/tools';

// Your existing LangChain tool
const emailTool = new DynamicTool({
  name: 'send_email',
  description: 'Send an email',
  func: async (input) => {
    // ... send email logic
    return 'Email sent';
  },
});

// Wrap with AgentGuard policy enforcement
const wrapper = new AgentGuardToolWrapper(engine, auditLogger, killSwitch, agentContext);
const guardedTool = wrapper.wrap(emailTool);

// Use the guarded tool in your LangChain agent — policy is enforced automatically
const result = await guardedTool.invoke({ input: '{"to":"user@example.com"}' });
```

---

## API Reference

### `AgentGuard` (Cloud Client)

| Method | Description |
|---|---|
| `evaluate(action)` | Evaluate a tool call against your hosted policy |
| `getUsage()` | Get usage stats for your tenant |
| `getAudit(options?)` | Retrieve audit trail events |
| `killSwitch(active)` | Activate (`true`) or deactivate (`false`) global kill switch |

### `PolicyEngine`

| Method | Description |
|---|---|
| `evaluate(request)` | Evaluate an `ActionRequest`, returns `PolicyDecision` |

### `AuditLogger`

| Method | Description |
|---|---|
| `log(input)` | Append an `AuditEvent` to the chain |
| `getEvents()` | Return all events |
| `verify()` | Verify the hash chain integrity |

### `KillSwitch`

| Method | Description |
|---|---|
| `isHalted(agentId)` | Returns `true` if agent or global halt is active |
| `haltGlobal(reason)` | Halt all agents |
| `haltAgent(id, reason)` | Halt a specific agent |
| `resumeGlobal()` | Resume global operations |
| `resumeAgent(id)` | Resume a specific agent |

---

## Links

- 🌐 [agentguard.tech](https://agentguard.tech)
- 🎮 [Live Demo](https://demo.agentguard.tech)
- 📦 [GitHub](https://github.com/koshaji/agentguard)
- 🐍 [Python SDK](https://pypi.org/project/agentguard/)

## License

MIT

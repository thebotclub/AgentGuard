# AgentGuard SDK — Source

Runtime security layer for AI agents. Policy engine, audit trail, kill switch, and LangChain integration.

## Quick Start

```bash
# Install dependencies
npm install

# Type-check (no emit)
npm run typecheck

# Run the demo
npm run demo

# Run tests
npm test
```

## Running the Demo

```
node --loader ts-node/esm src/examples/demo.ts
```

Or via the npm script:

```
npm run demo
```

The demo will:
1. Load all three example policies (finance, devops, support)
2. Run through ~20 action evaluations showing ALLOW / DENY / HITL in real-time
3. Simulate a rate-limit breach, a spending cap hit, and a kill switch activation
4. Auto-approve a HITL request after 500ms (for demo purposes)
5. Verify the tamper-evident hash chain on the audit log

Expected output:

```
  🛡  AgentGuard SDK — Prototype Demo

 ◆ FINANCE AGENT — Policy Evaluation Demo
  Policy loaded: finance-agent-v1 v1.0.0

  [ ALLOW ] search:web                           Tool "search:web" is permitted by policy
  [ DENY  ] finance:transfer                     Tool "finance:transfer" is on the deny list
  [ DENY  ] data:query (pii)                     Access to PII data is not permitted by policy
  ...
  ✅ Hash chain verified — 12 entries, no tampering detected

 ✓ Demo complete
```

## Architecture

```
src/
├── core/
│   ├── types.ts          # Zod schemas + inferred TypeScript types
│   ├── errors.ts         # PolicyError factory (DENIED, RATE_LIMITED, etc.)
│   ├── policy-engine.ts  # Loads YAML policies, evaluates actions
│   ├── audit-logger.ts   # Tamper-evident hash-chained JSONL log
│   ├── kill-switch.ts    # Global + per-agent halt via EventEmitter
│   └── __tests__/
│       └── policy-engine.test.ts
│
├── sdk/
│   └── langchain-wrapper.ts  # Guarded tool wrapper + ApprovalEventBus
│
├── examples/
│   ├── demo.ts
│   └── policies/
│       ├── finance-agent.yaml
│       ├── devops-agent.yaml
│       └── support-agent.yaml
│
└── index.ts              # Root barrel export
```

## Key Design Decisions

### Zod for Policy Validation
Policies are parsed from YAML and validated with Zod before use. Type inference means `Policy` types stay in sync with the runtime schema — no drift. Invalid policy files produce readable error messages.

### PolicyError Factory Pattern
All policy enforcement errors share one class (`PolicyError`) with typed codes. Callers catch once and switch on `err.code`:

```typescript
try {
  await guardedTool.invoke(params);
} catch (err) {
  if (err instanceof PolicyError) {
    switch (err.code) {
      case 'DENIED': // hard block
      case 'RATE_LIMITED': // retry after delay
      case 'REQUIRES_APPROVAL': // show approval UI
      case 'GLOBAL_HALT': // all agents stopped
    }
  }
}
```

### AgentContext flows through everything
`AgentContext` (`agentId`, `sessionId`, `policyVersion`) is passed explicitly to every evaluation call. This keeps:
- Rate limits and spend counters scoped per session
- Audit events traceable to a specific agent run
- Policy version pinned at session start (no mid-session policy hot-swap surprises)

### Hash-Chained Audit Log
Every audit entry carries:
- `hash`: SHA-256 of its own content fields
- `chainHash`: SHA-256 of the previous entry's `hash`

Tampering with any entry (or inserting/deleting entries) breaks the chain. Call `auditLogger.verify()` to check integrity.

### Kill Switch Event Pattern
`KillSwitch extends EventEmitter` so SDK wrappers can react to halts without polling:

```typescript
killSwitch.on('halt', ({ scope, reason }) => {
  if (scope === 'global') abortAllInFlightRequests();
});
```

## Engineering Standards Applied

- **ESM modules** (`"type": "module"` in package.json)
- **TypeScript strict mode** with `noUncheckedIndexedAccess`
- **Path aliases** (`@/` → `src/`) via tsconfig `paths`
- **Named exports only** — no default exports
- **Type-only imports** (`import type { ... }`) where the import is only used as a type
- **Zod schemas** with `z.infer<>` — single source of truth for types
- **PolicyError factory** — typed error codes, no stringly-typed catches
- **AgentContext** — flows through all evaluation calls for traceability

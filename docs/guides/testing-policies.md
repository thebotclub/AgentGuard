# Testing Policies

A comprehensive guide to writing unit tests for AgentGuard policies using the SDK's `LocalPolicyEngine`.

## Why Test Policies?

Policies are security-critical code. A misconfigured rule can either block legitimate operations (false positive) or allow dangerous ones (false negative). Unit tests give you confidence that your policies behave exactly as expected.

## Prerequisites

```bash
npm install --save-dev vitest @the-bot-club/agentguard
```

## Testing with `LocalPolicyEngine`

`LocalPolicyEngine` evaluates policies in-process with zero network calls. It's perfect for unit tests.

### Basic Test Setup

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalPolicyEngine } from '@the-bot-club/agentguard';
import type { PolicyBundle } from '@the-bot-club/agentguard';

describe('My Security Policy', () => {
  let engine: LocalPolicyEngine;

  beforeEach(() => {
    engine = new LocalPolicyEngine();
  });

  // Helper: load a policy bundle from JSON
  function loadBundle(overrides?: Partial<PolicyBundle>) {
    const bundle: PolicyBundle = {
      policyId: 'test-policy',
      version: '1.0.0',
      compiledAt: new Date().toISOString(),
      defaultAction: 'block',
      rules: [],
      toolIndex: {},
      checksum: 'test',
      ruleCount: 0,
      ...overrides,
    };
    engine.loadBundle(bundle);
  }
});
```

### Writing Your First Test: BLOCKED Decision

```typescript
it('blocks destructive shell commands', () => {
  loadBundle({
    defaultAction: 'block',
    rules: [
      {
        id: 'block-rm-rf',
        priority: 10,
        action: 'block',
        toolCondition: { tools: ['shell_exec'] },
        paramConditions: [
          { cmd: { op: 'regex', value: 'rm\\s+-rf' } },
        ],
        contextConditions: [],
        dataClassConditions: [],
        timeConditions: [],
        compositeConditions: [],
        severity: 'critical',
        riskBoost: 300,
        tags: ['destructive'],
      },
    ],
    toolIndex: { shell_exec: [0], '*': [] },
    ruleCount: 1,
  });

  const result = engine.evaluate('shell_exec', { cmd: 'rm -rf /' });

  expect(result.result).toBe('block');
  expect(result.riskScore).toBeGreaterThanOrEqual(80);
  expect(result.matchedRuleId).toBe('block-rm-rf');
  expect(result.durationMs).toBeLessThan(5);
});
```

### Testing the Default Action (Fail-Closed)

The most important property: if no rule matches, the default action should block.

```typescript
it('blocks unknown tools by default (fail-closed)', () => {
  loadBundle({
    defaultAction: 'block',
    rules: [],
    toolIndex: {},
    ruleCount: 0,
  });

  const result = engine.evaluate('totally_unknown_tool', { data: 'anything' });

  expect(result.result).toBe('block');
  expect(result.reason).toContain('fail-closed');
});
```

### Testing ALLOW Decisions

```typescript
it('allows approved read-only operations', () => {
  loadBundle({
    defaultAction: 'block',
    rules: [
      {
        id: 'allow-read',
        priority: 50,
        action: 'allow',
        toolCondition: { tools: ['file_read'] },
        paramConditions: [],
        contextConditions: [],
        dataClassConditions: [],
        timeConditions: [],
        compositeConditions: [],
        severity: 'low',
        riskBoost: 0,
        tags: ['read-only'],
      },
    ],
    toolIndex: { file_read: [0], '*': [] },
    ruleCount: 1,
  });

  const result = engine.evaluate('file_read', { path: '/app/data/config.json' });

  expect(result.result).toBe('allow');
  expect(result.riskScore).toBeLessThan(30);
});
```

### Testing MONITOR Decisions

```typescript
it('monitors but allows sensitive file reads', () => {
  loadBundle({
    defaultAction: 'block',
    rules: [
      {
        id: 'monitor-ssh-read',
        priority: 30,
        action: 'monitor',
        toolCondition: { tools: ['file_read'] },
        paramConditions: [
          { path: { op: 'regex', value: '\\.ssh/' } },
        ],
        contextConditions: [],
        dataClassConditions: [],
        timeConditions: [],
        compositeConditions: [],
        severity: 'high',
        riskBoost: 100,
        tags: ['audit'],
      },
    ],
    toolIndex: { file_read: [0], '*': [] },
    ruleCount: 1,
  });

  const result = engine.evaluate('file_read', { path: '/home/user/.ssh/id_rsa' });

  expect(result.result).toBe('monitor');
  expect(result.matchedRuleId).toBe('monitor-ssh-read');
});
```

### Testing Rule Priority

When multiple rules could match, the one with the lowest priority number wins.

```typescript
it('highest priority rule wins (lowest number = highest priority)', () => {
  loadBundle({
    defaultAction: 'block',
    rules: [
      {
        id: 'allow-all-shell',
        priority: 50, // lower priority
        action: 'allow',
        toolCondition: { tools: ['shell_exec'] },
        paramConditions: [],
        contextConditions: [],
        dataClassConditions: [],
        timeConditions: [],
        compositeConditions: [],
        severity: 'low',
        riskBoost: 0,
        tags: [],
      },
      {
        id: 'block-rm-rf',
        priority: 10, // higher priority — evaluated first
        action: 'block',
        toolCondition: { tools: ['shell_exec'] },
        paramConditions: [
          { cmd: { op: 'regex', value: 'rm\\s+-rf' } },
        ],
        contextConditions: [],
        dataClassConditions: [],
        timeConditions: [],
        compositeConditions: [],
        severity: 'critical',
        riskBoost: 300,
        tags: [],
      },
    ],
    toolIndex: { shell_exec: [0, 1], '*': [] },
    ruleCount: 2,
  });

  // "rm -rf" should be blocked despite the allow rule
  const blocked = engine.evaluate('shell_exec', { cmd: 'rm -rf /tmp/test' });
  expect(blocked.result).toBe('block');
  expect(blocked.matchedRuleId).toBe('block-rm-rf');

  // Safe shell commands should be allowed
  const allowed = engine.evaluate('shell_exec', { cmd: 'echo hello' });
  expect(allowed.result).toBe('allow');
  expect(allowed.matchedRuleId).toBe('allow-all-shell');
});
```

### Testing Wildcard / Glob Tool Matching

```typescript
it('matches tools via glob patterns', () => {
  loadBundle({
    defaultAction: 'block',
    rules: [
      {
        id: 'block-all-exec',
        priority: 10,
        action: 'block',
        toolCondition: { tools: ['exec_*', 'run_*'] },
        paramConditions: [],
        contextConditions: [],
        dataClassConditions: [],
        timeConditions: [],
        compositeConditions: [],
        severity: 'high',
        riskBoost: 200,
        tags: [],
      },
    ],
    toolIndex: { '*': [0] },
    ruleCount: 1,
  });

  expect(engine.evaluate('exec_script', {}).result).toBe('block');
  expect(engine.evaluate('run_command', {}).result).toBe('block');
  expect(engine.evaluate('safe_tool', {}).result).toBe('block'); // default
});
```

### Testing Error States

```typescript
it('throws when evaluating without a loaded policy', () => {
  const engine = new LocalPolicyEngine();
  expect(() => engine.evaluate('any_tool', {})).toThrow('No policy loaded');
});
```

## Using the `PolicyCompiler` for Integration Tests

If you're testing the full policy pipeline (YAML → compile → evaluate), use the `PolicyCompiler`:

```typescript
import { PolicyCompiler } from '@the-bot-club/agentguard';
import type { PolicyDocument } from '@the-bot-club/agentguard';

const myPolicy: PolicyDocument = {
  id: 'test-policy',
  name: 'Test Policy',
  version: '1.0.0',
  default: 'block',
  rules: [
    {
      id: 'block-danger',
      priority: 10,
      action: 'block',
      when: [{ tool: { matches: ['shell_exec'] } }],
      severity: 'critical',
      tags: [],
      riskBoost: 300,
    },
  ],
};

const compiler = new PolicyCompiler();
const bundle = compiler.compile(myPolicy);

const engine = new LocalPolicyEngine();
engine.loadBundle(bundle);

const result = engine.evaluate('shell_exec', { cmd: 'whoami' });
expect(result.result).toBe('block');
```

## Test Organization Best Practices

### 1. One test file per policy
```
tests/
  policies/
    production-policy.test.ts
    staging-policy.test.ts
    development-policy.test.ts
```

### 2. Structure tests by outcome
```typescript
describe('Production Policy', () => {
  describe('BLOCKED decisions', () => {
    it('blocks rm -rf');
    it('blocks DROP TABLE');
    it('blocks external network calls');
    it('blocks writes to /etc');
  });

  describe('ALLOWED decisions', () => {
    it('allows approved read operations');
    it('allows internal API calls');
    it('allows safe tools');
  });

  describe('MONITORED decisions', () => {
    it('monitors .ssh file reads');
    it('monitors .env file access');
  });

  describe('Default action', () => {
    it('blocks unknown tools (fail-closed)');
  });

  describe('Performance', () => {
    it('evaluates in under 5ms');
  });
});
```

### 3. Use parameterized tests for similar rules
```typescript
const destructiveCommands = [
  'rm -rf /',
  'chmod 777 /etc/passwd',
  'dd if=/dev/zero of=/dev/sda',
  'DROP TABLE users',
];

it.each(destructiveCommands)('blocks destructive command: %s', (cmd) => {
  const result = engine.evaluate('shell_exec', { cmd });
  expect(result.result).toBe('block');
});
```

## Running Tests

```bash
# Run all policy tests
npx vitest run tests/policies/

# Watch mode during development
npx vitest tests/policies/

# With coverage
npx vitest run --coverage tests/policies/
```

## Key Assertions for Policy Tests

| Property | What to Assert |
|----------|---------------|
| `result` | `'allow'`, `'block'`, `'monitor'`, or `'require_approval'` |
| `matchedRuleId` | The specific rule that triggered the decision |
| `riskScore` | Numeric risk value (higher = more dangerous) |
| `reason` | Human-readable explanation for audit logs |
| `durationMs` | Should be < 5ms for local evaluation |
| `monitorRuleIds` | Array of monitor rules that matched (accumulated) |

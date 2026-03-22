# AgentGuard — Prompt Injection Detection

**Status:** ✅ Implemented  
**Module:** `packages/api/src/services/prompt-injection/`  
**Detection rate:** >80% on known injection patterns  
**False positive rate:** <5% on legitimate inputs  

---

## Overview

Prompt injection attacks are a critical threat to LLM-powered agents. Attackers embed instructions inside user-supplied content to override an agent's system prompt, exfiltrate data, bypass safety controls, or cause agents to take unauthorized actions.

AgentGuard's native prompt injection detection is a **defense-in-depth** check that runs as a pre-flight gate before the policy rule evaluation engine. It combines:

1. **Lightweight builtin layer** — heuristic + pattern matching (fast, no external deps, <2ms)
2. **Adapter interface** — pluggable external services (Lakera Guard, custom webhooks)

Both layers are stacked: any adapter reaching the sensitivity threshold triggers detection.

---

## Architecture

```
ActionRequest arrives
        │
        ▼
┌───────────────────────────────────────────┐
│  PROMPT INJECTION GATE (pre-policy)        │
│                                           │
│  1. Builtin Layer (synchronous)           │
│     ├── Pattern Matching (60+ patterns)   │
│     └── Heuristics (7 statistical checks) │
│                                           │
│  2. External Adapters (async, optional)   │
│     ├── Lakera Guard API                  │
│     └── Custom Webhook                   │
│                                           │
│  3. Fusion: MAX confidence across layers  │
│     → detected && action==block → BLOCK   │
│     → detected && action==warn  → continue│
│     → detected && action==log   → continue│
└───────────────────────────────────────────┘
        │ (if not blocked)
        ▼
┌───────────────────────────────────────────┐
│  POLICY RULE EVALUATION ENGINE            │
│  (existing allow/block/monitor logic)     │
└───────────────────────────────────────────┘
```

---

## Detection Capabilities

### Pattern Library (60+ patterns)

| Category | Count | Coverage |
|---|---|---|
| `instruction_override` | 8 | "ignore previous instructions", "forget your", "new instructions supersede" |
| `role_switching` | 8 | DAN mode, jailbreak activation, developer mode, "pretend you are" |
| `system_prompt_extraction` | 6 | "reveal system prompt", "print instructions", "what are your rules?" |
| `authority_escalation` | 8 | "authorized override", "security level 0", "from OpenAI", "filters suspended" |
| `context_manipulation` | 8 | "ignore ethical constraints", "for educational purposes", hypothetical framing |
| `obfuscation` | 8 | base64 blocks, zero-width chars, Unicode homographs, URL-encoded keywords |
| `exfiltration` | 5 | "send data to URL", "include API keys in response", "format as JSON" |

### Heuristic Checks (7 signals)

| Signal ID | Check | Weight |
|---|---|---|
| `H-ENT` | Shannon entropy analysis (base64/encoded content detection) | 30% |
| `H-B64` | Base64 block detection with instruction keyword decoding | 25% |
| `H-INV` | Invisible / zero-width character injection | 35% |
| `H-REP` | Repetitive structure (token stuffing) | 15% |
| `H-LEN` | Abnormal input length (>5k chars) | 10% |
| `H-IMP` | High-density imperative commands | 20% |
| `H-MSC` | Mixed script (homograph attack, Cyrillic+Latin) | 20% |

---

## Policy YAML Integration

Enable prompt injection detection by adding a `checks:` section to your policy:

```yaml
id: "pol_my_agent"
name: "Customer Service Agent"
version: "1.0.0"
default: block

checks:
  - type: prompt_injection
    sensitivity: high     # low | medium | high
    action: block         # block | warn | log
    adapters:
      - builtin           # always included
      - lakera            # optional, requires LAKERA_API_KEY env var

rules:
  - id: "allow_read"
    priority: 10
    action: allow
    when:
      - tool: { in: ["get_customer", "list_orders"] }
```

### Sensitivity Levels

| Level | Confidence Threshold | Use Case |
|---|---|---|
| `low` | ≥ 80% | Production agents with strict control over input sources |
| `medium` | ≥ 60% | **Recommended default** — good balance of detection vs. FP rate |
| `high` | ≥ 40% | High-risk agents or when input is untrusted (public-facing) |

### Action Modes

| Action | Behavior |
|---|---|
| `block` | Immediately return HTTP 403 with injection details; log to audit trail |
| `warn` | Continue to policy evaluation; add injection metadata to response |
| `log` | Continue silently; record to audit trail only |

---

## Adapter Interface

All adapters implement `IInjectionAdapter`:

```typescript
interface IInjectionAdapter {
  readonly name: string;
  detect(input: string): Promise<AdapterResult>;
}

interface AdapterResult {
  adapterName: string;
  injectionDetected: boolean;
  confidence: number;        // 0–100
  categories?: string[];
  rawResponse: Record<string, unknown> | null;
  error?: string;
}
```

### Lakera Guard Adapter

Integrates with [Lakera Guard](https://platform.lakera.ai/) — industry-leading prompt injection detection service.

```typescript
import { createLakeraAdapter } from '@agentguard/api/services/prompt-injection/adapters/lakera';

const adapter = createLakeraAdapter({
  apiKey: process.env.LAKERA_API_KEY, // or set env var
  timeoutMs: 3000,
});
```

**Requires:** `LAKERA_API_KEY` environment variable.

### Webhook Adapter

Send inputs to any custom HTTP endpoint:

```typescript
import { WebhookAdapter } from '@agentguard/api/services/prompt-injection/adapters/webhook';

const adapter = new WebhookAdapter({
  webhookUrl: 'https://your-model.example.com/detect',
  headers: { 'Authorization': 'Bearer <token>' },
  timeoutMs: 3000,
});
```

**Expected request format:**
```json
{ "input": "<text to analyse>" }
```

**Expected response format (two variants accepted):**
```json
// V1
{ "injectionDetected": true, "confidence": 85, "categories": ["prompt_injection"] }

// V2 (Lakera-compatible score format)
{ "flagged": true, "score": 0.85 }
```

---

## Performance

| Operation | Latency |
|---|---|
| Builtin only (patterns + heuristics) | < 2ms |
| With Lakera Guard | ~50–150ms |
| With custom webhook | Depends on endpoint |

The builtin layer runs synchronously on the hot path. External adapters run asynchronously in parallel. The builtin layer alone achieves >80% detection at medium sensitivity with <5% false positive rate.

---

## Audit Trail

Blocked injection attempts are recorded in the audit trail with:

```json
{
  "actionType": "PROMPT_INJECTION",
  "decision": "block",
  "blockReason": "Prompt injection detected (confidence: 92%, triggered by: builtin)",
  "riskScore": 976,
  "toolName": "<tool that was called>"
}
```

Real-time alerts are broadcast via SSE to connected dashboard clients when an injection is detected.

---

## API Response on Block

When an injection is blocked, the `/v1/actions/evaluate` endpoint returns HTTP 403:

```json
{
  "result": "block",
  "riskScore": 976,
  "reason": "Prompt injection detected (confidence: 92%, sensitivity: high, triggered by: builtin)",
  "promptInjection": {
    "detected": true,
    "confidence": 92,
    "sensitivity": "high",
    "triggeredBy": ["builtin"],
    "topPatterns": [
      {
        "id": "IO-001",
        "category": "instruction_override",
        "description": "Ignore previous instructions — canonical form"
      }
    ]
  }
}
```

---

## Files

```
packages/api/src/services/prompt-injection/
├── detector.ts              — Main orchestrator (PromptInjectionDetector class)
├── patterns.ts              — Pattern library (60+ RegExp patterns)
├── heuristics.ts            — Statistical analysis (7 signal checks)
├── adapters/
│   ├── interface.ts         — IInjectionAdapter contract
│   ├── lakera.ts            — Lakera Guard API client
│   └── webhook.ts           — Generic webhook adapter
└── __tests__/
    └── detector.test.ts     — Integration tests (vitest)
```

---

## Test Results

```
Pattern detection rate:    100.0% (35/35) on known injection corpus  ✅ >80% target
Pattern false positive:      0.0% (0/20) on legitimate inputs        ✅ <5%  target
E2E detection (medium):     82.9% (29/35) end-to-end at medium sens  ✅ >80% target
E2E false positive (medium): 0.0% (0/20)                             ✅ <5%  target
```

---

## CISO Notes

This feature directly addresses the **OWASP LLM Top 10 #1: Prompt Injection** risk and satisfies common enterprise security review checkboxes:

- ✅ Input validation and sanitization layer
- ✅ Configurable sensitivity and action modes (block / warn / log)
- ✅ Integration with external security vendors (Lakera Guard)
- ✅ Complete audit trail of all detected and blocked injection attempts
- ✅ Real-time alerting via SSE to security dashboards
- ✅ Policy-driven configuration (YAML, version-controlled)
- ✅ No user data sent to external services unless explicitly configured

---

*Implemented: March 2026*  
*Owner: Engineering / Security*  
*Related: OWASP_AGENTIC_MAPPING.md, STRATEGY_REVIEW.md*

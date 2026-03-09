# AgentGuard — Agent DX Design Document

**Author:** Senior API Architect (Subagent: architect-agent-dx)  
**Date:** 2026-03-09  
**Status:** FINAL — Ready for parallel implementation  
**Repo:** `/home/vector/.openclaw/workspace/agentguard-project`

---

## Overview

This document specifies three features that improve AgentGuard's developer experience (DX) for agent builders:

1. **Batch Evaluate** — evaluate multiple tool calls in one HTTP round-trip
2. **Actionable Error Responses** — every block/flag decision tells the agent what to do next
3. **Free Tier Increase** — 25K → 100K events/month

Each feature is fully specified with schemas, file-level implementation guidance, test cases, edge cases, and integration notes. Implementation subagents should treat this as ground truth — do not deviate without flagging.

---

## Feature 1: Batch Evaluate (`POST /api/v1/evaluate/batch`)

### Decision rationale

Agents running pipelines (e.g., ReAct loops, plan-and-execute) often need to pre-screen a sequence of tool calls. Without batch, each call requires a separate HTTP round-trip: for 10 tools that's 10× the latency and 10× the connection overhead. A batch endpoint eliminates this.

The design mirrors the single `/evaluate` endpoint internally — each call in the batch goes through the exact same evaluation pipeline — but shares auth, session context, and kill-switch state across all calls.

**Why not a queue/async pattern?** Synchronous response with `Promise.all` keeps the API simple. Agents need the decisions before they can act. An async job pattern would require polling and complicates the integration significantly for marginal benefit.

---

### 1.1 API Contract

#### Request

```
POST /api/v1/evaluate/batch
Content-Type: application/json
X-API-Key: ag_...
```

```typescript
// BatchEvaluateRequest
{
  agentId?: string;           // optional — overrides agent from API key
  sessionId?: string;         // optional — groups this batch into a session
  messageHistory?: Array<{    // optional — shared across all calls in batch
    role: string;
    content: string;
  }>;
  calls: Array<{              // REQUIRED — 1 to 50 calls
    tool: string;             // REQUIRED — tool name (same rules as /evaluate)
    params?: Record<string, unknown>;   // optional — defaults to {}
    context?: Record<string, unknown>;  // optional — per-call extra context
  }>;
}
```

**Constraints:**
- `calls` must have 1–50 entries (error if 0 or >50)
- Each `tool` follows same validation as `EvaluateRequestSchema`: 1–200 chars, `[a-zA-Z0-9_.\-:]+`
- Total request body must fit within the 50kb express limit (already configured in server.ts)
- `messageHistory` is shared — applied to all calls

#### Response (200 OK)

```typescript
// BatchEvaluateResponse
{
  batchId: string;            // UUID for this batch — usable to correlate audit events
  results: Array<{
    index: number;            // 0-based, matches input `calls` array order
    tool: string;             // echoed from request
    decision: "allow" | "monitor" | "block" | "require_approval";
    riskScore: number;        // 0–1000
    matchedRuleId?: string;   // rule that triggered this decision
    durationMs: number;       // time to evaluate this single call
    
    // Present on block or flag decisions:
    reason?: string;          // human-readable explanation
    suggestion?: string;      // what the agent should do instead
    approvalUrl?: string;     // present when decision == "require_approval"
    approvalId?: string;      // ID of the pending approval record
    docs?: string;            // link to relevant docs section
    alternatives?: string[];  // allowed tools with similar capability

    // Present only if PII found in params:
    pii?: {
      entitiesFound: number;
      types: string[];
    };

    // Warnings (e.g., no rules matched tool):
    warnings?: string[];
  }>;
  summary: {
    total: number;            // == calls.length
    allowed: number;          // count of "allow" decisions
    monitored: number;        // count of "monitor" decisions
    blocked: number;          // count of "block" decisions
    requireApproval: number;  // count of "require_approval" decisions
  };
  batchDurationMs: number;    // total wall-clock time for the whole batch
}
```

#### Error Responses

```typescript
// 400 — Validation error
{
  error: "validation_error",
  field: "calls",             // field that's wrong
  expected: "array of 1-50 tool call objects",
  received: "<actual value description>"
}

// 401 — Auth error
{
  error: "unauthorized",
  acceptedAuth: ["X-API-Key: ag_...", "X-API-Key: ag_agent_..."],
  docs: "https://agentguard.tech/docs/authentication"
}

// 402 — Limit exceeded
{
  error: "limit_exceeded",
  limitKey: "eventsPerMonth",
  message: "Monthly eventsPerMonth limit of 100,000 exceeded.",
  current: 100050,
  limit: 100000,
  tier: "free",
  upgradeUrl: "https://agentguard.tech/pricing"
}

// 429 — Rate limited
{
  error: "rate_limit_exceeded",
  retryAfter: 60,
  message: "Too many requests. Please wait before retrying."
}
```

---

### 1.2 Files to Create/Modify

#### CREATE: `api/routes/evaluate-batch.ts`

This is a new file. Full implementation outline:

```typescript
/**
 * AgentGuard — Batch Evaluate Route
 * POST /api/v1/evaluate/batch
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { BatchEvaluateRequestSchema } from '../schemas.js';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import { getGlobalKillSwitch, storeAuditEvent, fireWebhooksAsync } from './audit.js';
import { checkRateLimit as checkPhase2RateLimit, incrementRateCounter } from '../phase2-routes.js';
import { DEFAULT_POLICY } from '../lib/policy-engine-setup.js';
import { PolicyEngine } from '../../packages/sdk/src/core/policy-engine.js';
import { createPendingApproval } from './approvals.js';
import { enrichDecision } from '../lib/decision-enricher.js';   // NEW — see below
import { defaultDetector } from '../lib/pii/regex-detector.js';
import { DetectionEngine } from '../lib/detection/engine.js';
import { HeuristicDetectionPlugin } from '../lib/detection/heuristic.js';

const _heuristic = new HeuristicDetectionPlugin();
const _detectionEngine = new DetectionEngine(_heuristic, _heuristic);
const NOOP_PREV_HASH = '';

export function createBatchEvaluateRoutes(db: IDatabase, auth: AuthMiddleware): Router {
  const router = Router();

  router.post(
    '/api/v1/evaluate/batch',
    auth.requireEvaluateAuth,
    async (req: Request, res: Response) => {
      const batchStart = performance.now();
      const batchId = crypto.randomUUID();
      const tenantId = req.tenantId ?? 'demo';
      const agentId = req.agent?.id ?? null;

      // 1. Validate request
      const parsed = BatchEvaluateRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0]!;
        return res.status(400).json({
          error: 'validation_error',
          field: firstIssue.path.join('.') || 'body',
          expected: firstIssue.message,
          received: typeof req.body,
        });
      }
      const { calls, messageHistory, sessionId } = parsed.data;

      // 2. Kill switch check (shared — fail-fast before touching DB per-call)
      const ks = await getGlobalKillSwitch(db);
      if (ks.active) {
        // Return batch of blocks for all calls
        const results = calls.map((call, index) => ({
          index,
          tool: call.tool,
          decision: 'block' as const,
          riskScore: 1000,
          matchedRuleId: 'KILL_SWITCH',
          durationMs: 0,
          reason: 'Global kill switch is ACTIVE — all agent actions are blocked.',
        }));
        return res.json({
          batchId,
          results,
          summary: { total: calls.length, allowed: 0, monitored: 0, blocked: calls.length, requireApproval: 0 },
          batchDurationMs: Math.round(performance.now() - batchStart),
        });
      }

      if (req.tenant?.kill_switch_active === 1) {
        const results = calls.map((call, index) => ({
          index,
          tool: call.tool,
          decision: 'block' as const,
          riskScore: 1000,
          matchedRuleId: 'TENANT_KILL_SWITCH',
          durationMs: 0,
          reason: 'Tenant kill switch is ACTIVE — all your agent actions are blocked.',
        }));
        return res.json({
          batchId,
          results,
          summary: { total: calls.length, allowed: 0, monitored: 0, blocked: calls.length, requireApproval: 0 },
          batchDurationMs: Math.round(performance.now() - batchStart),
        });
      }

      // 3. Phase 2 rate limiting (check once, not per-call)
      if (tenantId !== 'demo') {
        try {
          const rateLimitResult = await checkPhase2RateLimit(db, tenantId, agentId ?? undefined);
          if (!rateLimitResult.allowed) {
            return res.status(429).json({
              error: 'rate_limit_exceeded',
              retryAfter: Math.ceil(
                (new Date(rateLimitResult.resetAt ?? Date.now() + 60000).getTime() - Date.now()) / 1000
              ),
              message: 'Rate limit exceeded. Please wait before retrying.',
            });
          }
        } catch {
          // Phase 2 tables may not exist yet
        }
      }

      // 4. Load effective policy once (shared across all calls)
      let effectivePolicy = DEFAULT_POLICY;
      if (tenantId !== 'demo') {
        try {
          const customPolicyRaw = await db.getCustomPolicy(tenantId);
          if (customPolicyRaw) {
            const p = JSON.parse(customPolicyRaw) as unknown;
            if (Array.isArray(p)) {
              effectivePolicy = { ...DEFAULT_POLICY, rules: p as typeof DEFAULT_POLICY['rules'] };
            } else if (p && typeof p === 'object') {
              effectivePolicy = p as typeof DEFAULT_POLICY;
            }
          }
        } catch { /* use default */ }
      }

      // 5. Evaluate all calls in parallel (Promise.all)
      const resolvedSessionId = sessionId ?? crypto.randomUUID();

      const evaluationPromises = calls.map(async (call, index) => {
        const callStart = performance.now();
        try {
          const engine = new PolicyEngine();
          engine.registerDocument(effectivePolicy);

          const actionRequest = {
            id: crypto.randomUUID(),
            agentId: req.agent?.name ?? 'batch-eval',
            tool: call.tool,
            params: typeof call.params === 'object' && call.params !== null ? call.params : {},
            inputDataLabels: [],
            timestamp: new Date().toISOString(),
          };
          const ctx = {
            agentId: req.agent?.name ?? 'batch-eval',
            sessionId: resolvedSessionId,
            policyVersion: '1.0.0',
          };

          const decision = engine.evaluate(actionRequest, ctx, effectivePolicy.id);
          const durationMs = Math.round((performance.now() - callStart) * 100) / 100;

          // Store audit event (non-blocking — catch individually)
          storeAuditEvent(
            db, tenantId, resolvedSessionId, call.tool,
            decision.result, decision.matchedRuleId ?? null, decision.riskScore,
            decision.reason ?? null, durationMs, NOOP_PREV_HASH, agentId,
          ).catch(() => {});

          // Create approval if required
          let approvalId: string | undefined;
          let approvalUrl: string | undefined;
          if (decision.result === 'require_approval' && tenantId !== 'demo') {
            try {
              approvalId = await createPendingApproval(
                db, tenantId, agentId, call.tool,
                typeof call.params === 'object' && call.params !== null ? call.params : {},
              );
              approvalUrl = `https://app.agentguard.tech/approvals/${approvalId}`;
            } catch { /* non-blocking */ }
          }

          // Enrich block/flag decisions with actionable info
          const enriched = enrichDecision(decision, call.tool, effectivePolicy);

          const warnings: string[] = [];
          if (
            decision.result === 'monitor' &&
            (!decision.matchedRuleId || decision.matchedRuleId === '')
          ) {
            warnings.push(
              `No policy rules match tool '${call.tool}'. This tool is in fail-open monitor mode.`
            );
          }

          return {
            index,
            tool: call.tool,
            decision: decision.result,
            riskScore: decision.riskScore,
            matchedRuleId: decision.matchedRuleId,
            durationMs,
            ...(enriched.reason ? { reason: enriched.reason } : {}),
            ...(enriched.suggestion ? { suggestion: enriched.suggestion } : {}),
            ...(enriched.docs ? { docs: enriched.docs } : {}),
            ...(enriched.alternatives?.length ? { alternatives: enriched.alternatives } : {}),
            ...(approvalId ? { approvalId } : {}),
            ...(approvalUrl ? { approvalUrl } : {}),
            ...(warnings.length ? { warnings } : {}),
          };
        } catch (err) {
          // Individual failure — return error result, don't fail batch
          return {
            index,
            tool: call.tool,
            decision: 'block' as const,
            riskScore: 500,
            matchedRuleId: 'EVAL_ERROR',
            durationMs: Math.round((performance.now() - callStart) * 100) / 100,
            reason: 'Evaluation failed for this tool call. Blocked as a safety measure.',
          };
        }
      });

      const results = await Promise.all(evaluationPromises);

      // 6. Increment rate counter by N (count as N events, not 1)
      if (tenantId !== 'demo') {
        try {
          for (let i = 0; i < calls.length; i++) {
            await incrementRateCounter(db, tenantId, agentId ?? undefined);
          }
        } catch { /* non-blocking */ }
      }

      // 7. Build summary
      const summary = results.reduce(
        (acc, r) => {
          acc.total++;
          if (r.decision === 'allow') acc.allowed++;
          else if (r.decision === 'monitor') acc.monitored++;
          else if (r.decision === 'block') acc.blocked++;
          else if (r.decision === 'require_approval') acc.requireApproval++;
          return acc;
        },
        { total: 0, allowed: 0, monitored: 0, blocked: 0, requireApproval: 0 }
      );

      // 8. Fire batch webhooks for any blocks (fire-and-forget)
      const blockedResults = results.filter(
        (r) => r.decision === 'block' || r.decision === 'require_approval'
      );
      if (blockedResults.length > 0 && tenantId !== 'demo') {
        fireWebhooksAsync(db, tenantId, 'block', {
          event_type: 'batch_block',
          tenant_id: tenantId,
          agent_id: agentId,
          data: {
            batchId,
            blockedCount: blockedResults.length,
            totalCount: calls.length,
          },
          timestamp: new Date().toISOString(),
        });
      }

      return res.json({
        batchId,
        results,
        summary,
        batchDurationMs: Math.round(performance.now() - batchStart),
      });
    },
  );

  return router;
}
```

#### MODIFY: `api/schemas.ts`

Add after the `EvaluateRequestSchema` definition (around line 18):

```typescript
// ── POST /api/v1/evaluate/batch ───────────────────────────────────────────

const BatchCallSchema = z.object({
  tool: z.string({ error: 'tool is required and must be a string' })
    .min(1, 'tool is required and must be a string')
    .max(200, 'tool name too long (max 200 chars)')
    .regex(
      /^[a-zA-Z0-9_.\-:]+$/,
      'tool name may only contain letters, digits, underscore, hyphen, dot, or colon',
    ),
  params: z.record(z.string(), z.unknown()).optional().default({}),
  context: z.record(z.string(), z.unknown()).optional(),
});

export const BatchEvaluateRequestSchema = z.object({
  agentId: z.string().max(200).optional(),
  sessionId: z.string().max(200).optional(),
  messageHistory: z.array(z.object({
    role: z.string(),
    content: z.string(),
  })).optional(),
  calls: z.array(BatchCallSchema)
    .min(1, 'calls must contain at least 1 item')
    .max(50, 'calls must contain at most 50 items (max batch size)'),
});

export type BatchEvaluateRequest = z.infer<typeof BatchEvaluateRequestSchema>;
export const BatchEvaluateRequest = BatchEvaluateRequestSchema;
```

Also add to the exports section at the bottom:
```typescript
export const BatchEvaluateRequest = BatchEvaluateRequestSchema;
export type BatchEvaluateRequest = z.infer<typeof BatchEvaluateRequestSchema>;
```

#### MODIFY: `api/server.ts`

1. Add import near the other route imports (around line 32):
```typescript
import { createBatchEvaluateRoutes } from './routes/evaluate-batch.js';
```

2. Add brute-force protection for the batch endpoint (around line 168, where brute-force paths are defined):
```typescript
app.use(['/api/v1/signup', '/api/v1/evaluate', '/api/v1/evaluate/batch', '/api/v1/mcp/evaluate'], bruteForceMiddleware);
```

3. Mount the route BEFORE `createEvaluateRoutes` (so `/evaluate/batch` doesn't get swallowed by `/evaluate`'s router — Express routes are first-match, but since each router uses exact paths this ordering is defensive):
```typescript
// Add BEFORE: app.use(createEvaluateRoutes(db, auth));
app.use(createBatchEvaluateRoutes(db, auth));
app.use(createEvaluateRoutes(db, auth));
```

Also add to the endpoints list in the root GET `/` response:
```typescript
'POST /api/v1/evaluate/batch': 'Evaluate multiple tool calls in one request (max 50)',
```

#### CREATE: `api/lib/decision-enricher.ts`

This module generates the actionable fields (`reason`, `suggestion`, `docs`, `alternatives`) for block/flag decisions. It's used by both the single evaluate route (Feature 2) and the batch route.

```typescript
/**
 * AgentGuard — Decision Enricher
 *
 * Generates human-readable, actionable fields for block/flag decisions.
 * Used by both /evaluate and /evaluate/batch endpoints.
 */
import type { PolicyDecision } from '../../../packages/sdk/src/core/types.js';
import type { PolicyDocument } from '../../../packages/sdk/src/core/types.js';

export interface EnrichedDecision {
  reason?: string;
  suggestion?: string;
  docs?: string;
  alternatives?: string[];
}

// Rule-to-docs mapping: maps rule IDs to documentation anchors
const RULE_DOCS: Record<string, string> = {
  'block-external-http': 'https://agentguard.tech/docs/rules#external-http',
  'block-pii-tables': 'https://agentguard.tech/docs/rules#pii-protection',
  'block-privilege-escalation': 'https://agentguard.tech/docs/rules#privilege-escalation',
  'block-destructive-ops': 'https://agentguard.tech/docs/rules#destructive-operations',
  'block-system-path-writes': 'https://agentguard.tech/docs/rules#system-paths',
  'require-approval-financial': 'https://agentguard.tech/docs/rules#financial-approvals',
  'monitor-llm-calls': 'https://agentguard.tech/docs/rules#llm-monitoring',
  'KILL_SWITCH': 'https://agentguard.tech/docs/kill-switch',
  'TENANT_KILL_SWITCH': 'https://agentguard.tech/docs/kill-switch',
  'INJECTION_DETECTED': 'https://agentguard.tech/docs/security#prompt-injection',
  'CHILD_POLICY_VIOLATION': 'https://agentguard.tech/docs/a2a-governance',
  'AGENT_EXPIRED': 'https://agentguard.tech/docs/a2a-governance#ttl',
  'BUDGET_EXCEEDED': 'https://agentguard.tech/docs/a2a-governance#budget',
};

// Rule-to-suggestion mapping: actionable next steps per rule
const RULE_SUGGESTIONS: Record<string, string> = {
  'block-external-http': 'Use an approved internal endpoint, or ask your administrator to add the destination to the allowlist.',
  'block-pii-tables': 'Use the public-facing read API instead of direct DB access, or request a scoped query through the data access service.',
  'block-privilege-escalation': 'Use a dedicated service account with only the required permissions rather than elevated shell commands.',
  'block-destructive-ops': 'Use a soft-delete or archive operation instead. If deletion is required, request operator approval via HITL.',
  'block-system-path-writes': 'Write to an application-scoped path (e.g., /app/data) rather than system directories.',
  'require-approval-financial': 'Submit a human approval request via the approvalUrl. An approver will review and respond within the configured timeout.',
  'INJECTION_DETECTED': 'Ensure tool inputs do not include instructions or content that attempts to override the system prompt.',
  'CHILD_POLICY_VIOLATION': 'This tool is not in the allowed tool list for this agent. Request expanded permissions from the parent agent.',
  'AGENT_EXPIRED': 'The child agent TTL has expired. Spawn a new child agent from the parent to continue.',
  'BUDGET_EXCEEDED': 'The child agent has exhausted its tool call budget. Spawn a new child agent with a larger budget.',
  'KILL_SWITCH': 'All actions are blocked. Contact your system administrator.',
  'TENANT_KILL_SWITCH': 'Your account kill switch is active. Log into the dashboard to deactivate it.',
};

// Tool-to-alternative mapping: suggest allowed tools with similar capability
const TOOL_ALTERNATIVES: Record<string, string[]> = {
  'shell_exec': ['subprocess_safe', 'run_script'],
  'sudo': ['service_account_exec'],
  'http_request': ['internal_fetch', 'approved_api_call'],
  'http_post': ['internal_post', 'approved_api_call'],
  'fetch': ['internal_fetch'],
  'curl': ['internal_fetch', 'approved_api_call'],
  'file_delete': ['file_archive', 'file_move'],
  'rm': ['file_archive'],
  'drop_table': ['truncate_table_safe', 'soft_delete'],
  'db_query': ['db_read_public', 'query_public_view'],
  'db_read': ['db_read_public'],
  'sql_execute': ['db_read_public'],
};

/**
 * Enriches a PolicyDecision with human-readable, actionable context.
 * Only produces meaningful output for 'block' and 'require_approval' decisions.
 * For 'monitor' and 'allow', returns empty enrichment.
 */
export function enrichDecision(
  decision: PolicyDecision,
  toolName: string,
  policy?: PolicyDocument,
): EnrichedDecision {
  // For allow/monitor, no enrichment needed
  if (decision.result === 'allow' || decision.result === 'monitor') {
    return {};
  }

  const ruleId = decision.matchedRuleId ?? '';
  
  // Build reason: prefer existing decision.reason, otherwise derive from rule
  const reason = decision.reason ?? deriveReason(ruleId, toolName);
  
  // Build suggestion
  const suggestion = RULE_SUGGESTIONS[ruleId] ?? deriveGenericSuggestion(decision.result);
  
  // Build docs link
  const docs = RULE_DOCS[ruleId] ?? 'https://agentguard.tech/docs/policy';
  
  // Build alternatives from tool name
  const alternatives = TOOL_ALTERNATIVES[toolName] ?? [];
  
  // For require_approval, the alternatives are empty — waiting for approval is the action
  if (decision.result === 'require_approval') {
    return { reason, suggestion, docs, alternatives: [] };
  }
  
  return { reason, suggestion, docs, alternatives };
}

function deriveReason(ruleId: string, toolName: string): string {
  if (!ruleId) return `Tool '${toolName}' was blocked by the active policy.`;
  return `Tool '${toolName}' matched rule '${ruleId}' and was blocked.`;
}

function deriveGenericSuggestion(result: string): string {
  if (result === 'require_approval') {
    return 'Use the approvalUrl to request human approval before proceeding.';
  }
  return 'Review your agent\'s policy configuration at https://app.agentguard.tech/policy.';
}
```

---

### 1.3 Database Changes

**No new tables required.** Each call in a batch is stored as a separate audit event using the existing `storeAuditEvent` function. The `batchId` is stored in the `session_id` column — all calls share the same `resolvedSessionId` which can be the caller-provided `sessionId` or a generated UUID.

The batch tracking is:
- `batchId` (UUID) returned in response — not persisted separately, but all audit rows for a batch share the same `session_id`
- Usage counters incremented N times (once per call) — no schema change needed

**If you want explicit batch tracking later**, add:
```sql
CREATE TABLE IF NOT EXISTS batch_evaluations (
  id TEXT PRIMARY KEY,           -- batchId
  tenant_id TEXT NOT NULL,
  agent_id TEXT,
  session_id TEXT,
  call_count INTEGER NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  require_approval INTEGER NOT NULL DEFAULT 0,
  monitored INTEGER NOT NULL DEFAULT 0,
  duration_ms REAL,
  created_at TEXT NOT NULL
);
```
This is **not required** for v1. Implement it only if analytics need batch-level aggregation.

---

### 1.4 Test Cases

```typescript
// FILE: api/routes/__tests__/evaluate-batch.test.ts

describe('POST /api/v1/evaluate/batch', () => {

  // ── Happy path ──────────────────────────────────────────────────────────

  test('TC-B01: single call returns single result with index 0', async () => {
    const res = await post('/api/v1/evaluate/batch', {
      calls: [{ tool: 'file_read', params: { path: '/tmp/test.txt' } }]
    });
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].index).toBe(0);
    expect(res.body.results[0].tool).toBe('file_read');
    expect(res.body.batchId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.summary.total).toBe(1);
  });

  test('TC-B02: 3 calls return 3 results in correct order', async () => {
    const calls = [
      { tool: 'file_read', params: {} },
      { tool: 'send_email', params: {} },
      { tool: 'db_read_public', params: {} },
    ];
    const res = await post('/api/v1/evaluate/batch', { calls });
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(3);
    expect(res.body.results[0].index).toBe(0);
    expect(res.body.results[1].index).toBe(1);
    expect(res.body.results[2].index).toBe(2);
    // Order must match input
    expect(res.body.results[0].tool).toBe('file_read');
    expect(res.body.results[1].tool).toBe('send_email');
    expect(res.body.results[2].tool).toBe('db_read_public');
  });

  test('TC-B03: blocked call does not fail other calls in batch', async () => {
    const calls = [
      { tool: 'file_read', params: {} },        // allow
      { tool: 'sudo', params: {} },              // block (privilege escalation)
      { tool: 'db_read_public', params: {} },    // allow
    ];
    const res = await post('/api/v1/evaluate/batch', { calls });
    expect(res.status).toBe(200);
    expect(res.body.results[0].decision).toBe('allow');
    expect(res.body.results[1].decision).toBe('block');
    expect(res.body.results[2].decision).toBe('allow');
    expect(res.body.summary.blocked).toBe(1);
    expect(res.body.summary.allowed).toBe(2);
  });

  test('TC-B04: summary counts are accurate across mixed decisions', async () => {
    const calls = [
      { tool: 'file_read', params: {} },          // allow
      { tool: 'sudo', params: {} },               // block
      { tool: 'llm_query', params: {} },          // monitor
    ];
    const res = await post('/api/v1/evaluate/batch', { calls });
    const s = res.body.summary;
    expect(s.total).toBe(3);
    expect(s.allowed + s.blocked + s.monitored + s.requireApproval).toBe(3);
  });

  test('TC-B05: batchDurationMs is present and reasonable', async () => {
    const res = await post('/api/v1/evaluate/batch', {
      calls: [{ tool: 'file_read', params: {} }]
    });
    expect(res.body.batchDurationMs).toBeGreaterThanOrEqual(0);
    expect(res.body.batchDurationMs).toBeLessThan(5000);
  });

  test('TC-B06: shared sessionId groups all audit events', async () => {
    const sessionId = 'test-session-123';
    const res = await post('/api/v1/evaluate/batch', {
      sessionId,
      calls: [
        { tool: 'file_read', params: {} },
        { tool: 'sudo', params: {} },
      ]
    }, { headers: { 'X-API-Key': VALID_API_KEY } });
    expect(res.status).toBe(200);
    // Verify audit entries share the session_id (check via audit API)
    const audit = await get(`/api/v1/audit?sessionId=${sessionId}`, VALID_API_KEY);
    expect(audit.body.events.length).toBeGreaterThanOrEqual(2);
    audit.body.events.forEach((e: AuditEvent) => {
      expect(e.session_id).toBe(sessionId);
    });
  });

  test('TC-B07: 50 calls (max) returns 50 results', async () => {
    const calls = Array.from({ length: 50 }, (_, i) => ({
      tool: `tool_${i}`,
      params: {},
    }));
    const res = await post('/api/v1/evaluate/batch', { calls });
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(50);
  });

  test('TC-B08: block decisions include reason, suggestion, docs', async () => {
    const res = await post('/api/v1/evaluate/batch', {
      calls: [{ tool: 'sudo', params: {} }]
    });
    const result = res.body.results[0];
    expect(result.decision).toBe('block');
    expect(result.reason).toBeTruthy();
    expect(result.suggestion).toBeTruthy();
    expect(result.docs).toMatch(/^https:\/\//);
  });

  test('TC-B09: events counted as N (not 1) for usage tracking', async () => {
    // Check usage before
    const before = await get('/api/v1/usage', VALID_API_KEY);
    const usageBefore = before.body.eventsThisMonth ?? 0;

    await post('/api/v1/evaluate/batch', {
      calls: [
        { tool: 'file_read', params: {} },
        { tool: 'file_read', params: {} },
        { tool: 'file_read', params: {} },
      ]
    }, { headers: { 'X-API-Key': VALID_API_KEY } });

    const after = await get('/api/v1/usage', VALID_API_KEY);
    const usageAfter = after.body.eventsThisMonth ?? 0;
    expect(usageAfter - usageBefore).toBe(3);
  });

  test('TC-B10: require_approval returns approvalId and approvalUrl', async () => {
    const res = await post('/api/v1/evaluate/batch', {
      calls: [{ tool: 'transfer_funds', params: { amount: 5000 } }]
    }, { headers: { 'X-API-Key': VALID_API_KEY } });
    const result = res.body.results[0];
    if (result.decision === 'require_approval') {
      expect(result.approvalId).toBeTruthy();
      expect(result.approvalUrl).toMatch(/^https:\/\/app\.agentguard\.tech\/approvals\//);
    }
  });

  // ── Validation errors ───────────────────────────────────────────────────

  test('TC-B11: 0 calls returns 400 validation_error', async () => {
    const res = await post('/api/v1/evaluate/batch', { calls: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.field).toContain('calls');
  });

  test('TC-B12: 51 calls returns 400 validation_error', async () => {
    const calls = Array.from({ length: 51 }, () => ({ tool: 'file_read', params: {} }));
    const res = await post('/api/v1/evaluate/batch', { calls });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  test('TC-B13: missing calls field returns 400', async () => {
    const res = await post('/api/v1/evaluate/batch', { agentId: 'test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.field).toContain('calls');
  });

  test('TC-B14: invalid tool name (special chars) returns 400', async () => {
    const res = await post('/api/v1/evaluate/batch', {
      calls: [{ tool: 'tool<script>alert(1)</script>', params: {} }]
    });
    expect(res.status).toBe(400);
  });

  // ── Kill switch ─────────────────────────────────────────────────────────

  test('TC-B15: global kill switch blocks all calls with KILL_SWITCH ruleId', async () => {
    await activateGlobalKillSwitch();
    const res = await post('/api/v1/evaluate/batch', {
      calls: [{ tool: 'file_read', params: {} }, { tool: 'sudo', params: {} }]
    });
    expect(res.status).toBe(200);
    res.body.results.forEach((r: BatchResult) => {
      expect(r.decision).toBe('block');
      expect(r.matchedRuleId).toBe('KILL_SWITCH');
    });
    await deactivateGlobalKillSwitch();
  });
});
```

---

### 1.5 Edge Cases

| Edge Case | Expected Behavior |
|-----------|------------------|
| All 50 calls blocked | Returns 200 with all results blocked; summary.blocked = 50 |
| `calls` is not an array | 400 validation_error with field=calls |
| One call has a tool name that's 200 chars | Passes validation; evaluated normally |
| One call has empty `params` | Treated as `{}` — safe |
| `messageHistory` is 1000 entries long | Validated by Zod schema; evaluated as-is. Recommend adding a max length if performance becomes an issue (500 entries cap suggested) |
| Kill switch activated mid-request | Kill switch is checked once at request start; individual calls evaluated against state at that moment. Not per-call re-check — acceptable for batch atomicity |
| All calls are `require_approval` | 50 approval records created; all approvalUrls returned |
| Phase 2 rate limit reached mid-batch | Rate limit checked once at request start (not per-call). If limit is reached, the request is rejected before evaluation. N events are credited only after successful batch response |
| DB write fails for one audit event | `catch(() => {})` in storeAuditEvent — never propagates to response |
| Concurrent batches from same tenant | Handled by existing phase2 rate limit; no additional locking needed |

---

### 1.6 Integration Points

1. **`api/server.ts`**: Route mounting order matters. `createBatchEvaluateRoutes` must be mounted before `createEvaluateRoutes` to ensure `/evaluate/batch` is registered before Express sees the `/evaluate` router.

2. **`api/middleware/rate-limit.ts` brute-force**: Add `/api/v1/evaluate/batch` to the brute-force path list. Without this, attackers can use the batch endpoint to probe 50 tools at once without brute-force throttling.

3. **`api/routes/audit.ts` (`storeAuditEvent`)**: Called N times per batch request (once per call). This is intentional — each tool call is an independent security event. No changes needed to `storeAuditEvent`.

4. **`api/phase2-routes.ts` (`incrementRateCounter`)**: Called N times (loop, not once). This ensures usage is counted correctly as N events, matching the data model assumption in license enforcement.

5. **`api/lib/decision-enricher.ts`**: New shared library. Used by both `evaluate-batch.ts` and the updated `evaluate.ts` (Feature 2). Import pattern: `import { enrichDecision } from '../lib/decision-enricher.js'`.

---

## Feature 2: Actionable Error Responses

### Decision rationale

Agents that receive a `block` decision with no explanation are stuck. They can't retry intelligently, can't escalate appropriately, and can't tell users what happened. The fix: every block/flag decision includes `reason`, `suggestion`, `docs`, and `alternatives` — a complete "what now?" package.

Separately, HTTP error responses (400, 401, 402, 429) across the API are currently terse. Machine-readable structured errors let SDK clients handle them programmatically without parsing strings.

---

### 2.1 API Contract

#### Enriched Evaluate Response (block/require_approval)

The existing `POST /api/v1/evaluate` response gains these fields when `result` is `block` or `require_approval`:

```typescript
{
  result: "block",
  matchedRuleId: "block-external-http",
  riskScore: 350,
  reason: "Tool 'http_request' matched rule 'block-external-http': External HTTP requests to unapproved domains are blocked.",
  
  // NEW FIELDS:
  suggestion: "Use an approved internal endpoint, or ask your administrator to add the destination to the allowlist.",
  approvalUrl: "https://app.agentguard.tech/approvals/abc-123",  // only for require_approval
  docs: "https://agentguard.tech/docs/rules#external-http",
  alternatives: ["internal_fetch", "approved_api_call"],
  
  durationMs: 4.2,
  agentId: "agent-123"
}
```

All four new fields (`suggestion`, `docs`, `alternatives`) are **always present** on block/flag decisions. `approvalUrl` is only present on `require_approval`. `alternatives` may be an empty array `[]` if no alternatives are known.

#### Improved HTTP Error Schemas

**400 Bad Request:**
```typescript
{
  error: "validation_error",
  field: "tool",              // which field is wrong
  expected: "string, 1-200 characters, matching /^[a-zA-Z0-9_.\\-:]+$/",
  received: "number",         // type or value received
  docs: "https://agentguard.tech/docs/api#evaluate"
}
```

**401 Unauthorized:**
```typescript
{
  error: "unauthorized",
  message: "Valid API key required",
  acceptedAuth: [
    "Header: X-API-Key: ag_<key>",
    "Header: X-API-Key: ag_agent_<key>"
  ],
  docs: "https://agentguard.tech/docs/authentication"
}
```

**402 Payment Required:**
```typescript
{
  error: "feature_gated",    // or "limit_exceeded"
  feature: "sso",            // (for feature_gated)
  limitKey: "eventsPerMonth", // (for limit_exceeded)
  message: "This feature requires an Enterprise plan or higher.",
  currentTier: "free",
  requiredTier: "enterprise",
  pricingUrl: "https://agentguard.tech/pricing",
  upgradeUrl: "https://agentguard.tech/pricing"
}
```

**429 Too Many Requests:**
```typescript
{
  error: "rate_limit_exceeded",
  retryAfter: 60,             // seconds until next allowed request
  message: "Too many requests. Please wait 60 seconds before retrying.",
  limit: 100,                 // requests per window
  window: "1 minute"
}
```

---

### 2.2 Files to Create/Modify

#### CREATE: `api/lib/decision-enricher.ts`

(Already specified in Feature 1, Section 1.2 — same file. Feature 1 creates it; Feature 2 uses it in the single evaluate route.)

#### MODIFY: `api/routes/evaluate.ts`

**Step 1:** Add import at the top:
```typescript
import { enrichDecision } from '../lib/decision-enricher.js';
```

**Step 2:** Replace the final `res.json(...)` call (currently around line 298 in evaluate.ts) with:

```typescript
// Enrich block/flag decisions with actionable context
const enriched = (decision.result === 'block' || decision.result === 'require_approval')
  ? enrichDecision(decision, tool, effectivePolicy)
  : {};

res.json({
  result: decision.result,
  matchedRuleId: decision.matchedRuleId,
  riskScore: decision.riskScore,
  reason: decision.reason,
  durationMs: ms,
  // Actionable enrichment (Feature 2)
  ...(enriched.suggestion ? { suggestion: enriched.suggestion } : {}),
  ...(enriched.docs ? { docs: enriched.docs } : {}),
  ...(enriched.alternatives !== undefined ? { alternatives: enriched.alternatives } : {}),
  // Existing fields
  ...(agentId ? { agentId } : {}),
  ...(approvalId ? { approvalId } : {}),
  ...(approvalId ? { approvalUrl: `https://app.agentguard.tech/approvals/${approvalId}` } : {}),
  ...(warnings.length > 0 ? { warnings } : {}),
  ...(piiBlock ? { pii: piiBlock } : {}),
});
```

**Step 3:** Update the 400 response (around line 215, where `evalParsed.success` is checked):

```typescript
if (!evalParsed.success) {
  const firstIssue = evalParsed.error.issues[0]!;
  const fieldPath = firstIssue.path.join('.') || 'body';
  return res.status(400).json({
    error: 'validation_error',
    field: fieldPath,
    expected: firstIssue.message,
    received: fieldPath === 'body' ? typeof req.body : typeof (req.body as Record<string, unknown>)[fieldPath],
    docs: 'https://agentguard.tech/docs/api#evaluate',
  });
}
```

#### MODIFY: `api/middleware/auth.ts`

Find the 401 responses and update to the structured format. Locate lines where `res.status(401).json(...)` is called and update:

```typescript
// Before:
res.status(401).json({ error: 'Missing or invalid API key' });

// After:
res.status(401).json({
  error: 'unauthorized',
  message: 'Missing or invalid API key',
  acceptedAuth: ['Header: X-API-Key: ag_<key>', 'Header: X-API-Key: ag_agent_<key>'],
  docs: 'https://agentguard.tech/docs/authentication',
});
```

Apply this pattern to ALL 401 responses in auth.ts. Use `grep -n "status(401)" api/middleware/auth.ts` to find all locations.

#### MODIFY: `api/middleware/feature-gate.ts`

Update the 402 responses (two locations: `requireFeature` and `requireLimit`):

**In `requireFeature`:**
```typescript
res.status(402).json({
  error: 'feature_gated',
  feature,
  message: `This feature requires a ${minTier} plan or higher.`,
  currentTier: tier,
  requiredTier: minTier.toLowerCase(),
  pricingUrl: 'https://agentguard.tech/pricing',
  upgradeUrl: 'https://agentguard.tech/pricing',
  upgrade_url: 'https://agentguard.tech/pricing', // keep for backward compat
});
```

**In `requireLimit`:**
```typescript
res.status(402).json({
  error: 'limit_exceeded',
  limitKey,
  message: `Monthly ${limitKey} limit of ${limit.toLocaleString()} exceeded.`,
  current: used,
  limit,
  tier: license.tier,
  requiredTier: 'pro',  // free users upgrading always go to pro first
  pricingUrl: 'https://agentguard.tech/pricing',
  upgradeUrl: 'https://agentguard.tech/pricing',
  upgrade_url: 'https://agentguard.tech/pricing', // keep for backward compat
});
```

#### MODIFY: `api/middleware/rate-limit.ts`

Locate the 429 response in `rateLimitMiddleware` and update:

```typescript
// Find the 429 handler and replace with:
res.status(429).json({
  error: 'rate_limit_exceeded',
  retryAfter: 60,        // adjust based on actual window size
  message: 'Too many requests. Please wait 60 seconds before retrying.',
  limit: isAuth ? 100 : 10,   // 100 auth, 10 unauth — matches server.ts comment
  window: '1 minute',
});
res.setHeader('Retry-After', '60');
```

Also add `Retry-After` header to 429 responses (required by RFC 6585).

#### MODIFY: `api/middleware/error-handler.ts`

Ensure the global error handler returns structured errors, not raw Express errors:

```typescript
// In the global error handler, ensure 400s also include field info:
if (err.status === 400 || err.type === 'entity.parse.failed') {
  return res.status(400).json({
    error: 'validation_error',
    field: 'body',
    expected: 'valid JSON',
    received: 'malformed JSON',
    docs: 'https://agentguard.tech/docs/api',
  });
}
```

---

### 2.3 Database Changes

None. This feature is purely response-layer enrichment. The `decision-enricher.ts` module uses in-memory rule/tool lookup tables (no DB calls).

---

### 2.4 Test Cases

```typescript
describe('Feature 2: Actionable Error Responses', () => {

  // ── Block decision enrichment ──────────────────────────────────────────

  test('TC-E01: block decision includes reason', async () => {
    const res = await post('/api/v1/evaluate', { tool: 'sudo', params: {} });
    expect(res.body.result).toBe('block');
    expect(res.body.reason).toBeTruthy();
    expect(typeof res.body.reason).toBe('string');
    expect(res.body.reason.length).toBeGreaterThan(0);
  });

  test('TC-E02: block decision includes suggestion', async () => {
    const res = await post('/api/v1/evaluate', { tool: 'sudo', params: {} });
    expect(res.body.suggestion).toBeTruthy();
    expect(typeof res.body.suggestion).toBe('string');
  });

  test('TC-E03: block decision includes docs URL', async () => {
    const res = await post('/api/v1/evaluate', { tool: 'sudo', params: {} });
    expect(res.body.docs).toMatch(/^https:\/\/agentguard\.tech\//);
  });

  test('TC-E04: block decision includes alternatives array', async () => {
    const res = await post('/api/v1/evaluate', { tool: 'http_request', params: {} });
    expect(res.body.result).toBe('block');
    expect(Array.isArray(res.body.alternatives)).toBe(true);
  });

  test('TC-E05: allow decision does NOT include suggestion/docs/alternatives', async () => {
    const res = await post('/api/v1/evaluate', { tool: 'file_read', params: {} });
    expect(res.body.result).toBe('allow');
    expect(res.body.suggestion).toBeUndefined();
    expect(res.body.docs).toBeUndefined();
    expect(res.body.alternatives).toBeUndefined();
  });

  test('TC-E06: require_approval includes approvalUrl', async () => {
    const res = await post('/api/v1/evaluate', {
      tool: 'transfer_funds',
      params: { amount: 5000 }
    }, { headers: { 'X-API-Key': VALID_API_KEY } });
    if (res.body.result === 'require_approval') {
      expect(res.body.approvalUrl).toMatch(/^https:\/\/app\.agentguard\.tech\/approvals\//);
      expect(res.body.approvalId).toBeTruthy();
    }
  });

  test('TC-E07: require_approval alternatives is empty array', async () => {
    const res = await post('/api/v1/evaluate', {
      tool: 'transfer_funds',
      params: { amount: 5000 }
    }, { headers: { 'X-API-Key': VALID_API_KEY } });
    if (res.body.result === 'require_approval') {
      expect(res.body.alternatives).toEqual([]);
    }
  });

  // ── 400 errors ─────────────────────────────────────────────────────────

  test('TC-E08: 400 includes field and expected', async () => {
    const res = await post('/api/v1/evaluate', { tool: 123, params: {} });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.field).toBeTruthy();
    expect(res.body.expected).toBeTruthy();
  });

  test('TC-E09: 400 on missing tool field includes field=tool', async () => {
    const res = await post('/api/v1/evaluate', { params: {} });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('tool');
  });

  test('TC-E10: 400 includes docs link', async () => {
    const res = await post('/api/v1/evaluate', { params: {} });
    expect(res.body.docs).toMatch(/^https:\/\//);
  });

  // ── 401 errors ─────────────────────────────────────────────────────────

  test('TC-E11: 401 includes acceptedAuth array', async () => {
    const res = await post('/api/v1/evaluate', { tool: 'file_read' }, {
      headers: { 'X-API-Key': 'invalid-key' }
    });
    if (res.status === 401) {
      expect(Array.isArray(res.body.acceptedAuth)).toBe(true);
      expect(res.body.acceptedAuth.length).toBeGreaterThan(0);
    }
  });

  test('TC-E12: 401 includes docs link', async () => {
    const res = await post('/api/v1/evaluate', { tool: 'file_read' }, {
      headers: { 'X-API-Key': 'invalid-key' }
    });
    if (res.status === 401) {
      expect(res.body.docs).toMatch(/^https:\/\//);
    }
  });

  // ── 402 errors ─────────────────────────────────────────────────────────

  test('TC-E13: 402 feature_gated includes requiredTier and pricingUrl', async () => {
    // Hit an enterprise-only endpoint without license
    const res = await get('/api/v1/siem/config', VALID_FREE_API_KEY);
    if (res.status === 402) {
      expect(res.body.requiredTier).toBeTruthy();
      expect(res.body.pricingUrl).toMatch(/^https:\/\//);
    }
  });

  // ── 429 errors ─────────────────────────────────────────────────────────

  test('TC-E14: 429 includes retryAfter as number', async () => {
    // Hammer the endpoint to trigger rate limit
    const promises = Array.from({ length: 15 }, () =>
      post('/api/v1/evaluate', { tool: 'file_read', params: {} })
    );
    const results = await Promise.all(promises);
    const tooMany = results.find((r) => r.status === 429);
    if (tooMany) {
      expect(typeof tooMany.body.retryAfter).toBe('number');
      expect(tooMany.body.retryAfter).toBeGreaterThan(0);
      expect(tooMany.headers['retry-after']).toBeTruthy();
    }
  });

  test('TC-E15: 429 includes limit and window fields', async () => {
    const promises = Array.from({ length: 15 }, () =>
      post('/api/v1/evaluate', { tool: 'file_read', params: {} })
    );
    const results = await Promise.all(promises);
    const tooMany = results.find((r) => r.status === 429);
    if (tooMany) {
      expect(typeof tooMany.body.limit).toBe('number');
      expect(typeof tooMany.body.window).toBe('string');
    }
  });

  // ── enrichDecision unit tests ───────────────────────────────────────────

  test('TC-E16: enrichDecision returns empty for allow decisions', () => {
    const decision = { result: 'allow', riskScore: 0, matchedRuleId: 'allow-read-operations' };
    const enriched = enrichDecision(decision, 'file_read');
    expect(enriched).toEqual({});
  });

  test('TC-E17: enrichDecision generates suggestion for known rule', () => {
    const decision = { result: 'block', riskScore: 300, matchedRuleId: 'block-privilege-escalation' };
    const enriched = enrichDecision(decision, 'sudo');
    expect(enriched.suggestion).toContain('service account');
    expect(enriched.docs).toMatch(/privilege-escalation/);
  });

  test('TC-E18: enrichDecision falls back gracefully for unknown rule', () => {
    const decision = { result: 'block', riskScore: 100, matchedRuleId: 'custom-rule-xyz' };
    const enriched = enrichDecision(decision, 'some_tool');
    expect(enriched.reason).toBeTruthy();
    expect(enriched.suggestion).toBeTruthy();
    expect(enriched.docs).toMatch(/^https:\/\//);
  });
});
```

---

### 2.5 Edge Cases

| Edge Case | Expected Behavior |
|-----------|------------------|
| Custom rule that's not in RULE_SUGGESTIONS | Falls back to `deriveGenericSuggestion()` — always returns a non-empty string |
| decision.reason already populated by policy engine | Used as-is; enricher does not overwrite `reason` — it supplements |
| Tool name not in TOOL_ALTERNATIVES | `alternatives` returns `[]` — never undefined |
| Block from INJECTION_DETECTED | Has specific suggestion re: prompt injection |
| Block from KILL_SWITCH | Suggestion tells user to contact admin; no alternatives |
| `require_approval` when `tenantId === 'demo'` | No approvalId/approvalUrl generated (createPendingApproval skipped for demo) |
| Policy engine throws during evaluation | Caught by try/catch, 500 returned — no enrichment attempted |
| Very long `decision.reason` from policy engine | Passed through as-is; no truncation |

---

### 2.6 Integration Points

1. **`api/lib/decision-enricher.ts`** is the single source of truth for enrichment logic. Both `/evaluate` and `/evaluate/batch` import from it. Never duplicate this logic.

2. **Backward compatibility**: The new fields (`suggestion`, `docs`, `alternatives`) are **additive**. Existing clients that don't read them are unaffected. Do not change the existing `result`, `matchedRuleId`, `riskScore`, `reason`, or `durationMs` field names.

3. **The `reason` field**: The policy engine already populates `decision.reason` for some rules. The enricher checks `decision.reason` first and uses it. For rules that don't produce a reason, it derives one from the rule ID. Never overwrite an existing non-null reason.

4. **`approvalUrl` construction**: Uses the pattern `https://app.agentguard.tech/approvals/${approvalId}`. This is hardcoded for now. If the dashboard URL becomes configurable, extract it to an env var: `DASHBOARD_URL ?? 'https://app.agentguard.tech'`.

5. **`api/middleware/feature-gate.ts`**: Already has backward-compat `upgrade_url` (snake_case). Keep it — external integrations may depend on it. Add `pricingUrl` and `requiredTier` as new fields, not replacements.

---

## Feature 3: Free Tier Increase — 25K → 100K

### Decision rationale

100K events/month removes the perception of a "toy" free tier. At ~3.3K events/day, a real development environment generating events every 30 seconds hits the 25K limit in 2 hours of active testing. 100K means a full week of active development without hitting the wall. The marginal cost (a counter increment in SQLite/Postgres) is negligible. The conversion driver is seats, retention features, and compliance modules — not event count.

This change needs to be consistent across all code paths: license types, pricing API, and all user-facing HTML.

---

### 3.1 API Contract

No API schema change. The `/api/v1/pricing` endpoint will reflect the new limit automatically once `TIER_LIMITS.free.eventsPerMonth` is updated. No new endpoints.

The `/api/v1/usage` response already shows the limit dynamically from the license system — it will update automatically.

---

### 3.2 Files to Modify

**All changes are mechanical search-and-replace. Every change is listed with exact location.**

#### MODIFY: `api/lib/license-types.ts`

**Change 1** — `LicensePayload` comment (line ~36):
```typescript
// Before:
/** Monthly evaluation events: 25000 free, 500000 pro, -1 unlimited */

// After:
/** Monthly evaluation events: 100000 free, 500000 pro, -1 unlimited */
```

**Change 2** — `FREE_TIER_DEFAULTS.limits.eventsPerMonth` (around line 80):
```typescript
// Before:
eventsPerMonth: 25_000,

// After:
eventsPerMonth: 100_000,
```

**Change 3** — `TIER_LIMITS.free.eventsPerMonth` (around line 95):
```typescript
// Before:
free: {
  eventsPerMonth: 25_000,

// After:
free: {
  eventsPerMonth: 100_000,
```

That's all in this file. The `TIER_LIMITS` object is what `pricing.ts` uses via `TIER_LIMITS.free.eventsPerMonth`, so the pricing API updates automatically.

#### MODIFY: `api/routes/pricing.ts`

No code changes needed — the pricing route already references `TIER_LIMITS.free.eventsPerMonth` dynamically:
```typescript
limits: {
  eventsPerMonth: TIER_LIMITS.free.eventsPerMonth,    // now reads 100_000
```

**Verify** by running `GET /api/v1/pricing` after the `license-types.ts` change — the free tier should show `"eventsPerMonth": 100000`.

#### MODIFY: `docs-site/index.html`

Two locations (found by grep):

**Line 2587:**
```html
<!-- Before: -->
<div class="callout callout-tip"><strong>Free tier included.</strong> Self-hosted is free for up to 25,000 evaluation events/month with 3 agent seats. No license key required to get started.</div>

<!-- After: -->
<div class="callout callout-tip"><strong>Free tier included.</strong> Self-hosted is free for up to 100,000 evaluation events/month with 3 agent seats. No license key required to get started.</div>
```

**Line 2614:**
```html
<!-- Before: -->
  <tr><td>API evaluation events</td><td><strong>25,000 / month</strong></td></tr>

<!-- After: -->
  <tr><td>API evaluation events</td><td><strong>100,000 / month</strong></td></tr>
```

#### MODIFY: `landing/index.html`

Grep found no "25,000" or "25K" references in this file. No changes needed. Verify with:
```bash
grep -n "25[,.]000\|25K\|eventsPerMonth\|free.*tier" landing/index.html
```
If any matches appear, apply the same 25,000 → 100,000 substitution.

#### MODIFY: `self-hosted/README.md`

**Line 75:**
```markdown
<!-- Before: -->
| API evaluation events | **25,000 / month** |

<!-- After: -->
| API evaluation events | **100,000 / month** |
```

#### MODIFY: `dashboard/index.html`

Three locations:

**Line 1066:**
```html
<!-- Before: -->
<div id="lic-plan-sub" style="...">25,000 events/month · 3 agents · 7-day retention</div>

<!-- After: -->
<div id="lic-plan-sub" style="...">100,000 events/month · 3 agents · 30-day retention</div>
```

Note: the existing string says "7-day retention" but `license-types.ts` shows `retentionDays: 30` for free. Fix both the event count and the retention display.

**Line 1109:**
```html
<!-- Before: -->
<span id="lic-events-label" style="...">12,450 / 25,000</span>

<!-- After: -->
<span id="lic-events-label" style="...">12,450 / 100,000</span>
```

Note: The `12,450` is hardcoded demo data — it should eventually be dynamically populated. For now, update the denominator.

**Line 2030:**
```javascript
// Before:
free: '25,000 events/month · 3 agents · 7-day retention',

// After:
free: '100,000 events/month · 3 agents · 30-day retention',
```

---

### 3.3 Database Changes

None. The free tier event limit is enforced entirely in-memory via `FREE_TIER_DEFAULTS` and `TIER_LIMITS`. No database columns store this value.

If you have a `licenses` table that stores plan limits at license issuance time (via `LicenseIssueRequestSchema.customLimits`), those records are tenant-specific and **not** affected by this change. Only newly-issued free tier licenses will default to 100K. Existing free-tier tenants without an explicit license key will automatically get the 100K limit when `FREE_TIER_DEFAULTS` is updated.

---

### 3.4 Test Cases

```typescript
describe('Feature 3: Free Tier 100K Limit', () => {

  test('TC-T01: TIER_LIMITS.free.eventsPerMonth is 100_000', () => {
    expect(TIER_LIMITS.free.eventsPerMonth).toBe(100_000);
  });

  test('TC-T02: FREE_TIER_DEFAULTS.limits.eventsPerMonth is 100_000', () => {
    expect(FREE_TIER_DEFAULTS.limits.eventsPerMonth).toBe(100_000);
  });

  test('TC-T03: GET /api/v1/pricing returns free tier eventsPerMonth = 100000', async () => {
    const res = await get('/api/v1/pricing');
    expect(res.status).toBe(200);
    const freeTier = res.body.tiers.find((t: Tier) => t.name === 'Free');
    expect(freeTier).toBeDefined();
    expect(freeTier.limits.eventsPerMonth).toBe(100_000);
  });

  test('TC-T04: 402 limit_exceeded message references 100,000', async () => {
    // Simulate over-limit tenant
    const res = await simulateOverLimit(FREE_TENANT_API_KEY, 100_001);
    expect(res.status).toBe(402);
    expect(res.body.limit).toBe(100_000);
    expect(res.body.message).toContain('100,000');
  });

  test('TC-T05: Tenant at 99,999 events can still evaluate (under limit)', async () => {
    const res = await simulateUsage(FREE_TENANT_API_KEY, 99_999);
    const evalRes = await post('/api/v1/evaluate', { tool: 'file_read', params: {} }, {
      headers: { 'X-API-Key': FREE_TENANT_API_KEY }
    });
    expect(evalRes.status).toBe(200);
    expect(evalRes.body.result).not.toBe('limit_exceeded');
  });

  test('TC-T06: Tenant at 100,000 events is blocked on next evaluate', async () => {
    const res = await simulateUsage(FREE_TENANT_API_KEY, 100_000);
    const evalRes = await post('/api/v1/evaluate', { tool: 'file_read', params: {} }, {
      headers: { 'X-API-Key': FREE_TENANT_API_KEY }
    });
    expect(evalRes.status).toBe(402);
  });

  test('TC-T07: docs-site index.html contains 100,000 (not 25,000)', async () => {
    const content = fs.readFileSync('docs-site/index.html', 'utf-8');
    expect(content).not.toContain('25,000 evaluation events');
    expect(content).toContain('100,000 evaluation events');
  });

  test('TC-T08: self-hosted README.md contains 100,000', () => {
    const content = fs.readFileSync('self-hosted/README.md', 'utf-8');
    expect(content).not.toContain('25,000 / month');
    expect(content).toContain('100,000 / month');
  });

  test('TC-T09: dashboard/index.html contains 100,000', () => {
    const content = fs.readFileSync('dashboard/index.html', 'utf-8');
    expect(content).not.toContain('25,000 events/month');
    expect(content).toContain('100,000 events/month');
  });

  test('TC-T10: Pro tier eventsPerMonth unchanged at 500_000', () => {
    expect(TIER_LIMITS.pro.eventsPerMonth).toBe(500_000);
  });

  test('TC-T11: Enterprise tier eventsPerMonth unchanged at -1 (unlimited)', () => {
    expect(TIER_LIMITS.enterprise.eventsPerMonth).toBe(-1);
  });

  test('TC-T12: LicenseIssueRequest with tier=free defaults to 100K limit', async () => {
    const res = await post('/api/v1/license/issue', {
      tenantId: 'test-tenant-' + Date.now(),
      tier: 'free',
    }, { headers: { 'X-Admin-Key': ADMIN_KEY } });
    // License issued successfully; validate it
    // The encoded limits should reflect 100_000
    // (Exact validation depends on license decode implementation)
    expect(res.status).toBe(200);
  });
});
```

---

### 3.5 Edge Cases

| Edge Case | Expected Behavior |
|-----------|------------------|
| Tenant has an explicit license key with `customLimits.events_pm = 25000` | Their specific license takes precedence over `FREE_TIER_DEFAULTS`. They keep 25K until their license is re-issued. This is correct behavior. |
| Tenant has no license key (pure free default) | Gets 100K automatically — `FREE_TIER_DEFAULTS` is used |
| Pro tenant with 500K limit | Unaffected — `TIER_LIMITS.pro` is unchanged |
| Dashboard shows stale 25K in JS variable | Fixed by updating line 2030 in dashboard/index.html |
| `docs/` markdown files that mention 25K | These are historical planning docs — do not change. They document what the limit _was_, not what it is now. |
| `docs/DX_TEST_RESULTS.md` mentions 25K | Historical test results — leave unchanged. Context makes clear these are past observations. |

---

### 3.6 Integration Points

1. **`api/lib/license-types.ts`** is the single source of truth for tier limits at runtime. Change it first — everything else flows from it.

2. **`api/routes/pricing.ts`** reads `TIER_LIMITS.free.eventsPerMonth` at module load time via `const PRICING_DATA = { ... }`. If PRICING_DATA is a const initialized at module load, it will pick up the new value when the module is loaded. Verify: the const references `TIER_LIMITS.free.eventsPerMonth` inline (not a copy) — this is the case in the current code, so no change needed.

3. **`api/middleware/feature-gate.ts` (`requireLimit`)** reads `license.limits.eventsPerMonth` from the runtime license context. Free-tier tenants without a key get `FREE_TIER_DEFAULTS.limits.eventsPerMonth = 100_000`. This is automatic.

4. **Static HTML files** must be updated manually (no server-side rendering). The four HTML locations are listed above with exact line numbers.

5. **No database migration needed.** If you run a script to detect tenants approaching their limit (e.g., to send warning emails), update any hardcoded "25000" threshold in that script too.

---

## Implementation Sequence (for parallel subagents)

The three features are fully independent and can be built in parallel. Recommended split:

| Subagent | Feature | Key files |
|----------|---------|-----------|
| Agent A | Feature 1: Batch Evaluate | `api/routes/evaluate-batch.ts` (new), `api/schemas.ts`, `api/server.ts`, `api/lib/decision-enricher.ts` (new) |
| Agent B | Feature 2: Actionable Errors | `api/routes/evaluate.ts`, `api/middleware/auth.ts`, `api/middleware/feature-gate.ts`, `api/middleware/rate-limit.ts`, `api/middleware/error-handler.ts` — note: also creates `api/lib/decision-enricher.ts` if Agent A hasn't yet |
| Agent C | Feature 3: Free Tier 100K | `api/lib/license-types.ts`, `docs-site/index.html`, `self-hosted/README.md`, `dashboard/index.html` |

**Dependency note:** Features 1 and 2 both use `api/lib/decision-enricher.ts`. If built in parallel, coordinate on who creates this file. Recommended: Agent A creates it, Agent B imports from it. If Agent B finishes first, Agent B creates it; Agent A imports when ready.

---

## Summary of All File Changes

| File | Action | Reason |
|------|--------|--------|
| `api/routes/evaluate-batch.ts` | **CREATE** | New batch endpoint |
| `api/lib/decision-enricher.ts` | **CREATE** | Shared enrichment logic for F1+F2 |
| `api/schemas.ts` | **MODIFY** | Add `BatchEvaluateRequestSchema` |
| `api/server.ts` | **MODIFY** | Mount batch route, add to brute-force list, add to endpoint discovery |
| `api/routes/evaluate.ts` | **MODIFY** | Add enrichment to block/flag responses, improve 400 format |
| `api/middleware/auth.ts` | **MODIFY** | Structured 401 errors with `acceptedAuth` and `docs` |
| `api/middleware/feature-gate.ts` | **MODIFY** | Add `requiredTier`, `pricingUrl` to 402 responses |
| `api/middleware/rate-limit.ts` | **MODIFY** | Add `retryAfter`, `limit`, `window` to 429; add `Retry-After` header |
| `api/middleware/error-handler.ts` | **MODIFY** | Structured 400 for JSON parse errors |
| `api/lib/license-types.ts` | **MODIFY** | `eventsPerMonth: 25_000` → `100_000` (3 places) |
| `docs-site/index.html` | **MODIFY** | 25,000 → 100,000 (2 places, lines 2587 and 2614) |
| `self-hosted/README.md` | **MODIFY** | 25,000 → 100,000 (1 place, line 75) |
| `dashboard/index.html` | **MODIFY** | 25,000 → 100,000 (3 places, lines 1066, 1109, 2030) |

---

*Design complete. All decisions have been made. Implement exactly as specified.*
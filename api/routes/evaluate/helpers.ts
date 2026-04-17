/**
 * AgentGuard — Evaluate Route Helpers
 *
 * PII detection, prompt-injection detection engine, and pre-evaluation
 * check helpers used by the evaluate route handlers.
 */
import crypto from 'crypto';
import { logger } from '../../lib/logger.js';
import { getGlobalKillSwitch, storeAuditEvent, fireWebhooksAsync } from '../audit.js';
import { getGlobalKillSwitchCached, getTenantKillSwitchCached } from '../../lib/kill-switch-cache.js';
import { defaultDetector } from '../../lib/pii/regex-detector.js';
import { DetectionEngine } from '../../lib/detection/engine.js';
import { HeuristicDetectionPlugin } from '../../lib/detection/heuristic.js';
import type { DetectionResult } from '../../lib/detection/types.js';
import type { IDatabase } from '../../db-interface.js';

// getLastHash is no longer called directly — storeAuditEvent is now atomic
export const NOOP_PREV_HASH = '';

// Singleton detection engine (heuristic as both primary and fallback)
const _heuristic = new HeuristicDetectionPlugin();
export const _detectionEngine = new DetectionEngine(_heuristic, _heuristic);

// ── PII helpers ─────────────────────────────────────────────────────────────

/**
 * Check if PII detection is enabled for the tenant by reading their custom
 * policy JSON for a `piiDetection.enabled` flag.
 */
export function isPiiEnabled(customPolicyRaw: string | null): boolean {
  if (!customPolicyRaw) return false;
  try {
    const parsed = JSON.parse(customPolicyRaw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const policy = parsed as Record<string, unknown>;
      const piiConfig = policy['piiDetection'];
      if (piiConfig && typeof piiConfig === 'object' && !Array.isArray(piiConfig)) {
        return (piiConfig as Record<string, unknown>)['enabled'] === true;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return false;
}

/**
 * Recursively scan all string values in a params object for PII.
 * Returns the redacted params, total entities found, and the set of PII types.
 */
export async function scanParamsForPII(
  params: Record<string, unknown>,
): Promise<{
  redactedParams: Record<string, unknown>;
  totalEntities: number;
  typeSet: Set<string>;
}> {
  const typeSet = new Set<string>();
  let totalEntities = 0;

  async function redactValue(value: unknown): Promise<unknown> {
    if (typeof value === 'string') {
      const result = await defaultDetector.scan(value);
      if (result.entitiesFound > 0) {
        totalEntities += result.entitiesFound;
        for (const e of result.entities) {
          typeSet.add(e.type);
        }
        return result.redactedContent;
      }
      return value;
    }
    if (Array.isArray(value)) {
      return Promise.all(value.map(redactValue));
    }
    if (value !== null && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        out[k] = await redactValue(v);
      }
      return out;
    }
    return value;
  }

  const redactedParams = (await redactValue(params)) as Record<string, unknown>;
  return { redactedParams, totalEntities, typeSet };
}

// ── Kill switch pre-checks ──────────────────────────────────────────────────

export interface KillSwitchResult {
  blocked: boolean;
  response?: Record<string, unknown>;
}

/**
 * Check global and tenant-level kill switches.
 * Returns { blocked: true, response } if blocked, { blocked: false } otherwise.
 */
export async function checkKillSwitches(
  db: IDatabase,
  tenantId: string,
  tool: string,
  agentId: string | null,
  tenant: { kill_switch_active?: number } | undefined,
): Promise<KillSwitchResult> {
  const cached = await getGlobalKillSwitchCached();
  const ks = cached.cached ? { active: cached.active, at: null } : await getGlobalKillSwitch(db);

  if (ks.active) {
    await storeAuditEvent(db, tenantId, null, tool, 'block', 'KILL_SWITCH', 1000,
      'Global kill switch active', 0, NOOP_PREV_HASH, agentId);
    if (tenantId !== 'demo') {
      fireWebhooksAsync(db, tenantId, 'killswitch', {
        event_type: 'killswitch', tenant_id: tenantId, agent_id: agentId,
        data: { decision: 'block', rule: 'KILL_SWITCH', tool },
        timestamp: new Date().toISOString(),
      });
    }
    return {
      blocked: true,
      response: {
        result: 'block', matchedRuleId: 'KILL_SWITCH', riskScore: 1000,
        reason: 'Global kill switch is ACTIVE — all agent actions are blocked.',
        durationMs: 0, killSwitchActive: true,
      },
    };
  }

  const tenantKsCached = tenant ? await getTenantKillSwitchCached(tenantId) : null;
  const tenantKsActive = tenantKsCached?.cached
    ? tenantKsCached.active
    : (tenant?.kill_switch_active === 1);

  if (tenant && tenantKsActive) {
    await storeAuditEvent(db, tenantId, null, tool, 'block', 'TENANT_KILL_SWITCH', 1000,
      'Tenant kill switch active', 0, NOOP_PREV_HASH, agentId);
    fireWebhooksAsync(db, tenantId, 'killswitch', {
      event_type: 'killswitch', tenant_id: tenantId, agent_id: agentId,
      data: { decision: 'block', rule: 'TENANT_KILL_SWITCH', tool },
      timestamp: new Date().toISOString(),
    });
    return {
      blocked: true,
      response: {
        result: 'block', matchedRuleId: 'TENANT_KILL_SWITCH', riskScore: 1000,
        reason: 'Tenant kill switch is ACTIVE — all your agent actions are blocked.',
        durationMs: 0, killSwitchActive: true,
      },
    };
  }

  return { blocked: false };
}

// ── Child agent checks ──────────────────────────────────────────────────────

import { DEFAULT_POLICY } from '../../lib/policy-engine-setup.js';
import type { AgentPolicy } from '../../lib/policy-inheritance.js';

// ── Policy loading ────────────────────────────────────────────────────────

/**
 * Load the effective policy for a tenant (custom if set, else default).
 */
export async function loadEffectivePolicy(
  db: IDatabase,
  tenantId: string,
): Promise<typeof DEFAULT_POLICY> {
  if (tenantId === 'demo') return DEFAULT_POLICY;
  try {
    const customPolicyRaw = await db.getCustomPolicy(tenantId);
    if (customPolicyRaw) {
      const parsed = JSON.parse(customPolicyRaw) as unknown;
      if (Array.isArray(parsed)) {
        return { ...DEFAULT_POLICY, rules: parsed as typeof DEFAULT_POLICY['rules'] };
      } else if (parsed && typeof parsed === 'object') {
        return parsed as typeof DEFAULT_POLICY;
      }
    }
  } catch {
    // Fall back to default policy if custom policy is corrupt/unavailable
  }
  return DEFAULT_POLICY;
}

export interface ChildAgentResult {
  blocked: boolean;
  policy: AgentPolicy | null;
  response?: Record<string, unknown>;
}

/**
 * Check child agent TTL, budget, and return inherited policy.
 */
export async function checkChildAgent(
  db: IDatabase,
  tenantId: string,
  tool: string,
  agentId: string | null,
): Promise<ChildAgentResult> {
  if (!agentId) return { blocked: false, policy: null };

  try {
    const hierarchyRow = await db.getChildAgent(agentId);
    if (!hierarchyRow) return { blocked: false, policy: null };

    // TTL check
    if (hierarchyRow.ttl_expires_at && new Date(hierarchyRow.ttl_expires_at).getTime() < Date.now()) {
      await storeAuditEvent(db, tenantId, null, tool, 'block', 'AGENT_EXPIRED', 1000,
        'Child agent TTL has expired', 0, NOOP_PREV_HASH, agentId);
      return {
        blocked: true,
        policy: null,
        response: {
          result: 'block', matchedRuleId: 'AGENT_EXPIRED', riskScore: 1000,
          reason: 'Child agent has expired (TTL exceeded).', durationMs: 0, agentId,
        },
      };
    }

    // Budget check
    if (hierarchyRow.max_tool_calls !== null && hierarchyRow.tool_calls_used >= hierarchyRow.max_tool_calls) {
      await storeAuditEvent(db, tenantId, null, tool, 'block', 'BUDGET_EXCEEDED', 1000,
        `Child agent tool call budget exhausted (${hierarchyRow.tool_calls_used}/${hierarchyRow.max_tool_calls})`,
        0, NOOP_PREV_HASH, agentId);
      return {
        blocked: true,
        policy: null,
        response: {
          result: 'block', matchedRuleId: 'BUDGET_EXCEEDED', riskScore: 1000,
          reason: `Child agent has exhausted its tool call budget (${hierarchyRow.tool_calls_used}/${hierarchyRow.max_tool_calls}).`,
          durationMs: 0, agentId,
        },
      };
    }

    // Parse inherited policy
    let childAgentPolicy: AgentPolicy | null = null;
    try {
      childAgentPolicy = JSON.parse(hierarchyRow.policy_snapshot) as AgentPolicy;
    } catch {
      childAgentPolicy = null;
    }
    return { blocked: false, policy: childAgentPolicy };
  } catch {
    return { blocked: false, policy: null };
  }
}

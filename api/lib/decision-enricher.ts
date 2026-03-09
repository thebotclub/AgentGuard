/**
 * AgentGuard — Decision Enricher
 *
 * Generates human-readable, actionable fields for block/flag decisions.
 * Used by both /evaluate and /evaluate/batch endpoints.
 *
 * Feature 2: Actionable Error Responses (AGENT_DX_DESIGN.md §2)
 */

import type { PolicyDecision } from '../../packages/sdk/src/core/types.js';
import type { PolicyDocument } from '../../packages/sdk/src/core/types.js';

export interface EnrichedDecision {
  reason?: string;
  suggestion?: string;
  docs?: string;
  alternatives?: string[];
}

// ── Rule-to-docs mapping ───────────────────────────────────────────────────
// Maps rule IDs to relevant documentation anchors.
const RULE_DOCS: Record<string, string> = {
  'block-external-http': 'https://agentguard.tech/docs/rules#external-http',
  'rule-block-external-http': 'https://agentguard.tech/docs/rules#external-http',
  'block-pii-tables': 'https://agentguard.tech/docs/rules#pii-protection',
  'rule-block-pii': 'https://agentguard.tech/docs/rules#pii-protection',
  'block-privilege-escalation': 'https://agentguard.tech/docs/rules#privilege-escalation',
  'rule-block-priv-esc': 'https://agentguard.tech/docs/rules#privilege-escalation',
  'block-destructive-ops': 'https://agentguard.tech/docs/rules#destructive-operations',
  'rule-block-destructive': 'https://agentguard.tech/docs/rules#destructive-operations',
  'block-system-path-writes': 'https://agentguard.tech/docs/rules#system-paths',
  'require-approval-financial': 'https://agentguard.tech/docs/rules#financial-approvals',
  'rule-require-approval-financial': 'https://agentguard.tech/docs/rules#financial-approvals',
  'monitor-llm-calls': 'https://agentguard.tech/docs/rules#llm-monitoring',
  'rule-monitor-llm': 'https://agentguard.tech/docs/rules#llm-monitoring',
  'KILL_SWITCH': 'https://agentguard.tech/docs/kill-switch',
  'TENANT_KILL_SWITCH': 'https://agentguard.tech/docs/kill-switch',
  'INJECTION_DETECTED': 'https://agentguard.tech/docs/security#prompt-injection',
  'CHILD_POLICY_VIOLATION': 'https://agentguard.tech/docs/a2a-governance',
  'AGENT_EXPIRED': 'https://agentguard.tech/docs/a2a-governance#ttl',
  'BUDGET_EXCEEDED': 'https://agentguard.tech/docs/a2a-governance#budget',
};

// ── Rule-to-suggestion mapping ─────────────────────────────────────────────
// Actionable next steps per rule ID.
const RULE_SUGGESTIONS: Record<string, string> = {
  'block-external-http': 'Use an approved internal endpoint, or ask your administrator to add the destination to the allowlist.',
  'rule-block-external-http': 'Use an approved internal endpoint, or ask your administrator to add the destination to the allowlist.',
  'block-pii-tables': 'Use the public-facing read API instead of direct DB access, or request a scoped query through the data access service.',
  'rule-block-pii': 'Use the public-facing read API instead of direct DB access, or request a scoped query through the data access service.',
  'block-privilege-escalation': 'Use a dedicated service account with only the required permissions rather than elevated shell commands.',
  'rule-block-priv-esc': 'Use a dedicated service account with only the required permissions rather than elevated shell commands.',
  'block-destructive-ops': 'Use a soft-delete or archive operation instead. If deletion is required, request operator approval via HITL.',
  'rule-block-destructive': 'Use a soft-delete or archive operation instead. If deletion is required, request operator approval via HITL.',
  'block-system-path-writes': 'Write to an application-scoped path (e.g., /app/data) rather than system directories.',
  'require-approval-financial': 'Submit a human approval request via the approvalUrl. An approver will review and respond within the configured timeout.',
  'rule-require-approval-financial': 'Submit a human approval request via the approvalUrl. An approver will review and respond within the configured timeout.',
  'INJECTION_DETECTED': 'Ensure tool inputs do not include instructions or content that attempts to override the system prompt.',
  'CHILD_POLICY_VIOLATION': 'This tool is not in the allowed tool list for this agent. Request expanded permissions from the parent agent.',
  'AGENT_EXPIRED': 'The child agent TTL has expired. Spawn a new child agent from the parent to continue.',
  'BUDGET_EXCEEDED': 'The child agent has exhausted its tool call budget. Spawn a new child agent with a larger budget.',
  'KILL_SWITCH': 'All actions are blocked. Contact your system administrator.',
  'TENANT_KILL_SWITCH': 'Your account kill switch is active. Log into the dashboard to deactivate it.',
};

// ── Tool-to-alternatives mapping ───────────────────────────────────────────
// Suggests allowed tools with similar capability.
const TOOL_ALTERNATIVES: Record<string, string[]> = {
  'shell_exec': ['subprocess_safe', 'run_script'],
  'sudo': ['service_account_exec'],
  'http_request': ['internal_fetch', 'approved_api_call'],
  'http_post': ['internal_post', 'approved_api_call'],
  'fetch': ['internal_fetch'],
  'curl': ['internal_fetch', 'approved_api_call'],
  'wget': ['internal_fetch'],
  'file_delete': ['file_archive', 'file_move'],
  'rm': ['file_archive'],
  'rmdir': ['file_archive'],
  'unlink': ['file_archive'],
  'drop_table': ['truncate_table_safe', 'soft_delete'],
  'db_query': ['db_read_public', 'query_public_view'],
  'db_read': ['db_read_public'],
  'sql_execute': ['db_read_public'],
  'chmod': [],
  'chown': [],
  'system_command': [],
};

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Enriches a PolicyDecision with human-readable, actionable context.
 *
 * Only produces meaningful output for 'block' and 'require_approval' decisions.
 * For 'monitor' and 'allow', returns an empty object (no enrichment needed).
 *
 * The enricher never overwrites an existing non-null `reason` from the engine.
 */
export function enrichDecision(
  decision: PolicyDecision,
  toolName: string,
  _policy?: PolicyDocument,
): EnrichedDecision {
  // For allow/monitor, no enrichment
  if (decision.result === 'allow' || decision.result === 'monitor') {
    return {};
  }

  const ruleId = decision.matchedRuleId ?? '';

  // reason: prefer decision.reason if already set by the policy engine
  const reason = decision.reason ?? deriveReason(ruleId, toolName);

  // suggestion: look up by rule ID, fall back to generic
  const suggestion = RULE_SUGGESTIONS[ruleId] ?? deriveGenericSuggestion(decision.result);

  // docs: look up by rule ID, fall back to generic policy docs
  const docs = RULE_DOCS[ruleId] ?? 'https://agentguard.tech/docs/policy';

  // alternatives: for require_approval the action is to wait for approval — no tool alternatives
  if (decision.result === 'require_approval') {
    return { reason, suggestion, docs, alternatives: [] };
  }

  // For block: suggest safer tool alternatives
  const alternatives = TOOL_ALTERNATIVES[toolName] ?? [];

  return { reason, suggestion, docs, alternatives };
}

// ── Private helpers ────────────────────────────────────────────────────────

function deriveReason(ruleId: string, toolName: string): string {
  if (!ruleId) {
    return `Tool '${toolName}' was blocked by the active policy.`;
  }
  return `Tool '${toolName}' matched rule '${ruleId}' and was blocked.`;
}

function deriveGenericSuggestion(result: string): string {
  if (result === 'require_approval') {
    return 'Use the approvalUrl to request human approval before proceeding.';
  }
  return "Review your agent's policy configuration at https://app.agentguard.tech/policy.";
}

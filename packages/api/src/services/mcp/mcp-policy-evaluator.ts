/**
 * MCP Policy Evaluator
 *
 * Evaluates MCP tool call requests against MCP-specific policy rules.
 * Handles the mcp_tool_access check type and integrates with the
 * existing AgentGuard policy engine for standard rule evaluation.
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — micromatch lacks bundled types; @types/micromatch can be added as devDep
import micromatch from 'micromatch';
import type {
  McpToolCallRequest,
  McpAgentIdentity,
  McpInterceptionResult,
  McpPolicyDecision,
  McpToolAccessCheck,
  McpToolAccessRule,
  McpRuleAction,
} from './types.js';
import type { PolicyBundle } from '@agentguard/shared';

// ─── MCP Policy Evaluator ─────────────────────────────────────────────────────

/**
 * Evaluates an MCP tool call against the agent's policy bundle,
 * including both standard AgentGuard rules and MCP-specific checks.
 */
export class McpPolicyEvaluator {
  /**
   * Evaluate an MCP tool call request against a policy bundle.
   * Returns a decision with full context for the interceptor.
   */
  evaluate(
    request: McpToolCallRequest,
    identity: McpAgentIdentity,
    bundle: PolicyBundle,
  ): Omit<McpInterceptionResult, 'evaluationMs' | 'auditEventId'> {
    const toolName = request.params.name;
    const args = request.params.arguments ?? {};

    // ── Step 1: Check MCP-specific tool access rules ───────────────────────
    const mcpChecks = this.extractMcpChecks(bundle);
    if (mcpChecks.length > 0) {
      const mcpResult = this.evaluateMcpChecks(toolName, args, mcpChecks);
      if (mcpResult !== null) {
        return mcpResult;
      }
    }

    // ── Step 2: Map MCP tool call to AgentGuard action request format ──────
    // and evaluate against standard policy rules
    const standardResult = this.evaluateStandardRules(toolName, args, bundle);
    return standardResult;
  }

  /**
   * Extract mcp_tool_access checks from the policy bundle.
   */
  private extractMcpChecks(bundle: PolicyBundle): McpToolAccessCheck[] {
    // The bundle may have a checks array embedded in a top-level field
    // We look for mcp_tool_access checks in the bundle's promptInjectionConfig
    // (the bundle stores extra checks in a flexible way)
    const checks: McpToolAccessCheck[] = [];

    // Check if bundle has an mcpChecks field (set during compilation)
    const bundleAny = bundle as unknown as Record<string, unknown>;
    if (Array.isArray(bundleAny['mcpChecks'])) {
      for (const check of bundleAny['mcpChecks'] as unknown[]) {
        if (
          typeof check === 'object' &&
          check !== null &&
          (check as Record<string, unknown>)['type'] === 'mcp_tool_access'
        ) {
          checks.push(check as McpToolAccessCheck);
        }
      }
    }

    return checks;
  }

  /**
   * Evaluate MCP-specific tool access checks.
   * Returns null if no MCP check matched (fall through to standard rules).
   */
  private evaluateMcpChecks(
    toolName: string,
    args: Record<string, unknown>,
    checks: McpToolAccessCheck[],
  ): Omit<McpInterceptionResult, 'evaluationMs' | 'auditEventId'> | null {
    for (const check of checks) {
      for (const rule of check.rules) {
        if (this.toolMatchesRule(toolName, rule)) {
          const decision = this.applyMcpRule(toolName, args, rule);
          if (decision !== null) {
            return decision;
          }
        }
      }

      // MCP check default
      if (check.default) {
        return this.buildResult(check.default, null, `MCP check default action: ${check.default}`);
      }
    }

    return null; // No MCP check matched — fall through
  }

  /**
   * Check if a tool name matches a rule's tool pattern (glob or exact).
   */
  private toolMatchesRule(toolName: string, rule: McpToolAccessRule): boolean {
    if (rule.tool === '*') return true;
    if (rule.tool.includes('*') || rule.tool.includes('?')) {
      return micromatch.isMatch(toolName, rule.tool);
    }
    return toolName === rule.tool;
  }

  /**
   * Apply an MCP rule to a tool call, checking extra constraints.
   * Returns null if rule constraints are not met (continue checking).
   */
  private applyMcpRule(
    _toolName: string,
    args: Record<string, unknown>,
    rule: McpToolAccessRule,
  ): Omit<McpInterceptionResult, 'evaluationMs' | 'auditEventId'> | null {
    // Check path constraints for filesystem tools
    if (rule.paths && rule.paths.length > 0) {
      const pathArg = this.extractPathArg(args);
      if (pathArg) {
        const pathBlocked = rule.paths.some((pattern) =>
          micromatch.isMatch(pathArg, pattern),
        );

        if (pathBlocked && rule.action === 'block') {
          return this.buildResult(
            'block',
            rule,
            `Blocked: path "${pathArg}" matches restricted pattern in rule for tool "${_toolName}"`,
          );
        }

        if (!pathBlocked && rule.action === 'allow') {
          // Path doesn't match the allow-list → block
          return this.buildResult(
            'block',
            null,
            `Blocked: path "${pathArg}" not in allowed paths for tool "${_toolName}"`,
          );
        }
      }
    }

    // Check domain constraints for web/network tools
    if (rule.domains && rule.domains.length > 0) {
      const urlArg = this.extractUrlArg(args);
      if (urlArg) {
        const domain = extractDomain(urlArg);
        const domainAllowed = rule.domains.some((d) =>
          d === domain || (d.startsWith('*.') && domain.endsWith(d.slice(1))),
        );

        if (rule.action === 'allow' && !domainAllowed) {
          return this.buildResult(
            'block',
            null,
            `Blocked: domain "${domain}" not in allowed domains for tool "${_toolName}"`,
          );
        }

        if (rule.action === 'block' && domainAllowed) {
          return this.buildResult(
            'block',
            rule,
            `Blocked: domain "${domain}" is in blocked domains for tool "${_toolName}"`,
          );
        }
      }
    }

    // Check command constraints for shell tools
    if (rule.commands && rule.commands.length > 0) {
      const commandArg = this.extractCommandArg(args);
      if (commandArg) {
        const commandAllowed = rule.commands.some((cmd) =>
          commandArg.startsWith(cmd) || micromatch.isMatch(commandArg, cmd),
        );

        if (rule.action === 'allow' && !commandAllowed) {
          return this.buildResult(
            'block',
            null,
            `Blocked: command "${commandArg}" not in allowed commands for tool "${_toolName}"`,
          );
        }
      }
    }

    // No extra constraints — apply the rule action directly
    return this.buildResult(
      mapRuleAction(rule.action),
      rule,
      rule.reason ?? `MCP policy: ${rule.action} tool "${_toolName}"`,
    );
  }

  /**
   * Evaluate using the standard AgentGuard rule index (non-MCP-specific rules).
   * Maps MCP tool calls to the ActionRequest format for the policy engine.
   */
  private evaluateStandardRules(
    toolName: string,
    _args: Record<string, unknown>,
    bundle: PolicyBundle,
  ): Omit<McpInterceptionResult, 'evaluationMs' | 'auditEventId'> {
    // Look up the tool in the bundle's tool index
    const exactIndices = bundle.toolIndex[toolName] ?? [];
    const wildcardIndices = bundle.toolIndex['*'] ?? [];
    const candidateIndices = new Set([...exactIndices, ...wildcardIndices]);

    if (candidateIndices.size === 0) {
      // No matching rules — use bundle default
      const defaultDecision = mapBundleDefault(bundle.defaultAction);
      return this.buildResult(
        defaultDecision,
        null,
        `No matching rule for tool "${toolName}" — using default action: ${bundle.defaultAction}`,
      );
    }

    // Find most restrictive matching rule
    let mostRestrictive: McpPolicyDecision = 'allow';
    let matchedRuleId: string | null = null;
    let reason = '';

    for (const idx of candidateIndices) {
      const rule = bundle.rules[idx];
      if (!rule) continue;

      const decision = mapBundleDefault(rule.action);
      if (decisionRank(decision) > decisionRank(mostRestrictive)) {
        mostRestrictive = decision;
        matchedRuleId = rule.id;
        reason = buildReason(rule.action, rule.id);
      }
    }

    if (!reason) {
      reason = `Allowed by default — tool "${toolName}"`;
    }

    return {
      allowed: mostRestrictive === 'allow' || mostRestrictive === 'monitor',
      decision: mostRestrictive,
      gateId: mostRestrictive === 'hitl' ? crypto.randomUUID() : null,
      gateTimeoutSec: mostRestrictive === 'hitl' ? 300 : null,
      reason,
      riskScore: decisionRiskScore(mostRestrictive),
      matchedRuleId,
    };
  }

  /**
   * Build a standardized interception result.
   */
  private buildResult(
    decision: McpPolicyDecision,
    rule: McpToolAccessRule | null,
    reason: string,
  ): Omit<McpInterceptionResult, 'evaluationMs' | 'auditEventId'> {
    return {
      allowed: decision === 'allow' || decision === 'monitor',
      decision,
      gateId: decision === 'hitl' ? crypto.randomUUID() : null,
      gateTimeoutSec: decision === 'hitl' ? 300 : null,
      reason: rule?.reason ?? reason,
      riskScore: decisionRiskScore(decision),
      matchedRuleId: null,
    };
  }

  // ─── Arg extraction helpers ───────────────────────────────────────────────

  private extractPathArg(args: Record<string, unknown>): string | null {
    // Common path argument names across MCP filesystem tools
    const pathKeys = ['path', 'file_path', 'filepath', 'filename', 'directory', 'dir', 'dest', 'destination', 'src', 'source'];
    for (const key of pathKeys) {
      const val = args[key];
      if (typeof val === 'string') return val;
    }
    return null;
  }

  private extractUrlArg(args: Record<string, unknown>): string | null {
    const urlKeys = ['url', 'uri', 'endpoint', 'href', 'link', 'target'];
    for (const key of urlKeys) {
      const val = args[key];
      if (typeof val === 'string') return val;
    }
    return null;
  }

  private extractCommandArg(args: Record<string, unknown>): string | null {
    const cmdKeys = ['command', 'cmd', 'script', 'shell', 'exec', 'run'];
    for (const key of cmdKeys) {
      const val = args[key];
      if (typeof val === 'string') return val;
    }
    return null;
  }
}

// ─── Helper functions ─────────────────────────────────────────────────────────

function mapRuleAction(action: McpRuleAction): McpPolicyDecision {
  switch (action) {
    case 'hitl': return 'hitl';
    case 'block': return 'block';
    case 'monitor': return 'monitor';
    case 'allow': return 'allow';
  }
}

function mapBundleDefault(action: string): McpPolicyDecision {
  switch (action) {
    case 'block': return 'block';
    case 'require_approval': return 'hitl';
    case 'monitor': return 'monitor';
    case 'allow': return 'allow';
    default: return 'allow';
  }
}

function decisionRank(decision: McpPolicyDecision): number {
  switch (decision) {
    case 'block': return 3;
    case 'hitl': return 2;
    case 'monitor': return 1;
    case 'allow': return 0;
  }
}

function decisionRiskScore(decision: McpPolicyDecision): number {
  switch (decision) {
    case 'block': return 800;
    case 'hitl': return 500;
    case 'monitor': return 200;
    case 'allow': return 50;
  }
}

function buildReason(action: string, ruleId: string): string {
  switch (action) {
    case 'block': return `Blocked by rule "${ruleId}"`;
    case 'require_approval': return `Human approval required by rule "${ruleId}"`;
    case 'monitor': return `Monitored by rule "${ruleId}"`;
    case 'allow': return `Allowed by rule "${ruleId}"`;
    default: return `Rule "${ruleId}" matched`;
  }
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.toLowerCase();
  } catch {
    return url.toLowerCase().split('/')[0] ?? url.toLowerCase();
  }
}

/**
 * AgentGuard — CrewAI Integration
 *
 * A guard object that wraps CrewAI tool execution hooks. Intercept tool calls
 * in your CrewAI agent's beforeToolExecution lifecycle method.
 *
 * Usage:
 *   import { crewaiGuard } from '@the-bot-club/agentguard';
 *
 *   const guard = crewaiGuard({ apiKey: 'ag_...' });
 *
 *   // In your CrewAI agent tool execution hook:
 *   async beforeToolExecution(toolName, args) {
 *     await guard.beforeToolExecution(toolName, args);
 *     // Throws AgentGuardBlockError if blocked; otherwise safe to proceed
 *   }
 *
 * Works with any framework that exposes a pre-execution hook pattern —
 * not strictly limited to CrewAI.
 */
import { AgentGuard } from '../sdk/client.js';
import { AgentGuardBlockError } from './errors.js';

// ─── Options ──────────────────────────────────────────────────────────────────

export interface CrewAIGuardOptions {
  /** AgentGuard API key (ag_...) */
  apiKey: string;
  /** Override the AgentGuard API base URL */
  baseUrl?: string;
  /** Optional agent ID for scoped evaluations */
  agentId?: string;
}

// ─── Guard result (returned on allow/monitor decisions) ───────────────────────

export interface CrewAIGuardResult {
  /** Policy decision */
  decision: 'allow' | 'monitor' | 'require_approval';
  /** Risk score 0–1000 */
  riskScore: number;
  /** Human-readable reason */
  reason?: string;
  /** Matched rule ID */
  matchedRuleId?: string;
}

// ─── CrewAI Guard Object ──────────────────────────────────────────────────────

export interface CrewAIGuard {
  /**
   * Call this before every tool execution in your CrewAI agent.
   *
   * - On "allow" or "monitor": resolves with the decision result.
   * - On "block" or "require_approval": throws AgentGuardBlockError.
   *
   * @param toolName  Name of the tool about to be executed
   * @param args      Tool arguments as a plain object
   * @returns         The guard result (allow/monitor decisions only)
   * @throws          AgentGuardBlockError if the decision is block or require_approval
   */
  beforeToolExecution(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CrewAIGuardResult>;

  /**
   * Evaluate multiple tool calls at once (batch).
   * Returns decisions without throwing — caller decides how to handle blocks.
   *
   * @param calls  Array of {tool, args} pairs to evaluate
   * @returns      Array of per-call results
   */
  evaluateBatch(
    calls: Array<{ tool: string; args?: Record<string, unknown> }>,
  ): Promise<CrewAIGuardResult[]>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a CrewAI-compatible guard hook.
 *
 * One-liner:
 * ```typescript
 * import { crewaiGuard } from '@the-bot-club/agentguard';
 * const guard = crewaiGuard({ apiKey: 'ag_...' });
 *
 * // In your agent tool hook:
 * await guard.beforeToolExecution(toolName, args);
 * ```
 *
 * @param options  Guard configuration (apiKey, optional baseUrl and agentId)
 * @returns        A guard object with beforeToolExecution and evaluateBatch methods
 */
export function crewaiGuard(options: CrewAIGuardOptions): CrewAIGuard {
  const agentGuard = new AgentGuard({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
  });

  return {
    async beforeToolExecution(
      toolName: string,
      args: Record<string, unknown>,
    ): Promise<CrewAIGuardResult> {
      const result = await agentGuard.evaluate({
        tool: toolName,
        params: args,
      });

      // Normalise result shape
      const raw = result as unknown as Record<string, unknown>;
      const decision = (raw['result'] ?? raw['decision'] ?? 'allow') as string;

      if (decision === 'block' || decision === 'require_approval') {
        throw new AgentGuardBlockError({
          ...raw,
          tool: toolName,
          decision,
          agentId: options.agentId,
        });
      }

      return {
        decision: decision as 'allow' | 'monitor' | 'require_approval',
        riskScore: (raw['riskScore'] as number | undefined) ?? 0,
        reason: raw['reason'] as string | undefined,
        matchedRuleId: raw['matchedRuleId'] as string | undefined,
      };
    },

    async evaluateBatch(
      calls: Array<{ tool: string; args?: Record<string, unknown> }>,
    ): Promise<CrewAIGuardResult[]> {
      return Promise.all(
        calls.map(async ({ tool, args = {} }) => {
          const result = await agentGuard.evaluate({ tool, params: args });
          const raw = result as unknown as Record<string, unknown>;
          const decision = (raw['result'] ?? raw['decision'] ?? 'allow') as string;

          return {
            decision: decision as 'allow' | 'monitor' | 'require_approval' | 'block',
            riskScore: (raw['riskScore'] as number | undefined) ?? 0,
            reason: raw['reason'] as string | undefined,
            matchedRuleId: raw['matchedRuleId'] as string | undefined,
          } as CrewAIGuardResult;
        }),
      );
    },
  };
}

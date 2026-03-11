/**
 * AgentGuard — AutoGen Integration
 *
 * Provides guard wrappers for Microsoft's AutoGen framework that intercept
 * tool execution and evaluate each call through AgentGuard's policy engine.
 *
 * Two integration styles:
 *
 * 1. **Function wrapper** — wrap individual tool functions:
 *    ```typescript
 *    import { createAutoGenGuard } from '@the-bot-club/agentguard';
 *
 *    const guard = createAutoGenGuard({ apiKey: 'ag_...' });
 *    const guardedTool = guard.wrapTool('read_file', readFileFn);
 *    ```
 *
 * 2. **Class-based middleware** — intercept all tool calls on an agent:
 *    ```typescript
 *    import { AutoGenToolGuard } from '@the-bot-club/agentguard';
 *
 *    const guard = new AutoGenToolGuard({ apiKey: 'ag_...' });
 *    guard.patchAgent(conversableAgent);
 *    ```
 *
 * Both approaches use duck-typing — no hard dependency on `autogen` or
 * `@microsoft/autogen`. Works with any structurally compatible agent.
 */
import { AgentGuard } from '../sdk/client.js';
import { AgentGuardBlockError } from './errors.js';

// ─── Options ──────────────────────────────────────────────────────────────────

export interface AutoGenGuardOptions {
  /** AgentGuard API key (ag_...) */
  apiKey: string;
  /** Override the AgentGuard API base URL */
  baseUrl?: string;
  /** Optional agent ID for scoped evaluations */
  agentId?: string;
  /**
   * When true, throw AgentGuardBlockError if a tool call is blocked.
   * When false (default), call onBlock and return undefined (swallow the block).
   */
  throwOnBlock?: boolean;
  /** Callback invoked when a tool call is blocked. */
  onBlock?: (info: AutoGenBlockInfo) => void;
  /** Callback invoked when a tool call is allowed. */
  onAllow?: (info: AutoGenAllowInfo) => void;
}

// ─── Callback info types ──────────────────────────────────────────────────────

export interface AutoGenBlockInfo {
  tool: string;
  params: Record<string, unknown>;
  decision: string;
  riskScore: number;
  reason?: string;
  suggestion?: string;
  alternatives?: string[];
  matchedRuleId?: string;
}

export interface AutoGenAllowInfo {
  tool: string;
  params: Record<string, unknown>;
  decision: 'allow' | 'monitor';
  riskScore: number;
  matchedRuleId?: string;
}

// ─── Minimal AutoGen structural types (duck-typed, no hard dep) ───────────────

/** Any function that can serve as an AutoGen tool. */
type ToolFunction = (...args: unknown[]) => unknown;

/**
 * Structural interface for AutoGen's ConversableAgent (duck-typed).
 * AutoGen agents that register and execute tools expose these members.
 */
interface ConversableAgentLike {
  /** Registered tool functions keyed by name. */
  _tools?: Record<string, ToolFunction>;
  /** Alternative: tool map used in some AutoGen versions. */
  registered_tools?: Record<string, ToolFunction>;
  /** Tool execution method (AutoGen v0.2+). */
  execute_tool?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  /** Tool execution method (AutoGen v0.4+). */
  execute_function?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  [key: string]: unknown;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function normaliseDecision(raw: Record<string, unknown>): {
  decision: string;
  riskScore: number;
  reason?: string;
  suggestion?: string;
  alternatives?: string[];
  matchedRuleId?: string;
} {
  return {
    decision: (raw['result'] ?? raw['decision'] ?? 'allow') as string,
    riskScore: (raw['riskScore'] as number | undefined) ?? 0,
    reason: raw['reason'] as string | undefined,
    suggestion: raw['suggestion'] as string | undefined,
    alternatives: raw['alternatives'] as string[] | undefined,
    matchedRuleId: raw['matchedRuleId'] as string | undefined,
  };
}

// ─── AutoGenToolGuard class ───────────────────────────────────────────────────

/**
 * Class-based guard that can be used as middleware with AutoGen's
 * ConversableAgent. Patches an agent's tool execution to evaluate
 * every call through AgentGuard before allowing it to proceed.
 *
 * @example
 * ```typescript
 * import { AutoGenToolGuard } from '@the-bot-club/agentguard';
 *
 * const guard = new AutoGenToolGuard({ apiKey: 'ag_...' });
 *
 * // Patch an existing agent
 * guard.patchAgent(myAgent);
 *
 * // Or evaluate manually before execution
 * const result = await guard.evaluate('send_email', { to: 'user@example.com' });
 * if (result.blocked) {
 *   console.log('Blocked:', result.reason);
 * }
 * ```
 */
export class AutoGenToolGuard {
  private readonly guard: AgentGuard;
  private readonly options: AutoGenGuardOptions;
  private readonly throwOnBlock: boolean;

  constructor(options: AutoGenGuardOptions) {
    this.options = options;
    this.throwOnBlock = options.throwOnBlock ?? false;
    this.guard = new AgentGuard({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
    });
  }

  /**
   * Evaluate a tool call against the policy engine.
   *
   * @param toolName  Name of the tool
   * @param params    Tool arguments
   * @returns         Evaluation result with blocked flag
   */
  async evaluate(
    toolName: string,
    params: Record<string, unknown> = {},
  ): Promise<{
    blocked: boolean;
    decision: string;
    riskScore: number;
    reason?: string;
    suggestion?: string;
    alternatives?: string[];
    matchedRuleId?: string;
  }> {
    const result = await this.guard.evaluate({ tool: toolName, params });
    const normalised = normaliseDecision(result as unknown as Record<string, unknown>);
    const blocked = normalised.decision === 'block' || normalised.decision === 'require_approval';

    if (blocked) {
      this.options.onBlock?.({
        tool: toolName,
        params,
        ...normalised,
      });

      if (this.throwOnBlock) {
        throw new AgentGuardBlockError({
          ...normalised,
          tool: toolName,
          agentId: this.options.agentId,
        });
      }
    } else {
      this.options.onAllow?.({
        tool: toolName,
        params,
        decision: normalised.decision as 'allow' | 'monitor',
        riskScore: normalised.riskScore,
        matchedRuleId: normalised.matchedRuleId,
      });
    }

    return { blocked, ...normalised };
  }

  /**
   * Wrap a single tool function with AgentGuard policy checks.
   *
   * @param toolName  Name of the tool (for policy evaluation)
   * @param fn        The original tool function
   * @returns         A wrapped function that evaluates policy before executing
   */
  wrapTool<T extends ToolFunction>(toolName: string, fn: T): T {
    const self = this;
    const wrapped = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
      // Extract params: first arg if it's an object, otherwise wrap all args
      const params: Record<string, unknown> =
        args.length === 1 && typeof args[0] === 'object' && args[0] !== null
          ? (args[0] as Record<string, unknown>)
          : { args };

      const result = await self.evaluate(toolName, params);
      if (result.blocked) {
        return undefined;
      }

      return fn.apply(this, args);
    };

    // Preserve function name and properties
    Object.defineProperty(wrapped, 'name', { value: fn.name || toolName });
    return wrapped as unknown as T;
  }

  /**
   * Patch an AutoGen ConversableAgent to route all tool executions
   * through AgentGuard.
   *
   * Supports multiple AutoGen versions by detecting available tool
   * registration patterns (duck-typed).
   *
   * @param agent  An AutoGen ConversableAgent (or structurally compatible object)
   */
  patchAgent(agent: ConversableAgentLike): void {
    // Strategy 1: Patch the tool execution method (v0.4+)
    if (typeof agent.execute_function === 'function') {
      const originalExecute = agent.execute_function.bind(agent);
      agent.execute_function = async (
        toolName: string,
        args: Record<string, unknown>,
      ): Promise<unknown> => {
        const result = await this.evaluate(toolName, args);
        if (result.blocked) {
          return { error: `AgentGuard blocked tool "${toolName}": ${result.reason ?? 'policy violation'}` };
        }
        return originalExecute(toolName, args);
      };
      return;
    }

    // Strategy 2: Patch execute_tool (v0.2+)
    if (typeof agent.execute_tool === 'function') {
      const originalExecute = agent.execute_tool.bind(agent);
      agent.execute_tool = async (
        toolName: string,
        args: Record<string, unknown>,
      ): Promise<unknown> => {
        const result = await this.evaluate(toolName, args);
        if (result.blocked) {
          return { error: `AgentGuard blocked tool "${toolName}": ${result.reason ?? 'policy violation'}` };
        }
        return originalExecute(toolName, args);
      };
      return;
    }

    // Strategy 3: Wrap individual tool functions in _tools or registered_tools
    const toolMap = agent._tools ?? agent.registered_tools;
    if (toolMap && typeof toolMap === 'object') {
      for (const [name, fn] of Object.entries(toolMap)) {
        if (typeof fn === 'function') {
          toolMap[name] = this.wrapTool(name, fn);
        }
      }
      return;
    }

    throw new Error(
      'AutoGenToolGuard: Could not detect tool registration on this agent. ' +
      'Expected execute_function, execute_tool, _tools, or registered_tools.',
    );
  }
}

// ─── Factory function ─────────────────────────────────────────────────────────

/**
 * Convenience guard object for wrapping AutoGen tool functions.
 *
 * Returns an object with `wrapTool` and `evaluate` methods that can be
 * used without instantiating the full class.
 *
 * @example
 * ```typescript
 * import { createAutoGenGuard } from '@the-bot-club/agentguard';
 *
 * const guard = createAutoGenGuard({ apiKey: 'ag_...' });
 *
 * // Wrap individual tools
 * const guardedReadFile = guard.wrapTool('read_file', readFile);
 * const guardedSendEmail = guard.wrapTool('send_email', sendEmail);
 *
 * // Or evaluate manually
 * const result = await guard.evaluate('exec', { command: 'ls' });
 * if (!result.blocked) {
 *   await exec({ command: 'ls' });
 * }
 *
 * // Or patch an entire agent
 * guard.patchAgent(myConversableAgent);
 * ```
 *
 * @param options  Guard configuration
 * @returns        Guard object with wrapTool, evaluate, and patchAgent methods
 */
export function createAutoGenGuard(options: AutoGenGuardOptions): AutoGenToolGuard {
  return new AutoGenToolGuard(options);
}

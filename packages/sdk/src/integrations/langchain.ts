/**
 * AgentGuard — LangChain Integration
 *
 * Drop-in callback handler that wraps every LangChain tool call through
 * AgentGuard's policy engine. Works with LangChain's BaseCallbackHandler
 * interface (structurally compatible — no hard dep on @langchain/core).
 *
 * Usage:
 *   import { langchainGuard } from '@the-bot-club/agentguard';
 *
 *   const guard = langchainGuard({ apiKey: 'ag_...' });
 *
 *   // With LangChain agent executor:
 *   const executor = AgentExecutor.fromAgentAndTools({
 *     agent,
 *     tools,
 *     callbacks: [guard],
 *   });
 *
 * On a block decision, AgentGuardBlockError is thrown — LangChain will catch
 * it and surface it to the caller as a tool execution error.
 */
import { AgentGuard } from '../sdk/client.js';
import { AgentGuardBlockError } from './errors.js';

// ─── Options ──────────────────────────────────────────────────────────────────

export interface LangChainGuardOptions {
  /** AgentGuard API key (ag_...) */
  apiKey: string;
  /** Override the AgentGuard API base URL (default: https://api.agentguard.tech) */
  baseUrl?: string;
  /** Optional agent ID to scope evaluations */
  agentId?: string;
}

// ─── LangChain-compatible tool descriptor (structural, no hard dep) ───────────

interface LangChainToolDescriptor {
  name: string;
  [key: string]: unknown;
}

// ─── AgentGuardCallbackHandler ────────────────────────────────────────────────

/**
 * LangChain callback handler that intercepts every tool call and evaluates
 * it through AgentGuard before allowing execution to proceed.
 *
 * Implements the subset of LangChain's BaseCallbackHandler that is needed
 * for tool interception. Compatible with LangChain.js 0.1.x and 0.2.x.
 *
 * Structurally compatible — does NOT require @langchain/core as a hard dep.
 * Pass an instance directly as a callback handler.
 */
export class AgentGuardCallbackHandler {
  /** Required by LangChain's callback handler interface */
  readonly name = 'AgentGuardCallbackHandler';

  private readonly guard: AgentGuard;
  private readonly options: LangChainGuardOptions;

  constructor(options: LangChainGuardOptions) {
    this.options = options;
    this.guard = new AgentGuard({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
    });
  }

  /**
   * Called by LangChain's callback system before every tool invocation.
   *
   * Evaluates the tool call against the AgentGuard policy engine.
   * Throws AgentGuardBlockError if the decision is "block" or "require_approval".
   *
   * @param tool   The LangChain tool descriptor (must have a `name` property)
   * @param input  The serialized tool input (string or object)
   */
  async handleToolStart(
    tool: LangChainToolDescriptor,
    input: string | Record<string, unknown>,
  ): Promise<void> {
    // Normalise input — LangChain sometimes passes a JSON string
    let params: Record<string, unknown>;
    if (typeof input === 'string') {
      try {
        const parsed = JSON.parse(input) as unknown;
        params = typeof parsed === 'object' && parsed !== null
          ? (parsed as Record<string, unknown>)
          : { input };
      } catch {
        params = { input };
      }
    } else {
      params = input;
    }

    const result = await this.guard.evaluate({
      tool: tool.name,
      params,
    });

    // Map API response field names (result vs decision)
    const decision = (result as unknown as { result?: string; decision?: string }).result
      ?? (result as unknown as { decision?: string }).decision;

    if (decision === 'block' || decision === 'require_approval') {
      throw new AgentGuardBlockError({
        ...(result as unknown as Record<string, unknown>),
        tool: tool.name,
        decision,
        agentId: this.options.agentId,
      });
    }
  }

  /**
   * Called by LangChain after tool execution completes successfully.
   * No-op here — AgentGuard only intercepts before execution.
   */
   
  async handleToolEnd(_output: string): Promise<void> {
    // No-op — post-execution hook, no AgentGuard action needed
  }

  /**
   * Called by LangChain if tool execution throws an error.
   * No-op here — errors are already handled by the caller.
   */
   
  async handleToolError(_err: unknown): Promise<void> {
    // No-op
  }
}

// ─── Factory Function ─────────────────────────────────────────────────────────

/**
 * Create an AgentGuard LangChain callback handler.
 *
 * One-liner integration:
 *
 * ```typescript
 * import { langchainGuard } from '@the-bot-club/agentguard';
 *
 * const executor = AgentExecutor.fromAgentAndTools({
 *   agent,
 *   tools,
 *   callbacks: [langchainGuard({ apiKey: 'ag_...' })],
 * });
 * ```
 *
 * @param options  Guard configuration (apiKey, optional baseUrl and agentId)
 * @returns        An AgentGuardCallbackHandler instance ready to pass as a callback
 */
export function langchainGuard(options: LangChainGuardOptions): AgentGuardCallbackHandler {
  return new AgentGuardCallbackHandler(options);
}

/**
 * AgentGuard — LangGraph Integration (TypeScript)
 *
 * Provides mid-stream policy enforcement for LangGraph.js graphs.
 * Duck-typed: no hard dependency on @langchain/langgraph.
 *
 * Three integration patterns:
 *
 * 1. **langGraphGuard()** — wrap graph.stream() with policy checks
 * 2. **LangGraphGuardNode** — insertable graph node with routing
 * 3. **wrapToolNode()** — wrap a ToolNode with pre-execution checks
 *
 * @example
 * ```ts
 * import { langGraphGuard } from '@the-bot-club/agentguard';
 *
 * // Option 1: Streaming wrapper
 * for await (const chunk of langGraphGuard(graph, inputs, { apiKey: 'ag_...' })) {
 *   process(chunk);
 * }
 *
 * // Option 2: Guard node
 * const guard = new LangGraphGuardNode({ apiKey: 'ag_...' });
 * builder.addNode('guard', (s) => guard.invoke(s));
 * builder.addConditionalEdges('guard', (s) => guard.route(s), {
 *   tools: 'tools',
 *   blocked: END,
 * });
 *
 * // Option 3: Wrapped ToolNode
 * const safeTools = wrapToolNode(toolNode, { apiKey: 'ag_...' });
 * builder.addNode('tools', safeTools);
 * ```
 */
import { AgentGuard } from '../sdk/client.js';
import { AgentGuardBlockError } from './errors.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LangGraphGuardOptions {
  /** AgentGuard API key (ag_...) */
  apiKey: string;
  /** Override the AgentGuard API base URL */
  baseUrl?: string;
  /** Optional agent ID for scoped evaluations */
  agentId?: string;
  /** Callback invoked when a tool call is blocked */
  onBlock?: (error: AgentGuardBlockError) => void;
  /** Callback invoked when a tool call is allowed */
  onAllow?: (result: EvalResult) => void;
}

export interface EvalResult {
  result: 'allow' | 'block' | 'monitor' | 'require_approval';
  matchedRuleId?: string;
  riskScore: number;
  reason: string;
  tool: string;
}

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

// ─── Tool call extraction (duck-typed) ────────────────────────────────────────

function stateToDict(state: unknown): Record<string, unknown> {
  if (state && typeof state === 'object' && !Array.isArray(state)) {
    return state as Record<string, unknown>;
  }
  return {};
}

function extractToolCalls(state: unknown): ToolCall[] {
  const dict = stateToDict(state);

  // Explicit tool_calls in state
  const explicit = dict['tool_calls'];
  if (Array.isArray(explicit)) {
    return explicit.map(normalizeToolCall);
  }

  // Messages-style state — inspect last message
  const messages = dict['messages'];
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const last = messages[messages.length - 1] as Record<string, unknown>;
  if (!last || typeof last !== 'object') return [];

  // tool_calls on last message (OpenAI-style AIMessage)
  const tcList = (last as Record<string, unknown>)['tool_calls'];
  if (Array.isArray(tcList) && tcList.length > 0) {
    return tcList.map(normalizeToolCall);
  }

  // OpenAI additional_kwargs fallback
  const akw = (last as Record<string, unknown>)['additional_kwargs'] as
    | Record<string, unknown>
    | undefined;
  if (akw && Array.isArray(akw['tool_calls'])) {
    return (akw['tool_calls'] as Record<string, unknown>[]).map((tc) => {
      const fn = (tc['function'] ?? {}) as Record<string, unknown>;
      let args: Record<string, unknown> = {};
      if (typeof fn['arguments'] === 'string') {
        try {
          args = JSON.parse(fn['arguments'] as string) as Record<string, unknown>;
        } catch {
          args = { input: fn['arguments'] };
        }
      }
      return {
        name: (fn['name'] as string) ?? 'unknown',
        args,
        id: tc['id'] as string | undefined,
      };
    });
  }

  return [];
}

function normalizeToolCall(tc: unknown): ToolCall {
  if (!tc || typeof tc !== 'object') return { name: 'unknown', args: {} };
  const obj = tc as Record<string, unknown>;
  let args = (obj['args'] ?? obj['arguments'] ?? obj['input'] ?? {}) as
    | Record<string, unknown>
    | string;
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args) as Record<string, unknown>;
    } catch {
      args = { input: args };
    }
  }
  return {
    name: (obj['name'] ?? obj['tool'] ?? 'unknown') as string,
    args: args as Record<string, unknown>,
    id: obj['id'] as string | undefined,
  };
}

// ─── Evaluate tool calls in a chunk ───────────────────────────────────────────

function evaluateChunk(
  guard: AgentGuard,
  chunk: unknown,
): Promise<AgentGuardBlockError | null> {
  const toolCalls = extractToolCalls(chunk);
  return evaluateToolCalls(guard, toolCalls);
}

async function evaluateToolCalls(
  guard: AgentGuard,
  toolCalls: ToolCall[],
): Promise<AgentGuardBlockError | null> {
  for (const tc of toolCalls) {
    const result = await guard.evaluate({ tool: tc.name, params: tc.args });
    if (result.result === 'block' || result.result === 'require_approval') {
      return new AgentGuardBlockError({
        ...result,
        tool: tc.name,
        decision: result.result,
      });
    }
  }
  return null;
}

// ─── Pattern 1: langGraphGuard() streaming wrapper ────────────────────────────

/**
 * Wraps a LangGraph graph's `.stream()` with AgentGuard policy enforcement.
 *
 * Intercepts streaming chunks containing tool calls and evaluates each one
 * before yielding. Blocked tool calls throw `AgentGuardBlockError` or invoke
 * `onBlock` and stop the stream.
 */
export async function* langGraphGuard(
  graph: { stream(inputs: unknown, config?: unknown): AsyncIterable<unknown> },
  inputs: unknown,
  options: LangGraphGuardOptions & {
    config?: Record<string, unknown>;
    streamMode?: string;
  },
): AsyncGenerator<unknown> {
  const guard = new AgentGuard({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
  });

  const streamOpts: Record<string, unknown> = {};
  if (options.streamMode) streamOpts['streamMode'] = options.streamMode;
  if (options.config) streamOpts['config'] = options.config;

  for await (const chunk of graph.stream(inputs, streamOpts)) {
    const blocked = await evaluateChunk(guard, chunk);
    if (blocked) {
      if (options.onBlock) {
        options.onBlock(blocked);
        return;
      }
      throw blocked;
    }
    yield chunk;
  }
}

// ─── Pattern 2: LangGraphGuardNode ───────────────────────────────────────────

const BLOCKED_DEST = 'blocked';
const ALLOWED_DEST = 'tools';

/**
 * A LangGraph node that evaluates tool calls against AgentGuard policies.
 *
 * Insert this node into a LangGraph graph *before* the ToolNode.
 * Use `guard.route(state)` as the conditional edge routing function.
 */
export class LangGraphGuardNode {
  private readonly guard: AgentGuard;
  private readonly options: LangGraphGuardOptions;
  private readonly blockedNode: string;
  private readonly allowedNode: string;

  constructor(
    options: LangGraphGuardOptions & {
      blockedNode?: string;
      allowedNode?: string;
    },
  ) {
    this.options = options;
    this.blockedNode = options.blockedNode ?? BLOCKED_DEST;
    this.allowedNode = options.allowedNode ?? ALLOWED_DEST;
    this.guard = new AgentGuard({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
    });
  }

  /**
   * Evaluate pending tool calls in the current graph state.
   * Returns the state (pass-through), adding `__agentguard_blocked__` on block.
   */
  async invoke(state: unknown): Promise<Record<string, unknown>> {
    const dict = stateToDict(state);
    const toolCalls = extractToolCalls(state);

    for (const tc of toolCalls) {
      const result = await this.guard.evaluate({ tool: tc.name, params: tc.args });

      if (result.result === 'block' || result.result === 'require_approval') {
        const err = new AgentGuardBlockError({
          ...result,
          tool: tc.name,
          decision: result.result,
          agent_id: this.options.agentId,
        });
        this.options.onBlock?.(err);

        return {
          ...dict,
          __agentguard_blocked__: {
            tool: tc.name,
            decision: result.result,
            reason: result.reason,
            riskScore: result.riskScore,
            matchedRuleId: result.matchedRuleId,
          },
        };
      }

      if (this.options.onAllow) {
        this.options.onAllow({
          ...result,
          tool: tc.name,
        });
      }
    }

    // Clear any previous block marker
    const { __agentguard_blocked__: _, ...clean } = dict;
    return clean;
  }

  /**
   * Conditional edge routing function.
   * Returns the destination node name based on the evaluation result.
   */
  route(state: unknown): string {
    const dict = stateToDict(state);
    if (dict['__agentguard_blocked__']) return this.blockedNode;
    return this.allowedNode;
  }
}

// ─── Pattern 3: wrapToolNode() ───────────────────────────────────────────────

/**
 * Wrap a LangGraph ToolNode with AgentGuard policy enforcement.
 * Returns a drop-in replacement that evaluates every tool call before
 * letting the original node execute.
 */
export function wrapToolNode(
  toolNode: (state: unknown) => unknown | Promise<unknown>,
  options: LangGraphGuardOptions,
): (state: unknown) => Promise<unknown> {
  const guard = new AgentGuard({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
  });

  return async (state: unknown): Promise<unknown> => {
    const toolCalls = extractToolCalls(state);

    for (const tc of toolCalls) {
      const result = await guard.evaluate({ tool: tc.name, params: tc.args });
      if (result.result === 'block' || result.result === 'require_approval') {
        const err = new AgentGuardBlockError({
          ...result,
          tool: tc.name,
          decision: result.result,
        });
        if (options.onBlock) {
          options.onBlock(err);
          return state; // Skip execution, return state unchanged
        }
        throw err;
      }
    }

    return toolNode(state);
  };
}

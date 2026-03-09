/**
 * AgentGuard — OpenAI Integration
 *
 * Wraps an OpenAI client instance to intercept function/tool calls returned
 * in chat completion responses, evaluating each through AgentGuard before
 * the caller can execute them.
 *
 * Usage:
 *   import { openaiGuard } from '@the-bot-club/agentguard';
 *   import OpenAI from 'openai';
 *
 *   const client = new OpenAI({ apiKey: '...' });
 *   const guarded = openaiGuard(client, { apiKey: 'ag_...' });
 *
 *   // Use `guarded` exactly like the OpenAI client:
 *   const response = await guarded.chat.completions.create({ ... });
 *
 *   // response._agentguard contains per-call decisions:
 *   if (response._agentguard?.hasBlocks) {
 *     // One or more tool calls were blocked — do not execute them
 *   }
 *
 * The guard attaches a `_agentguard` field to each response that contains
 * tool calls. Check this field before executing tool calls.
 */
import { AgentGuard } from '../sdk/client.js';
import { AgentGuardBlockError } from './errors.js';

// ─── Options ──────────────────────────────────────────────────────────────────

export interface OpenAIGuardOptions {
  /** AgentGuard API key (ag_...) */
  apiKey: string;
  /** Override the AgentGuard API base URL */
  baseUrl?: string;
  /** Optional agent ID for scoped evaluations */
  agentId?: string;
  /**
   * When true, throw AgentGuardBlockError immediately if any tool call is blocked.
   * When false (default), attach results to response._agentguard and let caller handle.
   */
  throwOnBlock?: boolean;
}

// ─── Minimal OpenAI type stubs (structural, no hard dep on openai package) ────

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ChatCompletionMessage {
  role: string;
  content: string | null;
  tool_calls?: ToolCall[];
}

interface ChatCompletionChoice {
  index: number;
  message: ChatCompletionMessage;
  finish_reason: string;
}

interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  /** Attached by AgentGuard — not part of the OpenAI spec */
  _agentguard?: AgentGuardBatchResult;
}

// ─── AgentGuard batch result shape ────────────────────────────────────────────

export interface AgentGuardToolDecision {
  /** 0-based index matching the tool_calls array */
  index: number;
  /** Tool name */
  tool: string;
  /** Policy decision */
  decision: 'allow' | 'block' | 'monitor' | 'require_approval';
  /** Risk score 0–1000 */
  riskScore: number;
  /** Human-readable block reason (present on block/require_approval) */
  reason?: string;
  /** What to do instead (present on block/require_approval) */
  suggestion?: string;
  /** Docs link (present on block/require_approval) */
  docs?: string;
  /** Alternative tools (present on block) */
  alternatives?: string[];
  /** Matched policy rule ID */
  matchedRuleId?: string;
  /** Approval URL (present when decision is require_approval) */
  approvalUrl?: string;
}

export interface AgentGuardBatchResult {
  /** Individual decisions, parallel to tool_calls array */
  decisions: AgentGuardToolDecision[];
  /** True if any decision is "block" */
  hasBlocks: boolean;
  /** True if any decision is "require_approval" */
  hasApprovals: boolean;
  /** Blocked tool call indices */
  blockedIndices: number[];
  /** Summary counts */
  summary: {
    total: number;
    allowed: number;
    blocked: number;
    monitored: number;
    requireApproval: number;
  };
}

// ─── Minimal OpenAI client structural interface ────────────────────────────────

interface OpenAIClientLike {
  chat: {
    completions: {
      create(params: unknown): Promise<ChatCompletionResponse>;
    };
  };
  [key: string]: unknown;
}

// ─── openaiGuard ──────────────────────────────────────────────────────────────

/**
 * Wrap an OpenAI client with AgentGuard policy enforcement.
 *
 * Intercepts `chat.completions.create` responses that contain tool_calls,
 * evaluating each tool call through AgentGuard before returning the response.
 *
 * One-liner:
 * ```typescript
 * import { openaiGuard } from '@the-bot-club/agentguard';
 * const guarded = openaiGuard(new OpenAI({ apiKey: '...' }), { apiKey: 'ag_...' });
 * ```
 *
 * @param client   An OpenAI client instance (or any structurally compatible object)
 * @param options  AgentGuard configuration
 * @returns        A wrapped client with the same interface
 */
export function openaiGuard<T extends OpenAIClientLike>(
  client: T,
  options: OpenAIGuardOptions,
): T & { chat: { completions: { create(params: unknown): Promise<ChatCompletionResponse> } } } {
  const guard = new AgentGuard({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
  });

  const throwOnBlock = options.throwOnBlock ?? false;

  // Build the intercepted create function
  const guardedCreate = async (params: unknown): Promise<ChatCompletionResponse> => {
    // Call the real OpenAI API
    const response = await client.chat.completions.create(params);

    // Only intercept if the response contains tool_calls
    const toolCalls = response.choices?.[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      return response;
    }

    // Evaluate each tool call through AgentGuard
    const decisions: AgentGuardToolDecision[] = await Promise.all(
      toolCalls.map(async (tc, idx) => {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
        } catch {
          parsedArgs = { _raw: tc.function.arguments };
        }

        const result = await guard.evaluate({
          tool: tc.function.name,
          params: parsedArgs,
        });

        // Normalise result shape (API returns `result` field, not `decision`)
        const raw = result as unknown as Record<string, unknown>;
        const decision = (raw['result'] ?? raw['decision'] ?? 'allow') as AgentGuardToolDecision['decision'];

        return {
          index: idx,
          tool: tc.function.name,
          decision,
          riskScore: (raw['riskScore'] as number | undefined) ?? 0,
          reason: raw['reason'] as string | undefined,
          suggestion: raw['suggestion'] as string | undefined,
          docs: raw['docs'] as string | undefined,
          alternatives: raw['alternatives'] as string[] | undefined,
          matchedRuleId: raw['matchedRuleId'] as string | undefined,
          approvalUrl: raw['approvalUrl'] as string | undefined,
        };
      }),
    );

    // Build summary
    const blocked = decisions.filter((d) => d.decision === 'block');
    const summary: AgentGuardBatchResult['summary'] = {
      total: decisions.length,
      allowed: decisions.filter((d) => d.decision === 'allow').length,
      blocked: blocked.length,
      monitored: decisions.filter((d) => d.decision === 'monitor').length,
      requireApproval: decisions.filter((d) => d.decision === 'require_approval').length,
    };

    const batchResult: AgentGuardBatchResult = {
      decisions,
      hasBlocks: blocked.length > 0,
      hasApprovals: summary.requireApproval > 0,
      blockedIndices: decisions.filter((d) => d.decision === 'block').map((d) => d.index),
      summary,
    };

    // Attach guard results to the response
    response._agentguard = batchResult;

    // Throw on first block if requested
    if (throwOnBlock && blocked.length > 0) {
      const firstBlock = blocked[0]!;
      throw new AgentGuardBlockError({
        ...firstBlock,
        agentId: options.agentId,
      });
    }

    return response;
  };

  // Return a proxy that preserves all original client properties
  return {
    ...client,
    chat: {
      ...((client.chat as Record<string, unknown>) ?? {}),
      completions: {
        ...((client.chat?.completions as Record<string, unknown>) ?? {}),
        create: guardedCreate,
      },
    },
  } as T & { chat: { completions: { create(params: unknown): Promise<ChatCompletionResponse> } } };
}

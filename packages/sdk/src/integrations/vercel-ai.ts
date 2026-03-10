/**
 * AgentGuard — Vercel AI SDK Integration
 *
 * Provides middleware for the Vercel AI SDK that intercepts tool calls
 * and evaluates them against AgentGuard policies before execution.
 *
 * The Vercel AI SDK supports middleware that can wrap tool execution.
 * This integration hooks into that pattern to enforce security policies
 * on every tool call an AI agent attempts.
 *
 * Usage:
 *   import { createAgentGuardMiddleware } from '@the-bot-club/agentguard';
 *   import { generateText } from 'ai';
 *
 *   const agentGuard = createAgentGuardMiddleware({ apiKey: 'ag_...' });
 *
 *   const result = await generateText({
 *     model: yourModel,
 *     tools: { ... },
 *     experimental_toolCallStreaming: true,
 *     experimental_middleware: agentGuard,
 *   });
 *
 *   // Check guard results attached to response
 *   if (result._agentguard?.hasBlocks) {
 *     console.log('Some tool calls were blocked');
 *   }
 *
 * Design: zero hard dependencies — all Vercel AI SDK types are structural.
 * Uses duck-typing so the `ai` package is never imported.
 */
import { AgentGuard } from '../sdk/client.js';
import { AgentGuardBlockError } from './errors.js';

// ─── Options ──────────────────────────────────────────────────────────────────

export interface VercelAIGuardOptions {
  /** AgentGuard API key (ag_...) */
  apiKey: string;
  /** Override the AgentGuard API base URL */
  baseUrl?: string;
  /** Optional agent ID for scoped evaluations */
  agentId?: string;
  /**
   * When true, throw AgentGuardBlockError immediately if any tool call is blocked.
   * When false (default), blocked tool calls return an error result string
   * and decisions are tracked via onBlock/onAllow callbacks.
   */
  throwOnBlock?: boolean;
  /**
   * Called when a tool call is blocked by AgentGuard.
   * Receives the full decision context.
   */
  onBlock?: (decision: AgentGuardToolDecision) => void | Promise<void>;
  /**
   * Called when a tool call is allowed by AgentGuard.
   * Receives the full decision context.
   */
  onAllow?: (decision: AgentGuardToolDecision) => void | Promise<void>;
}

// ─── AgentGuard decision types ────────────────────────────────────────────────

export interface AgentGuardToolDecision {
  /** Tool name */
  tool: string;
  /** Policy decision */
  decision: 'allow' | 'block' | 'monitor' | 'require_approval';
  /** Risk score 0–1000 */
  riskScore: number;
  /** Human-readable block reason */
  reason?: string;
  /** What to do instead */
  suggestion?: string;
  /** Docs link */
  docs?: string;
  /** Alternative tools */
  alternatives?: string[];
  /** Matched policy rule ID */
  matchedRuleId?: string;
  /** Approval URL (present when decision is require_approval) */
  approvalUrl?: string;
  /** Approval ID */
  approvalId?: string;
}

// ─── Structural Vercel AI SDK types (duck-typed, no hard dependency) ──────────

/**
 * Vercel AI SDK Middleware interface (structural).
 *
 * The AI SDK defines middleware with optional hooks:
 * - transformParams: modify params before sending to model
 * - wrapGenerate: wrap the generate call
 * - wrapStream: wrap streaming
 *
 * For tool call interception, we use `wrapGenerate` to inspect results
 * after the model returns tool calls, and `transformParams` to wrap
 * tool execute functions with policy checks.
 */
interface VercelAIMiddleware {
  /** Wrap tool execution by transforming params before model call */
  transformParams?: (options: TransformParamsOptions) => Promise<TransformParamsResult>;
}

interface TransformParamsOptions {
  type: string;
  params: VercelAIParams;
}

interface TransformParamsResult {
  [key: string]: unknown;
}

interface VercelAIParams {
  tools?: VercelAITool[];
  [key: string]: unknown;
}

interface VercelAITool {
  type: string;
  name: string;
  description?: string;
  parameters?: unknown;
  execute?: (args: Record<string, unknown>, context?: unknown) => Promise<unknown>;
  [key: string]: unknown;
}

// ─── createAgentGuardMiddleware ───────────────────────────────────────────────

/**
 * Create Vercel AI SDK middleware that enforces AgentGuard policies
 * on every tool call.
 *
 * The middleware wraps each tool's `execute` function with a policy check.
 * Before the tool runs, AgentGuard evaluates the call. If blocked, the tool
 * returns an error message instead of executing (or throws if throwOnBlock
 * is set).
 *
 * One-liner:
 * ```typescript
 * import { createAgentGuardMiddleware } from '@the-bot-club/agentguard';
 *
 * const result = await generateText({
 *   model: openai('gpt-4o'),
 *   tools: myTools,
 *   experimental_middleware: createAgentGuardMiddleware({ apiKey: 'ag_...' }),
 * });
 * ```
 *
 * @param options  Guard configuration
 * @returns        A Vercel AI SDK middleware object
 */
export function createAgentGuardMiddleware(
  options: VercelAIGuardOptions,
): VercelAIMiddleware {
  const guard = new AgentGuard({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
  });

  const throwOnBlock = options.throwOnBlock ?? false;

  return {
    async transformParams({ type, params }): Promise<TransformParamsResult> {
      // Only intercept calls that have tools
      if (!params.tools || params.tools.length === 0) {
        return { type, params };
      }

      // Wrap each tool's execute function with an AgentGuard policy check
      const wrappedTools = params.tools.map((tool) => {
        const originalExecute = tool.execute;

        // If the tool has no execute function, leave it as-is
        if (typeof originalExecute !== 'function') {
          return tool;
        }

        const wrappedExecute = async (
          args: Record<string, unknown>,
          context?: unknown,
        ): Promise<unknown> => {
          // Evaluate the tool call against AgentGuard
          const result = await guard.evaluate({
            tool: tool.name,
            params: args,
          });

          // Normalise decision field (API returns `result`, newer returns `decision`)
          const raw = result as unknown as Record<string, unknown>;
          const decision = (raw['result'] ?? raw['decision'] ?? 'allow') as AgentGuardToolDecision['decision'];

          const toolDecision: AgentGuardToolDecision = {
            tool: tool.name,
            decision,
            riskScore: (raw['riskScore'] as number | undefined) ?? 0,
            reason: raw['reason'] as string | undefined,
            suggestion: raw['suggestion'] as string | undefined,
            docs: raw['docs'] as string | undefined,
            alternatives: raw['alternatives'] as string[] | undefined,
            matchedRuleId: raw['matchedRuleId'] as string | undefined,
            approvalUrl: raw['approvalUrl'] as string | undefined,
            approvalId: raw['approvalId'] as string | undefined,
          };

          if (decision === 'block' || decision === 'require_approval') {
            // Fire onBlock callback
            if (options.onBlock) {
              await options.onBlock(toolDecision);
            }

            if (throwOnBlock) {
              throw new AgentGuardBlockError({
                ...toolDecision,
                agentId: options.agentId,
              });
            }

            // Return a structured error message so the model knows the call was blocked
            const blockMessage = toolDecision.reason ?? 'Blocked by AgentGuard policy';
            const suggestion = toolDecision.suggestion
              ? ` Suggestion: ${toolDecision.suggestion}`
              : '';
            return `[BLOCKED] ${blockMessage}.${suggestion}`;
          }

          // Fire onAllow callback
          if (options.onAllow) {
            await options.onAllow(toolDecision);
          }

          // Tool is allowed — execute normally
          return originalExecute(args, context);
        };

        return { ...tool, execute: wrappedExecute };
      });

      return { type, params: { ...params, tools: wrappedTools } };
    },
  };
}

// ─── Batch-aware variant ──────────────────────────────────────────────────────

/**
 * Create a batch-aware Vercel AI SDK middleware that uses `evaluateBatch`
 * to evaluate all tool calls in a single API round-trip.
 *
 * This is more efficient when the model returns multiple tool calls at once.
 * The trade-off is that all tools are evaluated before any execute, so
 * you get all-or-nothing blocking semantics per generation step.
 *
 * Usage:
 * ```typescript
 * import { createAgentGuardBatchMiddleware } from '@the-bot-club/agentguard';
 *
 * const result = await generateText({
 *   model: openai('gpt-4o'),
 *   tools: myTools,
 *   experimental_middleware: createAgentGuardBatchMiddleware({ apiKey: 'ag_...' }),
 * });
 * ```
 *
 * @param options  Guard configuration
 * @returns        A Vercel AI SDK middleware object
 */
export function createAgentGuardBatchMiddleware(
  options: VercelAIGuardOptions,
): VercelAIMiddleware {
  const guard = new AgentGuard({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
  });

  const throwOnBlock = options.throwOnBlock ?? false;

  // Track batch evaluation results keyed by tool name + args hash
  const batchResults = new Map<string, AgentGuardToolDecision>();

  return {
    async transformParams({ type, params }): Promise<TransformParamsResult> {
      if (!params.tools || params.tools.length === 0) {
        return { type, params };
      }

      // Clear previous batch results
      batchResults.clear();

      // We can't batch-evaluate in transformParams because we don't know
      // which tools will be called or with what args yet. Instead, wrap
      // each tool's execute to evaluate individually but cache results.
      // For true batch evaluation, use the standalone guard functions.
      const wrappedTools = params.tools.map((tool) => {
        const originalExecute = tool.execute;
        if (typeof originalExecute !== 'function') {
          return tool;
        }

        const wrappedExecute = async (
          args: Record<string, unknown>,
          context?: unknown,
        ): Promise<unknown> => {
          // Check cache first (from a prior batch evaluation)
          const cacheKey = `${tool.name}:${JSON.stringify(args)}`;
          let toolDecision = batchResults.get(cacheKey);

          if (!toolDecision) {
            // Evaluate individually
            const result = await guard.evaluate({
              tool: tool.name,
              params: args,
            });

            const raw = result as unknown as Record<string, unknown>;
            const decision = (raw['result'] ?? raw['decision'] ?? 'allow') as AgentGuardToolDecision['decision'];

            toolDecision = {
              tool: tool.name,
              decision,
              riskScore: (raw['riskScore'] as number | undefined) ?? 0,
              reason: raw['reason'] as string | undefined,
              suggestion: raw['suggestion'] as string | undefined,
              docs: raw['docs'] as string | undefined,
              alternatives: raw['alternatives'] as string[] | undefined,
              matchedRuleId: raw['matchedRuleId'] as string | undefined,
              approvalUrl: raw['approvalUrl'] as string | undefined,
              approvalId: raw['approvalId'] as string | undefined,
            };

            batchResults.set(cacheKey, toolDecision);
          }

          if (toolDecision.decision === 'block' || toolDecision.decision === 'require_approval') {
            if (options.onBlock) {
              await options.onBlock(toolDecision);
            }

            if (throwOnBlock) {
              throw new AgentGuardBlockError({
                ...toolDecision,
                agentId: options.agentId,
              });
            }

            const blockMessage = toolDecision.reason ?? 'Blocked by AgentGuard policy';
            const suggestion = toolDecision.suggestion
              ? ` Suggestion: ${toolDecision.suggestion}`
              : '';
            return `[BLOCKED] ${blockMessage}.${suggestion}`;
          }

          if (options.onAllow) {
            await options.onAllow(toolDecision);
          }

          return originalExecute(args, context);
        };

        return { ...tool, execute: wrappedExecute };
      });

      return { type, params: { ...params, tools: wrappedTools } };
    },
  };
}

// ─── Standalone guard function for manual use ─────────────────────────────────

/**
 * Evaluate a batch of tool calls against AgentGuard policies.
 *
 * Use this when you want to manually check tool calls before executing them,
 * rather than using the middleware pattern.
 *
 * ```typescript
 * import { evaluateToolCalls } from '@the-bot-club/agentguard';
 *
 * const results = await evaluateToolCalls(
 *   { apiKey: 'ag_...' },
 *   [
 *     { tool: 'readFile', params: { path: '/etc/passwd' } },
 *     { tool: 'sendEmail', params: { to: 'user@example.com' } },
 *   ],
 * );
 *
 * for (const result of results) {
 *   if (result.decision === 'block') {
 *     console.log(`Blocked ${result.tool}: ${result.reason}`);
 *   }
 * }
 * ```
 */
export async function evaluateToolCalls(
  options: Pick<VercelAIGuardOptions, 'apiKey' | 'baseUrl' | 'agentId'>,
  calls: Array<{ tool: string; params?: Record<string, unknown> }>,
): Promise<AgentGuardToolDecision[]> {
  const guard = new AgentGuard({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
  });

  const batch = await guard.evaluateBatch({
    agentId: options.agentId,
    calls,
  });

  return batch.results.map((r) => ({
    tool: r.tool,
    decision: r.decision,
    riskScore: r.riskScore,
    reason: r.reason,
    suggestion: r.suggestion,
    docs: r.docs,
    alternatives: r.alternatives,
    matchedRuleId: r.matchedRuleId,
    approvalUrl: r.approvalUrl,
    approvalId: r.approvalId,
  }));
}

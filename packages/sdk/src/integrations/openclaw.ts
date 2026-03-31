/**
 * AgentGuard — OpenClaw Plugin Integration
 *
 * Provides AgentGuard policy enforcement as an OpenClaw plugin. Intercepts
 * every tool call via the `before_tool_call` hook and evaluates it against
 * the agent's active policy before execution proceeds.
 *
 * Usage:
 * ```typescript
 * // openclaw.json
 * {
 *   "plugins": {
 *     "entries": {
 *       "agentguard": {
 *         "enabled": true,
 *         "config": {
 *           "apiKey": "${AGENTGUARD_API_KEY}",
 *           "agentId": "my-agent",
 *           "strict": true
 *         }
 *       }
 *     },
 *     "installs": {
 *       "agentguard": {
 *         "source": "npm",
 *         "spec": "@the-bot-club/agentguard-openclaw@^1.0.0"
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * The plugin registers a `before_tool_call` hook at priority 100.
 * On a block or HITL decision it returns `{ block: true, blockReason }`.
 * In strict mode (default) it also blocks when the AgentGuard API is
 * unreachable. In permissive mode (`strict: false`) it allows on error.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** OpenClaw plugin API surface (structural — no hard dep on openclaw package) */
interface OpenClawPluginApi {
  on(
    event: string,
    handler: (
      event: OpenClawToolCallEvent,
      ctx: OpenClawContext,
    ) => Promise<OpenClawHookResult | undefined>,
    options?: { priority?: number },
  ): void;
  config: Record<string, unknown>;
}

interface OpenClawToolCallEvent {
  toolName: string;
  params: Record<string, unknown>;
  runId?: string;
  toolCallId?: string;
}

interface OpenClawContext {
  sessionId?: string;
  [key: string]: unknown;
}

type OpenClawHookResult =
  | { block: true; blockReason: string }
  | { params: Record<string, unknown> };

export interface OpenClawPluginConfig {
  /** AgentGuard API key (ag_...) — or AGENTGUARD_API_KEY env var */
  apiKey?: string;
  /** AgentGuard agent ID — or AGENTGUARD_AGENT_ID env var */
  agentId?: string;
  /** AgentGuard API base URL (default: https://api.agentguard.tech) */
  baseUrl?: string;
  /** Block on policy eval errors (default: true / fail-closed) */
  strict?: boolean;
}

export interface OpenClawInterceptResult {
  allowed: boolean;
  decision: 'allow' | 'block' | 'hitl' | 'monitor';
  reason: string;
  riskScore: number;
  matchedRuleId?: string | null;
  gateId?: string | null;
  gateTimeoutSec?: number | null;
  evaluationMs: number;
}

// ─── OpenClawClient — calls AgentGuard API for policy evaluation ──────────────

class OpenClawClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly agentId: string;

  constructor(options: { baseUrl: string; apiKey: string; agentId: string }) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.agentId = options.agentId;
  }

  async intercept(
    toolName: string,
    params: Record<string, unknown>,
    sessionId: string,
    runId?: string,
    toolCallId?: string,
  ): Promise<OpenClawInterceptResult> {
    const response = await fetch(`${this.baseUrl}/v1/openclaw/intercept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'User-Agent': 'agentguard-openclaw-plugin/1.0',
      },
      body: JSON.stringify({
        request: {
          method: 'tool_call',
          id: toolCallId ?? `openclaw-${Date.now()}`,
          params: {
            name: toolName,
            arguments: params,
          },
        },
        identity: {
          agentId: this.agentId,
          sessionId,
          runId,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`AgentGuard API returned HTTP ${response.status}`);
    }

    return response.json() as Promise<OpenClawInterceptResult>;
  }
}

// ─── register — OpenClaw plugin entry point ───────────────────────────────────

/**
 * Register the AgentGuard plugin with the OpenClaw plugin API.
 *
 * This is the entry point that OpenClaw calls when loading the plugin.
 * It reads config from the OpenClaw plugin registry (set via `openclaw.json`)
 * and registers a `before_tool_call` hook that evaluates every tool call.
 *
 * @param api - The OpenClaw plugin API instance provided by the runtime
 *
 * @example
 * ```json
 * // openclaw.json
 * {
 *   "plugins": {
 *     "entries": {
 *       "agentguard": {
 *         "enabled": true,
 *         "config": {
 *           "apiKey": "${AGENTGUARD_API_KEY}",
 *           "agentId": "my-research-agent",
 *           "strict": true
 *         }
 *       }
 *     },
 *     "installs": {
 *       "agentguard": {
 *         "source": "npm",
 *         "spec": "@the-bot-club/agentguard-openclaw@^1.0.0"
 *       }
 *     }
 *   }
 * }
 * ```
 */
export function register(api: OpenClawPluginApi): void {
  const cfg = api.config as OpenClawPluginConfig;

  const apiKey = cfg.apiKey ?? process.env['AGENTGUARD_API_KEY'] ?? '';
  const agentId = cfg.agentId ?? process.env['AGENTGUARD_AGENT_ID'] ?? '';
  const baseUrl = cfg.baseUrl ?? process.env['AGENTGUARD_API_URL'] ?? 'https://api.agentguard.tech';
  const strict = cfg.strict !== false; // default fail-closed

  const client = new OpenClawClient({ baseUrl, apiKey, agentId });

  api.on(
    'before_tool_call',
    async (event: OpenClawToolCallEvent, ctx: OpenClawContext): Promise<OpenClawHookResult | undefined> => {
      const sessionId = ctx.sessionId ?? `openclaw-${Date.now()}`;

      let result: OpenClawInterceptResult;
      try {
        result = await client.intercept(
          event.toolName,
          event.params,
          sessionId,
          event.runId,
          event.toolCallId,
        );
      } catch (err) {
        if (strict) {
          return {
            block: true,
            blockReason: `AgentGuard policy evaluation failed (strict mode): ${String(err)}`,
          };
        }
        // Permissive mode — allow on error
        return undefined;
      }

      // Block decision
      if (!result.allowed && result.decision === 'block') {
        return {
          block: true,
          blockReason: `AgentGuard: Tool "${event.toolName}" blocked — ${result.reason}`,
        };
      }

      // HITL decision — block execution pending human approval
      if (result.decision === 'hitl') {
        return {
          block: true,
          blockReason: JSON.stringify({
            status: 'hitl_pending',
            gateId: result.gateId,
            gateTimeoutSec: result.gateTimeoutSec,
            message: `Tool "${event.toolName}" requires human approval`,
          }),
        };
      }

      // allow / monitor — proceed (params unchanged)
      return undefined;
    },
    { priority: 100 },
  );
}

// ─── openclawPlugin — convenience export ──────────────────────────────────────

/**
 * OpenClaw plugin module export.
 *
 * When used as a standalone plugin module, OpenClaw will call `register(api)`
 * automatically. This export is also provided for programmatic use or testing.
 *
 * @example
 * ```typescript
 * import { openclawPlugin } from '@the-bot-club/agentguard';
 *
 * // Manual registration (e.g. in tests):
 * openclawPlugin.register(mockApi);
 * ```
 */
export const openclawPlugin = { register };

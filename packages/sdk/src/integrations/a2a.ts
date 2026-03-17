/**
 * AgentGuard — A2A (Agent-to-Agent) Protocol Integration
 *
 * Security guardrails for Google's A2A protocol. Intercepts and evaluates
 * agent-to-agent task submissions, enforcing allowlists, scope limits,
 * input validation, and rate limiting per agent.
 *
 * A2A protocol overview:
 * - Agents communicate via JSON-RPC 2.0 over HTTP
 * - An agent sends "tasks" to other agents (tasks/send, tasks/sendSubscribe)
 * - Tasks have inputs (messages with parts) and produce outputs (artifacts)
 * - Agent Cards describe an agent's capabilities and skills
 *
 * Usage (client-side guard — wrapping outbound task submissions):
 * ```typescript
 * import { createA2AGuard } from '@the-bot-club/agentguard';
 *
 * const guard = createA2AGuard({ apiKey: 'ag_...' });
 *
 * // Before sending a task to another agent:
 * const decision = await guard.evaluateTask({
 *   targetAgent: 'agent-xyz',
 *   task: { id: 'task-1', messages: [{ role: 'user', parts: [{ text: '...' }] }] },
 * });
 * if (decision.blocked) { /* handle block *\/ }
 * ```
 *
 * Usage (server-side middleware — protecting an agent from incoming requests):
 * ```typescript
 * import { A2ASecurityMiddleware } from '@the-bot-club/agentguard';
 *
 * const middleware = new A2ASecurityMiddleware({ apiKey: 'ag_...' });
 *
 * // Express
 * app.use('/a2a', middleware.express());
 *
 * // Or manual per-request:
 * const result = await middleware.validateRequest(jsonRpcRequest, { callerAgent: 'agent-abc' });
 * ```
 */
import { AgentGuard } from '../sdk/client.js';
import { AgentGuardBlockError } from './errors.js';

// ─── A2A Protocol Type Stubs (duck-typed, no hard dependency) ─────────────────

/** A part of an A2A message (text, file, or data). */
interface A2APart {
  text?: string;
  file?: { name?: string; mimeType?: string; bytes?: string; uri?: string };
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/** An A2A message (user or agent). */
interface A2AMessage {
  role: 'user' | 'agent';
  parts: A2APart[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/** An A2A task object. */
interface A2ATask {
  id: string;
  sessionId?: string;
  messages?: A2AMessage[];
  artifacts?: Array<{ name?: string; parts?: A2APart[]; [key: string]: unknown }>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/** A2A JSON-RPC request shape. */
interface A2AJsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface A2AGuardOptions {
  /** AgentGuard API key (ag_...) */
  apiKey: string;
  /** Override the AgentGuard API base URL */
  baseUrl?: string;
  /** Optional agent ID for scoped evaluations (this agent's identity) */
  agentId?: string;
  /**
   * Allowlist of agent identifiers that may interact.
   * If set, requests from agents not in this list are immediately blocked.
   * Supports exact strings and glob patterns (e.g. 'org-acme/*').
   */
  allowedAgents?: string[];
  /**
   * Maximum task delegation depth to prevent runaway chains.
   * A task whose metadata.depth exceeds this value is blocked.
   * Default: 10.
   */
  maxTaskDepth?: number;
  /**
   * When true, throw AgentGuardBlockError on block/require_approval.
   * When false (default), return decision objects for the caller to handle.
   */
  throwOnBlock?: boolean;
  /** Callback invoked when a task/request is blocked. */
  onBlock?: (decision: A2AGuardDecision) => void;
  /** Callback invoked when a task/request is allowed. */
  onAllow?: (decision: A2AGuardDecision) => void;
}

// ─── Decision Types ───────────────────────────────────────────────────────────

export interface A2AGuardDecision {
  /** Whether the action was blocked */
  blocked: boolean;
  /** Policy decision */
  decision: 'allow' | 'block' | 'monitor' | 'require_approval';
  /** Risk score 0–1000 */
  riskScore: number;
  /** Human-readable reason */
  reason?: string;
  /** The calling/target agent identifier */
  agent?: string;
  /** The A2A method being invoked */
  method?: string;
  /** Matched policy rule ID */
  matchedRuleId?: string;
  /** Suggestion for alternative action */
  suggestion?: string;
  /** Per-input decisions when multiple parts are evaluated */
  inputDecisions?: Array<{
    partIndex: number;
    decision: string;
    riskScore: number;
    reason?: string;
  }>;
}

// ─── Rate Limiter (in-memory, per-agent) ──────────────────────────────────────

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

class InMemoryRateLimiter {
  private limits = new Map<string, RateLimitEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 100, windowMs: number = 60_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  check(agentId: string): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    let entry = this.limits.get(agentId);

    if (!entry || now - entry.windowStart >= this.windowMs) {
      entry = { count: 0, windowStart: now };
      this.limits.set(agentId, entry);
    }

    entry.count++;
    const remaining = Math.max(0, this.maxRequests - entry.count);
    const resetMs = entry.windowStart + this.windowMs - now;

    return {
      allowed: entry.count <= this.maxRequests,
      remaining,
      resetMs,
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function globMatch(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  // eslint-disable-next-line security/detect-non-literal-regexp -- pattern is admin-configured allowedAgents glob, not user input
  return new RegExp(`^${escaped}$`).test(value);
}

function isAgentAllowed(agentId: string, allowedAgents: string[]): boolean {
  return allowedAgents.some((pattern) => globMatch(pattern, agentId));
}

/** Extract text content from A2A message parts for policy evaluation. */
function extractInputSummary(messages?: A2AMessage[]): Record<string, unknown> {
  if (!messages || messages.length === 0) return {};
  const parts: unknown[] = [];
  for (const msg of messages) {
    for (const part of msg.parts ?? []) {
      if (part.text) parts.push({ type: 'text', text: part.text });
      else if (part.file) parts.push({ type: 'file', name: part.file.name, mimeType: part.file.mimeType });
      else if (part.data) parts.push({ type: 'data', keys: Object.keys(part.data) });
    }
  }
  return { messageCount: messages.length, parts };
}

// ─── A2A Task Methods (A2A protocol methods that carry tasks) ─────────────────

const A2A_TASK_METHODS = new Set([
  'tasks/send',
  'tasks/sendSubscribe',
  'tasks/get',
  'tasks/cancel',
  'tasks/pushNotification/set',
  'tasks/pushNotification/get',
  'tasks/resubscribe',
]);

// ─── createA2AGuard (client-side) ─────────────────────────────────────────────

export interface A2AGuard {
  /**
   * Evaluate an outbound A2A task before sending it to another agent.
   *
   * @param params  Task details including the target agent and task object
   * @returns       Decision with blocked flag and details
   */
  evaluateTask(params: {
    targetAgent: string;
    task: A2ATask;
    method?: string;
  }): Promise<A2AGuardDecision>;

  /**
   * Evaluate an incoming A2A task received from another agent.
   *
   * @param params  Request details including the calling agent and task
   * @returns       Decision with blocked flag and details
   */
  evaluateIncoming(params: {
    callerAgent: string;
    task: A2ATask;
    method?: string;
  }): Promise<A2AGuardDecision>;

  /**
   * Validate an A2A JSON-RPC request (raw request-level check).
   *
   * @param request  The JSON-RPC request object
   * @param context  Additional context (caller identity, etc.)
   * @returns        Decision with blocked flag and details
   */
  validateRequest(
    request: A2AJsonRpcRequest,
    context?: { callerAgent?: string; depth?: number },
  ): Promise<A2AGuardDecision>;
}

/**
 * Create an A2A guard for intercepting agent-to-agent task submissions.
 *
 * Evaluates: which agent is calling, what task they're requesting, what
 * inputs they're sending. Enforces agent allowlists, task scope limits,
 * input validation, and rate limiting per agent.
 *
 * @param options  Guard configuration
 * @returns        A2A guard object with evaluateTask, evaluateIncoming, validateRequest
 */
export function createA2AGuard(options: A2AGuardOptions): A2AGuard {
  const guard = new AgentGuard({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
  });

  const maxTaskDepth = options.maxTaskDepth ?? 10;
  const throwOnBlock = options.throwOnBlock ?? false;
  const allowedAgents = options.allowedAgents;
  const rateLimiter = new InMemoryRateLimiter();

  function emitDecision(decision: A2AGuardDecision): A2AGuardDecision {
    if (decision.blocked) {
      options.onBlock?.(decision);
    } else {
      options.onAllow?.(decision);
    }
    return decision;
  }

  function maybeThrow(decision: A2AGuardDecision): void {
    if (throwOnBlock && decision.blocked) {
      throw new AgentGuardBlockError({
        tool: `a2a:${decision.method ?? 'task'}`,
        decision: decision.decision,
        riskScore: decision.riskScore,
        reason: decision.reason,
        suggestion: decision.suggestion,
        agentId: options.agentId,
      });
    }
  }

  async function evaluateCore(params: {
    agentId: string;
    task: A2ATask;
    method: string;
    direction: 'inbound' | 'outbound';
  }): Promise<A2AGuardDecision> {
    const { agentId, task, method, direction } = params;

    // ── Allowlist check ──────────────────────────────────────────────
    if (allowedAgents && allowedAgents.length > 0 && !isAgentAllowed(agentId, allowedAgents)) {
      const decision: A2AGuardDecision = {
        blocked: true,
        decision: 'block',
        riskScore: 900,
        reason: `Agent "${agentId}" is not in the allowed agents list`,
        agent: agentId,
        method,
      };
      emitDecision(decision);
      maybeThrow(decision);
      return decision;
    }

    // ── Rate limit check ─────────────────────────────────────────────
    const rateResult = rateLimiter.check(agentId);
    if (!rateResult.allowed) {
      const decision: A2AGuardDecision = {
        blocked: true,
        decision: 'block',
        riskScore: 700,
        reason: `Rate limit exceeded for agent "${agentId}". Resets in ${Math.ceil(rateResult.resetMs / 1000)}s`,
        agent: agentId,
        method,
      };
      emitDecision(decision);
      maybeThrow(decision);
      return decision;
    }

    // ── Depth check ──────────────────────────────────────────────────
    const depth = (task.metadata?.['depth'] as number | undefined) ?? 0;
    if (depth > maxTaskDepth) {
      const decision: A2AGuardDecision = {
        blocked: true,
        decision: 'block',
        riskScore: 800,
        reason: `Task delegation depth (${depth}) exceeds maximum allowed (${maxTaskDepth})`,
        agent: agentId,
        method,
        suggestion: 'Reduce the chain of agent delegations or increase maxTaskDepth',
      };
      emitDecision(decision);
      maybeThrow(decision);
      return decision;
    }

    // ── AgentGuard policy evaluation ─────────────────────────────────
    const toolName = `a2a:${method}`;
    const inputSummary = extractInputSummary(task.messages);

    const result = await guard.evaluate({
      tool: toolName,
      params: {
        agent: agentId,
        direction,
        taskId: task.id,
        sessionId: task.sessionId,
        depth,
        ...inputSummary,
        ...(task.metadata ?? {}),
      },
    });

    const raw = result as unknown as Record<string, unknown>;
    const policyDecision = (raw['result'] ?? raw['decision'] ?? 'allow') as A2AGuardDecision['decision'];
    const isBlocked = policyDecision === 'block' || policyDecision === 'require_approval';

    const decision: A2AGuardDecision = {
      blocked: isBlocked,
      decision: policyDecision,
      riskScore: (raw['riskScore'] as number | undefined) ?? 0,
      reason: raw['reason'] as string | undefined,
      agent: agentId,
      method,
      matchedRuleId: raw['matchedRuleId'] as string | undefined,
      suggestion: raw['suggestion'] as string | undefined,
    };

    emitDecision(decision);
    maybeThrow(decision);
    return decision;
  }

  return {
    async evaluateTask(params) {
      return evaluateCore({
        agentId: params.targetAgent,
        task: params.task,
        method: params.method ?? 'tasks/send',
        direction: 'outbound',
      });
    },

    async evaluateIncoming(params) {
      return evaluateCore({
        agentId: params.callerAgent,
        task: params.task,
        method: params.method ?? 'tasks/send',
        direction: 'inbound',
      });
    },

    async validateRequest(request, context) {
      const method = request.method;

      // Non-task methods (e.g. agent/authenticatedExtendedCard) get a pass
      if (!A2A_TASK_METHODS.has(method)) {
        const decision: A2AGuardDecision = {
          blocked: false,
          decision: 'allow',
          riskScore: 0,
          method,
          reason: `Non-task method "${method}" allowed by default`,
        };
        emitDecision(decision);
        return decision;
      }

      const callerAgent = context?.callerAgent ?? 'unknown';
      const taskParams = (request.params ?? {}) as Record<string, unknown>;
      const task: A2ATask = {
        id: (taskParams['id'] as string) ?? (taskParams['taskId'] as string) ?? 'unknown',
        sessionId: taskParams['sessionId'] as string | undefined,
        messages: taskParams['message']
          ? [taskParams['message'] as A2AMessage]
          : (taskParams['messages'] as A2AMessage[] | undefined),
        metadata: {
          ...((taskParams['metadata'] as Record<string, unknown>) ?? {}),
          depth: context?.depth ?? (taskParams['metadata'] as Record<string, unknown> | undefined)?.['depth'] ?? 0,
        },
      };

      return evaluateCore({
        agentId: callerAgent,
        task,
        method,
        direction: 'inbound',
      });
    },
  };
}

// ─── A2ASecurityMiddleware (server-side HTTP/Express middleware) ───────────────

export interface A2AMiddlewareOptions extends A2AGuardOptions {
  /**
   * Header name to extract the calling agent's identity from.
   * Default: 'x-agent-id'.
   */
  agentIdHeader?: string;
  /**
   * Rate limit: max requests per agent per window. Default: 100.
   */
  rateLimitMax?: number;
  /**
   * Rate limit window in milliseconds. Default: 60000 (1 minute).
   */
  rateLimitWindowMs?: number;
}

/**
 * Express/HTTP middleware that validates incoming A2A JSON-RPC requests.
 *
 * Extracts the calling agent identity from a configurable header, validates
 * the JSON-RPC request against AgentGuard policies, and returns a JSON-RPC
 * error response on block.
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { A2ASecurityMiddleware } from '@the-bot-club/agentguard';
 *
 * const app = express();
 * app.use(express.json());
 *
 * const a2aMiddleware = new A2ASecurityMiddleware({
 *   apiKey: 'ag_...',
 *   allowedAgents: ['trusted-agent-*'],
 *   maxTaskDepth: 5,
 * });
 *
 * app.use('/a2a', a2aMiddleware.express());
 * ```
 */
export class A2ASecurityMiddleware {
  private guard: ReturnType<typeof createA2AGuard>;
  private agentIdHeader: string;

  constructor(options: A2AMiddlewareOptions) {
    this.guard = createA2AGuard(options);
    this.agentIdHeader = (options.agentIdHeader ?? 'x-agent-id').toLowerCase();
  }

  /**
   * Validate a raw A2A JSON-RPC request.
   *
   * @param request       The parsed JSON-RPC request body
   * @param context       Additional context (caller agent, depth override)
   * @returns             Decision with blocked flag and details
   */
  async validateRequest(
    request: A2AJsonRpcRequest,
    context?: { callerAgent?: string; depth?: number },
  ): Promise<A2AGuardDecision> {
    return this.guard.validateRequest(request, context);
  }

  /**
   * Returns an Express-compatible middleware function.
   *
   * Expects `req.body` to be the parsed JSON-RPC request (use `express.json()` first).
   * On block, responds with a JSON-RPC error (HTTP 403). On allow, calls `next()`.
   */
  express(): (req: ExpressLikeRequest, res: ExpressLikeResponse, next: () => void) => void {
    return (req, res, next) => {
      const body = req.body as A2AJsonRpcRequest | undefined;
      if (!body || !body.jsonrpc || !body.method) {
        next();
        return;
      }

      const callerAgent =
        (req.headers[this.agentIdHeader] as string | undefined) ?? 'unknown';

      this.guard
        .validateRequest(body, { callerAgent })
        .then((decision) => {
          if (decision.blocked) {
            const errorResponse = {
              jsonrpc: '2.0' as const,
              id: body.id ?? null,
              error: {
                code: -32600,
                message: decision.reason ?? 'Blocked by AgentGuard policy',
                data: {
                  decision: decision.decision,
                  riskScore: decision.riskScore,
                  agent: decision.agent,
                  matchedRuleId: decision.matchedRuleId,
                },
              },
            };
            res.status(403).json(errorResponse);
          } else {
            next();
          }
        })
        .catch((err) => {
          // If throwOnBlock is true, the guard throws AgentGuardBlockError
          if (err instanceof AgentGuardBlockError) {
            const errorResponse = {
              jsonrpc: '2.0' as const,
              id: body.id ?? null,
              error: {
                code: -32600,
                message: err.reason,
                data: {
                  decision: err.decision,
                  riskScore: err.riskScore,
                  tool: err.tool,
                },
              },
            };
            res.status(403).json(errorResponse);
          } else {
            // Unexpected error — pass to Express error handler
            next();
          }
        });
    };
  }
}

// ─── Minimal Express type stubs (structural, no hard dep on express) ──────────

interface ExpressLikeRequest {
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  [key: string]: unknown;
}

interface ExpressLikeResponse {
  status(code: number): ExpressLikeResponse;
  json(body: unknown): void;
  [key: string]: unknown;
}

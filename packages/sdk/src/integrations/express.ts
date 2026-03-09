/**
 * AgentGuard — Express / Fastify Middleware
 *
 * Attaches an AgentGuard client instance to the request object so that
 * route handlers can evaluate tool calls without creating a new client
 * per-request.
 *
 * Usage (Express):
 *   import express from 'express';
 *   import { expressMiddleware } from '@the-bot-club/agentguard';
 *
 *   const app = express();
 *   app.use(expressMiddleware({ apiKey: 'ag_...' }));
 *
 *   app.post('/run-agent', async (req, res) => {
 *     const decision = await req.agentguard.evaluate({
 *       tool: 'send_email',
 *       params: req.body,
 *     });
 *     if (decision.result !== 'allow') {
 *       return res.status(403).json({ error: 'blocked', reason: decision.reason });
 *     }
 *     // ... proceed
 *   });
 *
 * Usage (Fastify via preHandler hook):
 *   import Fastify from 'fastify';
 *   import { fastifyMiddleware } from '@the-bot-club/agentguard';
 *
 *   const app = Fastify();
 *   app.addHook('preHandler', fastifyMiddleware({ apiKey: 'ag_...' }));
 *
 * TypeScript: Augment the express Request type in your project:
 *   declare global {
 *     namespace Express {
 *       interface Request { agentguard: AgentGuard; }
 *     }
 *   }
 */
import { AgentGuard } from '../sdk/client.js';

// ─── Options ──────────────────────────────────────────────────────────────────

export interface ExpressMiddlewareOptions {
  /** AgentGuard API key (ag_...) */
  apiKey: string;
  /** Override the AgentGuard API base URL */
  baseUrl?: string;
  /**
   * Set to true to enable local in-process policy evaluation (<5ms).
   * Requires policies to sync from the API first.
   */
  localEval?: boolean;
}

// ─── Minimal structural types (avoid hard dep on @types/express) ─────────────

interface RequestLike {
  [key: string]: unknown;
}

interface ResponseLike {
  [key: string]: unknown;
}

type NextFn = (err?: unknown) => void;

// ─── Express Middleware ───────────────────────────────────────────────────────

/**
 * Express middleware factory. Creates a single shared AgentGuard client and
 * attaches it to `req.agentguard` for every request.
 *
 * One-liner:
 * ```typescript
 * import { expressMiddleware } from '@the-bot-club/agentguard';
 * app.use(expressMiddleware({ apiKey: 'ag_...' }));
 * ```
 *
 * @param options  Guard configuration
 * @returns        Express-compatible middleware function
 */
export function expressMiddleware(options: ExpressMiddlewareOptions) {
  // Single shared instance — reused across all requests (safe, stateless)
  const guard = new AgentGuard({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    localEval: options.localEval,
  });

  return function agentGuardMiddleware(
    req: RequestLike,
    _res: ResponseLike,
    next: NextFn,
  ): void {
    // Attach the guard instance to the request
    req['agentguard'] = guard;
    next();
  };
}

// ─── Fastify Pre-Handler Hook ─────────────────────────────────────────────────

/**
 * Fastify-compatible pre-handler hook factory.
 * Attaches `request.agentguard` on every incoming request.
 *
 * One-liner:
 * ```typescript
 * import { fastifyMiddleware } from '@the-bot-club/agentguard';
 * app.addHook('preHandler', fastifyMiddleware({ apiKey: 'ag_...' }));
 * ```
 *
 * @param options  Guard configuration
 * @returns        Fastify preHandler hook function
 */
export function fastifyMiddleware(options: ExpressMiddlewareOptions) {
  const guard = new AgentGuard({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    localEval: options.localEval,
  });

  return async function agentGuardHook(
    request: RequestLike,
    _reply: ResponseLike,
  ): Promise<void> {
    request['agentguard'] = guard;
  };
}

/**
 * Convenience alias for expressMiddleware — use in any Connect-compatible framework.
 *
 * @param options  Guard configuration
 * @returns        Connect-compatible middleware function
 */
export const connectMiddleware = expressMiddleware;

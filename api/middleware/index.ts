/**
 * AgentGuard — Middleware Registration
 *
 * Sets up all pre-database middleware in the correct order.
 * Extracted from server.ts for maintainability.
 */
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import helmet from 'helmet';
import { logger, scrubTokenFromUrl } from '../lib/logger.js';
import {
  rateLimitMiddleware,
  bruteForceMiddleware,
  authEndpointRateLimitMiddleware,
  scimRateLimitMiddleware,
} from './rate-limit.js';
import { requestLogger } from './request-logger.js';
import { versioningMiddleware } from './versioning.js';
import {
  incrementRequestCount,
  incrementErrorCount,
  observeRequestDuration,
  incrementActiveConnections,
  decrementActiveConnections,
} from '../lib/metrics.js';

// ── CORS Configuration (exported for startup logging) ────────────────────
export const ALLOWED_ORIGINS = [
  'https://agentguard.tech',
  'https://www.agentguard.tech',
  'https://app.agentguard.tech',
  'https://demo.agentguard.tech',
  'https://docs.agentguard.tech',
];

if (process.env['CORS_ORIGINS']) {
  ALLOWED_ORIGINS.push(
    ...process.env['CORS_ORIGINS']
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );
}

export const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';

// ── Express Request type extension for raw body capture ──────────────────
declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
    }
  }
}

/**
 * Apply all middleware that runs before the database is initialized.
 * Order is critical — middleware runs in registration order.
 */
export function setupMiddleware(app: express.Express): void {
  // 1. URL token scrubbing — first so no downstream middleware logs plaintext tokens
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.url) req.url = scrubTokenFromUrl(req.url);
    if (req.originalUrl) req.originalUrl = scrubTokenFromUrl(req.originalUrl);
    next();
  });

  // 2. Request ID + SDK correlation headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    const existing = req.headers['x-request-id'];
    const requestId = Array.isArray(existing) ? existing[0] : existing || crypto.randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId as string);

    const rawTrace = req.headers['x-trace-id'];
    const traceId = (Array.isArray(rawTrace) ? rawTrace[0] : rawTrace) || crypto.randomUUID();
    const rawSpan = req.headers['x-span-id'];
    const spanId = (Array.isArray(rawSpan) ? rawSpan[0] : rawSpan) || crypto.randomUUID();
    req.headers['x-trace-id'] = traceId;
    req.headers['x-span-id'] = spanId;

    (req as Request & { log: ReturnType<typeof logger.child> }).log = logger.child({ requestId, traceId, spanId });
    next();
  });

  // 3. Structured request lifecycle logger
  app.use(requestLogger);

  // 3b. Prometheus metrics — track request count, duration, active connections, errors
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = performance.now();
    incrementActiveConnections();

    res.on('finish', () => {
      const duration = performance.now() - start;
      const route = req.route?.path || req.path;
      const method = req.method;
      const status = res.statusCode;

      incrementRequestCount(route, method, status);
      observeRequestDuration(route, method, duration);
      if (status >= 500) {
        incrementErrorCount(route, method);
      }
      decrementActiveConnections();
    });

    next();
  });

  // 4. Trust proxy (Cloudflare + Azure LB = 2 hops)
  app.set('trust proxy', 2);

  // 5. CORS — restrict to known origins
  app.use(
    cors({
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        const isAllowed =
          !origin ||
          ALLOWED_ORIGINS.includes(origin) ||
          (!IS_PRODUCTION && /^https?:\/\/localhost(:\d+)?$/.test(origin)) ||
          /^https:\/\/agentguard-[^.]+\.australiaeast\.azurecontainerapps\.io$/.test(origin);
        if (isAllowed) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization'],
      credentials: false,
    }),
  );

  app.disable('x-powered-by');

  // 6. llms.txt — plain-text agent discovery (mounted before body parsers)
  app.get('/llms.txt', (_req: Request, res: Response) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(`# AgentGuard
> Runtime security for AI agents. Evaluate tool calls before execution.

## Setup
For AI agents: GET https://api.agentguard.tech/api/v1/setup
For humans: https://agentguard.tech/docs

## Try Without Signup
POST https://api.agentguard.tech/api/v1/evaluate
Content-Type: application/json
{"tool": "read_file", "params": {"path": "/etc/passwd"}}

## Sign Up (free, no email required)
POST https://api.agentguard.tech/api/v1/signup
Content-Type: application/json
{"name": "My Agent"}

## SDKs
- Python: pip install agentguard
- Node.js: npm install @the-bot-club/agentguard

## Links
- API: https://api.agentguard.tech
- Docs: https://agentguard.tech/docs
- GitHub: https://github.com/thebotclub/AgentGuard
`);
  });

  // 7. Raw body capture for Slack HMAC verification
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.path === '/api/v1/integrations/slack/callback') {
      let data = '';
      req.on('data', (chunk: Buffer) => {
        data += chunk.toString('utf8');
      });
      req.on('end', () => {
        req.rawBody = data;
        try {
          const params = new URLSearchParams(data);
          const payload = params.get('payload');
          if (payload) {
            req.body = { payload };
          } else {
            req.body = Object.fromEntries(params.entries());
          }
        } catch {
          req.body = {};
        }
        next();
      });
      req.on('error', () => next());
    } else {
      next();
    }
  });

  // 8. Request ID tracing
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    _res.setHeader('x-request-id', req.requestId);
    next();
  });

  // 9. Stripe + GitHub webhook raw body capture (before JSON parsing)
  app.use('/api/v1/webhooks/stripe', express.raw({ type: 'application/json', limit: '1mb' }));
  app.use('/api/v1/policies/webhook/github', express.raw({ type: 'application/json', limit: '2mb' }));

  // 10. Body parsing
  app.use(express.json({ limit: '50kb' }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));

  // 11. Security headers (Helmet)
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  // 12. Request timeout (30s default, SSE exempt)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/api/v1/events/stream') {
      req.setTimeout(0);
      res.setTimeout(0);
    } else {
      req.setTimeout(30_000);
      res.setTimeout(30_000);
    }
    next();
  });

  // 13. Additional security headers
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=()',
    );
    next();
  });

  // 14. API versioning headers
  app.use(versioningMiddleware);

  // 15. IP rate limiting
  app.use(rateLimitMiddleware);

  // 16. Auth endpoint rate limiting
  app.use(
    ['/api/v1/signup', '/api/v1/auth', '/api/v1/sso', '/api/v1/recover'],
    authEndpointRateLimitMiddleware,
  );

  // 17. SCIM endpoint rate limiting
  app.use('/api/scim', scimRateLimitMiddleware);

  // 18. Brute-force protection
  app.use(
    ['/api/v1/signup', '/api/v1/evaluate', '/api/v1/evaluate/batch', '/api/v1/mcp/evaluate'],
    bruteForceMiddleware,
  );
}

/**
 * Creates a minimal Express app for testing individual route groups.
 * Provides a simple auth middleware that doesn't touch the database.
 */
import express, { Request, Response, NextFunction } from 'express';
import type { IDatabase } from '../../db-interface.js';
import type { AuthMiddleware } from '../../middleware/auth.js';
import { MOCK_TENANT, MOCK_AGENT } from './mock-db.js';

/**
 * A mock AuthMiddleware that simulates real auth without hitting the DB.
 *
 * Rules:
 *   - No key → 401 for requireTenantAuth, pass (demo) for requireEvaluateAuth
 *   - "ag_agent_*" → 403 for requireTenantAuth, sets req.agent for requireEvaluateAuth
 *   - "valid-key" → sets tenantId = 'tenant-123'
 *   - "admin-key" → requireAdminAuth passes
 *   - anything else → 401
 */
export function createMockAuthMiddleware(): AuthMiddleware {
  async function requireTenantAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (!apiKey) {
      res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
      return;
    }
    if (apiKey.startsWith('ag_agent_')) {
      res.status(403).json({ error: 'Agent keys cannot perform tenant admin operations.' });
      return;
    }
    if (apiKey === 'valid-key') {
      req.tenantId = 'tenant-123';
      req.tenant = MOCK_TENANT;
      req.agent = null;
      next();
      return;
    }
    res.status(401).json({ error: 'unauthorized', message: 'Invalid or inactive API key' });
  }

  async function requireEvaluateAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (!apiKey) {
      // Anonymous access — demo mode
      req.tenantId = undefined;
      req.tenant = null;
      req.agent = null;
      next();
      return;
    }
    if (apiKey.startsWith('ag_agent_')) {
      if (apiKey === 'ag_agent_valid') {
        req.agent = MOCK_AGENT;
        req.tenant = MOCK_TENANT;
        req.tenantId = 'tenant-123';
        next();
        return;
      }
      res.status(401).json({ error: 'unauthorized', message: 'Invalid or inactive agent key' });
      return;
    }
    if (apiKey === 'valid-key') {
      req.tenantId = 'tenant-123';
      req.tenant = MOCK_TENANT;
      req.agent = null;
      next();
      return;
    }
    res.status(401).json({ error: 'unauthorized', message: 'Invalid or inactive API key' });
  }

  async function optionalTenantAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (apiKey === 'valid-key') {
      req.tenantId = 'tenant-123';
      req.tenant = MOCK_TENANT;
    } else {
      req.tenantId = 'demo';
      req.tenant = null;
    }
    req.agent = null;
    next();
  }

  function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (apiKey === 'admin-key') {
      next();
      return;
    }
    res.status(401).json({ error: 'unauthorized', message: 'Valid admin API key required' });
  }

  return { requireTenantAuth, requireEvaluateAuth, optionalTenantAuth, requireAdminAuth };
}

/**
 * Build a test Express app that mounts a route factory's output.
 */
export function buildApp(
  routeFactory: (db: IDatabase, auth: AuthMiddleware) => express.Router,
  db: IDatabase,
): express.Application {
  const app = express();
  app.use(express.json());
  const auth = createMockAuthMiddleware();
  app.use(routeFactory(db, auth));
  return app;
}

/**
 * Build a test Express app for routes that only need the db (no auth param).
 */
export function buildDbOnlyApp(
  routeFactory: (db: IDatabase) => express.Router,
  db: IDatabase,
): express.Application {
  const app = express();
  app.use(express.json());
  app.use(routeFactory(db));
  return app;
}

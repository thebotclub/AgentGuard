/**
 * AgentGuard — Policy-as-Code Git Webhook (GitOps)
 *
 * Route factory — wires handlers to Express router with auth/role middleware.
 *
 * Routes:
 *   POST /api/v1/policies/webhook/github     — receive GitHub push webhook
 *   GET  /api/v1/policies/git/config         — get git webhook config
 *   PUT  /api/v1/policies/git/config         — configure git webhook
 *   DELETE /api/v1/policies/git/config       — remove git webhook config
 *   GET  /api/v1/policies/git/logs           — list sync history
 *   POST /api/v1/policies/git/sync           — trigger manual sync
 *   POST /api/v1/policies/rollback/:version  — rollback policy to version
 */

import { Router } from 'express';
import type { IDatabase } from '../../db-interface.js';
import type { AuthMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../lib/rbac.js';
import {
  getGitConfigHandler,
  putGitConfigHandler,
  deleteGitConfigHandler,
  getGitLogsHandler,
  postManualSyncHandler,
  postRollbackHandler,
  postGithubWebhookHandler,
} from './handler.js';

export function createPolicyGitWebhookRoutes(db: IDatabase, auth: AuthMiddleware): Router {
  const router = Router();

  router.get(
    '/api/v1/policies/git/config',
    auth.requireTenantAuth,
    requireRole('owner', 'admin'),
    (req, res) => getGitConfigHandler(db, req, res),
  );

  router.put(
    '/api/v1/policies/git/config',
    auth.requireTenantAuth,
    requireRole('owner', 'admin'),
    (req, res) => putGitConfigHandler(db, req, res),
  );

  router.delete(
    '/api/v1/policies/git/config',
    auth.requireTenantAuth,
    requireRole('owner', 'admin'),
    (req, res) => deleteGitConfigHandler(db, req, res),
  );

  router.get(
    '/api/v1/policies/git/logs',
    auth.requireTenantAuth,
    requireRole('owner', 'admin', 'member'),
    (req, res) => getGitLogsHandler(db, req, res),
  );

  router.post(
    '/api/v1/policies/git/sync',
    auth.requireTenantAuth,
    requireRole('owner', 'admin'),
    (req, res) => postManualSyncHandler(db, req, res),
  );

  router.post(
    '/api/v1/policies/rollback/:version',
    auth.requireTenantAuth,
    requireRole('owner', 'admin'),
    (req, res) => postRollbackHandler(db, req, res),
  );

  router.post(
    '/api/v1/policies/webhook/github',
    (req, res) => postGithubWebhookHandler(db, req, res),
  );

  return router;
}

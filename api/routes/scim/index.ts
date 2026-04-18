/**
 * AgentGuard — SCIM 2.0 Provisioning Routes
 *
 * Implements SCIM 2.0 Core Schema (RFC 7643) and Protocol (RFC 7644).
 * Compatible with Okta, Azure AD, and OneLogin SCIM connectors.
 *
 * Authentication: Bearer token (separate from main API keys / JWTs).
 *   Token management: POST /api/scim/v2/tokens (requires main auth)
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import type { IDatabase } from '../../db-interface.js';
import type { AuthMiddleware } from '../../middleware/auth.js';
import { logger } from '../../lib/logger.js';
import {
  SCIM_SCHEMAS, SCIM_CONTENT_TYPE,
  scimError, hashToken, auditScim, createScimAuth, getBaseUrl,
} from './helpers.js';
import { registerUserRoutes } from './users.js';
import { registerGroupRoutes } from './groups.js';

export function createScimRoutes(db: IDatabase, auth: AuthMiddleware): Router {
  const router = Router();
  const scimAuth = createScimAuth(db);

  // ── ServiceProviderConfig ────────────────────────────────────────────────
  router.get('/api/scim/v2/ServiceProviderConfig', (_req: Request, res: Response) => {
    res.type(SCIM_CONTENT_TYPE).json({
      schemas: [SCIM_SCHEMAS.SERVICE_PROVIDER_CONFIG],
      documentationUri: 'https://agentguard.tech/docs/scim',
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [
        {
          type: 'oauthbearertoken', name: 'OAuth Bearer Token',
          description: 'Authentication scheme using the OAuth Bearer Token standard',
          specUri: 'http://www.rfc-editor.org/info/rfc6750', primary: true,
        },
      ],
      meta: { resourceType: 'ServiceProviderConfig', location: '/api/scim/v2/ServiceProviderConfig' },
    });
  });

  // ── Schemas ───────────────────────────────────────────────────────────────
  router.get('/api/scim/v2/Schemas', (_req: Request, res: Response) => {
    res.type(SCIM_CONTENT_TYPE).json({
      schemas: [SCIM_SCHEMAS.LIST_RESPONSE], totalResults: 2, startIndex: 1, itemsPerPage: 2,
      Resources: [
        {
          id: SCIM_SCHEMAS.USER, schemas: ['urn:ietf:params:scim:schemas:core:2.0:Schema'],
          name: 'User', description: 'User Account',
          attributes: [
            { name: 'userName', type: 'string', multiValued: false, required: true, caseExact: false, mutability: 'readWrite', returned: 'default', uniqueness: 'server' },
            { name: 'name', type: 'complex', multiValued: false, required: false, mutability: 'readWrite', returned: 'default' },
            { name: 'displayName', type: 'string', multiValued: false, required: false, mutability: 'readWrite', returned: 'default' },
            { name: 'emails', type: 'complex', multiValued: true, required: false, mutability: 'readWrite', returned: 'default' },
            { name: 'active', type: 'boolean', multiValued: false, required: false, mutability: 'readWrite', returned: 'default' },
            { name: 'externalId', type: 'string', multiValued: false, required: false, mutability: 'readWrite', returned: 'default' },
          ],
        },
        {
          id: SCIM_SCHEMAS.GROUP, schemas: ['urn:ietf:params:scim:schemas:core:2.0:Schema'],
          name: 'Group', description: 'Group',
          attributes: [
            { name: 'displayName', type: 'string', multiValued: false, required: true, mutability: 'readWrite', returned: 'default' },
            { name: 'members', type: 'complex', multiValued: true, required: false, mutability: 'readWrite', returned: 'default' },
          ],
        },
      ],
    });
  });

  // ── Token Management (requires main JWT auth) ─────────────────────────────
  router.post('/api/scim/v2/tokens', auth.requireTenantAuth, async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const { label = 'default' } = req.body ?? {};
    const token = `ag-scim-${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = hashToken(token);
    try {
      const row = await db.createScimToken(tenantId, tokenHash, label);
      await auditScim(db, tenantId, 'create', 'token', row.id, 'success', `Token "${label}" created`);
      res.status(201).json({
        id: row.id, label: row.label, token,
        created_at: row.created_at,
        message: 'Store this token securely — it will not be shown again.',
      });
    } catch (err) {
      logger.error({ err }, '[SCIM] createToken error');
      res.status(500).json({ error: 'Failed to create SCIM token' });
    }
  });

  router.get('/api/scim/v2/tokens', auth.requireTenantAuth, async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    try {
      const tokens = await db.listScimTokens(tenantId);
      res.json(tokens.map(t => ({
        id: t.id, label: t.label, active: t.active === 1,
        created_at: t.created_at, last_used_at: t.last_used_at,
      })));
    } catch (err) {
      logger.error({ err }, '[SCIM] listTokens error');
      res.status(500).json({ error: 'Failed to list SCIM tokens' });
    }
  });

  router.delete('/api/scim/v2/tokens/:id', auth.requireTenantAuth, async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const id = req.params.id as string;
    try {
      await db.revokeScimToken(id, tenantId);
      await auditScim(db, tenantId, 'revoke', 'token', id, 'success');
      res.status(204).send();
    } catch (err) {
      logger.error({ err }, '[SCIM] revokeToken error');
      res.status(500).json({ error: 'Failed to revoke SCIM token' });
    }
  });

  // ── SCIM Users & Groups ────────────────────────────────────────────────────
  registerUserRoutes(router, db, scimAuth);
  registerGroupRoutes(router, db, scimAuth);

  return router;
}

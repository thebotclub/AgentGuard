/**
 * AgentGuard — SSO Configuration Routes
 *
 * POST   /api/v1/sso/configure — configure SSO provider for tenant
 * GET    /api/v1/sso/config    — get SSO config (secrets masked)
 * DELETE /api/v1/sso/config    — remove SSO config
 *
 * All endpoints require tenant auth + admin/owner role (JWT) or API key auth.
 * Client secrets are encrypted at rest using integration-crypto.ts.
 */
import { Router, Request, Response } from 'express';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import { requireRole } from '../lib/rbac.js';
import { encryptConfig, decryptConfig } from '../lib/integration-crypto.js';
import { SsoConfigureRequestSchema } from '../schemas.js';
import { requireFeature } from '../middleware/feature-gate.js';

export function createSsoRoutes(db: IDatabase, auth: AuthMiddleware): Router {
  const router = Router();

  // ── POST /api/v1/sso/configure ─────────────────────────────────────────────
  router.post(
    '/api/v1/sso/configure',
    auth.requireTenantAuth,
    requireFeature('sso'),
    requireRole('owner', 'admin'),
    async (req: Request, res: Response) => {
      const parsed = SsoConfigureRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
      }

      const { provider, domain, clientId, clientSecret } = parsed.data;
      const tenantId = req.tenantId!;

      // Encrypt client secret at rest
      const clientSecretEncrypted = encryptConfig({
        clientSecret,
        provider,
        tenantId,
      });

      try {
        const row = await db.upsertSsoConfig(
          tenantId,
          provider,
          domain,
          clientId,
          clientSecretEncrypted,
        );

        console.log(`[sso] tenant ${tenantId}: configured SSO provider ${provider}`);

        return res.status(200).json({
          id: row.id,
          tenantId: row.tenant_id,
          provider: row.provider,
          domain: row.domain,
          clientId: row.client_id,
          clientSecret: '***', // always masked in response
          createdAt: row.created_at,
          message: `SSO provider '${provider}' configured successfully.`,
        });
      } catch (err) {
        console.error('[sso/configure] error:', err instanceof Error ? err.message : err);
        return res.status(500).json({ error: 'Failed to configure SSO' });
      }
    },
  );

  // ── GET /api/v1/sso/config ────────────────────────────────────────────────
  router.get(
    '/api/v1/sso/config',
    auth.requireTenantAuth,
    requireFeature('sso'),
    requireRole('owner', 'admin'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;

      try {
        const row = await db.getSsoConfig(tenantId);
        if (!row) {
          return res.status(404).json({ error: 'No SSO configuration found for this tenant' });
        }

        // Return config with secret masked
        return res.json({
          id: row.id,
          tenantId: row.tenant_id,
          provider: row.provider,
          domain: row.domain,
          clientId: row.client_id,
          clientSecret: '***', // always masked
          createdAt: row.created_at,
        });
      } catch (err) {
        console.error('[sso/config GET] error:', err instanceof Error ? err.message : err);
        return res.status(500).json({ error: 'Failed to retrieve SSO config' });
      }
    },
  );

  // ── DELETE /api/v1/sso/config ─────────────────────────────────────────────
  router.delete(
    '/api/v1/sso/config',
    auth.requireTenantAuth,
    requireFeature('sso'),
    requireRole('owner', 'admin'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;

      try {
        const existing = await db.getSsoConfig(tenantId);
        if (!existing) {
          return res.status(404).json({ error: 'No SSO configuration found for this tenant' });
        }

        await db.deleteSsoConfig(tenantId);
        console.log(`[sso] tenant ${tenantId}: deleted SSO config (provider: ${existing.provider})`);

        return res.json({ message: 'SSO configuration removed successfully' });
      } catch (err) {
        console.error('[sso/config DELETE] error:', err instanceof Error ? err.message : err);
        return res.status(500).json({ error: 'Failed to delete SSO config' });
      }
    },
  );

  return router;
}

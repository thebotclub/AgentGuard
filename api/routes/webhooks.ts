/**
 * AgentGuard — Webhook Routes
 *
 * POST   /api/v1/webhooks      — register a webhook
 * GET    /api/v1/webhooks      — list tenant webhooks
 * DELETE /api/v1/webhooks/:id  — remove a webhook
 */
import { Router, Request, Response } from 'express';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';

// ── SSRF URL Validation ────────────────────────────────────────────────────
/**
 * Validate a webhook URL for SSRF prevention.
 * Returns null on success, or an error message string on failure.
 */
function validateWebhookUrl(rawUrl: string): string | null {
  // 1. Parse URL
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return 'url must be a valid HTTP/HTTPS URL';
  }

  // 2. Require HTTPS
  if (parsed.protocol !== 'https:') {
    return 'url must use HTTPS (HTTP is not allowed)';
  }

  const hostname = parsed.hostname.toLowerCase();

  // 3. Reject private/internal hostnames by name
  const privateHostnamePatterns = [
    /^localhost$/,
    /\.local$/,
    /\.internal$/,
    /\.localhost$/,
    /^local$/,
    /^internal$/,
  ];
  for (const pattern of privateHostnamePatterns) {
    if (pattern.test(hostname)) {
      return 'url must not point to a private or internal network address';
    }
  }

  // 4. Reject IPv4 literals in private ranges
  const ipv4Literal = hostname.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$|^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
  );
  if (ipv4Literal) {
    const a = parseInt(ipv4Literal[1] ?? ipv4Literal[5]!, 10);
    const b = parseInt(ipv4Literal[2] ?? ipv4Literal[6]!, 10);
    const c = parseInt(ipv4Literal[3] ?? ipv4Literal[7]!, 10);

    const isPrivate =
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 0);

    if (isPrivate) {
      return 'url must not point to a private or internal network address';
    }
  }

  // 5. Reject IPv6 loopback and ULA
  const ipv6 = hostname.replace(/^\[|\]$/g, '');
  if (ipv6 === '::1' || ipv6 === '0:0:0:0:0:0:0:1') {
    return 'url must not point to a private or internal network address';
  }
  if (/^(fc|fd)[0-9a-f]{0,2}:/i.test(ipv6)) {
    return 'url must not point to a private or internal network address';
  }

  return null; // valid
}

// ── Route Factory ──────────────────────────────────────────────────────────

export function createWebhookRoutes(
  db: IDatabase,
  auth: AuthMiddleware,
): Router {
  const router = Router();

  // ── POST /api/v1/webhooks ─────────────────────────────────────────────────
  router.post(
    '/api/v1/webhooks',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const { url, events, secret } = req.body ?? {};
      const tenantId = req.tenantId!;

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'url is required' });
      }
      if (url.length > 2000) {
        return res.status(400).json({ error: 'url too long (max 2000 chars)' });
      }

      const urlValidationError = validateWebhookUrl(url);
      if (urlValidationError) {
        return res.status(400).json({ error: urlValidationError });
      }

      let eventList: string[] = ['block', 'killswitch'];
      if (Array.isArray(events)) {
        const valid = ['block', 'killswitch', 'hitl', '*'];
        eventList = (events as unknown[]).filter(
          (e) => typeof e === 'string' && valid.includes(e),
        ) as string[];
        if (eventList.length === 0) {
          return res.status(400).json({
            error: 'events must be a non-empty array of: block, killswitch, hitl, *',
          });
        }
      }

      try {
        const row = await db.insertWebhook(
          tenantId,
          url,
          JSON.stringify(eventList),
          secret && typeof secret === 'string' ? secret : null,
        );

        res.status(201).json({
          id: row.id,
          tenantId: row.tenant_id,
          url: row.url,
          events: JSON.parse(row.events) as string[],
          active: row.active === 1,
          createdAt: row.created_at,
        });
      } catch (e) {
        console.error('[webhooks] insert error:', e instanceof Error ? e.message : e);
        res.status(500).json({ error: 'Failed to create webhook' });
      }
    },
  );

  // ── GET /api/v1/webhooks ──────────────────────────────────────────────────
  router.get(
    '/api/v1/webhooks',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const rows = await db.getWebhooksByTenant(tenantId);
      res.json({
        webhooks: rows.map((r) => ({
          id: r.id,
          url: r.url,
          events: JSON.parse(r.events) as string[],
          active: r.active === 1,
          createdAt: r.created_at,
        })),
      });
    },
  );

  // ── DELETE /api/v1/webhooks/:id ───────────────────────────────────────────
  router.delete(
    '/api/v1/webhooks/:id',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const webhookId = req.params['id'] as string;

      if (!webhookId || typeof webhookId !== 'string') {
        return res.status(400).json({ error: 'Invalid webhook id' });
      }

      const existing = await db.getWebhookById(webhookId, tenantId);
      if (!existing) {
        return res.status(404).json({ error: 'Webhook not found' });
      }

      await db.deleteWebhook(webhookId, tenantId);
      res.json({ id: webhookId, deleted: true });
    },
  );

  return router;
}

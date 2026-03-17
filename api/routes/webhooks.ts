/**
 * AgentGuard — Webhook Routes
 *
 * POST   /api/v1/webhooks      — register a webhook
 * GET    /api/v1/webhooks      — list tenant webhooks
 * DELETE /api/v1/webhooks/:id  — remove a webhook
 */
import { Router, Request, Response } from 'express';
import dns from 'node:dns/promises';
import crypto from 'node:crypto';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import { WEBHOOK_EVENT_NAMES } from '../schemas.js';

// ── SSRF URL Validation ────────────────────────────────────────────────────

/**
 * Check if an IPv4 address string is in a private/reserved range.
 */
function isPrivateIPv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = parseInt(m[1]!, 10);
  const b = parseInt(m[2]!, 10);
  const _c = parseInt(m[3]!, 10); // third octet — parsed for future subnet checks (e.g. 192.168.x.0/24)
  return (
    a === 0 ||                               // 0.0.0.0/8
    a === 10 ||                              // 10.0.0.0/8 private
    a === 127 ||                             // 127.0.0.0/8 loopback
    (a === 100 && b >= 64 && b <= 127) ||   // 100.64.0.0/10 CGNAT
    (a === 169 && b === 254) ||              // 169.254.0.0/16 link-local
    (a === 172 && b >= 16 && b <= 31) ||    // 172.16.0.0/12 private
    (a === 192 && b === 168)                 // 192.168.0.0/16 private
  );
}

/**
 * Check if an IPv6 address string is in a private/reserved range.
 * Input should be the bare address (brackets stripped).
 */
function isPrivateIPv6(addr: string): boolean {
  const lower = addr.toLowerCase();
  // Loopback
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
  // Link-local: fe80::/10
  if (/^fe[89ab][0-9a-f]:/i.test(lower) || lower.startsWith('fe80:')) return true;
  // ULA: fc00::/7 (fc and fd prefixes)
  if (/^f[cd][0-9a-f]{2}:/i.test(lower)) return true;

  // IPv4-mapped IPv6 — dotted decimal form: ::ffff:127.0.0.1
  const v4mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4mapped) return isPrivateIPv4(v4mapped[1]!);

  // IPv4-mapped IPv6 — hex form: ::ffff:7f00:1 (Node normalizes to this)
  const v4hex = lower.match(/^(?:0+:)*::?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (v4hex) {
    const hi = parseInt(v4hex[1]!, 16);
    const lo = parseInt(v4hex[2]!, 16);
    const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateIPv4(ipv4);
  }

  // Catch-all: block ANY address containing :ffff: segment (IPv4-mapped)
  if (/(?:^|:)ffff:[0-9a-f]/i.test(lower)) return true;

  return false;
}

/**
 * Check if a resolved IP (v4 or v6) is private/internal.
 */
function isPrivateIP(ip: string): boolean {
  // Detect IPv6 by presence of ':' 
  if (ip.includes(':')) return isPrivateIPv6(ip);
  return isPrivateIPv4(ip);
}

/**
 * Patterns for hostname-based bypass attempts.
 * Blocks: localtest.me, nip.io, sslip.io, xip.io, hex IPs like 0x7f000001, octal IPs.
 */
const BLOCKED_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.localhost$/i,
  /^local$/i,
  /^internal$/i,
  /\.localtest\.me$/i,       // localtest.me resolves to 127.0.0.1
  /^localtest\.me$/i,
  /\.nip\.io$/i,             // nip.io / xip.io DNS rebinding
  /\.xip\.io$/i,
  /\.sslip\.io$/i,
  /^0x[0-9a-f]+$/i,          // hex IP like 0x7f000001
  /^0\d+\.\d+\.\d+\.\d+$/,  // octal first octet like 0177.0.0.1
  /^::$/,                    // IPv6 all-zeros
  /^\[::\]$/,
];

const BLOCKED_HOSTNAMES_EXACT = new Set([
  '0.0.0.0',
  '[::]',
  '::',
  'ip6-localhost',
  'ip6-loopback',
]);

/**
 * Validate a webhook URL for SSRF prevention.
 * Returns null on success, or an error message string on failure.
 * This is an async function to support DNS resolution checks.
 */
async function validateWebhookUrl(rawUrl: string): Promise<string | null> {
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

  // 3. Reject exact blocked hostnames
  if (BLOCKED_HOSTNAMES_EXACT.has(hostname)) {
    return 'url must not point to a private or internal network address';
  }

  // 4. Reject private/internal hostnames by pattern
  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      return 'url must not point to a private or internal network address';
    }
  }

  // 5. Strip IPv6 brackets and check IPv6 literals directly
  const bareHostname = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

  // Check if it's an IPv4 literal
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bareHostname)) {
    if (isPrivateIPv4(bareHostname)) {
      return 'url must not point to a private or internal network address';
    }
    // Public IPv4 literal — no DNS needed, but still pass through DNS block check below
    return null;
  }

  // Check if it's an IPv6 literal
  if (bareHostname.includes(':')) {
    if (isPrivateIPv6(bareHostname)) {
      return 'url must not point to a private or internal network address';
    }
    // Public IPv6 literal
    return null;
  }

  // 6. DNS resolution check — resolve hostname and verify all IPs are public
  // This prevents DNS rebinding attacks and hostname alias bypasses
  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records || records.length === 0) {
      return 'url hostname could not be resolved';
    }
    for (const record of records) {
      if (isPrivateIP(record.address)) {
        return `url resolves to a private or internal IP address (${record.address})`;
      }
    }
  } catch {
    // DNS resolution failed — reject to be safe
    return 'url hostname could not be resolved';
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

      const urlValidationError = await validateWebhookUrl(url);
      if (urlValidationError) {
        return res.status(400).json({ error: urlValidationError });
      }

      const validEvents: readonly string[] = WEBHOOK_EVENT_NAMES;
      let eventList: string[] = ['block', 'killswitch'];
      if (Array.isArray(events)) {
        eventList = (events as unknown[]).filter(
          (e) => typeof e === 'string' && validEvents.includes(e),
        ) as string[];
        if (eventList.length === 0) {
          return res.status(400).json({
            error: `events must be a non-empty array of valid event names: ${WEBHOOK_EVENT_NAMES.join(', ')}`,
          });
        }
      }

      try {
        const row = await db.insertWebhook(
          tenantId,
          url,
          JSON.stringify(eventList),
          secret && typeof secret === 'string'
            ? crypto.createHash('sha256').update(secret).digest('hex')
            : null,
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

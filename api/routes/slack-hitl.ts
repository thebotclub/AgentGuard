/**
 * AgentGuard — Slack HITL Integration Routes
 *
 * POST   /api/v1/integrations/slack          — configure Slack integration (tenant auth)
 * GET    /api/v1/integrations/slack          — get Slack config (signing secret redacted) (tenant auth)
 * DELETE /api/v1/integrations/slack          — remove Slack integration (tenant auth)
 * POST   /api/v1/integrations/slack/callback — Slack interactive component callback (no auth, HMAC-verified)
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import { encryptConfig, decryptConfig } from '../lib/integration-crypto.js';
import { buildResolvedSlackMessage } from '../lib/slack-hitl.js';

// ── Zod Schemas ───────────────────────────────────────────────────────────

export const SlackIntegrationConfigSchema = z.object({
  webhookUrl: z
    .string({ error: 'webhookUrl is required' })
    .min(1, 'webhookUrl is required')
    .url('webhookUrl must be a valid URL')
    .refine((u) => u.startsWith('https://hooks.slack.com/'), {
      message: 'webhookUrl must be a Slack webhook URL (https://hooks.slack.com/...)',
    }),
  signingSecret: z
    .string({ error: 'signingSecret is required' })
    .min(10, 'signingSecret too short (minimum 10 characters)'),
  channel: z.string().max(100).optional(),
  autoRejectMinutes: z.number().int().min(1).max(1440).default(30),
});

export type SlackIntegrationConfig = z.infer<typeof SlackIntegrationConfigSchema>;

// ── Slack Signature Verification ──────────────────────────────────────────

const SLACK_MAX_AGE_SECONDS = 5 * 60; // 5 minutes — replay protection

/**
 * Verify Slack request signature.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 *
 * Returns null on success, or an error string on failure.
 */
function verifySlackSignature(
  signingSecret: string,
  rawBody: Buffer | string,
  timestampHeader: string | undefined,
  signatureHeader: string | undefined,
): string | null {
  if (!timestampHeader || !signatureHeader) {
    return 'Missing X-Slack-Request-Timestamp or X-Slack-Signature header';
  }

  const ts = parseInt(timestampHeader, 10);
  if (isNaN(ts)) {
    return 'Invalid X-Slack-Request-Timestamp';
  }

  // Replay protection: reject if older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > SLACK_MAX_AGE_SECONDS) {
    return `Request timestamp too old (${Math.abs(now - ts)}s ago) — possible replay attack`;
  }

  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const sigBasestring = `v0:${timestampHeader}:${body}`;

  const expected =
    'v0=' +
    crypto.createHmac('sha256', signingSecret).update(sigBasestring).digest('hex');

  // Timing-safe comparison
  if (expected.length !== signatureHeader.length) {
    return 'Slack signature verification failed';
  }
  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(signatureHeader, 'utf8');
  if (!crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
    return 'Slack signature verification failed';
  }

  return null;
}

// ── Slack Integration Config — stored config shape ────────────────────────

interface StoredSlackConfig {
  webhookUrl: string;
  signingSecretHash: string; // SHA-256 of the raw secret (one-way, for lookup/verify)
  signingSecretEncrypted: string; // AES-GCM encrypted raw secret (needed for HMAC verification)
  channel?: string;
  autoRejectMinutes: number;
}

// ── Route Factory ─────────────────────────────────────────────────────────

export function createSlackHitlRoutes(db: IDatabase, auth: AuthMiddleware): Router {
  const router = Router();

  // ── POST /api/v1/integrations/slack — configure ────────────────────────

  router.post(
    '/api/v1/integrations/slack',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;

      const parsed = SlackIntegrationConfigSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const firstError = parsed.error.issues[0];
        return res.status(400).json({
          error: firstError?.message ?? 'Invalid request body',
        });
      }

      const { webhookUrl, signingSecret, channel, autoRejectMinutes } = parsed.data;

      // Hash the signing secret (for comparison later; one-way)
      const signingSecretHash = crypto
        .createHash('sha256')
        .update(signingSecret)
        .digest('hex');

      // Encrypt the raw signing secret (needed for HMAC verification of callbacks)
      const signingSecretEncryptedObj = encryptConfig({ secret: signingSecret });

      const storedConfig: StoredSlackConfig = {
        webhookUrl,
        signingSecretHash,
        signingSecretEncrypted: signingSecretEncryptedObj,
        channel,
        autoRejectMinutes,
      };

      try {
        await db.insertIntegration(tenantId, 'slack', encryptConfig(storedConfig as unknown as Record<string, unknown>));

        res.status(201).json({
          type: 'slack',
          webhookUrl,
          channel: channel ?? null,
          autoRejectMinutes,
          configured: true,
          // signingSecret intentionally NEVER returned
        });
      } catch (e) {
        console.error('[slack-hitl] insert integration error:', e);
        res.status(500).json({ error: 'Failed to save Slack integration' });
      }
    },
  );

  // ── GET /api/v1/integrations/slack — get config (no secret) ────────────

  router.get(
    '/api/v1/integrations/slack',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;

      try {
        const row = await db.getIntegration(tenantId, 'slack');
        if (!row) {
          return res.status(404).json({ error: 'Slack integration not configured' });
        }

        const config = decryptConfig(row.config_encrypted) as unknown as StoredSlackConfig;

        res.json({
          type: 'slack',
          webhookUrl: config.webhookUrl,
          channel: config.channel ?? null,
          autoRejectMinutes: config.autoRejectMinutes,
          configured: true,
          createdAt: row.created_at,
          // signingSecret intentionally NEVER returned
          // signingSecretHash is internal — do not expose
        });
      } catch (e) {
        console.error('[slack-hitl] get integration error:', e);
        res.status(500).json({ error: 'Failed to retrieve Slack integration' });
      }
    },
  );

  // ── DELETE /api/v1/integrations/slack — remove ─────────────────────────

  router.delete(
    '/api/v1/integrations/slack',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;

      try {
        const existing = await db.getIntegration(tenantId, 'slack');
        if (!existing) {
          return res.status(404).json({ error: 'Slack integration not configured' });
        }

        await db.deleteIntegration(tenantId, 'slack');
        res.json({ type: 'slack', deleted: true });
      } catch (e) {
        console.error('[slack-hitl] delete integration error:', e);
        res.status(500).json({ error: 'Failed to delete Slack integration' });
      }
    },
  );

  // ── POST /api/v1/integrations/slack/callback — Slack interactive ────────
  // No tenant auth — verified by Slack HMAC signature.
  // Express must parse raw body for signature verification.

  router.post(
    '/api/v1/integrations/slack/callback',
    // NOTE: We need raw body for HMAC; use express.urlencoded or express.text
    // The callback receives application/x-www-form-urlencoded from Slack.
    // We handle raw body extraction in the handler using req body buffering.
    async (req: Request, res: Response) => {
      // Slack sends payload as URL-encoded form: payload=<JSON>
      // The body parser has already parsed it if Content-Type is application/json,
      // but Slack sends application/x-www-form-urlencoded.
      // We need the raw body for signature verification.
      // The rawBody is attached by the raw body middleware (set up in server.ts).

      const rawBody: string | undefined = (req as Request & { rawBody?: string }).rawBody;
      const timestamp = req.headers['x-slack-request-timestamp'] as string | undefined;
      const signature = req.headers['x-slack-signature'] as string | undefined;

      // Parse the URL-encoded payload
      let payloadStr: string | undefined;
      if (req.body && typeof req.body === 'object' && 'payload' in req.body) {
        payloadStr = (req.body as { payload: string }).payload;
      } else if (typeof req.body === 'string') {
        // Try to extract payload from raw body
        try {
          const params = new URLSearchParams(req.body);
          payloadStr = params.get('payload') ?? undefined;
        } catch {
          // ignore
        }
      }

      if (!payloadStr) {
        return res.status(400).json({ error: 'Missing payload' });
      }

      let slackPayload: Record<string, unknown>;
      try {
        slackPayload = JSON.parse(payloadStr) as Record<string, unknown>;
      } catch {
        return res.status(400).json({ error: 'Invalid payload JSON' });
      }

      // Extract the approval ID from the action value
      const actions = slackPayload['actions'] as Array<Record<string, unknown>> | undefined;
      const action = actions?.[0];
      if (!action) {
        return res.status(400).json({ error: 'No action in payload' });
      }

      const actionId = action['action_id'] as string | undefined;
      const approvalId = action['value'] as string | undefined;

      if (!approvalId || !actionId) {
        return res.status(400).json({ error: 'Missing action_id or value' });
      }

      if (!['hitl_approve', 'hitl_reject'].includes(actionId)) {
        return res.status(400).json({ error: `Unknown action_id: ${actionId}` });
      }

      // We need the tenant for this approval to find the right signing secret.
      // Look up the approval by ID (no tenant filter — scan by id, then use tenant_id).
      // Security: the HMAC check ensures this request genuinely came from Slack.
      // We use the approval to find the tenant, then verify with that tenant's secret.

      let tenantId: string;
      try {
        // Use raw SQL since getApproval requires tenantId
        const approvalRow = await db.get<{ id: string; tenant_id: string }>(
          'SELECT id, tenant_id FROM approvals WHERE id = ?',
          [approvalId],
        );
        if (!approvalRow) {
          console.warn(`[slack-hitl] callback: approval ${approvalId} not found`);
          return res.status(200).json({ error: 'Approval not found' }); // 200 to avoid Slack retries
        }
        tenantId = approvalRow.tenant_id;
      } catch (e) {
        console.error('[slack-hitl] callback DB lookup error:', e);
        return res.status(200).json({ error: 'Internal error' });
      }

      // Fetch integration config for this tenant
      let signingSecret: string;
      try {
        const integrationRow = await db.getIntegration(tenantId, 'slack');
        if (!integrationRow) {
          console.warn(`[slack-hitl] callback: no Slack integration for tenant ${tenantId}`);
          return res.status(200).json({ error: 'Integration not configured' });
        }
        const config = decryptConfig(integrationRow.config_encrypted) as unknown as StoredSlackConfig;
        // Decrypt the raw signing secret for HMAC verification
        const secretObj = decryptConfig(config.signingSecretEncrypted) as { secret: string };
        signingSecret = secretObj.secret;
      } catch (e) {
        console.error('[slack-hitl] callback: failed to load integration config:', e);
        return res.status(200).json({ error: 'Integration config error' });
      }

      // MANDATORY HMAC verification
      const bodyForSig = rawBody ?? (typeof req.body === 'string' ? req.body : `payload=${encodeURIComponent(payloadStr)}`);
      const sigError = verifySlackSignature(signingSecret, bodyForSig, timestamp, signature);
      if (sigError) {
        console.warn(`[slack-hitl] signature verification failed: ${sigError}`);
        return res.status(401).json({ error: 'Signature verification failed' });
      }

      // Resolve the approval
      const newStatus: 'approved' | 'denied' = actionId === 'hitl_approve' ? 'approved' : 'denied';
      const slackUser = (slackPayload['user'] as Record<string, string> | undefined)?.id ?? 'slack-user';
      const resolvedBy = `slack:${slackUser}`;

      try {
        const approval = await db.getApproval(approvalId, tenantId);
        if (!approval) {
          return res.status(200).json({ response_action: 'clear', text: 'Approval not found.' });
        }
        if (approval.status !== 'pending') {
          // Already resolved — show current state
          return res.status(200).json({
            ...buildResolvedSlackMessage(approval),
            response_action: 'update',
          });
        }

        await db.resolveApproval(approvalId, tenantId, newStatus, resolvedBy);

        // Fetch updated approval for the response message
        const updatedApproval = await db.getApproval(approvalId, tenantId);
        if (!updatedApproval) {
          return res.status(200).json({ text: `${newStatus === 'approved' ? '✅' : '❌'} ${newStatus}` });
        }

        // Respond with the updated message (removes buttons)
        const updatedMsg = buildResolvedSlackMessage(updatedApproval);
        return res.status(200).json({
          ...updatedMsg,
          response_action: 'update',
        });
      } catch (e) {
        console.error('[slack-hitl] callback resolve error:', e);
        return res.status(200).json({ text: 'Error processing approval.' });
      }
    },
  );

  return router;
}

/**
 * Get the Slack integration config for a tenant (decrypted).
 * Returns null if not configured.
 * Used internally by the approval flow.
 */
export async function getSlackIntegrationConfig(
  db: IDatabase,
  tenantId: string,
): Promise<StoredSlackConfig | null> {
  try {
    const row = await db.getIntegration(tenantId, 'slack');
    if (!row) return null;
    return decryptConfig(row.config_encrypted) as unknown as StoredSlackConfig;
  } catch {
    return null;
  }
}

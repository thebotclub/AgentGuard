/**
 * AgentGuard — PII Scan Routes
 *
 * POST /api/v1/pii/scan — standalone PII detection and redaction
 */
import { Router, Request, Response } from 'express';
import { PIIScanRequestSchema } from '../schemas.js';
import { defaultDetector } from '../lib/pii/regex-detector.js';
import { storeAuditEvent } from './audit.js';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';

const NOOP_PREV_HASH = '';

export function createPIIRoutes(
  db: IDatabase,
  auth: AuthMiddleware,
): Router {
  const router = Router();

  // ── POST /api/v1/pii/scan ─────────────────────────────────────────────────
  router.post(
    '/api/v1/pii/scan',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const agentId = req.agent?.id ?? null;

      const parsed = PIIScanRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]!.message });
      }

      const { content, text, dryRun } = parsed.data;
      const inputText = (content ?? text)!; // at least one is guaranteed by the refine() check

      const result = await defaultDetector.scan(inputText);

      // Omit raw entity text from response — callers see type/position/score only
      const safeEntities = result.entities.map(({ text: _text, ...rest }) => rest);

      if (!dryRun && result.entitiesFound > 0) {
        // Log to audit trail with redacted content only — never store original PII
        await storeAuditEvent(
          db,
          tenantId,
          null,
          'pii.scan',
          'monitor',
          'PII_DETECTED',
          0,
          `PII scan: ${result.entitiesFound} entit${result.entitiesFound === 1 ? 'y' : 'ies'} detected and redacted`,
          0,
          NOOP_PREV_HASH,
          agentId,
        );
      }

      return res.json({
        entitiesFound: result.entitiesFound,
        entities: safeEntities,
        redactedContent: result.redactedContent,
        dryRun: dryRun ?? false,
      });
    },
  );

  return router;
}

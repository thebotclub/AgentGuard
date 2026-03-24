/**
 * Audit log routes — /v1/audit
 *
 * GET /audit            — query audit events (paginated, filterable)
 * GET /audit/export     — streaming CSV/JSON export
 * GET /audit/:eventId   — single event detail
 * GET /audit/sessions/:sessionId/verify — hash chain integrity verification
 */
import { Hono } from 'hono';
export declare const auditRouter: Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
//# sourceMappingURL=audit.d.ts.map
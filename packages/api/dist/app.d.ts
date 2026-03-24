/**
 * AgentGuard Control Plane API — Hono application.
 * Mounts all routes with middleware chain.
 *
 * API Versioning strategy:
 *   - All canonical routes live under /v1/
 *   - Legacy unversioned routes 308-redirect → /v1/
 *   - Version negotiation via Accept: application/vnd.agentguard.v1+json
 *   - Deprecation / Sunset headers signal future migration (RFC 8594)
 */
import { Hono } from 'hono';
export declare function createApp(): Hono;
//# sourceMappingURL=app.d.ts.map
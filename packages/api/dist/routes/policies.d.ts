/**
 * Policy CRUD routes — /v1/policies
 *
 * GET    /policies               — list policies
 * POST   /policies               — create policy (parse YAML, compile, persist)
 * GET    /policies/:id           — get policy
 * PUT    /policies/:id           — update policy (new version)
 * DELETE /policies/:id           — soft-delete
 * GET    /policies/:id/versions  — version history
 * GET    /policies/:id/versions/:v — specific version + YAML
 * POST   /policies/:id/activate  — activate version (invalidates Redis cache)
 * POST   /policies/:id/test      — dry-run evaluation against test fixtures
 * GET    /sdk/bundle             — serve compiled bundle for SDK (agent key auth)
 */
import { Hono } from 'hono';
export declare const policiesRouter: Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
//# sourceMappingURL=policies.d.ts.map
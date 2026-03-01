/**
 * Kill switch routes
 * POST /v1/killswitch/halt/:agentId
 * POST /v1/killswitch/resume/:agentId
 * GET  /v1/killswitch/status/:agentId
 */
import { Hono } from 'hono';
export declare const killswitchRouter: Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
//# sourceMappingURL=killswitch.d.ts.map
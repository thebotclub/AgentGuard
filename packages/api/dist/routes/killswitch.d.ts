/**
 * Kill switch routes
 *
 * POST /v1/killswitch/halt/:agentId   — halt specific agent
 * POST /v1/killswitch/halt-all        — halt all tenant agents
 * POST /v1/killswitch/resume/:agentId — resume agent
 * GET  /v1/killswitch/status/:agentId — check kill switch state (SDK polls this)
 * GET  /v1/killswitch/commands/:agentId — list historical commands
 */
import { Hono } from 'hono';
export declare const killswitchRouter: Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
//# sourceMappingURL=killswitch.d.ts.map
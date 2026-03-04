/**
 * AgentGuard — Zod Input Validation Schemas
 *
 * Provides validated, type-safe parsing for all request bodies.
 * Error messages are intentionally kept compatible with the legacy manual checks
 * so that existing tests continue to pass.
 */
import { z } from 'zod';

// ── POST /api/v1/evaluate ─────────────────────────────────────────────────
export const EvaluateRequestSchema = z.object({
  tool: z.string({ error: 'tool is required and must be a string' })
    .min(1, 'tool is required and must be a string')
    .max(200, 'tool name too long (max 200 chars)')
    .regex(
      /^[a-zA-Z0-9_.\-:]+$/,
      'tool name may only contain letters, digits, underscore, hyphen, dot, or colon',
    ),
  params: z.record(z.string(), z.unknown()).optional().default({}),
  agentId: z.string().optional(),
  sessionId: z.string().optional(),
  context: z.object({
    userId: z.string().optional(),
    environment: z.string().optional(),
  }).optional(),
});

// ── POST /api/v1/signup ───────────────────────────────────────────────────
export const SignupRequestSchema = z.object({
  name: z.string({ error: 'name is required' })
    .min(1, 'name is required')
    .max(200),
  email: z.string({ error: 'email is required' })
    .min(1, 'email is required')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'),
});

// ── POST /api/v1/agents ───────────────────────────────────────────────────
export const CreateAgentRequestSchema = z.object({
  name: z.string({ error: 'name is required' })
    .min(1, 'name is required')
    .max(200, 'name too long (max 200 chars)'),
  framework: z.string().optional(),
  description: z.string().max(1000).optional(),
  policyScope: z.array(z.string()).optional(),
  // legacy snake_case alias used in existing routes
  policy_scope: z.array(z.string()).optional(),
});

// ── POST /api/v1/agents/:id/validate ─────────────────────────────────────
export const ValidateAgentRequestSchema = z.object({
  declaredTools: z.array(z.string().min(1))
    .min(1, 'declaredTools must be a non-empty array of tool name strings'),
});

// ── POST /api/v1/mcp/admit ───────────────────────────────────────────────
export const McpAdmitRequestSchema = z.object({
  serverUrl: z.string({ error: 'serverUrl is required' })
    .min(1, 'serverUrl is required'),
  tools: z.array(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    inputSchema: z.record(z.string(), z.unknown()).optional(),
  })).min(1, 'tools must be a non-empty array of { name, description?, inputSchema? }'),
});

// ── POST /api/v1/killswitch (tenant & admin) ──────────────────────────────
export const KillswitchRequestSchema = z.object({
  active: z.boolean().optional(),
});

// ── POST /api/v1/webhooks ─────────────────────────────────────────────────
export const CreateWebhookRequestSchema = z.object({
  url: z.string({ error: 'url is required' })
    .min(1, 'url is required')
    .max(2000, 'url too long (max 2000 chars)'),
  events: z.array(z.enum(['block', 'killswitch', 'hitl', '*'])).optional(),
  secret: z.string().optional(),
});

// ── PUT /api/v1/webhooks/:id ─────────────────────────────────────────────
export const UpdateWebhookRequestSchema = z.object({
  url: z.string().min(1).max(2000, 'url too long (max 2000 chars)').optional(),
  events: z.array(z.enum(['block', 'killswitch', 'hitl', '*'])).optional(),
  secret: z.string().optional(),
  active: z.boolean().optional(),
});

// ── POST /api/v1/playground/session ───────────────────────────────────────
export const PlaygroundSessionRequestSchema = z.object({
  policy: z.record(z.string(), z.unknown()).optional(),
});

// ── POST /api/v1/rate-limits ───────────────────────────────────────────────
export const RateLimitConfigRequestSchema = z.object({
  agentId: z.string().max(100).optional(),
  windowSeconds: z.number({ error: 'windowSeconds is required and must be an integer between 1 and 86400' })
    .int()
    .min(1, 'windowSeconds must be at least 1')
    .max(86400, 'windowSeconds must be at most 86400'),
  maxRequests: z.number({ error: 'maxRequests is required and must be an integer between 1 and 1000000' })
    .int()
    .min(1, 'maxRequests must be at least 1')
    .max(1000000, 'maxRequests must be at most 1000000'),
});

// ── POST /api/v1/costs/track ──────────────────────────────────────────────
export const CostTrackRequestSchema = z.object({
  agentId: z.string().max(100).optional(),
  tool: z.string({ error: 'tool is required (string, 1–200 chars)' })
    .min(1, 'tool is required')
    .max(200, 'tool too long (max 200 chars)'),
  estimatedCostCents: z.number().min(0).optional(),
  currency: z.string().max(10).default('USD'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ── PUT /api/v1/mcp/config ────────────────────────────────────────────────
export const McpConfigRequestSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(200).optional(),
  upstreamUrl: z.string().url().optional(),
  transport: z.enum(['sse', 'stdio']).optional(),
  agentId: z.string().max(100).optional(),
  actionMapping: z.record(z.string(), z.string()).optional(),
  defaultAction: z.enum(['allow', 'block']).optional(),
  enabled: z.boolean().optional(),
});

// ── Type inference helpers ─────────────────────────────────────────────────
// Export schemas following naming convention: Schema suffix for Zod schema,
// aliased export for backwards compatibility
export const EvaluateRequest = EvaluateRequestSchema;
export const SignupRequest = SignupRequestSchema;
export const CreateAgentRequest = CreateAgentRequestSchema;
export const ValidateAgentRequest = ValidateAgentRequestSchema;
export const McpAdmitRequest = McpAdmitRequestSchema;
export const KillswitchRequest = KillswitchRequestSchema;
export const CreateWebhookRequest = CreateWebhookRequestSchema;
export const UpdateWebhookRequest = UpdateWebhookRequestSchema;
export const PlaygroundSessionRequest = PlaygroundSessionRequestSchema;
export const RateLimitConfigRequest = RateLimitConfigRequestSchema;
export const CostTrackRequest = CostTrackRequestSchema;
export const McpConfigRequest = McpConfigRequestSchema;

export type EvaluateRequest = z.infer<typeof EvaluateRequestSchema>;
export type SignupRequest = z.infer<typeof SignupRequestSchema>;
export type CreateAgentRequest = z.infer<typeof CreateAgentRequestSchema>;
export type ValidateAgentRequest = z.infer<typeof ValidateAgentRequestSchema>;
export type McpAdmitRequest = z.infer<typeof McpAdmitRequestSchema>;
export type KillswitchRequest = z.infer<typeof KillswitchRequestSchema>;
export type CreateWebhookRequest = z.infer<typeof CreateWebhookRequestSchema>;
export type UpdateWebhookRequest = z.infer<typeof UpdateWebhookRequestSchema>;
export type PlaygroundSessionRequest = z.infer<typeof PlaygroundSessionRequestSchema>;
export type RateLimitConfigRequest = z.infer<typeof RateLimitConfigRequestSchema>;
export type CostTrackRequest = z.infer<typeof CostTrackRequestSchema>;
export type McpConfigRequest = z.infer<typeof McpConfigRequestSchema>;

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
  messageHistory: z.array(z.object({
    role: z.string(),
    content: z.string(),
  })).optional(),
});

// ── POST /api/v1/evaluate/batch ──────────────────────────────────────────

const BatchCallSchema = z.object({
  tool: z.string({ error: 'tool is required and must be a string' })
    .min(1, 'tool is required and must be a string')
    .max(200, 'tool name too long (max 200 chars)')
    .regex(
      /^[a-zA-Z0-9_.\-:]+$/,
      'tool name may only contain letters, digits, underscore, hyphen, dot, or colon',
    ),
  params: z.record(z.string(), z.unknown()).optional().default({}),
  context: z.record(z.string(), z.unknown()).optional(),
});

export const BatchEvaluateRequestSchema = z.object({
  agentId: z.string().max(200).optional(),
  sessionId: z.string().max(200).optional(),
  messageHistory: z.array(z.object({
    role: z.string(),
    content: z.string(),
  })).optional(),
  calls: z.array(BatchCallSchema)
    .min(1, 'calls must contain at least 1 item')
    .max(50, 'calls must contain at most 50 items (max batch size)'),
});

export type BatchEvaluateRequest = z.infer<typeof BatchEvaluateRequestSchema>;
export const BatchEvaluateRequest = BatchEvaluateRequestSchema;

// ── POST /api/v1/signup ───────────────────────────────────────────────────
export const SignupRequestSchema = z.object({
  name: z.string({ error: 'name is required' })
    .min(1, 'name is required')
    .max(200),
  email: z.string()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format')
    .optional()
    .default(''),
});

// ── Agent name sanitization ────────────────────────────────────────────────
// Allowlist: alphanumeric, spaces, hyphens, underscores, dots, parentheses
// Rejects HTML tags, script injections, SQL injection patterns
// Deliberately excludes: <, >, ", ', `, ;, :, /, \, =, (, ) for security
const SAFE_AGENT_NAME_RE = /^[a-zA-Z0-9 \-_.()]+$/;

// Patterns that indicate XSS / injection attempts — reject before allowlist check
const DANGEROUS_NAME_PATTERNS: RegExp[] = [
  /[<>]/,                    // HTML tags
  /javascript\s*:/i,         // javascript: protocol
  /on\w+\s*=/i,              // event handlers like onerror=
  /['";`]/,                  // SQL injection delimiters
  /--/,                      // SQL comment
  /\/\*/,                    // SQL block comment
  /union\s+select/i,         // SQL UNION SELECT
  /drop\s+table/i,           // SQL DROP TABLE
  /script/i,                 // "script" keyword itself
  /eval\s*\(/i,              // eval()
  /expression\s*\(/i,        // CSS expression()
];

function sanitizeAgentName(name: string): string {
  // Strip HTML tags
  const stripped = name.replace(/<[^>]*>/g, '').trim();
  return stripped;
}

function isValidAgentName(name: string): boolean {
  // Check for dangerous patterns in the ORIGINAL name (before stripping)
  // This catches cases like <script>alert(1)</script> → strips to "alert(1)"
  // We want to reject the original if it contained script-like content
  return SAFE_AGENT_NAME_RE.test(name) && !DANGEROUS_NAME_PATTERNS.some((p) => p.test(name));
}

// ── POST /api/v1/agents ───────────────────────────────────────────────────
export const CreateAgentRequestSchema = z.object({
  name: z.string({ error: 'name is required' })
    .min(1, 'name is required')
    .max(200, 'name too long (max 200 chars)')
    .refine(
      (v) => isValidAgentName(v.trim()),
      'Agent name contains invalid characters. Use only letters, digits, spaces, hyphens, underscores, and dots.',
    )
    .transform((v) => v.trim()),
  framework: z.string().optional(),
  description: z.string().max(1000).optional()
    .transform((v) => v ? v.replace(/<[^>]*>/g, '').replace(/javascript\s*:/gi, '').trim() : v),
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
// Strictly only accepts {"active": true} or {"active": false}.
// Unknown fields (e.g. action: "status") are rejected with 400.
export const KillswitchRequestSchema = z
  .object({
    active: z.boolean({ error: '"active" must be a boolean (true or false)' }),
  })
  .strict();

// ── Webhook event names ───────────────────────────────────────────────────
// Accepted values: "all" (alias for "*"), "evaluate", "block", "allow",
// "flag", "approval", "killswitch", "hitl", "*"
export const WEBHOOK_EVENT_NAMES = [
  'all',        // alias for "*" — receive all events
  'evaluate',   // every evaluate call (allow & block)
  'block',      // tool call blocked by policy
  'allow',      // tool call allowed by policy
  'flag',       // tool call flagged / monitored
  'approval',   // HITL approval requested or resolved
  'killswitch', // kill switch toggled
  'hitl',       // human-in-the-loop event (alias for approval)
  '*',          // wildcard — same as "all"
] as const;
export type WebhookEventName = (typeof WEBHOOK_EVENT_NAMES)[number];

// ── POST /api/v1/webhooks ─────────────────────────────────────────────────
export const CreateWebhookRequestSchema = z.object({
  url: z.string({ error: 'url is required' })
    .min(1, 'url is required')
    .max(2000, 'url too long (max 2000 chars)'),
  events: z.array(z.enum(WEBHOOK_EVENT_NAMES, {
    error: `events must contain valid event names: ${WEBHOOK_EVENT_NAMES.join(', ')}`,
  })).optional(),
  secret: z.string().optional(),
});

// ── PUT /api/v1/webhooks/:id ─────────────────────────────────────────────
export const UpdateWebhookRequestSchema = z.object({
  url: z.string().min(1).max(2000, 'url too long (max 2000 chars)').optional(),
  events: z.array(z.enum(WEBHOOK_EVENT_NAMES, {
    error: `events must contain valid event names: ${WEBHOOK_EVENT_NAMES.join(', ')}`,
  })).optional(),
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

// ── POST /api/v1/mcp/evaluate (mcp-policy) ───────────────────────────────
export const McpEvaluateRequestSchema = z.object({
  server: z.string().max(200).optional(),
  tool: z.string({ error: 'tool is required and must be a string' })
    .min(1, 'tool is required and must be a string')
    .max(200, 'tool name too long (max 200 chars)'),
  arguments: z.record(z.string(), z.unknown()).optional().default({}),
  agentId: z.string().max(200).optional(),
});

// ── POST /api/v1/mcp/servers ──────────────────────────────────────────────
export const RegisterMcpServerRequestSchema = z.object({
  name: z.string({ error: 'name is required' })
    .min(1, 'name is required')
    .max(200, 'name too long (max 200 chars)'),
  url: z.string({ error: 'url is required' })
    .min(1, 'url is required')
    .url('url must be a valid URL'),
  allowedTools: z.array(z.string().min(1)).optional().default([]),
  blockedTools: z.array(z.string().min(1)).optional().default([]),
});

// ── POST /api/v1/pii/scan ─────────────────────────────────────────────────
export const PIIScanRequestSchema = z.object({
  content: z.string().min(1).max(50000, 'content too long (max 50000 chars)').optional(),
  text: z.string().min(1).max(50000, 'text too long (max 50000 chars)').optional(), // alias for content
  dryRun: z.boolean().optional(),
}).refine((data) => data.content || data.text, {
  message: 'content is required',
  path: ['content'],
});

// ── POST /api/v1/feedback ──────────────────────────────────────────────────
// rating accepts:
//   - string: "positive" | "negative" | "neutral"  (primary, per docs)
//   - number: 1–5 integer                           (legacy numeric format)
// verdict is a deprecated alias for string rating (kept for backwards compatibility)
export const FeedbackRequestSchema = z.object({
  rating: z.union([
    z.enum(['positive', 'negative', 'neutral']),
    z.number().int().min(1, 'rating must be between 1 and 5').max(5, 'rating must be between 1 and 5'),
  ]).optional(),
  verdict: z.enum(['positive', 'negative', 'neutral']).optional(), // deprecated alias for rating
  comment: z.string().max(2000, 'comment too long (max 2000 chars)').optional(),
  agent_id: z.string().max(100).optional(),
}).refine((data) => data.rating !== undefined || data.verdict !== undefined, {
  message: 'rating is required ("positive", "negative", or "neutral")',
  path: ['rating'],
});

// ── POST /api/v1/telemetry ─────────────────────────────────────────────────
export const TelemetryRequestSchema = z.object({
  sdk_version: z.string().max(50).default('unknown'),
  language: z.string().max(50).default('unknown'),
  node_version: z.string().max(50).optional(),
  os_platform: z.string().max(100).optional(),
});

// ── POST /api/v1/compliance/owasp/generate ────────────────────────────────
export const ComplianceGenerateRequestSchema = z.object({
  agentId: z.string().max(100).optional(),
});

// ── POST /api/v1/sso/configure ────────────────────────────────────────────
export const SsoConfigureRequestSchema = z.object({
  provider: z.enum(['auth0', 'okta', 'azure_ad'], {
    error: "provider must be one of: 'auth0', 'okta', 'azure_ad'",
  }),
  domain: z.string({ error: 'domain is required' })
    .min(1, 'domain is required')
    .max(500, 'domain too long (max 500 chars)'),
  clientId: z.string({ error: 'clientId is required' })
    .min(1, 'clientId is required')
    .max(500, 'clientId too long (max 500 chars)'),
  clientSecret: z.string({ error: 'clientSecret is required' })
    .min(1, 'clientSecret is required')
    .max(2000, 'clientSecret too long (max 2000 chars)'),
});

// ── POST /api/v1/license/issue ────────────────────────────────────────────
export const LicenseIssueRequestSchema = z.object({
  tenantId: z.string({ error: 'tenantId is required' })
    .min(1, 'tenantId is required')
    .max(200, 'tenantId too long (max 200 chars)'),
  tier: z.enum(['free', 'pro', 'enterprise'], {
    error: "tier must be one of: 'free', 'pro', 'enterprise'",
  }),
  features: z.array(z.string().min(1)).optional(),
  customLimits: z.object({
    seats: z.number().int().min(0).optional(),
    events_pm: z.number().int().min(0).optional(),
    offline_grace_days: z.number().int().min(0).optional(),
    audit_retention_days: z.number().int().min(0).optional(),
  }).optional(),
  expiresAt: z.string().optional(), // ISO date string; defaults to tier-based expiry
  stripeSubscriptionId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ── POST /api/v1/license/validate ─────────────────────────────────────────
export const LicenseValidateRequestSchema = z.object({
  key: z.string({ error: 'key is required' })
    .min(1, 'key is required')
    .refine((v) => v.startsWith('AGKEY-'), { message: "key must start with 'AGKEY-'" }),
});

// ── POST /api/v1/license/revoke ───────────────────────────────────────────
export const LicenseRevokeRequestSchema = z.object({
  tenantId: z.string({ error: 'tenantId is required' })
    .min(1, 'tenantId is required')
    .max(200, 'tenantId too long (max 200 chars)'),
  reason: z.string({ error: 'reason is required' })
    .min(1, 'reason is required')
    .max(1000, 'reason too long (max 1000 chars)'),
});

// ── POST /api/v1/agents/:agentId/children ─────────────────────────────────
export const SpawnChildAgentRequestSchema = z.object({
  name: z.string({ error: 'name is required' })
    .min(1, 'name is required')
    .max(200, 'name too long (max 200 chars)'),
  allowedTools: z.array(z.string().min(1)).optional(),
  blockedTools: z.array(z.string().min(1)).optional(),
  hitlTools: z.array(z.string().min(1)).optional(),
  ttlMinutes: z.number().int().min(1).max(10080).optional(),
  maxToolCalls: z.number().int().min(1).max(1000000).optional(),
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
export const FeedbackRequest = FeedbackRequestSchema;
export const TelemetryRequest = TelemetryRequestSchema;
export const PIIScanRequest = PIIScanRequestSchema;
export const ComplianceGenerateRequest = ComplianceGenerateRequestSchema;
export const SpawnChildAgentRequest = SpawnChildAgentRequestSchema;
export const SsoConfigureRequest = SsoConfigureRequestSchema;
export const LicenseIssueRequest = LicenseIssueRequestSchema;
export const LicenseValidateRequest = LicenseValidateRequestSchema;
export const LicenseRevokeRequest = LicenseRevokeRequestSchema;

export type LicenseIssueRequest = z.infer<typeof LicenseIssueRequestSchema>;
export type LicenseValidateRequest = z.infer<typeof LicenseValidateRequestSchema>;
export type LicenseRevokeRequest = z.infer<typeof LicenseRevokeRequestSchema>;

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
export type McpEvaluateRequest = z.infer<typeof McpEvaluateRequestSchema>;
export type RegisterMcpServerRequest = z.infer<typeof RegisterMcpServerRequestSchema>;
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;
export type TelemetryRequest = z.infer<typeof TelemetryRequestSchema>;
export type PIIScanRequest = z.infer<typeof PIIScanRequestSchema>;
export type ComplianceGenerateRequest = z.infer<typeof ComplianceGenerateRequestSchema>;
export type SpawnChildAgentRequest = z.infer<typeof SpawnChildAgentRequestSchema>;
export type SsoConfigureRequest = z.infer<typeof SsoConfigureRequestSchema>;

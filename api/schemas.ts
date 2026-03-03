/**
 * AgentGuard — Zod Input Validation Schemas
 *
 * Provides validated, type-safe parsing for the 5 most critical request bodies.
 * Error messages are intentionally kept compatible with the legacy manual checks
 * so that existing tests continue to pass.
 */
import { z } from 'zod';

// ── POST /api/v1/evaluate ─────────────────────────────────────────────────
export const EvaluateRequest = z.object({
  tool: z.string({ error: 'tool is required and must be a string' })
    .min(1, 'tool is required and must be a string'),
  params: z.record(z.string(), z.unknown()).optional().default({}),
  agentId: z.string().optional(),
  sessionId: z.string().optional(),
  context: z.object({
    userId: z.string().optional(),
    environment: z.string().optional(),
  }).optional(),
});

// ── POST /api/v1/signup ───────────────────────────────────────────────────
export const SignupRequest = z.object({
  name: z.string({ error: 'name is required' })
    .min(1, 'name is required')
    .max(200),
  email: z.string({ error: 'email is required' })
    .min(1, 'email is required')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'),
});

// ── POST /api/v1/agents ───────────────────────────────────────────────────
export const CreateAgentRequest = z.object({
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
export const ValidateAgentRequest = z.object({
  declaredTools: z.array(z.string().min(1))
    .min(1, 'declaredTools must be a non-empty array of tool name strings'),
});

// ── POST /api/v1/mcp/admit ───────────────────────────────────────────────
export const McpAdmitRequest = z.object({
  serverUrl: z.string({ error: 'serverUrl is required' })
    .min(1, 'serverUrl is required'),
  tools: z.array(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    inputSchema: z.record(z.string(), z.unknown()).optional(),
  })).min(1, 'tools must be a non-empty array of { name, description?, inputSchema? }'),
});

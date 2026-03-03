/**
 * AgentGuard — Shared Types
 *
 * Shared types used across route modules, middleware, and lib helpers.
 */
import { Request } from 'express';
import type { TenantRow, AgentRow } from './db-interface.js';

// ── Extended Request Types ─────────────────────────────────────────────────

/**
 * Request with required tenant authentication set by requireTenantAuth.
 */
export interface AuthedRequest extends Request {
  tenant: TenantRow;
  tenantId: string;
  agent: AgentRow | null;
}

/**
 * Request where tenant auth is optional (set by optionalTenantAuth).
 */
export interface OptionalAuthedRequest extends Request {
  tenant?: TenantRow | null;
  tenantId?: string;
  agent?: AgentRow | null;
}

// ── Session State ──────────────────────────────────────────────────────────

export interface AuditEntry {
  seq: number;
  timestamp: string;
  tool: string;
  params: Record<string, unknown>;
  decision: string;
  matchedRuleId?: string;
  monitorRuleIds?: string[];
  riskScore: number;
  reason?: string;
  durationMs: number;
  eventHash: string;
  previousHash: string;
}

export interface SessionState {
  engine: import('../packages/sdk/src/core/policy-engine.js').PolicyEngine;
  context: import('../packages/sdk/src/core/types.js').AgentContext;
  auditTrail: AuditEntry[];
  createdAt: number;
  actionCount: number;
  lastHash: string;
  tenantId: string;
}

// ── Policy Template ────────────────────────────────────────────────────────

export interface PolicyTemplate {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  tags: string[];
  rules: Array<Record<string, unknown>>;
}

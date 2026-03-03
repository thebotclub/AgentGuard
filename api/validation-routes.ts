/**
 * AgentGuard Validation & Certification Routes
 *
 * Provides endpoints for:
 *  - Validating an agent's declared tools against the policy engine (dry-run)
 *  - Checking agent readiness/certification status
 *  - Certifying an agent once 100% policy coverage is achieved
 *  - MCP server admission pre-flight checks
 *
 * Endpoints:
 *  POST /api/v1/agents/:id/validate   — dry-run declared tools through policy engine
 *  GET  /api/v1/agents/:id/readiness  — get current readiness / certification status
 *  POST /api/v1/agents/:id/certify    — certify agent (requires 100% coverage)
 *  POST /api/v1/mcp/admit             — MCP server pre-flight admission check
 *
 * Mounted in server.ts BEFORE the 404 handler.
 */

import { Router, Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import type { IDatabase, TenantRow } from './db-interface.js';
import { ValidateAgentRequest, McpAdmitRequest } from './schemas.js';
import { PolicyEngine } from '../packages/sdk/src/core/policy-engine.js';
import type { ActionRequest, AgentContext, PolicyDecision } from '../packages/sdk/src/core/types.js';
import type { PolicyDocument } from '../packages/sdk/src/core/types.js';

// ── Types ──────────────────────────────────────────────────────────────────

interface ApiKeyRow {
  key: string;
  tenant_id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  is_active: number;
}

interface AgentRow {
  id: string;
  tenant_id: string;
  name: string;
  api_key: string;
  policy_scope: string;
  active: number;
  created_at: string;
  declared_tools?: string | null;
  last_validated_at?: string | null;
  validation_coverage?: number | null;
  certified_at?: string | null;
  certification_expires_at?: string | null;
  certification_token?: string | null;
}

interface AuthedRequest extends Request {
  tenant: TenantRow;
  tenantId: string;
}

// ── Auth helpers ───────────────────────────────────────────────────────────

async function lookupTenantFromDb(db: IDatabase, apiKey: string): Promise<TenantRow | null> {
  const keyRow = await db.getApiKey(apiKey) as ApiKeyRow | undefined;
  if (!keyRow) return null;
  await db.touchApiKey(apiKey);
  const tenant = await db.getTenant(keyRow.tenant_id);
  return tenant ?? null;
}

function requireTenantAuth(db: IDatabase) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (!apiKey) {
      return res.status(401).json({ error: 'X-API-Key header required' });
    }
    if (apiKey.startsWith('ag_agent_')) {
      return res.status(403).json({ error: 'Agent keys cannot perform tenant admin operations. Use your tenant API key.' });
    }
    const tenant = await lookupTenantFromDb(db, apiKey);
    if (!tenant) {
      return res.status(401).json({ error: 'Invalid or inactive API key' });
    }
    (req as AuthedRequest).tenant = tenant;
    (req as AuthedRequest).tenantId = tenant.id;
    next();
  };
}

// ── Default policy for dry-run evaluation ─────────────────────────────────
const DEFAULT_POLICY_FOR_VALIDATION: PolicyDocument = {
  id: 'validation-policy',
  name: 'AgentGuard Validation Policy',
  description: 'Policy used for agent validation dry-runs',
  version: '1.0.0',
  default: 'allow',
  rules: [
    {
      id: 'block-external-http',
      description: 'Block all external HTTP requests to unapproved domains',
      priority: 10, action: 'block', severity: 'critical',
      when: [
        { tool: { in: ['http_request', 'http_post', 'fetch', 'curl', 'wget'] } },
      ],
      tags: ['data-protection', 'exfiltration'], riskBoost: 200,
    },
    {
      id: 'block-pii-tables',
      description: 'Block access to tables containing PII',
      priority: 20, action: 'block', severity: 'high',
      when: [
        { tool: { in: ['db_query', 'db_read', 'sql_execute'] } },
      ],
      tags: ['privacy', 'compliance'], riskBoost: 150,
    },
    {
      id: 'block-privilege-escalation',
      description: 'Block system command and privilege escalation attempts',
      priority: 5, action: 'block', severity: 'critical',
      when: [
        { tool: { in: ['shell_exec', 'sudo', 'chmod', 'chown', 'system_command'] } },
      ],
      tags: ['security', 'privilege-escalation'], riskBoost: 300,
    },
    {
      id: 'monitor-llm-calls',
      description: 'Monitor all LLM API calls',
      priority: 50, action: 'monitor', severity: 'low',
      when: [
        { tool: { in: ['llm_query', 'openai_chat', 'anthropic_complete', 'gpt4'] } },
      ],
      tags: ['cost-tracking', 'observability'], riskBoost: 0,
    },
    {
      id: 'require-approval-financial',
      description: 'Require human approval for financial transactions',
      priority: 15, action: 'require_approval', severity: 'high',
      when: [
        { tool: { in: ['transfer_funds', 'create_payment', 'execute_transaction'] } },
      ],
      tags: ['financial', 'hitl'], riskBoost: 100,
      approvers: ['finance-team'], timeoutSec: 300, on_timeout: 'block',
    },
    {
      id: 'block-destructive-ops',
      description: 'Block all file/data deletion operations',
      priority: 8, action: 'block', severity: 'high',
      when: [
        { tool: { in: ['file_delete', 'rm', 'rmdir', 'unlink', 'drop_table'] } },
      ],
      tags: ['data-protection', 'destructive'], riskBoost: 200,
    },
    {
      id: 'allow-read-operations',
      description: 'Explicitly allow read-only operations',
      priority: 100, action: 'allow', severity: 'low',
      when: [
        { tool: { in: ['file_read', 'db_read_public', 'get_config', 'list_files'] } },
      ],
      tags: ['read-only'], riskBoost: 0,
    },
  ],
};

// ── Risk Score Calculator ──────────────────────────────────────────────────

function computeAggregateRiskScore(
  results: Array<{ tool: string; decision: string; riskScore: number }>,
): number {
  if (results.length === 0) return 0;
  const total = results.reduce((sum, r) => sum + r.riskScore, 0);
  return Math.min(1000, Math.round(total / results.length));
}

// ── Dry-run evaluation ─────────────────────────────────────────────────────

interface ValidationResult {
  tool: string;
  decision: string;
  ruleId: string | null;
  riskScore: number;
  reason: string | null;
}

function dryRunTools(tools: string[]): ValidationResult[] {
  const engine = new PolicyEngine();
  engine.registerDocument(DEFAULT_POLICY_FOR_VALIDATION);

  return tools.map((tool) => {
    const actionRequest: ActionRequest = {
      id: crypto.randomUUID(),
      agentId: 'validation-dry-run',
      tool,
      params: {},
      inputDataLabels: [],
      timestamp: new Date().toISOString(),
    };
    const ctx: AgentContext = {
      agentId: 'validation-dry-run',
      sessionId: 'validation',
      policyVersion: '1.0.0',
    };

    let decision: PolicyDecision;
    try {
      decision = engine.evaluate(actionRequest, ctx, DEFAULT_POLICY_FOR_VALIDATION.id);
    } catch {
      return {
        tool,
        decision: 'error',
        ruleId: null,
        riskScore: 0,
        reason: 'Evaluation error',
      };
    }

    return {
      tool,
      decision: decision.result,
      ruleId: decision.matchedRuleId ?? null,
      riskScore: decision.riskScore,
      reason: decision.reason ?? null,
    };
  });
}

function computeCoverage(results: ValidationResult[]): { coverage: number; uncovered: string[] } {
  if (results.length === 0) return { coverage: 100, uncovered: [] };
  const uncovered = results.filter((r) => r.ruleId === null).map((r) => r.tool);
  const coverage = Math.round(((results.length - uncovered.length) / results.length) * 100);
  return { coverage, uncovered };
}

// ── Certification Token ────────────────────────────────────────────────────

function generateCertToken(): string {
  return 'agcert_' + crypto.randomBytes(24).toString('hex');
}

// ── Run schema migrations (called from server.ts for SQLite raw compat) ───

/**
 * Kept for backward compat: called from server.ts with the raw SQLite db.
 * The IDatabase initialize() method already handles these migrations.
 */
export function runValidationMigrations(db: Database.Database): void {
  const newColumns: Array<{ name: string; type: string }> = [
    { name: 'declared_tools', type: 'TEXT' },
    { name: 'last_validated_at', type: 'TEXT' },
    { name: 'validation_coverage', type: 'INTEGER' },
    { name: 'certified_at', type: 'TEXT' },
    { name: 'certification_expires_at', type: 'TEXT' },
    { name: 'certification_token', type: 'TEXT' },
  ];

  for (const col of newColumns) {
    try {
      db.exec(`ALTER TABLE agents ADD COLUMN ${col.name} ${col.type}`);
    } catch {
      // Column already exists — safe to ignore
    }
  }
}

// Async version for IDatabase (PostgreSQL + SQLite via adapter)
export async function runValidationMigrationsAsync(db: IDatabase): Promise<void> {
  const newColumns: Array<{ name: string; type: string }> = [
    { name: 'declared_tools', type: 'TEXT' },
    { name: 'last_validated_at', type: 'TEXT' },
    { name: 'validation_coverage', type: 'INTEGER' },
    { name: 'certified_at', type: 'TEXT' },
    { name: 'certification_expires_at', type: 'TEXT' },
    { name: 'certification_token', type: 'TEXT' },
  ];

  for (const col of newColumns) {
    try {
      await db.exec(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
    } catch {
      // Safe to ignore — column exists or dialect doesn't support IF NOT EXISTS
      try {
        await db.exec(`ALTER TABLE agents ADD COLUMN ${col.name} ${col.type}`);
      } catch {
        // Already exists — expected
      }
    }
  }
}

// ── Route Factory ──────────────────────────────────────────────────────────

export function createValidationRoutes(db: IDatabase): Router {
  const router = Router();
  const auth = requireTenantAuth(db);

  // ── POST /api/v1/agents/:id/validate ──────────────────────────────────────
  router.post('/api/v1/agents/:id/validate', auth, async (req: Request, res: Response) => {
    const tenantId = (req as AuthedRequest).tenantId;
    const agentId = req.params['id'] as string;

    if (!agentId || typeof agentId !== 'string') {
      return res.status(400).json({ error: 'Invalid agent id' });
    }

    const agent = await db.get<AgentRow>(
      'SELECT * FROM agents WHERE id = ? AND tenant_id = ? AND active = 1',
      [agentId, tenantId]
    );

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const validateParsed = ValidateAgentRequest.safeParse(req.body ?? {});
    if (!validateParsed.success) {
      return res.status(400).json({ error: validateParsed.error.issues[0].message });
    }

    const tools = validateParsed.data.declaredTools.filter(
      (t): t is string => typeof t === 'string' && t.length > 0 && t.length <= 200,
    );
    if (tools.length === 0) {
      return res.status(400).json({ error: 'declaredTools contains no valid tool name strings' });
    }
    if (tools.length > 200) {
      return res.status(400).json({ error: 'declaredTools too long (max 200 tools)' });
    }

    const results = dryRunTools(tools);
    const { coverage, uncovered } = computeCoverage(results);
    const riskScore = computeAggregateRiskScore(results);
    const valid = uncovered.length === 0;
    const now = new Date().toISOString();

    await db.run(
      `UPDATE agents
       SET declared_tools = ?, last_validated_at = ?, validation_coverage = ?
       WHERE id = ?`,
      [JSON.stringify(tools), now, coverage, agentId]
    );

    return res.json({
      agentId,
      valid,
      coverage,
      riskScore,
      results,
      uncovered,
      validatedAt: now,
    });
  });

  // ── GET /api/v1/agents/:id/readiness ──────────────────────────────────────
  router.get('/api/v1/agents/:id/readiness', auth, async (req: Request, res: Response) => {
    const tenantId = (req as AuthedRequest).tenantId;
    const agentId = req.params['id'] as string;

    if (!agentId || typeof agentId !== 'string') {
      return res.status(400).json({ error: 'Invalid agent id' });
    }

    const agent = await db.get<AgentRow>(
      'SELECT * FROM agents WHERE id = ? AND tenant_id = ? AND active = 1',
      [agentId, tenantId]
    );

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    let status: 'certified' | 'validated' | 'registered' | 'expired';

    if (agent.certified_at && agent.certification_expires_at) {
      const expiresAt = new Date(agent.certification_expires_at);
      if (expiresAt > new Date()) {
        status = 'certified';
      } else {
        status = 'expired';
      }
    } else if (agent.last_validated_at) {
      status = 'validated';
    } else {
      status = 'registered';
    }

    return res.json({
      agentId,
      name: agent.name,
      status,
      lastValidated: agent.last_validated_at ?? null,
      coverage: agent.validation_coverage ?? null,
      certifiedAt: agent.certified_at ?? null,
      expiresAt: agent.certification_expires_at ?? null,
    });
  });

  // ── POST /api/v1/agents/:id/certify ───────────────────────────────────────
  router.post('/api/v1/agents/:id/certify', auth, async (req: Request, res: Response) => {
    const tenantId = (req as AuthedRequest).tenantId;
    const agentId = req.params['id'] as string;

    if (!agentId || typeof agentId !== 'string') {
      return res.status(400).json({ error: 'Invalid agent id' });
    }

    const agent = await db.get<AgentRow>(
      'SELECT * FROM agents WHERE id = ? AND tenant_id = ? AND active = 1',
      [agentId, tenantId]
    );

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    if (!agent.last_validated_at) {
      return res.status(422).json({
        error: 'Agent has not been validated yet. Call POST /api/v1/agents/:id/validate first.',
      });
    }

    const coverage = agent.validation_coverage ?? 0;
    if (coverage < 100) {
      return res.status(422).json({
        error: `Certification requires 100% policy coverage. Current coverage: ${coverage}%. Fix uncovered tools and re-validate.`,
        coverage,
      });
    }

    const now = new Date();
    const certifiedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const token = generateCertToken();

    await db.run(
      `UPDATE agents
       SET certified_at = ?, certification_expires_at = ?, certification_token = ?
       WHERE id = ?`,
      [certifiedAt, expiresAt, token, agentId]
    );

    return res.status(201).json({
      agentId,
      name: agent.name,
      certified: true,
      certifiedAt,
      expiresAt,
      certificationToken: token,
      coverage,
      message: `Agent '${agent.name}' certified. Token is valid for 30 days.`,
    });
  });

  // ── POST /api/v1/mcp/admit ────────────────────────────────────────────────
  router.post('/api/v1/mcp/admit', auth, (req: Request, res: Response) => {
    const admitParsed = McpAdmitRequest.safeParse(req.body ?? {});
    if (!admitParsed.success) {
      return res.status(400).json({ error: admitParsed.error.issues[0].message });
    }
    const { serverUrl, tools } = admitParsed.data;

    const toolNames: string[] = [];
    for (const t of tools) {
      const name = t.name.trim();
      if (name.length > 0 && name.length <= 200) {
        toolNames.push(name);
      }
    }

    if (toolNames.length === 0) {
      return res.status(400).json({ error: 'No valid tool names found. Each tool must have a non-empty string "name" field.' });
    }
    if (toolNames.length > 200) {
      return res.status(400).json({ error: 'Too many tools (max 200)' });
    }

    const results = dryRunTools(toolNames);
    const { coverage, uncovered } = computeCoverage(results);
    const admitted = uncovered.length === 0 && results.every((r) => r.decision !== 'block');

    return res.json({
      serverUrl,
      admitted,
      coverage,
      uncovered,
      results,
      checkedAt: new Date().toISOString(),
    });
  });

  return router;
}

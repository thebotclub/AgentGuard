/**
 * AgentGuard — Policy Management Routes
 *
 * GET /api/v1/policy — get current policy for tenant (custom or default)
 * PUT /api/v1/policy — replace policy with a JSON array of rules
 * POST /api/v1/policy/coverage — check coverage of a list of tool names
 */
import { Router, Request, Response } from 'express';
import { PolicyEngine } from '../../packages/sdk/src/core/policy-engine.js';
import { PolicyRuleSchema, type PolicyDocument, type PolicyRule } from '../../packages/sdk/src/core/types.js';
import { z } from 'zod';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import { DEFAULT_POLICY } from '../lib/policy-engine-setup.js';

// ── Helpers ────────────────────────────────────────────────────────────────

async function getEffectivePolicy(
  db: IDatabase,
  tenantId: string,
): Promise<PolicyDocument> {
  try {
    const custom = await db.getCustomPolicy(tenantId);
    if (custom) {
      const parsed = JSON.parse(custom) as unknown;
      // parsed may be the full PolicyDocument or just an array of rules
      if (Array.isArray(parsed)) {
        return { ...DEFAULT_POLICY, rules: parsed as PolicyDocument['rules'] };
      }
      return parsed as PolicyDocument;
    }
  } catch {
    // Fall back to default if stored policy is corrupt
  }
  return DEFAULT_POLICY;
}

// ── Route Factory ──────────────────────────────────────────────────────────

export function createPolicyRoutes(
  db: IDatabase,
  auth: AuthMiddleware,
): Router {
  const router = Router();

  // ── GET /api/v1/policy ────────────────────────────────────────────────────
  router.get(
    '/api/v1/policy',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      try {
        const policy = await getEffectivePolicy(db, tenantId);
        res.json({
          tenantId,
          isCustom: !!(await db.getCustomPolicy(tenantId)),
          policy,
        });
      } catch (e) {
        console.error('[policy] get error:', e);
        res.status(500).json({ error: 'Failed to retrieve policy' });
      }
    },
  );

  // ── PUT /api/v1/policy ────────────────────────────────────────────────────
  router.put(
    '/api/v1/policy',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const body = req.body as unknown;

      // Accept either a raw array of rules or a full PolicyDocument object
      let rulesRaw: unknown[];
      if (Array.isArray(body)) {
        rulesRaw = body;
      } else if (
        body !== null &&
        typeof body === 'object' &&
        'rules' in (body as Record<string, unknown>) &&
        Array.isArray((body as Record<string, unknown>)['rules'])
      ) {
        rulesRaw = (body as Record<string, unknown>)['rules'] as unknown[];
      } else {
        return res.status(400).json({
          error: 'Body must be a JSON array of policy rules or an object with a "rules" array',
        });
      }

      if (rulesRaw.length > 500) {
        return res.status(400).json({ error: 'Policy may not have more than 500 rules' });
      }

      // Validate each rule individually with the Zod schema
      const validatedRules: PolicyRule[] = [];
      const ruleErrors: string[] = [];
      for (let i = 0; i < rulesRaw.length; i++) {
        const ruleResult = PolicyRuleSchema.safeParse(rulesRaw[i]);
        if (!ruleResult.success) {
          ruleErrors.push(`Rule ${i}: ${ruleResult.error.issues[0]?.message ?? 'invalid'}`);
          if (ruleErrors.length >= 5) break;
        } else {
          validatedRules.push(ruleResult.data);
        }
      }
      if (ruleErrors.length > 0) {
        return res.status(400).json({
          error: 'Invalid policy rule(s)',
          details: ruleErrors,
        });
      }

      const policyDoc: PolicyDocument = {
        ...DEFAULT_POLICY,
        id: `custom-${tenantId}`,
        name: 'Custom Policy',
        rules: validatedRules,
      };

      try {
        await db.setCustomPolicy(tenantId, JSON.stringify(policyDoc));
        res.json({
          tenantId,
          ruleCount: validatedRules.length,
          message: 'Policy updated successfully',
          policy: policyDoc,
        });
      } catch (e) {
        console.error('[policy] put error:', e);
        res.status(500).json({ error: 'Failed to save policy' });
      }
    },
  );

  // ── POST /api/v1/policy/coverage ──────────────────────────────────────────
  router.post(
    '/api/v1/policy/coverage',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const body = req.body as unknown;

      const parsed = z
        .object({ tools: z.array(z.string().min(1)).min(1).max(200) })
        .safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Body must be { tools: string[] } (1–200 tool names)',
        });
      }

      const { tools } = parsed.data;
      const policy = await getEffectivePolicy(db, tenantId);
      const engine = new PolicyEngine();
      engine.registerDocument(policy);

      const results = tools.map((toolName) => {
        const action = { id: 'coverage-check', agentId: 'coverage', tool: toolName, params: {}, inputDataLabels: [], timestamp: new Date().toISOString() };
        const ctx = { agentId: 'coverage', sessionId: 'coverage', policyVersion: '1.0.0' };
        const decision = engine.evaluate(action, ctx, policy.id);
        return {
          tool: toolName,
          decision: decision.result,
          ruleId: decision.matchedRuleId ?? null,
          riskScore: decision.riskScore,
          reason: decision.reason ?? null,
        };
      });

      const covered = results.filter((r) => r.ruleId !== null).map((r) => r.tool);
      const uncovered = results.filter((r) => r.ruleId === null).map((r) => r.tool);
      const coverage = tools.length > 0 ? Math.round((covered.length / tools.length) * 100) : 100;

      res.json({ coverage, covered, uncovered, results });
    },
  );

  return router;
}

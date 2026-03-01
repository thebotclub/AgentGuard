/**
 * Policy CRUD routes — /v1/policies
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { CreatePolicySchema, UpdatePolicySchema, ActivatePolicyVersionSchema, TestPolicySchema, } from '@agentguard/shared';
import { PolicyService } from '../services/policy.js';
import { getContext } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
export const policiesRouter = new Hono();
/** GET /v1/policies */
policiesRouter.get('/', async (c) => {
    const ctx = getContext(c);
    const service = new PolicyService(prisma, ctx);
    const policies = await service.listPolicies();
    return c.json({
        data: policies.map(policyToResponse),
        pagination: {
            cursor: policies.length === 50 ? (policies[policies.length - 1]?.id ?? null) : null,
            hasMore: policies.length === 50,
        },
    });
});
/** POST /v1/policies */
policiesRouter.post('/', async (c) => {
    const ctx = getContext(c);
    const service = new PolicyService(prisma, ctx);
    const body = await c.req.json();
    const input = CreatePolicySchema.parse(body);
    const { policy } = await service.createPolicy(input);
    return c.json(policyToResponse(policy), 201);
});
/** GET /v1/policies/:policyId */
policiesRouter.get('/:policyId', async (c) => {
    const ctx = getContext(c);
    const policyId = c.req.param('policyId');
    const service = new PolicyService(prisma, ctx);
    const policy = await service.getPolicy(policyId);
    return c.json(policyToResponse(policy));
});
/** PUT /v1/policies/:policyId */
policiesRouter.put('/:policyId', async (c) => {
    const ctx = getContext(c);
    const policyId = c.req.param('policyId');
    const service = new PolicyService(prisma, ctx);
    const body = await c.req.json();
    const input = UpdatePolicySchema.parse(body);
    const policy = await service.updatePolicy(policyId, input);
    return c.json(policyToResponse(policy));
});
/** DELETE /v1/policies/:policyId */
policiesRouter.delete('/:policyId', async (c) => {
    const ctx = getContext(c);
    const policyId = c.req.param('policyId');
    const service = new PolicyService(prisma, ctx);
    await service.deletePolicy(policyId);
    return c.json({ success: true });
});
/** GET /v1/policies/:policyId/versions */
policiesRouter.get('/:policyId/versions', async (c) => {
    const ctx = getContext(c);
    const policyId = c.req.param('policyId');
    const service = new PolicyService(prisma, ctx);
    const versions = await service.listVersions(policyId);
    return c.json({ data: versions.map(versionToResponse) });
});
/** GET /v1/policies/:policyId/versions/:version */
policiesRouter.get('/:policyId/versions/:version', async (c) => {
    const ctx = getContext(c);
    const policyId = c.req.param('policyId');
    const version = c.req.param('version');
    const service = new PolicyService(prisma, ctx);
    const pv = await service.getVersion(policyId, version);
    return c.json(versionToResponse(pv));
});
/** POST /v1/policies/:policyId/activate */
policiesRouter.post('/:policyId/activate', async (c) => {
    const ctx = getContext(c);
    const policyId = c.req.param('policyId');
    const service = new PolicyService(prisma, ctx);
    const body = await c.req.json().catch(() => ({}));
    const input = ActivatePolicyVersionSchema.parse(body);
    const policy = await service.activateVersion(policyId, input.version);
    return c.json(policyToResponse(policy));
});
/** POST /v1/policies/:policyId/test — dry-run policy evaluation */
policiesRouter.post('/:policyId/test', async (c) => {
    const ctx = getContext(c);
    const policyId = c.req.param('policyId');
    const body = await c.req.json();
    const input = TestPolicySchema.parse(body);
    // TODO: Load compiled bundle and run PolicyEngine.evaluate() for each test case
    // For now return a stub response
    return c.json({
        policyId,
        summary: { total: input.tests.length, passed: 0, failed: 0, skipped: input.tests.length },
        results: input.tests.map((t) => ({
            name: t.name,
            passed: false,
            skipped: true,
            reason: 'Policy engine integration pending',
        })),
    });
});
// ─── Helpers ──────────────────────────────────────────────────────────────────
function policyToResponse(p) {
    return {
        id: p.id,
        tenantId: p.tenantId,
        name: p.name,
        description: p.description,
        activeVersion: p.activeVersion,
        defaultAction: p.defaultAction,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
    };
}
function versionToResponse(pv) {
    return {
        id: pv.id,
        policyId: pv.policyId,
        version: pv.version,
        ruleCount: pv.ruleCount,
        changelog: pv.changelog,
        createdAt: pv.createdAt.toISOString(),
        bundleChecksum: pv.bundleChecksum,
    };
}
//# sourceMappingURL=policies.js.map
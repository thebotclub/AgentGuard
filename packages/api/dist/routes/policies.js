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
import { CreatePolicySchema, UpdatePolicySchema, ActivatePolicyVersionSchema, TestPolicySchema, } from '@agentguard/shared';
import { PolicyService } from '../services/policy.js';
import { getContext } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
export const policiesRouter = new Hono();
/** GET /v1/policies */
policiesRouter.get('/', async (c) => {
    const ctx = getContext(c);
    const service = new PolicyService(prisma, ctx, redis);
    const limit = Number(c.req.query('limit') ?? '50');
    const cursor = c.req.query('cursor');
    const policies = await service.listPolicies(Math.min(limit, 100), cursor);
    return c.json({
        data: policies.map(policyToResponse),
        pagination: {
            cursor: policies.length === limit ? (policies[policies.length - 1]?.id ?? null) : null,
            hasMore: policies.length === limit,
        },
    });
});
/** POST /v1/policies — create policy + compile + store */
policiesRouter.post('/', async (c) => {
    const ctx = getContext(c);
    const service = new PolicyService(prisma, ctx, redis);
    const body = await c.req.json();
    const input = CreatePolicySchema.parse(body);
    const { policy, version, warnings } = await service.createPolicy(input);
    return c.json({
        policy: policyToResponse(policy),
        version: versionToResponse(version),
        warnings,
    }, 201);
});
/** GET /v1/policies/:policyId */
policiesRouter.get('/:policyId', async (c) => {
    const ctx = getContext(c);
    const policyId = c.req.param('policyId');
    const service = new PolicyService(prisma, ctx, redis);
    const policy = await service.getPolicy(policyId);
    return c.json(policyToResponse(policy));
});
/** PUT /v1/policies/:policyId — create new version */
policiesRouter.put('/:policyId', async (c) => {
    const ctx = getContext(c);
    const policyId = c.req.param('policyId');
    const service = new PolicyService(prisma, ctx, redis);
    const body = await c.req.json();
    const input = UpdatePolicySchema.parse(body);
    const { policy, version, warnings } = await service.updatePolicy(policyId, input);
    return c.json({
        policy: policyToResponse(policy),
        version: version ? versionToResponse(version) : null,
        warnings,
    });
});
/** DELETE /v1/policies/:policyId — soft delete */
policiesRouter.delete('/:policyId', async (c) => {
    const ctx = getContext(c);
    const policyId = c.req.param('policyId');
    const service = new PolicyService(prisma, ctx, redis);
    await service.deletePolicy(policyId);
    return c.body(null, 204);
});
/** GET /v1/policies/:policyId/versions — version history */
policiesRouter.get('/:policyId/versions', async (c) => {
    const ctx = getContext(c);
    const policyId = c.req.param('policyId');
    const service = new PolicyService(prisma, ctx, redis);
    const versions = await service.listVersions(policyId);
    return c.json({ data: versions.map(versionToResponse) });
});
/** GET /v1/policies/:policyId/versions/:version — specific version with YAML */
policiesRouter.get('/:policyId/versions/:version', async (c) => {
    const ctx = getContext(c);
    const policyId = c.req.param('policyId');
    const version = c.req.param('version');
    const service = new PolicyService(prisma, ctx, redis);
    const pv = await service.getVersion(policyId, version);
    return c.json({
        ...versionToResponse(pv),
        yamlContent: pv.yamlContent,
    });
});
/** POST /v1/policies/:policyId/activate — activate version + cache in Redis */
policiesRouter.post('/:policyId/activate', async (c) => {
    const ctx = getContext(c);
    const policyId = c.req.param('policyId');
    const service = new PolicyService(prisma, ctx, redis);
    const body = await c.req.json().catch(() => ({}));
    const input = ActivatePolicyVersionSchema.parse(body);
    const policy = await service.activateVersion(policyId, input.version);
    return c.json({
        ...policyToResponse(policy),
        propagationEstimateSec: 60, // SDK polls bundle every 60s
    });
});
/** POST /v1/policies/:policyId/test — dry-run evaluation */
policiesRouter.post('/:policyId/test', async (c) => {
    const ctx = getContext(c);
    const policyId = c.req.param('policyId');
    const service = new PolicyService(prisma, ctx, redis);
    const body = await c.req.json();
    const input = TestPolicySchema.parse(body);
    const { summary, results } = await service.testPolicy(policyId, input.tests);
    return c.json({ policyId, summary, results });
});
/**
 * GET /v1/sdk/bundle — serve compiled policy bundle to SDK agent.
 * Auth: agent API key (Bearer ag_live_...).
 * Served from Redis (60s TTL), falls back to DB.
 */
policiesRouter.get('/sdk/bundle', async (c) => {
    const ctx = getContext(c);
    if (ctx.role !== 'agent') {
        return c.json({ error: { code: 'FORBIDDEN', message: 'SDK bundle endpoint requires agent API key auth' } }, 403);
    }
    // ctx.userId is the agentId when role=agent
    const agentId = ctx.userId;
    const service = new PolicyService(prisma, ctx, redis);
    const bundle = await service.getBundleForAgent(agentId);
    if (!bundle) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'No active policy found for this agent' } }, 404);
    }
    return c.json(bundle);
});
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
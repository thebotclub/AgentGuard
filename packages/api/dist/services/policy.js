/**
 * PolicyService — CRUD + compilation for policies.
 * Wraps the policy engine compiler.
 */
import { createHash } from 'node:crypto';
import { load as loadYaml } from 'js-yaml';
import { PolicyDocumentSchema } from '@agentguard/shared';
import { BaseService } from './base.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
export class PolicyService extends BaseService {
    constructor(db, ctx) {
        super(db, ctx);
    }
    async listPolicies(limit = 50, cursor) {
        return this.db.policy.findMany({
            where: {
                ...this.tenantScope(),
                deletedAt: null,
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
    }
    async getPolicy(policyId) {
        const policy = await this.db.policy.findFirst({
            where: {
                ...this.tenantScope(),
                id: policyId,
                deletedAt: null,
            },
        });
        if (!policy)
            throw new NotFoundError('Policy', policyId);
        return policy;
    }
    async createPolicy(input) {
        this.assertRole('owner', 'admin');
        const doc = this.parseAndValidateYaml(input.yamlContent);
        return this.withTransaction(async (tx) => {
            const policy = await tx.policy.create({
                data: {
                    tenantId: this.tenantId,
                    name: input.name,
                    description: input.description ?? null,
                    defaultAction: doc.default,
                },
            });
            const version = await this.createPolicyVersion(tx, policy.id, doc, input);
            if (input.activate) {
                await tx.policy.update({
                    where: { id: policy.id },
                    data: { activeVersion: version.version },
                });
            }
            return { policy, version };
        });
    }
    async updatePolicy(policyId, input) {
        this.assertRole('owner', 'admin');
        await this.getPolicy(policyId);
        return this.withTransaction(async (tx) => {
            let newVersion;
            if (input.yamlContent) {
                const doc = this.parseAndValidateYaml(input.yamlContent);
                newVersion = await this.createPolicyVersion(tx, policyId, doc, {
                    yamlContent: input.yamlContent,
                    changelog: input.changelog,
                    name: input.name,
                    activate: input.activate ?? false,
                });
            }
            return tx.policy.update({
                where: { id: policyId },
                data: {
                    ...(input.name !== undefined ? { name: input.name } : {}),
                    ...(input.description !== undefined ? { description: input.description } : {}),
                    ...(input.activate && newVersion ? { activeVersion: newVersion.version } : {}),
                },
            });
        });
    }
    async deletePolicy(policyId) {
        this.assertRole('owner', 'admin');
        await this.getPolicy(policyId);
        await this.db.policy.update({
            where: { id: policyId },
            data: { deletedAt: new Date() },
        });
    }
    async listVersions(policyId) {
        await this.getPolicy(policyId);
        return this.db.policyVersion.findMany({
            where: { policyId, tenantId: this.tenantId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async getVersion(policyId, version) {
        await this.getPolicy(policyId);
        const pv = await this.db.policyVersion.findUnique({
            where: { policyId_version: { policyId, version } },
        });
        if (!pv)
            throw new NotFoundError('PolicyVersion', `${policyId}@${version}`);
        return pv;
    }
    async activateVersion(policyId, version) {
        this.assertRole('owner', 'admin');
        const policy = await this.getPolicy(policyId);
        let targetVersion = version;
        if (!targetVersion) {
            // Activate the latest version
            const latest = await this.db.policyVersion.findFirst({
                where: { policyId, tenantId: this.tenantId },
                orderBy: { createdAt: 'desc' },
            });
            if (!latest)
                throw new NotFoundError('PolicyVersion', 'latest');
            targetVersion = latest.version;
        }
        else {
            await this.getVersion(policyId, targetVersion);
        }
        return this.db.policy.update({
            where: { id: policyId },
            data: { activeVersion: targetVersion },
        });
    }
    async getCompiledBundle(policyId, version) {
        const policy = await this.getPolicy(policyId);
        const v = version ?? policy.activeVersion;
        if (!v)
            throw new NotFoundError('PolicyVersion', 'active');
        const pv = await this.getVersion(policyId, v);
        return pv.compiledBundle;
    }
    // ─── Private helpers ───────────────────────────────────────────────────────
    parseAndValidateYaml(yamlContent) {
        let parsed;
        try {
            parsed = loadYaml(yamlContent);
        }
        catch (err) {
            throw new ValidationError({ yaml: `Invalid YAML: ${String(err)}` });
        }
        const result = PolicyDocumentSchema.safeParse(parsed);
        if (!result.success) {
            throw new ValidationError(result.error.issues);
        }
        return result.data;
    }
    async createPolicyVersion(tx, policyId, doc, input) {
        // TODO: call PolicyCompiler.compile(doc) once sdk is available as dep
        // For now, store the raw doc as "compiled bundle"
        const compiledBundle = doc;
        const bundleJson = JSON.stringify(compiledBundle);
        const bundleChecksum = createHash('sha256').update(bundleJson).digest('hex');
        // Generate next semver version
        const latestVersion = await tx.policyVersion.findFirst({
            where: { policyId, tenantId: this.tenantId },
            orderBy: { createdAt: 'desc' },
        });
        const nextVersion = incrementVersion(latestVersion?.version ?? '0.0.0');
        return tx.policyVersion.create({
            data: {
                tenantId: this.tenantId,
                policyId,
                version: nextVersion,
                yamlContent: input.yamlContent ?? JSON.stringify(doc),
                compiledBundle,
                bundleChecksum,
                ruleCount: doc.rules.length,
                changelog: input.changelog ?? null,
                createdByUserId: this.userId,
            },
        });
    }
}
function incrementVersion(version) {
    const parts = version.split('.').map(Number);
    const patch = (parts[2] ?? 0) + 1;
    return `${parts[0] ?? 1}.${parts[1] ?? 0}.${patch}`;
}
//# sourceMappingURL=policy.js.map
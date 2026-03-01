import type { Policy, PolicyVersion } from '@prisma/client';
import type { ServiceContext, CreatePolicyInput, UpdatePolicyInput } from '@agentguard/shared';
import { BaseService } from './base.js';
import type { PrismaClient } from '../lib/prisma.js';
export declare class PolicyService extends BaseService {
    constructor(db: PrismaClient, ctx: ServiceContext);
    listPolicies(limit?: number, cursor?: string): Promise<Policy[]>;
    getPolicy(policyId: string): Promise<Policy>;
    createPolicy(input: CreatePolicyInput): Promise<{
        policy: Policy;
        version: PolicyVersion;
    }>;
    updatePolicy(policyId: string, input: UpdatePolicyInput): Promise<Policy>;
    deletePolicy(policyId: string): Promise<void>;
    listVersions(policyId: string): Promise<PolicyVersion[]>;
    getVersion(policyId: string, version: string): Promise<PolicyVersion>;
    activateVersion(policyId: string, version?: string): Promise<Policy>;
    getCompiledBundle(policyId: string, version?: string): Promise<unknown>;
    private parseAndValidateYaml;
    private createPolicyVersion;
}
//# sourceMappingURL=policy.d.ts.map
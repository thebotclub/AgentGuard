/**
 * Agent Zod schemas — used by both API (input validation) and SDK.
 */
import { z } from 'zod';
export const AgentFrameworkSchema = z.enum([
    'LANGCHAIN',
    'OPENAI_SDK',
    'CREWAI',
    'AUTOGEN',
    'LLAMAINDEX',
    'CUSTOM',
]);
export const AgentStatusSchema = z.enum(['ACTIVE', 'KILLED', 'QUARANTINED', 'INACTIVE']);
export const RiskTierSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const FailBehaviorSchema = z.enum(['CLOSED', 'OPEN']);
export const CreateAgentSchema = z.object({
    name: z.string().min(1).max(100).trim(),
    description: z.string().max(500).optional(),
    policyId: z.string().min(1).optional(),
    failBehavior: FailBehaviorSchema.default('CLOSED'),
    riskTier: RiskTierSchema.default('MEDIUM'),
    framework: AgentFrameworkSchema.optional(),
    frameworkVersion: z.string().max(20).optional(),
    tags: z.array(z.string().max(50)).max(20).default([]),
    metadata: z.record(z.string(), z.string().max(500)).optional(),
});
export const UpdateAgentSchema = z.object({
    name: z.string().min(1).max(100).trim().optional(),
    description: z.string().max(500).nullable().optional(),
    policyId: z.string().min(1).nullable().optional(),
    policyVersion: z.string().optional(),
    failBehavior: FailBehaviorSchema.optional(),
    riskTier: RiskTierSchema.optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    metadata: z.record(z.string(), z.string().max(500)).optional(),
});
export const ListAgentsQuerySchema = z.object({
    status: AgentStatusSchema.optional(),
    riskTier: RiskTierSchema.optional(),
    policyId: z.string().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});
//# sourceMappingURL=agent.js.map
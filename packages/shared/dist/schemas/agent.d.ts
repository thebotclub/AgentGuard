/**
 * Agent Zod schemas — used by both API (input validation) and SDK.
 */
import { z } from 'zod';
export declare const AgentFrameworkSchema: z.ZodEnum<["LANGCHAIN", "OPENAI_SDK", "CREWAI", "AUTOGEN", "LLAMAINDEX", "CUSTOM"]>;
export declare const AgentStatusSchema: z.ZodEnum<["ACTIVE", "KILLED", "QUARANTINED", "INACTIVE"]>;
export declare const RiskTierSchema: z.ZodEnum<["LOW", "MEDIUM", "HIGH", "CRITICAL"]>;
export declare const FailBehaviorSchema: z.ZodEnum<["CLOSED", "OPEN"]>;
export declare const CreateAgentSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    policyId: z.ZodOptional<z.ZodString>;
    failBehavior: z.ZodDefault<z.ZodEnum<["CLOSED", "OPEN"]>>;
    riskTier: z.ZodDefault<z.ZodEnum<["LOW", "MEDIUM", "HIGH", "CRITICAL"]>>;
    framework: z.ZodOptional<z.ZodEnum<["LANGCHAIN", "OPENAI_SDK", "CREWAI", "AUTOGEN", "LLAMAINDEX", "CUSTOM"]>>;
    frameworkVersion: z.ZodOptional<z.ZodString>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    failBehavior: "CLOSED" | "OPEN";
    riskTier: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    tags: string[];
    description?: string | undefined;
    policyId?: string | undefined;
    framework?: "LANGCHAIN" | "OPENAI_SDK" | "CREWAI" | "AUTOGEN" | "LLAMAINDEX" | "CUSTOM" | undefined;
    frameworkVersion?: string | undefined;
    metadata?: Record<string, string> | undefined;
}, {
    name: string;
    description?: string | undefined;
    policyId?: string | undefined;
    failBehavior?: "CLOSED" | "OPEN" | undefined;
    riskTier?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | undefined;
    framework?: "LANGCHAIN" | "OPENAI_SDK" | "CREWAI" | "AUTOGEN" | "LLAMAINDEX" | "CUSTOM" | undefined;
    frameworkVersion?: string | undefined;
    tags?: string[] | undefined;
    metadata?: Record<string, string> | undefined;
}>;
export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;
export declare const UpdateAgentSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    policyId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    policyVersion: z.ZodOptional<z.ZodString>;
    failBehavior: z.ZodOptional<z.ZodEnum<["CLOSED", "OPEN"]>>;
    riskTier: z.ZodOptional<z.ZodEnum<["LOW", "MEDIUM", "HIGH", "CRITICAL"]>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    description?: string | null | undefined;
    policyId?: string | null | undefined;
    failBehavior?: "CLOSED" | "OPEN" | undefined;
    riskTier?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | undefined;
    tags?: string[] | undefined;
    metadata?: Record<string, string> | undefined;
    policyVersion?: string | undefined;
}, {
    name?: string | undefined;
    description?: string | null | undefined;
    policyId?: string | null | undefined;
    failBehavior?: "CLOSED" | "OPEN" | undefined;
    riskTier?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | undefined;
    tags?: string[] | undefined;
    metadata?: Record<string, string> | undefined;
    policyVersion?: string | undefined;
}>;
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>;
export declare const ListAgentsQuerySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["ACTIVE", "KILLED", "QUARANTINED", "INACTIVE"]>>;
    riskTier: z.ZodOptional<z.ZodEnum<["LOW", "MEDIUM", "HIGH", "CRITICAL"]>>;
    policyId: z.ZodOptional<z.ZodString>;
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    policyId?: string | undefined;
    riskTier?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | undefined;
    status?: "ACTIVE" | "KILLED" | "QUARANTINED" | "INACTIVE" | undefined;
    cursor?: string | undefined;
}, {
    policyId?: string | undefined;
    riskTier?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | undefined;
    status?: "ACTIVE" | "KILLED" | "QUARANTINED" | "INACTIVE" | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
}>;
export type ListAgentsQuery = z.infer<typeof ListAgentsQuerySchema>;
//# sourceMappingURL=agent.d.ts.map
/**
 * Action request / evaluation schemas
 */
import { z } from 'zod';
export declare const ActionRequestSchema: z.ZodObject<{
    id: z.ZodString;
    agentId: z.ZodString;
    tool: z.ZodString;
    params: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    inputDataLabels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    timestamp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    agentId: string;
    tool: string;
    params: Record<string, unknown>;
    inputDataLabels: string[];
    timestamp: string;
}, {
    id: string;
    agentId: string;
    tool: string;
    timestamp: string;
    params?: Record<string, unknown> | undefined;
    inputDataLabels?: string[] | undefined;
}>;
export type ActionRequest = z.infer<typeof ActionRequestSchema>;
export declare const AgentContextSchema: z.ZodObject<{
    agentId: z.ZodString;
    sessionId: z.ZodString;
    policyVersion: z.ZodString;
    tenantId: z.ZodOptional<z.ZodString>;
    sessionContext: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    agentId: string;
    sessionId: string;
    policyVersion: string;
    tenantId?: string | undefined;
    sessionContext?: Record<string, unknown> | undefined;
}, {
    agentId: string;
    sessionId: string;
    policyVersion: string;
    tenantId?: string | undefined;
    sessionContext?: Record<string, unknown> | undefined;
}>;
export type AgentContext = z.infer<typeof AgentContextSchema>;
/** Schema for POST /v1/actions/evaluate */
export declare const EvaluateActionSchema: z.ZodObject<{
    agentId: z.ZodString;
    sessionId: z.ZodString;
    tool: z.ZodString;
    params: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    inputDataLabels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    agentId: string;
    tool: string;
    params: Record<string, unknown>;
    inputDataLabels: string[];
    sessionId: string;
    context?: Record<string, unknown> | undefined;
}, {
    agentId: string;
    tool: string;
    sessionId: string;
    params?: Record<string, unknown> | undefined;
    inputDataLabels?: string[] | undefined;
    context?: Record<string, unknown> | undefined;
}>;
export type EvaluateActionInput = z.infer<typeof EvaluateActionSchema>;
/** Telemetry batch ingest schema — matches Python SDK emitter format */
export declare const TelemetryEventSchema: z.ZodObject<{
    clientEventId: z.ZodString;
    sessionId: z.ZodString;
    occurredAt: z.ZodString;
    processingMs: z.ZodNumber;
    actionType: z.ZodString;
    toolName: z.ZodOptional<z.ZodString>;
    toolTarget: z.ZodOptional<z.ZodString>;
    actionParams: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    decision: z.ZodString;
    matchedRuleId: z.ZodOptional<z.ZodString>;
    matchedRuleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    blockReason: z.ZodOptional<z.ZodString>;
    riskScore: z.ZodDefault<z.ZodNumber>;
    executionMs: z.ZodOptional<z.ZodNumber>;
    policyVersion: z.ZodOptional<z.ZodString>;
    inputDataLabels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    outputDataLabels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    planningTraceSummary: z.ZodOptional<z.ZodString>;
    ragSourceIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    priorEventIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    inputDataLabels: string[];
    sessionId: string;
    clientEventId: string;
    occurredAt: string;
    processingMs: number;
    actionType: string;
    decision: string;
    matchedRuleIds: string[];
    riskScore: number;
    outputDataLabels: string[];
    ragSourceIds: string[];
    priorEventIds: string[];
    policyVersion?: string | undefined;
    toolName?: string | undefined;
    toolTarget?: string | undefined;
    actionParams?: Record<string, unknown> | undefined;
    matchedRuleId?: string | undefined;
    blockReason?: string | undefined;
    executionMs?: number | undefined;
    planningTraceSummary?: string | undefined;
}, {
    sessionId: string;
    clientEventId: string;
    occurredAt: string;
    processingMs: number;
    actionType: string;
    decision: string;
    inputDataLabels?: string[] | undefined;
    policyVersion?: string | undefined;
    toolName?: string | undefined;
    toolTarget?: string | undefined;
    actionParams?: Record<string, unknown> | undefined;
    matchedRuleId?: string | undefined;
    matchedRuleIds?: string[] | undefined;
    blockReason?: string | undefined;
    riskScore?: number | undefined;
    executionMs?: number | undefined;
    outputDataLabels?: string[] | undefined;
    planningTraceSummary?: string | undefined;
    ragSourceIds?: string[] | undefined;
    priorEventIds?: string[] | undefined;
}>;
export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;
export declare const TelemetryBatchSchema: z.ZodObject<{
    agentId: z.ZodString;
    events: z.ZodArray<z.ZodObject<{
        clientEventId: z.ZodString;
        sessionId: z.ZodString;
        occurredAt: z.ZodString;
        processingMs: z.ZodNumber;
        actionType: z.ZodString;
        toolName: z.ZodOptional<z.ZodString>;
        toolTarget: z.ZodOptional<z.ZodString>;
        actionParams: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        decision: z.ZodString;
        matchedRuleId: z.ZodOptional<z.ZodString>;
        matchedRuleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        blockReason: z.ZodOptional<z.ZodString>;
        riskScore: z.ZodDefault<z.ZodNumber>;
        executionMs: z.ZodOptional<z.ZodNumber>;
        policyVersion: z.ZodOptional<z.ZodString>;
        inputDataLabels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        outputDataLabels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        planningTraceSummary: z.ZodOptional<z.ZodString>;
        ragSourceIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        priorEventIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        inputDataLabels: string[];
        sessionId: string;
        clientEventId: string;
        occurredAt: string;
        processingMs: number;
        actionType: string;
        decision: string;
        matchedRuleIds: string[];
        riskScore: number;
        outputDataLabels: string[];
        ragSourceIds: string[];
        priorEventIds: string[];
        policyVersion?: string | undefined;
        toolName?: string | undefined;
        toolTarget?: string | undefined;
        actionParams?: Record<string, unknown> | undefined;
        matchedRuleId?: string | undefined;
        blockReason?: string | undefined;
        executionMs?: number | undefined;
        planningTraceSummary?: string | undefined;
    }, {
        sessionId: string;
        clientEventId: string;
        occurredAt: string;
        processingMs: number;
        actionType: string;
        decision: string;
        inputDataLabels?: string[] | undefined;
        policyVersion?: string | undefined;
        toolName?: string | undefined;
        toolTarget?: string | undefined;
        actionParams?: Record<string, unknown> | undefined;
        matchedRuleId?: string | undefined;
        matchedRuleIds?: string[] | undefined;
        blockReason?: string | undefined;
        riskScore?: number | undefined;
        executionMs?: number | undefined;
        outputDataLabels?: string[] | undefined;
        planningTraceSummary?: string | undefined;
        ragSourceIds?: string[] | undefined;
        priorEventIds?: string[] | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    agentId: string;
    events: {
        inputDataLabels: string[];
        sessionId: string;
        clientEventId: string;
        occurredAt: string;
        processingMs: number;
        actionType: string;
        decision: string;
        matchedRuleIds: string[];
        riskScore: number;
        outputDataLabels: string[];
        ragSourceIds: string[];
        priorEventIds: string[];
        policyVersion?: string | undefined;
        toolName?: string | undefined;
        toolTarget?: string | undefined;
        actionParams?: Record<string, unknown> | undefined;
        matchedRuleId?: string | undefined;
        blockReason?: string | undefined;
        executionMs?: number | undefined;
        planningTraceSummary?: string | undefined;
    }[];
}, {
    agentId: string;
    events: {
        sessionId: string;
        clientEventId: string;
        occurredAt: string;
        processingMs: number;
        actionType: string;
        decision: string;
        inputDataLabels?: string[] | undefined;
        policyVersion?: string | undefined;
        toolName?: string | undefined;
        toolTarget?: string | undefined;
        actionParams?: Record<string, unknown> | undefined;
        matchedRuleId?: string | undefined;
        matchedRuleIds?: string[] | undefined;
        blockReason?: string | undefined;
        riskScore?: number | undefined;
        executionMs?: number | undefined;
        outputDataLabels?: string[] | undefined;
        planningTraceSummary?: string | undefined;
        ragSourceIds?: string[] | undefined;
        priorEventIds?: string[] | undefined;
    }[];
}>;
export type TelemetryBatchInput = z.infer<typeof TelemetryBatchSchema>;
//# sourceMappingURL=action.d.ts.map
/**
 * Action request / evaluation schemas
 */
import { z } from 'zod';
export const ActionRequestSchema = z.object({
    id: z.string().uuid(),
    agentId: z.string().min(1),
    tool: z.string().min(1),
    params: z.record(z.string(), z.unknown()).default({}),
    inputDataLabels: z.array(z.string()).default([]),
    timestamp: z.string().datetime(),
});
export const AgentContextSchema = z.object({
    agentId: z.string().min(1),
    sessionId: z.string().min(1),
    policyVersion: z.string(),
    tenantId: z.string().optional(),
    sessionContext: z.record(z.string(), z.unknown()).optional(),
});
/** Schema for POST /v1/actions/evaluate */
export const EvaluateActionSchema = z.object({
    agentId: z.string().min(1),
    sessionId: z.string().min(1),
    tool: z.string().min(1).max(200),
    params: z.record(z.string(), z.unknown()).default({}),
    inputDataLabels: z.array(z.string().max(50)).default([]),
    context: z.record(z.string(), z.unknown()).optional(),
});
/** Telemetry batch ingest schema — matches Python SDK emitter format */
export const TelemetryEventSchema = z.object({
    clientEventId: z.string().min(1).max(100),
    sessionId: z.string().min(1),
    occurredAt: z.string().datetime(),
    processingMs: z.number().int().min(0).max(60_000),
    actionType: z.string().max(50),
    toolName: z.string().max(200).optional(),
    toolTarget: z.string().max(500).optional(),
    actionParams: z.record(z.string(), z.unknown()).optional(),
    decision: z.string().max(50),
    matchedRuleId: z.string().max(200).optional(),
    matchedRuleIds: z.array(z.string().max(200)).default([]),
    blockReason: z.string().max(1000).optional(),
    riskScore: z.number().int().min(0).max(1000).default(0),
    executionMs: z.number().int().min(0).optional(),
    policyVersion: z.string().max(20).optional(),
    inputDataLabels: z.array(z.string().max(50)).default([]),
    outputDataLabels: z.array(z.string().max(50)).default([]),
    planningTraceSummary: z.string().max(1024).optional(),
    ragSourceIds: z.array(z.string().max(200)).default([]),
    priorEventIds: z.array(z.string()).max(10).default([]),
});
export const TelemetryBatchSchema = z.object({
    agentId: z.string().min(1),
    events: z.array(TelemetryEventSchema).min(1).max(1000),
});
//# sourceMappingURL=action.js.map
/**
 * HITL (Human-in-the-loop) gate routes.
 *
 * GET  /v1/hitl/pending           — list pending gates (operator queue)
 * GET  /v1/hitl/:gateId           — get gate details
 * POST /v1/hitl/:gateId/approve   — approve gate
 * POST /v1/hitl/:gateId/reject    — reject gate
 * GET  /v1/hitl/:gateId/poll      — long-poll for resolution (SDK)
 * POST /v1/hitl                   — create gate (SDK: called on require_approval)
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { HITLService, gateToResponse } from '../services/hitl.js';
import { getContext } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';

export const hitlRouter = new Hono();

const CreateGateSchema = z.object({
  agentId: z.string().min(1),
  sessionId: z.string().min(1),
  auditEventId: z.string().optional(),
  toolName: z.string().max(200).optional(),
  toolParams: z.record(z.string(), z.unknown()).optional(),
  matchedRuleId: z.string().min(1),
  timeoutSec: z.number().int().positive().max(3600).optional(),
  onTimeout: z.enum(['block', 'allow']).optional(),
  webhookUrl: z.string().url().optional(),
});

const ResolveGateSchema = z.object({
  note: z.string().max(1000).optional(),
});

/** GET /v1/hitl/pending — list pending gates */
hitlRouter.get('/pending', async (c) => {
  const ctx = getContext(c);
  const service = new HITLService(prisma, ctx, redis);

  const limit = Number(c.req.query('limit') ?? '50');
  const cursor = c.req.query('cursor');

  const gates = await service.listPendingGates(Math.min(limit, 100), cursor);

  return c.json({
    data: gates.map(gateToResponse),
    pagination: {
      cursor: gates.length === limit ? (gates[gates.length - 1]?.id ?? null) : null,
      hasMore: gates.length === limit,
    },
  });
});

/** POST /v1/hitl — create a gate (called by SDK on require_approval) */
hitlRouter.post('/', async (c) => {
  const ctx = getContext(c);
  const service = new HITLService(prisma, ctx, redis);

  const body = await c.req.json<unknown>();
  const input = CreateGateSchema.parse(body);

  const gate = await service.createGate(input);

  return c.json(gateToResponse(gate), 201);
});

/** GET /v1/hitl/:gateId — get gate details */
hitlRouter.get('/:gateId', async (c) => {
  const ctx = getContext(c);
  const gateId = c.req.param('gateId');
  const service = new HITLService(prisma, ctx, redis);

  const gate = await service.getGate(gateId);
  return c.json(gateToResponse(gate));
});

/** POST /v1/hitl/:gateId/approve — approve gate */
hitlRouter.post('/:gateId/approve', async (c) => {
  const ctx = getContext(c);
  const gateId = c.req.param('gateId');
  const service = new HITLService(prisma, ctx, redis);

  const body = await c.req.json<unknown>().catch(() => ({}));
  const input = ResolveGateSchema.parse(body);

  const gate = await service.approveGate(gateId, input);
  return c.json(gateToResponse(gate));
});

/** POST /v1/hitl/:gateId/reject — reject gate */
hitlRouter.post('/:gateId/reject', async (c) => {
  const ctx = getContext(c);
  const gateId = c.req.param('gateId');
  const service = new HITLService(prisma, ctx, redis);

  const body = await c.req.json<unknown>().catch(() => ({}));
  const input = ResolveGateSchema.parse(body);

  const gate = await service.rejectGate(gateId, input);
  return c.json(gateToResponse(gate));
});

/**
 * GET /v1/hitl/:gateId/poll — long-poll for gate resolution.
 * Used by SDK: polls every 5 seconds until resolved (max 10s server hold).
 *
 * Returns immediately if gate is resolved; otherwise holds for up to 8 seconds
 * checking every 500ms, then returns current state (SDK retries).
 */
hitlRouter.get('/:gateId/poll', async (c) => {
  const ctx = getContext(c);
  const gateId = c.req.param('gateId');
  const service = new HITLService(prisma, ctx, redis);

  const POLL_MAX_MS = 8_000;
  const POLL_INTERVAL_MS = 500;
  const deadline = Date.now() + POLL_MAX_MS;

  while (Date.now() < deadline) {
    const result = await service.pollGateStatus(gateId);

    if (result.resolved) {
      return c.json({
        gateId: result.gateId,
        status: result.status,
        resolved: true,
        decidedAt: result.decidedAt,
        decisionNote: result.decisionNote,
      });
    }

    // Not yet resolved — wait before checking again
    const remaining = deadline - Date.now();
    if (remaining < POLL_INTERVAL_MS) break;

    await sleep(POLL_INTERVAL_MS);
  }

  // Timeout — return current (still pending) state
  const final = await service.pollGateStatus(gateId);
  return c.json({
    gateId: final.gateId,
    status: final.status,
    resolved: final.resolved,
    decidedAt: final.decidedAt,
    decisionNote: final.decisionNote,
  });
});

/**
 * GET /v1/hitl/history — list resolved/historical gates.
 * Supports status filter: APPROVED | REJECTED | TIMED_OUT | CANCELLED
 */
hitlRouter.get('/history', async (c) => {
  const ctx = getContext(c);
  const service = new HITLService(prisma, ctx, redis);

  const limit = Math.min(Number(c.req.query('limit') ?? '50'), 100);
  const cursor = c.req.query('cursor');
  const status = c.req.query('status'); // optional filter

  const gates = await service.listHistoricalGates(limit, cursor, status ?? undefined);

  return c.json({
    data: gates.map(gateToResponse),
    pagination: {
      cursor: gates.length === limit ? (gates[gates.length - 1]?.id ?? null) : null,
      hasMore: gates.length === limit,
    },
  });
});

/** POST /v1/hitl/:gateId/cancel — cancel gate (internal/cleanup) */
hitlRouter.post('/:gateId/cancel', async (c) => {
  const ctx = getContext(c);
  const gateId = c.req.param('gateId');
  const service = new HITLService(prisma, ctx, redis);

  const gate = await service.cancelGate(gateId);
  return c.json(gateToResponse(gate));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

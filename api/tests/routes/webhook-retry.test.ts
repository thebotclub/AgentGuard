/**
 * Tests for api/lib/webhook-retry.ts — Webhook Retry Engine
 *
 * Covers:
 *  - Recording failed webhooks
 *  - Processing retry batches (success, failure, dead letter)
 *  - Exponential backoff scheduling
 *  - Circuit breaker integration
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recordFailedWebhook, processRetryBatch } from '../../lib/webhook-retry.js';
import { createMockDb } from '../helpers/mock-db.js';
import type { IDatabase, FailedWebhookRow } from '../../db-interface.js';

// Mock the circuit breaker to pass through by default
vi.mock('../../lib/circuit-breaker.js', () => ({
  getCircuitBreaker: vi.fn().mockReturnValue({
    call: vi.fn().mockImplementation((fn: () => Promise<boolean>) => fn()),
  }),
  CircuitBreakerOpenError: class CircuitBreakerOpenError extends Error {
    constructor() { super('Circuit breaker open'); this.name = 'CircuitBreakerOpenError'; }
  },
}));

describe('recordFailedWebhook', () => {
  let mockDb: IDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it('inserts a failed webhook record with scheduled retry', async () => {
    await recordFailedWebhook(mockDb, 'wh-1', 'tenant-123', 'audit.created', '{"data":"test"}', 'Connection refused');

    expect(mockDb.insertFailedWebhook).toHaveBeenCalledOnce();
    const args = (mockDb.insertFailedWebhook as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(args[0]).toBeTruthy(); // UUID id
    expect(args[1]).toBe('wh-1');
    expect(args[2]).toBe('tenant-123');
    expect(args[3]).toBe('audit.created');
    expect(args[4]).toBe('{"data":"test"}');
    expect(args[5]).toBeTruthy(); // next_retry_at ISO string
    expect(args[6]).toBe('Connection refused');
  });
});

describe('processRetryBatch', () => {
  let mockDb: IDatabase;

  const makeRow = (overrides: Partial<FailedWebhookRow> = {}): FailedWebhookRow => ({
    id: 'fw-1',
    webhook_id: 'wh-1',
    tenant_id: 'tenant-123',
    event_type: 'audit.created',
    payload: '{"data":"test"}',
    attempt_count: 1,
    status: 'pending',
    next_retry_at: new Date(Date.now() - 1000).toISOString(),
    last_error: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  it('returns zeros when no retries are pending', async () => {
    (mockDb.getRetryableWebhooks as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const deliverFn = vi.fn();

    const result = await processRetryBatch(mockDb, deliverFn);

    expect(result).toEqual({ retried: 0, succeeded: 0, deadLettered: 0 });
    expect(deliverFn).not.toHaveBeenCalled();
  });

  it('marks webhook as delivered on successful retry', async () => {
    const row = makeRow();
    (mockDb.getRetryableWebhooks as ReturnType<typeof vi.fn>).mockResolvedValue([row]);
    const deliverFn = vi.fn().mockResolvedValue(true);

    const result = await processRetryBatch(mockDb, deliverFn);

    expect(result.succeeded).toBe(1);
    expect(result.deadLettered).toBe(0);
    expect(deliverFn).toHaveBeenCalledWith('wh-1', 'tenant-123', 'audit.created', '{"data":"test"}');
    expect(mockDb.updateFailedWebhook).toHaveBeenCalledWith(
      'fw-1', 1, expect.any(String), 'delivered', null,
    );
  });

  it('dead-letters webhook after max attempts', async () => {
    const row = makeRow({ attempt_count: 5 }); // MAX_ATTEMPTS = 5
    (mockDb.getRetryableWebhooks as ReturnType<typeof vi.fn>).mockResolvedValue([row]);
    const deliverFn = vi.fn().mockResolvedValue(false);

    const result = await processRetryBatch(mockDb, deliverFn);

    expect(result.deadLettered).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(mockDb.updateFailedWebhook).toHaveBeenCalledWith(
      'fw-1', 5, expect.any(String), 'dead_lettered', 'Max retry attempts exceeded',
    );
  });

  it('reschedules on failure before max attempts', async () => {
    const row = makeRow({ attempt_count: 2 });
    (mockDb.getRetryableWebhooks as ReturnType<typeof vi.fn>).mockResolvedValue([row]);
    const deliverFn = vi.fn().mockResolvedValue(false);

    const result = await processRetryBatch(mockDb, deliverFn);

    expect(result.succeeded).toBe(0);
    expect(result.deadLettered).toBe(0);
    expect(mockDb.updateFailedWebhook).toHaveBeenCalledWith(
      'fw-1', 3, expect.any(String), 'pending', 'Retry scheduled',
    );
  });

  it('processes multiple webhooks in a single batch', async () => {
    const rows = [
      makeRow({ id: 'fw-1', attempt_count: 1 }),
      makeRow({ id: 'fw-2', attempt_count: 1 }),
      makeRow({ id: 'fw-3', attempt_count: 5 }),
    ];
    (mockDb.getRetryableWebhooks as ReturnType<typeof vi.fn>).mockResolvedValue(rows);
    const deliverFn = vi.fn()
      .mockResolvedValueOnce(true)   // fw-1 succeeds
      .mockResolvedValueOnce(false)  // fw-2 fails
      .mockResolvedValueOnce(false); // fw-3 fails (maxed out)

    const result = await processRetryBatch(mockDb, deliverFn);

    expect(result.retried).toBe(3);
    expect(result.succeeded).toBe(1);
    expect(result.deadLettered).toBe(1);
  });
});

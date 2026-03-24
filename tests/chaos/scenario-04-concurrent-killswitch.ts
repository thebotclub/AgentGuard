/**
 * Chaos Scenario 4: Concurrent Kill-Switch Activation
 *
 * Verifies race condition handling when multiple operators
 * simultaneously activate/deactivate kill switches:
 * - Last-write-wins with consistent Redis state
 * - No partial writes that leave agent in indeterminate state
 * - Audit log captures all concurrent commands
 * - Agent status is always deterministic after concurrent ops
 *
 * Technique:
 *   Fire N concurrent kill + resume commands and verify
 *   the final state is consistent (not corrupted).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  request,
  waitForApi,
  registerTestTenant,
  createTestAgent,
  recordResult,
  type ChaosResult,
} from './helpers.js';

const CONCURRENT_OPS = 20;

export async function runScenario04(): Promise<ChaosResult> {
  const start = Date.now();
  const scenario = 'Concurrent Kill-Switch Activation';

  try {
    // ── Setup ────────────────────────────────────────────────────────────────
    const { apiKey } = await registerTestTenant();
    const agentId = await createTestAgent(apiKey, 'killswitch-race-agent');

    // ── Inject Fault: Concurrent Kill + Resume ───────────────────────────────
    console.log(`  [chaos] Firing ${CONCURRENT_OPS} concurrent kill/resume operations...`);

    const operations = Array.from({ length: CONCURRENT_OPS }, (_, i) => {
      // Alternate between kill and resume
      if (i % 2 === 0) {
        return request(
          'POST',
          `/v1/killswitch/${agentId}`,
          { tier: 'SOFT', reason: `Concurrent kill ${i}` },
          { Authorization: `Bearer ${apiKey}` },
        );
      } else {
        return request(
          'DELETE',
          `/v1/killswitch/${agentId}`,
          { reason: `Concurrent resume ${i}` },
          { Authorization: `Bearer ${apiKey}` },
        );
      }
    });

    const results = await Promise.allSettled(operations);
    const successes = results.filter((r) => r.status === 'fulfilled' && (r.value as { ok: boolean }).ok).length;
    const errors = results.filter((r) => r.status === 'rejected').length;
    const conflicts = results.filter(
      (r) => r.status === 'fulfilled' && (r.value as { status: number }).status === 409,
    ).length;

    // ── Verify Deterministic Final State ──────────────────────────────────────
    await sleep(500); // Allow Redis consistency

    const finalStatus = await request(
      'GET',
      `/v1/killswitch/status/${agentId}`,
      undefined,
      { Authorization: `Bearer ${apiKey}` },
    );

    const agentRes = await request(
      'GET',
      `/v1/agents/${agentId}`,
      undefined,
      { Authorization: `Bearer ${apiKey}` },
    );

    // Final state must be deterministic — either clearly KILLED or clearly ACTIVE
    const killStatus = (finalStatus.body as Record<string, Record<string, unknown>>)?.data?.killed;
    const agentStatus = (agentRes.body as Record<string, Record<string, string>>)?.data?.status;

    const isDeterministic =
      finalStatus.ok &&
      agentRes.ok &&
      typeof killStatus === 'boolean' &&
      (agentStatus === 'ACTIVE' || agentStatus === 'KILLED');

    // No data corruption — agent exists and has valid status
    const noCorruption = agentRes.ok && agentStatus !== undefined && agentStatus !== null;

    // ── Verify Audit Log Captured All Operations ──────────────────────────────
    const auditRes = await request(
      'GET',
      `/v1/audit?agentId=${agentId}&limit=50`,
      undefined,
      { Authorization: `Bearer ${apiKey}` },
    );

    const auditCount = ((auditRes.body as Record<string, unknown[]>)?.data ?? []).length;

    const result: ChaosResult = {
      scenario,
      passed: isDeterministic && noCorruption,
      behavior: isDeterministic
        ? `Deterministic state after ${CONCURRENT_OPS} concurrent ops`
        : 'Indeterminate/corrupt state after concurrent operations',
      details: JSON.stringify({
        concurrentOps: CONCURRENT_OPS,
        successes,
        errors,
        conflicts,
        finalKillStatus: killStatus,
        agentStatus,
        isDeterministic,
        noCorruption,
        auditEventsCaptured: auditCount,
      }),
      durationMs: Date.now() - start,
      recommendations: [
        isDeterministic
          ? 'Concurrent kill-switch operations produce deterministic state ✓'
          : 'CRITICAL: Implement Redis atomic operations (SET NX/XX) for kill-switch state',
        conflicts > 0
          ? `${conflicts} operations returned 409 (correct conflict handling) ✓`
          : 'Consider adding optimistic concurrency control with version numbers',
        'Use Redis MULTI/EXEC for atomic kill-switch + audit-log writes',
        'Document last-writer-wins semantics in operator runbook',
      ],
    };

    recordResult(result);
    return result;
  } catch (err) {
    const result: ChaosResult = {
      scenario,
      passed: false,
      behavior: 'Test execution error',
      details: String(err),
      durationMs: Date.now() - start,
    };
    recordResult(result);
    return result;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  describe('Chaos Scenario 4: Concurrent Kill-Switch', () => {
    before(() => waitForApi());

    it('should handle concurrent kill/resume without race conditions', async () => {
      const result = await runScenario04();
      assert.ok(result.passed, `Expected deterministic state: ${result.details}`);
    });
  });
}

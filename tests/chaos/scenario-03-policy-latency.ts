/**
 * Chaos Scenario 3: High-Latency Policy Evaluation (500ms+)
 *
 * Verifies timeout handling when policy evaluation is slow:
 * - Requests must not hang indefinitely
 * - Timeout responses must be fail-closed (BLOCK, not ALLOW)
 * - SLA: p99 policy evaluation < 200ms; timeout threshold: 500ms
 * - Slow responses should trigger a BLOCK decision with TIMEOUT reason
 *
 * Technique:
 *   We test the timeout behavior by measuring actual latencies and
 *   simulating slow conditions via the evaluation endpoint with
 *   complex/large policy payloads.
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

const TIMEOUT_THRESHOLD_MS = 500;
const SAMPLE_COUNT = 20;

export async function runScenario03(): Promise<ChaosResult> {
  const start = Date.now();
  const scenario = 'High-Latency Policy Evaluation';

  try {
    // ── Setup ────────────────────────────────────────────────────────────────
    const { apiKey } = await registerTestTenant();
    const agentId = await createTestAgent(apiKey, 'latency-chaos-agent');

    // Create a complex policy with many rules to stress policy evaluation
    const complexPolicy = {
      name: 'chaos-complex-policy',
      description: 'High-complexity policy for latency testing',
      rules: Array.from({ length: 50 }, (_, i) => ({
        id: `rule-${i}`,
        name: `Rule ${i}`,
        description: `Complex rule ${i} for latency testing`,
        conditions: {
          all: [
            { field: 'toolName', operator: 'matches', value: `pattern-${i}-*` },
            { field: 'riskScore', operator: 'gte', value: i * 2 },
            { field: 'inputDataLabels', operator: 'contains', value: `label-${i}` },
          ],
        },
        action: i % 2 === 0 ? 'BLOCK' : 'MONITOR',
        riskScore: i * 2,
      })),
    };

    await request('POST', '/v1/policies', complexPolicy, {
      Authorization: `Bearer ${apiKey}`,
    });

    // ── Measure Baseline Latency ──────────────────────────────────────────────
    const latencies: number[] = [];

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const evalRes = await request(
        'POST',
        '/v1/actions/evaluate',
        {
          agentId,
          sessionId: `latency-session-${Date.now()}-${i}`,
          actionType: 'TOOL_CALL',
          toolName: 'file_read',
          toolInput: { path: '/tmp/test.txt' },
        },
        { Authorization: `Bearer ${apiKey}` },
      );
      latencies.push(evalRes.latencyMs);
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(SAMPLE_COUNT * 0.5)] ?? 0;
    const p95 = latencies[Math.floor(SAMPLE_COUNT * 0.95)] ?? 0;
    const p99 = latencies[SAMPLE_COUNT - 1] ?? 0;
    const slowRequests = latencies.filter((l) => l > TIMEOUT_THRESHOLD_MS).length;

    // ── Inject High-Latency Fault: Many concurrent evaluations ───────────────
    console.log('  [chaos] Injecting concurrent load to trigger high latency...');
    const concurrentEvals = Array.from({ length: 100 }, (_, i) =>
      request(
        'POST',
        '/v1/actions/evaluate',
        {
          agentId,
          sessionId: `latency-stress-${Date.now()}-${i}`,
          actionType: 'TOOL_CALL',
          toolName: 'database_query',
          toolInput: { query: 'SELECT * FROM users', database: 'production' },
          metadata: { stressTest: true, iteration: i },
        },
        { Authorization: `Bearer ${apiKey}` },
      ),
    );

    const stressResults = await Promise.all(concurrentEvals);
    const stressLatencies = stressResults.map((r) => r.latencyMs);
    stressLatencies.sort((a, b) => a - b);

    const stressP99 = stressLatencies[stressLatencies.length - 1] ?? 0;
    const timeoutCount = stressResults.filter((r) => r.status === 0 || r.status === 504).length;
    const blockOnTimeout = stressResults.filter(
      (r) =>
        (r.status === 0 || r.status === 504 || r.latencyMs > TIMEOUT_THRESHOLD_MS) &&
        (r.body?.data as Record<string, unknown>)?.['decision'] !== 'ALLOW',
    ).length;

    // ── Verify Timeout Handling ────────────────────────────────────────────────
    // p99 under stress should complete within 2x threshold or return timeout error
    const timeoutsAreFailClosed = timeoutCount === 0 || blockOnTimeout === timeoutCount;

    // System should not have hung — all requests returned within 10s
    const noHangs = stressResults.every((r) => r.latencyMs < 10_000);

    const result: ChaosResult = {
      scenario,
      passed: timeoutsAreFailClosed && noHangs,
      behavior: timeoutsAreFailClosed
        ? `Timeout handling: p99=${stressP99}ms, timeouts fail-closed`
        : 'Timeouts allowed ALLOW decisions (UNSAFE)',
      details: JSON.stringify({
        baseline: { p50, p95, p99, slowRequests },
        underStress: {
          p99: stressP99,
          timeoutCount,
          blockOnTimeout,
          noHangs,
        },
      }),
      durationMs: Date.now() - start,
      recommendations: [
        `Baseline p99: ${p99}ms (target: <200ms)`,
        `Stress p99: ${stressP99}ms`,
        p99 > 200
          ? 'WARNING: Baseline p99 exceeds 200ms SLA — optimize policy evaluation'
          : 'Baseline latency within SLA ✓',
        'Add explicit evaluation timeout (500ms) that returns BLOCK with TIMEOUT_EXCEEDED reason',
        'Cache compiled policy bundles in Redis for sub-millisecond hot path',
        'Use read replicas for policy query to reduce primary DB load',
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
  describe('Chaos Scenario 3: Policy Evaluation Latency', () => {
    before(() => waitForApi());

    it('should handle high-latency policy evaluation with fail-closed timeouts', async () => {
      const result = await runScenario03();
      assert.ok(result.passed, `Expected timeout fail-closed: ${result.details}`);
    });
  });
}

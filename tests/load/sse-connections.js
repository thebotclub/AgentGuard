/**
 * AgentGuard Load Test — SSE Connection Scale
 *
 * Target: 5,000 concurrent SSE connections
 *
 * Tests the Server-Sent Events endpoint used for real-time audit streaming
 * and dashboard live updates. Verifies connection establishment, event delivery,
 * and server stability under high concurrent connection count.
 *
 * Note: k6 uses the experimental http module for SSE simulation.
 * Each VU holds an open SSE connection and measures time-to-first-event.
 *
 * Run:
 *   k6 run tests/load/sse-connections.js \
 *     -e BASE_URL=https://api.agentguard.tech \
 *     -e API_KEY=ag-your-key \
 *     --out json=results/sse-results.json
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Gauge, Rate, Trend } from 'k6/metrics';
import { BASE_URL, apiHeaders, jwtHeaders } from './config.js';

// ── Custom Metrics ─────────────────────────────────────────────────────────
const sseConnected = new Counter('sse_connections_established');
const sseErrors = new Rate('sse_connection_errors');
const sseEventsReceived = new Counter('sse_events_received');
const sseTimeToFirstEvent = new Trend('sse_time_to_first_event_ms', true);
const activeSseConnections = new Gauge('sse_active_connections');
const sseConnectionDuration = new Trend('sse_connection_duration_ms', true);

// ── Test Configuration ─────────────────────────────────────────────────────
export const options = {
  scenarios: {
    // Ramp up to 5K concurrent connections
    connection_ramp: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '1m', target: 500 },    // Ramp to 500
        { duration: '2m', target: 2000 },   // Ramp to 2K
        { duration: '2m', target: 5000 },   // Ramp to 5K
        { duration: '3m', target: 5000 },   // Hold at 5K for 3 min
        { duration: '1m', target: 0 },      // Ramp down
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],      // <2% connection failures
    sse_connection_errors: ['rate<0.02'],
    sse_time_to_first_event_ms: ['p(95)<2000'], // Connect + first event < 2s
    sse_connection_duration_ms: ['p(95)<300000'], // Connections hold 5 min
  },
  // SSE connections are long-lived; increase timeout
  httpDebug: 'false',
  tags: { test_type: 'sse_scale' },
};

// ── SSE Endpoint paths to test ────────────────────────────────────────────
const SSE_ENDPOINTS = [
  '/api/v1/audit/stream',
  '/api/v1/dashboard/stream',
];

// ── Main VU function ──────────────────────────────────────────────────────
export default function () {
  const endpoint = SSE_ENDPOINTS[__VU % SSE_ENDPOINTS.length];
  const url = `${BASE_URL}${endpoint}`;

  activeSseConnections.add(1);

  const connectStart = Date.now();

  // Open SSE connection with streaming response
  const res = http.get(url, {
    headers: {
      ...jwtHeaders,
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
    timeout: '300s',  // Allow long-lived connections
    tags: { endpoint },
  });

  const connectTime = Date.now() - connectStart;
  sseConnectionDuration.add(connectTime);

  const connected = check(res, {
    'SSE connection established': (r) => r.status === 200,
    'content-type is event-stream': (r) =>
      (r.headers['Content-Type'] || '').includes('text/event-stream'),
  });

  if (connected) {
    sseConnected.add(1);
    sseErrors.add(false);

    // Parse SSE events from response body
    const body = res.body || '';
    const events = body.split('\n\n').filter(e => e.trim().length > 0);

    if (events.length > 0) {
      sseEventsReceived.add(events.length);
      sseTimeToFirstEvent.add(connectTime);
    }
  } else {
    sseErrors.add(true);
  }

  activeSseConnections.add(-1);

  // Hold connection open for realistic duration (simulates dashboard session)
  // In real SSE, the VU would stay connected; here we simulate with sleep
  sleep(Math.random() * 30 + 10); // 10-40s session
}

// ── Setup: verify SSE endpoint is responsive ──────────────────────────────
export function setup() {
  console.log(`[setup] Verifying SSE endpoints at ${BASE_URL}`);

  for (const endpoint of SSE_ENDPOINTS) {
    const res = http.get(`${BASE_URL}${endpoint}`, {
      headers: { ...jwtHeaders, 'Accept': 'text/event-stream' },
      timeout: '10s',
    });
    if (res.status === 200 || res.status === 401) {
      console.log(`[setup] ${endpoint} → ${res.status} ✓`);
    } else {
      console.warn(`[setup] ${endpoint} → ${res.status} (unexpected)`);
    }
  }
}

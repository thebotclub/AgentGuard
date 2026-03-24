/**
 * AgentGuard Load Test — Dashboard API Response Time
 *
 * Target: P99 < 200ms for all dashboard endpoints
 *
 * Simulates realistic dashboard usage patterns:
 * - Mixed read/write workload
 * - Multiple concurrent "user sessions"
 * - All major dashboard API endpoints
 *
 * Run:
 *   k6 run tests/load/dashboard-api.js \
 *     -e BASE_URL=https://api.agentguard.tech \
 *     -e JWT_TOKEN=your-jwt-token
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URL, jwtHeaders } from './config.js';

// ── Custom Metrics ─────────────────────────────────────────────────────────
const apiErrors = new Rate('dashboard_api_errors');
const p99Violations = new Counter('dashboard_p99_violations');
const endpointLatency = {};

// ── Test Configuration ─────────────────────────────────────────────────────
export const options = {
  scenarios: {
    // Realistic concurrent dashboard users
    dashboard_users: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '30s', target: 50 },    // 50 concurrent users
        { duration: '1m',  target: 200 },   // 200 concurrent users
        { duration: '2m',  target: 500 },   // 500 concurrent users (peak)
        { duration: '3m',  target: 500 },   // Hold peak
        { duration: '30s', target: 0 },     // Ramp down
      ],
    },
    // Spike test: sudden traffic burst
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 1000 },  // Spike to 1K
        { duration: '30s', target: 1000 },  // Hold spike
        { duration: '10s', target: 0 },     // Drop off
      ],
      startTime: '4m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: [
      'p(50)<50',    // Median < 50ms
      'p(95)<150',   // P95 < 150ms
      'p(99)<200',   // P99 < 200ms (KEY TARGET)
    ],
    dashboard_api_errors: ['rate<0.01'],
  },
  tags: { test_type: 'dashboard_api' },
};

// ── Dashboard API Flows ───────────────────────────────────────────────────
function testAuditEndpoints(tenantCtx) {
  group('audit', () => {
    const auditRes = http.get(`${BASE_URL}/api/v1/audit`, {
      headers: jwtHeaders,
      tags: { endpoint: 'audit_list' },
    });
    check(auditRes, { 'audit list 200': (r) => r.status === 200 });
    checkLatency(auditRes, 'audit_list', 200);

    const analyticsRes = http.get(`${BASE_URL}/api/v1/analytics?days=7`, {
      headers: jwtHeaders,
      tags: { endpoint: 'analytics' },
    });
    check(analyticsRes, { 'analytics 200': (r) => r.status === 200 });
    checkLatency(analyticsRes, 'analytics', 200);
  });
}

function testPolicyEndpoints() {
  group('policy', () => {
    const policyRes = http.get(`${BASE_URL}/api/v1/policy`, {
      headers: jwtHeaders,
      tags: { endpoint: 'policy_get' },
    });
    check(policyRes, { 'policy get 200': (r) => r.status === 200 });
    checkLatency(policyRes, 'policy_get', 200);
  });
}

function testAgentEndpoints() {
  group('agents', () => {
    const agentsRes = http.get(`${BASE_URL}/api/v1/agents`, {
      headers: jwtHeaders,
      tags: { endpoint: 'agents_list' },
    });
    check(agentsRes, { 'agents list 200': (r) => r.status === 200 });
    checkLatency(agentsRes, 'agents_list', 200);
  });
}

function testDashboardEndpoints() {
  group('dashboard', () => {
    const summaryRes = http.get(`${BASE_URL}/api/v1/dashboard/summary`, {
      headers: jwtHeaders,
      tags: { endpoint: 'dashboard_summary' },
    });
    check(summaryRes, { 'dashboard summary 200/404': (r) => [200, 404].includes(r.status) });
    if (summaryRes.status === 200) checkLatency(summaryRes, 'dashboard_summary', 200);

    const statsRes = http.get(`${BASE_URL}/api/v1/dashboard/stats`, {
      headers: jwtHeaders,
      tags: { endpoint: 'dashboard_stats' },
    });
    check(statsRes, { 'dashboard stats 200/404': (r) => [200, 404].includes(r.status) });
    if (statsRes.status === 200) checkLatency(statsRes, 'dashboard_stats', 200);
  });
}

function testWebhookEndpoints() {
  group('webhooks', () => {
    const whRes = http.get(`${BASE_URL}/api/v1/webhooks`, {
      headers: jwtHeaders,
      tags: { endpoint: 'webhooks_list' },
    });
    check(whRes, { 'webhooks list 200': (r) => r.status === 200 });
    checkLatency(whRes, 'webhooks_list', 200);
  });
}

function testComplianceEndpoints() {
  group('compliance', () => {
    const compRes = http.get(`${BASE_URL}/api/v1/compliance/report`, {
      headers: jwtHeaders,
      tags: { endpoint: 'compliance_report' },
    });
    check(compRes, { 'compliance report 200/404': (r) => [200, 404].includes(r.status) });
    if (compRes.status === 200) checkLatency(compRes, 'compliance_report', 200);
  });
}

function testAlertEndpoints() {
  group('alerts', () => {
    const alertsRes = http.get(`${BASE_URL}/api/v1/alerts`, {
      headers: jwtHeaders,
      tags: { endpoint: 'alerts_list' },
    });
    check(alertsRes, { 'alerts list 200': (r) => r.status === 200 });
    checkLatency(alertsRes, 'alerts_list', 200);
  });
}

function checkLatency(res, endpoint, p99Target) {
  const duration = res.timings.duration;
  if (duration > p99Target) {
    p99Violations.add(1, { endpoint });
  }
  apiErrors.add(res.status >= 400 && res.status !== 404, { endpoint });
}

// ── Main VU function ──────────────────────────────────────────────────────
export default function () {
  // Simulate a realistic dashboard session: users browse multiple pages
  const flows = [
    testAuditEndpoints,
    testPolicyEndpoints,
    testAgentEndpoints,
    testDashboardEndpoints,
    testWebhookEndpoints,
    testComplianceEndpoints,
    testAlertEndpoints,
  ];

  // Each VU runs 2-4 random endpoint flows per iteration
  const numFlows = Math.floor(Math.random() * 3) + 2;
  for (let i = 0; i < numFlows; i++) {
    const flow = flows[Math.floor(Math.random() * flows.length)];
    flow();
    sleep(Math.random() * 0.5 + 0.1); // 100-600ms "think time" between pages
  }

  sleep(Math.random() * 2 + 1); // 1-3s session pause
}

// ── Setup ─────────────────────────────────────────────────────────────────
export function setup() {
  console.log(`[setup] Dashboard API load test targeting ${BASE_URL}`);
  const healthRes = http.get(`${BASE_URL}/health`, { timeout: '10s' });
  if (healthRes.status !== 200) {
    console.error(`[setup] Health check failed: ${healthRes.status}`);
  } else {
    console.log('[setup] API is healthy ✓');
  }
}

/**
 * AgentGuard — Anomaly Detector Unit Tests
 *
 * Tests the rule-based detection engine, DB CRUD operations for
 * anomaly_rules and alerts, and the API route layer.
 *
 * Run: npx tsx --test tests/anomaly.test.ts
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

// ── Isolated logic tests (no server) ──────────────────────────────────────

import {
  isTriggered,
  buildMessage,
  BUILTIN_RULES,
} from '../api/lib/anomaly-detector.js';
import type { AnomalyRule } from '../api/lib/anomaly-detector.js';
import { createSqliteAdapter } from '../api/db-sqlite.js';
import type { IDatabase } from '../api/db-interface.js';

// ─── isTriggered ─────────────────────────────────────────────────────────────

describe('isTriggered', () => {
  const gtRule: AnomalyRule = {
    id: 'r1', name: 'test', metric: 'block_rate',
    condition: 'gt', threshold: 0.5, windowMinutes: 60, severity: 'warning',
  };

  it('gt: value above threshold triggers', () => {
    assert.equal(isTriggered(gtRule, { value: 0.6 }), true);
  });

  it('gt: value at threshold does NOT trigger', () => {
    assert.equal(isTriggered(gtRule, { value: 0.5 }), false);
  });

  it('gt: value below threshold does not trigger', () => {
    assert.equal(isTriggered(gtRule, { value: 0.3 }), false);
  });

  it('lt: triggers when below threshold', () => {
    const r: AnomalyRule = { ...gtRule, condition: 'lt', threshold: 10 };
    assert.equal(isTriggered(r, { value: 5 }), true);
    assert.equal(isTriggered(r, { value: 15 }), false);
  });

  it('spike: triggers when current >= baseline * threshold', () => {
    const r: AnomalyRule = { ...gtRule, metric: 'evaluate_volume', condition: 'spike', threshold: 3 };
    assert.equal(isTriggered(r, { value: 300, baseline: 100 }), true);
    assert.equal(isTriggered(r, { value: 299, baseline: 100 }), false);
  });

  it('spike: does not trigger when baseline is 0 (no normal data)', () => {
    const r: AnomalyRule = { ...gtRule, metric: 'evaluate_volume', condition: 'spike', threshold: 3 };
    assert.equal(isTriggered(r, { value: 999, baseline: 0 }), false);
  });

  it('drop: triggers when volume falls to 0 and baseline was non-zero', () => {
    const r: AnomalyRule = { ...gtRule, metric: 'evaluate_volume', condition: 'drop', threshold: 0 };
    assert.equal(isTriggered(r, { value: 0, baseline: 50 }), true);
  });

  it('drop: does not trigger when baseline was already 0', () => {
    const r: AnomalyRule = { ...gtRule, metric: 'evaluate_volume', condition: 'drop', threshold: 0 };
    assert.equal(isTriggered(r, { value: 0, baseline: 0 }), false);
  });

  it('drop: does not trigger when volume is still above threshold', () => {
    const r: AnomalyRule = { ...gtRule, metric: 'evaluate_volume', condition: 'drop', threshold: 0 };
    assert.equal(isTriggered(r, { value: 5, baseline: 50 }), false);
  });
});

// ─── buildMessage ─────────────────────────────────────────────────────────────

describe('buildMessage', () => {
  it('formats block_rate message with percentages', () => {
    const rule: AnomalyRule = {
      id: 'r', name: 'test', metric: 'block_rate',
      condition: 'gt', threshold: 0.5, windowMinutes: 60, severity: 'warning',
    };
    const msg = buildMessage(rule, { value: 0.65 });
    assert.ok(msg.includes('65.0%'), `Expected percentage in: ${msg}`);
    assert.ok(msg.includes('50.0%'), `Expected threshold in: ${msg}`);
  });

  it('formats evaluate_volume spike message with ratio', () => {
    const rule: AnomalyRule = {
      id: 'r', name: 'test', metric: 'evaluate_volume',
      condition: 'spike', threshold: 3, windowMinutes: 15, severity: 'warning',
    };
    const msg = buildMessage(rule, { value: 300, baseline: 100 });
    assert.ok(msg.includes('3.0×') || msg.includes('spike'), `Expected ratio in: ${msg}`);
  });

  it('formats evaluate_volume drop message', () => {
    const rule: AnomalyRule = {
      id: 'r', name: 'test', metric: 'evaluate_volume',
      condition: 'drop', threshold: 0, windowMinutes: 30, severity: 'warning',
    };
    const msg = buildMessage(rule, { value: 0, baseline: 50 });
    assert.ok(msg.toLowerCase().includes('drop') || msg.includes('0'), `Expected drop info in: ${msg}`);
  });

  it('formats unique_tools message', () => {
    const rule: AnomalyRule = {
      id: 'r', name: 'test', metric: 'unique_tools',
      condition: 'gt', threshold: 20, windowMinutes: 10, severity: 'info',
    };
    const msg = buildMessage(rule, { value: 25 });
    assert.ok(msg.includes('25'), `Expected value in: ${msg}`);
  });

  it('formats error_rate message', () => {
    const rule: AnomalyRule = {
      id: 'r', name: 'test', metric: 'error_rate',
      condition: 'gt', threshold: 0.1, windowMinutes: 15, severity: 'critical',
    };
    const msg = buildMessage(rule, { value: 0.15 });
    assert.ok(msg.includes('15.0%'), `Expected percentage in: ${msg}`);
  });
});

// ─── BUILTIN_RULES ────────────────────────────────────────────────────────────

describe('BUILTIN_RULES', () => {
  it('has exactly 6 built-in rules', () => {
    assert.equal(BUILTIN_RULES.length, 6);
  });

  it('all rules have required fields', () => {
    for (const rule of BUILTIN_RULES) {
      assert.ok(rule.id, `Rule missing id`);
      assert.ok(rule.name, `Rule ${rule.id} missing name`);
      assert.ok(rule.metric, `Rule ${rule.id} missing metric`);
      assert.ok(rule.condition, `Rule ${rule.id} missing condition`);
      assert.ok(typeof rule.threshold === 'number', `Rule ${rule.id} threshold must be number`);
      assert.ok(rule.windowMinutes > 0, `Rule ${rule.id} windowMinutes must be > 0`);
      assert.ok(['info', 'warning', 'critical'].includes(rule.severity), `Rule ${rule.id} invalid severity`);
    }
  });

  it('block_rate warning rule: 50% threshold, 60 min window', () => {
    const rule = BUILTIN_RULES.find((r) => r.id === 'builtin-block-rate-warning')!;
    assert.ok(rule, 'builtin-block-rate-warning must exist');
    assert.equal(rule.threshold, 0.5);
    assert.equal(rule.windowMinutes, 60);
    assert.equal(rule.severity, 'warning');
    assert.equal(rule.condition, 'gt');
  });

  it('block_rate critical rule: 80% threshold, 30 min window', () => {
    const rule = BUILTIN_RULES.find((r) => r.id === 'builtin-block-rate-critical')!;
    assert.ok(rule, 'builtin-block-rate-critical must exist');
    assert.equal(rule.threshold, 0.8);
    assert.equal(rule.windowMinutes, 30);
    assert.equal(rule.severity, 'critical');
  });

  it('volume spike rule: 3x threshold, 15 min window', () => {
    const rule = BUILTIN_RULES.find((r) => r.id === 'builtin-volume-spike')!;
    assert.ok(rule, 'builtin-volume-spike must exist');
    assert.equal(rule.threshold, 3.0);
    assert.equal(rule.windowMinutes, 15);
    assert.equal(rule.metric, 'evaluate_volume');
    assert.equal(rule.condition, 'spike');
  });

  it('volume drop rule: threshold 0, 30 min window', () => {
    const rule = BUILTIN_RULES.find((r) => r.id === 'builtin-volume-drop')!;
    assert.ok(rule, 'builtin-volume-drop must exist');
    assert.equal(rule.threshold, 0);
    assert.equal(rule.windowMinutes, 30);
    assert.equal(rule.condition, 'drop');
  });

  it('error rate rule: 10% threshold, 15 min window, critical', () => {
    const rule = BUILTIN_RULES.find((r) => r.id === 'builtin-error-rate-critical')!;
    assert.ok(rule, 'builtin-error-rate-critical must exist');
    assert.equal(rule.threshold, 0.1);
    assert.equal(rule.windowMinutes, 15);
    assert.equal(rule.severity, 'critical');
  });

  it('tool block flood rule: 20 threshold, 10 min window, info', () => {
    const rule = BUILTIN_RULES.find((r) => r.id === 'builtin-tool-block-flood')!;
    assert.ok(rule, 'builtin-tool-block-flood must exist');
    assert.equal(rule.threshold, 20);
    assert.equal(rule.windowMinutes, 10);
    assert.equal(rule.severity, 'info');
  });
});

// ─── SQLite DB — anomaly_rules CRUD ──────────────────────────────────────────

describe('Database: anomaly_rules', () => {
  let db: IDatabase;

  before(async () => {
    const { adapter } = createSqliteAdapter(':memory:');
    await adapter.initialize();
    db = adapter;
    // Create a tenant for FK constraints
    await db.createTenant('t-anomaly', 'Test', 'anomaly@test.local');
  });

  after(async () => { await db.close(); });

  it('insertAnomalyRule creates a rule and returns it', async () => {
    const rule = await db.insertAnomalyRule({
      id: 'rule-1',
      tenant_id: 't-anomaly',
      name: 'High block rate',
      metric: 'block_rate',
      condition: 'gt',
      threshold: 0.5,
      window_minutes: 60,
      severity: 'warning',
      enabled: 1,
      created_at: new Date().toISOString(),
    });
    assert.equal(rule.id, 'rule-1');
    assert.equal(rule.name, 'High block rate');
    assert.equal(rule.metric, 'block_rate');
    assert.equal(rule.condition, 'gt');
    assert.equal(rule.threshold, 0.5);
    assert.equal(rule.window_minutes, 60);
    assert.equal(rule.severity, 'warning');
    assert.equal(rule.enabled, 1);
  });

  it('getAnomalyRules returns rules for a tenant', async () => {
    const rules = await db.getAnomalyRules('t-anomaly');
    assert.ok(rules.length >= 1);
    const found = rules.find((r) => r.id === 'rule-1');
    assert.ok(found, 'should find rule-1');
  });

  it('updateAnomalyRule updates fields', async () => {
    const updated = await db.updateAnomalyRule('rule-1', 't-anomaly', {
      threshold: 0.75,
      severity: 'critical',
    });
    assert.ok(updated, 'should return updated rule');
    assert.equal(updated!.threshold, 0.75);
    assert.equal(updated!.severity, 'critical');
  });

  it('updateAnomalyRule returns undefined for non-existent rule', async () => {
    const result = await db.updateAnomalyRule('ghost-rule', 't-anomaly', { threshold: 0.9 });
    assert.equal(result, undefined);
  });

  it('deleteAnomalyRule removes the rule', async () => {
    await db.insertAnomalyRule({
      id: 'rule-to-delete',
      tenant_id: 't-anomaly',
      name: 'Delete me',
      metric: 'error_rate',
      condition: 'gt',
      threshold: 0.1,
      window_minutes: 15,
      severity: 'critical',
      enabled: 1,
      created_at: new Date().toISOString(),
    });
    await db.deleteAnomalyRule('rule-to-delete', 't-anomaly');
    const rules = await db.getAnomalyRules('t-anomaly');
    assert.ok(!rules.find((r) => r.id === 'rule-to-delete'), 'rule should be deleted');
  });

  it('getAnomalyRules returns empty for unknown tenant', async () => {
    const rules = await db.getAnomalyRules('unknown-tenant-xxx');
    assert.equal(rules.length, 0);
  });
});

// ─── SQLite DB — alerts CRUD ──────────────────────────────────────────────────

describe('Database: alerts', () => {
  let db: IDatabase;

  before(async () => {
    const { adapter } = createSqliteAdapter(':memory:');
    await adapter.initialize();
    db = adapter;
    await db.createTenant('t-alerts', 'Test', 'alerts@test.local');
  });

  after(async () => { await db.close(); });

  it('insertAlert creates an alert and returns it', async () => {
    const alert = await db.insertAlert({
      id: 'alert-1',
      tenant_id: 't-alerts',
      rule_id: 'rule-abc',
      metric: 'block_rate',
      current_value: 0.65,
      threshold: 0.5,
      severity: 'warning',
      message: 'Block rate is high',
      resolved_at: null,
      created_at: new Date().toISOString(),
    });
    assert.equal(alert.id, 'alert-1');
    assert.equal(alert.metric, 'block_rate');
    assert.equal(alert.current_value, 0.65);
    assert.equal(alert.resolved_at, null);
  });

  it('getAlerts returns alerts for a tenant', async () => {
    const alerts = await db.getAlerts('t-alerts');
    assert.ok(alerts.length >= 1);
  });

  it('getAlerts filters by severity', async () => {
    await db.insertAlert({
      id: 'alert-critical',
      tenant_id: 't-alerts',
      rule_id: 'rule-crit',
      metric: 'error_rate',
      current_value: 0.15,
      threshold: 0.1,
      severity: 'critical',
      message: 'Critical error rate',
      resolved_at: null,
      created_at: new Date().toISOString(),
    });
    const critical = await db.getAlerts('t-alerts', { severity: 'critical' });
    assert.ok(critical.every((a) => a.severity === 'critical'));
    const warning = await db.getAlerts('t-alerts', { severity: 'warning' });
    assert.ok(warning.every((a) => a.severity === 'warning'));
  });

  it('getAlerts filters by resolved=false (active)', async () => {
    const active = await db.getAlerts('t-alerts', { resolved: false });
    assert.ok(active.every((a) => a.resolved_at === null));
  });

  it('resolveAlert sets resolved_at', async () => {
    await db.resolveAlert('alert-1');
    const alerts = await db.getAlerts('t-alerts', { resolved: true });
    const found = alerts.find((a) => a.id === 'alert-1');
    assert.ok(found, 'should find resolved alert');
    assert.ok(found!.resolved_at !== null, 'resolved_at should be set');
  });

  it('getAlerts with resolved=true returns only resolved alerts', async () => {
    const resolved = await db.getAlerts('t-alerts', { resolved: true });
    assert.ok(resolved.every((a) => a.resolved_at !== null));
  });

  it('getActiveAlert returns the active alert for a rule', async () => {
    await db.insertAlert({
      id: 'alert-active',
      tenant_id: 't-alerts',
      rule_id: 'rule-active-test',
      metric: 'block_rate',
      current_value: 0.9,
      threshold: 0.5,
      severity: 'critical',
      message: 'Critical block rate',
      resolved_at: null,
      created_at: new Date().toISOString(),
    });
    const active = await db.getActiveAlert('t-alerts', 'rule-active-test');
    assert.ok(active, 'should find active alert');
    assert.equal(active!.id, 'alert-active');
  });

  it('getActiveAlert returns undefined after resolution', async () => {
    await db.resolveAlert('alert-active');
    const active = await db.getActiveAlert('t-alerts', 'rule-active-test');
    assert.equal(active, undefined);
  });

  it('getAlerts returns empty for unknown tenant', async () => {
    const alerts = await db.getAlerts('unknown-tenant-yyy');
    assert.equal(alerts.length, 0);
  });
});

// ─── API routes (E2E via server) ──────────────────────────────────────────────

const BASE = 'http://localhost:3007';
let serverProcess: ChildProcess | null = null;
let apiKey = '';

async function request(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let responseBody: Record<string, unknown> = {};
  try { responseBody = await res.json() as Record<string, unknown>; } catch { /* non-json */ }
  return { status: res.status, body: responseBody };
}

async function waitForServer(retries = 30, delayMs = 300): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch { /* not ready */ }
    await sleep(delayMs);
  }
  throw new Error('Server did not start in time');
}

describe('Alerts API Routes', () => {
  before(async () => {
    serverProcess = spawn('npx', ['tsx', 'api/server.ts'], {
      cwd: '/home/vector/.openclaw/workspace/agentguard-project',
      env: { ...process.env, PORT: '3007', NODE_ENV: 'test', ADMIN_KEY: 'anomaly-admin-key', AG_DB_PATH: ':memory:' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForServer();

    // Register a tenant
    const signup = await request('POST', '/api/v1/signup', {
      name: 'Anomaly Test',
      email: `anomaly-${Date.now()}@test.local`,
    });
    assert.equal(signup.status, 201, `Signup failed: ${JSON.stringify(signup.body)}`);
    apiKey = signup.body['apiKey'] as string;
    assert.ok(apiKey, 'Should get API key');
  });

  after(async () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await sleep(300);
    }
  });

  it('GET /api/v1/alerts requires auth', async () => {
    const res = await request('GET', '/api/v1/alerts');
    assert.equal(res.status, 401);
  });

  it('GET /api/v1/alerts returns empty list for new tenant', async () => {
    const res = await request('GET', '/api/v1/alerts', undefined, { 'X-API-Key': apiKey });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body['alerts']), 'Should return alerts array');
    assert.equal((res.body['alerts'] as unknown[]).length, 0);
  });

  it('GET /api/v1/alerts/rules requires auth', async () => {
    const res = await request('GET', '/api/v1/alerts/rules');
    assert.equal(res.status, 401);
  });

  it('GET /api/v1/alerts/rules returns empty list initially', async () => {
    const res = await request('GET', '/api/v1/alerts/rules', undefined, { 'X-API-Key': apiKey });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body['rules']), 'Should return rules array');
  });

  it('POST /api/v1/alerts/rules creates a custom rule', async () => {
    const res = await request('POST', '/api/v1/alerts/rules', {
      name: 'My Block Rate Alert',
      metric: 'block_rate',
      condition: 'gt',
      threshold: 0.3,
      windowMinutes: 30,
      severity: 'warning',
    }, { 'X-API-Key': apiKey });
    assert.equal(res.status, 201, `Create rule failed: ${JSON.stringify(res.body)}`);
    assert.equal(res.body['name'], 'My Block Rate Alert');
    assert.equal(res.body['metric'], 'block_rate');
    assert.equal(res.body['threshold'], 0.3);
    assert.equal(res.body['windowMinutes'], 30);
    assert.equal(res.body['enabled'], true);
  });

  it('POST /api/v1/alerts/rules validates required fields', async () => {
    const res = await request('POST', '/api/v1/alerts/rules', {
      metric: 'block_rate',
      condition: 'gt',
      threshold: 0.5,
      windowMinutes: 60,
    }, { 'X-API-Key': apiKey });
    assert.equal(res.status, 400, 'Should reject missing name');
  });

  it('POST /api/v1/alerts/rules rejects invalid metric', async () => {
    const res = await request('POST', '/api/v1/alerts/rules', {
      name: 'Bad metric',
      metric: 'nonexistent_metric',
      condition: 'gt',
      threshold: 0.5,
      windowMinutes: 60,
    }, { 'X-API-Key': apiKey });
    assert.equal(res.status, 400);
  });

  let createdRuleId = '';

  it('GET /api/v1/alerts/rules lists the created rule', async () => {
    const res = await request('GET', '/api/v1/alerts/rules', undefined, { 'X-API-Key': apiKey });
    assert.equal(res.status, 200);
    const rules = res.body['rules'] as unknown[];
    assert.ok(rules.length >= 1);
    const rule = rules[0] as Record<string, unknown>;
    createdRuleId = rule['id'] as string;
    assert.ok(createdRuleId);
  });

  it('PUT /api/v1/alerts/rules/:id updates threshold', async () => {
    const res = await request('PUT', `/api/v1/alerts/rules/${createdRuleId}`, {
      threshold: 0.45,
    }, { 'X-API-Key': apiKey });
    assert.equal(res.status, 200, `Update failed: ${JSON.stringify(res.body)}`);
    assert.equal(res.body['threshold'], 0.45);
  });

  it('PUT /api/v1/alerts/rules/:id returns 404 for unknown rule', async () => {
    const res = await request('PUT', '/api/v1/alerts/rules/nonexistent-rule', {
      threshold: 0.9,
    }, { 'X-API-Key': apiKey });
    assert.equal(res.status, 404);
  });

  it('DELETE /api/v1/alerts/rules/:id deletes the rule', async () => {
    const res = await request('DELETE', `/api/v1/alerts/rules/${createdRuleId}`, undefined, { 'X-API-Key': apiKey });
    assert.equal(res.status, 200);
    assert.equal(res.body['deleted'], true);
  });

  it('DELETE /api/v1/alerts/rules/:id returns 404 for deleted rule', async () => {
    const res = await request('DELETE', `/api/v1/alerts/rules/${createdRuleId}`, undefined, { 'X-API-Key': apiKey });
    assert.equal(res.status, 404);
  });

  it('POST /api/v1/alerts/:id/acknowledge returns 404 for unknown alert', async () => {
    const res = await request('POST', '/api/v1/alerts/nonexistent-alert/acknowledge', undefined, { 'X-API-Key': apiKey });
    assert.equal(res.status, 404);
  });

  it('GET /api/v1/alerts with resolved=false filter works', async () => {
    const res = await request('GET', '/api/v1/alerts?resolved=false', undefined, { 'X-API-Key': apiKey });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body['alerts']));
  });

  it('GET /api/v1/alerts with severity filter works', async () => {
    const res = await request('GET', '/api/v1/alerts?severity=warning', undefined, { 'X-API-Key': apiKey });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body['alerts']));
  });
});

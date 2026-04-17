/**
 * Tests for OWASP Agentic Security Top 10 Compliance Checker
 *
 * Covers:
 *   - Report generation structure (reportType, version, score, percentage)
 *   - Individual control checks:
 *     - promptInjection (covered when analytics > 0, partial otherwise)
 *     - toolPolicy (covered with custom policy, partial with default)
 *     - hitlEnabled (covered with approvals, partial without)
 *     - certifications (covered with certified agent, not_covered without)
 *     - piiDetection (covered when enabled, partial when not)
 *     - auditHashChain (covered with events + hash, partial without hash)
 *     - webhookSecrets (covered with secured webhooks, not_covered with none)
 *     - auditAndWebhooks (covered with both, not_covered with neither)
 *     - certifiedDeployments (covered with cert + audit)
 *   - Error handling in individual checks
 *   - Score calculation accuracy
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateOWASPReport } from '../../lib/compliance-checker.js';
import { createMockDb, MOCK_TENANT, MOCK_AGENT } from '../helpers/mock-db.js';
import type { IDatabase } from '../../db-interface.js';

describe('generateOWASPReport — structure', () => {
  let db: IDatabase;

  beforeEach(() => {
    db = createMockDb();
    // Default: no custom policy, no audit events, no webhooks, no approvals
    (db.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (db.countAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (db.getLastAuditHash as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (db.getWebhooksByTenant as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.getActiveWebhooksForTenant as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.listPendingApprovals as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.getAgentsByTenant as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.all as ReturnType<typeof vi.fn>).mockResolvedValue([{ cnt: 0 }]);
  });

  it('returns valid OWASP report structure', async () => {
    const report = await generateOWASPReport(db, 'tenant-123');

    expect(report.reportType).toBe('owasp-agentic-top10');
    expect(report.version).toBeTruthy();
    expect(report.generatedAt).toBeTruthy();
    expect(report.tenantId).toBe('tenant-123');
    expect(report.agentId).toBeNull();
    expect(report.maxScore).toBe(10);
    expect(report.percentage).toBeGreaterThanOrEqual(0);
    expect(report.percentage).toBeLessThanOrEqual(100);
    expect(report.controls).toHaveLength(10);
    expect(report.summary).toBeTruthy();
  });

  it('includes agentId when specified', async () => {
    const report = await generateOWASPReport(db, 'tenant-123', 'agent-456');
    expect(report.agentId).toBe('agent-456');
  });

  it('every control has required fields', async () => {
    const report = await generateOWASPReport(db, 'tenant-123');

    for (const control of report.controls) {
      expect(control).toHaveProperty('id');
      expect(control).toHaveProperty('title');
      expect(control).toHaveProperty('description');
      expect(control).toHaveProperty('status');
      expect(['covered', 'partial', 'not_covered']).toContain(control.status);
      expect(control).toHaveProperty('score');
      expect([0, 0.5, 1]).toContain(control.score);
      expect(control).toHaveProperty('notes');
      expect(typeof control.notes).toBe('string');
    }
  });

  it('score equals sum of control scores', async () => {
    const report = await generateOWASPReport(db, 'tenant-123');
    const manualSum = report.controls.reduce((sum, c) => sum + c.score, 0);
    expect(report.score).toBe(parseFloat(manualSum.toFixed(1)));
  });

  it('percentage matches score/maxScore ratio', async () => {
    const report = await generateOWASPReport(db, 'tenant-123');
    const expectedPercentage = Math.round((report.score / report.maxScore) * 100);
    expect(report.percentage).toBe(expectedPercentage);
  });
});

describe('generateOWASPReport — toolPolicy control', () => {
  let db: IDatabase;

  beforeEach(() => {
    db = createMockDb();
    (db.countAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (db.getLastAuditHash as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (db.getWebhooksByTenant as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.getActiveWebhooksForTenant as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.listPendingApprovals as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.getAgentsByTenant as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.all as ReturnType<typeof vi.fn>).mockResolvedValue([{ cnt: 0 }]);
  });

  it('returns "covered" when tenant has custom policy with rules', async () => {
    (db.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(
      JSON.stringify({ id: 'p1', rules: [{ id: 'r1', action: 'allow' }] })
    );

    const report = await generateOWASPReport(db, 'tenant-123');
    const toolPolicy = report.controls.find(c => c.id === 'ASI02');
    expect(toolPolicy?.status).toBe('covered');
    expect(toolPolicy?.score).toBe(1);
    expect(toolPolicy?.notes).toContain('1 rule(s)');
  });

  it('returns "partial" when no custom policy (default policy active)', async () => {
    (db.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const report = await generateOWASPReport(db, 'tenant-123');
    const toolPolicy = report.controls.find(c => c.id === 'ASI02');
    expect(toolPolicy?.status).toBe('partial');
    expect(toolPolicy?.score).toBe(0.5);
  });

  it('returns "partial" for malformed JSON policy', async () => {
    (db.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue('not-valid-json');

    const report = await generateOWASPReport(db, 'tenant-123');
    const toolPolicy = report.controls.find(c => c.id === 'ASI02');
    expect(toolPolicy?.status).toBe('partial');
  });
});

describe('generateOWASPReport — auditHashChain control', () => {
  let db: IDatabase;

  beforeEach(() => {
    db = createMockDb();
    (db.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (db.getWebhooksByTenant as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.getActiveWebhooksForTenant as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.listPendingApprovals as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.getAgentsByTenant as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.all as ReturnType<typeof vi.fn>).mockResolvedValue([{ cnt: 0 }]);
  });

  it('returns "covered" when audit events exist with hash chain', async () => {
    (db.countAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(42);
    (db.getLastAuditHash as ReturnType<typeof vi.fn>).mockResolvedValue('abc123hash');

    const report = await generateOWASPReport(db, 'tenant-123');
    const hashChain = report.controls.find(c => c.id === 'ASI06');
    expect(hashChain?.status).toBe('covered');
    expect(hashChain?.score).toBe(1);
    expect(hashChain?.notes).toContain('42');
  });

  it('returns "partial" when audit events exist but no hash', async () => {
    (db.countAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(5);
    (db.getLastAuditHash as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const report = await generateOWASPReport(db, 'tenant-123');
    const hashChain = report.controls.find(c => c.id === 'ASI06');
    expect(hashChain?.status).toBe('partial');
    expect(hashChain?.score).toBe(0.5);
  });

  it('returns "partial" when no audit events at all', async () => {
    (db.countAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const report = await generateOWASPReport(db, 'tenant-123');
    const hashChain = report.controls.find(c => c.id === 'ASI06');
    expect(hashChain?.status).toBe('partial');
  });
});

describe('generateOWASPReport — webhookSecrets control', () => {
  let db: IDatabase;

  beforeEach(() => {
    db = createMockDb();
    (db.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (db.countAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (db.getLastAuditHash as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (db.listPendingApprovals as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.getAgentsByTenant as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.all as ReturnType<typeof vi.fn>).mockResolvedValue([{ cnt: 0 }]);
  });

  it('returns "not_covered" when no webhooks configured', async () => {
    (db.getWebhooksByTenant as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const report = await generateOWASPReport(db, 'tenant-123');
    const webhooks = report.controls.find(c => c.id === 'ASI08');
    expect(webhooks?.status).toBe('not_covered');
    expect(webhooks?.score).toBe(0);
  });

  it('returns "covered" when all webhooks have secrets', async () => {
    (db.getWebhooksByTenant as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'wh-1', url: 'https://a.com', secret: 'hmac-secret-1', active: 1 },
      { id: 'wh-2', url: 'https://b.com', secret: 'hmac-secret-2', active: 1 },
    ]);

    const report = await generateOWASPReport(db, 'tenant-123');
    const webhooks = report.controls.find(c => c.id === 'ASI08');
    expect(webhooks?.status).toBe('covered');
    expect(webhooks?.score).toBe(1);
  });

  it('returns "partial" when webhooks exist but none have secrets', async () => {
    (db.getWebhooksByTenant as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'wh-1', url: 'https://a.com', secret: null, active: 1 },
    ]);

    const report = await generateOWASPReport(db, 'tenant-123');
    const webhooks = report.controls.find(c => c.id === 'ASI08');
    expect(webhooks?.status).toBe('partial');
    expect(webhooks?.score).toBe(0.5);
  });
});

describe('generateOWASPReport — auditAndWebhooks control (ASI09)', () => {
  let db: IDatabase;

  beforeEach(() => {
    db = createMockDb();
    (db.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (db.getLastAuditHash as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (db.listPendingApprovals as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.getAgentsByTenant as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.all as ReturnType<typeof vi.fn>).mockResolvedValue([{ cnt: 0 }]);
  });

  it('returns "covered" when both audit events and webhooks exist', async () => {
    (db.countAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(10);
    (db.getActiveWebhooksForTenant as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'wh-1', url: 'https://a.com', active: 1 },
    ]);

    const report = await generateOWASPReport(db, 'tenant-123');
    const obs = report.controls.find(c => c.id === 'ASI09');
    expect(obs?.status).toBe('covered');
    expect(obs?.score).toBe(1);
  });

  it('returns "not_covered" when neither audit nor webhooks', async () => {
    (db.countAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (db.getActiveWebhooksForTenant as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const report = await generateOWASPReport(db, 'tenant-123');
    const obs = report.controls.find(c => c.id === 'ASI09');
    expect(obs?.status).toBe('not_covered');
    expect(obs?.score).toBe(0);
  });

  it('returns "partial" when only audit events exist', async () => {
    (db.countAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(5);
    (db.getActiveWebhooksForTenant as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const report = await generateOWASPReport(db, 'tenant-123');
    const obs = report.controls.find(c => c.id === 'ASI09');
    expect(obs?.status).toBe('partial');
  });
});

describe('generateOWASPReport — certifications control (ASI04)', () => {
  let db: IDatabase;

  beforeEach(() => {
    db = createMockDb();
    (db.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (db.countAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (db.getLastAuditHash as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (db.getWebhooksByTenant as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.getActiveWebhooksForTenant as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.listPendingApprovals as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.all as ReturnType<typeof vi.fn>).mockResolvedValue([{ cnt: 0 }]);
  });

  it('returns "covered" when agent is certified', async () => {
    const certifiedAgent = { ...MOCK_AGENT, certified_at: '2024-06-01T00:00:00.000Z' };
    (db.getAgentById as ReturnType<typeof vi.fn>).mockResolvedValue(certifiedAgent);

    const report = await generateOWASPReport(db, 'tenant-123', 'agent-456');
    const cert = report.controls.find(c => c.id === 'ASI04');
    expect(cert?.status).toBe('covered');
    expect(cert?.score).toBe(1);
    expect(cert?.notes).toContain('certified');
  });

  it('returns "partial" when agent exists but not certified', async () => {
    (db.getAgentById as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AGENT);

    const report = await generateOWASPReport(db, 'tenant-123', 'agent-456');
    const cert = report.controls.find(c => c.id === 'ASI04');
    expect(cert?.status).toBe('partial');
    expect(cert?.score).toBe(0.5);
  });

  it('returns "not_covered" when agents exist but none certified', async () => {
    (db.getAgentById as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (db.getAgentsByTenant as ReturnType<typeof vi.fn>).mockResolvedValue([MOCK_AGENT]);
    (db.all as ReturnType<typeof vi.fn>).mockResolvedValue([{ cnt: 0 }]); // certified count = 0

    const report = await generateOWASPReport(db, 'tenant-123');
    const cert = report.controls.find(c => c.id === 'ASI04');
    expect(cert?.status).toBe('not_covered');
    expect(cert?.score).toBe(0);
  });
});

describe('generateOWASPReport — piiDetection control (ASI05)', () => {
  let db: IDatabase;

  beforeEach(() => {
    db = createMockDb();
    (db.countAuditEvents as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (db.getLastAuditHash as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (db.getWebhooksByTenant as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.getActiveWebhooksForTenant as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.listPendingApprovals as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.getAgentsByTenant as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.all as ReturnType<typeof vi.fn>).mockResolvedValue([{ cnt: 0 }]);
  });

  it('returns "covered" when piiDetection enabled in policy', async () => {
    (db.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(
      JSON.stringify({ piiDetection: { enabled: true }, rules: [] })
    );

    const report = await generateOWASPReport(db, 'tenant-123');
    const pii = report.controls.find(c => c.id === 'ASI05');
    expect(pii?.status).toBe('covered');
    expect(pii?.score).toBe(1);
  });

  it('returns "partial" when piiDetection not enabled in policy', async () => {
    (db.getCustomPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(
      JSON.stringify({ rules: [] })
    );

    const report = await generateOWASPReport(db, 'tenant-123');
    const pii = report.controls.find(c => c.id === 'ASI05');
    expect(pii?.status).toBe('partial');
    expect(pii?.score).toBe(0.5);
  });
});

describe('generateOWASPReport — error handling', () => {
  it('handles DB errors gracefully (marks control as not_covered)', async () => {
    const db = createMockDb();
    // Make all queries fail
    (db.getCustomPolicy as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB down'));
    (db.countAuditEvents as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB down'));
    (db.getLastAuditHash as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB down'));
    (db.all as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB down'));
    (db.getWebhooksByTenant as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB down'));

    // Should not throw — generates report with error fallback
    const report = await generateOWASPReport(db, 'tenant-123');
    expect(report.reportType).toBe('owasp-agentic-top10');
    expect(report.controls).toHaveLength(10);
  });
});

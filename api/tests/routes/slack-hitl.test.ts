/**
 * Integration tests for Slack HITL Routes:
 *   POST   /api/v1/integrations/slack          — configure Slack integration
 *   GET    /api/v1/integrations/slack          — get config (secret redacted)
 *   DELETE /api/v1/integrations/slack          — remove integration
 *   POST   /api/v1/integrations/slack/callback — Slack HMAC-verified callback
 *
 * Covers: auth, CRUD, HMAC verification, approval flow, replay protection
 */

// Set a test encryption key so integration-crypto works in production mode
process.env['INTEGRATION_ENCRYPTION_KEY'] = 'a'.repeat(64); // 32 bytes as 64 hex chars

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import express from 'express';
import { createSlackHitlRoutes } from '../../routes/slack-hitl.js';
import { createMockDb, MOCK_TENANT } from '../helpers/mock-db.js';
import { buildApp, createMockAuthMiddleware } from '../helpers/create-app.js';
import { encryptConfig } from '../../lib/integration-crypto.js';
import type { IDatabase } from '../../db-interface.js';

// ── Helpers ────────────────────────────────────────────────────────────────

const VALID_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/XXXX';
const VALID_SIGNING_SECRET = 'test-signing-secret-12345';

/**
 * Build a Slack HMAC signature for callback testing.
 */
function buildSlackSignature(
  signingSecret: string,
  body: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): { signature: string; timestamp: string } {
  const ts = String(timestamp);
  const sigBase = `v0:${ts}:${body}`;
  const sig = 'v0=' + crypto.createHmac('sha256', signingSecret).update(sigBase).digest('hex');
  return { signature: sig, timestamp: ts };
}

/**
 * Build a stored Slack integration config (as it would be stored in DB).
 */
function buildStoredConfig(signingSecret: string = VALID_SIGNING_SECRET) {
  const signingSecretHash = crypto.createHash('sha256').update(signingSecret).digest('hex');
  const signingSecretEncryptedObj = encryptConfig({ secret: signingSecret });

  const storedConfig = {
    webhookUrl: VALID_WEBHOOK_URL,
    signingSecretHash,
    signingSecretEncrypted: signingSecretEncryptedObj,
    channel: '#security',
    autoRejectMinutes: 30,
  };

  return encryptConfig(storedConfig as unknown as Record<string, unknown>);
}

/**
 * Build a Slack callback payload (URL-encoded).
 */
function buildCallbackPayload(approvalId: string, actionId: 'hitl_approve' | 'hitl_reject') {
  const payload = JSON.stringify({
    type: 'block_actions',
    actions: [{ action_id: actionId, value: approvalId }],
    user: { id: 'U12345', name: 'test-user' },
  });
  return `payload=${encodeURIComponent(payload)}`;
}

// ── POST /api/v1/integrations/slack ──────────────────────────────────────

describe('POST /api/v1/integrations/slack', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = buildApp(createSlackHitlRoutes, mockDb);
  });

  it('returns 401 without API key', async () => {
    const res = await request(app)
      .post('/api/v1/integrations/slack')
      .send({ webhookUrl: VALID_WEBHOOK_URL, signingSecret: VALID_SIGNING_SECRET });

    expect(res.status).toBe(401);
  });

  it('returns 403 for agent keys', async () => {
    const res = await request(app)
      .post('/api/v1/integrations/slack')
      .set('x-api-key', 'ag_agent_somekey')
      .send({ webhookUrl: VALID_WEBHOOK_URL, signingSecret: VALID_SIGNING_SECRET });

    expect(res.status).toBe(403);
  });

  it('creates Slack integration with valid config', async () => {
    (mockDb.insertIntegration as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/v1/integrations/slack')
      .set('x-api-key', 'valid-key')
      .send({
        webhookUrl: VALID_WEBHOOK_URL,
        signingSecret: VALID_SIGNING_SECRET,
        channel: '#security',
        autoRejectMinutes: 30,
      });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('slack');
    expect(res.body.webhookUrl).toBe(VALID_WEBHOOK_URL);
    expect(res.body.channel).toBe('#security');
    expect(res.body.autoRejectMinutes).toBe(30);
    expect(res.body.configured).toBe(true);
    // signingSecret must NEVER be returned
    expect(res.body.signingSecret).toBeUndefined();
  });

  it('creates integration without optional fields', async () => {
    (mockDb.insertIntegration as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/v1/integrations/slack')
      .set('x-api-key', 'valid-key')
      .send({
        webhookUrl: VALID_WEBHOOK_URL,
        signingSecret: VALID_SIGNING_SECRET,
      });

    expect(res.status).toBe(201);
    expect(res.body.autoRejectMinutes).toBe(30); // default
  });

  it('returns 400 when webhookUrl is missing', async () => {
    const res = await request(app)
      .post('/api/v1/integrations/slack')
      .set('x-api-key', 'valid-key')
      .send({ signingSecret: VALID_SIGNING_SECRET });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 400 when webhookUrl is not a Slack URL', async () => {
    const res = await request(app)
      .post('/api/v1/integrations/slack')
      .set('x-api-key', 'valid-key')
      .send({
        webhookUrl: 'https://not-slack.com/webhook',
        signingSecret: VALID_SIGNING_SECRET,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Slack webhook URL');
  });

  it('returns 400 when signingSecret is too short', async () => {
    const res = await request(app)
      .post('/api/v1/integrations/slack')
      .set('x-api-key', 'valid-key')
      .send({ webhookUrl: VALID_WEBHOOK_URL, signingSecret: 'short' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when signingSecret is missing', async () => {
    const res = await request(app)
      .post('/api/v1/integrations/slack')
      .set('x-api-key', 'valid-key')
      .send({ webhookUrl: VALID_WEBHOOK_URL });

    expect(res.status).toBe(400);
  });

  it('returns 400 when autoRejectMinutes is out of range', async () => {
    const res = await request(app)
      .post('/api/v1/integrations/slack')
      .set('x-api-key', 'valid-key')
      .send({
        webhookUrl: VALID_WEBHOOK_URL,
        signingSecret: VALID_SIGNING_SECRET,
        autoRejectMinutes: 9999,
      });

    expect(res.status).toBe(400);
  });

  it('stores the config with encrypted signing secret', async () => {
    (mockDb.insertIntegration as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await request(app)
      .post('/api/v1/integrations/slack')
      .set('x-api-key', 'valid-key')
      .send({ webhookUrl: VALID_WEBHOOK_URL, signingSecret: VALID_SIGNING_SECRET });

    expect(mockDb.insertIntegration).toHaveBeenCalledWith(
      'tenant-123',
      'slack',
      expect.any(String), // encrypted blob
    );
  });
});

// ── GET /api/v1/integrations/slack ────────────────────────────────────────

describe('GET /api/v1/integrations/slack', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = buildApp(createSlackHitlRoutes, mockDb);
  });

  it('returns 401 without API key', async () => {
    const res = await request(app).get('/api/v1/integrations/slack');
    expect(res.status).toBe(401);
  });

  it('returns 404 when not configured', async () => {
    (mockDb.getIntegration as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/integrations/slack')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not configured');
  });

  it('returns config without signing secret', async () => {
    const configBlob = buildStoredConfig();
    (mockDb.getIntegration as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'int-1',
      tenant_id: 'tenant-123',
      type: 'slack',
      config_encrypted: configBlob,
      created_at: '2024-01-01T00:00:00.000Z',
    });

    const res = await request(app)
      .get('/api/v1/integrations/slack')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('slack');
    expect(res.body.webhookUrl).toBe(VALID_WEBHOOK_URL);
    expect(res.body.channel).toBe('#security');
    expect(res.body.autoRejectMinutes).toBe(30);
    expect(res.body.configured).toBe(true);
    // Secret must NEVER be returned
    expect(res.body.signingSecret).toBeUndefined();
    expect(res.body.signingSecretHash).toBeUndefined();
    expect(res.body.signingSecretEncrypted).toBeUndefined();
  });
});

// ── DELETE /api/v1/integrations/slack ────────────────────────────────────

describe('DELETE /api/v1/integrations/slack', () => {
  let mockDb: IDatabase;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = buildApp(createSlackHitlRoutes, mockDb);
  });

  it('returns 401 without API key', async () => {
    const res = await request(app).delete('/api/v1/integrations/slack');
    expect(res.status).toBe(401);
  });

  it('returns 404 when integration does not exist', async () => {
    (mockDb.getIntegration as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/v1/integrations/slack')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(404);
  });

  it('deletes the integration and returns confirmation', async () => {
    const configBlob = buildStoredConfig();
    (mockDb.getIntegration as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'int-1',
      tenant_id: 'tenant-123',
      type: 'slack',
      config_encrypted: configBlob,
      created_at: '2024-01-01T00:00:00.000Z',
    });
    (mockDb.deleteIntegration as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await request(app)
      .delete('/api/v1/integrations/slack')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(res.body.type).toBe('slack');
    expect(mockDb.deleteIntegration).toHaveBeenCalledWith('tenant-123', 'slack');
  });
});

// ── POST /api/v1/integrations/slack/callback ─────────────────────────────

describe('POST /api/v1/integrations/slack/callback', () => {
  let mockDb: IDatabase;
  let app: express.Application;

  const APPROVAL_ID = 'approval-uuid-001';

  function buildCallbackApp(db: IDatabase) {
    const localApp = express();
    // Slack sends application/x-www-form-urlencoded; we parse it and attach rawBody
    localApp.use((req, _res, next) => {
      let data = '';
      req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      req.on('end', () => {
        (req as express.Request & { rawBody?: string }).rawBody = data;
        // Parse URL-encoded body manually
        const params = new URLSearchParams(data);
        req.body = Object.fromEntries(params.entries());
        next();
      });
    });
    const auth = createMockAuthMiddleware();
    localApp.use(createSlackHitlRoutes(db, auth));
    return localApp;
  }

  beforeEach(() => {
    mockDb = createMockDb();
    app = buildCallbackApp(mockDb);
  });

  it('returns 400 when payload is missing', async () => {
    const body = 'no_payload=true';
    const now = Math.floor(Date.now() / 1000);
    const { signature, timestamp } = buildSlackSignature(VALID_SIGNING_SECRET, body, now);

    const res = await request(app)
      .post('/api/v1/integrations/slack/callback')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('x-slack-request-timestamp', timestamp)
      .set('x-slack-signature', signature)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('payload');
  });

  it('returns 400 for invalid payload JSON', async () => {
    const rawPayload = 'not valid json';
    const body = `payload=${encodeURIComponent(rawPayload)}`;
    const now = Math.floor(Date.now() / 1000);
    const { signature, timestamp } = buildSlackSignature(VALID_SIGNING_SECRET, body, now);

    const res = await request(app)
      .post('/api/v1/integrations/slack/callback')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('x-slack-request-timestamp', timestamp)
      .set('x-slack-signature', signature)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid payload JSON');
  });

  it('returns 400 for payload with no actions', async () => {
    const payload = JSON.stringify({ type: 'block_actions', actions: [] });
    const body = `payload=${encodeURIComponent(payload)}`;
    const now = Math.floor(Date.now() / 1000);
    const { signature, timestamp } = buildSlackSignature(VALID_SIGNING_SECRET, body, now);

    const res = await request(app)
      .post('/api/v1/integrations/slack/callback')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('x-slack-request-timestamp', timestamp)
      .set('x-slack-signature', signature)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No action');
  });

  it('returns 400 for unknown action_id', async () => {
    const payload = JSON.stringify({
      type: 'block_actions',
      actions: [{ action_id: 'unknown_action', value: APPROVAL_ID }],
    });
    const body = `payload=${encodeURIComponent(payload)}`;
    const now = Math.floor(Date.now() / 1000);
    const { signature, timestamp } = buildSlackSignature(VALID_SIGNING_SECRET, body, now);

    // We need the DB lookup to succeed for this to reach the action_id check
    // But actually the unknown action check is before the DB lookup
    const res = await request(app)
      .post('/api/v1/integrations/slack/callback')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('x-slack-request-timestamp', timestamp)
      .set('x-slack-signature', signature)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Unknown action_id');
  });

  it('returns 200 (not 404) when approval not found — avoids Slack retries', async () => {
    // Set up DB to return the approval for the initial lookup
    (mockDb.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: APPROVAL_ID,
      tenant_id: 'tenant-123',
    });

    // Set up integration config
    const configBlob = buildStoredConfig();
    (mockDb.getIntegration as ReturnType<typeof vi.fn>).mockResolvedValue({
      config_encrypted: configBlob,
    });

    // getApproval returns null (approval not found after lookup)
    (mockDb.getApproval as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const body = buildCallbackPayload(APPROVAL_ID, 'hitl_approve');
    const now = Math.floor(Date.now() / 1000);
    const { signature, timestamp } = buildSlackSignature(VALID_SIGNING_SECRET, body, now);

    const res = await request(app)
      .post('/api/v1/integrations/slack/callback')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('x-slack-request-timestamp', timestamp)
      .set('x-slack-signature', signature)
      .send(body);

    // Should return 200 (Slack expects 200 for all callbacks to stop retries)
    expect(res.status).toBe(200);
  });

  it('rejects requests with invalid Slack signature', async () => {
    // Set up DB to return the approval
    (mockDb.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: APPROVAL_ID,
      tenant_id: 'tenant-123',
    });

    const configBlob = buildStoredConfig();
    (mockDb.getIntegration as ReturnType<typeof vi.fn>).mockResolvedValue({
      config_encrypted: configBlob,
    });

    const body = buildCallbackPayload(APPROVAL_ID, 'hitl_approve');
    const now = Math.floor(Date.now() / 1000);

    const res = await request(app)
      .post('/api/v1/integrations/slack/callback')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('x-slack-request-timestamp', String(now))
      .set('x-slack-signature', 'v0=invalidsignature')
      .send(body);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Signature verification failed');
  });

  it('rejects replayed requests (old timestamp)', async () => {
    (mockDb.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: APPROVAL_ID,
      tenant_id: 'tenant-123',
    });

    const configBlob = buildStoredConfig();
    (mockDb.getIntegration as ReturnType<typeof vi.fn>).mockResolvedValue({
      config_encrypted: configBlob,
    });

    const body = buildCallbackPayload(APPROVAL_ID, 'hitl_approve');
    // Old timestamp — 10 minutes ago
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
    const { signature } = buildSlackSignature(VALID_SIGNING_SECRET, body, oldTimestamp);

    const res = await request(app)
      .post('/api/v1/integrations/slack/callback')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('x-slack-request-timestamp', String(oldTimestamp))
      .set('x-slack-signature', signature)
      .send(body);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Signature verification failed');
  });

  it('successfully approves a pending approval via callback', async () => {
    (mockDb.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: APPROVAL_ID,
      tenant_id: 'tenant-123',
    });

    const configBlob = buildStoredConfig();
    (mockDb.getIntegration as ReturnType<typeof vi.fn>).mockResolvedValue({
      config_encrypted: configBlob,
    });

    const pendingApproval = {
      id: APPROVAL_ID,
      tenant_id: 'tenant-123',
      agent_id: null,
      tool: 'file_delete',
      params_json: null,
      status: 'pending',
      created_at: '2024-01-01T00:00:00.000Z',
      resolved_at: null,
      resolved_by: null,
    };

    const resolvedApproval = {
      ...pendingApproval,
      status: 'approved',
      resolved_at: new Date().toISOString(),
      resolved_by: 'slack:U12345',
    };

    (mockDb.getApproval as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(pendingApproval)
      .mockResolvedValueOnce(resolvedApproval);
    (mockDb.resolveApproval as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const body = buildCallbackPayload(APPROVAL_ID, 'hitl_approve');
    const now = Math.floor(Date.now() / 1000);
    const { signature, timestamp } = buildSlackSignature(VALID_SIGNING_SECRET, body, now);

    const res = await request(app)
      .post('/api/v1/integrations/slack/callback')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('x-slack-request-timestamp', timestamp)
      .set('x-slack-signature', signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(mockDb.resolveApproval).toHaveBeenCalledWith(
      APPROVAL_ID,
      'tenant-123',
      'approved',
      expect.stringContaining('slack:'),
    );
  });

  it('successfully rejects a pending approval via callback', async () => {
    (mockDb.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: APPROVAL_ID,
      tenant_id: 'tenant-123',
    });

    const configBlob = buildStoredConfig();
    (mockDb.getIntegration as ReturnType<typeof vi.fn>).mockResolvedValue({
      config_encrypted: configBlob,
    });

    const pendingApproval = {
      id: APPROVAL_ID,
      tenant_id: 'tenant-123',
      agent_id: null,
      tool: 'file_delete',
      params_json: null,
      status: 'pending',
      created_at: '2024-01-01T00:00:00.000Z',
      resolved_at: null,
      resolved_by: null,
    };

    (mockDb.getApproval as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(pendingApproval)
      .mockResolvedValueOnce({ ...pendingApproval, status: 'denied' });
    (mockDb.resolveApproval as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const body = buildCallbackPayload(APPROVAL_ID, 'hitl_reject');
    const now = Math.floor(Date.now() / 1000);
    const { signature, timestamp } = buildSlackSignature(VALID_SIGNING_SECRET, body, now);

    const res = await request(app)
      .post('/api/v1/integrations/slack/callback')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('x-slack-request-timestamp', timestamp)
      .set('x-slack-signature', signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(mockDb.resolveApproval).toHaveBeenCalledWith(
      APPROVAL_ID,
      'tenant-123',
      'denied',
      expect.stringContaining('slack:'),
    );
  });
});

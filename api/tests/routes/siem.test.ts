/**
 * Tests for SIEM Integration Routes
 *
 * Covers:
 *   - Splunk HEC configure / get / delete / test
 *   - Azure Sentinel configure / get / delete / test
 *   - Input validation (missing fields, invalid URLs)
 *   - Feature gating (402 when no license)
 *   - Config encryption/decryption roundtrip
 *   - 404 for missing configs
 *   - 401 for unauthenticated requests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createSiemRoutes } from '../../routes/siem.js';
import { createMockDb } from '../helpers/mock-db.js';
import { createMockAuthMiddleware } from '../helpers/create-app.js';
import type { IDatabase } from '../../db-interface.js';
import type { AuthMiddleware } from '../../middleware/auth.js';

// Ensure integration-crypto uses dev fallback key (not production)
vi.stubEnv('NODE_ENV', 'test');

// Must import AFTER stubEnv so the module reads the correct NODE_ENV
import { encryptConfig, decryptConfig } from '../../lib/integration-crypto.js';

// ── Test helpers ───────────────────────────────────────────────────────────

const MOCK_SIEM_SPLUNK_ROW = {
  id: 'siem-1',
  tenant_id: 'tenant-123',
  provider: 'splunk',
  config_encrypted: '',
  enabled: 1,
  last_forwarded_at: null,
  created_at: '2024-01-01T00:00:00.000Z',
};

const MOCK_SIEM_SENTINEL_ROW = {
  id: 'siem-2',
  tenant_id: 'tenant-123',
  provider: 'sentinel',
  config_encrypted: '',
  enabled: 1,
  last_forwarded_at: null,
  created_at: '2024-01-01T00:00:00.000Z',
};

/**
 * Build an Express app for SIEM routes with license feature support.
 * The requireFeature('siem_export') middleware checks req.license.features.
 * We inject a mock license on every request via middleware.
 */
function buildSiemApp(db: IDatabase, opts?: { withLicense?: boolean }) {
  const app = express();
  app.use(express.json());

  // Inject mock license for feature gating
  app.use((req, _res, next) => {
    if (opts?.withLicense !== false) {
      (req as any).license = {
        tier: 'pro',
        features: new Set(['siem_export']),
        limits: { eventsPerMonth: 500_000, agentsMax: 100 },
      };
    }
    next();
  });

  const auth = createMockAuthMiddleware();
  app.use(createSiemRoutes(db, auth));
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SIEM — Config encryption roundtrip', () => {
  it('encrypts and decrypts config preserving all fields', () => {
    const original = { hecUrl: 'https://splunk.example.com:8088', hecToken: 'secret-token-123' };
    const encrypted = encryptConfig(original);
    const decrypted = decryptConfig(encrypted);

    expect(decrypted).toEqual(original);
  });

  it('decrypt produces different ciphertext each time (random IV)', () => {
    const config = { hecUrl: 'https://test.com', hecToken: 'tok' };
    const enc1 = encryptConfig(config);
    const enc2 = encryptConfig(config);
    // Different IVs → different ciphertext
    expect(enc1).not.toBe(enc2);
    // But both decrypt to the same value
    expect(decryptConfig(enc1)).toEqual(decryptConfig(enc2));
  });
});

describe('Splunk HEC — POST /api/v1/siem/splunk/configure', () => {
  let db: IDatabase;
  let app: express.Application;

  beforeEach(() => {
    db = createMockDb();
    app = buildSiemApp(db);
  });

  it('configures Splunk HEC successfully', async () => {
    const row = { ...MOCK_SIEM_SPLUNK_ROW };
    (db.upsertSiemConfig as ReturnType<typeof vi.fn>).mockResolvedValue(row);

    const res = await request(app)
      .post('/api/v1/siem/splunk/configure')
      .set('x-api-key', 'valid-key')
      .send({
        hecUrl: 'https://splunk.example.com:8088/services/collector',
        hecToken: 'my-splunk-hec-token',
        index: 'agentguard',
        source: 'ag-siem',
      });

    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('splunk');
    expect(res.body.hecUrl).toBe('https://splunk.example.com:8088/services/collector');
    // Token must be masked
    expect(res.body.hecToken).toBe('***');
    expect(res.body.message).toContain('successfully');
    expect(db.upsertSiemConfig).toHaveBeenCalledWith('tenant-123', 'splunk', expect.any(String));
  });

  it('returns 400 when hecUrl is missing', async () => {
    const res = await request(app)
      .post('/api/v1/siem/splunk/configure')
      .set('x-api-key', 'valid-key')
      .send({ hecToken: 'tok' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('hecUrl');
  });

  it('returns 400 when hecUrl is not a valid URL', async () => {
    const res = await request(app)
      .post('/api/v1/siem/splunk/configure')
      .set('x-api-key', 'valid-key')
      .send({ hecUrl: 'not-a-url', hecToken: 'tok' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('hecUrl');
  });

  it('returns 400 when hecToken is missing', async () => {
    const res = await request(app)
      .post('/api/v1/siem/splunk/configure')
      .set('x-api-key', 'valid-key')
      .send({ hecUrl: 'https://splunk.example.com:8088' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('hecToken');
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app)
      .post('/api/v1/siem/splunk/configure')
      .send({ hecUrl: 'https://splunk.example.com', hecToken: 'tok' });

    expect(res.status).toBe(401);
  });

  it('returns 402 when license does not include siem_export', async () => {
    const localApp = buildSiemApp(db, { withLicense: false });

    const res = await request(localApp)
      .post('/api/v1/siem/splunk/configure')
      .set('x-api-key', 'valid-key')
      .send({ hecUrl: 'https://splunk.example.com', hecToken: 'tok' });

    expect(res.status).toBe(402);
    expect(res.body.error).toBe('feature_gated');
  });
});

describe('Splunk HEC — GET /api/v1/siem/splunk/config', () => {
  let db: IDatabase;
  let app: express.Application;

  beforeEach(() => {
    db = createMockDb();
    app = buildSiemApp(db);
  });

  it('returns Splunk config with masked token', async () => {
    const configEncrypted = encryptConfig({
      hecUrl: 'https://splunk.example.com:8088',
      hecToken: 'secret-token',
      index: 'main',
      source: 'agentguard',
    });
    (db.getSiemConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...MOCK_SIEM_SPLUNK_ROW,
      config_encrypted: configEncrypted,
    });

    const res = await request(app)
      .get('/api/v1/siem/splunk/config')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('splunk');
    expect(res.body.hecUrl).toBe('https://splunk.example.com:8088');
    expect(res.body.hecToken).toBe('***');
  });

  it('returns 404 when no Splunk config exists', async () => {
    (db.getSiemConfig as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await request(app)
      .get('/api/v1/siem/splunk/config')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(404);
  });
});

describe('Splunk HEC — DELETE /api/v1/siem/splunk/config', () => {
  it('deletes Splunk config', async () => {
    const db = createMockDb();
    (db.getSiemConfig as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SIEM_SPLUNK_ROW);

    const res = await request(buildSiemApp(db))
      .delete('/api/v1/siem/splunk/config')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(db.deleteSiemConfig).toHaveBeenCalledWith('tenant-123');
  });

  it('returns 404 when no config to delete', async () => {
    const db = createMockDb();
    (db.getSiemConfig as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await request(buildSiemApp(db))
      .delete('/api/v1/siem/splunk/config')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(404);
  });
});

describe('Azure Sentinel — POST /api/v1/siem/sentinel/configure', () => {
  let db: IDatabase;
  let app: express.Application;

  beforeEach(() => {
    db = createMockDb();
    app = buildSiemApp(db);
  });

  it('configures Azure Sentinel successfully', async () => {
    (db.upsertSiemConfig as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SIEM_SENTINEL_ROW);

    const res = await request(app)
      .post('/api/v1/siem/sentinel/configure')
      .set('x-api-key', 'valid-key')
      .send({
        workspaceId: 'my-workspace-id',
        sharedKey: Buffer.from('test-key-32-bytes-long-enough!!').toString('base64'),
        logType: 'AgentGuard_CL',
      });

    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('sentinel');
    expect(res.body.workspaceId).toBe('my-workspace-id');
    expect(res.body.sharedKey).toBe('***');
    expect(db.upsertSiemConfig).toHaveBeenCalledWith('tenant-123', 'sentinel', expect.any(String));
  });

  it('returns 400 when workspaceId is missing', async () => {
    const res = await request(app)
      .post('/api/v1/siem/sentinel/configure')
      .set('x-api-key', 'valid-key')
      .send({ sharedKey: 'key' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('workspaceId');
  });

  it('returns 400 when sharedKey is missing', async () => {
    const res = await request(app)
      .post('/api/v1/siem/sentinel/configure')
      .set('x-api-key', 'valid-key')
      .send({ workspaceId: 'ws-id' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('sharedKey');
  });
});

describe('Azure Sentinel — GET /api/v1/siem/sentinel/config', () => {
  it('returns Sentinel config with masked key', async () => {
    const db = createMockDb();
    const configEncrypted = encryptConfig({
      workspaceId: 'my-workspace',
      sharedKey: 'secret-shared-key',
    });
    (db.getSiemConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...MOCK_SIEM_SENTINEL_ROW,
      config_encrypted: configEncrypted,
    });

    const res = await request(buildSiemApp(db))
      .get('/api/v1/siem/sentinel/config')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.workspaceId).toBe('my-workspace');
    expect(res.body.sharedKey).toBe('***');
  });

  it('returns 404 when no Sentinel config exists', async () => {
    const db = createMockDb();
    (db.getSiemConfig as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await request(buildSiemApp(db))
      .get('/api/v1/siem/sentinel/config')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(404);
  });
});

describe('Azure Sentinel — DELETE /api/v1/siem/sentinel/config', () => {
  it('deletes Sentinel config', async () => {
    const db = createMockDb();
    (db.getSiemConfig as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SIEM_SENTINEL_ROW);

    const res = await request(buildSiemApp(db))
      .delete('/api/v1/siem/sentinel/config')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(db.deleteSiemConfig).toHaveBeenCalledWith('tenant-123');
  });
});

describe('Splunk HEC — POST /api/v1/siem/splunk/test', () => {
  it('returns 404 when no Splunk config exists', async () => {
    const db = createMockDb();
    (db.getSiemConfig as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await request(buildSiemApp(db))
      .post('/api/v1/siem/splunk/test')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Configure first');
  });
});

describe('Azure Sentinel — POST /api/v1/siem/sentinel/test', () => {
  it('returns 404 when no Sentinel config exists', async () => {
    const db = createMockDb();
    (db.getSiemConfig as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await request(buildSiemApp(db))
      .post('/api/v1/siem/sentinel/test')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Configure first');
  });
});

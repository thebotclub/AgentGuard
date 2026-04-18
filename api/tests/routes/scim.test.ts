/**
 * Tests for SCIM 2.0 Provisioning Routes
 *
 * Covers:
 *   - ServiceProviderConfig discovery
 *   - Schema discovery
 *   - Token CRUD (create, list, revoke)
 *   - User CRUD (list, get, create, replace, patch, delete)
 *   - Group CRUD (list, get, create, patch, delete)
 *   - SCIM bearer token auth
 *   - Input validation (missing userName, missing displayName)
 *   - Duplicate user handling (409)
 *   - Soft delete / 404 for missing users
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createScimRoutes } from '../../routes/scim/index.js';
import { createMockDb, MOCK_TENANT } from '../helpers/mock-db.js';
import { createMockAuthMiddleware } from '../helpers/create-app.js';
import type { IDatabase } from '../../db-interface.js';

const SCIM_TOKEN_HASH = 'a'.repeat(64); // mock hash for "valid-scim-token"
const SCIM_TOKEN_ROW = {
  id: 'scim-token-1',
  tenant_id: 'tenant-123',
  label: 'default',
  token_hash: SCIM_TOKEN_HASH,
  active: 1,
  created_at: '2024-01-01T00:00:00.000Z',
  last_used_at: null,
};

const MOCK_SCIM_USER = {
  id: 'scim-user-1',
  tenant_id: 'tenant-123',
  external_id: 'ext-123',
  user_name: 'jdoe@example.com',
  display_name: 'John Doe',
  given_name: 'John',
  family_name: 'Doe',
  email: 'jdoe@example.com',
  active: 1,
  role: 'member',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: null,
  deleted_at: null,
};

const MOCK_SCIM_GROUP = {
  id: 'scim-group-1',
  tenant_id: 'tenant-123',
  display_name: 'Engineering',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: null,
};

function buildScimApp(db: IDatabase) {
  const app = express();
  app.use(express.json());
  const auth = createMockAuthMiddleware();
  app.use(createScimRoutes(db, auth));
  return app;
}

function buildScimAppWithBearer(db: IDatabase) {
  // Override getScimTokenByHash to return a valid token for our test hash
  (db.getScimTokenByHash as ReturnType<typeof vi.fn>).mockResolvedValue(SCIM_TOKEN_ROW);
  (db.getTenant as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_TENANT);
  return buildScimApp(db);
}

describe('GET /api/scim/v2/ServiceProviderConfig', () => {
  it('returns SCIM service provider config', async () => {
    const db = createMockDb();
    const app = buildScimApp(db);

    const res = await request(app).get('/api/scim/v2/ServiceProviderConfig');

    expect(res.status).toBe(200);
    expect(res.body.patch.supported).toBe(true);
    expect(res.body.filter.supported).toBe(true);
    expect(res.body.filter.maxResults).toBe(200);
    expect(res.body.authenticationSchemes).toHaveLength(1);
    expect(res.body.authenticationSchemes[0].type).toBe('oauthbearertoken');
  });
});

describe('GET /api/scim/v2/Schemas', () => {
  it('returns User and Group schemas', async () => {
    const db = createMockDb();
    const app = buildScimApp(db);

    const res = await request(app).get('/api/scim/v2/Schemas');

    expect(res.status).toBe(200);
    expect(res.body.totalResults).toBe(2);
    expect(res.body.Resources).toHaveLength(2);
    const names = res.body.Resources.map((r: { name: string }) => r.name);
    expect(names).toContain('User');
    expect(names).toContain('Group');
  });
});

describe('SCIM Token Management', () => {
  let db: IDatabase;
  let app: express.Application;

  beforeEach(() => {
    db = createMockDb();
    app = buildScimApp(db);
  });

  it('POST /tokens — creates a SCIM token (201)', async () => {
    (db.createScimToken as ReturnType<typeof vi.fn>).mockResolvedValue(SCIM_TOKEN_ROW);

    const res = await request(app)
      .post('/api/scim/v2/tokens')
      .set('x-api-key', 'valid-key')
      .send({ label: 'test-token' });

    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^ag-scim-/);
    expect(res.body.id).toBe('scim-token-1');
    expect(res.body.message).toContain('securely');
    expect(db.createScimToken).toHaveBeenCalledWith('tenant-123', expect.any(String), 'test-token');
  });

  it('POST /tokens — returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/scim/v2/tokens')
      .send({ label: 'test' });

    expect(res.status).toBe(401);
  });

  it('GET /tokens — lists tokens for tenant', async () => {
    (db.listScimTokens as ReturnType<typeof vi.fn>).mockResolvedValue([SCIM_TOKEN_ROW]);

    const res = await request(app)
      .get('/api/scim/v2/tokens')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('scim-token-1');
    expect(res.body[0].active).toBe(true);
    // Token hash should NOT be exposed
    expect(res.body[0]).not.toHaveProperty('token_hash');
  });

  it('DELETE /tokens/:id — revokes token (204)', async () => {
    (db.revokeScimToken as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await request(app)
      .delete('/api/scim/v2/tokens/scim-token-1')
      .set('x-api-key', 'valid-key');

    expect(res.status).toBe(204);
    expect(db.revokeScimToken).toHaveBeenCalledWith('scim-token-1', 'tenant-123');
  });
});

describe('SCIM Users CRUD', () => {
  let db: IDatabase;
  let app: express.Application;

  beforeEach(() => {
    db = createMockDb();
    app = buildScimAppWithBearer(db);
  });

  it('GET /Users — lists users with SCIM auth', async () => {
    (db.listScimUsers as ReturnType<typeof vi.fn>).mockResolvedValue({
      users: [MOCK_SCIM_USER],
      total: 1,
    });

    const res = await request(app)
      .get('/api/scim/v2/Users')
      .set('Authorization', 'Bearer valid-scim-token');

    expect(res.status).toBe(200);
    expect(res.body.totalResults).toBe(1);
    expect(res.body.Resources).toHaveLength(1);
    expect(res.body.Resources[0].userName).toBe('jdoe@example.com');
  });

  it('GET /Users — returns 401 without Bearer token', async () => {
    const res = await request(app).get('/api/scim/v2/Users');
    expect(res.status).toBe(401);
  });

  it('POST /Users — creates a new SCIM user (201)', async () => {
    (db.getScimUserByUserName as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (db.createScimUser as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SCIM_USER);

    const res = await request(app)
      .post('/api/scim/v2/Users')
      .set('Authorization', 'Bearer valid-scim-token')
      .send({
        userName: 'jdoe@example.com',
        name: { givenName: 'John', familyName: 'Doe' },
        emails: [{ value: 'jdoe@example.com', primary: true }],
        active: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.userName).toBe('jdoe@example.com');
    expect(res.body.name.givenName).toBe('John');
    expect(db.createScimUser).toHaveBeenCalledWith('tenant-123', expect.objectContaining({
      user_name: 'jdoe@example.com',
      given_name: 'John',
      family_name: 'Doe',
    }));
  });

  it('POST /Users — returns 400 when userName is missing', async () => {
    const res = await request(app)
      .post('/api/scim/v2/Users')
      .set('Authorization', 'Bearer valid-scim-token')
      .send({ displayName: 'No Username' });

    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('userName');
  });

  it('POST /Users — returns 409 for duplicate userName', async () => {
    (db.getScimUserByUserName as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SCIM_USER);

    const res = await request(app)
      .post('/api/scim/v2/Users')
      .set('Authorization', 'Bearer valid-scim-token')
      .send({ userName: 'jdoe@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.detail).toContain('already exists');
  });

  it('GET /Users/:id — returns single user', async () => {
    (db.getScimUser as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SCIM_USER);

    const res = await request(app)
      .get('/api/scim/v2/Users/scim-user-1')
      .set('Authorization', 'Bearer valid-scim-token');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('scim-user-1');
    expect(res.body.active).toBe(true);
    expect(res.body.meta.resourceType).toBe('User');
  });

  it('GET /Users/:id — returns 404 for non-existent user', async () => {
    (db.getScimUser as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await request(app)
      .get('/api/scim/v2/Users/nonexistent')
      .set('Authorization', 'Bearer valid-scim-token');

    expect(res.status).toBe(404);
  });

  it('PUT /Users/:id — replaces user', async () => {
    (db.getScimUser as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SCIM_USER);
    const updated = { ...MOCK_SCIM_USER, display_name: 'Jane Doe' };
    (db.updateScimUser as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    const res = await request(app)
      .put('/api/scim/v2/Users/scim-user-1')
      .set('Authorization', 'Bearer valid-scim-token')
      .send({
        userName: 'jdoe@example.com',
        name: { givenName: 'Jane', familyName: 'Doe' },
        active: true,
      });

    expect(res.status).toBe(200);
    expect(db.updateScimUser).toHaveBeenCalledWith('scim-user-1', 'tenant-123', expect.objectContaining({
      given_name: 'Jane',
    }));
  });

  it('PATCH /Users/:id — partial update (deactivate)', async () => {
    (db.getScimUser as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SCIM_USER);
    const deactivated = { ...MOCK_SCIM_USER, active: 0 };
    (db.updateScimUser as ReturnType<typeof vi.fn>).mockResolvedValue(deactivated);

    const res = await request(app)
      .patch('/api/scim/v2/Users/scim-user-1')
      .set('Authorization', 'Bearer valid-scim-token')
      .send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', path: 'active', value: false }],
      });

    expect(res.status).toBe(200);
    expect(db.updateScimUser).toHaveBeenCalledWith('scim-user-1', 'tenant-123', expect.objectContaining({
      active: 0,
    }));
  });

  it('DELETE /Users/:id — soft-deletes user (204)', async () => {
    (db.getScimUser as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SCIM_USER);
    (db.deleteScimUser as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await request(app)
      .delete('/api/scim/v2/Users/scim-user-1')
      .set('Authorization', 'Bearer valid-scim-token');

    expect(res.status).toBe(204);
    expect(db.deleteScimUser).toHaveBeenCalledWith('scim-user-1', 'tenant-123');
  });
});

describe('SCIM Groups CRUD', () => {
  let db: IDatabase;
  let app: express.Application;

  beforeEach(() => {
    db = createMockDb();
    app = buildScimAppWithBearer(db);
  });

  it('POST /Groups — creates a new group (201)', async () => {
    (db.createScimGroup as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SCIM_GROUP);
    (db.getScimGroupMembers as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await request(app)
      .post('/api/scim/v2/Groups')
      .set('Authorization', 'Bearer valid-scim-token')
      .send({ displayName: 'Engineering' });

    expect(res.status).toBe(201);
    expect(res.body.displayName).toBe('Engineering');
    expect(db.createScimGroup).toHaveBeenCalledWith('tenant-123', 'Engineering');
  });

  it('POST /Groups — returns 400 when displayName is missing', async () => {
    const res = await request(app)
      .post('/api/scim/v2/Groups')
      .set('Authorization', 'Bearer valid-scim-token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('displayName');
  });

  it('GET /Groups — lists groups with members', async () => {
    (db.listScimGroups as ReturnType<typeof vi.fn>).mockResolvedValue({
      groups: [MOCK_SCIM_GROUP],
      total: 1,
    });
    (db.getScimGroupMembers as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await request(app)
      .get('/api/scim/v2/Groups')
      .set('Authorization', 'Bearer valid-scim-token');

    expect(res.status).toBe(200);
    expect(res.body.totalResults).toBe(1);
    expect(res.body.Resources[0].displayName).toBe('Engineering');
  });

  it('GET /Groups/:id — returns group with members', async () => {
    (db.getScimGroup as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SCIM_GROUP);
    (db.getScimGroupMembers as ReturnType<typeof vi.fn>).mockResolvedValue([
      { user_id: 'scim-user-1' },
    ]);
    (db.getScimUser as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SCIM_USER);

    const res = await request(app)
      .get('/api/scim/v2/Groups/scim-group-1')
      .set('Authorization', 'Bearer valid-scim-token');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('scim-group-1');
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].value).toBe('scim-user-1');
  });

  it('PATCH /Groups/:id — adds members', async () => {
    (db.getScimGroup as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SCIM_GROUP);
    (db.addScimGroupMember as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (db.getScimGroupMembers as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await request(app)
      .patch('/api/scim/v2/Groups/scim-group-1')
      .set('Authorization', 'Bearer valid-scim-token')
      .send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{
          op: 'add',
          path: 'members',
          value: [{ value: 'scim-user-1' }],
        }],
      });

    expect(res.status).toBe(200);
    expect(db.addScimGroupMember).toHaveBeenCalledWith('scim-group-1', 'scim-user-1', 'tenant-123');
  });

  it('DELETE /Groups/:id — deletes group (204)', async () => {
    (db.getScimGroup as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SCIM_GROUP);
    (db.deleteScimGroup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await request(app)
      .delete('/api/scim/v2/Groups/scim-group-1')
      .set('Authorization', 'Bearer valid-scim-token');

    expect(res.status).toBe(204);
    expect(db.deleteScimGroup).toHaveBeenCalledWith('scim-group-1', 'tenant-123');
  });

  it('DELETE /Groups/:id — returns 404 for non-existent group', async () => {
    (db.getScimGroup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const res = await request(app)
      .delete('/api/scim/v2/Groups/nonexistent')
      .set('Authorization', 'Bearer valid-scim-token');

    expect(res.status).toBe(404);
  });
});

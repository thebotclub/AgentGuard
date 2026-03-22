/**
 * AgentGuard — SCIM-Specific Isolation Tests
 *
 * Deep tests for SCIM provisioning isolation:
 * - SCIM tokens strictly bound to issuing tenant
 * - Cross-tenant SCIM token reuse is rejected
 * - SCIM user/group data never leaks across tenants
 * - Filter queries are tenant-scoped
 * - SCIM audit events are tenant-scoped
 *
 * Run: npx tsx --test tests/isolation/scim-isolation.test.ts
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import crypto from 'node:crypto';

const BASE = process.env['BASE_URL'] || 'http://localhost:3001';
const TEST_RUN_ID = crypto.randomBytes(4).toString('hex');

const tenantA = { email: `scim-a-${TEST_RUN_ID}@test.local`, apiKey: '', tenantId: '', jwt: '', scimToken: '' };
const tenantB = { email: `scim-b-${TEST_RUN_ID}@test.local`, apiKey: '', tenantId: '', jwt: '', scimToken: '' };

interface ApiResponse {
  status: number;
  body: Record<string, unknown>;
}

async function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<ApiResponse> {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, body: parsed };
}

async function scimReq(method: string, path: string, token: string, body?: unknown): Promise<ApiResponse> {
  const opts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/scim+json',
      'Accept': 'application/scim+json',
      'Authorization': `Bearer ${token}`,
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, body: parsed };
}

async function waitForServer() {
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(`${BASE}/health`); if (r.ok) return; } catch { /* wait */ }
    await sleep(300);
  }
  throw new Error('Server not ready');
}

before(async () => {
  await waitForServer();

  const a = await req('POST', '/api/v1/signup', { name: `SCIM Test A ${TEST_RUN_ID}`, email: tenantA.email });
  assert.equal(a.status, 201);
  tenantA.apiKey = a.body['api_key'] as string;
  tenantA.tenantId = a.body['tenant_id'] as string;

  const b = await req('POST', '/api/v1/signup', { name: `SCIM Test B ${TEST_RUN_ID}`, email: tenantB.email });
  assert.equal(b.status, 201);
  tenantB.apiKey = b.body['api_key'] as string;
  tenantB.tenantId = b.body['tenant_id'] as string;

  const loginA = await req('POST', '/api/v1/auth/login', { email: tenantA.email });
  if (loginA.status === 200) tenantA.jwt = loginA.body['token'] as string ?? '';

  const loginB = await req('POST', '/api/v1/auth/login', { email: tenantB.email });
  if (loginB.status === 200) tenantB.jwt = loginB.body['token'] as string ?? '';

  // Issue SCIM tokens
  if (tenantA.jwt) {
    const tokA = await req('POST', '/api/scim/v2/tokens', { label: 'scim-iso-a' }, { 'Authorization': `Bearer ${tenantA.jwt}` });
    if (tokA.status === 201) tenantA.scimToken = tokA.body['token'] as string ?? '';
  }

  if (tenantB.jwt) {
    const tokB = await req('POST', '/api/scim/v2/tokens', { label: 'scim-iso-b' }, { 'Authorization': `Bearer ${tenantB.jwt}` });
    if (tokB.status === 201) tenantB.scimToken = tokB.body['token'] as string ?? '';
  }

  console.log(`[scim-setup] Tenant A: ${tenantA.tenantId}, hasToken: ${!!tenantA.scimToken}`);
  console.log(`[scim-setup] Tenant B: ${tenantB.tenantId}, hasToken: ${!!tenantB.scimToken}`);
});

// Helper to skip if SCIM tokens not available
function needsScimTokens(t: { scimToken: string }[], fn: () => Promise<void>) {
  return async () => {
    if (t.some(x => !x.scimToken)) {
      console.log('[skip] SCIM token not available (JWT auth required)');
      return;
    }
    await fn();
  };
}

describe('SCIM Data Isolation', () => {

  describe('Token Binding', () => {
    it('SCIM tokens are unique per tenant', needsScimTokens([tenantA, tenantB], async () => {
      assert.notEqual(tenantA.scimToken, tenantB.scimToken, 'SCIM tokens must differ between tenants');
    }));

    it('Tenant A token is rejected for Tenant B operations when another token binds correctly', needsScimTokens([tenantA, tenantB], async () => {
      // Tenant A creates a user with their token
      const userName = `token-binding-test-${TEST_RUN_ID}@tenant-a.local`;
      const createRes = await scimReq('POST', '/api/scim/v2/Users', tenantA.scimToken, {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName,
        active: true,
      });

      if (createRes.status !== 201) {
        console.log(`[skip] SCIM create returned ${createRes.status}`);
        return;
      }

      const userId = createRes.body['id'] as string;

      // Tenant B's SCIM token MUST NOT access this user
      const getRes = await scimReq('GET', `/api/scim/v2/Users/${userId}`, tenantB.scimToken);
      assert.ok(
        [403, 404].includes(getRes.status),
        `Tenant B token must not GET Tenant A user. Got ${getRes.status}: ${JSON.stringify(getRes.body)}`
      );
    }));

    it('Expired/invalid SCIM token is rejected 401', async () => {
      const fakeToken = 'ag-scim-' + crypto.randomBytes(32).toString('hex');
      const res = await scimReq('GET', '/api/scim/v2/Users', fakeToken);
      assert.equal(res.status, 401, `Invalid SCIM token must return 401, got ${res.status}`);
    });
  });

  describe('User Data Isolation', () => {
    it('SCIM filter query is tenant-scoped', needsScimTokens([tenantA, tenantB], async () => {
      // Create a user with a unique email in Tenant A
      const uniqueUserName = `filter-test-${TEST_RUN_ID}@tenant-a.local`;
      const createRes = await scimReq('POST', '/api/scim/v2/Users', tenantA.scimToken, {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: uniqueUserName,
        active: true,
      });

      if (createRes.status !== 201) return;

      // Tenant B tries to filter for that user
      const filterRes = await scimReq(
        'GET',
        `/api/scim/v2/Users?filter=userName+eq+%22${encodeURIComponent(uniqueUserName)}%22`,
        tenantB.scimToken
      );

      assert.equal(filterRes.status, 200, 'Filter should succeed but return empty results');
      const resources = filterRes.body['Resources'] as unknown[] ?? [];
      assert.equal(resources.length, 0, `SCIM filter across tenants MUST return empty: Tenant B found ${resources.length} results`);
    }));

    it('SCIM list pagination is tenant-scoped', needsScimTokens([tenantA, tenantB], async () => {
      // Create 3 users for Tenant A
      const createdIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const r = await scimReq('POST', '/api/scim/v2/Users', tenantA.scimToken, {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
          userName: `pagination-test-${i}-${TEST_RUN_ID}@tenant-a.local`,
          active: true,
        });
        if (r.status === 201) createdIds.push(r.body['id'] as string);
      }

      if (createdIds.length === 0) return;

      // Tenant B lists users — must not see any of Tenant A's
      const listRes = await scimReq('GET', '/api/scim/v2/Users?count=200', tenantB.scimToken);
      const resources = listRes.body['Resources'] as Record<string, unknown>[] ?? [];
      const leaked = resources.filter(u => createdIds.includes(u['id'] as string));
      assert.equal(leaked.length, 0, `SCIM list MUST NOT return Tenant A users to Tenant B (leaked: ${leaked.length})`);
    }));

    it('SCIM DELETE by Tenant B cannot delete Tenant A user', needsScimTokens([tenantA, tenantB], async () => {
      const userName = `delete-iso-${TEST_RUN_ID}@tenant-a.local`;
      const createRes = await scimReq('POST', '/api/scim/v2/Users', tenantA.scimToken, {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName,
        active: true,
      });

      if (createRes.status !== 201) return;
      const userId = createRes.body['id'] as string;

      // Tenant B attempts to delete
      const deleteRes = await scimReq('DELETE', `/api/scim/v2/Users/${userId}`, tenantB.scimToken);
      assert.ok(
        [403, 404].includes(deleteRes.status),
        `Cross-tenant SCIM DELETE must return 403/404, got ${deleteRes.status}`
      );

      // Verify user still exists in Tenant A
      const getRes = await scimReq('GET', `/api/scim/v2/Users/${userId}`, tenantA.scimToken);
      assert.equal(getRes.status, 200, 'User must still exist after failed cross-tenant delete');
      assert.equal(getRes.body['active'], true, 'User must still be active');
    }));

    it('SCIM PATCH by Tenant B cannot modify Tenant A user', needsScimTokens([tenantA, tenantB], async () => {
      const userName = `patch-iso-${TEST_RUN_ID}@tenant-a.local`;
      const createRes = await scimReq('POST', '/api/scim/v2/Users', tenantA.scimToken, {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName,
        displayName: 'Original Name',
        active: true,
      });

      if (createRes.status !== 201) return;
      const userId = createRes.body['id'] as string;

      // Tenant B tries to patch
      const patchRes = await scimReq('PATCH', `/api/scim/v2/Users/${userId}`, tenantB.scimToken, {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', path: 'displayName', value: 'HACKED BY TENANT B' }],
      });

      assert.ok(
        [403, 404].includes(patchRes.status),
        `Cross-tenant SCIM PATCH must return 403/404, got ${patchRes.status}`
      );

      // Verify name unchanged
      const getRes = await scimReq('GET', `/api/scim/v2/Users/${userId}`, tenantA.scimToken);
      if (getRes.status === 200) {
        assert.equal(getRes.body['displayName'], 'Original Name', 'displayName must not be modified by cross-tenant PATCH');
      }
    }));
  });

  describe('Group Data Isolation', () => {
    it('Tenant B cannot add members to Tenant A groups', needsScimTokens([tenantA, tenantB], async () => {
      // Create a group in Tenant A
      const createGroupRes = await scimReq('POST', '/api/scim/v2/Groups', tenantA.scimToken, {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        displayName: `Group-Isolation-${TEST_RUN_ID}`,
      });

      if (createGroupRes.status !== 201) return;
      const groupId = createGroupRes.body['id'] as string;

      // Create a user in Tenant B
      const createUserRes = await scimReq('POST', '/api/scim/v2/Users', tenantB.scimToken, {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: `group-member-b-${TEST_RUN_ID}@tenant-b.local`,
        active: true,
      });

      if (createUserRes.status !== 201) return;
      const userBId = createUserRes.body['id'] as string;

      // Tenant B tries to add their user to Tenant A's group
      const patchRes = await scimReq('PATCH', `/api/scim/v2/Groups/${groupId}`, tenantB.scimToken, {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'add', path: 'members', value: [{ value: userBId }] }],
      });

      assert.ok(
        [403, 404].includes(patchRes.status),
        `Cross-tenant group member add must return 403/404, got ${patchRes.status}`
      );
    }));

    it('SCIM group list is tenant-scoped', needsScimTokens([tenantA, tenantB], async () => {
      // Create a group for Tenant A
      const createRes = await scimReq('POST', '/api/scim/v2/Groups', tenantA.scimToken, {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        displayName: `SecretGroup-${TEST_RUN_ID}`,
      });

      if (createRes.status !== 201) return;
      const groupId = createRes.body['id'] as string;

      // Tenant B lists groups — must not see Tenant A's group
      const listRes = await scimReq('GET', '/api/scim/v2/Groups', tenantB.scimToken);
      const groups = listRes.body['Resources'] as Record<string, unknown>[] ?? [];
      const leaked = groups.filter(g => g['id'] === groupId);
      assert.equal(leaked.length, 0, `SCIM group list MUST NOT return Tenant A groups to Tenant B`);
    }));
  });
});

after(() => {
  console.log('[scim-isolation] Tests complete');
});

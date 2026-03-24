/**
 * AgentGuard Load Test — SCIM Provisioning Bulk Operations
 *
 * Tests SCIM provisioning at enterprise scale:
 * - Bulk user creation (simulating initial IdP sync)
 * - Concurrent user updates (attribute changes)
 * - Group membership management
 * - Mixed provisioning workload
 *
 * Run:
 *   k6 run tests/load/scim-provisioning.js \
 *     -e BASE_URL=https://api.agentguard.tech \
 *     -e SCIM_TOKEN=ag-scim-your-token
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URL, scimHeaders } from './config.js';

// ── Custom Metrics ─────────────────────────────────────────────────────────
const usersCreated = new Counter('scim_users_created');
const usersUpdated = new Counter('scim_users_updated');
const usersDeprovisioned = new Counter('scim_users_deprovisioned');
const groupsCreated = new Counter('scim_groups_created');
const scimErrors = new Rate('scim_errors');
const createLatency = new Trend('scim_create_latency_ms', true);
const listLatency = new Trend('scim_list_latency_ms', true);
const patchLatency = new Trend('scim_patch_latency_ms', true);

// ── Test Configuration ─────────────────────────────────────────────────────
export const options = {
  scenarios: {
    // Initial bulk sync: create many users fast
    bulk_create: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { duration: '30s', target: 50 },    // Ramp to 50/s (bulk create)
        { duration: '2m',  target: 100 },   // Hold at 100/s
        { duration: '30s', target: 0 },     // Slow down
      ],
      tags: { phase: 'bulk_create' },
    },
    // Ongoing updates: attribute changes, active toggles
    ongoing_updates: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: 100,
      duration: '4m',
      startTime: '1m',
      tags: { phase: 'updates' },
    },
    // Group management
    group_ops: {
      executor: 'constant-vus',
      vus: 10,
      duration: '4m',
      startTime: '30s',
      tags: { phase: 'groups' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    scim_errors: ['rate<0.02'],
    scim_create_latency_ms: ['p(99)<500'],
    scim_list_latency_ms: ['p(99)<200'],
    scim_patch_latency_ms: ['p(99)<300'],
  },
  tags: { test_type: 'scim_provisioning' },
};

// ── User generation ───────────────────────────────────────────────────────
const DOMAINS = ['acme.com', 'megacorp.io', 'enterprise.net', 'bigco.org'];
const DEPARTMENTS = ['Engineering', 'Sales', 'Marketing', 'Finance', 'Operations', 'HR', 'Legal'];
const ROLES = ['admin', 'member', 'viewer'];

function generateUser(index) {
  const domain = DOMAINS[index % DOMAINS.length];
  const dept = DEPARTMENTS[index % DEPARTMENTS.length];
  const role = ROLES[index % ROLES.length];
  const firstName = `First${index}`;
  const lastName = `Last${index}`;

  return {
    schemas: [
      'urn:ietf:params:scim:schemas:core:2.0:User',
      'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User',
    ],
    userName: `user${index}.${Date.now()}@${domain}`,
    externalId: `ext-${domain}-${index}-${__VU}`,
    name: {
      givenName: firstName,
      familyName: lastName,
      formatted: `${firstName} ${lastName}`,
    },
    displayName: `${firstName} ${lastName}`,
    emails: [{ value: `user${index}@${domain}`, primary: true, type: 'work' }],
    active: true,
    'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': {
      organization: role,
      department: dept,
    },
  };
}

function generatePatchOp(field, value) {
  return {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
    Operations: [{ op: 'replace', path: field, value }],
  };
}

// ── Track created user IDs per VU ─────────────────────────────────────────
const createdUserIds = [];

// ── Main VU function ──────────────────────────────────────────────────────
export default function () {
  const phase = __ENV.PHASE || 'mixed';

  if (phase === 'bulk_create' || __ITER % 3 === 0) {
    createUserFlow();
  } else if (phase === 'updates' || __ITER % 3 === 1) {
    updateUserFlow();
  } else {
    groupFlow();
  }
}

function createUserFlow() {
  const user = generateUser(__ITER * 1000 + __VU);
  const createStart = Date.now();

  const res = http.post(
    `${BASE_URL}/api/scim/v2/Users`,
    JSON.stringify(user),
    { headers: scimHeaders, tags: { op: 'create_user' } }
  );

  createLatency.add(Date.now() - createStart);

  const ok = check(res, {
    'SCIM create 201': (r) => r.status === 201,
    'has SCIM schemas': (r) => {
      try { return Array.isArray(JSON.parse(r.body).schemas); } catch { return false; }
    },
    'has user id': (r) => {
      try { return JSON.parse(r.body).id !== undefined; } catch { return false; }
    },
  });

  scimErrors.add(!ok);

  if (ok) {
    usersCreated.add(1);
    try {
      const body = JSON.parse(res.body);
      if (body.id && createdUserIds.length < 100) {
        createdUserIds.push(body.id);
      }
    } catch { /* ignore */ }
  }
}

function updateUserFlow() {
  // List users first (simulates IdP polling for changes)
  const listStart = Date.now();
  const listRes = http.get(
    `${BASE_URL}/api/scim/v2/Users?count=20&startIndex=1`,
    { headers: scimHeaders, tags: { op: 'list_users' } }
  );
  listLatency.add(Date.now() - listStart);

  const listOk = check(listRes, {
    'SCIM list 200': (r) => r.status === 200,
    'has Resources': (r) => {
      try { return Array.isArray(JSON.parse(r.body).Resources); } catch { return false; }
    },
  });

  if (!listOk) { scimErrors.add(true); return; }

  // Pick a user to update
  let userId = null;
  try {
    const resources = JSON.parse(listRes.body).Resources;
    if (resources && resources.length > 0) {
      userId = resources[Math.floor(Math.random() * resources.length)].id;
    }
  } catch { /* ignore */ }

  if (!userId && createdUserIds.length > 0) {
    userId = createdUserIds[Math.floor(Math.random() * createdUserIds.length)];
  }

  if (!userId) return; // No users to update yet

  // PATCH: toggle active or update displayName
  const patchOp = Math.random() > 0.5
    ? generatePatchOp('active', Math.random() > 0.3) // 70% active
    : generatePatchOp('displayName', `Updated User ${Date.now()}`);

  const patchStart = Date.now();
  const patchRes = http.patch(
    `${BASE_URL}/api/scim/v2/Users/${userId}`,
    JSON.stringify(patchOp),
    { headers: scimHeaders, tags: { op: 'patch_user' } }
  );
  patchLatency.add(Date.now() - patchStart);

  const ok = check(patchRes, {
    'SCIM patch 200': (r) => r.status === 200,
  });

  scimErrors.add(!ok);
  if (ok) usersUpdated.add(1);
}

function groupFlow() {
  group('scim_groups', () => {
    // Create a group
    const groupName = `dept-${DEPARTMENTS[__ITER % DEPARTMENTS.length]}-${__VU}-${__ITER}`;
    const createRes = http.post(
      `${BASE_URL}/api/scim/v2/Groups`,
      JSON.stringify({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        displayName: groupName,
      }),
      { headers: scimHeaders, tags: { op: 'create_group' } }
    );

    const created = check(createRes, {
      'SCIM group create 201': (r) => r.status === 201,
    });
    scimErrors.add(!created);
    if (created) groupsCreated.add(1);

    // List groups
    const listRes = http.get(
      `${BASE_URL}/api/scim/v2/Groups?count=10`,
      { headers: scimHeaders, tags: { op: 'list_groups' } }
    );
    check(listRes, { 'SCIM groups list 200': (r) => r.status === 200 });

    // Add a member if we have users and a group
    if (created && createdUserIds.length > 0) {
      let groupId;
      try { groupId = JSON.parse(createRes.body).id; } catch { return; }

      const userId = createdUserIds[Math.floor(Math.random() * createdUserIds.length)];
      const patchMembersRes = http.patch(
        `${BASE_URL}/api/scim/v2/Groups/${groupId}`,
        JSON.stringify({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
          Operations: [{
            op: 'add',
            path: 'members',
            value: [{ value: userId }],
          }],
        }),
        { headers: scimHeaders, tags: { op: 'add_group_member' } }
      );
      check(patchMembersRes, { 'SCIM add member 200': (r) => r.status === 200 });
    }

    sleep(0.5);
  });
}

// ── Setup ─────────────────────────────────────────────────────────────────
export function setup() {
  console.log('[setup] SCIM provisioning load test');

  // Verify SCIM endpoint is accessible
  const spRes = http.get(`${BASE_URL}/api/scim/v2/ServiceProviderConfig`, {
    headers: { 'Accept': 'application/scim+json' },
  });
  if (spRes.status === 200) {
    console.log('[setup] SCIM ServiceProviderConfig accessible ✓');
  } else {
    console.warn(`[setup] ServiceProviderConfig returned ${spRes.status}`);
  }
}

// ── Teardown ──────────────────────────────────────────────────────────────
export function teardown() {
  console.log(`[teardown] SCIM provisioning test complete`);
  console.log(`[teardown] Total users created: see scim_users_created metric`);
}

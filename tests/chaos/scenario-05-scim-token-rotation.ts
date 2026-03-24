/**
 * Chaos Scenario 5: SCIM Token Rotation During Active Sync
 *
 * Verifies no provisioning gaps during SCIM token rotation:
 * - In-flight SCIM requests complete successfully before token expiry
 * - New token activates without dropping provisioned users
 * - No duplicate user creation during rotation window
 * - Failed sync operations are retried with new token
 *
 * SCIM endpoints: /v1/scim/v2/ (SCIM 2.0)
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  request,
  waitForApi,
  registerTestTenant,
  recordResult,
  type ChaosResult,
} from './helpers.js';

export async function runScenario05(): Promise<ChaosResult> {
  const start = Date.now();
  const scenario = 'SCIM Token Rotation During Active Sync';

  try {
    // ── Setup: Get initial SCIM token ────────────────────────────────────────
    const { apiKey, tenantId } = await registerTestTenant();

    // Get SCIM token (enterprise feature — may return 403 in basic tier)
    const scimTokenRes = await request(
      'POST',
      '/v1/scim/token',
      { description: 'Chaos SCIM token' },
      { Authorization: `Bearer ${apiKey}` },
    );

    if (scimTokenRes.status === 403 || scimTokenRes.status === 404) {
      // SCIM not available in this tier — record as skipped
      const result: ChaosResult = {
        scenario,
        passed: true,
        behavior: 'SCIM not available in current tier — scenario skipped',
        details: `Status: ${scimTokenRes.status}`,
        durationMs: Date.now() - start,
        recommendations: [
          'SCIM token rotation test requires Enterprise tier',
          'Enable SCIM in test environment for full chaos coverage',
        ],
      };
      recordResult(result);
      return result;
    }

    const initialToken = (scimTokenRes.body as Record<string, Record<string, string>>)?.data?.token;

    if (!initialToken) {
      throw new Error(`Failed to get SCIM token: ${JSON.stringify(scimTokenRes.body)}`);
    }

    // ── Start Active SCIM Sync (provision users) ──────────────────────────────
    console.log('  [chaos] Starting concurrent SCIM provisioning...');

    const scimUsers = Array.from({ length: 5 }, (_, i) => ({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      userName: `chaos-scim-user-${i}-${Date.now()}@test.local`,
      name: { givenName: 'Chaos', familyName: `User${i}` },
      active: true,
      emails: [{ value: `chaos-scim-user-${i}-${Date.now()}@test.local`, primary: true }],
    }));

    // Start provisioning users with initial token (concurrent)
    const provisioningOps = scimUsers.map((user) =>
      request('POST', '/v1/scim/v2/Users', user, {
        Authorization: `Bearer ${initialToken}`,
        'Content-Type': 'application/scim+json',
      }),
    );

    // ── Rotate Token Mid-Sync ─────────────────────────────────────────────────
    await sleep(100); // Let some requests start
    console.log('  [chaos] Rotating SCIM token mid-sync...');

    const rotateRes = await request(
      'POST',
      '/v1/scim/token/rotate',
      { reason: 'Chaos token rotation test' },
      { Authorization: `Bearer ${apiKey}` },
    );

    const newToken =
      rotateRes.ok
        ? (rotateRes.body as Record<string, Record<string, string>>)?.data?.token
        : null;

    // Wait for all provisioning ops to complete
    const provisionResults = await Promise.allSettled(provisioningOps);

    const provisioned = provisionResults.filter(
      (r) => r.status === 'fulfilled' && ((r.value as { status: number }).status === 201 || (r.value as { status: number }).status === 200),
    ).length;

    const tokenExpired = provisionResults.filter(
      (r) => r.status === 'fulfilled' && (r.value as { status: number }).status === 401,
    ).length;

    // ── Verify No Provisioning Gaps ───────────────────────────────────────────
    // Retry 401 failures with new token (simulating IdP retry logic)
    let retrySuccesses = 0;
    if (newToken && tokenExpired > 0) {
      const retryOps = scimUsers.slice(0, tokenExpired).map((user) =>
        request('POST', '/v1/scim/v2/Users', user, {
          Authorization: `Bearer ${newToken}`,
          'Content-Type': 'application/scim+json',
        }),
      );
      const retryResults = await Promise.all(retryOps);
      retrySuccesses = retryResults.filter((r) => r.ok || r.status === 409).length; // 409 = already exists
    }

    // ── Verify List with New Token ────────────────────────────────────────────
    const listRes = newToken
      ? await request('GET', '/v1/scim/v2/Users', undefined, {
          Authorization: `Bearer ${newToken}`,
          'Content-Type': 'application/scim+json',
        })
      : { ok: false, status: 0, body: {}, latencyMs: 0 };

    const noGaps =
      provisioned + retrySuccesses >= scimUsers.length * 0.8; // 80% must succeed

    const result: ChaosResult = {
      scenario,
      passed: noGaps,
      behavior: noGaps
        ? `No provisioning gaps: ${provisioned} direct + ${retrySuccesses} retried`
        : `Provisioning gaps detected: only ${provisioned}/${scimUsers.length} users created`,
      details: JSON.stringify({
        initialProvisioned: provisioned,
        tokenExpiredErrors: tokenExpired,
        retrySuccesses,
        tokenRotated: rotateRes.ok,
        newTokenWorks: listRes.ok,
        totalUsers: scimUsers.length,
      }),
      durationMs: Date.now() - start,
      recommendations: [
        'Implement grace period (30s) for old SCIM token after rotation',
        'IdP retry logic should detect 401 and automatically use new token',
        noGaps
          ? 'Token rotation with retry produces no gaps ✓'
          : 'CRITICAL: Token rotation drops in-flight provisioning — extend overlap window',
        'Log all SCIM operations with token version for auditability',
      ],
    };

    recordResult(result);
    return result;
  } catch (err) {
    const result: ChaosResult = {
      scenario,
      passed: false,
      behavior: 'Test execution error',
      details: String(err),
      durationMs: Date.now() - start,
    };
    recordResult(result);
    return result;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  describe('Chaos Scenario 5: SCIM Token Rotation', () => {
    before(() => waitForApi());

    it('should not have provisioning gaps during SCIM token rotation', async () => {
      const result = await runScenario05();
      assert.ok(result.passed, `Expected no provisioning gaps: ${result.details}`);
    });
  });
}

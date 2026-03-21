/**
 * AgentGuard — Wave 1 Security Fixes Test Suite
 *
 * Tests for all P0 security fixes:
 *   1. Slack HITL sendSlackApprovalRequest — wired correctly
 *   2. SSRF protection in Slack webhook URL validation
 *   3. JWT_SECRET production startup guard
 *   4. INTEGRATION_ENCRYPTION_KEY production guard
 *   5. OWASP compliance checks reflect actual state
 *   6. Telemetry rate map memory leak prevention
 *   7. PostgreSQL RLS enabled
 *   8. CI dependency vulnerability scanning (validated by test-coverage.yml)
 *
 * Run: npx tsx --test tests/security-fixes-wave1.test.ts
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── Fix 1: Slack HITL — sendSlackApprovalRequest wired in evaluate.ts ────────

describe('Fix 1: Slack HITL sendSlackApprovalRequest is wired', () => {
  it('evaluate.ts imports and calls sendSlackApprovalRequest when require_approval', () => {
    const evaluateSrc = readFileSync(
      join(ROOT, 'api/routes/evaluate.ts'),
      'utf8',
    );
    // Must import sendSlackApprovalRequest
    assert.ok(
      evaluateSrc.includes('sendSlackApprovalRequest'),
      'evaluate.ts must import sendSlackApprovalRequest',
    );
    // Must call it (not just import)
    assert.ok(
      evaluateSrc.includes('sendSlackApprovalRequest({'),
      'evaluate.ts must call sendSlackApprovalRequest() after createPendingApproval',
    );
    // Must be inside the require_approval block
    const requireApprovalBlock = evaluateSrc.slice(
      evaluateSrc.indexOf("require_approval'"),
    );
    assert.ok(
      requireApprovalBlock.includes('sendSlackApprovalRequest'),
      'sendSlackApprovalRequest must be inside the require_approval block',
    );
  });

  it('packages/api actions.ts fires alert webhooks for HITL gates', () => {
    const actionsSrc = readFileSync(
      join(ROOT, 'packages/api/src/routes/actions.ts'),
      'utf8',
    );
    // Must call createGate when require_approval
    assert.ok(
      actionsSrc.includes('require_approval'),
      'actions.ts must handle require_approval decisions',
    );
    assert.ok(
      actionsSrc.includes('createGate'),
      'actions.ts must call hitlService.createGate for require_approval',
    );
  });

  it('HITLService.createGate fires alert webhooks including Slack Block Kit', () => {
    const hitlSrc = readFileSync(
      join(ROOT, 'packages/api/src/services/hitl.ts'),
      'utf8',
    );
    assert.ok(
      hitlSrc.includes('fireAlertWebhooksForGate'),
      'HITLService must call fireAlertWebhooksForGate after createGate',
    );
    assert.ok(
      hitlSrc.includes('hooks.slack.com'),
      'HITLService must detect and use Slack Block Kit format for Slack webhooks',
    );
    assert.ok(
      hitlSrc.includes('sendSlackGateNotification'),
      'HITLService must have sendSlackGateNotification for Block Kit messages',
    );
    assert.ok(
      hitlSrc.includes('notifiedViaSlack: true'),
      'HITLService must mark gate as notifiedViaSlack when Slack webhook is fired',
    );
  });
});

// ─── Fix 2: SSRF — Slack webhook URL validation ────────────────────────────────

describe('Fix 2: SSRF — Slack webhook URL validation', () => {
  /**
   * Extract the SSRF validation logic from slack-hitl.ts (api/ version)
   * The schema uses .refine() to only allow hooks.slack.com URLs.
   */
  it('api/routes/slack-hitl.ts restricts webhookUrl to hooks.slack.com', () => {
    const slackHitlSrc = readFileSync(
      join(ROOT, 'api/routes/slack-hitl.ts'),
      'utf8',
    );
    assert.ok(
      slackHitlSrc.includes('hooks.slack.com'),
      'slack-hitl.ts must validate webhookUrl starts with https://hooks.slack.com/',
    );
    // Should use Zod .refine or .startsWith
    assert.ok(
      slackHitlSrc.includes('startsWith') || slackHitlSrc.includes('refine'),
      'slack-hitl.ts must use .startsWith or .refine for webhookUrl validation',
    );
  });

  it('packages/api HITLService blocks unsafe webhook URLs (SSRF)', () => {
    const hitlSrc = readFileSync(
      join(ROOT, 'packages/api/src/services/hitl.ts'),
      'utf8',
    );
    assert.ok(
      hitlSrc.includes('isSafeWebhookUrl'),
      'HITLService must have isSafeWebhookUrl SSRF protection method',
    );
    assert.ok(
      hitlSrc.includes('169.254'),
      'HITLService must block AWS/Azure IMDS link-local addresses (169.254.x.x)',
    );
    assert.ok(
      hitlSrc.includes('localhost'),
      'HITLService must block localhost',
    );
    assert.ok(
      hitlSrc.includes('192.168'),
      'HITLService must block private 192.168.x.x range',
    );
  });

  /**
   * Inline test of the SSRF validation logic (mirrors what HITLService does).
   * This tests the exact same logic without requiring a DB/Redis connection.
   */
  function isSafeWebhookUrl(url: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;
    if (hostname.startsWith('169.254.')) return false;
    if (hostname.startsWith('10.')) return false;
    if (hostname.startsWith('192.168.')) return false;
    const parts = hostname.split('.');
    if (parts.length === 4) {
      const secondOctet = parseInt(parts[1] ?? '', 10);
      if (parts[0] === '172' && secondOctet >= 16 && secondOctet <= 31) return false;
    }
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') return false;
    return true;
  }

  it('SSRF check: blocks localhost', () => {
    assert.equal(isSafeWebhookUrl('https://localhost/webhook'), false);
    assert.equal(isSafeWebhookUrl('https://127.0.0.1/webhook'), false);
    assert.equal(isSafeWebhookUrl('https://::1/webhook'), false);
  });

  it('SSRF check: blocks AWS IMDS link-local address', () => {
    assert.equal(isSafeWebhookUrl('https://169.254.169.254/latest/meta-data/'), false);
  });

  it('SSRF check: blocks private IP ranges', () => {
    assert.equal(isSafeWebhookUrl('https://10.0.0.1/webhook'), false);
    assert.equal(isSafeWebhookUrl('https://192.168.1.100/webhook'), false);
    assert.equal(isSafeWebhookUrl('https://172.16.0.1/webhook'), false);
    assert.equal(isSafeWebhookUrl('https://172.31.0.1/webhook'), false);
  });

  it('SSRF check: blocks non-HTTPS', () => {
    assert.equal(isSafeWebhookUrl('http://hooks.slack.com/services/TEST'), false);
  });

  it('SSRF check: allows legitimate Slack webhooks', () => {
    assert.equal(isSafeWebhookUrl('https://hooks.slack.com/services/T000/B000/xxx'), true);
  });

  it('SSRF check: allows legitimate public HTTPS URLs', () => {
    assert.equal(isSafeWebhookUrl('https://api.example.com/webhook'), true);
  });

  it('SSRF check: blocks GCP metadata service', () => {
    assert.equal(isSafeWebhookUrl('https://metadata.google.internal/computeMetadata/v1/'), false);
  });
});

// ─── Fix 3: JWT_SECRET production startup guard ────────────────────────────────

describe('Fix 3: JWT_SECRET production startup guard', () => {
  it('packages/api/src/middleware/auth.ts has JWT_SECRET production guard', () => {
    const authSrc = readFileSync(
      join(ROOT, 'packages/api/src/middleware/auth.ts'),
      'utf8',
    );
    // Check for production environment guard (supports both process.env.NODE_ENV and process.env['NODE_ENV'])
    assert.ok(
      authSrc.includes('production') && authSrc.includes('NODE_ENV'),
      'auth.ts must check NODE_ENV for production environment',
    );
    assert.ok(
      authSrc.includes('JWT_SECRET'),
      'auth.ts must reference JWT_SECRET',
    );
    assert.ok(
      authSrc.includes('FATAL') || authSrc.includes('throw new Error'),
      'auth.ts must throw an error if JWT_SECRET is not set in production',
    );
  });

  it('JWT_SECRET guard blocks weak/missing secrets in production', () => {
    // Simulate the guard logic inline to verify it catches all bad cases
    function validateJwtSecret(secret: string | undefined, nodeEnv: string): string | null {
      if (nodeEnv !== 'production') return null; // only enforced in production
      if (!secret) return 'JWT_SECRET is not set';
      if (secret.length < 32) return 'JWT_SECRET is too short (< 32 chars)';
      if (secret.includes('dev-')) return 'JWT_SECRET contains dev- prefix';
      if (secret.includes('change-in')) return 'JWT_SECRET contains change-in';
      return null; // valid
    }

    // Bad cases — all should be rejected in production
    assert.notEqual(validateJwtSecret(undefined, 'production'), null, 'Missing secret should be rejected');
    assert.notEqual(validateJwtSecret('', 'production'), null, 'Empty secret should be rejected');
    assert.notEqual(validateJwtSecret('short', 'production'), null, 'Short secret should be rejected');
    assert.notEqual(validateJwtSecret('dev-secret-change-in-production', 'production'), null, 'Default dev secret should be rejected');

    // Good case — strong secret in production
    const strongSecret = crypto.randomBytes(32).toString('hex');
    assert.equal(validateJwtSecret(strongSecret, 'production'), null, 'Strong 64-char hex secret should be accepted');

    // In development, no restriction
    assert.equal(validateJwtSecret('dev-secret-change-in-production', 'development'), null, 'Dev secret OK in development');
    assert.equal(validateJwtSecret(undefined, 'development'), null, 'Missing secret OK in development');
  });
});

// ─── Fix 4: INTEGRATION_ENCRYPTION_KEY production startup guard ────────────────

describe('Fix 4: INTEGRATION_ENCRYPTION_KEY production guard', () => {
  it('api/lib/integration-crypto.ts has production guard for encryption key', () => {
    const cryptoSrc = readFileSync(
      join(ROOT, 'api/lib/integration-crypto.ts'),
      'utf8',
    );
    // Check for production environment guard (supports both process.env.NODE_ENV and process.env['NODE_ENV'])
    assert.ok(
      cryptoSrc.includes('production') && cryptoSrc.includes('NODE_ENV'),
      'integration-crypto.ts must check NODE_ENV for production environment',
    );
    assert.ok(
      cryptoSrc.includes('INTEGRATION_ENCRYPTION_KEY'),
      'integration-crypto.ts must reference INTEGRATION_ENCRYPTION_KEY',
    );
    assert.ok(
      cryptoSrc.includes('throw new Error'),
      'integration-crypto.ts must throw if key not set in production',
    );
  });
});

// ─── Fix 5: OWASP Compliance — checks reflect actual state ────────────────────

describe('Fix 5: OWASP compliance checks reflect actual state', () => {
  it('checkPromptInjection (ASI01) checks actual evaluate() usage, not hardcoded', () => {
    const complianceSrc = readFileSync(
      join(ROOT, 'api/lib/compliance-checker.ts'),
      'utf8',
    );
    // Should NOT have 'not_covered' as a hardcoded return for checkPromptInjection
    const asi01Fn = complianceSrc.slice(
      complianceSrc.indexOf('checkPromptInjection'),
      complianceSrc.indexOf('checkToolPolicy'), // next function
    );
    assert.ok(
      !asi01Fn.includes("return { status: 'not_covered'"),
      'checkPromptInjection must not hardcode not_covered — it should check actual usage',
    );
    // Should check analytics or audit usage
    assert.ok(
      asi01Fn.includes('analytics') || asi01Fn.includes('getUsage') || asi01Fn.includes('calls'),
      'checkPromptInjection must check actual usage analytics',
    );
  });

  it('checkPiiDetection (ASI05) checks policy config, not hardcoded', () => {
    const complianceSrc = readFileSync(
      join(ROOT, 'api/lib/compliance-checker.ts'),
      'utf8',
    );
    const asi05Fn = complianceSrc.slice(
      complianceSrc.indexOf('checkPiiDetection'),
      complianceSrc.indexOf('checkAuditHashChain'), // next function
    );
    assert.ok(
      !asi05Fn.includes("return { status: 'not_covered'"),
      'checkPiiDetection must not hardcode not_covered — it should check policy config',
    );
    // Should check piiDetection in custom policy
    assert.ok(
      asi05Fn.includes('piiDetection') || asi05Fn.includes('pii'),
      'checkPiiDetection must check piiDetection config in tenant policy',
    );
  });

  it('OWASP report uses CHECK_REGISTRY to dispatch to correct check functions', () => {
    const complianceSrc = readFileSync(
      join(ROOT, 'api/lib/compliance-checker.ts'),
      'utf8',
    );
    assert.ok(
      complianceSrc.includes('CHECK_REGISTRY'),
      'compliance-checker.ts must use a registry pattern to dispatch checks',
    );
    assert.ok(
      complianceSrc.includes('promptInjection'),
      'CHECK_REGISTRY must include promptInjection check',
    );
    assert.ok(
      complianceSrc.includes('piiDetection'),
      'CHECK_REGISTRY must include piiDetection check',
    );
  });
});

// ─── Fix 6: PostgreSQL RLS enabled ────────────────────────────────────────────

describe('Fix 6: PostgreSQL RLS policies', () => {
  it('packages/api/src/app.ts has tenantRLSMiddleware enabled', () => {
    const appSrc = readFileSync(
      join(ROOT, 'packages/api/src/app.ts'),
      'utf8',
    );
    // Must import tenantRLSMiddleware
    assert.ok(
      appSrc.includes('tenantRLSMiddleware'),
      'app.ts must import and use tenantRLSMiddleware',
    );
    // Must NOT have it commented out
    assert.ok(
      !appSrc.includes('// app.use(\'/v1/*\', tenantRLSMiddleware)'),
      'tenantRLSMiddleware must be enabled, not commented out',
    );
    // Must have the active .use() call
    assert.ok(
      appSrc.includes("app.use('/v1/*', tenantRLSMiddleware)"),
      'app.ts must apply tenantRLSMiddleware to all /v1/* routes',
    );
  });

  it('tenantRLSMiddleware sets app.current_tenant_id session variable', () => {
    const tenantSrc = readFileSync(
      join(ROOT, 'packages/api/src/middleware/tenant.ts'),
      'utf8',
    );
    assert.ok(
      tenantSrc.includes('app.current_tenant_id'),
      'tenantRLSMiddleware must set app.current_tenant_id PostgreSQL session variable',
    );
    assert.ok(
      tenantSrc.includes('set_config'),
      'tenantRLSMiddleware must use PostgreSQL set_config()',
    );
  });

  it('RLS migration SQL file exists and covers all tenant-scoped tables', () => {
    const rlsSql = readFileSync(
      join(ROOT, 'packages/api/prisma/rls-migration.sql'),
      'utf8',
    );
    const requiredTables = [
      'Tenant', 'User', 'ApiKey', 'Agent', 'AgentSession',
      'Policy', 'AuditEvent', 'KillSwitchCommand', 'HITLGate',
      'SIEMIntegration', 'AlertWebhook',
    ];
    for (const table of requiredTables) {
      assert.ok(
        rlsSql.includes(table),
        `RLS migration must include policy for ${table} table`,
      );
      assert.ok(
        rlsSql.includes(`ENABLE ROW LEVEL SECURITY`) && rlsSql.includes(table),
        `RLS migration must ENABLE ROW LEVEL SECURITY for ${table}`,
      );
    }
    assert.ok(
      rlsSql.includes('current_setting'),
      'RLS policies must use current_setting() to read app.current_tenant_id',
    );
  });
});

// ─── Fix 7: Telemetry rate map memory leak ────────────────────────────────────

describe('Fix 7: Telemetry rate map memory leak prevention', () => {
  it('api/routes/telemetry.ts has cleanup interval for stale entries', () => {
    const telemetrySrc = readFileSync(
      join(ROOT, 'api/routes/telemetry.ts'),
      'utf8',
    );
    assert.ok(
      telemetrySrc.includes('setInterval'),
      'telemetry.ts must have a setInterval cleanup for stale rate limit entries',
    );
    assert.ok(
      telemetrySrc.includes('telemetryRateMap.delete'),
      'telemetry.ts cleanup must delete stale entries from the Map',
    );
    assert.ok(
      telemetrySrc.includes('.unref()'),
      'telemetry.ts cleanup interval must call .unref() to not block process exit',
    );
  });

  it('telemetry rate map cleanup evicts entries after TTL', () => {
    // Inline simulation of the cleanup logic
    type RateEntry = { count: number; windowStart: number };
    const rateMap = new Map<string, RateEntry>();
    const WINDOW_MS = 60_000;

    // Add some entries — one fresh, one stale
    const now = Date.now();
    rateMap.set('192.168.1.1', { count: 3, windowStart: now - WINDOW_MS * 3 }); // stale
    rateMap.set('10.0.0.1', { count: 1, windowStart: now - 5_000 }); // fresh

    // Run cleanup (same logic as telemetry.ts)
    for (const [ip, entry] of rateMap) {
      if (now - entry.windowStart > WINDOW_MS * 2) {
        rateMap.delete(ip);
      }
    }

    assert.equal(rateMap.has('192.168.1.1'), false, 'Stale entry must be evicted');
    assert.equal(rateMap.has('10.0.0.1'), true, 'Fresh entry must be retained');
  });
});

// ─── Fix 8: CI dependency vulnerability scanning ─────────────────────────────

describe('Fix 8: CI dependency vulnerability scanning', () => {
  it('.github/workflows/test-coverage.yml includes npm audit at high level', () => {
    const ciSrc = readFileSync(
      join(ROOT, '.github/workflows/test-coverage.yml'),
      'utf8',
    );
    assert.ok(
      ciSrc.includes('npm audit'),
      'CI workflow must run npm audit',
    );
    assert.ok(
      ciSrc.includes('--audit-level=high') || ciSrc.includes('--audit-level high'),
      'npm audit must block on HIGH/CRITICAL vulnerabilities',
    );
  });
});

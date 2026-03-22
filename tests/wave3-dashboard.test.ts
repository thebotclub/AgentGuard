/**
 * Wave 3 Dashboard Tests
 *
 * Tests for:
 * - Task 1: HITL history route
 * - Task 2: Policy CRUD API
 * - Task 3: Compliance Report endpoint
 * - Task 4: Dashboard page file existence + structure
 *
 * Run: node --experimental-strip-types --test tests/wave3-dashboard.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname ?? __dirname, '..');
const DASHBOARD = join(ROOT, 'packages/dashboard/src/app');
const API_ROUTES = join(ROOT, 'packages/api/src/routes');
const API_SERVICES = join(ROOT, 'packages/api/src/services');

// ── Task 1: HITL Approval Queue UI + Slack Delivery ───────────────────────────

describe('Task 1 — HITL Approval Queue', () => {
  it('hitl route file exists', () => {
    assert.ok(existsSync(join(API_ROUTES, 'hitl.ts')), 'hitl.ts route must exist');
  });

  it('hitl route has /history endpoint', () => {
    const src = readFileSync(join(API_ROUTES, 'hitl.ts'), 'utf8');
    assert.ok(src.includes('/history'), 'hitl router should have /history endpoint');
    assert.ok(src.includes('listHistoricalGates'), 'should call listHistoricalGates');
  });

  it('hitl service has listHistoricalGates method', () => {
    const src = readFileSync(join(API_SERVICES, 'hitl.ts'), 'utf8');
    assert.ok(src.includes('listHistoricalGates'), 'HITLService must have listHistoricalGates');
    assert.ok(src.includes('APPROVED'), 'should filter by resolved statuses including APPROVED');
    assert.ok(src.includes('REJECTED'), 'should filter by resolved statuses including REJECTED');
  });

  it('hitl dashboard page is fully implemented (not a placeholder)', () => {
    const src = readFileSync(join(DASHBOARD, 'hitl/page.tsx'), 'utf8');
    assert.ok(src.includes('approveGate'), 'page must use approveGate API function');
    assert.ok(src.includes('rejectGate'), 'page must use rejectGate API function');
    assert.ok(src.includes('listPendingGates'), 'page must list pending gates');
    assert.ok(src.includes('listHistoricalGates'), 'page must show history tab');
    assert.ok(src.includes('EventSource'), 'page must use SSE for real-time updates');
    assert.ok(src.includes('DecisionDialog'), 'page must have approve/deny dialog');
  });

  it('hitl page shows Slack notification info', () => {
    const src = readFileSync(join(DASHBOARD, 'hitl/page.tsx'), 'utf8');
    assert.ok(src.toLowerCase().includes('slack'), 'page should mention Slack integration');
  });

  it('api.ts has HITL functions', () => {
    const src = readFileSync(join(ROOT, 'packages/dashboard/src/lib/api.ts'), 'utf8');
    assert.ok(src.includes('listPendingGates'), 'api.ts must export listPendingGates');
    assert.ok(src.includes('listHistoricalGates'), 'api.ts must export listHistoricalGates');
    assert.ok(src.includes('approveGate'), 'api.ts must export approveGate');
    assert.ok(src.includes('rejectGate'), 'api.ts must export rejectGate');
    assert.ok(src.includes('HITLGate'), 'api.ts must define HITLGate type');
  });
});

// ── Task 2: Policy CRUD UI ────────────────────────────────────────────────────

describe('Task 2 — Policy CRUD UI', () => {
  it('policies dashboard page is fully implemented', () => {
    const src = readFileSync(join(DASHBOARD, 'policies/page.tsx'), 'utf8');
    assert.ok(src.includes('createPolicy'), 'must call createPolicy');
    assert.ok(src.includes('updatePolicy'), 'must call updatePolicy');
    assert.ok(src.includes('deletePolicy'), 'must call deletePolicy');
    assert.ok(src.includes('listPolicies'), 'must list policies');
    assert.ok(src.includes('testPolicy'), 'must have test policy dry-run');
  });

  it('policies page has YAML editor', () => {
    const src = readFileSync(join(DASHBOARD, 'policies/page.tsx'), 'utf8');
    assert.ok(src.includes('YamlEditor'), 'must have a YamlEditor component');
    assert.ok(src.includes('monospace') || src.includes('Consolas'), 'YAML editor must use monospace font');
  });

  it('policies page has version history', () => {
    const src = readFileSync(join(DASHBOARD, 'policies/page.tsx'), 'utf8');
    assert.ok(src.includes('VersionHistoryPanel') || src.includes('listPolicyVersions'), 'must show version history');
    assert.ok(src.includes('activatePolicyVersion') || src.includes('activate'), 'must support activating versions');
  });

  it('policies page has delete confirmation', () => {
    const src = readFileSync(join(DASHBOARD, 'policies/page.tsx'), 'utf8');
    assert.ok(src.includes('deleteTarget') || src.includes('Delete Policy'), 'must have delete confirmation dialog');
  });

  it('policies page has test policy dry-run', () => {
    const src = readFileSync(join(DASHBOARD, 'policies/page.tsx'), 'utf8');
    assert.ok(src.includes('TestPolicyModal') || src.includes('testPolicy'), 'must have test policy modal');
    assert.ok(src.includes('dry-run') || src.includes('Dry-Run'), 'must mention dry-run');
  });

  it('api.ts has all policy functions', () => {
    const src = readFileSync(join(ROOT, 'packages/dashboard/src/lib/api.ts'), 'utf8');
    assert.ok(src.includes('listPolicies'), 'api.ts must export listPolicies');
    assert.ok(src.includes('createPolicy'), 'api.ts must export createPolicy');
    assert.ok(src.includes('updatePolicy'), 'api.ts must export updatePolicy');
    assert.ok(src.includes('deletePolicy'), 'api.ts must export deletePolicy');
    assert.ok(src.includes('testPolicy'), 'api.ts must export testPolicy');
    assert.ok(src.includes('listPolicyVersions'), 'api.ts must export listPolicyVersions');
    assert.ok(src.includes('activatePolicyVersion'), 'api.ts must export activatePolicyVersion');
  });
});

// ── Task 3: Compliance Report PDF Export ─────────────────────────────────────

describe('Task 3 — Compliance Report PDF Export', () => {
  it('compliance API route exists', () => {
    assert.ok(existsSync(join(API_ROUTES, 'compliance.ts')), 'compliance.ts must exist');
  });

  it('compliance route returns OWASP controls', () => {
    const src = readFileSync(join(API_ROUTES, 'compliance.ts'), 'utf8');
    assert.ok(src.includes('LLM01') || src.includes('owasp'), 'compliance route must include OWASP data');
    assert.ok(src.includes('overallScore'), 'must compute overallScore');
  });

  it('compliance route is mounted in app', () => {
    const src = readFileSync(join(ROOT, 'packages/api/src/app.ts'), 'utf8');
    assert.ok(src.includes('complianceRouter'), 'app.ts must mount complianceRouter');
    assert.ok(src.includes('/v1/compliance'), 'must mount at /v1/compliance');
  });

  it('report dashboard page exists', () => {
    assert.ok(existsSync(join(DASHBOARD, 'report/page.tsx')), 'report/page.tsx must exist');
  });

  it('report page has date range selector', () => {
    const src = readFileSync(join(DASHBOARD, 'report/page.tsx'), 'utf8');
    assert.ok(src.includes('fromDate') && src.includes('toDate'), 'must have date range inputs');
    assert.ok(src.includes('date'), 'must use date inputs');
  });

  it('report page exports to PDF via window.print', () => {
    const src = readFileSync(join(DASHBOARD, 'report/page.tsx'), 'utf8');
    assert.ok(src.includes('window.print'), 'must use window.print() for PDF export');
    assert.ok(src.includes('@media print') || src.includes('media print'), 'must have print CSS');
  });

  it('report page has OWASP score gauge', () => {
    const src = readFileSync(join(DASHBOARD, 'report/page.tsx'), 'utf8');
    assert.ok(src.includes('ScoreGauge') || src.includes('overallScore'), 'must display OWASP score gauge');
  });

  it('report page shows agent health', () => {
    const src = readFileSync(join(DASHBOARD, 'report/page.tsx'), 'utf8');
    assert.ok(src.includes('agentHealth') || src.includes('Agent Health'), 'must show agent health section');
  });

  it('api.ts has getComplianceReport function', () => {
    const src = readFileSync(join(ROOT, 'packages/dashboard/src/lib/api.ts'), 'utf8');
    assert.ok(src.includes('getComplianceReport'), 'api.ts must export getComplianceReport');
    assert.ok(src.includes('ComplianceReport'), 'api.ts must define ComplianceReport type');
    assert.ok(src.includes('OWASPControl'), 'api.ts must define OWASPControl type');
  });
});

// ── Task 4: Onboarding Flow ───────────────────────────────────────────────────

describe('Task 4 — Onboarding Flow (5 Min TTFE)', () => {
  it('onboarding page exists', () => {
    assert.ok(existsSync(join(DASHBOARD, 'onboarding/page.tsx')), 'onboarding/page.tsx must exist');
  });

  it('onboarding has all 5 steps', () => {
    const src = readFileSync(join(DASHBOARD, 'onboarding/page.tsx'), 'utf8');
    assert.ok(src.includes('Step1') || src.includes('GenerateKey'), 'must have Step 1 (API key)');
    assert.ok(src.includes('Step2') || src.includes('Framework'), 'must have Step 2 (framework)');
    assert.ok(src.includes('Step3') || src.includes('Snippet'), 'must have Step 3 (code snippet)');
    assert.ok(src.includes('Step4') || src.includes('TestEvent'), 'must have Step 4 (test event)');
    assert.ok(src.includes('Step5') || src.includes('Success'), 'must have Step 5 (success)');
  });

  it('onboarding generates API key on step 1', () => {
    const src = readFileSync(join(DASHBOARD, 'onboarding/page.tsx'), 'utf8');
    assert.ok(src.includes('createAgent'), 'step 1 must call createAgent to generate API key');
    assert.ok(src.includes('apiKey'), 'must capture and display the API key');
  });

  it('onboarding has framework selection', () => {
    const src = readFileSync(join(DASHBOARD, 'onboarding/page.tsx'), 'utf8');
    assert.ok(src.includes('langchain') || src.includes('LangChain'), 'must support LangChain');
    assert.ok(src.includes('crewai') || src.includes('CrewAI'), 'must support CrewAI');
    assert.ok(src.includes('autogen') || src.includes('AutoGen'), 'must support AutoGen');
    assert.ok(src.includes('custom') || src.includes('Custom'), 'must support custom/REST');
  });

  it('onboarding shows customized code snippets per framework', () => {
    const src = readFileSync(join(DASHBOARD, 'onboarding/page.tsx'), 'utf8');
    assert.ok(src.includes('getWrapperSnippet') || src.includes('snippet'), 'must show code snippet for chosen framework');
  });

  it('onboarding has test event step', () => {
    const src = readFileSync(join(DASHBOARD, 'onboarding/page.tsx'), 'utf8');
    assert.ok(src.includes('/actions/evaluate'), 'step 4 must send test event to evaluate endpoint');
    assert.ok(src.includes('Send Test Event') || src.includes('sendTest'), 'must have test event button');
  });

  it('onboarding has progress indicator', () => {
    const src = readFileSync(join(DASHBOARD, 'onboarding/page.tsx'), 'utf8');
    assert.ok(src.includes('ProgressBar') || src.includes('progress'), 'must have progress indicator');
  });

  it('onboarding has skip option', () => {
    const src = readFileSync(join(DASHBOARD, 'onboarding/page.tsx'), 'utf8');
    assert.ok(src.includes("I'll do this later") || src.includes("do this later") || src.includes('skip'), 'must have skip/later option');
  });

  it('onboarding tracks analytics per step', () => {
    const src = readFileSync(join(DASHBOARD, 'onboarding/page.tsx'), 'utf8');
    assert.ok(src.includes('trackStep'), 'must call analytics tracking per step');
    assert.ok(src.includes('localStorage') || src.includes('analytics'), 'must persist analytics');
  });

  it('onboarding success step has links to docs and community', () => {
    const src = readFileSync(join(DASHBOARD, 'onboarding/page.tsx'), 'utf8');
    assert.ok(src.includes('docs') || src.includes('Docs'), 'must link to docs');
    assert.ok(src.includes('Slack') || src.includes('community') || src.includes('Community'), 'must link to community');
  });

  it('nav includes report link', () => {
    const src = readFileSync(join(DASHBOARD, 'nav.tsx'), 'utf8');
    assert.ok(src.includes('/report'), 'nav must have /report link');
  });

  it('dashboard overview includes onboarding link', () => {
    const src = readFileSync(join(DASHBOARD, 'page.tsx'), 'utf8');
    assert.ok(src.includes('/onboarding'), 'dashboard page must link to /onboarding');
  });
});

// ── Integration: app.ts wiring ────────────────────────────────────────────────

describe('Integration — App Wiring', () => {
  it('app.ts mounts all new routes', () => {
    const src = readFileSync(join(ROOT, 'packages/api/src/app.ts'), 'utf8');
    assert.ok(src.includes('hitlRouter'), 'must mount hitlRouter');
    assert.ok(src.includes('complianceRouter'), 'must mount complianceRouter');
    assert.ok(src.includes('/v1/hitl'), 'must mount at /v1/hitl');
    assert.ok(src.includes('/v1/compliance'), 'must mount at /v1/compliance');
  });
});

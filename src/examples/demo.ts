/**
 * AgentGuard SDK Demo
 *
 * Demonstrates the core capabilities:
 *  - Loading YAML policies
 *  - Evaluating allowed, denied, rate-limited, and spend-capped actions
 *  - HITL approval flow (auto-approved after 1s for demo purposes)
 *  - Kill switch (global + per-agent)
 *  - Tamper-evident audit trail + verification
 *
 * Run: npm run demo
 */
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import chalk from 'chalk';

import { PolicyEngine } from '@/core/policy-engine.js';
import { AuditLogger } from '@/core/audit-logger.js';
import { KillSwitch } from '@/core/kill-switch.js';
import { PolicyError } from '@/core/errors.js';
import { AgentGuardToolWrapper, ApprovalEventBus } from '@/sdk/langchain-wrapper.js';
import type { AgentContext, Action } from '@/core/types.js';

// ─── Paths ────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const POLICY_DIR = join(__dirname, 'policies');
const LOG_DIR = join(__dirname, '../../logs');

mkdirSync(LOG_DIR, { recursive: true });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function banner(title: string): void {
  console.log('\n' + chalk.bgBlue.white.bold(` ◆ ${title} `));
}

function makeAction(agentId: string, tool: string, extra?: Partial<Action>): Action {
  return {
    id: randomUUID(),
    agentId,
    tool,
    parameters: { demo: true },
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

function printVerdict(tool: string, verdict: string, reason: string): void {
  const label =
    verdict === 'allow'
      ? chalk.bgGreen.black(' ALLOW ')
      : verdict === 'deny'
        ? chalk.bgRed.white(' DENY  ')
        : chalk.bgYellow.black(' HITL  ');
  console.log(`  ${label} ${chalk.cyan(tool.padEnd(35))} ${chalk.gray(reason)}`);
}

function printError(tool: string, err: PolicyError): void {
  const label = chalk.bgRed.white(` ${err.code.padEnd(20)} `);
  console.log(`  ${label} ${chalk.cyan(tool.padEnd(28))} ${chalk.red(err.message)}`);
}

// ─── Mock tools (LangChain-compatible) ───────────────────────────────────────

const mockSearch = {
  name: 'search:web',
  description: 'Search the web',
  async invoke(input: Record<string, unknown>) {
    return `Results for: ${JSON.stringify(input)}`;
  },
};

const mockTransfer = {
  name: 'finance:transfer',
  description: 'Transfer funds between accounts',
  async invoke() {
    return 'Transfer initiated';
  },
};

const mockReport = {
  name: 'finance:generate_report',
  description: 'Generate financial report (requires HITL)',
  async invoke() {
    return 'Report generated';
  },
};

const mockQuery = {
  name: 'data:query',
  description: 'Query the data warehouse',
  async invoke() {
    return 'Query result';
  },
};

// ─── SECTION 1: Finance Agent ─────────────────────────────────────────────────

async function demoFinanceAgent(): Promise<void> {
  banner('FINANCE AGENT — Policy Evaluation Demo');

  const engine = new PolicyEngine();
  const policy = engine.loadFromFile(join(POLICY_DIR, 'finance-agent.yaml'));
  console.log(chalk.gray(`  Policy loaded: ${policy.id} v${policy.version}\n`));

  const logger = new AuditLogger({
    filePath: join(LOG_DIR, 'finance-audit.jsonl'),
    redactFields: ['password', 'ssn', 'credit_card', 'token'],
  });

  const killSwitch = new KillSwitch();
  const approvalBus = new ApprovalEventBus();

  const ctx: AgentContext = {
    agentId: 'finance-agent-001',
    sessionId: randomUUID(),
    policyVersion: policy.version,
  };

  // Auto-approve HITL requests after 500ms (demo only)
  approvalBus.on('approval-required', (req) => {
    console.log(
      chalk.yellow(
        `  ⏳ HITL: Approval requested for "${req.action.tool}" — auto-approving in 500ms…`,
      ),
    );
    setTimeout(() => {
      approvalBus.resolve(req.id, 'approved', 'demo-reviewer', 'Auto-approved for demo');
      console.log(chalk.green(`  ✅ HITL: Approved by demo-reviewer`));
    }, 500);
  });

  const guardedSearch = AgentGuardToolWrapper.wrap(mockSearch, {
    ctx,
    policyEngine: engine,
    policyId: policy.id,
    auditLogger: logger,
    killSwitch,
    approvalBus,
  });

  const guardedTransfer = AgentGuardToolWrapper.wrap(mockTransfer, {
    ctx,
    policyEngine: engine,
    policyId: policy.id,
    auditLogger: logger,
    killSwitch,
    approvalBus,
  });

  const guardedReport = AgentGuardToolWrapper.wrap(mockReport, {
    ctx,
    policyEngine: engine,
    policyId: policy.id,
    auditLogger: logger,
    killSwitch,
    approvalBus,
  });

  const guardedQuery = AgentGuardToolWrapper.wrap(mockQuery, {
    ctx,
    policyEngine: engine,
    policyId: policy.id,
    auditLogger: logger,
    killSwitch,
    approvalBus,
    estimatedCostUsd: 1.00,
  });

  // ── 1a. Allowed: web search ───────────────────────────────────────────────
  const searchEval = engine.evaluate(makeAction(ctx.agentId, 'search:web'), ctx, policy.id);
  printVerdict('search:web', searchEval.verdict, searchEval.reason);

  // ── 1b. Denied: fund transfer ─────────────────────────────────────────────
  const transferEval = engine.evaluate(makeAction(ctx.agentId, 'finance:transfer'), ctx, policy.id);
  printVerdict('finance:transfer', transferEval.verdict, transferEval.reason);

  // ── 1c. Denied: data classified as PII ───────────────────────────────────
  const piiEval = engine.evaluate(
    makeAction(ctx.agentId, 'data:query', { dataClassification: 'pii' }),
    ctx,
    policy.id,
  );
  printVerdict('data:query (pii)', piiEval.verdict, piiEval.reason);

  // ── 1d. Spending cap exceeded ─────────────────────────────────────────────
  // Exhaust the budget then try one more call
  console.log(chalk.gray('\n  Simulating spend accumulation ($10 × 6 calls)…'));
  for (let i = 0; i < 6; i++) {
    engine.evaluate(
      makeAction(ctx.agentId, 'data:query', { estimatedCostUsd: 10 }),
      ctx,
      policy.id,
    );
    logger.log({
      action: makeAction(ctx.agentId, 'data:query', { estimatedCostUsd: 10 }),
      ctx,
      evaluation: { verdict: 'allow', reason: 'ok', latencyMs: 1 },
    });
    // Manually charge the session for demo
    (engine as unknown as { spendState: Map<string, number> }).spendState.set(
      ctx.sessionId,
      (i + 1) * 10,
    );
  }
  const spendEval = engine.evaluate(
    makeAction(ctx.agentId, 'data:query', { estimatedCostUsd: 5 }),
    ctx,
    policy.id,
  );
  printVerdict('data:query ($5, cap=$50)', spendEval.verdict, spendEval.reason);

  // ── 1e. HITL: generate report ─────────────────────────────────────────────
  console.log();
  try {
    await guardedReport.invoke({ period: 'Q4-2025' });
    printVerdict('finance:generate_report', 'allow', 'Approved by human reviewer');
  } catch (err) {
    if (err instanceof PolicyError) printError('finance:generate_report', err);
  }

  // ── 1f. Denied: transfer via wrapper ─────────────────────────────────────
  try {
    await guardedTransfer.invoke({ amount: 10000, to: 'acct_987' });
  } catch (err) {
    if (err instanceof PolicyError) printError('finance:transfer', err);
  }

  // ── 1g. Kill switch: halt agent ───────────────────────────────────────────
  console.log(chalk.gray('\n  Activating per-agent kill switch…'));
  killSwitch.haltAgent(ctx.agentId, 'Suspicious outbound transfer pattern detected');
  try {
    await guardedSearch.invoke({ q: 'wire routing numbers' });
  } catch (err) {
    if (err instanceof PolicyError) printError('search:web [HALTED]', err);
  }
  killSwitch.resumeAgent(ctx.agentId);
}

// ─── SECTION 2: DevOps Agent ──────────────────────────────────────────────────

async function demoDevOpsAgent(): Promise<void> {
  banner('DEVOPS AGENT — Rate Limit & Glob Deny Demo');

  const engine = new PolicyEngine();
  const policy = engine.loadFromFile(join(POLICY_DIR, 'devops-agent.yaml'));
  console.log(chalk.gray(`  Policy loaded: ${policy.id} v${policy.version}\n`));

  const logger = new AuditLogger({ filePath: join(LOG_DIR, 'devops-audit.jsonl') });
  const killSwitch = new KillSwitch();

  const ctx: AgentContext = {
    agentId: 'devops-agent-001',
    sessionId: randomUUID(),
    policyVersion: policy.version,
  };

  // ── 2a. Allowed reads ─────────────────────────────────────────────────────
  for (const tool of ['infra:read_status', 'k8s:get', 'monitoring:query']) {
    const ev = engine.evaluate(makeAction(ctx.agentId, tool), ctx, policy.id);
    printVerdict(tool, ev.verdict, ev.reason);
  }

  // ── 2b. Glob deny (*.delete, *.destroy) ───────────────────────────────────
  for (const tool of ['resource.delete', 'cluster.destroy', 'k8s:delete']) {
    const ev = engine.evaluate(makeAction(ctx.agentId, tool), ctx, policy.id);
    printVerdict(tool, ev.verdict, ev.reason);
  }

  // ── 2c. Rate limit: trigger build 11 times (limit = 10/min) ──────────────
  console.log(chalk.gray('\n  Triggering builds until rate limit hits…'));
  for (let i = 0; i <= 10; i++) {
    const ev = engine.evaluate(makeAction(ctx.agentId, 'ci:trigger_build'), ctx, policy.id);
    if (ev.verdict !== 'allow' || i === 10) {
      printVerdict(
        `ci:trigger_build [call ${i + 1}]`,
        ev.verdict,
        i === 10 ? ev.reason : ev.reason,
      );
    }
  }

  // ── 2d. HITL: production deploy ───────────────────────────────────────────
  const deployEval = engine.evaluate(makeAction(ctx.agentId, 'ci:deploy_production'), ctx, policy.id);
  printVerdict('ci:deploy_production', deployEval.verdict, deployEval.reason);

  // ── 2e. Global kill switch ────────────────────────────────────────────────
  console.log(chalk.gray('\n  Activating GLOBAL kill switch (incident response)…'));
  killSwitch.haltAll('Critical infrastructure breach — containing all agents');

  const mockK8s = {
    name: 'k8s:get',
    description: 'Get k8s resource',
    async invoke() {
      return 'ok';
    },
  };
  const guardedK8s = AgentGuardToolWrapper.wrap(mockK8s, {
    ctx,
    policyEngine: engine,
    policyId: policy.id,
    auditLogger: logger,
    killSwitch,
  });
  try {
    await guardedK8s.invoke({ resource: 'pod', name: 'api-server' });
  } catch (err) {
    if (err instanceof PolicyError) printError('k8s:get [GLOBAL HALT]', err);
  }
  killSwitch.resumeAll();
  console.log(chalk.green('  ✅ Global halt cleared'));
}

// ─── SECTION 3: Support Agent ─────────────────────────────────────────────────

async function demoSupportAgent(): Promise<void> {
  banner('SUPPORT AGENT — PII & Spending Cap Demo');

  const engine = new PolicyEngine();
  const policy = engine.loadFromFile(join(POLICY_DIR, 'support-agent.yaml'));
  console.log(chalk.gray(`  Policy loaded: ${policy.id} v${policy.version}\n`));

  const logger = new AuditLogger({ filePath: join(LOG_DIR, 'support-audit.jsonl') });
  const killSwitch = new KillSwitch();
  const ctx: AgentContext = {
    agentId: 'support-agent-001',
    sessionId: randomUUID(),
    policyVersion: policy.version,
  };

  // ── 3a. Allowed ───────────────────────────────────────────────────────────
  for (const tool of ['customer:lookup', 'ticket:read', 'knowledge:search']) {
    const ev = engine.evaluate(makeAction(ctx.agentId, tool), ctx, policy.id);
    printVerdict(tool, ev.verdict, ev.reason);
  }

  // ── 3b. Denied: bulk export (PII exfiltration attempt) ───────────────────
  const exportEval = engine.evaluate(makeAction(ctx.agentId, 'customer:bulk_export'), ctx, policy.id);
  printVerdict('customer:bulk_export', exportEval.verdict, exportEval.reason);

  // ── 3c. Denied: raw SQL query ─────────────────────────────────────────────
  const sqlEval = engine.evaluate(makeAction(ctx.agentId, 'db:raw_query'), ctx, policy.id);
  printVerdict('db:raw_query', sqlEval.verdict, sqlEval.reason);

  // ── 3d. Admin glob deny ───────────────────────────────────────────────────
  const adminEval = engine.evaluate(makeAction(ctx.agentId, 'admin:reset_password'), ctx, policy.id);
  printVerdict('admin:reset_password', adminEval.verdict, adminEval.reason);

  // ── 3e. HITL: refund ─────────────────────────────────────────────────────
  const refundEval = engine.evaluate(
    makeAction(ctx.agentId, 'refund:issue', { estimatedCostUsd: 50 }),
    ctx,
    policy.id,
  );
  printVerdict('refund:issue', refundEval.verdict, refundEval.reason);

  // ── 3f. Per-action spend cap (>$150) ─────────────────────────────────────
  const bigRefundEval = engine.evaluate(
    makeAction(ctx.agentId, 'ticket:create', { estimatedCostUsd: 200 }),
    ctx,
    policy.id,
  );
  printVerdict('ticket:create ($200 > $150 cap)', bigRefundEval.verdict, bigRefundEval.reason);
}

// ─── SECTION 4: Audit Trail ───────────────────────────────────────────────────

async function demoAuditTrail(): Promise<void> {
  banner('AUDIT TRAIL — Hash Chain Verification');

  const logger = new AuditLogger({ filePath: join(LOG_DIR, 'finance-audit.jsonl') });
  const events = logger.readAll();

  console.log(chalk.gray(`\n  Last 5 audit events:\n`));
  for (const ev of events.slice(-5)) {
    const v =
      ev.verdict === 'allow'
        ? chalk.green('ALLOW')
        : ev.verdict === 'deny'
          ? chalk.red('DENY ')
          : chalk.yellow('HITL ');
    console.log(
      `  [${ev.seq.toString().padStart(3)}] ${v}  ${ev.tool.padEnd(30)} ${chalk.gray(ev.hash.slice(0, 16) + '…')}`,
    );
  }

  console.log();
  const result = logger.verify();
  if (result.valid) {
    console.log(
      chalk.green(
        `  ✅ Hash chain verified — ${result.entryCount} entries, no tampering detected`,
      ),
    );
  } else {
    console.log(chalk.red(`  ❌ Chain verification FAILED:`));
    for (const err of result.errors) {
      console.log(chalk.red(`     • ${err}`));
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(chalk.bgWhite.black.bold('\n  🛡  AgentGuard SDK — Prototype Demo  \n'));

  await demoFinanceAgent();
  await demoDevOpsAgent();
  await demoSupportAgent();
  await demoAuditTrail();

  console.log('\n' + chalk.bgGreen.black.bold(' ✓ Demo complete ') + '\n');
}

main().catch((err) => {
  console.error(chalk.red('Demo failed:'), err);
  process.exit(1);
});

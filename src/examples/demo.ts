/**
 * AgentGuard SDK — Prototype Demo
 *
 * Demonstrates the core capabilities:
 *  - Policy YAML DSL loading and compilation (POLICY_ENGINE.md §2)
 *  - Evaluation algorithm (POLICY_ENGINE.md §4):
 *      allow, block, monitor accumulation, require_approval
 *  - Priority and conflict resolution
 *  - Rate limiting
 *  - HITL approval flow (auto-approved after 500ms for demo)
 *  - Kill switch (per-agent + global, soft/hard tiers)
 *  - Tamper-evident audit trail + verification
 *  - Risk score computation
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
import type { AgentContext, ActionRequest, PolicyDecision } from '@/core/types.js';

// ─── Paths ────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const POLICY_DIR = join(__dirname, 'policies');
const LOG_DIR = join(__dirname, '../../logs');

mkdirSync(LOG_DIR, { recursive: true });

// ─── Display Helpers ──────────────────────────────────────────────────────────

function banner(title: string): void {
  console.log('\n' + chalk.bgBlue.white.bold(`  ◆ ${title}  `) + '\n');
}

function subheader(text: string): void {
  console.log(chalk.dim('  ─────────────────────────────────────────────'));
  console.log(chalk.bold.white(`  ${text}`));
  console.log(chalk.dim('  ─────────────────────────────────────────────'));
}

function printDecision(tool: string, decision: PolicyDecision): void {
  const label =
    decision.result === 'allow'
      ? chalk.bgGreen.black.bold(' ALLOW ')
      : decision.result === 'block'
        ? chalk.bgRed.white.bold(' BLOCK ')
        : decision.result === 'monitor'
          ? chalk.bgYellow.black.bold('  MON  ')
          : chalk.bgMagenta.white.bold(' HITL  ');

  const risk =
    decision.riskScore >= 600
      ? chalk.red(`risk:${decision.riskScore}`)
      : decision.riskScore >= 300
        ? chalk.yellow(`risk:${decision.riskScore}`)
        : chalk.green(`risk:${decision.riskScore}`);

  const rule = decision.matchedRuleId
    ? chalk.dim(`[${decision.matchedRuleId}]`)
    : chalk.dim('[default]');

  const monitors =
    decision.monitorRuleIds.length > 0
      ? chalk.dim(` +mon:${decision.monitorRuleIds.length}`)
      : '';

  console.log(
    `  ${label} ${chalk.cyan(tool.padEnd(38))} ${risk.padEnd(14)} ${rule}${monitors}`,
  );
  if (decision.reason) {
    console.log(`       ${chalk.gray(decision.reason)}`);
  }
}

function printError(tool: string, err: PolicyError): void {
  const label = chalk.bgRed.white.bold(` ${err.policyCode.padEnd(22)} `);
  console.log(`  ${label} ${chalk.cyan(tool)}`);
  console.log(`       ${chalk.red(err.message)}`);
}

function printSuccess(msg: string): void {
  console.log(chalk.green(`  ✅  ${msg}`));
}

function printInfo(msg: string): void {
  console.log(chalk.dim(`  ·  ${msg}`));
}

// ─── Mock Tools (LangChain-compatible) ───────────────────────────────────────

function makeTool(name: string, desc: string, result = `${name} executed`) {
  return {
    name,
    description: desc,
    async invoke(input: Record<string, unknown>): Promise<string> {
      return `${result}: ${JSON.stringify(input)}`;
    },
  };
}

function makeRequest(agentId: string, tool: string, params?: Record<string, unknown>): ActionRequest {
  return {
    id: randomUUID(),
    agentId,
    tool,
    params: params ?? {},
    inputDataLabels: [],
    timestamp: new Date().toISOString(),
  };
}

// ─── SECTION 1: Finance Agent ─────────────────────────────────────────────────

async function demoFinanceAgent(): Promise<void> {
  banner('FINANCE AGENT — Policy Evaluation');

  const engine = new PolicyEngine();
  const bundle = engine.loadFromFile(join(POLICY_DIR, 'finance-agent.yaml'));
  printInfo(`Policy loaded: ${bundle.policyId} v${bundle.version} (${bundle.ruleCount} rules)`);
  console.log();

  const logger = new AuditLogger({
    filePath: join(LOG_DIR, 'finance-audit.jsonl'),
    redactFields: ['password', 'ssn', 'credit_card', 'token', 'api_key'],
  });

  const killSwitch = new KillSwitch();
  const approvalBus = new ApprovalEventBus();

  const ctx: AgentContext = {
    agentId: 'finance-agent-001',
    sessionId: randomUUID(),
    policyVersion: bundle.version,
    sessionContext: { riskTier: 'high' },
  };

  // Auto-approve HITL requests after 500ms (demo only)
  approvalBus.on('approval-required', (req) => {
    printInfo(`HITL gate opened: "${req.action.tool}" — auto-approving in 500ms…`);
    setTimeout(() => {
      approvalBus.resolve(req.id, 'approved', 'demo-reviewer', 'Auto-approved for demo');
      printSuccess('HITL approved by demo-reviewer');
    }, 500);
  });

  subheader('Direct policy evaluation');

  // 1a. Allowed: web search
  const searchDecision = engine.evaluate(makeRequest(ctx.agentId, 'search:web'), ctx, bundle.policyId);
  printDecision('search:web', searchDecision);

  // 1b. Allowed: read transactions
  const txDecision = engine.evaluate(makeRequest(ctx.agentId, 'list_transactions'), ctx, bundle.policyId);
  printDecision('list_transactions', txDecision);

  // 1c. Blocked: fund transfer
  const transferDecision = engine.evaluate(makeRequest(ctx.agentId, 'finance:transfer'), ctx, bundle.policyId);
  printDecision('finance:transfer', transferDecision);
  logger.log({ request: makeRequest(ctx.agentId, 'finance:transfer'), ctx, decision: transferDecision });

  // 1d. Blocked: prod credentials access
  const credDecision = engine.evaluate(
    makeRequest(ctx.agentId, 'get_secret', { key: 'prod_stripe_secret_key' }),
    ctx,
    bundle.policyId,
  );
  printDecision('get_secret (prod_stripe_secret_key)', credDecision);

  // 1e. Blocked: database delete
  const dbDecision = engine.evaluate(makeRequest(ctx.agentId, 'db:delete'), ctx, bundle.policyId);
  printDecision('db:delete', dbDecision);

  // 1f. Monitored: data export
  const exportDecision = engine.evaluate(makeRequest(ctx.agentId, 'finance:generate_report'), ctx, bundle.policyId);
  printDecision('finance:generate_report (monitor boost)', exportDecision);

  // 1g. Monitor accumulation with multiple rules
  subheader('Monitor accumulation across multiple matching rules');
  const searchMonDecision = engine.evaluate(makeRequest(ctx.agentId, 'search:web'), ctx, bundle.policyId);
  printDecision('search:web (monitor rules)', searchMonDecision);
  printInfo(`Monitor rules matched: ${searchMonDecision.monitorRuleIds.join(', ') || 'none'}`);

  subheader('HITL approval flow (guarded tool wrapper)');

  const guardedReport = AgentGuardToolWrapper.wrap(
    makeTool('finance:generate_report', 'Generate financial report'),
    { ctx, policyEngine: engine, policyId: bundle.policyId, auditLogger: logger, killSwitch, approvalBus },
  );

  try {
    const result = await guardedReport.invoke({ period: 'Q4-2025', format: 'pdf' });
    printSuccess(`Report generated: ${String(result).slice(0, 60)}`);
  } catch (err) {
    if (err instanceof PolicyError) printError('finance:generate_report', err);
    else console.error(err);
  }

  subheader('Kill switch — per-agent halt');

  const guardedTransfer = AgentGuardToolWrapper.wrap(
    makeTool('finance:transfer', 'Transfer funds'),
    { ctx, policyEngine: engine, policyId: bundle.policyId, auditLogger: logger, killSwitch },
  );

  killSwitch.haltAgent(ctx.agentId, 'Suspicious outbound transfer pattern', 'soft');
  printInfo(`Kill switch activated for ${ctx.agentId} (soft tier)`);

  try {
    await guardedTransfer.invoke({ amount: 10000, to: 'acct_ext_987' });
  } catch (err) {
    if (err instanceof PolicyError) printError('finance:transfer [HALTED]', err);
  }

  killSwitch.resumeAgent(ctx.agentId);
  printSuccess('Agent resumed');
}

// ─── SECTION 2: DevOps Agent ──────────────────────────────────────────────────

async function demoDevOpsAgent(): Promise<void> {
  banner('DEVOPS AGENT — Priority, Glob Deny & Rate Limiting');

  const engine = new PolicyEngine();
  const bundle = engine.loadFromFile(join(POLICY_DIR, 'devops-agent.yaml'));
  printInfo(`Policy loaded: ${bundle.policyId} v${bundle.version} (${bundle.ruleCount} rules)`);
  console.log();

  const logger = new AuditLogger({ filePath: join(LOG_DIR, 'devops-audit.jsonl') });
  const killSwitch = new KillSwitch();

  const ctx: AgentContext = {
    agentId: 'devops-agent-001',
    sessionId: randomUUID(),
    policyVersion: bundle.version,
    sessionContext: { riskTier: 'medium' },
  };

  subheader('Read operations — allowed');

  for (const tool of ['infra:read_status', 'k8s:get', 'monitoring:query', 'list_services', 'get_pod_status']) {
    const d = engine.evaluate(makeRequest(ctx.agentId, tool), ctx, bundle.policyId);
    printDecision(tool, d);
  }

  subheader('Destructive operations — blocked (glob patterns)');

  for (const tool of ['resource.delete', 'cluster.destroy', 'k8s:delete', 'db_drop_table']) {
    const d = engine.evaluate(makeRequest(ctx.agentId, tool), ctx, bundle.policyId);
    printDecision(tool, d);
  }

  subheader('Production change — require_approval (priority 1)');

  const prodDeploy = engine.evaluate(
    makeRequest(ctx.agentId, 'deploy_service', { environment: 'production', service: 'api-gateway' }),
    ctx,
    bundle.policyId,
  );
  printDecision('deploy_service (prod)', prodDeploy);

  subheader('Rate limiting — CI build triggers (max 10/min)');

  let blocked = false;
  for (let i = 1; i <= 12; i++) {
    const d = engine.evaluate(makeRequest(ctx.agentId, 'ci:trigger_build'), ctx, bundle.policyId);
    if (d.result === 'block' && d.reason?.includes('Rate limit') && !blocked) {
      blocked = true;
      printDecision(`ci:trigger_build [call ${i} — RATE LIMITED]`, d);
    } else if (i <= 3 || i === 12) {
      printDecision(`ci:trigger_build [call ${i}]`, d);
    }
  }

  subheader('Global kill switch — incident response');

  killSwitch.haltAll('Critical infrastructure breach — containing all agents', 'hard', 'incident-bot');
  printInfo('Global kill switch activated (hard tier)');

  const guardedK8s = AgentGuardToolWrapper.wrap(
    makeTool('k8s:get', 'Get Kubernetes resource'),
    { ctx, policyEngine: engine, policyId: bundle.policyId, auditLogger: logger, killSwitch },
  );

  try {
    await guardedK8s.invoke({ resource: 'pod', name: 'api-server' });
  } catch (err) {
    if (err instanceof PolicyError) printError('k8s:get [GLOBAL HALT]', err);
  }

  killSwitch.resumeAll('incident-commander');
  printSuccess('Global halt cleared — all agents resumed');
}

// ─── SECTION 3: Support Agent ─────────────────────────────────────────────────

async function demoSupportAgent(): Promise<void> {
  banner('SUPPORT AGENT — Refund Tiers & PII Protection');

  const engine = new PolicyEngine();
  const bundle = engine.loadFromFile(join(POLICY_DIR, 'support-agent.yaml'));
  printInfo(`Policy loaded: ${bundle.policyId} v${bundle.version} (${bundle.ruleCount} rules)`);
  console.log();

  const ctx: AgentContext = {
    agentId: 'support-agent-001',
    sessionId: randomUUID(),
    policyVersion: bundle.version,
    sessionContext: { riskTier: 'medium' },
  };

  subheader('Allowed operations');

  for (const tool of ['customer:lookup', 'ticket:read', 'knowledge:search', 'get_order']) {
    const d = engine.evaluate(makeRequest(ctx.agentId, tool), ctx, bundle.policyId);
    printDecision(tool, d);
  }

  subheader('Refund tier ladder (cs_002, cs_003, cs_004)');

  // Small refund — auto-allowed (≤ $25)
  const small = engine.evaluate(
    makeRequest(ctx.agentId, 'issue_refund', { amount_cents: 2000 }),
    ctx, bundle.policyId,
  );
  printDecision('issue_refund ($20.00 — auto-allow)', small);

  // Mid refund — HITL required ($25–$200)
  const mid = engine.evaluate(
    makeRequest(ctx.agentId, 'issue_refund', { amount_cents: 8000 }),
    ctx, bundle.policyId,
  );
  printDecision('issue_refund ($80.00 — require_approval)', mid);

  // Large refund — blocked (> $200)
  const large = engine.evaluate(
    makeRequest(ctx.agentId, 'issue_refund', { amount_cents: 25000 }),
    ctx, bundle.policyId,
  );
  printDecision('issue_refund ($250.00 — block)', large);

  subheader('Blocked operations');

  const piiQuery = engine.evaluate(
    makeRequest(ctx.agentId, 'db_query', { fields: 'name,ssn,dob' }),
    ctx, bundle.policyId,
  );
  printDecision('db_query (PII fields: ssn, dob)', piiQuery);

  const bulkExport = engine.evaluate(makeRequest(ctx.agentId, 'customer:bulk_export'), ctx, bundle.policyId);
  printDecision('customer:bulk_export', bulkExport);

  const adminOp = engine.evaluate(makeRequest(ctx.agentId, 'admin:reset_password'), ctx, bundle.policyId);
  printDecision('admin:reset_password (glob block)', adminOp);

  const extEmail = engine.evaluate(
    makeRequest(ctx.agentId, 'send_email', { to: 'customer@gmail.com' }),
    ctx, bundle.policyId,
  );
  printDecision('send_email (external domain)', extEmail);
}

// ─── SECTION 4: Audit Trail ───────────────────────────────────────────────────

async function demoAuditTrail(): Promise<void> {
  banner('AUDIT TRAIL — Hash Chain Verification');

  // Write a few events to verify
  const engine = new PolicyEngine();
  const bundle = engine.loadFromFile(join(POLICY_DIR, 'finance-agent.yaml'));
  const logger = new AuditLogger({ filePath: join(LOG_DIR, 'verify-demo.jsonl') });

  const ctx: AgentContext = {
    agentId: 'audit-demo-agent',
    sessionId: randomUUID(),
    policyVersion: bundle.version,
  };

  const tools = ['search:web', 'list_transactions', 'finance:transfer', 'get_balance', 'data:query'];
  for (const tool of tools) {
    const request = makeRequest(ctx.agentId, tool);
    const decision = engine.evaluate(request, ctx, bundle.policyId);
    logger.log({ request, ctx, decision });
  }

  const events = logger.readAll();
  subheader('Recent audit events');
  console.log();
  console.log(
    chalk.dim('  Seq  Decision        Tool                               Risk  Hash (prefix)'),
  );
  console.log(chalk.dim('  ─────────────────────────────────────────────────────────────────────'));

  for (const ev of events.slice(-8)) {
    const verdict =
      ev.decision === 'allow'
        ? chalk.green('ALLOW         ')
        : ev.decision === 'block'
          ? chalk.red('BLOCK         ')
          : ev.decision === 'monitor'
            ? chalk.yellow('MONITOR       ')
            : chalk.magenta('REQUIRE_APPR  ');

    const risk = ev.riskScore.toString().padStart(4);
    const hash = chalk.dim(ev.eventHash.slice(0, 12) + '…');
    const tool = ev.tool.padEnd(35);

    console.log(`  [${ev.seq.toString().padStart(3)}] ${verdict} ${tool}  ${risk}  ${hash}`);
  }

  console.log();
  subheader('Hash chain verification');
  console.log();

  const result = logger.verify();
  if (result.valid) {
    printSuccess(
      `Hash chain verified — ${result.entryCount} entries, no tampering detected`,
    );
  } else {
    console.log(chalk.red(`  ❌ Chain verification FAILED:`));
    for (const err of result.errors) {
      console.log(chalk.red(`     • ${err}`));
    }
  }

  // Show chain linking
  if (events.length >= 2) {
    console.log();
    printInfo('Chain link example (event 0 → event 1):');
    const e0 = events[0]!;
    const e1 = events[1]!;
    console.log(`    evt[0].eventHash   = ${chalk.cyan(e0.eventHash.slice(0, 32))}…`);
    console.log(`    evt[1].previousHash = ${chalk.cyan(e1.previousHash.slice(0, 32))}…`);
    console.log(`    Match: ${e0.eventHash === e1.previousHash ? chalk.green('✓ YES') : chalk.red('✗ NO')}`);
  }
}

// ─── SECTION 5: Risk Scoring ──────────────────────────────────────────────────

async function demoRiskScoring(): Promise<void> {
  banner('RISK SCORING — Decision × Monitor Boost × Context Multiplier');

  const engine = new PolicyEngine();
  const bundle = engine.loadFromFile(join(POLICY_DIR, 'finance-agent.yaml'));

  const scenarios: Array<{
    label: string;
    tool: string;
    riskTier: string;
    params?: Record<string, unknown>;
  }> = [
    { label: 'Low risk agent — allow', tool: 'search:web', riskTier: 'low' },
    { label: 'Medium risk agent — allow', tool: 'search:web', riskTier: 'medium' },
    { label: 'Critical risk agent — allow', tool: 'search:web', riskTier: 'critical' },
    { label: 'Medium risk agent — block', tool: 'finance:transfer', riskTier: 'medium' },
    { label: 'Critical risk agent — block', tool: 'finance:transfer', riskTier: 'critical' },
    { label: 'High risk agent — monitor+export', tool: 'finance:generate_report', riskTier: 'high' },
  ];

  console.log(chalk.dim('  Scenario                                   Decision  Risk  Tier'));
  console.log(chalk.dim('  ─────────────────────────────────────────────────────────────────'));

  for (const s of scenarios) {
    const ctx: AgentContext = {
      agentId: 'risk-demo-agent',
      sessionId: randomUUID(),
      policyVersion: bundle.version,
      sessionContext: { riskTier: s.riskTier },
    };

    const decision = engine.evaluate(
      makeRequest('risk-demo-agent', s.tool, s.params),
      ctx,
      bundle.policyId,
    );

    const tierLabel =
      decision.riskScore >= 600
        ? chalk.red('CRITICAL')
        : decision.riskScore >= 300
          ? chalk.red('HIGH    ')
          : decision.riskScore >= 100
            ? chalk.yellow('MEDIUM  ')
            : chalk.green('LOW     ');

    const result =
      decision.result === 'allow'
        ? chalk.green('allow  ')
        : decision.result === 'block'
          ? chalk.red('block  ')
          : chalk.magenta('hitl   ');

    console.log(
      `  ${s.label.padEnd(43)} ${result} ${decision.riskScore.toString().padStart(4)}  ${tierLabel}`,
    );
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(
    '\n' + chalk.bgWhite.black.bold('  🛡  AgentGuard SDK — Phase 1 Prototype Demo  ') + '\n',
  );
  console.log(chalk.dim('  Policy Engine DSL: POLICY_ENGINE.md v1.0'));
  console.log(chalk.dim('  Architecture:       ARCHITECTURE.md v2.0'));
  console.log(chalk.dim('  Data Model:         DATA_MODEL.md v1.0'));

  await demoFinanceAgent();
  await demoDevOpsAgent();
  await demoSupportAgent();
  await demoRiskScoring();
  await demoAuditTrail();

  console.log('\n' + chalk.bgGreen.black.bold(' ✓ Demo complete — all systems operational ') + '\n');
}

main().catch((err) => {
  console.error(chalk.red('\nDemo failed:'), err);
  process.exit(1);
});

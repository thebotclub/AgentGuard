/**
 * AgentGuard CLI Reporter
 *
 * Formats coverage check results as a table, JSON payload, or short summary.
 */

import chalk from 'chalk';
import type { ToolResult, CoverageCheckResult } from './api.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type OutputFormat = 'table' | 'json' | 'summary';

export interface ReportOptions {
  format: OutputFormat;
  threshold: number;
  failOnUncovered: boolean;
}

export interface ReportData {
  tools: string[];
  apiResult: CoverageCheckResult | null;
  /** Whether the check passed (coverage >= threshold && no uncovered if failOnUncovered) */
  passed: boolean;
  coverage: number;
  riskScore: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DECISION_LABELS: Record<string, string> = {
  allow: 'allow',
  monitor: 'monitor',
  require_approval: 'require_approval',
  block: 'block',
  error: 'error',
};

const DECISION_COLORS: Record<string, (s: string) => string> = {
  allow: chalk.green,
  monitor: chalk.cyan,
  require_approval: chalk.yellow,
  block: chalk.red,
  error: chalk.gray,
};

const RISK_COLORS = (score: number): ((s: string) => string) => {
  if (score >= 800) return chalk.red;
  if (score >= 500) return chalk.yellow;
  return chalk.green;
};

function riskLabel(score: number): string {
  if (score >= 800) return 'critical';
  if (score >= 600) return 'high';
  if (score >= 300) return 'medium';
  return 'low';
}

function pad(s: string, len: number): string {
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}

function computeRiskScore(results: ToolResult[]): number {
  if (results.length === 0) return 0;
  const total = results.reduce((sum, r) => sum + (r.riskScore ?? 0), 0);
  return Math.round(total / results.length);
}

// ── Local-only scan report (no API key) ───────────────────────────────────────

function renderLocalTable(tools: string[]): void {
  console.log('');
  console.log(chalk.bold.cyan('AgentGuard — Local Scan Results'));
  console.log(chalk.dim('═'.repeat(50)));
  console.log(chalk.dim('  (No API key — showing detected tools only)'));
  console.log('');

  if (tools.length === 0) {
    console.log(chalk.yellow('  No tool patterns detected.'));
  } else {
    console.log(chalk.bold(`  ${'Tool'.padEnd(30)}  Notes`));
    console.log(chalk.dim(`  ${'─'.repeat(29)}  ${'─'.repeat(20)}`));
    for (const tool of tools) {
      console.log(`  ${chalk.cyan(pad(tool, 30))}  ${chalk.dim('(unvalidated)')}`);
    }
  }

  console.log('');
  console.log(chalk.dim(`  ${tools.length} tool(s) detected. Provide --api-key to check coverage.`));
  console.log('');
}

function renderLocalJson(tools: string[]): void {
  const out = {
    mode: 'local-only',
    tools,
    note: 'No API key provided. Pass --api-key to check policy coverage.',
  };
  console.log(JSON.stringify(out, null, 2));
}

function renderLocalSummary(tools: string[]): void {
  if (tools.length === 0) {
    console.log('No tool patterns detected.');
  } else {
    console.log(`Detected ${tools.length} tool(s): ${tools.join(', ')}`);
    console.log('Pass --api-key to validate against AgentGuard policies.');
  }
}

// ── Full coverage report ──────────────────────────────────────────────────────

function renderTable(data: ReportData): void {
  const { tools, apiResult, passed, coverage, riskScore } = data;

  // Build per-tool rows
  const resultMap = new Map<string, ToolResult>();
  if (apiResult) {
    for (const r of apiResult.results) resultMap.set(r.tool, r);
  }

  const uncovered = apiResult?.uncovered ?? [];

  const rows = tools.map((tool) => {
    const r = resultMap.get(tool);
    if (r) {
      return {
        tool,
        policy: DECISION_LABELS[r.decision] ?? r.decision,
        risk: riskLabel(r.riskScore),
        riskScore: r.riskScore,
        status: '✅ covered',
        covered: true,
        decision: r.decision,
      };
    }
    return {
      tool,
      policy: '—',
      risk: 'unknown',
      riskScore: 0,
      status: '❌ uncovered',
      covered: false,
      decision: 'error' as const,
    };
  });

  // Column widths
  const toolW = Math.max(20, ...rows.map((r) => r.tool.length)) + 2;
  const policyW = Math.max(10, ...rows.map((r) => r.policy.length)) + 2;
  const riskW = 10;
  const statusW = 14;

  const line = chalk.dim('─'.repeat(toolW + policyW + riskW + statusW + 6));
  const header = chalk.bold(
    `  ${pad('Tool', toolW)}${pad('Policy', policyW)}${pad('Risk', riskW)}  Status`,
  );

  console.log('');
  console.log(chalk.bold.cyan('AgentGuard Policy Coverage Report'));
  console.log(chalk.dim('═'.repeat(toolW + policyW + riskW + statusW + 6)));
  console.log('');
  console.log(header);
  console.log(`  ${line}`);

  for (const row of rows) {
    const toolStr = pad(row.tool, toolW);
    const policyColor = DECISION_COLORS[row.decision] ?? chalk.white;
    const policyStr = pad(policyColor(row.policy), policyW + 10); // +10 for ANSI codes
    const riskStr = RISK_COLORS(row.riskScore)(pad(row.risk, riskW));
    const statusStr = row.covered ? chalk.green(row.status) : chalk.red(row.status);

    console.log(`  ${toolStr}${policyStr}  ${riskStr}  ${statusStr}`);
  }

  console.log('');
  const covStr = `Coverage: ${chalk.bold(coverage + '%')} (${rows.filter((r) => r.covered).length}/${rows.length} tools)`;
  const scoreStr = `Risk Score: ${RISK_COLORS(riskScore)(chalk.bold(String(riskScore)) + '/1000')}`;
  console.log(`  ${covStr}`);
  console.log(`  ${scoreStr}`);
  console.log('');

  if (passed) {
    console.log(chalk.green.bold('  ✅ PASS — All tools covered by policy.'));
  } else {
    const reasons: string[] = [];
    if (uncovered.length > 0) {
      reasons.push(`${uncovered.length} uncovered tool(s): ${uncovered.join(', ')}`);
    }
    if (coverage < data.coverage) {
      reasons.push(`Coverage ${coverage}% below threshold`);
    }
    console.log(chalk.red.bold(`  ❌ FAIL — ${reasons.join('. ')}. Add policies before deploying.`));
  }

  console.log('');
}

function renderJson(data: ReportData): void {
  const { tools, apiResult, passed, coverage, riskScore } = data;

  const resultMap = new Map<string, ToolResult>();
  if (apiResult) {
    for (const r of apiResult.results) resultMap.set(r.tool, r);
  }

  const out = {
    coverage,
    total: tools.length,
    covered: tools.filter((t) => resultMap.has(t)).length,
    uncovered: apiResult?.uncovered ?? [],
    riskScore,
    passed,
    tools: tools.map((tool) => {
      const r = resultMap.get(tool);
      return r ? { ...r } : { tool, decision: 'uncovered', ruleId: null, riskScore: 0, reason: null };
    }),
  };

  console.log(JSON.stringify(out, null, 2));
}

function renderSummary(data: ReportData): void {
  const { coverage, riskScore, apiResult, passed } = data;
  const uncovered = apiResult?.uncovered ?? [];

  if (passed) {
    console.log(`✅ PASS  Coverage: ${coverage}%  Risk: ${riskScore}/1000`);
  } else {
    console.log(`❌ FAIL  Coverage: ${coverage}%  Risk: ${riskScore}/1000  Uncovered: ${uncovered.join(', ') || 'none'}`);
  }
}

// ── Main render function ──────────────────────────────────────────────────────

/**
 * Render the scan results to stdout in the requested format.
 */
export function render(
  tools: string[],
  apiResult: CoverageCheckResult | null,
  options: ReportOptions,
): ReportData {
  const coverage = apiResult ? Math.round(apiResult.coverage) : 0;
  const riskScore = apiResult ? computeRiskScore(apiResult.results) : 0;
  const uncovered = apiResult?.uncovered ?? [];

  const passed = apiResult !== null
    ? coverage >= options.threshold && (!options.failOnUncovered || uncovered.length === 0)
    : false;

  const data: ReportData = { tools, apiResult, passed, coverage, riskScore };

  if (apiResult === null) {
    // Local-only scan — no API validation
    switch (options.format) {
      case 'json':    renderLocalJson(tools); break;
      case 'summary': renderLocalSummary(tools); break;
      default:        renderLocalTable(tools);
    }
    return data;
  }

  switch (options.format) {
    case 'json':    renderJson(data); break;
    case 'summary': renderSummary(data); break;
    default:        renderTable(data);
  }

  return data;
}

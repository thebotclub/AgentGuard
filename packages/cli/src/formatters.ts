/**
 * AgentGuard CLI — Output Formatters
 *
 * Three output modes:
 *   terminal  — colourised table with chalk (default)
 *   json      — machine-readable JSON to stdout
 *   markdown  — GitHub Actions $GITHUB_STEP_SUMMARY format
 *
 * The `render` function is the single entry point; it picks the right
 * formatter based on the `format` option.
 */

import chalk from 'chalk';
import type { ToolHit } from './scanner.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type OutputFormat = 'terminal' | 'json' | 'markdown' | 'table' | 'summary';

/** Per-tool policy status (returned by API or inferred offline) */
export type ToolStatus = 'covered' | 'uncovered' | 'no_hitl';

export interface ToolPolicy {
  /** Normalised tool name */
  name: string;
  /** Policy coverage status */
  status: ToolStatus;
  /** Policy name/id if covered */
  policyName?: string;
}

/** Aggregated scan + policy result */
export interface ScanReport {
  /** AgentGuard version string */
  version: string;
  /** Directory that was scanned */
  scannedDir: string;
  /** Number of source files scanned */
  filesScanned: number;
  /** All tools with policy status */
  tools: ToolPolicy[];
  /** Coverage score 0-100 */
  score: number;
  /** Number of protected tools */
  protected: number;
  /** Number of unprotected tools */
  unprotected: number;
  /** Mode: offline | api */
  mode: 'offline' | 'api';
}

export interface RenderOptions {
  format: OutputFormat;
  /** Whether we're running in a CI environment (no spinner, no colour) */
  ci?: boolean;
}

// ── Icon helpers ──────────────────────────────────────────────────────────────

function icon(status: ToolStatus): string {
  switch (status) {
    case 'covered':   return '✅';
    case 'no_hitl':   return '⚠️ ';
    case 'uncovered': return '❌';
  }
}

function statusLabel(status: ToolStatus, policyName?: string): string {
  switch (status) {
    case 'covered':
      return policyName
        ? `covered by policy: ${policyName}`
        : 'covered by policy';
    case 'no_hitl':
      return policyName
        ? `policy exists (${policyName}) but no HITL configured`
        : 'policy exists but no HITL configured';
    case 'uncovered':
      return 'NOT in any policy (unprotected)';
  }
}

// ── Terminal formatter ────────────────────────────────────────────────────────

function renderTerminal(report: ScanReport): void {
  const { version, scannedDir, tools, score, protected: prot, unprotected, filesScanned } = report;

  console.log('');
  console.log(chalk.bold.cyan(`AgentGuard v${version}`) + chalk.dim(` — Scanning ${scannedDir}...`));
  console.log('');

  if (tools.length === 0) {
    console.log(chalk.yellow('  No tool patterns detected in source files.'));
    console.log(chalk.dim(`  (${filesScanned} file(s) scanned)`));
    console.log('');
    console.log(chalk.dim('  Make sure your agent code uses recognisable tool name patterns.'));
    console.log('');
    return;
  }

  const agentCount = 1; // offline mode doesn't know about agent count
  const summary = tools.length === 1
    ? `Found ${agentCount} agent using ${tools.length} tool:`
    : `Found ${agentCount} agent using ${tools.length} tools:`;
  console.log(chalk.bold(`  ${summary}`));
  console.log('');

  for (const tool of tools) {
    const ic = icon(tool.status);
    const nameStr = tool.status === 'uncovered'
      ? chalk.red(tool.name)
      : tool.status === 'no_hitl'
        ? chalk.yellow(tool.name)
        : chalk.green(tool.name);
    const label = chalk.dim(statusLabel(tool.status, tool.policyName));
    console.log(`  ${ic} ${nameStr} — ${label}`);
  }

  console.log('');

  if (report.mode === 'offline') {
    // Offline: all tools are unprotected (no policy server)
    const unprotCount = tools.filter((t) => t.status === 'uncovered').length;
    const protCount   = tools.filter((t) => t.status !== 'uncovered').length;
    console.log(chalk.dim(`  Score: offline mode — ${tools.length} tool(s) detected`));
    console.log(chalk.dim(`  Run with --api-key to validate against server policies.`));
    if (unprotCount > 0) {
      console.log('');
      console.log(chalk.yellow(`  Run ${chalk.bold('agentguard init')} to add policies for unprotected tools.`));
    }
  } else {
    // API mode: show coverage score
    const scoreColor = score >= 80 ? chalk.green : score >= 50 ? chalk.yellow : chalk.red;
    const scoreLine = `Score: ${scoreColor.bold(score + '%')} coverage (${prot}/${tools.length} tools protected)`;
    console.log(`  ${scoreLine}`);
    console.log('');

    if (unprotected > 0) {
      console.log(chalk.yellow(`  Run ${chalk.bold('agentguard init')} to add policies for unprotected tools.`));
    } else {
      console.log(chalk.green.bold('  ✅ All tools are covered by policy.'));
    }
  }

  console.log('');
}

// ── JSON formatter ────────────────────────────────────────────────────────────

function renderJson(report: ScanReport): void {
  // `tools` is kept as a string array for backward compatibility.
  // Full policy details are in `toolDetails`.
  const out = {
    version: report.version,
    mode: report.mode,
    scannedDir: report.scannedDir,
    filesScanned: report.filesScanned,
    score: report.score,
    protected: report.protected,
    unprotected: report.unprotected,
    tools: report.tools.map((t) => t.name),
    toolDetails: report.tools,
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

// ── Markdown formatter ────────────────────────────────────────────────────────

function renderMarkdown(report: ScanReport): void {
  const { version, scannedDir, tools, score, protected: prot, unprotected, filesScanned, mode } = report;

  const lines: string[] = [];

  lines.push(`## 🛡️ AgentGuard v${version} — Policy Coverage Report`);
  lines.push('');
  lines.push(`**Scanned:** \`${scannedDir}\` (${filesScanned} file(s))`);
  lines.push('');

  if (tools.length === 0) {
    lines.push('> ⚠️ No tool patterns detected in source files.');
    process.stdout.write(lines.join('\n') + '\n');
    return;
  }

  if (mode === 'offline') {
    lines.push('> ℹ️ **Offline mode** — tools detected but not validated against server policies.');
    lines.push('');
  } else {
    // Score badge
    const badge = score >= 80 ? '🟢' : score >= 50 ? '🟡' : '🔴';
    lines.push(`**Coverage Score:** ${badge} **${score}%** (${prot}/${tools.length} tools protected)`);
    lines.push('');
  }

  // Tool table
  lines.push('| Status | Tool | Notes |');
  lines.push('|--------|------|-------|');

  for (const tool of tools) {
    const statusIcon = icon(tool.status).trim();
    const noteText = statusLabel(tool.status, tool.policyName);
    lines.push(`| ${statusIcon} | \`${tool.name}\` | ${noteText} |`);
  }

  lines.push('');

  if (mode === 'offline') {
    lines.push(`> Run \`agentguard validate --api-key=<key>\` to validate against server policies.`);
  } else if (unprotected > 0) {
    lines.push(`> ⚠️ **${unprotected} unprotected tool(s).** Run \`agentguard init\` to add policies.`);
  } else {
    lines.push('> ✅ All tools are covered by policy.');
  }

  process.stdout.write(lines.join('\n') + '\n');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a ScanReport from raw hits and optional per-tool policy status.
 */
export function buildReport(params: {
  version: string;
  scannedDir: string;
  filesScanned: number;
  hits: ToolHit[];
  policies?: Map<string, { status: ToolStatus; policyName?: string }>;
  mode: 'offline' | 'api';
}): ScanReport {
  const { version, scannedDir, filesScanned, hits, policies, mode } = params;

  const tools: ToolPolicy[] = hits.map(({ name }) => {
    const policy = policies?.get(name);
    return {
      name,
      status: policy?.status ?? 'uncovered',
      policyName: policy?.policyName,
    };
  });

  const protectedCount = tools.filter((t) => t.status !== 'uncovered').length;
  const unprotectedCount = tools.filter((t) => t.status === 'uncovered').length;
  const score = tools.length === 0
    ? 100
    : Math.round((protectedCount / tools.length) * 100);

  return {
    version,
    scannedDir,
    filesScanned,
    tools,
    score,
    protected: protectedCount,
    unprotected: unprotectedCount,
    mode,
  };
}

/**
 * Render a ScanReport to stdout in the requested format.
 */
export function renderReport(report: ScanReport, options: RenderOptions): void {
  // Normalise legacy format names
  const fmt: OutputFormat = (() => {
    if (options.format === 'table') return 'terminal';
    if (options.format === 'summary') return 'markdown';
    return options.format;
  })();

  switch (fmt) {
    case 'json':     renderJson(report);     break;
    case 'markdown': renderMarkdown(report); break;
    default:         renderTerminal(report); break;
  }
}

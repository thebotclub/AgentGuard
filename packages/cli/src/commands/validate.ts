/**
 * AgentGuard CLI — `validate` command
 *
 * Scans a directory for AI agent tool usage and optionally validates coverage
 * against server-side policies.
 *
 * Two modes:
 *   offline (default) — local regex scan only, no network calls
 *   api               — sends detected tool names to the AgentGuard API for
 *                       policy coverage validation (no file content is sent)
 *
 * Output formats:
 *   terminal (default) — colourised table with spinner
 *   json               — machine-readable JSON
 *   markdown           — GitHub Actions $GITHUB_STEP_SUMMARY
 */

import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import ora from 'ora';

import { scanDirectory } from '../scanner.js';
import { buildReport, renderReport } from '../formatters.js';
import { AgentGuardApiClient } from '../api.js';
import { loadConfig } from '../config.js';
import type { OutputFormat, ToolStatus } from '../formatters.js';

const VERSION = '0.9.0';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ValidateOptions {
  apiKey?: string;
  apiUrl?: string;
  format?: string;
  offline?: boolean;
  exclude?: string[];
  verbose?: boolean;
  output?: string;
  threshold?: string;
  failOnUncovered?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveFormat(raw: string | undefined): OutputFormat {
  const normalized = (raw ?? 'terminal').toLowerCase();
  const map: Record<string, OutputFormat> = {
    terminal: 'terminal',
    text:     'terminal',
    table:    'terminal',
    json:     'json',
    markdown: 'markdown',
    md:       'markdown',
    summary:  'markdown',
  };
  return map[normalized] ?? 'terminal';
}

function isCiEnv(): boolean {
  return Boolean(
    process.env['CI'] ||
    process.env['GITHUB_ACTIONS'] ||
    process.env['GITLAB_CI'] ||
    process.env['CIRCLECI'] ||
    process.env['JENKINS_URL'],
  );
}

// ── Main command handler ──────────────────────────────────────────────────────

export async function runValidate(
  directory: string | undefined,
  opts: ValidateOptions,
): Promise<void> {
  const cwd = process.cwd();
  const config = loadConfig(cwd);
  const ci = isCiEnv();

  // ── Resolve options (flags > env > config > defaults) ────────────────────

  const apiKey =
    opts.apiKey ??
    process.env['AGENTGUARD_API_KEY'] ??
    config.api_key ??
    '';

  const apiUrl =
    (opts.apiUrl && opts.apiUrl !== '') ? opts.apiUrl :
    process.env['AGENTGUARD_API_URL'] ??
    config.api_url ??
    'https://api.agentguard.tech';

  const format = resolveFormat(opts.format);

  // offline = explicit flag OR no api key
  const offlineMode = opts.offline === true || !apiKey;

  const excludeDirs = [
    ...(config.exclude ?? []),
    ...(opts.exclude ?? []),
  ];

  // ── Resolve & validate target directory ──────────────────────────────────

  const targetDir = path.resolve(cwd, directory ?? '.');

  // Path traversal protection: resolved target must start with cwd
  const resolvedCwd = path.resolve(cwd);
  if (!targetDir.startsWith(resolvedCwd + path.sep) && targetDir !== resolvedCwd) {
    // Allow scanning absolute paths that are NOT inside cwd only when user
    // explicitly passes an absolute path outside cwd — security: warn but allow
    // (the real guard is that we never send file content to the server).
    if (format !== 'json') {
      process.stderr.write(
        chalk.yellow(`Warning: scanning outside current directory: ${targetDir}\n`),
      );
    }
  }

  if (!fs.existsSync(targetDir)) {
    process.stderr.write(chalk.red(`Error: Directory not found: ${targetDir}\n`));
    process.exit(1);
  }

  // ── Spinner setup ─────────────────────────────────────────────────────────

  const useSpinner = format === 'terminal' && !ci;
  const spinner = useSpinner
    ? ora({ text: chalk.dim(`Scanning ${targetDir}...`), color: 'cyan' }).start()
    : null;

  // ── Scan ─────────────────────────────────────────────────────────────────

  let scanResult;
  try {
    scanResult = scanDirectory(targetDir, { excludeDirs });
  } catch (err) {
    spinner?.fail(chalk.red('Scan failed'));
    process.stderr.write(chalk.red(`Error: ${(err as Error).message}\n`));
    process.exit(2);
  }

  if (spinner) {
    spinner.succeed(
      chalk.dim(`Scanned ${scanResult.filesScanned} file(s) — found ${scanResult.hits.length} tool(s)`),
    );
  }

  if (opts.verbose && format === 'terminal' && scanResult.filesWithHits.length > 0) {
    console.log(chalk.dim('  Files with tool hits:'));
    for (const f of scanResult.filesWithHits) {
      console.log(chalk.dim(`    ${f}`));
    }
  }

  // ── Policy check (API mode) ───────────────────────────────────────────────

  let policies: Map<string, { status: ToolStatus; policyName?: string }> | undefined;
  let mode: 'offline' | 'api' = 'offline';

  if (!offlineMode && scanResult.tools.length > 0) {
    const apiSpinner = useSpinner
      ? ora({ text: chalk.dim(`Checking coverage via AgentGuard API...`), color: 'cyan' }).start()
      : null;

    try {
      const client = new AgentGuardApiClient(apiKey, apiUrl);
      const coverageResult = await client.coverageCheck(scanResult.tools);

      apiSpinner?.succeed(chalk.dim('Policy coverage checked'));
      mode = 'api';

      // Build policy map
      policies = new Map();
      for (const r of coverageResult.results) {
        let status: ToolStatus;
        if (r.decision === 'block' || r.decision === 'error') {
          status = 'uncovered';
        } else if (r.decision === 'monitor') {
          status = 'no_hitl';
        } else {
          status = 'covered';
        }
        policies.set(r.tool, {
          status,
          policyName: r.ruleId ?? undefined,
        });
      }
    } catch (err) {
      apiSpinner?.fail(chalk.red('API check failed'));
      if (format !== 'json') {
        process.stderr.write(
          chalk.yellow(`Warning: API error (${(err as Error).message}). Falling back to offline mode.\n`),
        );
      }
      mode = 'offline';
    }
  }

  // ── Build & render report ─────────────────────────────────────────────────

  const scannedDir = path.relative(cwd, targetDir) || '.';
  const report = buildReport({
    version: VERSION,
    scannedDir,
    filesScanned: scanResult.filesScanned,
    hits: scanResult.hits,
    policies,
    mode,
  });

  // Route output
  if (opts.output) {
    const outputPath = path.resolve(cwd, opts.output);
    // Capture stdout temporarily
    const origWrite = process.stdout.write.bind(process.stdout) as typeof process.stdout.write;
    const chunks: string[] = [];
    (process.stdout.write as unknown) = (chunk: string | Uint8Array, _enc?: unknown, _cb?: unknown): boolean => {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString('utf8'));
      return true;
    };
    renderReport(report, { format, ci });
    process.stdout.write = origWrite;
    fs.writeFileSync(outputPath, chunks.join(''), 'utf8');
    if (format !== 'json') {
      console.log(chalk.dim(`Output written to: ${outputPath}`));
    }
  } else {
    renderReport(report, { format, ci });
  }

  // ── Exit code ─────────────────────────────────────────────────────────────

  // In offline mode, no pass/fail — just informational
  if (mode === 'offline') {
    process.exit(0);
  }

  // API mode: check threshold and uncovered tools
  const thresholdRaw = opts.threshold;
  const threshold = thresholdRaw !== undefined
    ? Math.max(0, Math.min(100, parseInt(thresholdRaw, 10)))
    : (config.threshold ?? 100);

  const failOnUncoveredFlag = opts.failOnUncovered;
  const failOnUncovered =
    failOnUncoveredFlag !== undefined
      ? failOnUncoveredFlag
      : (config.fail_on_uncovered ?? true);

  const passed =
    report.score >= threshold &&
    (!failOnUncovered || report.unprotected === 0);

  if (!passed) {
    process.exit(1);
  }
}

#!/usr/bin/env node
/**
 * AgentGuard CLI — entry point
 *
 * Commands:
 *   agentguard validate [directory]   Scan for tool usage and check policy coverage
 *   agentguard status                 Check API connectivity and tenant info
 *   agentguard init                   Create a .agentguard.yml config file
 */

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';

import { scanDirectory } from './scanner.js';
import { AgentGuardApiClient } from './api.js';
import { render } from './reporter.js';
import { loadConfig, DEFAULT_CONFIG_CONTENT } from './config.js';
import type { OutputFormat } from './reporter.js';

const VERSION = '0.1.0';

// ── Program ───────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('agentguard')
  .description('AgentGuard CLI — scan AI agent code and validate policy coverage')
  .version(VERSION);

// ── validate ──────────────────────────────────────────────────────────────────

program
  .command('validate [directory]')
  .description('Scan a directory for agent tool usage and check policy coverage')
  .option('-k, --api-key <key>', 'AgentGuard API key (or set AGENTGUARD_API_KEY env var)')
  .option('-u, --api-url <url>', 'AgentGuard API URL', '')
  .option('-t, --threshold <number>', 'Minimum coverage % required to pass', '')
  .option('-f, --format <format>', 'Output format: table | json | summary', '')
  .option('--fail-on-uncovered', 'Fail if any tool has no matching policy rule')
  .option('--no-fail-on-uncovered', 'Do not fail on uncovered tools (default from config)')
  .option('-e, --exclude <dirs...>', 'Additional directories to exclude from scanning')
  .option('--verbose', 'Show files scanned and hit details')
  .action(async (directory: string | undefined, opts: {
    apiKey?: string;
    apiUrl?: string;
    threshold?: string;
    format?: string;
    failOnUncovered?: boolean;
    exclude?: string[];
    verbose?: boolean;
  }) => {
    try {
      // ── Load config file ────────────────────────────────────────────────────
      const cwd = process.cwd();
      const config = loadConfig(cwd);

      // ── Resolve options (flags > env > config > defaults) ──────────────────
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

      const thresholdRaw = opts.threshold !== '' ? opts.threshold : undefined;
      const threshold = thresholdRaw !== undefined
        ? Math.max(0, Math.min(100, parseInt(thresholdRaw, 10)))
        : (config.threshold ?? 100);

      // Commander sets failOnUncovered to true when --fail-on-uncovered is
      // passed and false when --no-fail-on-uncovered is passed. When neither
      // is passed, the value is `undefined` (actually Commander uses default
      // from .option — for boolean flags without explicit default Commander
      // returns the actual boolean). We fall back to config.
      const failOnUncoveredFlag: boolean | undefined = opts.failOnUncovered;
      const failOnUncovered: boolean =
        failOnUncoveredFlag !== undefined
          ? failOnUncoveredFlag
          : (config.fail_on_uncovered ?? true);

      const format: OutputFormat = (['table', 'json', 'summary'].includes(opts.format ?? '')
        ? opts.format as OutputFormat
        : 'table');

      const targetDir = path.resolve(cwd, directory ?? '.');

      if (!fs.existsSync(targetDir)) {
        console.error(chalk.red(`Error: Directory not found: ${targetDir}`));
        process.exit(1);
      }

      const excludeDirs = [
        ...(config.exclude ?? []),
        ...(opts.exclude ?? []),
      ];

      // ── Scan ──────────────────────────────────────────────────────────────
      if (format !== 'json') {
        console.log(chalk.dim(`Scanning: ${targetDir} ...`));
      }

      const scanResult = scanDirectory(targetDir, { excludeDirs });

      if (opts.verbose && format !== 'json') {
        console.log(chalk.dim(`  Files scanned: ${scanResult.filesScanned}`));
        if (scanResult.filesWithHits.length > 0) {
          console.log(chalk.dim(`  Files with tool hits:`));
          for (const f of scanResult.filesWithHits) {
            console.log(chalk.dim(`    ${path.relative(cwd, f)}`));
          }
        }
      }

      if (scanResult.tools.length === 0 && format !== 'json') {
        console.log(chalk.yellow('\nNo tool patterns detected in source files.'));
        console.log(chalk.dim('Make sure your agent code uses recognisable tool name patterns.\n'));
        process.exit(0);
      }

      // ── API call (optional) ────────────────────────────────────────────────
      let apiResult = null;

      if (apiKey) {
        if (format !== 'json') {
          console.log(chalk.dim(`Checking coverage via AgentGuard API (${apiUrl}) ...`));
        }
        try {
          const client = new AgentGuardApiClient(apiKey, apiUrl);
          apiResult = await client.coverageCheck(scanResult.tools);
        } catch (err) {
          console.error(chalk.red(`\nAPI error: ${(err as Error).message}`));
          if (format !== 'json') {
            console.error(chalk.dim('Falling back to local-only scan output.\n'));
          }
        }
      } else if (format !== 'json') {
        console.log(chalk.dim('No API key — showing detected tools only (pass --api-key for coverage check).'));
      }

      // ── Render ─────────────────────────────────────────────────────────────
      const reportData = render(scanResult.tools, apiResult, { format, threshold, failOnUncovered });

      // ── Exit code ──────────────────────────────────────────────────────────
      if (apiResult !== null && !reportData.passed) {
        process.exit(1);
      }
    } catch (err) {
      console.error(chalk.red(`\nFatal error: ${(err as Error).message}`));
      process.exit(2);
    }
  });

// ── status ────────────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Check API connectivity and tenant info')
  .option('-k, --api-key <key>', 'AgentGuard API key (or set AGENTGUARD_API_KEY env var)')
  .option('-u, --api-url <url>', 'AgentGuard API URL')
  .action(async (opts: { apiKey?: string; apiUrl?: string }) => {
    try {
      const config = loadConfig(process.cwd());

      const apiKey =
        opts.apiKey ??
        process.env['AGENTGUARD_API_KEY'] ??
        config.api_key ??
        '';

      const apiUrl =
        opts.apiUrl ??
        process.env['AGENTGUARD_API_URL'] ??
        config.api_url ??
        'https://api.agentguard.tech';

      console.log('');
      console.log(chalk.bold.cyan('AgentGuard Status'));
      console.log(chalk.dim('═'.repeat(40)));

      const client = new AgentGuardApiClient(apiKey || 'no-key', apiUrl);

      // Ping
      process.stdout.write('  Pinging API ...   ');
      try {
        const ping = await client.ping();
        console.log(ping.ok
          ? chalk.green(`✅ reachable (${ping.latencyMs}ms)`)
          : chalk.red('❌ unhealthy'));
      } catch (err) {
        console.log(chalk.red(`❌ unreachable — ${(err as Error).message}`));
        process.exit(1);
      }

      console.log(`  API URL:          ${chalk.cyan(apiUrl)}`);
      console.log(`  API Key:          ${apiKey ? chalk.green('set (' + apiKey.substring(0, 8) + '...)') : chalk.yellow('not set')}`);

      if (apiKey) {
        process.stdout.write('  Tenant info ...   ');
        try {
          const status = await client.getTenantStatus();
          console.log(chalk.green('✅ authenticated'));
          if (status && typeof status === 'object') {
            for (const [k, v] of Object.entries(status)) {
              if (k !== 'raw') {
                console.log(`  ${k.padEnd(18)}${chalk.dim(JSON.stringify(v))}`);
              }
            }
          }
        } catch (err) {
          console.log(chalk.red(`❌ ${(err as Error).message}`));
        }
      }

      console.log('');
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ── init ──────────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Create a .agentguard.yml config file in the current directory')
  .option('--force', 'Overwrite existing .agentguard.yml')
  .action((opts: { force?: boolean }) => {
    const targetPath = path.join(process.cwd(), '.agentguard.yml');

    if (fs.existsSync(targetPath) && !opts.force) {
      console.log(chalk.yellow(`.agentguard.yml already exists. Use --force to overwrite.`));
      process.exit(0);
    }

    fs.writeFileSync(targetPath, DEFAULT_CONFIG_CONTENT, 'utf8');
    console.log(chalk.green(`✅ Created ${targetPath}`));
    console.log(chalk.dim('\nNext steps:'));
    console.log(chalk.dim('  1. Set your API key: export AGENTGUARD_API_KEY=ag_live_xxx'));
    console.log(chalk.dim('  2. Run: agentguard validate .'));
    console.log('');
  });

// ── Parse ─────────────────────────────────────────────────────────────────────

program.parse(process.argv);

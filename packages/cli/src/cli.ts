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

import { runValidate } from './commands/validate.js';
import { AgentGuardApiClient } from './api.js';
import { loadConfig, DEFAULT_CONFIG_CONTENT } from './config.js';
import type { ValidateOptions } from './commands/validate.js';

const VERSION = '0.9.0';

// ── ASCII Banner ──────────────────────────────────────────────────────────────

const BANNER = `
   █████╗ ███████╗████████╗██████╗  ██████╗ ██╗    ██╗██╗  ██╗██╗════╝
  ██╔══██╗██╔════╝╚══██╔══╝██╔══██╗██╔═══██╗██║    ██║██║ ██╔╝██║
  ███████║███████╗   ██║   ██████╔╝██║   ██║██║ █╗ ██║█████╔╝ █████╗
  ██╔══██║╚════██║   ██║   ██╔══██╗██║   ██║██║███╗██║██╔═██╗ ██╔══╝
  ██║  ██║███████║   ██║   ██║  ██║╚██████╔╝╚███╔███╔╝██║  ██╗███████╗
  ╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝  ╚══╝╚══╝ ╚═╝  ╚═╝╚══════╝
`;

const TAGLINE = '  Security for AI Agents  •  https://agentguard.tech';

function printBanner(): void {
  console.log(chalk.bold.cyan(BANNER));
  console.log(chalk.dim(TAGLINE));
  console.log();
}

function printCompactBanner(): void {
  console.log(chalk.bold.cyan('  AgentGuard CLI') + chalk.dim(' v' + VERSION + '  —  Security for AI Agents'));
  console.log();
}

// ── Program ───────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('agentguard')
  .description('AgentGuard CLI — scan AI agent code and validate policy coverage')
  .version(VERSION)
  .configureOutput({
    writeOut: (str) => {
      if (str.includes('--help') || str.includes('-h')) {
        printCompactBanner();
      }
      process.stdout.write(str);
    },
  });

// ── validate ──────────────────────────────────────────────────────────────────

program
  .command('validate [directory]')
  .description('Scan a directory for agent tool usage and check policy coverage')
  .option('-k, --api-key <key>', 'AgentGuard API key (or set AGENTGUARD_API_KEY env var)')
  .option('-u, --api-url <url>', 'AgentGuard API URL', '')
  .option('--offline', 'Run in offline mode (no API calls)', false)
  .option('-t, --threshold <number>', 'Minimum coverage % required to pass', '')
  .option('-f, --format <format>', 'Output format: terminal | json | markdown', 'terminal')
  .option('-o, --output <file>', 'Write output to a file instead of stdout')
  .option('--fail-on-uncovered', 'Fail if any tool has no matching policy rule')
  .option('--no-fail-on-uncovered', 'Do not fail on uncovered tools')
  .option('-e, --exclude <dirs...>', 'Additional directories to exclude from scanning')
  .option('--verbose', 'Show files scanned and hit details')
  .action(async (directory: string | undefined, opts: ValidateOptions) => {
    try {
      printBanner();
      await runValidate(directory, opts);
    } catch (err) {
      process.stderr.write(chalk.red(`Fatal error: ${(err as Error).message}\n`));
      process.exit(2);
    }
  });

// ── status ───────────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Check API connectivity and tenant info')
  .option('-k, --api-key <key>', 'AgentGuard API key (or set AGENTGUARD_API_KEY env var)')
  .option('-u, --api-url <url>', 'AgentGuard API URL')
  .action(async (opts: { apiKey?: string; apiUrl?: string }) => {
    try {
      printBanner();

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

      console.log(chalk.bold('  Status Check'));
      console.log(chalk.dim('  ' + '─'.repeat(50)));
      console.log();

      const client = new AgentGuardApiClient(apiKey || 'no-key', apiUrl);

      // Ping
      process.stdout.write('  Pinging API ...   ');
      try {
        const ping = await client.ping();
        console.log(ping.ok
          ? chalk.green(`\u2705 reachable (${ping.latencyMs}ms)`)
          : chalk.red('\u274c unhealthy'));
      } catch (err) {
        console.log(chalk.red(`\u274c unreachable \u2014 ${(err as Error).message}`));
        process.exit(1);
      }

      console.log(`  API URL:          ${chalk.cyan(apiUrl)}`);
      console.log(`  API Key:          ${apiKey ? chalk.green('set (' + apiKey.substring(0, 8) + '...)') : chalk.yellow('not set')}`);

      if (apiKey) {
        process.stdout.write('  Tenant info ...   ');
        try {
          const status = await client.getTenantStatus();
          console.log(chalk.green('\u2705 authenticated'));
          if (status && typeof status === 'object') {
            for (const [k, v] of Object.entries(status)) {
              if (k !== 'raw') {
                console.log(`  ${k.padEnd(18)}${chalk.dim(JSON.stringify(v))}`);
              }
            }
          }
        } catch (err) {
          console.log(chalk.red(`\u274c ${(err as Error).message}`));
        }
      }

      console.log();
    } catch (err) {
      process.stderr.write(chalk.red(`Error: ${(err as Error).message}\n`));
      process.exit(1);
    }
  });

// ── init ──────────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Create a .agentguard.yml config file in the current directory')
  .option('--force', 'Overwrite existing .agentguard.yml')
  .action((opts: { force?: boolean }) => {
    printBanner();
    const targetPath = path.join(process.cwd(), '.agentguard.yml');

    if (fs.existsSync(targetPath) && !opts.force) {
      console.log(chalk.yellow(`\u26a0 .agentguard.yml already exists. Use --force to overwrite.`));
      process.exit(0);
    }

    fs.writeFileSync(targetPath, DEFAULT_CONFIG_CONTENT, 'utf8');
    console.log(chalk.green(`\u2705 Created ${targetPath}`));
    console.log(chalk.dim('\n  Next steps:'));
    console.log(chalk.dim('  1. Set your API key: export AGENTGUARD_API_KEY=ag_live_xxx'));
    console.log(chalk.dim('  2. Run: agentguard validate .'));
    console.log();
  });

// ── Parse ─────────────────────────────────────────────────────────────────────

program.parse(process.argv);

/**
 * AgentGuard Chaos Test Runner
 *
 * Runs all 6 chaos scenarios sequentially and generates a results report.
 *
 * Usage:
 *   npx tsx tests/chaos/run-all.ts
 *   API_URL=http://localhost:3001 npx tsx tests/chaos/run-all.ts
 *
 * Each scenario follows: setup → inject fault → verify → cleanup
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';
import { runScenario01 } from './scenario-01-redis-down.js';
import { runScenario02 } from './scenario-02-pg-exhaustion.js';
import { runScenario03 } from './scenario-03-policy-latency.js';
import { runScenario04 } from './scenario-04-concurrent-killswitch.js';
import { runScenario05 } from './scenario-05-scim-token-rotation.js';
import { runScenario06 } from './scenario-06-sse-reconnect.js';
import { waitForApi, printSummary, results } from './helpers.js';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          AgentGuard Chaos Testing Framework               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`  API: ${process.env['API_URL'] ?? 'http://localhost:3001'}`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log('');

  // Wait for API to be ready
  console.log('Waiting for API...');
  try {
    await waitForApi(30, 1000);
    console.log('API ready ✓\n');
  } catch {
    console.error('API not reachable. Ensure the server is running.');
    console.error('  docker compose up -d');
    console.error('  npx tsx tests/chaos/run-all.ts');
    process.exit(1);
  }

  const scenarios = [
    { name: 'Redis Down Mid-Stream', fn: runScenario01 },
    { name: 'PostgreSQL Pool Exhaustion', fn: runScenario02 },
    { name: 'High-Latency Policy Evaluation', fn: runScenario03 },
    { name: 'Concurrent Kill-Switch Activation', fn: runScenario04 },
    { name: 'SCIM Token Rotation During Sync', fn: runScenario05 },
    { name: 'SSE Reconnect After Server Restart', fn: runScenario06 },
  ];

  for (const { name, fn } of scenarios) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Scenario: ${name}`);
    console.log('─'.repeat(60));
    try {
      await fn();
    } catch (err) {
      console.error(`  [ERROR] Scenario threw: ${err}`);
    }
    await sleep(2000); // Cool-down between scenarios
  }

  printSummary();

  // Write JSON results
  const reportPath = `./reports/chaos-results-${Date.now()}.json`;
  try {
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          runAt: new Date().toISOString(),
          apiUrl: process.env['API_URL'] ?? 'http://localhost:3001',
          results,
          summary: {
            total: results.length,
            passed: results.filter((r) => r.passed).length,
            failed: results.filter((r) => !r.passed).length,
            passRate: `${Math.round((results.filter((r) => r.passed).length / results.length) * 100)}%`,
          },
        },
        null,
        2,
      ),
    );
    console.log(`📄 Results written to: ${reportPath}`);
  } catch {
    console.log('(Could not write report file — reports/ directory may not exist)');
  }

  const failed = results.filter((r) => !r.passed).length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

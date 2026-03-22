/**
 * Chaos Testing Helpers — shared utilities for fault injection scenarios.
 *
 * Each chaos test follows the pattern:
 *   setup → inject fault → verify behavior → cleanup
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

export const BASE_URL = process.env['API_URL'] ?? 'http://localhost:3001';

export const TEST_TENANT = {
  email: `chaos-test-${Date.now()}@agentguard-chaos.local`,
  password: 'ChaosTest123!',
  organizationName: 'Chaos Test Org',
};

export interface RequestResult {
  status: number;
  body: Record<string, unknown>;
  ok: boolean;
  latencyMs: number;
}

/** HTTP helper with latency measurement */
export async function request(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<RequestResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });

    let responseBody: Record<string, unknown> = {};
    try {
      responseBody = (await res.json()) as Record<string, unknown>;
    } catch {
      // Non-JSON
    }

    return {
      status: res.status,
      body: responseBody,
      ok: res.ok,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      status: 0,
      body: { error: String(err) },
      ok: false,
      latencyMs: Date.now() - start,
    };
  }
}

/** Wait for the API to be ready */
export async function waitForApi(retries = 30, delayMs = 500): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await sleep(delayMs);
  }
  throw new Error(`API did not become ready after ${retries * delayMs}ms`);
}

/** Register a test tenant and return api key */
export async function registerTestTenant(): Promise<{ apiKey: string; tenantId: string }> {
  const email = `chaos-${Date.now()}@agentguard-chaos.local`;
  const reg = await request('POST', '/v1/auth/register', {
    email,
    password: 'ChaosTest123!',
    organizationName: `Chaos-${Date.now()}`,
  });

  if (!reg.ok) {
    throw new Error(`Registration failed: ${JSON.stringify(reg.body)}`);
  }

  const apiKey = (reg.body as Record<string, Record<string, string>>)?.data?.apiKey ?? '';
  const tenantId = (reg.body as Record<string, Record<string, string>>)?.data?.tenantId ?? '';
  return { apiKey, tenantId };
}

/** Seed an agent for testing */
export async function createTestAgent(
  apiKey: string,
  name = 'chaos-agent',
): Promise<string> {
  const res = await request(
    'POST',
    '/v1/agents',
    { name, description: 'Chaos test agent', model: 'gpt-4o' },
    { Authorization: `Bearer ${apiKey}` },
  );
  if (!res.ok) throw new Error(`Agent creation failed: ${JSON.stringify(res.body)}`);
  return (res.body as Record<string, Record<string, string>>)?.data?.id ?? '';
}

/** Docker compose helper — brings a service up or down */
export function dockerCompose(action: 'stop' | 'start' | 'restart', service: string): ChildProcess {
  return spawn('docker', ['compose', action, service], {
    cwd: process.env['PROJECT_DIR'] ?? '/app',
    stdio: 'pipe',
  });
}

export async function dockerComposeWait(
  action: 'stop' | 'start' | 'restart',
  service: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = dockerCompose(action, service);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`docker compose ${action} ${service} exited with code ${code}`));
    });
  });
}

/** ChaosResult — record for each scenario */
export interface ChaosResult {
  scenario: string;
  passed: boolean;
  behavior: string;
  details: string;
  durationMs: number;
  recommendations?: string[];
}

export const results: ChaosResult[] = [];

export function recordResult(result: ChaosResult): void {
  results.push(result);
  const icon = result.passed ? '✅' : '❌';
  console.log(`${icon} [${result.scenario}] ${result.behavior} (${result.durationMs}ms)`);
  if (!result.passed) {
    console.log(`   Details: ${result.details}`);
  }
}

export function printSummary(): void {
  console.log('\n' + '═'.repeat(60));
  console.log('CHAOS TEST SUMMARY');
  console.log('═'.repeat(60));
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`  Passed: ${passed}/${total}`);
  console.log('');
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon} ${r.scenario}`);
    console.log(`     Behavior: ${r.behavior}`);
    if (r.recommendations?.length) {
      for (const rec of r.recommendations) {
        console.log(`     💡 ${rec}`);
      }
    }
  }
  console.log('═'.repeat(60) + '\n');
}

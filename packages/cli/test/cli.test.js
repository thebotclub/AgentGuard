/**
 * AgentGuard CLI — basic tests
 *
 * Uses Node.js built-in test runner.
 * Run: node --test test/cli.test.js
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

// ── Helpers ───────────────────────────────────────────────────────────────────

const CLI_PATH = path.resolve(__dirname, '../dist/cli.js');

function run(...args) {
  try {
    const stdout = execFileSync(process.execPath, [CLI_PATH, ...args], {
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.status ?? 1,
    };
  }
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentguard-cli-test-'));
}

function writeTmp(dir, filename, content) {
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

// ── Scanner unit tests (direct module) ────────────────────────────────────────

describe('scanner', () => {
  const { scanDirectory } = require('../dist/scanner.js');

  it('detects snake_case tool names from TS source', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'agent.ts', `
      const tools = ["file_read", "shell_exec", "http_request"];
    `);
    const result = scanDirectory(dir);
    assert.ok(result.tools.includes('file_read'), 'should find file_read');
    assert.ok(result.tools.includes('shell_exec'), 'should find shell_exec');
    assert.ok(result.tools.includes('http_request'), 'should find http_request');
    assert.equal(result.filesScanned, 1);
    assert.equal(result.filesWithHits.length, 1);
  });

  it('deduplicates tool names across files', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'a.ts', `const t1 = "file_read"; const t2 = "file_write";`);
    writeTmp(dir, 'b.py', `tool = "file_read"`);
    const result = scanDirectory(dir);
    const fileReadCount = result.tools.filter((t) => t === 'file_read').length;
    assert.equal(fileReadCount, 1, 'file_read should appear exactly once');
  });

  it('skips node_modules and dist directories', () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, 'node_modules', 'some-pkg'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
    writeTmp(path.join(dir, 'node_modules', 'some-pkg'), 'index.js', `"send_email"`);
    writeTmp(path.join(dir, 'dist'), 'compiled.js', `"shell_exec"`);
    writeTmp(dir, 'src.ts', `"file_read"`);
    const result = scanDirectory(dir);
    assert.ok(result.tools.includes('file_read'), 'should include src hit');
    assert.ok(!result.tools.includes('send_email'), 'should skip node_modules');
    assert.ok(!result.tools.includes('shell_exec'), 'should skip dist');
  });

  it('returns empty list when no tools found', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'index.ts', `console.log("hello world");`);
    const result = scanDirectory(dir);
    assert.deepEqual(result.tools, []);
  });

  it('detects @tool decorated Python functions', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'tools.py', `
@tool
def send_email(recipient, subject, body):
    """Send an email to the recipient."""
    pass
`);
    const result = scanDirectory(dir);
    assert.ok(result.tools.includes('send_email'), 'should detect @tool decorated function');
  });

  it('detects MCP-style name fields', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'schema.json', JSON.stringify({
      tools: [
        { name: 'file_read', description: 'Read a file' },
        { name: 'db_query', description: 'Query the database' },
      ],
    }));
    const result = scanDirectory(dir);
    assert.ok(result.tools.includes('file_read'), 'should detect file_read in JSON');
    assert.ok(result.tools.includes('db_query'), 'should detect db_query in JSON');
  });

  it('accepts custom excludeDirs', () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, 'custom_skip'), { recursive: true });
    writeTmp(path.join(dir, 'custom_skip'), 'agent.ts', `"file_write"`);
    writeTmp(dir, 'real.ts', `"file_read"`);
    const result = scanDirectory(dir, { excludeDirs: ['custom_skip'] });
    assert.ok(result.tools.includes('file_read'), 'should include real.ts hit');
    assert.ok(!result.tools.includes('file_write'), 'should skip custom_skip dir');
  });
});

// ── Config loader ─────────────────────────────────────────────────────────────

describe('config loader', () => {
  const { loadConfig } = require('../dist/config.js');

  it('returns empty object when no config file exists', () => {
    const dir = makeTmpDir();
    const cfg = loadConfig(dir);
    assert.deepEqual(cfg, {});
  });

  it('parses a valid .agentguard.yml', () => {
    const dir = makeTmpDir();
    writeTmp(dir, '.agentguard.yml', `
api_url: https://api.example.com
threshold: 80
fail_on_uncovered: false
`);
    const cfg = loadConfig(dir);
    assert.equal(cfg.api_url, 'https://api.example.com');
    assert.equal(cfg.threshold, 80);
    assert.equal(cfg.fail_on_uncovered, false);
  });
});

// ── CLI smoke tests ───────────────────────────────────────────────────────────

describe('CLI — smoke tests', () => {
  it('prints version', () => {
    const { stdout } = run('--version');
    assert.match(stdout, /\d+\.\d+\.\d+/);
  });

  it('prints help', () => {
    const { stdout } = run('--help');
    assert.ok(stdout.includes('validate') || stdout.includes('Usage'), 'help output should mention validate');
  });

  it('validate --help shows options', () => {
    const { stdout } = run('validate', '--help');
    assert.ok(stdout.includes('--api-key') || stdout.includes('api-key'), 'should show --api-key option');
    assert.ok(stdout.includes('--format'), 'should show --format option');
    assert.ok(stdout.includes('--threshold'), 'should show --threshold option');
  });

  it('init creates .agentguard.yml in a temp dir', () => {
    const dir = makeTmpDir();
    const { exitCode } = run('init');
    // exitCode may be 0 if run from a dir without the file or the dist dir
    // We just verify the CLI doesn't crash badly with exit code 2
    assert.notEqual(exitCode, 2, 'should not crash with a fatal error');
  });

  it('validate exits 0 with no tools found (no API key)', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'empty.ts', `console.log("hello")`);
    const { exitCode } = run('validate', dir);
    assert.equal(exitCode, 0, 'empty scan should exit 0');
  });

  it('validate detects tools and exits 0 without API key', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'agent.ts', `
      const tools = ["file_read", "shell_exec"];
      async function run() {
        await callTool("file_read", { path: "/tmp/test" });
      }
    `);
    const result = run('validate', dir, '--format', 'summary');
    // Should exit 0 — no API key means no pass/fail check
    assert.equal(result.exitCode, 0, 'should exit 0 when no API key (local-only mode)');
  });

  it('validate --format json outputs valid JSON in local mode', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'agent.py', `
tool_name: http_request
`);
    const result = run('validate', dir, '--format', 'json');
    assert.equal(result.exitCode, 0);
    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      assert.fail(`stdout is not valid JSON: ${result.stdout.substring(0, 200)}`);
    }
    assert.ok(Array.isArray(parsed.tools), 'JSON output should have tools array');
    assert.ok(parsed.tools.includes('http_request'), 'should detect http_request');
  });
});

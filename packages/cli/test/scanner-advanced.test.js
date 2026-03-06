/**
 * AgentGuard CLI — Advanced Scanner & Pattern Tests
 *
 * Tests for:
 *   - LangChain pattern detection
 *   - OpenAI function-calling pattern detection
 *   - CrewAI pattern detection
 *   - MCP / generic schema pattern detection
 *   - Raw snake_case / kebab-case tool literal detection
 *   - Path traversal protection (safeResolve)
 *   - ToolHit attribution (framework field)
 *   - Formatter output (terminal, json, markdown)
 *
 * Run: node --test test/scanner-advanced.test.js
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
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentguard-adv-test-'));
}

function writeTmp(dir, filename, content) {
  const fullDir = path.dirname(path.join(dir, filename));
  fs.mkdirSync(fullDir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

// ── Load modules from dist ────────────────────────────────────────────────────

const { scanDirectory, safeResolve } = require('../dist/scanner.js');

// ── LangChain pattern tests ───────────────────────────────────────────────────

describe('scanner — LangChain patterns', () => {
  it('detects @tool Python decorator (bare)', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'tools.py', `
from langchain.tools import tool

@tool
def send_email(recipient: str, body: str) -> str:
    """Send an email."""
    return "sent"
`);
    const result = scanDirectory(dir);
    assert.ok(result.tools.includes('send_email'), 'should detect @tool decorated send_email');
  });

  it('detects @tool Python decorator (async)', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'tools.py', `
@tool
async def read_file(path: str) -> str:
    """Read a file."""
    with open(path) as f:
        return f.read()
`);
    const result = scanDirectory(dir);
    assert.ok(result.tools.includes('read_file'), 'should detect @tool async function');
  });

  it('detects DynamicTool({ name: "..." }) in TypeScript', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'agent.ts', `
import { DynamicTool } from "langchain/tools";

const fileReadTool = new DynamicTool({
  name: "file_read",
  description: "Read a file from the filesystem",
  func: async (input) => fs.readFileSync(input, 'utf8'),
});
`);
    const result = scanDirectory(dir);
    assert.ok(result.tools.includes('file_read'), 'should detect DynamicTool name');
  });

  it('detects StructuredTool({ name: "..." }) in TypeScript', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'agent.ts', `
const searchTool = new StructuredTool({
  name: "web_search",
  description: "Search the web",
  schema: z.object({ query: z.string() }),
  func: async ({ query }) => search(query),
});
`);
    const result = scanDirectory(dir);
    assert.ok(result.tools.includes('web_search'), 'should detect StructuredTool name');
  });

  it('detects Python LangChain Tool(name="...")', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'agent.py', `
from langchain.tools import Tool

search_tool = Tool(
    name="search_web",
    description="Search the web",
    func=search_engine.run
)
`);
    const result = scanDirectory(dir);
    assert.ok(result.tools.includes('search_web'), 'should detect Python Tool(name=...)');
  });
});

// ── OpenAI function-calling tests ─────────────────────────────────────────────

describe('scanner — OpenAI patterns', () => {
  it('detects OpenAI functions array in TypeScript', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'openai.ts', `
const functions = [
  {
    name: "get_weather",
    description: "Get current weather for a location",
    parameters: { type: "object", properties: { location: { type: "string" } } }
  },
  {
    name: "send_email",
    description: "Send an email",
    parameters: { type: "object", properties: { to: { type: "string" } } }
  }
];
`);
    const result = scanDirectory(dir);
    assert.ok(result.tools.includes('get_weather'), 'should detect get_weather from functions array');
    assert.ok(result.tools.includes('send_email'), 'should detect send_email from functions array');
  });

  it('detects OpenAI tools array (new format) in JSON', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'tools.json', JSON.stringify({
      tools: [
        { type: "function", function: { name: "execute_sql", description: "Run SQL", parameters: {} } },
        { type: "function", function: { name: "http_request", description: "HTTP call", parameters: {} } }
      ]
    }, null, 2));
    const result = scanDirectory(dir);
    assert.ok(result.tools.includes('execute_sql'), 'should detect execute_sql from tools JSON');
    assert.ok(result.tools.includes('http_request'), 'should detect http_request from tools JSON');
  });

  it('detects Python openai tools dict', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'agent.py', `
tools = [
    {
        "type": "function",
        "function": {
            "name": "shell_exec",
            "description": "Execute a shell command",
            "parameters": {}
        }
    }
]
response = openai.chat.completions.create(
    model="gpt-4",
    tools=tools
)
`);
    const result = scanDirectory(dir);
    assert.ok(result.tools.includes('shell_exec'), 'should detect shell_exec from Python OpenAI tools');
  });
});

// ── CrewAI pattern tests ──────────────────────────────────────────────────────

describe('scanner — CrewAI patterns', () => {
  it('detects BaseTool subclass with name attribute', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'tools.py', `
from crewai.tools import BaseTool

class DatabaseQueryTool(BaseTool):
    name = "db_query"
    description = "Query the database"
    
    def _run(self, query: str) -> str:
        return db.execute(query)
`);
    const result = scanDirectory(dir);
    assert.ok(result.tools.includes('db_query'), 'should detect BaseTool name attribute');
  });

  it('detects CrewAI Tool(name=...) in Python', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'agent.py', `
from crewai.tools import Tool

file_tool = Tool(name="file_write", description="Write to a file")
`);
    const result = scanDirectory(dir);
    assert.ok(result.tools.includes('file_write'), 'should detect CrewAI Tool(name=...)');
  });
});

// ── MCP / generic schema tests ────────────────────────────────────────────────

describe('scanner — MCP / generic schema patterns', () => {
  it('detects tool_name: value in YAML', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'tools.yml', `
policies:
  - tool_name: transfer_funds
    action: require_approval
  - tool_name: http_request
    action: monitor
`);
    const result = scanDirectory(dir);
    assert.ok(result.tools.includes('transfer_funds'), 'should detect transfer_funds in YAML');
    assert.ok(result.tools.includes('http_request'), 'should detect http_request in YAML');
  });

  it('detects "name": "tool_name" in JSON schema', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'mcp.json', JSON.stringify({
      tools: [
        { name: 'file_read', description: 'Read a file' },
        { name: 'db_query', description: 'Query a database' }
      ]
    }));
    const result = scanDirectory(dir);
    assert.ok(result.tools.includes('file_read'), 'should detect file_read in MCP JSON');
    assert.ok(result.tools.includes('db_query'), 'should detect db_query in MCP JSON');
  });

  it('detects tool: "tool_name" config syntax', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'config.yaml', `
guards:
  - tool: "send_email"
    policy: email-safety-v2
  - tool: "execute_sql"
    policy: db-safety-v1
`);
    const result = scanDirectory(dir);
    assert.ok(result.tools.includes('send_email'), 'should detect send_email from tool: config');
    assert.ok(result.tools.includes('execute_sql'), 'should detect execute_sql from tool: config');
  });
});

// ── Raw snake_case / kebab-case tests ─────────────────────────────────────────

describe('scanner — raw tool name patterns', () => {
  it('detects snake_case literals in string arrays', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'agent.ts', `
const allowedTools = ["file_read", "shell_exec", "http_request"];
`);
    const result = scanDirectory(dir);
    assert.ok(result.tools.includes('file_read'), 'should detect file_read');
    assert.ok(result.tools.includes('shell_exec'), 'should detect shell_exec');
    assert.ok(result.tools.includes('http_request'), 'should detect http_request');
  });

  it('normalises kebab-case to snake_case', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'agent.ts', `
const tool = "file-read";
`);
    const result = scanDirectory(dir);
    // kebab → snake_case normalisation
    assert.ok(result.tools.includes('file_read'), 'kebab-case should be normalised to snake_case');
  });

  it('deduplicates tools across multiple files', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'a.ts', `const t = "send_email";`);
    writeTmp(dir, 'b.ts', `const t = "send_email";`);
    writeTmp(dir, 'c.py', `tool = "send_email"`);
    const result = scanDirectory(dir);
    const count = result.tools.filter((t) => t === 'send_email').length;
    assert.equal(count, 1, 'send_email should appear exactly once after deduplication');
  });

  it('filters out common non-tool identifiers (stopwords)', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'agent.ts', `
const config = {
  created_at: "2024-01-01",
  updated_at: "2024-01-02",
  user_id: "abc123",
  api_key: "secret",
  file_path: "/tmp/test",
};
`);
    const result = scanDirectory(dir);
    assert.ok(!result.tools.includes('created_at'), 'created_at should be filtered (stopword)');
    assert.ok(!result.tools.includes('updated_at'), 'updated_at should be filtered (stopword)');
    assert.ok(!result.tools.includes('user_id'), 'user_id should be filtered (stopword)');
    assert.ok(!result.tools.includes('api_key'), 'api_key should be filtered (stopword)');
    assert.ok(!result.tools.includes('file_path'), 'file_path should be filtered (stopword)');
  });
});

// ── Path traversal protection tests ──────────────────────────────────────────

describe('scanner — path traversal protection', () => {
  it('safeResolve allows paths within root', () => {
    const root = '/tmp/myproject';
    const target = '/tmp/myproject/src';
    const resolved = safeResolve(root, target);
    assert.equal(resolved, '/tmp/myproject/src');
  });

  it('safeResolve allows root directory itself', () => {
    const root = '/tmp/myproject';
    const target = '/tmp/myproject';
    const resolved = safeResolve(root, target);
    assert.equal(resolved, '/tmp/myproject');
  });

  it('safeResolve blocks path traversal outside root', () => {
    const root = '/tmp/myproject';
    assert.throws(
      () => safeResolve(root, '/tmp/myproject/../../../etc'),
      /Path traversal blocked/,
      'should throw on path traversal',
    );
  });

  it('safeResolve blocks ../ escape', () => {
    const root = '/tmp/myproject';
    assert.throws(
      () => safeResolve(root, '/etc/passwd'),
      /Path traversal blocked/,
      'should block /etc/passwd escape',
    );
  });

  it('CLI rejects non-existent directory', () => {
    const result = run('validate', '/nonexistent/path/that/does/not/exist');
    assert.equal(result.exitCode, 1, 'should exit 1 for missing directory');
  });
});

// ── ToolHit attribution tests ─────────────────────────────────────────────────

describe('scanner — ToolHit framework attribution', () => {
  it('returns hits with framework field', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'tools.py', `
@tool
def send_email(to: str, body: str) -> str:
    pass
`);
    const result = scanDirectory(dir);
    assert.ok(result.hits.length > 0, 'should have at least one hit');
    const emailHit = result.hits.find((h) => h.name === 'send_email');
    assert.ok(emailHit, 'should have a hit for send_email');
    assert.ok(typeof emailHit.framework === 'string', 'hit should have a framework field');
    assert.ok(typeof emailHit.file === 'string', 'hit should have a file field');
    assert.ok(typeof emailHit.line === 'number', 'hit should have a line field');
  });

  it('returns correct relative file path in hit', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'src/agent.ts', `const t = "file_read";`);
    const result = scanDirectory(dir);
    const fileReadHit = result.hits.find((h) => h.name === 'file_read');
    assert.ok(fileReadHit, 'should find file_read hit');
    assert.ok(
      fileReadHit.file.includes('src') && fileReadHit.file.includes('agent.ts'),
      `file path should be relative and include src/agent.ts, got: ${fileReadHit.file}`,
    );
  });
});

// ── Formatter / CLI output tests ──────────────────────────────────────────────

describe('CLI — output format tests', () => {
  it('--format json produces valid JSON with tools array (string[])', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'agent.ts', `
const tools = ["file_read", "shell_exec", "send_email"];
`);
    const result = run('validate', dir, '--format', 'json');
    assert.equal(result.exitCode, 0, 'should exit 0');
    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      assert.fail(`stdout is not valid JSON:\n${result.stdout.substring(0, 500)}`);
    }
    assert.ok(Array.isArray(parsed.tools), 'tools should be an array');
    assert.equal(typeof parsed.tools[0], 'string', 'tools entries should be strings');
    assert.ok(parsed.tools.includes('file_read'), 'should include file_read');
    assert.ok(parsed.tools.includes('shell_exec'), 'should include shell_exec');
    assert.ok(parsed.tools.includes('send_email'), 'should include send_email');
  });

  it('--format json includes mode field', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'agent.ts', `const t = "file_read";`);
    const result = run('validate', dir, '--format', 'json');
    const parsed = JSON.parse(result.stdout);
    assert.ok(['offline', 'api'].includes(parsed.mode), `mode should be offline or api, got: ${parsed.mode}`);
  });

  it('--format json includes filesScanned field', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'agent.ts', `const t = "file_read";`);
    writeTmp(dir, 'tools.py', `const t = "send_email"`);
    const result = run('validate', dir, '--format', 'json');
    const parsed = JSON.parse(result.stdout);
    assert.ok(typeof parsed.filesScanned === 'number', 'filesScanned should be a number');
    assert.ok(parsed.filesScanned >= 2, `should have scanned at least 2 files, got: ${parsed.filesScanned}`);
  });

  it('--format markdown produces markdown table', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'agent.ts', `const tools = ["file_read", "send_email"];`);
    const result = run('validate', dir, '--format', 'markdown');
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes('##'), 'markdown should have heading');
    assert.ok(result.stdout.includes('|'), 'markdown should have table');
    assert.ok(result.stdout.includes('file_read'), 'markdown should mention file_read');
    assert.ok(result.stdout.includes('send_email'), 'markdown should mention send_email');
  });

  it('--format markdown is valid for GitHub Actions summary', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'agent.ts', `
const tools = ["execute_sql", "http_request", "send_email"];
`);
    const result = run('validate', dir, '--format', 'markdown');
    assert.equal(result.exitCode, 0);
    // Should have heading, table header, and rows
    assert.ok(result.stdout.includes('## '), 'should have h2 heading');
    assert.ok(result.stdout.includes('| Status | Tool |'), 'should have table header row');
    assert.ok(result.stdout.includes('execute_sql'), 'should include execute_sql');
  });

  it('default terminal output shows tool names', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'agent.ts', `const t = "send_email";`);
    const result = run('validate', dir);
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes('send_email'), 'terminal output should mention tool name');
    assert.ok(result.stdout.includes('AgentGuard'), 'terminal output should mention AgentGuard');
  });

  it('--offline flag prevents any API calls', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'agent.ts', `const t = "file_read";`);
    // Even with an api-key, --offline should skip API check
    const result = run('validate', dir, '--offline', '--api-key', 'ag_fake_key', '--format', 'json');
    assert.equal(result.exitCode, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.mode, 'offline', 'mode should be offline when --offline flag is set');
  });

  it('no API key defaults to offline mode', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'agent.ts', `const t = "file_read";`);
    const result = run('validate', dir, '--format', 'json');
    assert.equal(result.exitCode, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.mode, 'offline', 'mode should be offline when no API key');
  });
});

// ── Integration test: fixture project ─────────────────────────────────────────

describe('CLI — integration: multi-framework fixture', () => {
  const fixtureDir = path.resolve(__dirname, 'fixtures', 'sample-agent-project');

  it('creates fixture directory and scans it correctly', () => {
    // Create a realistic multi-framework fixture
    const dir = makeTmpDir();

    // LangChain TS agent
    writeTmp(dir, 'src/langchain/agent.ts', `
import { DynamicTool } from "langchain/tools";

const emailTool = new DynamicTool({
  name: "send_email",
  description: "Send an email",
  func: async (input) => sendEmail(input),
});

const sqlTool = new StructuredTool({
  name: "execute_sql",
  description: "Run SQL query",
  func: async ({ query }) => db.query(query),
});
`);

    // OpenAI function-calling
    writeTmp(dir, 'src/openai/functions.ts', `
const functions = [
  {
    name: "http_request",
    description: "Make an HTTP request",
    parameters: { type: "object", properties: { url: { type: "string" } } }
  }
];
`);

    // Python CrewAI agent
    writeTmp(dir, 'src/crewai/tools.py', `
from crewai.tools import BaseTool

class FileReaderTool(BaseTool):
    name = "file_read"
    description = "Read a file from the filesystem"
    
    def _run(self, path: str) -> str:
        with open(path) as f:
            return f.read()
`);

    // Raw tools
    writeTmp(dir, 'src/tools/registry.ts', `
export const DANGEROUS_TOOLS = ["shell_exec", "db_query", "transfer_funds"];
`);

    const result = run('validate', dir, '--format', 'json');
    assert.equal(result.exitCode, 0, 'should exit 0 for multi-framework scan');

    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed.tools.includes('send_email'), 'should detect send_email (LangChain)');
    assert.ok(parsed.tools.includes('execute_sql'), 'should detect execute_sql (LangChain)');
    assert.ok(parsed.tools.includes('http_request'), 'should detect http_request (OpenAI)');
    assert.ok(parsed.tools.includes('file_read'), 'should detect file_read (CrewAI)');
    assert.ok(parsed.tools.includes('shell_exec'), 'should detect shell_exec (raw)');
    assert.ok(parsed.tools.includes('transfer_funds'), 'should detect transfer_funds (raw)');

    // filesScanned should be correct
    assert.ok(parsed.filesScanned >= 4, `should scan at least 4 files, got ${parsed.filesScanned}`);
  });

  it('skips node_modules and dist even in nested structures', () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, 'node_modules', 'langchain', 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'dist', 'compiled'), { recursive: true });
    writeTmp(path.join(dir, 'node_modules', 'langchain', 'src'), 'tools.ts', `const t = "send_email";`);
    writeTmp(path.join(dir, 'dist', 'compiled'), 'agent.js', `const t = "shell_exec";`);
    writeTmp(dir, 'src/agent.ts', `const t = "file_read";`);

    const result = run('validate', dir, '--format', 'json');
    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed.tools.includes('file_read'), 'should include file_read from src');
    assert.ok(!parsed.tools.includes('send_email'), 'should skip node_modules/langchain tools');
    assert.ok(!parsed.tools.includes('shell_exec'), 'should skip dist tools');
  });

  it('--verbose flag shows files with hits', () => {
    const dir = makeTmpDir();
    writeTmp(dir, 'agent.ts', `const t = "file_read";`);
    const result = run('validate', dir, '--verbose');
    assert.equal(result.exitCode, 0);
    // verbose flag should include file listing info
    assert.ok(
      result.stdout.includes('agent.ts') || result.stdout.includes('file_read'),
      'verbose output should include file or tool info',
    );
  });
});

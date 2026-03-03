/**
 * AgentGuard Validate — GitHub Action
 *
 * 1. Scans the target directory for tool usage patterns
 * 2. Calls the AgentGuard API to validate each tool against the policy engine
 * 3. Posts a PR comment with a coverage report (markdown table)
 * 4. Sets output variables: coverage, risk-score, passed
 * 5. Fails the workflow if coverage < threshold (or uncovered tools exist)
 *
 * No external dependencies — uses Node.js built-ins + GitHub Actions @actions/core
 * pattern (reads env vars directly to avoid requiring a full npm install at runtime).
 *
 * Environment variables consumed (set by GitHub Actions runner from action.yml):
 *   INPUT_API-KEY, INPUT_API-URL, INPUT_DIRECTORY, INPUT_THRESHOLD,
 *   INPUT_FAIL-ON-UNCOVERED, INPUT_COMMENT
 *   GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_EVENT_PATH, GITHUB_EVENT_NAME
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ── GitHub Actions helpers ────────────────────────────────────────────────

function getInput(name) {
  const val = process.env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`] || '';
  return val.trim();
}

function setOutput(name, value) {
  const filePath = process.env['GITHUB_OUTPUT'];
  if (filePath) {
    fs.appendFileSync(filePath, `${name}=${value}\n`);
  } else {
    // Fallback for older runners
    console.log(`::set-output name=${name}::${value}`);
  }
}

function log(msg) {
  process.stdout.write(`[AgentGuard] ${msg}\n`);
}

function warning(msg) {
  process.stdout.write(`::warning::${msg}\n`);
}

function error(msg) {
  process.stdout.write(`::error::${msg}\n`);
}

function setFailed(msg) {
  error(msg);
  process.exit(1);
}

// ── HTTP helper ───────────────────────────────────────────────────────────

function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, body: data, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

// ── Tool Pattern Scanner ──────────────────────────────────────────────────

/**
 * Known tool name patterns found in AI agent frameworks.
 * Detects explicit string literals that look like AgentGuard tool names.
 * Pattern: string values in tool/function calls, config blocks, or array literals
 * that match snake_case or kebab-case names associated with agent capabilities.
 */
const TOOL_PATTERNS = [
  // Python / TS function call style: tool="send_email" or tool: 'http_post'
  /["'`]((?:[a-z][a-z0-9]*_)+[a-z0-9]+|[a-z][a-z0-9]*-[a-z][a-z0-9-]*)["'`]/g,
  // AgentGuard SDK calls: client.evaluate({ tool: "..." })
  /tool:\s*["'`]([a-z][a-z0-9_-]+)["'`]/g,
  // @tool decorator (Python LangChain / CrewAI style)
  /@tool\s*\n\s*def\s+([a-z][a-z0-9_]+)\s*\(/g,
  // tool_name: "..." in YAML / JSON
  /tool_name:\s*["']?([a-z][a-z0-9_-]+)["']?/g,
  // name: "..." inside tools array (MCP schema pattern)
  /"name":\s*"([a-z][a-z0-9_-]+)"/g,
];

/** File extensions to scan */
const SCAN_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.yaml', '.yml', '.json',
]);

/** Directories to always skip */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.venv', 'venv', 'env',
  'dist', 'build', '.next', '.nuxt', 'coverage', '.nyc_output',
  '.github', // skip the action itself
]);

/**
 * Well-known AgentGuard tool names. Used to filter scanner hits and avoid
 * false positives from arbitrary string literals.
 */
const KNOWN_TOOLS = new Set([
  // HTTP / network
  'http_request', 'http_post', 'http_get', 'http_put', 'http_delete',
  'fetch', 'curl', 'wget',
  // File operations
  'file_read', 'file_write', 'file_delete', 'file_append', 'file_copy', 'file_move',
  'read_file', 'write_file', 'delete_file',
  'rm', 'rmdir', 'unlink', 'mkdir', 'ls', 'list_files',
  // Shell / system
  'shell_exec', 'shell_run', 'sudo', 'chmod', 'chown', 'system_command',
  'exec', 'bash', 'sh',
  // Database
  'db_query', 'db_read', 'db_write', 'db_delete', 'sql_execute', 'sql_query',
  'db_read_public', 'drop_table', 'create_table',
  // LLM calls
  'llm_query', 'openai_chat', 'anthropic_complete', 'gpt4', 'gpt3', 'claude',
  'gemini', 'cohere_complete',
  // Financial
  'transfer_funds', 'create_payment', 'execute_transaction', 'process_refund',
  'get_balance', 'wire_transfer',
  // Email / messaging
  'send_email', 'send_sms', 'send_slack', 'post_message', 'send_notification',
  // Other common tool names
  'get_config', 'set_config', 'list_users', 'get_user', 'create_user',
  'update_record', 'search_web', 'web_search', 'browser_navigate',
]);

/**
 * Scan a directory recursively for tool name patterns.
 * Returns a deduplicated, sorted list of tool names found.
 */
function scanDirectory(dir) {
  const found = new Set();

  function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!SCAN_EXTENSIONS.has(ext)) continue;

      let content;
      try {
        content = fs.readFileSync(fullPath, 'utf8');
      } catch {
        continue;
      }

      // Apply each pattern
      for (const pattern of TOOL_PATTERNS) {
        // Reset lastIndex for global patterns
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const candidate = (match[1] || '').toLowerCase().trim();
          // Must look like a snake_case or kebab-case tool name
          if (candidate.length >= 3 && candidate.length <= 100) {
            if (KNOWN_TOOLS.has(candidate)) {
              found.add(candidate);
            } else if (/^[a-z][a-z0-9]*[_-][a-z][a-z0-9_-]*$/.test(candidate)) {
              // Accept any snake/kebab name with at least one separator
              found.add(candidate.replace(/-/g, '_'));
            }
          }
        }
      }
    }
  }

  walk(dir);
  return Array.from(found).sort();
}

// ── AgentGuard API client ─────────────────────────────────────────────────

async function validateTools(apiUrl, apiKey, tools) {
  const url = `${apiUrl.replace(/\/$/, '')}/api/v1/mcp/admit`;
  const body = {
    serverUrl: 'github-action-scan',
    tools: tools.map((name) => ({ name })),
  };
  const resp = await httpRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
  }, body);

  if (resp.status !== 200) {
    throw new Error(`AgentGuard API returned ${resp.status}: ${resp.body}`);
  }

  try {
    return JSON.parse(resp.body);
  } catch {
    throw new Error(`AgentGuard API returned non-JSON response: ${resp.body.substring(0, 200)}`);
  }
}

// ── PR Comment ────────────────────────────────────────────────────────────

function buildCommentBody(results, coverage, riskScore, uncovered, directory, threshold) {
  const passed = coverage >= threshold && uncovered.length === 0;
  const badge = passed ? '✅ PASSED' : '❌ FAILED';
  const icon = passed ? '🛡️' : '⚠️';

  const rows = results.map((r) => {
    const decisionIcon = {
      allow: '✅',
      monitor: '👁️',
      require_approval: '⚠️',
      block: '🚫',
      error: '❓',
    }[r.decision] || '❓';

    return `| \`${r.tool}\` | ${decisionIcon} ${r.decision} | ${r.ruleId || '_(default)_'} | ${r.riskScore} |`;
  }).join('\n');

  const uncoveredSection = uncovered.length > 0
    ? `\n### ⚠️ Uncovered Tools (no matching policy rule)\n\n${uncovered.map((t) => `- \`${t}\``).join('\n')}\n\nAdd policy rules for these tools to reach 100% coverage.\n`
    : '';

  return `## ${icon} AgentGuard Policy Coverage ${badge}

| Metric | Value |
|---|---|
| **Coverage** | ${coverage}% |
| **Risk Score** | ${riskScore} / 1000 |
| **Threshold** | ${threshold}% |
| **Directory scanned** | \`${directory}\` |

### Tool Validation Results

| Tool | Decision | Matched Rule | Risk Score |
|---|---|---|---|
${rows}
${uncoveredSection}
---
_Powered by [AgentGuard](https://agentguard.tech) — Runtime security for AI agents_`;
}

async function postPrComment(token, repo, commentBody) {
  const eventPath = process.env['GITHUB_EVENT_PATH'];
  if (!eventPath) {
    warning('GITHUB_EVENT_PATH not set — skipping PR comment');
    return;
  }

  let event;
  try {
    event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  } catch {
    warning('Could not read GitHub event payload — skipping PR comment');
    return;
  }

  const prNumber = event?.pull_request?.number || event?.issue?.number;
  if (!prNumber) {
    log('Not a pull request event — skipping PR comment');
    return;
  }

  const [owner, repoName] = repo.split('/');
  const url = `https://api.github.com/repos/${owner}/${repoName}/issues/${prNumber}/comments`;

  const resp = await httpRequest(url, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'AgentGuard-Action/1.0',
      'Accept': 'application/vnd.github.v3+json',
    },
  }, { body: commentBody });

  if (resp.status >= 200 && resp.status < 300) {
    log('PR comment posted successfully');
  } else {
    warning(`Failed to post PR comment: HTTP ${resp.status} — ${resp.body.substring(0, 200)}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const apiKey = getInput('api-key');
  const apiUrl = getInput('api-url') || 'https://api.agentguard.tech';
  const directory = getInput('directory') || '.';
  const thresholdStr = getInput('threshold') || '100';
  const failOnUncoveredStr = getInput('fail-on-uncovered') || 'true';
  const commentStr = getInput('comment') || 'true';

  const threshold = Math.max(0, Math.min(100, parseInt(thresholdStr, 10)));
  const failOnUncovered = failOnUncoveredStr.toLowerCase() !== 'false';
  const postComment = commentStr.toLowerCase() !== 'false';

  if (!apiKey) {
    setFailed('api-key input is required. Set it using secrets.AGENTGUARD_API_KEY.');
  }

  // Resolve directory
  const targetDir = path.resolve(process.cwd(), directory);
  if (!fs.existsSync(targetDir)) {
    setFailed(`Directory not found: ${targetDir}`);
  }

  log(`Scanning: ${targetDir}`);
  const tools = scanDirectory(targetDir);

  if (tools.length === 0) {
    warning('No tool names found in scanned files. Ensure your agent code uses recognisable tool name patterns.');
    setOutput('coverage', '100');
    setOutput('risk-score', '0');
    setOutput('passed', 'true');
    log('No tools found — marking as passed (nothing to validate).');
    process.exit(0);
  }

  log(`Found ${tools.length} tool(s): ${tools.join(', ')}`);
  log(`Calling AgentGuard API at ${apiUrl} ...`);

  let validationResult;
  try {
    validationResult = await validateTools(apiUrl, apiKey, tools);
  } catch (err) {
    setFailed(`AgentGuard API call failed: ${err.message}`);
  }

  const { coverage = 0, results = [], uncovered = [] } = validationResult;

  // Compute aggregate risk score from results
  const riskScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + (r.riskScore || 0), 0) / results.length)
    : 0;

  log(`Coverage: ${coverage}%  |  Risk Score: ${riskScore}  |  Uncovered: ${uncovered.length}`);

  // Set outputs
  setOutput('coverage', String(coverage));
  setOutput('risk-score', String(riskScore));

  const passed = coverage >= threshold && (!failOnUncovered || uncovered.length === 0);
  setOutput('passed', String(passed));

  // Post PR comment if requested
  if (postComment) {
    const token = process.env['GITHUB_TOKEN'];
    const repo = process.env['GITHUB_REPOSITORY'];
    const eventName = process.env['GITHUB_EVENT_NAME'];

    if (token && repo && (eventName === 'pull_request' || eventName === 'pull_request_target')) {
      const commentBody = buildCommentBody(results, coverage, riskScore, uncovered, directory, threshold);
      try {
        await postPrComment(token, repo, commentBody);
      } catch (err) {
        warning(`Failed to post PR comment: ${err.message}`);
      }
    } else {
      log('Skipping PR comment (not a pull_request event or missing GITHUB_TOKEN).');
    }
  }

  // Print summary table to console
  console.log('\n┌─────────────────────────────────────┐');
  console.log('│       AgentGuard Coverage Report     │');
  console.log('├─────────────────────────────────────┤');
  console.log(`│  Coverage:    ${String(coverage + '%').padEnd(23)}│`);
  console.log(`│  Risk Score:  ${String(riskScore + '/1000').padEnd(23)}│`);
  console.log(`│  Threshold:   ${String(threshold + '%').padEnd(23)}│`);
  console.log(`│  Uncovered:   ${String(uncovered.length).padEnd(23)}│`);
  console.log(`│  Result:      ${passed ? 'PASSED                 ' : 'FAILED                 '}│`);
  console.log('└─────────────────────────────────────┘\n');

  if (!passed) {
    const reasons = [];
    if (coverage < threshold) {
      reasons.push(`Coverage ${coverage}% is below threshold ${threshold}%`);
    }
    if (failOnUncovered && uncovered.length > 0) {
      reasons.push(`${uncovered.length} tool(s) have no matching policy rule: ${uncovered.join(', ')}`);
    }
    setFailed(`AgentGuard validation failed: ${reasons.join('; ')}`);
  }

  log('Validation passed ✅');
}

main().catch((err) => {
  setFailed(`Unexpected error: ${err.message || err}`);
});

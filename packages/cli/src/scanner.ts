/**
 * AgentGuard Scanner
 *
 * Scans a directory for AI agent tool usage patterns and returns a deduplicated
 * list of detected tool names.
 *
 * Pattern detection mirrors the GitHub Action (agentguard-validate) so results
 * are consistent between local CLI runs and CI/CD pipelines.
 */

import fs from 'fs';
import path from 'path';

// ── Pattern definitions ───────────────────────────────────────────────────────

/**
 * Regex patterns that detect tool name literals in source code.
 * Covers LangChain, OpenAI function-calling, MCP schema, and generic snake_case
 * / kebab-case string patterns that look like AgentGuard tool names.
 */
const TOOL_PATTERNS: RegExp[] = [
  // Generic quoted snake_case / kebab-case literals: "file_read", 'http-post', etc.
  /["'`]((?:[a-z][a-z0-9]*_)+[a-z0-9]+|[a-z][a-z0-9]*-[a-z][a-z0-9-]*)["'`]/g,
  // AgentGuard SDK calls: tool: "send_email"
  /tool:\s*["'`]([a-z][a-z0-9_-]+)["'`]/g,
  // Python @tool decorator on a function: @tool\ndef tool_name(
  /@tool\s*\n\s*def\s+([a-z][a-z0-9_]+)\s*\(/g,
  // YAML / JSON key: tool_name: some_tool
  /tool_name:\s*["']?([a-z][a-z0-9_-]+)["']?/g,
  // MCP / OpenAI schema: "name": "tool_name"
  /"name":\s*"([a-z][a-z0-9_-]+)"/g,
  // LangChain Tool(name="...") / StructuredTool(name="...")
  /(?:Tool|StructuredTool)\s*\(\s*name\s*=\s*["']([a-z][a-z0-9_-]+)["']/g,
  // OpenAI functions array: { name: "tool_name" }
  /\{\s*name\s*:\s*["'`]([a-z][a-z0-9_-]+)["'`]/g,
];

/** File extensions to include in the scan */
const SCAN_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.yaml', '.yml', '.json',
]);

/** Directories to skip unconditionally */
const DEFAULT_SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.venv', 'venv', 'env',
  'dist', 'build', '.next', '.nuxt', 'coverage', '.nyc_output',
  '.github',
]);

/**
 * Well-known AgentGuard tool names.
 * Used to filter out false positives from arbitrary string literals — a hit
 * only counts if it either matches a known tool name OR follows snake/kebab-case
 * naming with at least one separator character.
 */
export const KNOWN_TOOLS = new Set([
  // HTTP / network
  'http_request', 'http_post', 'http_get', 'http_put', 'http_delete',
  'fetch', 'curl', 'wget',
  // File operations
  'file_read', 'file_write', 'file_delete', 'file_append', 'file_copy', 'file_move',
  'read_file', 'write_file', 'delete_file',
  'rm', 'rmdir', 'unlink', 'mkdir', 'ls', 'list_files',
  // Shell / system
  'shell_exec', 'shell_run', 'sudo', 'chmod', 'chown', 'system_command',
  'exec', 'bash', 'sh', 'execute_command', 'run_command', 'subprocess',
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

// ── Scanner ───────────────────────────────────────────────────────────────────

export interface ScanOptions {
  /** Additional directory names to skip (merged with DEFAULT_SKIP_DIRS) */
  excludeDirs?: string[];
  /** Additional file glob patterns to include (currently unused — extension-based) */
  includePatterns?: string[];
}

export interface ScanResult {
  /** Deduplicated, sorted list of detected tool names */
  tools: string[];
  /** Number of files scanned */
  filesScanned: number;
  /** Paths of files that contained at least one tool hit */
  filesWithHits: string[];
}

/**
 * Scan a directory tree for AI agent tool usage patterns.
 */
export function scanDirectory(dir: string, options: ScanOptions = {}): ScanResult {
  const skipDirs = new Set([
    ...DEFAULT_SKIP_DIRS,
    ...(options.excludeDirs ?? []),
  ]);

  const found = new Set<string>();
  const filesWithHits = new Set<string>();
  let filesScanned = 0;

  function walk(current: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!SCAN_EXTENSIONS.has(ext)) continue;

      let content: string;
      try {
        content = fs.readFileSync(fullPath, 'utf8');
      } catch {
        continue;
      }

      filesScanned++;
      let fileHit = false;

      for (const pattern of TOOL_PATTERNS) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(content)) !== null) {
          const candidate = (match[1] ?? '').toLowerCase().trim();
          if (candidate.length < 3 || candidate.length > 100) continue;

          if (KNOWN_TOOLS.has(candidate)) {
            found.add(candidate);
            fileHit = true;
          } else if (/^[a-z][a-z0-9]*[_-][a-z][a-z0-9_-]*$/.test(candidate)) {
            // Accept any snake_case / kebab-case name with at least one separator
            found.add(candidate.replace(/-/g, '_'));
            fileHit = true;
          }
        }
      }

      if (fileHit) filesWithHits.add(fullPath);
    }
  }

  walk(dir);

  return {
    tools: Array.from(found).sort(),
    filesScanned,
    filesWithHits: Array.from(filesWithHits).sort(),
  };
}

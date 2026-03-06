/**
 * AgentGuard Scanner
 *
 * Scans a directory tree for AI agent tool usage patterns and returns a
 * deduplicated list of detected tool names with framework attribution.
 *
 * Security: path traversal protection — resolved target must stay within the
 * provided root directory.
 *
 * Pattern detection covers:
 *   - LangChain  (@tool decorator, Tool(), StructuredTool(), DynamicTool())
 *   - OpenAI     (function-calling schema, tools: array)
 *   - CrewAI     (BaseTool subclasses, Tool(name=...))
 *   - MCP        ("name" schema fields, tool_name: YAML)
 *   - Generic    (snake_case / kebab-case quoted literals)
 */

import fs from 'fs';
import path from 'path';
import { ALL_PATTERNS, KNOWN_TOOLS } from './patterns.js';

// ── File extension allow-list ─────────────────────────────────────────────────

const SCAN_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.yaml', '.yml', '.json',
]);

// ── Directories skipped unconditionally ──────────────────────────────────────

const DEFAULT_SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.venv', 'venv', 'env',
  'dist', 'build', '.next', '.nuxt', 'coverage', '.nyc_output',
  '.github', '.turbo', '.cache',
]);

// ── Types ─────────────────────────────────────────────────────────────────────

/** A tool detected in a specific file */
export interface ToolHit {
  /** Normalised tool name (snake_case) */
  name: string;
  /** Framework that produced the match */
  framework: string;
  /** Relative path of file containing the hit */
  file: string;
  /** 1-based line number of first occurrence */
  line: number;
}

export interface ScanOptions {
  /** Additional directory names to skip (merged with DEFAULT_SKIP_DIRS) */
  excludeDirs?: string[];
}

export interface ScanResult {
  /** Deduplicated, sorted list of detected tool names */
  tools: string[];
  /** Number of files scanned */
  filesScanned: number;
  /** Relative paths of files that contained at least one tool hit */
  filesWithHits: string[];
  /** Full hit details (one entry per unique tool name, first occurrence) */
  hits: ToolHit[];
}

// ── Path traversal protection ─────────────────────────────────────────────────

/**
 * Resolves `target` and verifies it stays within `root`.
 * Throws if the resolved path would escape the root.
 */
export function safeResolve(root: string, target: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);

  if (!resolvedTarget.startsWith(resolvedRoot + path.sep) && resolvedTarget !== resolvedRoot) {
    throw new Error(
      `Path traversal blocked: "${target}" resolves outside the allowed root "${resolvedRoot}"`,
    );
  }

  return resolvedTarget;
}

// ── Candidate filtering ───────────────────────────────────────────────────────

/**
 * Determines whether a matched candidate string is an acceptable tool name.
 *
 * Rules:
 *  1. Must be 3–80 characters long
 *  2. Must be known OR have snake/kebab-case structure (at least one separator)
 *  3. Must not be a common non-tool identifier (see STOPWORDS)
 */
const STOPWORDS = new Set([
  // common string literals that match snake_case but are not tools
  'node_modules', 'dist_dir', 'build_dir', 'test_utils', 'new_line', 'line_break',
  'no_op', 'noop', 'true', 'false', 'null', 'undefined',
  'created_at', 'updated_at', 'deleted_at',
  'user_id', 'tenant_id', 'client_id', 'session_id', 'request_id', 'trace_id',
  'error_message', 'error_code', 'status_code',
  'file_path', 'file_name', 'dir_path', 'base_path', 'root_path',
  'api_key', 'api_url', 'base_url', 'end_point',
  'on_message', 'on_error', 'on_close', 'on_open', 'on_connect',
  'max_retries', 'max_tokens', 'min_length', 'max_length',
  'start_time', 'end_time', 'run_time', 'up_time',
  'log_level', 'log_file', 'log_dir',
]);

function isAcceptable(candidate: string): boolean {
  if (candidate.length < 3 || candidate.length > 80) return false;
  if (STOPWORDS.has(candidate)) return false;

  // Known tool names are always accepted
  if (KNOWN_TOOLS.has(candidate)) return true;

  // Accept any snake_case / kebab-case with at least one separator character
  return /^[a-z][a-z0-9]*[_-][a-z][a-z0-9_-]*$/.test(candidate);
}

// ── Line number helper ────────────────────────────────────────────────────────

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

// ── Scanner ───────────────────────────────────────────────────────────────────

/**
 * Scan a directory tree for AI agent tool usage patterns.
 *
 * @param dir     Absolute path to scan (must already be validated by caller)
 * @param options Optional scan configuration
 */
export function scanDirectory(dir: string, options: ScanOptions = {}): ScanResult {
  const skipDirs = new Set([
    ...DEFAULT_SKIP_DIRS,
    ...(options.excludeDirs ?? []),
  ]);

  // Map from tool name → first ToolHit (for deduplication)
  const hitsByName = new Map<string, ToolHit>();
  const filesWithHitsSet = new Set<string>();
  let filesScanned = 0;

  const rootDir = path.resolve(dir);

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
      const relPath = path.relative(rootDir, fullPath);
      let fileHit = false;

      for (const { regex, framework } of ALL_PATTERNS) {
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(content)) !== null) {
          const raw = (match[1] ?? '').toLowerCase().trim();
          if (!isAcceptable(raw)) continue;

          // Normalise kebab-case to snake_case for deduplication
          const name = raw.replace(/-/g, '_');

          if (!hitsByName.has(name)) {
            hitsByName.set(name, {
              name,
              framework,
              file: relPath,
              line: lineOf(content, match.index),
            });
          }

          fileHit = true;
        }
      }

      if (fileHit) filesWithHitsSet.add(relPath);
    }
  }

  walk(rootDir);

  const hits = Array.from(hitsByName.values()).sort((a, b) => a.name.localeCompare(b.name));

  return {
    tools: hits.map((h) => h.name),
    filesScanned,
    filesWithHits: Array.from(filesWithHitsSet).sort(),
    hits,
  };
}

/**
 * AgentGuard CLI — Config file loader
 *
 * Reads `.agentguard.yml` from the current working directory (or a specified
 * path) and returns a typed config object. CLI flags always take precedence
 * over file values.
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentGuardConfig {
  api_url?: string;
  api_key?: string;
  threshold?: number;
  fail_on_uncovered?: boolean;
  scan_patterns?: string[];
  exclude?: string[];
}

// ── Loader ────────────────────────────────────────────────────────────────────

/**
 * Load `.agentguard.yml` from the given directory (defaults to cwd).
 * Returns an empty object if the file does not exist.
 * Throws if the file exists but is not valid YAML.
 */
export function loadConfig(searchDir: string = process.cwd()): AgentGuardConfig {
  const filePath = path.join(searchDir, '.agentguard.yml');

  if (!fs.existsSync(filePath)) {
    return {};
  }

  let raw: unknown;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    raw = yaml.load(content);
  } catch (err) {
    throw new Error(`Failed to parse .agentguard.yml: ${(err as Error).message}`);
  }

  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('.agentguard.yml must be a YAML mapping (object)');
  }

  return raw as AgentGuardConfig;
}

// ── Default config file content ───────────────────────────────────────────────

export const DEFAULT_CONFIG_CONTENT = `# .agentguard.yml — AgentGuard CLI configuration
#
# All values can be overridden with CLI flags.
# The API key should be set via the AGENTGUARD_API_KEY environment variable.

api_url: https://api.agentguard.dev
# api_key: ag_live_xxx   # Use AGENTGUARD_API_KEY env var instead

# Minimum coverage percentage required to pass
threshold: 100

# Fail if any tool has no matching policy rule (even if coverage >= threshold)
fail_on_uncovered: true

# File patterns to include when scanning (glob-style)
scan_patterns:
  - "**/*.ts"
  - "**/*.py"
  - "**/*.js"

# Directories to exclude from scanning
exclude:
  - node_modules
  - .git
  - dist
  - build
  - coverage
`;

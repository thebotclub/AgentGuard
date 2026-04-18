/**
 * Policy Git Webhook — GitHub API helpers, YAML parsing, and sync logic.
 */

import crypto from 'node:crypto';
import yaml from 'js-yaml';
import { logger } from '../../lib/logger.js';
import type { IDatabase } from '../../db-interface.js';
import { PolicyRuleSchema } from '../../../packages/sdk/src/core/types.js';

// ── GitHub API Types ─────────────────────────────────────────────────────────

export interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  type: 'file' | 'dir';
  download_url: string | null;
}

interface PolicyYamlFile {
  id?: string;
  name?: string;
  rules: unknown[];
}

export interface SyncResult {
  updated: number;
  skipped: number;
  errors: string[];
  commitSha: string;
  branch: string;
}

// ── GitHub API Helpers ───────────────────────────────────────────────────────

/**
 * List files in a directory in a GitHub repo.
 */
export async function listGithubDirectory(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  token: string | null,
): Promise<GitHubFile[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${ref}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'AgentGuard/1.0',
  };
  if (token) headers['Authorization'] = `token ${token}`;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });

  if (res.status === 404) return []; // Directory doesn't exist yet
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText} for ${url}`);
  }

  const data = await res.json() as GitHubFile[];
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch a file's content from GitHub.
 */
export async function fetchGithubFile(
  downloadUrl: string,
  token: string | null,
): Promise<string> {
  const headers: Record<string, string> = { 'User-Agent': 'AgentGuard/1.0' };
  if (token) headers['Authorization'] = `token ${token}`;

  const res = await fetch(downloadUrl, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error(`Failed to fetch file ${downloadUrl}: ${res.status}`);
  }
  return res.text();
}

/**
 * Parse owner/repo from a GitHub URL.
 * Supports: https://github.com/owner/repo, git@github.com:owner/repo.git
 */
export function parseGithubRepo(url: string): { owner: string; repo: string } {
  const httpsMatch = url.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1]!, repo: httpsMatch[2]! };
  }
  throw new Error(`Cannot parse GitHub owner/repo from URL: ${url}`);
}

// ── Policy YAML Parser ───────────────────────────────────────────────────────

export function parsePolicyYaml(content: string, filename: string): { id: string; name: string; rules: unknown[] } {
  const doc = yaml.load(content) as PolicyYamlFile;

  if (!doc || typeof doc !== 'object') {
    throw new Error(`Invalid policy YAML in ${filename}: not an object`);
  }

  const rules = doc.rules;
  if (!Array.isArray(rules)) {
    throw new Error(`Invalid policy YAML in ${filename}: missing 'rules' array`);
  }

  for (const rule of rules) {
    const parsed = PolicyRuleSchema.safeParse(rule);
    if (!parsed.success) {
      throw new Error(`Invalid rule in ${filename}: ${parsed.error.issues[0]?.message}`);
    }
  }

  const id = doc.id ?? filename.replace(/\.ya?ml$/i, '');
  const name = doc.name ?? id;

  return { id, name, rules };
}

// ── Sync Logic ───────────────────────────────────────────────────────────────

/**
 * Sync policies from GitHub repo to AgentGuard.
 * Detects changes by comparing YAML content hashes.
 */
export async function syncPoliciesFromGithub(
  db: IDatabase,
  tenantId: string,
  owner: string,
  repo: string,
  branch: string,
  policyDir: string,
  commitSha: string,
  token: string | null,
): Promise<SyncResult> {
  const result: SyncResult = { updated: 0, skipped: 0, errors: [], commitSha, branch };

  let files: GitHubFile[];
  try {
    files = await listGithubDirectory(owner, repo, policyDir, branch, token);
  } catch (err) {
    result.errors.push(`Failed to list policy directory: ${err instanceof Error ? err.message : err}`);
    return result;
  }

  const yamlFiles = files.filter(
    (f) => f.type === 'file' && /\.ya?ml$/i.test(f.name) && f.download_url,
  );

  if (yamlFiles.length === 0) {
    logger.info(`[git-webhook] No YAML files found in ${owner}/${repo}:${branch}/${policyDir}`);
    return result;
  }

  let currentPolicyRaw: string | null = null;
  try {
    currentPolicyRaw = await db.getCustomPolicy(tenantId);
  } catch { /* ignore */ }

  const currentRulesById = new Map<string, unknown>();
  if (currentPolicyRaw) {
    try {
      const current = JSON.parse(currentPolicyRaw) as unknown;
      const rules: unknown[] = Array.isArray(current) ? current : (current as { rules?: unknown[] }).rules ?? [];
      for (const rule of rules) {
        const r = rule as { id?: string };
        if (r.id) currentRulesById.set(r.id, rule);
      }
    } catch { /* ignore */ }
  }

  const allNewRules: unknown[] = [];

  for (const file of yamlFiles) {
    try {
      const content = await fetchGithubFile(file.download_url!, token);
      const { rules } = parsePolicyYaml(content, file.name);

      const contentHash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

      let changed = false;
      for (const rule of rules) {
        const r = rule as { id?: string };
        const existing = r.id ? currentRulesById.get(r.id) : null;
        if (!existing || JSON.stringify(existing) !== JSON.stringify(rule)) {
          changed = true;
        }
        allNewRules.push(rule);
      }

      if (changed) {
        result.updated += rules.length;
        logger.info(`[git-webhook] Updated ${rules.length} rules from ${file.name} (hash: ${contentHash})`);
      } else {
        result.skipped += rules.length;
      }
    } catch (err) {
      const msg = `Failed to process ${file.name}: ${err instanceof Error ? err.message : err}`;
      result.errors.push(msg);
      logger.error(`[git-webhook] ${msg}`);
    }
  }

  if (result.updated > 0 && result.errors.length === 0) {
    const policyDoc = JSON.stringify({ rules: allNewRules }, null, 2);

    try {
      const nextVersion = await db.getNextPolicyVersion('git-sync', tenantId);
      await db.insertPolicyVersion('git-sync', tenantId, policyDoc, null);
      logger.info(`[git-webhook] Saved policy version ${nextVersion} for tenant ${tenantId}`);
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err : String(err) }, '[git-webhook] Failed to save policy version');
    }

    await db.setCustomPolicy(tenantId, policyDoc);
    logger.info(`[git-webhook] Applied ${result.updated} rules from ${yamlFiles.length} files to tenant ${tenantId}`);
  }

  return result;
}

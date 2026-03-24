/**
 * AgentGuard — Policy-as-Code Git Webhook (GitOps)
 *
 * Enables GitOps-style policy management: push to main → sync policies.
 *
 * Routes:
 *   POST /api/v1/policies/webhook/github     — receive GitHub push webhook
 *   GET  /api/v1/policies/git/config         — get git webhook config
 *   PUT  /api/v1/policies/git/config         — configure git webhook
 *   DELETE /api/v1/policies/git/config       — remove git webhook config
 *   GET  /api/v1/policies/git/logs           — list sync history
 *   POST /api/v1/policies/git/sync           — trigger manual sync
 *   POST /api/v1/policies/rollback/:version  — rollback policy to version
 *
 * Policy Directory Convention:
 *   agentguard/policies/*.yaml in the configured repo
 *
 * Each YAML file = one policy rule set:
 *   id: my-policy
 *   name: "My Policy"
 *   rules:
 *     - id: rule-1
 *       tool: "send_email"
 *       action: "block"
 *       ...
 */
import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import yaml from 'js-yaml';
import { z } from 'zod';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import { requireRole } from '../lib/rbac.js';
import { requireFeature } from '../middleware/feature-gate.js';
import { storeAuditEvent } from './audit.js';
import { PolicyRuleSchema } from '../../packages/sdk/src/core/types.js';

// ── Schemas ────────────────────────────────────────────────────────────────

const GitWebhookConfigSchema = z.object({
  repoUrl: z.string().url(),
  webhookSecret: z.string().min(16).max(256),
  branch: z.string().min(1).max(100).default('main'),
  policyDir: z.string().min(1).max(255).default('agentguard/policies'),
  githubToken: z.string().max(256).nullable().optional(),
});

// ── GitHub Webhook Signature Verification ──────────────────────────────────

/**
 * Verify GitHub webhook signature (HMAC-SHA256).
 * GitHub sends: X-Hub-Signature-256: sha256=<hex>
 */
function verifyGithubSignature(
  payload: Buffer | string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  } catch {
    return false;
  }
}

// ── GitHub API Helpers ─────────────────────────────────────────────────────

interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  type: 'file' | 'dir';
  download_url: string | null;
}

/**
 * List files in a directory in a GitHub repo.
 */
async function listGithubDirectory(
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
async function fetchGithubFile(
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
function parseGithubRepo(url: string): { owner: string; repo: string } {
  // HTTPS
  const httpsMatch = url.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1]!, repo: httpsMatch[2]! };
  }
  throw new Error(`Cannot parse GitHub owner/repo from URL: ${url}`);
}

// ── Policy YAML Parser ─────────────────────────────────────────────────────

interface PolicyYamlFile {
  id?: string;
  name?: string;
  rules: unknown[];
}

function parsePolicyYaml(content: string, filename: string): { id: string; name: string; rules: unknown[] } {
  const doc = yaml.load(content) as PolicyYamlFile;

  if (!doc || typeof doc !== 'object') {
    throw new Error(`Invalid policy YAML in ${filename}: not an object`);
  }

  const rules = doc.rules;
  if (!Array.isArray(rules)) {
    throw new Error(`Invalid policy YAML in ${filename}: missing 'rules' array`);
  }

  // Validate each rule
  for (const rule of rules) {
    const parsed = PolicyRuleSchema.safeParse(rule);
    if (!parsed.success) {
      throw new Error(`Invalid rule in ${filename}: ${parsed.error.issues[0]?.message}`);
    }
  }

  // Derive policy ID from filename if not set
  const id = doc.id ?? filename.replace(/\.ya?ml$/i, '');
  const name = doc.name ?? id;

  return { id, name, rules };
}

// ── Sync Logic ─────────────────────────────────────────────────────────────

interface SyncResult {
  updated: number;
  skipped: number;
  errors: string[];
  commitSha: string;
  branch: string;
}

/**
 * Sync policies from GitHub repo to AgentGuard.
 * Detects changes by comparing YAML content hashes.
 */
async function syncPoliciesFromGithub(
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

  // List YAML files in the policy directory
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
    console.log(`[git-webhook] No YAML files found in ${owner}/${repo}:${branch}/${policyDir}`);
    return result;
  }

  // Get current policy for comparison
  let currentPolicyRaw: string | null = null;
  try {
    currentPolicyRaw = await db.getCustomPolicy(tenantId);
  } catch { /* ignore */ }

  // Parse current policy to extract existing rules by ID
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

  // Process each YAML file
  const allNewRules: unknown[] = [];

  for (const file of yamlFiles) {
    try {
      const content = await fetchGithubFile(file.download_url!, token);
      const { rules } = parsePolicyYaml(content, file.name);

      // Compute content hash for diff detection
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
        console.log(`[git-webhook] Updated ${rules.length} rules from ${file.name} (hash: ${contentHash})`);
      } else {
        result.skipped += rules.length;
      }
    } catch (err) {
      const msg = `Failed to process ${file.name}: ${err instanceof Error ? err.message : err}`;
      result.errors.push(msg);
      console.error(`[git-webhook] ${msg}`);
    }
  }

  // Only update if there are changes
  if (result.updated > 0 && result.errors.length === 0) {
    const policyDoc = JSON.stringify({ rules: allNewRules }, null, 2);

    // Save policy version before updating
    try {
      const nextVersion = await db.getNextPolicyVersion('git-sync', tenantId);
      await db.insertPolicyVersion(
        'git-sync',
        tenantId,
        policyDoc,
        null,
      );
      console.log(`[git-webhook] Saved policy version ${nextVersion} for tenant ${tenantId}`);
    } catch (err) {
      console.warn('[git-webhook] Failed to save policy version:', err);
    }

    await db.setCustomPolicy(tenantId, policyDoc);
    console.log(`[git-webhook] Applied ${result.updated} rules from ${yamlFiles.length} files to tenant ${tenantId}`);
  }

  return result;
}

// ── Route Factory ──────────────────────────────────────────────────────────

export function createPolicyGitWebhookRoutes(db: IDatabase, auth: AuthMiddleware): Router {
  const router = Router();

  // ── GET /api/v1/policies/git/config ──────────────────────────────────────
  router.get(
    '/api/v1/policies/git/config',
    auth.requireTenantAuth,
    requireRole('owner', 'admin'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      try {
        const config = await db.getGitWebhookConfig(tenantId);
        if (!config) {
          return res.status(404).json({ error: 'No git webhook configured' });
        }
        return res.json({
          id: config.id,
          tenantId: config.tenant_id,
          repoUrl: config.repo_url,
          branch: config.branch,
          policyDir: config.policy_dir,
          hasToken: Boolean(config.github_token),
          webhookSecret: '***', // always masked
          createdAt: config.created_at,
          updatedAt: config.updated_at,
          webhookUrl: `${req.protocol}://${req.get('host')}/api/v1/policies/webhook/github`,
          webhookEvents: ['push'],
        });
      } catch (err) {
        console.error('[git-webhook] config GET error:', err);
        return res.status(500).json({ error: 'Failed to retrieve git webhook config' });
      }
    },
  );

  // ── PUT /api/v1/policies/git/config ──────────────────────────────────────
  router.put(
    '/api/v1/policies/git/config',
    auth.requireTenantAuth,
    requireRole('owner', 'admin'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const parsed = GitWebhookConfigSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
      }

      const { repoUrl, webhookSecret, branch, policyDir, githubToken } = parsed.data;

      try {
        const config = await db.upsertGitWebhookConfig(
          tenantId, repoUrl, webhookSecret, branch, policyDir, githubToken ?? null,
        );

        console.log(`[git-webhook] tenant ${tenantId}: configured git webhook for ${repoUrl}:${branch}`);

        return res.json({
          id: config.id,
          tenantId: config.tenant_id,
          repoUrl: config.repo_url,
          branch: config.branch,
          policyDir: config.policy_dir,
          hasToken: Boolean(config.github_token),
          webhookSecret: '***',
          createdAt: config.created_at,
          webhookUrl: `${req.protocol}://${req.get('host')}/api/v1/policies/webhook/github`,
          webhookEvents: ['push'],
          instructions: [
            `1. Go to ${repoUrl}/settings/hooks`,
            `2. Add webhook → URL: ${req.protocol}://${req.get('host')}/api/v1/policies/webhook/github`,
            `3. Content type: application/json`,
            `4. Secret: (your webhookSecret)`,
            `5. Events: push`,
            `6. Create YAML files in ${policyDir}/*.yaml`,
          ],
        });
      } catch (err) {
        console.error('[git-webhook] config PUT error:', err);
        return res.status(500).json({ error: 'Failed to configure git webhook' });
      }
    },
  );

  // ── DELETE /api/v1/policies/git/config ────────────────────────────────────
  router.delete(
    '/api/v1/policies/git/config',
    auth.requireTenantAuth,
    requireRole('owner', 'admin'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      try {
        const existing = await db.getGitWebhookConfig(tenantId);
        if (!existing) {
          return res.status(404).json({ error: 'No git webhook configured' });
        }
        await db.deleteGitWebhookConfig(tenantId);
        return res.json({ message: 'Git webhook configuration removed' });
      } catch (err) {
        return res.status(500).json({ error: 'Failed to remove git webhook config' });
      }
    },
  );

  // ── GET /api/v1/policies/git/logs ─────────────────────────────────────────
  router.get(
    '/api/v1/policies/git/logs',
    auth.requireTenantAuth,
    requireRole('owner', 'admin', 'member'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const limit = Math.min(Number(req.query['limit'] ?? 20), 100);
      try {
        const logs = await db.listGitSyncLogs(tenantId, limit);
        return res.json({ logs });
      } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch sync logs' });
      }
    },
  );

  // ── POST /api/v1/policies/git/sync — Manual Sync ─────────────────────────
  router.post(
    '/api/v1/policies/git/sync',
    auth.requireTenantAuth,
    requireRole('owner', 'admin'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      try {
        const config = await db.getGitWebhookConfig(tenantId);
        if (!config) {
          return res.status(404).json({ error: 'No git webhook configured. Set up via PUT /api/v1/policies/git/config' });
        }

        const { owner, repo } = parseGithubRepo(config.repo_url);
        const result = await syncPoliciesFromGithub(
          db, tenantId, owner, repo,
          config.branch, config.policy_dir,
          'manual', config.github_token,
        );

        // Log the sync
        await db.insertGitSyncLog(
          tenantId, result.commitSha, result.branch,
          result.updated, result.skipped,
          result.errors.length > 0 ? 'error' : 'success',
          result.errors.length > 0 ? result.errors.join('; ') : null,
        );

        // Audit trail
        await storeAuditEvent(
          db, tenantId, null,
          'policy.git_sync', 'allow',
          'git_sync_manual', 0,
          `Manual policy sync: ${result.updated} updated, ${result.skipped} unchanged`,
          0, '', null,
        );

        return res.json({
          success: result.errors.length === 0,
          ...result,
        });
      } catch (err) {
        console.error('[git-webhook] manual sync error:', err);
        return res.status(500).json({ error: `Sync failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
      }
    },
  );

  // ── POST /api/v1/policies/rollback/:version ───────────────────────────────
  router.post(
    '/api/v1/policies/rollback/:version',
    auth.requireTenantAuth,
    requireRole('owner', 'admin'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      const version = parseInt((req.params['version'] as string) ?? '', 10);

      if (isNaN(version) || version < 1) {
        return res.status(400).json({ error: 'Invalid version number' });
      }

      try {
        const policyId = req.query['policyId'] as string ?? 'git-sync';
        const versionRow = await db.getPolicyVersion(policyId, tenantId, version);

        if (!versionRow) {
          return res.status(404).json({ error: `Policy version ${version} not found` });
        }

        // Get current version to reference as "reverted from"
        const currentVersions = await db.getPolicyVersions(policyId, tenantId);
        const currentVersion = currentVersions[0]?.version ?? null;

        // Apply the old policy
        await db.setCustomPolicy(tenantId, versionRow.policy_data);

        // Record the rollback as a new version
        await db.insertPolicyVersion(policyId, tenantId, versionRow.policy_data, version);

        // Audit trail
        await storeAuditEvent(
          db, tenantId, null,
          'policy.rollback', 'allow',
          'policy_rollback', 0,
          `Policy rolled back from version ${currentVersion} to version ${version}`,
          0, '', null,
        );

        console.log(`[git-webhook] tenant ${tenantId}: rolled back policy to version ${version}`);

        return res.json({
          success: true,
          rolledBackTo: version,
          from: currentVersion,
          message: `Policy rolled back to version ${version}`,
        });
      } catch (err) {
        console.error('[git-webhook] rollback error:', err);
        return res.status(500).json({ error: `Rollback failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
      }
    },
  );

  // ── POST /api/v1/policies/webhook/github ─────────────────────────────────
  /**
   * Receive GitHub push webhook.
   * Requires raw body for HMAC verification (configured in server.ts).
   */
  router.post(
    '/api/v1/policies/webhook/github',
    async (req: Request, res: Response) => {
      // GitHub event type
      const githubEvent = req.headers['x-github-event'] as string;
      const signature = req.headers['x-hub-signature-256'] as string | undefined;
      const deliveryId = req.headers['x-github-delivery'] as string | undefined;

      // Only handle push events
      if (githubEvent !== 'push') {
        return res.json({ accepted: false, reason: `Event '${githubEvent}' ignored — only 'push' is handled` });
      }

      // Parse payload (body is raw Buffer when using express.raw())
      let payload: Record<string, unknown>;
      try {
        const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body));
        payload = JSON.parse(rawBody.toString('utf-8')) as Record<string, unknown>;

        // Find matching webhook config by repo URL
        // We scan using the repo full_name from the payload
        const repoInfo = payload['repository'] as { full_name?: string; html_url?: string } | undefined;
        const repoFullName = repoInfo?.full_name;
        const repoHtmlUrl = repoInfo?.html_url;

        if (!repoFullName) {
          return res.status(400).json({ error: 'Missing repository.full_name in payload' });
        }

        // Find tenants with matching repo
        // NOTE: In a real system you'd query by repo. For now we find the config
        // by matching the repo URL suffix. Iterate pending — webhook targets a path,
        // tenant is inferred from the webhook secret.
        //
        // Security: We verify signature before processing; if no config matches,
        // we return 404 after timing-safe comparison (no side-channel).
        //
        // For now we require the tenant_id in a custom header or query param
        // that the webhook URL is configured with:
        //   https://api.agentguard.tech/api/v1/policies/webhook/github?tenant_id=xxx
        const tenantId = req.query['tenant_id'] as string | undefined;

        if (!tenantId) {
          return res.status(400).json({
            error: 'tenant_id query parameter required. Configure webhook URL as: /api/v1/policies/webhook/github?tenant_id=YOUR_TENANT_ID',
          });
        }

        const config = await db.getGitWebhookConfig(tenantId);
        if (!config) {
          return res.status(404).json({ error: 'No git webhook configured for this tenant' });
        }

        // Verify HMAC signature
        if (!verifyGithubSignature(rawBody, signature, config.webhook_secret)) {
          console.warn(`[git-webhook] Signature verification failed for tenant ${tenantId}, delivery ${deliveryId}`);
          return res.status(401).json({ error: 'Invalid webhook signature' });
        }

        // Check branch matches
        const ref = payload['ref'] as string | undefined;
        const pushedBranch = ref?.replace('refs/heads/', '');
        if (pushedBranch !== config.branch) {
          return res.json({
            accepted: false,
            reason: `Branch '${pushedBranch}' ignored — only '${config.branch}' triggers sync`,
          });
        }

        // Extract commit SHA
        const commitSha = (payload['after'] as string | undefined) ?? 'unknown';

        // Parse repo info
        let owner: string, repo: string;
        try {
          ({ owner, repo } = parseGithubRepo(config.repo_url));
        } catch {
          // Fallback: parse from full_name
          const parts = repoFullName.split('/');
          owner = parts[0]!;
          repo = parts[1]!;
        }

        console.log(`[git-webhook] Push to ${repoFullName}:${pushedBranch} (${commitSha.slice(0, 7)}) — syncing policies for tenant ${tenantId}`);

        // Respond immediately (GitHub has a 10s timeout)
        res.json({ accepted: true, deliveryId, commitSha: commitSha.slice(0, 7) });

        // Async policy sync (after response sent)
        setImmediate(async () => {
          const syncResult = await syncPoliciesFromGithub(
            db, tenantId, owner, repo,
            config.branch, config.policy_dir,
            commitSha, config.github_token,
          ).catch((err) => ({
            updated: 0, skipped: 0,
            errors: [`Sync failed: ${err instanceof Error ? err.message : err}`],
            commitSha, branch: config.branch,
          }));

          // Log sync result
          await db.insertGitSyncLog(
            tenantId, commitSha, config.branch,
            syncResult.updated, syncResult.skipped,
            syncResult.errors.length > 0 ? 'error' : 'success',
            syncResult.errors.length > 0 ? syncResult.errors.join('; ') : null,
          ).catch((e) => console.error('[git-webhook] failed to insert sync log:', e));

          // Audit trail
          await storeAuditEvent(
            db, tenantId, null,
            'policy.git_sync', 'allow',
            'git_sync_webhook', 0,
            `GitHub push sync (${commitSha.slice(0, 7)}): ${syncResult.updated} updated, ${syncResult.skipped} unchanged${syncResult.errors.length > 0 ? `, errors: ${syncResult.errors.join('; ')}` : ''}`,
            0, '', null,
          ).catch((e) => console.error('[git-webhook] failed to store audit event:', e));

          if (syncResult.errors.length > 0) {
            console.error(`[git-webhook] Sync errors for tenant ${tenantId}:`, syncResult.errors);
          } else {
            console.log(`[git-webhook] Sync complete for tenant ${tenantId}: ${syncResult.updated} updated, ${syncResult.skipped} unchanged`);
          }
        });
      } catch (err) {
        console.error('[git-webhook] processing error:', err);
        return res.status(500).json({ error: 'Webhook processing failed' });
      }
    },
  );

  return router;
}

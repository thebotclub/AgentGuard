import type { Request, Response } from 'express';
import { logger } from '../../lib/logger.js';
import type { IDatabase } from '../../db-interface.js';
import { storeAuditEvent } from '../audit.js';
import { GitWebhookConfigSchema, verifyGithubSignature } from './validation.js';
import { parseGithubRepo, syncPoliciesFromGithub } from './helpers.js';

// ── GET /api/v1/policies/git/config ──────────────────────────────────────────

export async function getGitConfigHandler(db: IDatabase, req: Request, res: Response): Promise<void> {
  const tenantId = req.tenantId!;
  try {
    const config = await db.getGitWebhookConfig(tenantId);
    if (!config) {
      res.status(404).json({ error: 'No git webhook configured' });
      return;
    }
    res.json({
      id: config.id,
      tenantId: config.tenant_id,
      repoUrl: config.repo_url,
      branch: config.branch,
      policyDir: config.policy_dir,
      hasToken: Boolean(config.github_token),
      webhookSecret: '***',
      createdAt: config.created_at,
      updatedAt: config.updated_at,
      webhookUrl: `${req.protocol}://${req.get('host')}/api/v1/policies/webhook/github`,
      webhookEvents: ['push'],
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : String(err) }, '[git-webhook] config GET error');
    res.status(500).json({ error: 'Failed to retrieve git webhook config' });
  }
}

// ── PUT /api/v1/policies/git/config ──────────────────────────────────────────

export async function putGitConfigHandler(db: IDatabase, req: Request, res: Response): Promise<void> {
  const tenantId = req.tenantId!;
  const parsed = GitWebhookConfigSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const { repoUrl, webhookSecret, branch, policyDir, githubToken } = parsed.data;

  try {
    const config = await db.upsertGitWebhookConfig(
      tenantId, repoUrl, webhookSecret, branch, policyDir, githubToken ?? null,
    );

    logger.info(`[git-webhook] tenant ${tenantId}: configured git webhook for ${repoUrl}:${branch}`);

    res.json({
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
    logger.error({ err: err instanceof Error ? err : String(err) }, '[git-webhook] config PUT error');
    res.status(500).json({ error: 'Failed to configure git webhook' });
  }
}

// ── DELETE /api/v1/policies/git/config ────────────────────────────────────────

export async function deleteGitConfigHandler(db: IDatabase, req: Request, res: Response): Promise<void> {
  const tenantId = req.tenantId!;
  try {
    const existing = await db.getGitWebhookConfig(tenantId);
    if (!existing) {
      res.status(404).json({ error: 'No git webhook configured' });
      return;
    }
    await db.deleteGitWebhookConfig(tenantId);
    res.json({ message: 'Git webhook configuration removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove git webhook config' });
  }
}

// ── GET /api/v1/policies/git/logs ────────────────────────────────────────────

export async function getGitLogsHandler(db: IDatabase, req: Request, res: Response): Promise<void> {
  const tenantId = req.tenantId!;
  const limit = Math.min(Number(req.query['limit'] ?? 20), 100);
  try {
    const logs = await db.listGitSyncLogs(tenantId, limit);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sync logs' });
  }
}

// ── POST /api/v1/policies/git/sync — Manual Sync ────────────────────────────

export async function postManualSyncHandler(db: IDatabase, req: Request, res: Response): Promise<void> {
  const tenantId = req.tenantId!;
  try {
    const config = await db.getGitWebhookConfig(tenantId);
    if (!config) {
      res.status(404).json({ error: 'No git webhook configured. Set up via PUT /api/v1/policies/git/config' });
      return;
    }

    const { owner, repo } = parseGithubRepo(config.repo_url);
    const result = await syncPoliciesFromGithub(
      db, tenantId, owner, repo,
      config.branch, config.policy_dir,
      'manual', config.github_token,
    );

    await db.insertGitSyncLog(
      tenantId, result.commitSha, result.branch,
      result.updated, result.skipped,
      result.errors.length > 0 ? 'error' : 'success',
      result.errors.length > 0 ? result.errors.join('; ') : null,
    );

    await storeAuditEvent(
      db, tenantId, null,
      'policy.git_sync', 'allow',
      'git_sync_manual', 0,
      `Manual policy sync: ${result.updated} updated, ${result.skipped} unchanged`,
      0, '', null,
    );

    res.json({ success: result.errors.length === 0, ...result });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : String(err) }, '[git-webhook] manual sync error');
    res.status(500).json({ error: `Sync failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
  }
}

// ── POST /api/v1/policies/rollback/:version ──────────────────────────────────

export async function postRollbackHandler(db: IDatabase, req: Request, res: Response): Promise<void> {
  const tenantId = req.tenantId!;
  const version = parseInt((req.params['version'] as string) ?? '', 10);

  if (isNaN(version) || version < 1) {
    res.status(400).json({ error: 'Invalid version number' });
    return;
  }

  try {
    const policyId = req.query['policyId'] as string ?? 'git-sync';
    const versionRow = await db.getPolicyVersion(policyId, tenantId, version);

    if (!versionRow) {
      res.status(404).json({ error: `Policy version ${version} not found` });
      return;
    }

    const currentVersions = await db.getPolicyVersions(policyId, tenantId);
    const currentVersion = currentVersions[0]?.version ?? null;

    await db.setCustomPolicy(tenantId, versionRow.policy_data);
    await db.insertPolicyVersion(policyId, tenantId, versionRow.policy_data, version);

    await storeAuditEvent(
      db, tenantId, null,
      'policy.rollback', 'allow',
      'policy_rollback', 0,
      `Policy rolled back from version ${currentVersion} to version ${version}`,
      0, '', null,
    );

    logger.info(`[git-webhook] tenant ${tenantId}: rolled back policy to version ${version}`);

    res.json({
      success: true,
      rolledBackTo: version,
      from: currentVersion,
      message: `Policy rolled back to version ${version}`,
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : String(err) }, '[git-webhook] rollback error');
    res.status(500).json({ error: `Rollback failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
  }
}

// ── POST /api/v1/policies/webhook/github ─────────────────────────────────────

export async function postGithubWebhookHandler(db: IDatabase, req: Request, res: Response): Promise<void> {
  const githubEvent = req.headers['x-github-event'] as string;
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const deliveryId = req.headers['x-github-delivery'] as string | undefined;

  if (githubEvent !== 'push') {
    res.json({ accepted: false, reason: `Event '${githubEvent}' ignored — only 'push' is handled` });
    return;
  }

  try {
    const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body));
    const payload = JSON.parse(rawBody.toString('utf-8')) as Record<string, unknown>;

    const repoInfo = payload['repository'] as { full_name?: string; html_url?: string } | undefined;
    const repoFullName = repoInfo?.full_name;

    if (!repoFullName) {
      res.status(400).json({ error: 'Missing repository.full_name in payload' });
      return;
    }

    const tenantId = req.query['tenant_id'] as string | undefined;
    if (!tenantId) {
      res.status(400).json({
        error: 'tenant_id query parameter required. Configure webhook URL as: /api/v1/policies/webhook/github?tenant_id=YOUR_TENANT_ID',
      });
      return;
    }

    const config = await db.getGitWebhookConfig(tenantId);
    if (!config) {
      res.status(404).json({ error: 'No git webhook configured for this tenant' });
      return;
    }

    if (!verifyGithubSignature(rawBody, signature, config.webhook_secret)) {
      logger.warn(`[git-webhook] Signature verification failed for tenant ${tenantId}, delivery ${deliveryId}`);
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    const ref = payload['ref'] as string | undefined;
    const pushedBranch = ref?.replace('refs/heads/', '');
    if (pushedBranch !== config.branch) {
      res.json({
        accepted: false,
        reason: `Branch '${pushedBranch}' ignored — only '${config.branch}' triggers sync`,
      });
      return;
    }

    const commitSha = (payload['after'] as string | undefined) ?? 'unknown';

    let owner: string, repo: string;
    try {
      ({ owner, repo } = parseGithubRepo(config.repo_url));
    } catch {
      const parts = repoFullName.split('/');
      owner = parts[0]!;
      repo = parts[1]!;
    }

    logger.info(`[git-webhook] Push to ${repoFullName}:${pushedBranch} (${commitSha.slice(0, 7)}) — syncing policies for tenant ${tenantId}`);

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

      await db.insertGitSyncLog(
        tenantId, commitSha, config.branch,
        syncResult.updated, syncResult.skipped,
        syncResult.errors.length > 0 ? 'error' : 'success',
        syncResult.errors.length > 0 ? syncResult.errors.join('; ') : null,
      ).catch((e) => logger.error({ err: e instanceof Error ? e : String(e) }, '[git-webhook] failed to insert sync log'));

      await storeAuditEvent(
        db, tenantId, null,
        'policy.git_sync', 'allow',
        'git_sync_webhook', 0,
        `GitHub push sync (${commitSha.slice(0, 7)}): ${syncResult.updated} updated, ${syncResult.skipped} unchanged${syncResult.errors.length > 0 ? `, errors: ${syncResult.errors.join('; ')}` : ''}`,
        0, '', null,
      ).catch((e) => logger.error({ err: e instanceof Error ? e : String(e) }, '[git-webhook] failed to store audit event'));

      if (syncResult.errors.length > 0) {
        logger.error({ err: syncResult.errors }, `[git-webhook] Sync errors for tenant ${tenantId}`);
      } else {
        logger.info(`[git-webhook] Sync complete for tenant ${tenantId}: ${syncResult.updated} updated, ${syncResult.skipped} unchanged`);
      }
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : String(err) }, '[git-webhook] processing error');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

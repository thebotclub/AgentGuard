/**
 * Policy Git Webhook — Validation schemas and signature verification.
 */

import crypto from 'node:crypto';
import { z } from 'zod';

export const GitWebhookConfigSchema = z.object({
  repoUrl: z.string().url(),
  webhookSecret: z.string().min(16).max(256),
  branch: z.string().min(1).max(100).default('main'),
  policyDir: z.string().min(1).max(255).default('agentguard/policies'),
  githubToken: z.string().max(256).nullable().optional(),
});

/**
 * Verify GitHub webhook signature (HMAC-SHA256).
 * GitHub sends: X-Hub-Signature-256: sha256=<hex>
 */
export function verifyGithubSignature(
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

/**
 * AgentGuard — Session Management
 *
 * In-memory session store for the playground.
 * Sessions expire after 30 minutes of inactivity.
 * The store is bounded by MAX_SESSIONS to prevent unbounded growth.
 */
import crypto from 'crypto';
import { PolicyEngine } from '../../packages/sdk/src/core/policy-engine.js';
import { GENESIS_HASH } from '../../packages/sdk/src/core/types.js';
import type { IDatabase } from '../db-interface.js';
import type { SessionState } from '../types.js';
import { DEFAULT_POLICY } from './policy-engine-setup.js';

export const MAX_SESSIONS = 1000;
export const MAX_AUDIT_EVENTS = 500;

export const sessions = new Map<string, SessionState>();

// Evict sessions older than 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, s] of sessions) {
    if (s.createdAt < cutoff) sessions.delete(id);
  }
}, 600_000);

/**
 * Get an existing session or create a new one.
 * Also persists the session record to the database.
 */
export async function getOrCreateSession(
  db: IDatabase,
  sessionId?: string,
  tenantId = 'demo',
): Promise<[string, SessionState]> {
  if (sessionId && sessions.has(sessionId)) {
    return [sessionId, sessions.get(sessionId)!];
  }

  if (sessions.size >= MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort(
      (a, b) => a[1].createdAt - b[1].createdAt,
    )[0];
    if (oldest) sessions.delete(oldest[0]);
  }

  const id = sessionId || crypto.randomUUID();
  const engine = new PolicyEngine();
  engine.registerDocument(DEFAULT_POLICY);
  const state: SessionState = {
    engine,
    context: {
      agentId: 'playground-agent',
      sessionId: id,
      policyVersion: '1.0.0',
    },
    auditTrail: [],
    createdAt: Date.now(),
    actionCount: 0,
    lastHash: GENESIS_HASH,
    tenantId,
  };
  sessions.set(id, state);

  // Persist session to DB
  await db.upsertSession(id, tenantId === 'demo' ? null : tenantId);

  return [id, state];
}

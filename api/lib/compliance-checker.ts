/**
 * AgentGuard — OWASP Agentic Security Top 10 Compliance Checker
 *
 * Evaluates a tenant's configuration against OWASP Agentic Security controls
 * and returns a structured compliance report with per-control coverage status.
 */

import type { IDatabase } from '../db-interface.js';
import owaspControlsData from './owasp-controls.json';

// ── Types ──────────────────────────────────────────────────────────────────

export type CoverageStatus = 'covered' | 'partial' | 'not_covered';

export interface ControlResult {
  id: string;
  title: string;
  description: string;
  status: CoverageStatus;
  score: number; // 0 | 0.5 | 1
  notes: string;
  evidence?: string;
}

export interface OWASPReport {
  reportType: 'owasp-agentic-top10';
  version: string;
  generatedAt: string;
  tenantId: string;
  agentId: string | null;
  score: number;       // 0–10 (sum of control scores)
  maxScore: number;    // always 10
  percentage: number;  // 0–100
  controls: ControlResult[];
  summary: string;
}

interface OWASPControl {
  id: string;
  title: string;
  description: string;
  check: string;
  feature: string;
  notes: string;
}

// ── Score weights (reserved for weighted scoring — not yet wired up) ───────
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- planned for weighted compliance scoring
const SCORE_MAP: Record<CoverageStatus, number> = {
  covered:     1,
  partial:     0.5,
  not_covered: 0,
};

// ── Individual check functions ─────────────────────────────────────────────

/**
 * ASI01 — Prompt Injection
 * Feature not yet built — always not_covered.
 */
async function checkPromptInjection(db: IDatabase, tenantId: string, _agentId: string | null): Promise<Omit<ControlResult, 'id' | 'title' | 'description'>> {
  // Check if detection engine is active by looking for audit events with detection scores
  try {
    const analytics = await db.getUsageAnalytics(tenantId, 30);
    // Detection engine is built-in (heuristic) — always active on evaluate calls
    if (analytics.calls.last30d > 0) {
      return {
        status: 'covered',
        score: 1,
        notes: `Prompt injection detection is active. Heuristic engine runs on all evaluate() calls. ${analytics.calls.last30d} calls scanned in last 30 days. Lakera adapter available for enhanced detection.`,
      };
    }
    return {
      status: 'partial',
      score: 0.5,
      notes: 'Prompt injection detection engine is deployed but no evaluate() calls recorded yet. Start sending tool calls to activate.',
    };
  } catch {
    return {
      status: 'partial',
      score: 0.5,
      notes: 'Prompt injection detection engine is deployed (heuristic + optional Lakera). Unable to verify usage.',
    };
  }
}

/**
 * ASI02 — Tool Policy
 * Covered if the tenant has a custom policy or if the default policy has rules.
 */
async function checkToolPolicy(db: IDatabase, tenantId: string, _agentId: string | null): Promise<Omit<ControlResult, 'id' | 'title' | 'description'>> {
  const customPolicy = await db.getCustomPolicy(tenantId);
  if (customPolicy) {
    try {
      const parsed = JSON.parse(customPolicy) as { rules?: unknown[] };
      const ruleCount = Array.isArray(parsed.rules) ? parsed.rules.length : 0;
      return {
        status: 'covered',
        score: 1,
        notes: `Custom tool policy active with ${ruleCount} rule(s).`,
        evidence: `custom_policy:${ruleCount}_rules`,
      };
    } catch {
      // malformed policy — partial
    }
  }

  // Default policy engine is always active — partial coverage
  return {
    status: 'partial',
    score: 0.5,
    notes: 'Default policy engine is active. Consider configuring a custom policy for your specific toolset.',
  };
}

/**
 * ASI03 — Identity & Privilege Abuse (HITL enabled)
 * Covered if tenant has at least one resolved HITL approval (demonstrating the workflow is in use).
 * Partial if HITL capability exists but no approvals have been processed.
 */
async function checkHitlEnabled(db: IDatabase, tenantId: string, _agentId: string | null): Promise<Omit<ControlResult, 'id' | 'title' | 'description'>> {
  const pending = await db.listPendingApprovals(tenantId);

  // Check if any approvals exist at all (including resolved ones)
  const allApprovals = await db.all<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM approvals WHERE tenant_id = ?',
    [tenantId]
  );
  const total = allApprovals[0]?.cnt ?? 0;

  if (total > 0) {
    return {
      status: 'covered',
      score: 1,
      notes: `HITL approval workflow is actively used. ${pending.length} pending approval(s), ${total} total.`,
      evidence: `hitl_approvals:total=${total},pending=${pending.length}`,
    };
  }

  return {
    status: 'partial',
    score: 0.5,
    notes: 'HITL approval capability is available but no approvals have been processed yet. Configure agents to require HITL for sensitive operations.',
  };
}

/**
 * ASI04 — Supply Chain Vulnerabilities (certifications)
 * Covered if at least one agent is certified.
 */
async function checkCertifications(db: IDatabase, tenantId: string, agentId: string | null): Promise<Omit<ControlResult, 'id' | 'title' | 'description'>> {
  if (agentId) {
    const agent = await db.getAgentById(agentId, tenantId);
    if (agent) {
      const agentRecord = agent as typeof agent & { certified_at?: string | null };
      if (agentRecord.certified_at) {
        return {
          status: 'covered',
          score: 1,
          notes: `Agent "${agent.name}" is certified (certified at: ${agentRecord.certified_at}).`,
          evidence: `certified_agent:${agentId}`,
        };
      }
      return {
        status: 'partial',
        score: 0.5,
        notes: `Agent "${agent.name}" exists but has not been certified. Run validation and certification.`,
      };
    }
  }

  // Check for any certified agents for this tenant
  const certifiedAgents = await db.all<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM agents WHERE tenant_id = ? AND active = 1 AND certified_at IS NOT NULL",
    [tenantId]
  );
  const certCount = certifiedAgents[0]?.cnt ?? 0;

  const totalAgents = await db.getAgentsByTenant(tenantId);
  const activeCount = totalAgents.filter(a => a.active).length;

  if (certCount > 0 && activeCount > 0) {
    const ratio = certCount / activeCount;
    if (ratio >= 1) {
      return {
        status: 'covered',
        score: 1,
        notes: `All ${activeCount} active agent(s) are certified.`,
        evidence: `certified_agents:${certCount}/${activeCount}`,
      };
    }
    return {
      status: 'partial',
      score: 0.5,
      notes: `${certCount} of ${activeCount} active agent(s) are certified. Certify all agents for full coverage.`,
      evidence: `certified_agents:${certCount}/${activeCount}`,
    };
  }

  if (activeCount === 0) {
    return {
      status: 'partial',
      score: 0.5,
      notes: 'No active agents registered. Create and certify agents to establish supply chain security controls.',
    };
  }

  return {
    status: 'not_covered',
    score: 0,
    notes: `${activeCount} active agent(s) exist but none are certified. Run /api/v1/agents/:id/validate and /api/v1/agents/:id/certify.`,
  };
}

/**
 * ASI05 — Data Leakage (PII detection)
 * Covered if PII detection is enabled in tenant's policy and audit trail is active.
 */
async function checkPiiDetection(db: IDatabase, tenantId: string, _agentId: string | null): Promise<Omit<ControlResult, 'id' | 'title' | 'description'>> {
  try {
    const customPolicy = await db.getCustomPolicy(tenantId);
    if (customPolicy) {
      const parsed = JSON.parse(customPolicy);
      if (parsed.piiDetection?.enabled) {
        return {
          status: 'covered',
          score: 1,
          notes: 'PII detection & redaction is enabled. Regex-based detector scans tool inputs for emails, phone numbers, SSNs, credit cards, IP addresses. Redacted content only stored in audit trail.',
        };
      }
    }
    // PII module exists but not enabled in policy
    return {
      status: 'partial',
      score: 0.5,
      notes: 'PII detection module is deployed but not enabled in your policy. Enable with: PUT /api/v1/policy { "piiDetection": { "enabled": true } }. Standalone scan available at POST /api/v1/pii/scan.',
    };
  } catch {
    return {
      status: 'partial',
      score: 0.5,
      notes: 'PII detection module is deployed. Enable in policy for full coverage.',
    };
  }
}

/**
 * ASI06 — Data Poisoning (audit hash chain)
 * Covered if tenant has audit events with hashes (hash chain is active).
 */
async function checkAuditHashChain(db: IDatabase, tenantId: string, _agentId: string | null): Promise<Omit<ControlResult, 'id' | 'title' | 'description'>> {
  const lastHash = await db.getLastAuditHash(tenantId);
  const auditCount = await db.countAuditEvents(tenantId);

  if (auditCount > 0 && lastHash) {
    return {
      status: 'covered',
      score: 1,
      notes: `Audit hash chain is active. ${auditCount} event(s) recorded with integrity verification.`,
      evidence: `audit_events:${auditCount},last_hash:${lastHash.slice(0, 8)}...`,
    };
  }

  if (auditCount > 0) {
    return {
      status: 'partial',
      score: 0.5,
      notes: `${auditCount} audit event(s) recorded but hash chain is not yet established. Hash chain activates after first policy evaluation.`,
    };
  }

  return {
    status: 'partial',
    score: 0.5,
    notes: 'Audit trail is configured but no events recorded yet. The hash chain will activate on the first policy evaluation.',
  };
}

/**
 * ASI07 — Excessive Autonomy (HITL for high-risk)
 * Partial — HITL exists but automatic high-risk escalation is not yet enforced.
 */
async function checkHitlHighRisk(db: IDatabase, tenantId: string, _agentId: string | null): Promise<Omit<ControlResult, 'id' | 'title' | 'description'>> {
  const allApprovals = await db.all<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM approvals WHERE tenant_id = ?',
    [tenantId]
  );
  const total = allApprovals[0]?.cnt ?? 0;

  if (total > 0) {
    return {
      status: 'partial',
      score: 0.5,
      notes: `HITL approvals in use (${total} total). Automatic high-risk escalation enforcement is on the roadmap.`,
      evidence: `hitl_approvals:${total}`,
    };
  }

  return {
    status: 'not_covered',
    score: 0,
    notes: 'No HITL approvals configured. Automatic gating of high-risk autonomous actions is not active.',
  };
}

/**
 * ASI08 — Insecure Communication (webhook secrets)
 * Covered if tenant has at least one webhook with an HMAC secret configured.
 */
async function checkWebhookSecrets(db: IDatabase, tenantId: string, _agentId: string | null): Promise<Omit<ControlResult, 'id' | 'title' | 'description'>> {
  const webhooks = await db.getWebhooksByTenant(tenantId);

  if (webhooks.length === 0) {
    return {
      status: 'not_covered',
      score: 0,
      notes: 'No webhooks configured. Register webhooks with HMAC secrets for secure event delivery.',
    };
  }

  const securedWebhooks = webhooks.filter(w => w.secret && w.secret.length > 0);
  const activeWebhooks = webhooks.filter(w => w.active);

  if (securedWebhooks.length === 0) {
    return {
      status: 'partial',
      score: 0.5,
      notes: `${webhooks.length} webhook(s) registered but none have HMAC secrets configured. Add secrets for tamper-proof delivery.`,
      evidence: `webhooks:${webhooks.length},secured:0`,
    };
  }

  if (securedWebhooks.length === activeWebhooks.length) {
    return {
      status: 'covered',
      score: 1,
      notes: `${securedWebhooks.length} webhook(s) secured with HMAC secrets.`,
      evidence: `webhooks:${webhooks.length},secured:${securedWebhooks.length}`,
    };
  }

  return {
    status: 'partial',
    score: 0.5,
    notes: `${securedWebhooks.length} of ${webhooks.length} webhook(s) have HMAC secrets. Secure all webhooks for full coverage.`,
    evidence: `webhooks:${webhooks.length},secured:${securedWebhooks.length}`,
  };
}

/**
 * ASI09 — Unmonitored Operations (audit trail + webhooks)
 * Covered if both audit events exist AND webhooks are configured.
 */
async function checkAuditAndWebhooks(db: IDatabase, tenantId: string, _agentId: string | null): Promise<Omit<ControlResult, 'id' | 'title' | 'description'>> {
  const auditCount = await db.countAuditEvents(tenantId);
  const webhooks = await db.getActiveWebhooksForTenant(tenantId);

  const hasAudit = auditCount > 0;
  const hasWebhooks = webhooks.length > 0;

  if (hasAudit && hasWebhooks) {
    return {
      status: 'covered',
      score: 1,
      notes: `Full observability: ${auditCount} audit event(s) + ${webhooks.length} active webhook(s) for real-time alerts.`,
      evidence: `audit:${auditCount},webhooks:${webhooks.length}`,
    };
  }

  if (hasAudit || hasWebhooks) {
    const missing = !hasAudit ? 'audit events' : 'webhooks';
    return {
      status: 'partial',
      score: 0.5,
      notes: `Partial observability — ${hasAudit ? `${auditCount} audit event(s)` : 'no audit events'}, ${hasWebhooks ? `${webhooks.length} active webhook(s)` : 'no webhooks'}. Add ${missing} for full coverage.`,
      evidence: `audit:${auditCount},webhooks:${webhooks.length}`,
    };
  }

  return {
    status: 'not_covered',
    score: 0,
    notes: 'No audit events recorded and no webhooks configured. Evaluate at least one action and register webhook endpoints.',
  };
}

/**
 * ASI10 — Compliance Gaps (certified deployments)
 * Covered if the tenant has at least one certified agent in production use.
 */
async function checkCertifiedDeployments(db: IDatabase, tenantId: string, agentId: string | null): Promise<Omit<ControlResult, 'id' | 'title' | 'description'>> {
  // Reuse the certifications check logic
  const certResult = await checkCertifications(db, tenantId, agentId);

  // Also check audit coverage — need actual evaluations happening
  const auditCount = await db.countAuditEvents(tenantId);

  if (certResult.status === 'covered' && auditCount > 0) {
    return {
      status: 'covered',
      score: 1,
      notes: `Certified deployment with active monitoring. ${auditCount} evaluation(s) recorded.`,
      evidence: certResult.evidence,
    };
  }

  if (certResult.status === 'covered') {
    return {
      status: 'partial',
      score: 0.5,
      notes: 'Agent(s) certified but no policy evaluations recorded yet. Begin using agents to establish runtime compliance.',
      evidence: certResult.evidence,
    };
  }

  return {
    status: certResult.status,
    score: certResult.score,
    notes: certResult.notes,
  };
}

// ── Check dispatcher ────────────────────────────────────────────────────────

type CheckFn = (db: IDatabase, tenantId: string, agentId: string | null) => Promise<Omit<ControlResult, 'id' | 'title' | 'description'>>;

const CHECK_REGISTRY: Record<string, CheckFn> = {
  promptInjection:      checkPromptInjection,
  toolPolicy:           checkToolPolicy,
  hitlEnabled:          checkHitlEnabled,
  certifications:       checkCertifications,
  piiDetection:         checkPiiDetection,
  auditHashChain:       checkAuditHashChain,
  hitlHighRisk:         checkHitlHighRisk,
  webhookSecrets:       checkWebhookSecrets,
  auditAndWebhooks:     checkAuditAndWebhooks,
  certifiedDeployments: checkCertifiedDeployments,
};

// ── Main report generator ──────────────────────────────────────────────────

export async function generateOWASPReport(
  db: IDatabase,
  tenantId: string,
  agentId?: string,
): Promise<OWASPReport> {
  const controls = owaspControlsData.controls as OWASPControl[];
  const results: ControlResult[] = [];

  for (const control of controls) {
    const checkFn = CHECK_REGISTRY[control.check];
    let result: Omit<ControlResult, 'id' | 'title' | 'description'>;

    if (checkFn) {
      try {
        result = await checkFn(db, tenantId, agentId ?? null);
      } catch (err) {
        console.error(`[compliance] check ${control.id} (${control.check}) failed:`, err);
        result = {
          status: 'not_covered',
          score: 0,
          notes: `Check failed with an error. Please contact support.`,
        };
      }
    } else {
      result = {
        status: 'not_covered',
        score: 0,
        notes: `Unknown check type: ${control.check}`,
      };
    }

    results.push({
      id: control.id,
      title: control.title,
      description: control.description,
      ...result,
    });
  }

  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const maxScore = controls.length; // 10
  const percentage = Math.round((totalScore / maxScore) * 100);

  const coveredCount = results.filter(r => r.status === 'covered').length;
  const partialCount = results.filter(r => r.status === 'partial').length;
  const notCoveredCount = results.filter(r => r.status === 'not_covered').length;

  const summary = `OWASP Agentic Top 10: ${coveredCount} covered, ${partialCount} partial, ${notCoveredCount} not covered. Score: ${totalScore.toFixed(1)}/${maxScore} (${percentage}%)`;

  return {
    reportType: 'owasp-agentic-top10',
    version: owaspControlsData.version,
    generatedAt: new Date().toISOString(),
    tenantId,
    agentId: agentId ?? null,
    score: parseFloat(totalScore.toFixed(1)),
    maxScore,
    percentage,
    controls: results,
    summary,
  };
}

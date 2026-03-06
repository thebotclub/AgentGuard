/**
 * AgentGuard — License Key Types
 *
 * Defines the LicensePayload structure embedded in AGKEY-* tokens,
 * LicenseContext for runtime use, and LicenseFeature flags.
 *
 * Format: AGKEY-<base64url(header)>.<base64url(payload)>.<base64url(sig)>
 * Signing: Ed25519 (Node.js built-in crypto, no external deps)
 */

// ── Tier ──────────────────────────────────────────────────────────────────────

export type LicenseTier = 'free' | 'pro' | 'enterprise';

// ── Feature flags (named capabilities gated by tier) ─────────────────────────

export type LicenseFeature =
  | 'siem_export'       // Splunk/Sentinel integration
  | 'sso'               // SSO/SAML
  | 'a2a_governance'    // Multi-agent hierarchy governance
  | 'ml_anomaly'        // ML anomaly detection
  | 'custom_retention'  // >30 day audit retention
  | 'priority_support'
  | 'air_gap';          // Air-gapped deployment support

// ── Raw payload (inside the signed JWT) ──────────────────────────────────────

export interface LicensePayload {
  /** Key ID — for signing key rotation */
  kid: string;
  /** Tenant ID — links to billing system */
  tid: string;
  /** License tier */
  tier: LicenseTier;
  /** Enabled feature flags */
  features: string[];
  /** Resource limits */
  limits: {
    /** Monthly evaluation events: 25000 free, 500000 pro, -1 unlimited */
    eventsPerMonth: number;
    /** Max agent seats: 5 free, 100 pro, -1 unlimited */
    agentsMax: number;
    /** Audit retention days: 30 free, 365 pro, 2555 enterprise */
    retentionDays: number;
    /** Concurrent HITL gates: 3 free, -1 unlimited pro */
    hitlConcurrent: number;
  };
  /** Grace period for offline use (days): 1 free, 7 pro, 30 enterprise */
  offlineGraceDays: number;
  /** Issued-at (epoch seconds) */
  iat: number;
  /** Expiry (epoch seconds) */
  exp: number;
  /** Issuer — must be 'agentguard.tech' */
  iss: string;
}

// ── Runtime context (derived from validated payload) ─────────────────────────

export interface LicenseContext {
  /** Whether a valid (non-expired) license is active */
  valid: boolean;
  /** License tier */
  tier: LicenseTier;
  /** Tenant ID */
  tenantId: string;
  /** Features available on this license */
  features: Set<string>;
  /** Resource limits */
  limits: {
    eventsPerMonth: number;
    agentsMax: number;
    retentionDays: number;
    hitlConcurrent: number;
  };
  /** Offline grace days */
  offlineGraceDays: number;
  /** Expiry date */
  expiresAt: Date | null;
  /** Source of the context */
  source: 'key' | 'cache' | 'free_default';
  /** When the license was last validated */
  validatedAt: Date;
}

// ── Free-tier defaults ────────────────────────────────────────────────────────

export const FREE_TIER_DEFAULTS: Omit<LicenseContext, 'validatedAt'> = {
  valid: false,
  tier: 'free',
  tenantId: 'default',
  features: new Set<string>(),
  limits: {
    eventsPerMonth: 25_000,
    agentsMax: 5,
    retentionDays: 30,
    hitlConcurrent: 3,
  },
  offlineGraceDays: 1,
  expiresAt: null,
  source: 'free_default',
};

// ── Tier limit presets ────────────────────────────────────────────────────────

export const TIER_LIMITS: Record<LicenseTier, LicensePayload['limits']> = {
  free: {
    eventsPerMonth: 25_000,
    agentsMax: 5,
    retentionDays: 30,
    hitlConcurrent: 3,
  },
  pro: {
    eventsPerMonth: 500_000,
    agentsMax: 100,
    retentionDays: 365,
    hitlConcurrent: -1, // unlimited
  },
  enterprise: {
    eventsPerMonth: -1, // unlimited
    agentsMax: -1,      // unlimited
    retentionDays: 2555, // ~7 years
    hitlConcurrent: -1, // unlimited
  },
};

// ── Feature sets per tier ─────────────────────────────────────────────────────

export const TIER_FEATURES: Record<LicenseTier, LicenseFeature[]> = {
  free: [],
  pro: ['siem_export', 'ml_anomaly', 'custom_retention', 'priority_support'],
  enterprise: ['siem_export', 'sso', 'a2a_governance', 'ml_anomaly', 'custom_retention', 'priority_support', 'air_gap'],
};

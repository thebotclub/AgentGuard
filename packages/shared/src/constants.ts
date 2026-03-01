/**
 * AgentGuard — Shared Constants
 * Used across api, sdk, and dashboard packages.
 */

/** First event in an audit chain has no predecessor — uses this genesis hash. */
export const GENESIS_HASH = '0'.repeat(64);

/** Risk score thresholds per POLICY_ENGINE.md §4.4 */
export const RISK_TIERS = {
  LOW: { min: 0, max: 99 },
  MEDIUM: { min: 100, max: 299 },
  HIGH: { min: 300, max: 599 },
  CRITICAL: { min: 600, max: 1000 },
} as const;

export type RiskTierLabel = keyof typeof RISK_TIERS;

export function getRiskTier(score: number): RiskTierLabel {
  if (score >= RISK_TIERS.CRITICAL.min) return 'CRITICAL';
  if (score >= RISK_TIERS.HIGH.min) return 'HIGH';
  if (score >= RISK_TIERS.MEDIUM.min) return 'MEDIUM';
  return 'LOW';
}

/** Base risk scores per policy decision (POLICY_ENGINE.md §4.4) */
export const BASE_RISK_SCORES = {
  allow: 0,
  monitor: 10,
  block: 50,
  require_approval: 40,
} as const;

/** API key prefix for agent keys */
export const API_KEY_PREFIX = 'ag_live_';

/** API key prefix for test/dev keys */
export const API_KEY_TEST_PREFIX = 'ag_test_';

/** Pagination defaults */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

/** Policy bundle cache TTL in seconds */
export const POLICY_BUNDLE_TTL_SECONDS = 60;

/** Kill switch Redis key TTL (24h) */
export const KILL_SWITCH_TTL_SECONDS = 86_400;

/** SDK telemetry flush interval */
export const TELEMETRY_FLUSH_INTERVAL_MS = 5_000;
export const TELEMETRY_FLUSH_BATCH_SIZE = 100;

/** HITL gate default timeout */
export const HITL_DEFAULT_TIMEOUT_SEC = 300;

/**
 * AgentGuard — Shared Constants
 * Used across api, sdk, and dashboard packages.
 */
/** First event in an audit chain has no predecessor — uses this genesis hash. */
export declare const GENESIS_HASH: string;
/** Risk score thresholds per POLICY_ENGINE.md §4.4 */
export declare const RISK_TIERS: {
    readonly LOW: {
        readonly min: 0;
        readonly max: 99;
    };
    readonly MEDIUM: {
        readonly min: 100;
        readonly max: 299;
    };
    readonly HIGH: {
        readonly min: 300;
        readonly max: 599;
    };
    readonly CRITICAL: {
        readonly min: 600;
        readonly max: 1000;
    };
};
export type RiskTierLabel = keyof typeof RISK_TIERS;
export declare function getRiskTier(score: number): RiskTierLabel;
/** Base risk scores per policy decision (POLICY_ENGINE.md §4.4) */
export declare const BASE_RISK_SCORES: {
    readonly allow: 0;
    readonly monitor: 10;
    readonly block: 50;
    readonly require_approval: 40;
};
/** API key prefix for agent keys */
export declare const API_KEY_PREFIX = "ag_live_";
/** API key prefix for test/dev keys */
export declare const API_KEY_TEST_PREFIX = "ag_test_";
/** Pagination defaults */
export declare const DEFAULT_PAGE_SIZE = 50;
export declare const MAX_PAGE_SIZE = 500;
/** Policy bundle cache TTL in seconds */
export declare const POLICY_BUNDLE_TTL_SECONDS = 60;
/** Kill switch Redis key TTL (24h) */
export declare const KILL_SWITCH_TTL_SECONDS = 86400;
/** SDK telemetry flush interval */
export declare const TELEMETRY_FLUSH_INTERVAL_MS = 5000;
export declare const TELEMETRY_FLUSH_BATCH_SIZE = 100;
/** HITL gate default timeout */
export declare const HITL_DEFAULT_TIMEOUT_SEC = 300;
//# sourceMappingURL=constants.d.ts.map
/**
 * Redis client singleton using ioredis.
 * Used for: kill switch flags, HITL gate state, policy bundle cache, rate limits.
 */
import Redis from 'ioredis';
export declare const redis: Redis;
export declare const RedisKeys: {
    readonly killSwitch: (tenantId: string, agentId: string) => string;
    readonly policyBundle: (tenantId: string, agentId: string) => string;
    readonly hitlGate: (gateId: string) => string;
    readonly rateLimit: (tenantId: string, key: string) => string;
};
export type { Redis };
//# sourceMappingURL=redis.d.ts.map
# AgentGuard Chaos Testing Framework

> Proving resilience under failure conditions for SOC 2 availability and security requirements.

## Overview

The chaos testing framework validates AgentGuard's behavior under adverse conditions. Each scenario follows the pattern: **setup → inject fault → verify behavior → cleanup**.

All scenarios live in `tests/chaos/` and can be run individually or as a full suite.

## Quick Start

```bash
# Run the full suite
npx tsx tests/chaos/run-all.ts

# Run against a specific environment
API_URL=https://staging.agentguard.dev npx tsx tests/chaos/run-all.ts

# Run a single scenario
npx tsx tests/chaos/scenario-01-redis-down.ts
```

Results are written to `reports/chaos-results-<timestamp>.json`.

## Scenarios

### Scenario 1: Redis Down Mid-Stream
**File:** `tests/chaos/scenario-01-redis-down.ts`  
**Risk Level:** CRITICAL  
**Verifies:** Fail-closed behavior when Redis becomes unavailable

**Behavior Under Test:**
- Kill switch lookups must default to BLOCKED (not ALLOWED) when Redis is unreachable
- Policy cache misses must fall back to PostgreSQL, not open-circuit to ALLOW
- Health endpoint must reflect `degraded` status

**Expected Outcome:** All action evaluations return BLOCK or 503, never ALLOW, when Redis is down.

**Fault Injection:**
```bash
docker compose stop redis
# API should block all agent actions
docker compose start redis
# API should recover automatically within 30s
```

---

### Scenario 2: PostgreSQL Connection Pool Exhaustion
**File:** `tests/chaos/scenario-02-pg-exhaustion.ts`  
**Risk Level:** HIGH  
**Verifies:** Graceful degradation when DB connection pool is saturated

**Behavior Under Test:**
- New requests receive 503 (not 500 panic) under pool pressure
- Health endpoint remains responsive
- System recovers when request load drops

**Expected Outcome:** Degraded responses are 503 with Retry-After, health endpoint stays live, recovery is automatic.

**Fault Injection:**
Fires 50 concurrent long-running audit queries to exhaust the pool (typically 10-20 connections).

---

### Scenario 3: High-Latency Policy Evaluation (500ms+)
**File:** `tests/chaos/scenario-03-policy-latency.ts`  
**Risk Level:** HIGH  
**Verifies:** Timeout handling with fail-closed default

**Behavior Under Test:**
- Policy evaluation must have an explicit timeout (500ms threshold)
- Timed-out evaluations must return BLOCK with `TIMEOUT_EXCEEDED` reason
- System must not hang on slow evaluations
- p99 latency SLA: <200ms under normal load

**Expected Outcome:** All requests complete within 10s; timed-out evaluations default to BLOCK.

**Fault Injection:**
Fires 100 concurrent policy evaluations to induce latency via resource contention.

---

### Scenario 4: Concurrent Kill-Switch Activation
**File:** `tests/chaos/scenario-04-concurrent-killswitch.ts`  
**Risk Level:** HIGH  
**Verifies:** Race condition handling in kill switch state management

**Behavior Under Test:**
- Concurrent kill + resume operations produce deterministic final state
- No partial writes leave agent in indeterminate state
- Audit log captures all concurrent operations

**Expected Outcome:** Final agent state is always either cleanly KILLED or cleanly ACTIVE.

**Fault Injection:**
Fires 20 concurrent alternating kill/resume commands for the same agent.

---

### Scenario 5: SCIM Token Rotation During Active Sync
**File:** `tests/chaos/scenario-05-scim-token-rotation.ts`  
**Risk Level:** MEDIUM  
**Verifies:** No provisioning gaps during SCIM token rotation

**Behavior Under Test:**
- In-flight SCIM provisioning requests complete before old token expires
- New token activates without dropping provisioned users
- IdP retry logic with new token fills any gaps

**Expected Outcome:** ≥80% of users provisioned without gaps; retry with new token fills remainder.

**Notes:** Requires Enterprise tier with SCIM enabled. Marked as N/A in Basic/Pro tiers.

---

### Scenario 6: SSE Reconnect After Server Restart
**File:** `tests/chaos/scenario-06-sse-reconnect.ts`  
**Risk Level:** MEDIUM  
**Verifies:** Event replay on SSE reconnect with Last-Event-ID

**Behavior Under Test:**
- SSE client reconnects after server restart without manual intervention
- Events missed during downtime are replayed using Last-Event-ID
- Kill-switch events are never missed during reconnect window

**Expected Outcome:** Client receives all events after reconnect; no event gaps.

---

## Running Results

### Test Infrastructure Requirements

| Scenario | Requires Docker Compose | Requires DB | Requires Redis |
|----------|------------------------|-------------|----------------|
| 1 (Redis down) | Optional (graceful skip) | Yes | Yes |
| 2 (PG pool) | No | Yes | No |
| 3 (Latency) | No | Yes | No |
| 4 (Kill switch race) | No | Yes | Yes |
| 5 (SCIM rotation) | No | Yes | Yes |
| 6 (SSE reconnect) | Optional | Yes | Optional |

Without Docker Compose, fault injection scenarios that require `docker compose stop` will skip the actual container disruption and test the API's internal behavior instead.

### CI/CD Integration

```yaml
# .github/workflows/chaos.yml
chaos-tests:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:16
    redis:
      image: redis:7
  steps:
    - uses: actions/checkout@v4
    - run: npm install
    - run: docker compose up -d
    - run: npx tsx tests/chaos/run-all.ts
  artifacts:
    - reports/chaos-results-*.json
```

### Interpreting Results

Exit code `0` = all scenarios passed.  
Exit code `1` = one or more scenarios failed.

JSON report format:
```json
{
  "runAt": "2026-03-22T00:00:00Z",
  "apiUrl": "http://localhost:3001",
  "results": [...],
  "summary": {
    "total": 6,
    "passed": 5,
    "failed": 1,
    "passRate": "83%"
  }
}
```

---

## Recommendations

### Critical (Fix Before Production)
- [ ] Implement explicit fail-closed in Redis unavailability — return BLOCK not ALLOW
- [ ] Add per-evaluation timeout (500ms) that returns `BLOCK` with `TIMEOUT_EXCEEDED`
- [ ] Use `Redis.SET NX/XX` for atomic kill-switch operations

### High Priority
- [ ] Set `pool_max` in `DATABASE_URL` to match container memory (default 10 is often too low)
- [ ] Add connection pool monitoring with Prometheus `pg_stat_activity` alerts
- [ ] Implement Redis Streams (`XADD`/`XREAD`) for SSE event replay with Last-Event-ID

### Medium Priority  
- [ ] Implement 30-second grace period for old SCIM tokens after rotation
- [ ] Add exponential backoff in SSE client SDK (2s → 4s → 8s)
- [ ] Document last-writer-wins semantics in kill-switch operator runbook

### Performance
- [ ] Cache compiled policy bundles in Redis for sub-millisecond hot path
- [ ] Use DB read replicas for policy evaluation queries
- [ ] Implement request queuing with max-wait to avoid 503 storms

---

## Adding New Scenarios

```typescript
// tests/chaos/scenario-07-my-scenario.ts
import { recordResult, type ChaosResult } from './helpers.js';

export async function runScenario07(): Promise<ChaosResult> {
  const start = Date.now();
  // 1. Setup
  // 2. Inject fault
  // 3. Verify behavior
  // 4. Cleanup
  const result: ChaosResult = {
    scenario: 'My Scenario',
    passed: true,
    behavior: 'Description of observed behavior',
    details: JSON.stringify({}),
    durationMs: Date.now() - start,
    recommendations: ['...'],
  };
  recordResult(result);
  return result;
}
```

Register in `run-all.ts` to include in the full suite.

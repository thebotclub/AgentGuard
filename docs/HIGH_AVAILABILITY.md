# AgentGuard High Availability Guide

This document describes how to run AgentGuard in a high-availability (HA) configuration suitable for production workloads. It covers multi-instance API deployment, PostgreSQL HA, Redis Sentinel, health probe endpoints, graceful shutdown, and zero-downtime deployment strategies.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Multi-Instance API Deployment](#multi-instance-api-deployment)
3. [PostgreSQL High Availability](#postgresql-high-availability)
4. [Redis High Availability (Sentinel)](#redis-high-availability-sentinel)
5. [Health Probes](#health-probes)
6. [Graceful Shutdown](#graceful-shutdown)
7. [Zero-Downtime Deployments](#zero-downtime-deployments)
8. [Configuration Reference](#configuration-reference)

---

## Architecture Overview

```
                      ┌──────────────────────────────────────┐
                      │            Load Balancer              │
                      │     (nginx / ALB / Traefik / k8s)    │
                      └──────────┬───────────────────────────┘
                                 │  (round-robin, no sticky sessions)
              ┌──────────────────┼────────────────────┐
              │                  │                     │
     ┌────────▼───────┐ ┌────────▼───────┐ ┌──────────▼──────┐
     │  API Instance 1 │ │  API Instance 2 │ │  API Instance N  │
     │   (Node.js)     │ │   (Node.js)     │ │   (Node.js)      │
     └────────┬────────┘ └────────┬────────┘ └──────────┬───────┘
              │                   │                      │
              └───────────────────┼──────────────────────┘
                                  │
           ┌──────────────────────┼──────────────────────┐
           │                      │                       │
  ┌────────▼────────┐   ┌─────────▼─────────┐   ┌────────▼────────┐
  │   PostgreSQL     │   │   Redis Sentinel    │   │  Redis Sentinel  │
  │  Primary (RW)    │   │   (primary HA)      │   │   (replica)      │
  └─────────────────┘   └────────────────────┘   └─────────────────┘
         │
  ┌──────▼──────────┐
  │  PG Replica (RO)│
  │  (streaming rep) │
  └─────────────────┘
```

**Key design decisions:**
- **No sticky sessions required** — All API state is stored in PostgreSQL + Redis. SSE (Server-Sent Events) uses Redis Pub/Sub so any instance can serve any client's event stream.
- **Redis is used for:** rate limiting, brute-force counters, SSE Pub/Sub, and webhook delivery queues.
- **PostgreSQL is the source of truth** for audit events, tenant data, policies, and webhooks.

---

## Multi-Instance API Deployment

### Load Balancer Configuration

AgentGuard API is stateless at the application layer. Any load balancing strategy works:

```nginx
# nginx upstream example
upstream agentguard_api {
  least_conn;                    # or round-robin (default)
  server api-1:3000;
  server api-2:3000;
  server api-3:3000;
  keepalive 32;                  # reuse connections
}

server {
  listen 443 ssl;
  server_name api.agentguard.example.com;

  location / {
    proxy_pass http://agentguard_api;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Request-ID $request_id;
    proxy_read_timeout 60s;      # SSE connections — increase to 120s if needed
    proxy_buffering off;         # Required for SSE
  }
}
```

### Environment Variables (per instance)

```bash
# Database
DB_TYPE=postgres
DATABASE_URL=postgresql://agentguard:${PASSWORD}@pg-primary:5432/agentguard

# Redis (standalone)
REDIS_URL=redis://:${REDIS_PASSWORD}@redis-master:6379/0

# Redis (Sentinel — use instead of REDIS_URL for HA)
REDIS_SENTINELS=sentinel1:26379,sentinel2:26379,sentinel3:26379
REDIS_SENTINEL_NAME=mymaster
REDIS_PASSWORD=${REDIS_PASSWORD}

# App
PORT=3000
NODE_ENV=production
LOG_LEVEL=info
ADMIN_KEY=${ADMIN_KEY}
```

### Why No Sticky Sessions?

SSE real-time event streams are backed by Redis Pub/Sub (Wave 2). When an event occurs on any instance, it publishes to Redis; all instances with subscribed SSE clients deliver the event. This means:

- Any load balancer node can handle any SSE client.
- Rolling deployments drain connections naturally — clients reconnect to a different instance.
- No session affinity configuration needed at the load balancer.

---

## PostgreSQL High Availability

### Option A: Streaming Replication (Self-Hosted)

**Primary + replica setup:**

```sql
-- On primary: postgresql.conf
wal_level = replica
max_wal_senders = 3
wal_keep_size = 512MB
synchronous_commit = on

-- pg_hba.conf (primary)
host replication replicator ${REPLICA_IP}/32 md5
```

```bash
# On replica: initial basebackup
pg_basebackup -h ${PRIMARY_HOST} -U replicator -D /var/lib/postgresql/data -P -Xs -R
```

AgentGuard connects to the primary for all reads and writes. Point `DATABASE_URL` at the primary.

For read replicas, future versions will support a `DATABASE_URL_READ` env var for read-only queries (analytics, audit export).

**Automatic failover with Patroni:**

```yaml
# patroni.yml (simplified)
name: pg-primary
scope: agentguard-cluster
restapi:
  listen: 0.0.0.0:8008
  connect_address: ${HOST}:8008
etcd3:
  hosts: etcd1:2379,etcd2:2379,etcd3:2379
bootstrap:
  dcs:
    ttl: 30
    loop_wait: 10
    retry_timeout: 10
    maximum_lag_on_failover: 1048576  # 1MB
postgresql:
  listen: 0.0.0.0:5432
  connect_address: ${HOST}:5432
  data_dir: /var/lib/postgresql/data
```

With Patroni, automatic failover completes in ~10–30s. During failover, AgentGuard instances with `retryStrategy` configured (pg pool) will retry and reconnect.

### Option B: Managed PostgreSQL (Recommended for Production)

| Provider | Service | Notes |
|----------|---------|-------|
| AWS | RDS PostgreSQL / Aurora | Multi-AZ, automatic failover |
| GCP | Cloud SQL for PostgreSQL | HA config, point-in-time recovery |
| Azure | Azure Database for PostgreSQL | Zone-redundant HA |
| Supabase | Supabase Postgres | Built-in replication |

**Example with AWS RDS:**
```bash
DATABASE_URL=postgresql://agentguard:${PASSWORD}@agentguard.cluster-xyz.us-east-1.rds.amazonaws.com:5432/agentguard?sslmode=require
```

Set `retryStrategy` in the connection pool:
- Max retries: 5
- Retry delay: exponential backoff, 100ms–5s
- Connection pool size: 5–20 (tune per instance count)

### Connection Pooling

For N API instances, ensure the connection pool doesn't overwhelm PostgreSQL:
```
max_connections (postgres) ≥ N_instances × pool_size_per_instance + 10 (admin headroom)
```

Recommended: Use **PgBouncer** in transaction mode between API and PostgreSQL:
```bash
# PgBouncer DATABASE_URL
DATABASE_URL=postgresql://agentguard:${PASSWORD}@pgbouncer:5432/agentguard
```

---

## Redis High Availability (Sentinel)

### Redis Sentinel Setup

Sentinel provides automatic master election and client redirection when the master fails.

**Minimum recommended topology:** 1 master + 2 replicas + 3 Sentinel processes.

```
[Sentinel 1] [Sentinel 2] [Sentinel 3]
      │              │              │
      └──────────────┼──────────────┘
                     │
             [Redis Master] ──── [Redis Replica 1]
                                      │
                               [Redis Replica 2]
```

**redis.conf (master):**
```
bind 0.0.0.0
protected-mode no
requirepass ${REDIS_PASSWORD}
```

**redis.conf (replica):**
```
bind 0.0.0.0
replicaof ${MASTER_HOST} 6379
requirepass ${REDIS_PASSWORD}
masterauth ${REDIS_PASSWORD}
```

**sentinel.conf:**
```
bind 0.0.0.0
port 26379
sentinel monitor mymaster ${MASTER_HOST} 6379 2
sentinel auth-pass mymaster ${REDIS_PASSWORD}
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 60000
sentinel parallel-syncs mymaster 1
```

### AgentGuard Sentinel Configuration

Set these environment variables on each API instance:

```bash
# Use sentinel instead of REDIS_URL for HA
REDIS_SENTINELS=sentinel1:26379,sentinel2:26379,sentinel3:26379
REDIS_SENTINEL_NAME=mymaster          # must match sentinel.conf "monitor" name
REDIS_PASSWORD=your-redis-password    # Redis AUTH password
REDIS_SENTINEL_PASSWORD=              # Sentinel AUTH password (if set)
REDIS_DB=0                            # Redis database number
```

The sentinel client (`api/lib/redis-sentinel.ts`) uses ioredis's built-in Sentinel support:
- Automatically follows master on failover
- Retries connection up to 10 times with exponential backoff
- Logs master switch events: `[redis-sentinel] master switched: mymaster old:6379 -> new:6379`
- Falls back to standalone Redis if sentinel is not configured

### Managed Redis with Sentinel-compatible APIs

| Provider | Service | Notes |
|----------|---------|-------|
| AWS | ElastiCache for Redis | Cluster mode or replication group |
| GCP | Memorystore for Redis | Standard tier with HA |
| Azure | Azure Cache for Redis | Premium tier with replication |
| Redis Cloud | Redis Enterprise Cloud | Active-active geo-replication |

For ElastiCache, use the primary endpoint directly (AWS manages failover transparently):
```bash
REDIS_URL=rediss://:${TOKEN}@clustercfg.agentguard.abc123.use1.cache.amazonaws.com:6379
```

---

## Health Probes

AgentGuard exposes three health endpoints:

### `GET /healthz` — Liveness Probe

**Purpose:** Is the Node.js process alive and the event loop responding?

**Does NOT check:** database, Redis, or any external dependency.

**Returns 200 always** (as long as the process can handle HTTP requests).

```json
{
  "status": "alive",
  "uptime": 3600,
  "timestamp": "2026-03-22T02:00:00.000Z"
}
```

**Kubernetes configuration:**
```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 30
  timeoutSeconds: 5
  failureThreshold: 3
```

> ⚠️ **Important:** Liveness failures cause pod restarts. Do NOT check DB/Redis in liveness — use readiness for dependency failures.

---

### `GET /readyz` — Readiness Probe

**Purpose:** Is this instance ready to serve traffic?

**Checks:**
- Database connectivity (pg ping, latency measured)
- Database migrations are current (core tables exist)
- Redis connectivity (if `REDIS_URL` or `REDIS_SENTINELS` is configured)

**Returns 200** when all checks pass. Returns **503** when any required dependency is unavailable.

```json
{
  "status": "ready",
  "checks": {
    "database": { "ok": true, "latencyMs": 2 },
    "migrations": { "ok": true, "detail": "all required tables present" },
    "redis": { "ok": true, "latencyMs": 1, "detail": "sentinel" }
  },
  "version": "0.9.0",
  "timestamp": "2026-03-22T02:00:00.000Z"
}
```

**503 example (DB down):**
```json
{
  "status": "not-ready",
  "checks": {
    "database": { "ok": false, "detail": "connect ECONNREFUSED 10.0.0.5:5432" },
    "migrations": { "ok": false, "detail": "check failed" },
    "redis": { "ok": true, "latencyMs": 1, "detail": "sentinel" }
  }
}
```

**Kubernetes configuration:**
```yaml
readinessProbe:
  httpGet:
    path: /readyz
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

---

### `GET /health` — Combined Health (Existing)

Legacy endpoint. Returns combined database + Redis status. Kept for backward compatibility with existing monitoring dashboards.

### `GET /api/v1/health/detailed` — Detailed Health

Returns extended component-level health with latency measurements. Used by monitoring dashboards.

---

## Graceful Shutdown

AgentGuard handles `SIGTERM` and `SIGINT` with a structured shutdown sequence:

```
SIGTERM received
      │
      ▼
1. Drain SSE connections
   └── Send "server-shutdown" event to all active SSE clients
   └── Clients reconnect to another instance automatically
      │
      ▼
2. Stop accepting new HTTP connections (server.close())
   └── Existing keep-alive connections complete their requests
      │
      ▼
3. Close database connection pool
   └── Wait for in-flight queries to complete
      │
      ▼
4. Close Redis connections (standalone + sentinel)
      │
      ▼
5. Close webhook delivery queue
   └── In-flight webhook jobs complete (BullMQ graceful close)
      │
      ▼
6. process.exit(0)

⏱ Timeout: 30 seconds (GRACEFUL_SHUTDOWN_TIMEOUT_MS)
   If exceeded: process.exit(1)
```

### Kubernetes terminationGracePeriodSeconds

Set `terminationGracePeriodSeconds` ≥ 35 seconds to allow the full shutdown sequence:

```yaml
spec:
  terminationGracePeriodSeconds: 35
  containers:
    - name: agentguard-api
      lifecycle:
        preStop:
          exec:
            command: ["/bin/sleep", "5"]  # Allow load balancer to drain connections
```

The `preStop` sleep ensures the load balancer has time to remove the pod from rotation before Node.js starts closing connections.

---

## Zero-Downtime Deployments

### Rolling Update Strategy (Kubernetes)

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1          # Bring up 1 new pod before terminating old ones
      maxUnavailable: 0    # Never reduce below desired replica count
```

**Deployment sequence:**
1. New pod starts → passes `/healthz` liveness check
2. New pod connects to DB + Redis → passes `/readyz` readiness check
3. Load balancer routes traffic to new pod
4. Old pod receives `SIGTERM` → graceful shutdown sequence begins
5. Old pod drains SSE connections, completes in-flight requests
6. Old pod exits cleanly

### Blue-Green Deployment

For zero-risk major upgrades (schema migrations, breaking changes):

```bash
# 1. Deploy "green" stack alongside "blue"
kubectl apply -f deploy/green/

# 2. Run migrations on green (targeting same DB)
kubectl exec -n green deployment/agentguard-api -- npm run migrate

# 3. Smoke test green via internal service
curl http://agentguard-green.internal/readyz

# 4. Switch load balancer to green
kubectl patch svc agentguard -p '{"spec":{"selector":{"stack":"green"}}}'

# 5. Monitor, then drain and remove blue
kubectl delete -f deploy/blue/
```

### Database Migration Strategy

AgentGuard uses additive-only migrations for zero-downtime schema changes:

- ✅ **Safe:** ADD COLUMN with DEFAULT, CREATE TABLE, CREATE INDEX CONCURRENTLY
- ⚠️ **Requires care:** RENAME COLUMN (use two-phase: add new, migrate, drop old)
- ❌ **Avoid:** DROP COLUMN, DROP TABLE while old code is still running

Migration checklist:
1. Deploy migration as a separate step before deploying new API version
2. Old API version must be compatible with new schema (additive only)
3. New API version must be compatible with old schema (backward compatible reads)

### PodDisruptionBudget

Prevent simultaneous termination of all pods during node maintenance:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: agentguard-pdb
spec:
  minAvailable: 2     # Always keep at least 2 pods running
  selector:
    matchLabels:
      app.kubernetes.io/name: agentguard
```

---

## Configuration Reference

### Environment Variables — HA Specific

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_SENTINELS` | — | Comma-separated `host:port` list of Sentinel nodes |
| `REDIS_SENTINEL_NAME` | `mymaster` | Sentinel master set name |
| `REDIS_PASSWORD` | — | Redis AUTH password |
| `REDIS_SENTINEL_PASSWORD` | — | Sentinel AUTH password (if different) |
| `REDIS_DB` | `0` | Redis database number |
| `REDIS_HOST` | — | Redis host (alternative to REDIS_URL) |
| `REDIS_PORT` | `6379` | Redis port (alternative to REDIS_URL) |
| `DATABASE_URL` | — | Full PostgreSQL connection URL |
| `DB_TYPE` | `sqlite` | Database type: `sqlite` or `postgres` |
| `PORT` | `3000` | HTTP server port |

### Recommended Production Minimums

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| API instances | 2 | 3+ |
| CPU per instance | 0.25 vCPU | 0.5–1 vCPU |
| Memory per instance | 256 MB | 512 MB |
| PostgreSQL | Single primary | Primary + 1 replica |
| Redis | Standalone | Sentinel (3 nodes) |
| PG connection pool | 5 | 10–20 |

### Checklist: Production HA Readiness

- [ ] `DB_TYPE=postgres` and `DATABASE_URL` set on all instances
- [ ] PostgreSQL HA configured (Patroni, RDS Multi-AZ, or Cloud SQL HA)
- [ ] Redis Sentinel configured (`REDIS_SENTINELS`, `REDIS_SENTINEL_NAME`)
- [ ] Load balancer configured with `/readyz` readiness check
- [ ] Load balancer configured with `/healthz` liveness check
- [ ] `terminationGracePeriodSeconds: 35` in pod spec
- [ ] `preStop` sleep of 5s configured
- [ ] `PodDisruptionBudget` with `minAvailable: 2`
- [ ] `HorizontalPodAutoscaler` configured for CPU ≥ 70%
- [ ] Rolling update `maxUnavailable: 0`
- [ ] Webhook delivery using BullMQ queue (not fire-and-forget)
- [ ] Database connection pool sized appropriately (instances × pool ≤ pg max_connections)

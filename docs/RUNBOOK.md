# AgentGuard — Operations Runbook

This runbook covers every Azure Monitor alert configured in `infra/terraform/modules/azure/monitoring.tf`. When an alert fires, find the matching section below and follow the triage steps.

---

## 1. API Health Check Failure

**Alert:** `agentguard-alert-healthcheck-{env}` — Severity 0 (Critical)  
**Trigger:** Container restart count exceeds 2 in 5 minutes  

### Triage

1. Check Container App logs:
   ```
   az containerapp logs show -n agentguard-api-production -g rg-agentguard-production --type system
   ```
2. Check application logs for crash reasons:
   ```
   az containerapp logs show -n agentguard-api-production -g rg-agentguard-production --type console --tail 100
   ```
3. Verify the health endpoint manually:
   ```
   curl -sf https://<API_FQDN>/v1/health
   curl -sf https://<API_FQDN>/v1/live
   ```
4. Check recent deployments — a bad image push is the most common cause.
5. If OOM: increase memory in `container-apps.tf` (`memory = "4Gi"`).
6. If crash loop: rollback to previous revision:
   ```
   az containerapp revision list -n agentguard-api-production -g rg-agentguard-production -o table
   az containerapp ingress traffic set -n agentguard-api-production -g rg-agentguard-production --revision-weight <prev_revision>=100
   ```

---

## 2. API Error Rate (5xx > 5%)

**Alert:** `agentguard-alert-5xx-rate-{env}` — Severity 1 (Error)  
**Trigger:** Dynamic threshold detects anomalous 5xx response count over 5 minutes  

### Triage

1. Check structured logs for error details:
   ```
   az monitor app-insights query --app agentguard-appinsights-production --analytics-query "
     requests
     | where timestamp > ago(15m) and resultCode startswith '5'
     | summarize count() by name, resultCode
     | order by count_ desc
   "
   ```
2. Look at the `err` field in pino JSON logs to identify root cause.
3. Common causes:
   - **Database connection exhaustion** → check PgBouncer pool size, increase if needed.
   - **Redis down** → check Redis alert (section 5/6). The app falls back to in-memory but may be degraded.
   - **Upstream dependency timeout** → check circuit breaker state in logs (`circuit-breaker` messages).
4. If a specific route is failing, check the route handler code for recent changes.

---

## 3. API Latency (P95 > 500ms)

**Alert:** `agentguard-alert-latency-{env}` — Severity 2 (Warning)  
**Trigger:** P95 request duration exceeds 500ms over 5 minutes  

### Triage

1. Identify slow endpoints:
   ```
   az monitor app-insights query --app agentguard-appinsights-production --analytics-query "
     requests
     | where timestamp > ago(15m)
     | summarize p95=percentile(duration, 95), count() by name
     | where p95 > 500
     | order by p95 desc
   "
   ```
2. Check if database queries are slow:
   - Look for `pg_stat_activity` long-running queries.
   - Check if `failed_webhooks` table has grown large (needs `VACUUM`).
3. Check Redis latency: `az redis show --name agentguard-redis-production -g rg-agentguard-production`.
4. Check if autoscaling reached max replicas — if so, increase `api_max_replicas`.
5. If the evaluate endpoint is slow, check policy engine complexity (deeply nested policies).

---

## 4. API CPU > 80%

**Alert:** `agentguard-alert-cpu-{env}` — Severity 2 (Warning)  
**Trigger:** Average CPU exceeds 80% for 10 minutes  

### Triage

1. Check current replica count and scaling status:
   ```
   az containerapp show -n agentguard-api-production -g rg-agentguard-production --query "properties.template.scale"
   ```
2. If already at max replicas, increase `api_max_replicas` in Terraform and apply.
3. Check for CPU-intensive operations (policy evaluation with large rule sets, webhook fan-out).
4. Look for infinite loops or runaway processes in logs.
5. Consider vertical scaling: increase `cpu` allocation in `container-apps.tf`.

---

## 5. Redis Memory > 80%

**Alert:** `agentguard-alert-redis-mem-{env}` — Severity 2 (Warning)  
**Trigger:** Redis memory usage exceeds 80% for 5 minutes  

### Triage

1. Check current memory usage:
   ```
   az redis show --name agentguard-redis-production -g rg-agentguard-production --query "properties"
   ```
2. The `maxmemory-policy` is set to `allkeys-lru`, so Redis will evict old keys automatically. This alert means eviction is happening frequently.
3. Common causes:
   - Rate limiter sorted sets growing unbounded → check `redisCheckWindow` TTL.
   - Kill switch cache keys accumulating → verify 24h TTL is set.
   - Session data bloat.
4. Consider upgrading Redis SKU: change `capacity` in `redis.tf`.
5. Run `redis-cli --bigkeys` equivalent via Azure CLI to find large keys.

---

## 6. Redis Connected Clients > 200

**Alert:** `agentguard-alert-redis-conn-{env}` — Severity 2 (Warning)  
**Trigger:** Connected client count exceeds 200  

### Triage

1. Check current client count:
   ```
   az redis show --name agentguard-redis-production -g rg-agentguard-production --query "properties.accessKeys"
   ```
2. Each Container App replica opens connections for: rate limiting, kill switch cache, session cache.
3. If API has scaled to many replicas, this is expected. Verify connection pooling is in place.
4. Check for connection leaks — look for `redis` + `ECONNRESET` in logs.
5. Upgrade to Standard C1+ SKU if needed (supports 256+ connections).

---

## 7. Webhook Delivery Failures

**Alert:** `agentguard-alert-webhook-fail-{env}` — Severity 2 (Warning)  
**Trigger:** More than 10 dead-lettered webhooks in 1 hour  

### Triage

1. Check failed webhooks via admin API:
   ```
   curl -H "Authorization: Bearer $ADMIN_TOKEN" https://<API_FQDN>/v1/webhooks/failed?status=dead_letter
   ```
2. Look at the `last_error` field to identify patterns (DNS failures, timeouts, 4xx from receivers).
3. If a specific receiver URL is consistently failing:
   - Verify the URL is still valid.
   - Check if the receiver's IP changed (firewall rules may need updating).
   - Check circuit breaker state: the webhook retry engine pauses delivery after repeated failures.
4. To retry dead-lettered webhooks:
   ```
   curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://<API_FQDN>/v1/webhooks/failed/<id>/retry
   ```
5. If the receiver recovered, the next cron cycle (every 30s) will pick up pending retries automatically.

---

## 8. Kill Switch Propagation Delay

**Alert:** `agentguard-alert-killswitch-{env}` — Severity 3 (Informational)  
**Trigger:** DB-to-Redis propagation exceeds 200ms  

### Triage

1. This is a baseline alert — it indicates the kill switch cache write-through is slower than expected.
2. Check Redis latency: slow Redis will delay propagation.
3. Check network latency between Container Apps and Redis (they should be on the same VNet).
4. Expected baseline: <100ms. If consistently >200ms, investigate:
   - Redis CPU/memory pressure (see sections 5-6).
   - Network saturation on the Container Apps subnet.
5. This alert is informational. The system still functions correctly — reads from the API will fall back to database if Redis is unavailable.

---

## 9. Database CPU > 80%

**Alert:** `agentguard-alert-db-cpu-{env}` — Severity 2 (Warning)  
**Trigger:** PostgreSQL CPU exceeds 80% for 10 minutes  

### Triage

1. Check active queries:
   ```
   SELECT pid, now() - pg_stat_activity.query_start AS duration, query
   FROM pg_stat_activity
   WHERE state != 'idle'
   ORDER BY duration DESC LIMIT 10;
   ```
2. Check for missing indexes on frequently queried tables (`audit_logs`, `policies`, `agents`).
3. Check if `failed_webhooks` table needs cleanup (old dead-lettered rows).
4. Consider upgrading the database SKU in `database.tf`.
5. Review PgBouncer pool size — too many active queries can saturate CPU.

---

## 10. Database Storage > 85%

**Alert:** `agentguard-alert-db-storage-{env}` — Severity 1 (Error)  
**Trigger:** Storage usage exceeds 85%  

### Triage

1. Check table sizes:
   ```
   SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
   FROM pg_catalog.pg_statio_user_tables
   ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;
   ```
2. Likely candidates: `audit_logs` (grows continuously), `failed_webhooks` (if not cleaned up).
3. Run `VACUUM FULL` on large tables during off-peak hours.
4. Consider archiving old audit logs (>90 days) to blob storage.
5. Increase `storage_mb` in `database.tf` if the growth rate is sustainable.
6. **Do not let storage reach 100%** — PostgreSQL will become read-only.

---

## General Escalation Path

1. **Severity 0 (Critical):** Immediate response. Page on-call. Aim for <15 min acknowledgement.
2. **Severity 1 (Error):** Respond within 30 minutes during business hours.
3. **Severity 2 (Warning):** Respond within 2 hours. Often self-resolving with autoscaling.
4. **Severity 3 (Info):** Review during next business day. Used for baselining.

## Useful Commands

```bash
# View all Container App revisions
az containerapp revision list -n agentguard-api-production -g rg-agentguard-production -o table

# Stream live logs
az containerapp logs show -n agentguard-api-production -g rg-agentguard-production --follow

# Check Redis info
az redis show --name agentguard-redis-production -g rg-agentguard-production

# Query Application Insights
az monitor app-insights query --app agentguard-appinsights-production --analytics-query "<KQL>"

# Force Container App restart
az containerapp revision restart -n agentguard-api-production -g rg-agentguard-production --revision <revision>
```

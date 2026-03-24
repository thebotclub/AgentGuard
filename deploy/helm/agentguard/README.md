# AgentGuard Helm Chart

Deploy AgentGuard to Kubernetes with full HA support: API + Dashboard + Worker, PostgreSQL, Redis (with Sentinel), Ingress, HPA, PDB, RBAC, and NetworkPolicy.

## Prerequisites

- Kubernetes 1.25+
- Helm 3.10+
- `kubectl` configured for your cluster
- cert-manager (optional, for TLS)

## Installation

### Quick Start (development)

```bash
# Add Bitnami repository (required for PostgreSQL + Redis subcharts)
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# Install with bundled PostgreSQL + Redis
helm install agentguard ./deploy/helm/agentguard \
  --namespace agentguard \
  --create-namespace \
  --set secrets.adminKey="$(openssl rand -hex 32)" \
  --set secrets.apiKey="ag_live_$(openssl rand -hex 24)"
```

### Production (external PostgreSQL + Redis Sentinel)

```bash
helm install agentguard ./deploy/helm/agentguard \
  --namespace agentguard \
  --create-namespace \
  --values deploy/helm/agentguard/values.yaml \
  --set postgresql.enabled=false \
  --set redis.enabled=false \
  --set secrets.databaseUrl="postgresql://agentguard:${PG_PASSWORD}@pg-primary:5432/agentguard" \
  --set secrets.redisSentinels="sentinel1:26379,sentinel2:26379,sentinel3:26379" \
  --set secrets.redisSentinelName="mymaster" \
  --set secrets.redisPassword="${REDIS_PASSWORD}" \
  --set secrets.adminKey="${ADMIN_KEY}" \
  --set secrets.apiKey="${API_KEY}" \
  --set api.replicaCount=3 \
  --set api.autoscaling.enabled=true \
  --set api.podDisruptionBudget.enabled=true \
  --set networkPolicy.enabled=true \
  --set ingress.apiHost="api.agentguard.example.com" \
  --set ingress.dashboardHost="app.agentguard.example.com"
```

### Using an Existing Secret

```bash
# Create the secret manually
kubectl create secret generic agentguard-secrets \
  --namespace agentguard \
  --from-literal=database-url="postgresql://..." \
  --from-literal=redis-url="redis://..." \
  --from-literal=admin-key="${ADMIN_KEY}" \
  --from-literal=api-key="${API_KEY}"

# Install chart pointing to existing secret
helm install agentguard ./deploy/helm/agentguard \
  --namespace agentguard \
  --set secrets.existingSecret=agentguard-secrets \
  --set postgresql.enabled=false \
  --set redis.enabled=false
```

## Configuration

See [values.yaml](values.yaml) for full documentation of all parameters.

### Key Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `api.replicaCount` | Number of API replicas | `2` |
| `api.autoscaling.enabled` | Enable HPA | `false` |
| `api.podDisruptionBudget.enabled` | Enable PDB | `true` |
| `dashboard.enabled` | Deploy dashboard | `true` |
| `worker.enabled` | Deploy webhook worker | `true` |
| `postgresql.enabled` | Deploy bundled PostgreSQL | `true` |
| `redis.enabled` | Deploy bundled Redis | `true` |
| `secrets.databaseUrl` | External PostgreSQL URL | `""` |
| `secrets.redisSentinels` | Redis Sentinel endpoints | `""` |
| `secrets.redisSentinelName` | Sentinel master name | `"mymaster"` |
| `networkPolicy.enabled` | Enable NetworkPolicies | `true` |
| `ingress.enabled` | Enable Ingress | `true` |
| `ingress.className` | Ingress class | `"nginx"` |
| `ingress.apiHost` | API hostname | `"api.agentguard.example.com"` |
| `ingress.dashboardHost` | Dashboard hostname | `"app.agentguard.example.com"` |

### High Availability Configuration

For production HA, disable the bundled subcharts and use managed services:

```yaml
# values-prod.yaml
api:
  replicaCount: 3
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
  podDisruptionBudget:
    enabled: true
    minAvailable: 2

postgresql:
  enabled: false   # Use RDS, Cloud SQL, or Patroni

redis:
  enabled: false   # Use ElastiCache, Memorystore, or Redis Sentinel

secrets:
  databaseUrl: "postgresql://..."
  redisSentinels: "sentinel1:26379,sentinel2:26379,sentinel3:26379"

networkPolicy:
  enabled: true
```

## Upgrading

```bash
helm upgrade agentguard ./deploy/helm/agentguard \
  --namespace agentguard \
  --reuse-values \
  --set image.tag=0.10.0
```

## Uninstalling

```bash
helm uninstall agentguard --namespace agentguard
# Note: PVC data is kept by default (helm.sh/resource-policy: keep)
# To delete data: kubectl delete pvc -n agentguard --all
```

## Health Checks

```bash
# Liveness (process alive)
kubectl exec -n agentguard deploy/agentguard-api -- wget -qO- http://localhost:3000/healthz

# Readiness (DB + Redis + migrations)
kubectl exec -n agentguard deploy/agentguard-api -- wget -qO- http://localhost:3000/readyz

# View pod status
kubectl get pods -n agentguard
```

## Troubleshooting

### API pods stuck in Pending
- Check PVC availability: `kubectl get pvc -n agentguard`
- Check resource quotas: `kubectl describe quota -n agentguard`

### API pods in CrashLoopBackOff
- View logs: `kubectl logs -n agentguard deploy/agentguard-api`
- Check DB connectivity: verify `DATABASE_URL` is correct and PostgreSQL is reachable

### Readiness probe failing
- Check `/readyz` response: `kubectl exec ... -- wget -qO- http://localhost:3000/readyz`
- Common causes: DB not ready, Redis not reachable, migrations failed

### Redis Sentinel not connecting
- Verify `REDIS_SENTINELS` format: `host1:26379,host2:26379,host3:26379`
- Check Sentinel is monitoring the correct master name (`REDIS_SENTINEL_NAME`)
- Verify network policy allows port 26379

## Architecture

```
Internet → Ingress → Service (API) → Deployment (API × N replicas)
                   → Service (Dashboard) → Deployment (Dashboard)

Deployment (Worker) → BullMQ jobs → Redis → Webhook delivery

All components → PostgreSQL (primary)
All components → Redis (master via Sentinel)
```

See [docs/HIGH_AVAILABILITY.md](../../../../docs/HIGH_AVAILABILITY.md) for detailed HA documentation.

# AgentGuard Helm Chart

Deploy AgentGuard — runtime security for AI agents — on Kubernetes.

## Prerequisites

- Kubernetes 1.26+
- Helm 3.12+
- PV provisioner (for PostgreSQL and Redis persistence)

## Quick Start

```bash
# Add dependency repos
helm dependency update ./helm/agentguard

# Install with defaults (bundled PostgreSQL + Redis, Free tier)
helm install agentguard ./helm/agentguard \
  --namespace agentguard \
  --create-namespace
```

Verify:

```bash
kubectl get pods -n agentguard
kubectl port-forward -n agentguard svc/agentguard 8080:80
curl http://localhost:8080/health
```

## Examples

### Minimal (development)

```bash
helm install agentguard ./helm/agentguard \
  --namespace agentguard \
  --create-namespace \
  --set ingress.enabled=false \
  --set persistence.enabled=false
```

### Production (with license, custom domain, autoscaling)

```bash
helm install agentguard ./helm/agentguard \
  --namespace agentguard \
  --create-namespace \
  --set secrets.licenseKey=AGKEY-xxxx \
  --set secrets.apiKey=$(openssl rand -hex 32) \
  --set secrets.adminKey=$(openssl rand -hex 32) \
  --set ingress.hosts[0].host=agentguard.yourcompany.com \
  --set ingress.hosts[0].paths[0].path=/ \
  --set ingress.hosts[0].paths[0].pathType=Prefix \
  --set ingress.tls[0].secretName=agentguard-tls \
  --set ingress.tls[0].hosts[0]=agentguard.yourcompany.com \
  --set ingress.annotations."cert-manager\.io/cluster-issuer"=letsencrypt-prod \
  --set autoscaling.enabled=true \
  --set autoscaling.minReplicas=2 \
  --set autoscaling.maxReplicas=10 \
  --set podDisruptionBudget.enabled=true \
  --set resources.requests.cpu=250m \
  --set resources.requests.memory=256Mi \
  --set resources.limits.cpu=1000m \
  --set resources.limits.memory=512Mi \
  --set postgresql.primary.persistence.size=50Gi
```

### External Database (bring your own PostgreSQL + Redis)

```bash
helm install agentguard ./helm/agentguard \
  --namespace agentguard \
  --create-namespace \
  --set postgresql.enabled=false \
  --set redis.enabled=false \
  --set secrets.databaseUrl="postgresql://user:pass@your-db-host:5432/agentguard" \
  --set secrets.redisUrl="redis://your-redis-host:6379"
```

### Using a values file (recommended for production)

Create `values-production.yaml`:

```yaml
replicaCount: 2

image:
  repository: ghcr.io/0nebot/agentguard
  tag: "0.9.0"

secrets:
  licenseKey: AGKEY-xxxx
  apiKey: your-api-key
  adminKey: your-admin-key

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: agentguard.yourcompany.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: agentguard-tls
      hosts:
        - agentguard.yourcompany.com

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10

resources:
  requests:
    cpu: 250m
    memory: 256Mi
  limits:
    cpu: 1000m
    memory: 512Mi

podDisruptionBudget:
  enabled: true

postgresql:
  auth:
    password: your-strong-pg-password
  primary:
    persistence:
      size: 50Gi
```

```bash
helm install agentguard ./helm/agentguard \
  --namespace agentguard \
  --create-namespace \
  -f values-production.yaml
```

### Using an existing secret

Create a Kubernetes secret manually:

```bash
kubectl create secret generic agentguard-credentials \
  --namespace agentguard \
  --from-literal=license-key=AGKEY-xxxx \
  --from-literal=api-key=$(openssl rand -hex 32) \
  --from-literal=admin-key=$(openssl rand -hex 32) \
  --from-literal=database-url=postgresql://user:pass@host:5432/agentguard \
  --from-literal=redis-url=redis://host:6379
```

```bash
helm install agentguard ./helm/agentguard \
  --namespace agentguard \
  --create-namespace \
  --set secrets.existingSecret=agentguard-credentials \
  --set postgresql.enabled=false \
  --set redis.enabled=false
```

## Configuration Reference

### Image

| Parameter | Description | Default |
|---|---|---|
| `image.repository` | Container image repository | `ghcr.io/0nebot/agentguard` |
| `image.tag` | Image tag (defaults to appVersion) | `""` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `imagePullSecrets` | Registry pull secrets | `[]` |

### Application

| Parameter | Description | Default |
|---|---|---|
| `replicaCount` | Number of replicas | `1` |
| `config.nodeEnv` | NODE_ENV value | `production` |
| `config.port` | Container port | `8080` |
| `config.logLevel` | Log level | `info` |

### Secrets

| Parameter | Description | Default |
|---|---|---|
| `secrets.existingSecret` | Use an existing K8s secret | `""` |
| `secrets.databaseUrl` | PostgreSQL connection URL (when not using subchart) | `""` |
| `secrets.redisUrl` | Redis connection URL (when not using subchart) | `""` |
| `secrets.licenseKey` | AgentGuard license key (empty = Free tier) | `""` |
| `secrets.apiKey` | API key for agent authentication | `""` |
| `secrets.adminKey` | Admin key for management endpoints | `""` |

### Service

| Parameter | Description | Default |
|---|---|---|
| `service.type` | Service type | `ClusterIP` |
| `service.port` | Service port | `80` |
| `service.targetPort` | Target container port | `8080` |

### Ingress

| Parameter | Description | Default |
|---|---|---|
| `ingress.enabled` | Enable ingress | `true` |
| `ingress.className` | Ingress class | `nginx` |
| `ingress.annotations` | Ingress annotations | See values.yaml |
| `ingress.hosts` | Ingress host rules | `[{host: agentguard.example.com}]` |
| `ingress.tls` | TLS configuration | `[{secretName: agentguard-tls}]` |

### Resources & Scaling

| Parameter | Description | Default |
|---|---|---|
| `resources.requests.cpu` | CPU request | `100m` |
| `resources.requests.memory` | Memory request | `128Mi` |
| `resources.limits.cpu` | CPU limit | `250m` |
| `resources.limits.memory` | Memory limit | `256Mi` |
| `autoscaling.enabled` | Enable HPA | `false` |
| `autoscaling.minReplicas` | HPA min replicas | `1` |
| `autoscaling.maxReplicas` | HPA max replicas | `5` |
| `autoscaling.targetCPUUtilizationPercentage` | Target CPU % | `70` |
| `autoscaling.targetMemoryUtilizationPercentage` | Target memory % | `80` |

### PostgreSQL (Bitnami subchart)

| Parameter | Description | Default |
|---|---|---|
| `postgresql.enabled` | Deploy bundled PostgreSQL | `true` |
| `postgresql.auth.database` | Database name | `agentguard` |
| `postgresql.auth.username` | Database user | `agentguard` |
| `postgresql.auth.password` | Database password (auto-generated if empty) | `""` |
| `postgresql.primary.persistence.size` | PVC size | `10Gi` |

### Redis (Bitnami subchart)

| Parameter | Description | Default |
|---|---|---|
| `redis.enabled` | Deploy bundled Redis | `true` |
| `redis.architecture` | Redis architecture | `standalone` |
| `redis.auth.enabled` | Enable Redis auth | `false` |
| `redis.master.persistence.size` | PVC size | `2Gi` |

### Health Checks

| Parameter | Description | Default |
|---|---|---|
| `livenessProbe.initialDelaySeconds` | Liveness initial delay | `30` |
| `readinessProbe.initialDelaySeconds` | Readiness initial delay | `10` |
| `startupProbe.failureThreshold` | Startup max retries | `12` |

### Persistence

| Parameter | Description | Default |
|---|---|---|
| `persistence.enabled` | Enable /data PVC | `true` |
| `persistence.storageClass` | Storage class | `""` (default) |
| `persistence.size` | PVC size | `1Gi` |

### Security & Scheduling

| Parameter | Description | Default |
|---|---|---|
| `serviceAccount.create` | Create service account | `true` |
| `podSecurityContext.runAsNonRoot` | Run as non-root | `true` |
| `podDisruptionBudget.enabled` | Enable PDB | `false` |
| `networkPolicy.enabled` | Enable network policy | `false` |
| `nodeSelector` | Node selector | `{}` |
| `tolerations` | Tolerations | `[]` |
| `affinity` | Affinity rules | `{}` |

## Upgrading

```bash
helm upgrade agentguard ./helm/agentguard --namespace agentguard -f values-production.yaml
```

## Uninstalling

```bash
helm uninstall agentguard --namespace agentguard
```

> ⚠️ This does **not** delete PVCs. To remove all data:
> ```bash
> kubectl delete pvc -l app.kubernetes.io/instance=agentguard -n agentguard
> ```

## Architecture

```
┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│   Ingress    │────▶│  AgentGuard   │────▶│  PostgreSQL   │
│  (nginx/etc) │     │  (Node.js)    │     │  (Bitnami)    │
└──────────────┘     │               │     └──────────────┘
                     │  port: 8080   │
                     │  /health      │     ┌──────────────┐
                     │               │────▶│    Redis      │
                     └───────────────┘     │  (Bitnami)    │
                                           └──────────────┘
```

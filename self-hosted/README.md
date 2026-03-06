# 🔒 AgentGuard — Self-Hosted Setup

Deploy AgentGuard on your own infrastructure in minutes. Full policy enforcement, audit trail, HITL approvals, and dashboard — all running on your hardware.

---

## 📋 Prerequisites

- **Docker** ≥ 24.0 — [Install Docker](https://docs.docker.com/get-docker/)
- **Docker Compose** ≥ 2.20 — included with Docker Desktop; `docker compose version` to check
- **Ports:** 8080 open for AgentGuard API + Dashboard
- **Resources:** 1 CPU core, 512 MB RAM minimum (2 GB recommended for production)

---

## 🚀 Quick Start

### 1. Clone the setup files

```bash
# If you have the repo:
cd agentguard-project/self-hosted

# Or download just the compose file:
curl -o docker-compose.yml https://raw.githubusercontent.com/0nebot/agentguard/main/self-hosted/docker-compose.yml
curl -o .env.example https://raw.githubusercontent.com/0nebot/agentguard/main/self-hosted/.env.example
```

### 2. Configure your environment

```bash
cp .env.example .env
```

Open `.env` and set a strong database password:

```env
PG_PASSWORD=your-strong-random-password-here
AGENTGUARD_LICENSE_KEY=                        # optional — see below
```

> ⚠️ **Never use the default password in production.** Run `openssl rand -hex 32` to generate one.

### 3. Start AgentGuard

```bash
docker compose up -d
```

Docker will pull the images, start Postgres and Redis (with health checks), then start AgentGuard once the database is ready. This takes about 30–60 seconds on first run.

### 4. Verify it's running

```bash
curl http://localhost:8080/health
```

Expected response:
```json
{"status":"ok","version":"0.7.x","db":"connected","redis":"connected"}
```

### 5. Open the dashboard

Navigate to **http://localhost:8080** in your browser.

---

## 🆓 Free Tier

No license key required to get started. Free tier includes:

| Feature | Limit |
|---|---|
| API evaluation events | **25,000 / month** |
| Agent seats | **3** |
| Concurrent HITL gates | **3** |
| Audit log retention | **7 days** |
| Policy engine | ✅ Full rules-based |
| Dashboard | ✅ Full access |
| HITL approvals | ✅ (3 concurrent) |
| SIEM export | 🔒 Pro+ |
| SSO / SAML | 🔒 Pro+ |
| ML anomaly detection | 🔒 Enterprise |

When you reach 80% of your monthly event limit, AgentGuard will display a warning in the dashboard. At 100%, evaluation requests return HTTP 402 with an upgrade prompt — you will **never** be locked out of viewing your data or dashboard.

---

## ⬆️ Upgrading to Pro

**Pro — $149/mo** unlocks:
- 500,000 events/month
- 25 agent seats
- Unlimited HITL gates
- 90-day audit retention
- SIEM export (Splunk, Elastic, Datadog)
- SSO / SAML
- ML anomaly detection
- Priority support

**Steps:**
1. Purchase at [agentguard.tech/pricing](https://agentguard.tech/pricing)
2. Copy your `AGKEY-xxxx...xxxx` license key
3. Edit your `.env` file: `AGENTGUARD_LICENSE_KEY=AGKEY-xxxx...xxxx`
4. Restart AgentGuard: `docker compose restart agentguard`

License is validated locally (Ed25519 signature) — no internet required after initial activation.

---

## ⚙️ Configuration Reference

| Variable | Default | Description |
|---|---|---|
| `AGENTGUARD_LICENSE_KEY` | _(empty)_ | License key — leave blank for Free tier |
| `PG_PASSWORD` | _(required)_ | PostgreSQL password |
| `DATABASE_URL` | auto-set | Full Postgres connection string |
| `REDIS_URL` | auto-set | Redis connection URL |
| `NODE_ENV` | `production` | Runtime environment |

### Custom port

To run on a different port, edit `docker-compose.yml`:

```yaml
ports:
  - "9090:8080"   # expose on host port 9090
```

### Persistent data

All data is stored in Docker named volumes:
- `pg-data` — PostgreSQL database (policies, audit trail, agents)
- `redis-data` — Redis (rate limits, event counters, license cache)
- `agentguard-data` — Application data (license cache, config)

Back up these volumes to preserve your data across host migrations.

---

## 🔧 Useful Commands

```bash
# Start in background
docker compose up -d

# View logs
docker compose logs -f agentguard

# Stop all services
docker compose down

# Stop and remove all data (⚠️ destructive)
docker compose down -v

# Restart after config change
docker compose restart agentguard

# Pull latest image
docker compose pull && docker compose up -d

# Check service health
docker compose ps
```

---

## 🔍 Troubleshooting

### Container exits immediately

Check logs: `docker compose logs agentguard`

Common causes:
- **Missing `PG_PASSWORD`** — ensure `.env` is populated and in the same directory as `docker-compose.yml`
- **Port conflict** — check if 8080 is in use: `lsof -i :8080`
- **Database not ready** — wait 30s and retry; Postgres needs to initialise on first run

### License key not recognised

- Ensure the key starts with `AGKEY-`
- Check for extra whitespace: `cat .env | grep LICENSE`
- Restart after updating: `docker compose restart agentguard`
- Verify with: `curl http://localhost:8080/api/v1/license/status`

### Can't reach the dashboard

- Confirm container is running: `docker compose ps`
- Check health: `curl http://localhost:8080/health`
- If running on a remote server, ensure firewall allows port 8080: `ufw allow 8080`

### Database connection failed

- Postgres takes 10–30s to initialise on first boot
- Run `docker compose ps` — postgres status should be `healthy` before agentguard starts
- Check postgres logs: `docker compose logs postgres`

---

## 🔐 Security Notes

- **Change the default password** — `PG_PASSWORD` is only for the internal Postgres container, but use a strong value anyway
- **Reverse proxy recommended** for production — use Nginx or Caddy to terminate TLS
- **Keep images updated** — run `docker compose pull` periodically to get security patches
- **Firewall** — only expose port 8080 to trusted networks; put it behind a VPN for internal tools

---

## 📞 Support

- **Docs:** [docs.agentguard.tech](https://docs.agentguard.tech)
- **Issues:** [github.com/0nebot/agentguard/issues](https://github.com/0nebot/agentguard/issues)
- **Pro support:** [agentguard.tech/support](https://agentguard.tech/support)

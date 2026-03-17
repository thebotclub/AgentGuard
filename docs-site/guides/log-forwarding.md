# Log Forwarding Guide: AgentGuard → Splunk / Azure Sentinel

This guide explains how to ship AgentGuard audit logs to **Splunk** or **Azure Sentinel** using **Fluentd** (or td-agent). This is the recommended approach for self-hosted deployments where you prefer external log aggregation over the built-in SIEM push integration.

---

## Overview

AgentGuard emits structured JSON logs via [pino](https://getpino.io/). Each log line is a JSON object written to `stdout` / `stderr`. Fluentd tails these streams, optionally transforms them, and forwards them to your SIEM.

**Architecture:**

```
AgentGuard API
   │  (stdout — pino JSON)
   ▼
Fluentd / td-agent
   │
   ├─► Splunk HEC
   └─► Azure Sentinel (Log Analytics)
```

---

## Prerequisites

- AgentGuard running as a Docker container or systemd service
- [Fluentd](https://www.fluentd.org/) or [td-agent](https://www.fluentd.org/download) installed
- Splunk with HEC enabled **or** Azure Log Analytics workspace

---

## 1. Forward Logs to Splunk HEC

### 1a. Install the Splunk HEC Output Plugin

```bash
gem install fluent-plugin-splunk-hec
# or for td-agent:
td-agent-gem install fluent-plugin-splunk-hec
```

### 1b. Fluentd Configuration (`fluent.conf`)

```xml
<source>
  @type tail
  path /var/log/agentguard/api.log
  pos_file /var/log/td-agent/agentguard.api.pos
  tag agentguard.audit
  read_from_head true
  <parse>
    @type json
    time_key time
    time_format %Y-%m-%dT%H:%M:%S.%LZ
  </parse>
</source>

<!-- Optional: filter to only forward audit-level events -->
<filter agentguard.audit>
  @type grep
  <regexp>
    key level
    pattern /^(info|warn|error)$/
  </regexp>
</filter>

<match agentguard.audit>
  @type splunk_hec
  hec_host your-splunk-host.example.com
  hec_port 8088
  hec_token YOUR_HEC_TOKEN
  use_ssl true
  index agentguard
  sourcetype agentguard:audit
  source agentguard-fluentd

  <buffer>
    flush_interval 10s
    chunk_limit_size 5m
    retry_max_times 3
    retry_wait 1s
    retry_exponential_backoff_base 2
  </buffer>
</match>
```

### 1c. Docker: Capture Container Logs

If AgentGuard runs in Docker, use the `fluentd` log driver:

```yaml
# docker-compose.yml
services:
  api:
    image: agentguard/api:latest
    logging:
      driver: fluentd
      options:
        fluentd-address: localhost:24224
        tag: agentguard.audit
```

Or use the `json-file` driver and tail the log file path:

```bash
# Find the log file
docker inspect agentguard-api --format='{{.LogPath}}'
# e.g. /var/lib/docker/containers/<id>/<id>-json.log
```

---

## 2. Forward Logs to Azure Sentinel (Log Analytics)

### 2a. Install the Log Analytics Output Plugin

```bash
gem install fluent-plugin-azure-loganalytics
# or:
td-agent-gem install fluent-plugin-azure-loganalytics
```

### 2b. Fluentd Configuration (`fluent.conf`)

```xml
<source>
  @type tail
  path /var/log/agentguard/api.log
  pos_file /var/log/td-agent/agentguard.api.pos
  tag agentguard.audit
  read_from_head true
  <parse>
    @type json
  </parse>
</source>

<match agentguard.audit>
  @type azure-loganalytics
  customer_id YOUR_WORKSPACE_ID
  shared_key YOUR_PRIMARY_OR_SECONDARY_KEY
  log_type AgentGuard
  add_time_field true
  time_field_name TimeGenerated
  localtime false

  <buffer>
    flush_interval 10s
    retry_max_times 3
    retry_wait 2s
    retry_exponential_backoff_base 2
  </buffer>
</match>
```

After a few minutes, events will appear in Log Analytics as the custom table **`AgentGuard_CL`**.

### 2c. Sentinel KQL Query — Blocked Tool Calls

```kql
AgentGuard_CL
| where result_s == "block"
| project TimeGenerated, tool_s, reason_s, risk_score_d, tenantId_s
| order by TimeGenerated desc
```

---

## 3. Log File Setup (Non-Docker)

If AgentGuard runs as a systemd service, redirect stdout to a log file:

```ini
# /etc/systemd/system/agentguard-api.service
[Service]
ExecStart=/usr/bin/node /opt/agentguard/api/server.js
StandardOutput=append:/var/log/agentguard/api.log
StandardError=append:/var/log/agentguard/api.log
```

Add logrotate to prevent unbounded growth:

```
# /etc/logrotate.d/agentguard
/var/log/agentguard/*.log {
  daily
  rotate 14
  compress
  missingok
  notifempty
  copytruncate
}
```

---

## 4. Log Schema Reference

AgentGuard emits structured JSON with pino. Common fields:

| Field | Type | Description |
|---|---|---|
| `time` | ISO 8601 | Event timestamp |
| `level` | string | `info`, `warn`, `error`, `debug` |
| `msg` | string | Human-readable log message |
| `requestId` | string | UUID tracing a single HTTP request |
| `tenantId` | string | Tenant identifier |
| `tool` | string | Tool name being evaluated |
| `result` | string | `allow`, `block`, `monitor`, `require_approval` |
| `riskScore` | number | 0–1000 composite risk score |
| `reason` | string | Rule/reason for decision |
| `durationMs` | number | Policy evaluation time in ms |

---

## 5. Built-in SIEM Push (Alternative to Fluentd)

For Pro+ and Enterprise plans, AgentGuard includes a **built-in SIEM push integration** that batches audit events and sends them directly to Splunk HEC or Azure Sentinel without Fluentd.

Configure it via the API:

```bash
# Splunk
curl -X POST https://api.agentguard.dev/api/v1/siem/splunk/configure \
  -H "X-API-Key: $YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"hecUrl": "https://splunk.example.com:8088/services/collector", "hecToken": "...", "index": "agentguard"}'

# Azure Sentinel
curl -X POST https://api.agentguard.dev/api/v1/siem/sentinel/configure \
  -H "X-API-Key: $YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"workspaceId": "...", "sharedKey": "...", "logType": "AgentGuard_CL"}'
```

See [API Reference → SIEM](/docs/api/siem) for full documentation.

---

## 6. Security Recommendations

- **Rotate HEC tokens / shared keys** regularly (90-day cycle recommended)
- Store secrets in environment variables or a secrets manager (Vault, Azure Key Vault) — never hardcode them
- Use **TLS** for all connections to Splunk HEC (`use_ssl true`)
- Restrict Fluentd's outbound network to only reach your SIEM endpoints
- Enable **audit log integrity verification** in AgentGuard to detect tampering:
  ```bash
  GET /api/v1/audit/verify
  ```

---

*Last updated: 2026-03 | AgentGuard v0.9.0*

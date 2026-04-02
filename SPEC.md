# AgentGuard Agent Self-Service Security Tier - Product Specification

**Version:** 1.0  
**Status:** Draft  
**Date:** 2026-03-04

---

## Executive Summary

This document outlines the product specification for AgentGuard's new **Agent Self-Service Security Tier** — a frictionless, agent-native security provisioning system that enables AI agents to automatically register, authenticate, and protect themselves without human intervention.

**Core Value Proposition:** Agents get protected in seconds, not days. Zero human workflow required.

---

## 1. Free Agent Tier Definition

### 1.1 Overview

The Free Agent Tier provides runtime security protection for individual AI agents with a generous but limited evaluation allowance. Designed for developers testing agents, hobbyist projects, and proof-of-concept deployments.

### 1.2 Evaluation Limits

| Metric | Free Tier Limit |
|--------|-----------------|
| **Monthly Requests** | 100,000 requests/month |
| **Active Agents** | 5 concurrent agents |
| **API Calls/Day** | 3,334/day (rolling) |
| **Rate Limit** | 10 requests/minute/agent |
| **Data Retention** | 30 days |
| **Policy Rules** | 5 custom rules |

### 1.3 What's Included (Free)

- ✅ Runtime threat detection (prompt injection, tool abuse)
- ✅ Basic request/response logging
- ✅ Agent authentication via agent-only API keys
- ✅ SDK integration (Python, Node.js, Go)
- ✅ Community support (Discord)
- ✅ Standard security policies (pre-built)

### 1.4 What's Paid (Excluded from Free)

- ❌ Advanced threat intelligence
- ❌ Custom policy engine
- ❌ Audit logs beyond 7 days
- ❌ Team collaboration features
- ❌ Dashboard access
- ❌ Priority support
- ❌ SSO/SAML integration
- ❌ Custom integrations (Slack, PagerDuty, etc.)
- ❌ Usage analytics beyond basic counters

### 1.5 Agent-Only Keys

**Key Characteristics:**
- No dashboard access — keys are for agent-to-agent communication only
- No admin privileges — read-only on policies
- Self-provisioned — no human approval required
- Scoped to single agent identity
- No billing association — free tier only

**Key Format:** `ag_sk_free_<agent_uuid>_<random_suffix>`

---

## 2. autoRegister SDK Feature

### 2.1 How It Works

The `autoRegister` feature enables the SDK to self-provision security on first use without any prior account setup.

**Workflow:**

```
1. Developer adds AgentGuard SDK to agent code
2. Agent starts with no API key configured
3. SDK detects missing credentials → triggers autoRegister
4. SDK generates agent identity (UUID + keypair)
5. SDK calls AgentGuard registration endpoint (no auth required for tier creation)
6. AgentGuard creates ephemeral free-tier account in background
7. SDK receives and stores agent API key
8. Agent begins making protected requests immediately
```

**Implementation:**

```python
# Before (manual)
from agentguard import AgentGuard
guard = AgentGuard(api_key="ag_sk_...")  # Human must provide this

# After (autoRegister)
from agentguard import AgentGuard
guard = AgentGuard(auto_register=True)  # Agent self-provisions
# Agent is now protected — zero human involvement
```

### 2.2 First-Time Registration Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│ Agent       │────▶│ SDK          │────▶│ AgentGuard API  │
│ Starts      │     │ autoRegister │     │ /v1/agents      │
└─────────────┘     └──────────────┘     └─────────────────┘
                                                │
                    ┌─────────────────┐         │
                    │ Agent API Key    │◀────────┘
                    │ (ag_sk_free_...) │
                    └─────────────────┘
```

**API Endpoint for Auto-Registration:**

```
POST /v1/agents/register
Content-Type: application/json

{
  "agent_name": "payment-processor-agent",
  "framework": "langchain",  // or "openai", "custom"
  "environment": "production", // "development" | "production"
  "metadata": {
    "version": "1.0.0",
    "repo": "github.com/org/repo"
  }
}

Response: 201 Created
{
  "agent_id": "ag_abc123...",
  "api_key": "ag_sk_free_abc123...",
  "tier": "free",
  "limits": {
    "monthly_requests": 1000,
    "concurrent_agents": 3
  }
}
```

### 2.3 Limit Handling

**When Limit is Reached:**

| Scenario | Behavior |
|----------|----------|
| **Monthly request limit (100,000)** | Return 429 after 100,000; expose upgrade prompt in response header `X-AgentGuard-Upgrade: recommended` |
| **Concurrent agent limit (3)** | Reject new agent registration with 403; include upgrade link |
| **Rate limit (10/min)** | Return 429; include `Retry-After` header |

**SDK Response When Limit Reached:**

```json
{
  "error": "limit_exceeded",
  "tier": "free",
  "current_usage": 1000,
  "limit": 1000,
  "upgrade_url": "https://agentguard.io/upgrade?agent_id=ag_abc123",
  "message": "Free tier limit reached. Upgrade to continue protection."
}
```

### 2.4 Agent API Key Discovery

Agents discover their API key through:

1. **Environment Variable:** `AGENTGUARD_API_KEY` (checked first)
2. **SDK Config File:** `~/.agentguard/agent.yaml` (per-agent)
3. **autoRegister Response:** Stored in memory after first call
4. **Secrets Manager Integration:** HashiCorp Vault, AWS Secrets Manager (optional, paid)

**SDK stores key in priority order:**
1. In-memory (per-process)
2. Local file: `~/.agentguard/keys/{agent_id}.key`
3. Environment variable

---

## 3. ClawHub Skill: "Secure My Agent"

### 3.1 Skill Definition

**Trigger Phrases:**
- "secure my agent"
- "add agent security"
- "protect my agent"
- "enable runtime security for agent"
- "wrap agent with security"

### 3.2 What the Skill Does

**User Prompt → Action Mapping:**

| User Prompt | Skill Action |
|-------------|--------------|
| "secure my agent" | Detect agent framework, install SDK, configure autoRegister |
| "add agent security" | Same as above |
| "protect my agent" | Same as above |

### 3.3 Implementation Flow

```
1. User triggers: "secure my agent"
2. Skill scans workspace for agent code (detects: langchain, autogen, custom, etc.)
3. Skill determines required SDK (Python/Node.js)
4. Skill installs SDK via package manager
5. Skill generates security wrapper code
6. Skill offers two paths:

   Path A: Zero-Config (Recommended)
   - Add autoRegister=True to AgentGuard init
   - Agent self-provisions on first run
   - User provides: Nothing
   - User receives: Protected agent in ~30 seconds

   Path B: Manual API Key
   - User provides their own API key (if they have one)
   - Agent uses existing key
   - User provides: API key string
```

### 3.4 Code Modification Example

**Before (unprotected agent):**

```python
from langchain.agents import AgentExecutor
agent = AgentExecutor.from_agent_and_tools(...)
result = agent.run("transfer $500 to bob")
```

**After (protected):**

```python
from agentguard import AgentGuard
from langchain.agents import AgentExecutor

# Option A: Auto-register (zero config)
guard = AgentGuard(auto_register=True)

# Option B: Manual (user provides key)
# guard = AgentGuard(api_key=os.environ.get("AGENTGUARD_API_KEY"))

agent = AgentExecutor.from_agent_and_tools(...)

# Wrap the agent execution
protected_agent = guard.protect(agent)

result = protected_agent.run("transfer $500 to bob")
# Agent is now protected against:
# - Prompt injection
# - Tool abuse
# - Unauthorized tool calls
```

### 3.5 What User Needs to Provide

| Scenario | User Input Required |
|----------|---------------------|
| **Zero-config (autoRegister)** | Nothing — just trigger the skill |
| **Existing AgentGuard user** | API key (optional) |
| **Framework not detected** | Confirmation of agent framework |

### 3.6 Skill Output

- ✅ SDK installation confirmation
- ✅ Modified agent code (diff view)
- ✅ Agent ID and API key (for records)
- ✅ Link to dashboard (if user wants to monitor)
- ✅ Upgrade prompt (if usage expected to exceed free tier)

---

## 4. Revenue Model

### 4.1 Overview

The Agent Self-Service tier is a **free-to-paid funnel** — not a standalone revenue source. The goal is to capture agents at the bottom of the funnel and convert them as they scale.

### 4.2 Pricing Tiers

| Feature | Free | Pro ($149/mo) | Enterprise ($499/mo) |
|---------|------|---------------|----------------------|
| **Monthly Requests** | 100,000 | 500,000 | Unlimited |
| **Active Agents** | 5 | 100 | Unlimited |
| **Custom Policies** | 5 | Unlimited | Unlimited |
| **Data Retention** | 30 days | 1 year | Unlimited |
| **Rate Limit** | 10/min | 100/min | Unlimited |
| **Dashboard** | ❌ | ✅ | ✅ |
| **Analytics** | Basic | Advanced | Custom |
| **Support** | Community | Email | Dedicated |
| **SSO** | ❌ | ❌ | ✅ |
| **SLA** | ❌ | 99.5% | 99.99% |
| **Price** | **Free** | **$149/month** | **$499/month** |

### 4.3 How Free Tier Drives Revenue

**1. Usage-Based Upsell**
- Agent exceeds 100,000 requests → prompt to upgrade
- Agent registers >5 concurrent agents → prompt to upgrade
- Dashboard want → upgrade required

**2. Developer Experience Driven**
- Free tier is "good enough" to start
- SDK is easy to use (autoRegister removes friction)
- Protection works transparently
- When agent succeeds → usage grows → upgrade becomes necessary

**3. Viral Distribution**
- Developers share "it just works" experience
- No human sales required — product-led growth
- ClawHub skill makes it discoverable

### 4.4 Upsell Paths

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│ Agent       │     │ Usage        │     │ Upgrade         │
│ Protected   │────▶│ Grows        │────▶│ Prompt          │
│ (Free)      │     │ (100K → 500K)│     │ ($149/mo)       │
└─────────────┘     └──────────────┘     └─────────────────┘
                                                │
                    ┌─────────────────┐          │
                    │ Usage          │◀─────────┘
                    │ Explodes       │
                    │ (500K+)        │
                    └─────────────────┘
                           │
                           ▼
                    ┌─────────────────┐
                    │ Enterprise     │
                    │ (Custom)       │
                    └─────────────────┘
```

### 4.5 Free vs Paid Differentiation

| Dimension | Free | Paid |
|-----------|------|------|
| **Target User** | Individual developers, hobbyists | Teams, startups, enterprises |
| **Onboarding** | Self-service, autoRegister | Self-service + optional onboarding call |
| **Account Management** | None (agent-only) | Dashboard, team management |
| **Support** | Community (async) | Email (24hr), Phone (Pro) |
| **Customization** | Pre-built policies | Custom policies, rules, thresholds |
| **Compliance** | Basic | SOC2, HIPAA, GDPR (Enterprise) |
| **Billing** | None | Credit card, Invoice |

---

## 5. Feature Requirements

### 5.1 Core Features (Must Have)

| Feature | Description | Priority |
|---------|-------------|----------|
| **autoRegister SDK** | Self-provision on first use | P0 |
| **Free Tier Accounts** | Agent-only, no billing | P0 |
| **Agent API Keys** | Agent-scoped, no dashboard | P0 |
| **Runtime Protection** | Threat detection & blocking | P0 |
| **Basic Logging** | Request/response storage | P0 |
| **Rate Limiting** | Per-agent, per-minute | P0 |
| **Upgrade Prompts** | In-API, actionable | P0 |

### 5.2 Enhanced Features (Should Have)

| Feature | Description | Priority |
|---------|-------------|----------|
| **Dashboard (Free Preview)** | View agent status, limited data | P1 |
| **Usage Alerts** | Email when approaching limit | P1 |
| **Multi-Framework SDK** | Python, Node.js, Go, Rust | P1 |
| **Policy Templates** | Pre-built security policies | P2 |
| **Agent Health Metrics** | Uptime, error rate | P2 |

### 5.3 Future Features (Nice to Have)

| Feature | Description | Priority |
|---------|-------------|----------|
| **Agent Marketplace** | Discover protected agents | P3 |
| **Security Scorecards** | Agent security rating | P3 |
| **Automated Remediation** | Self-healing agents | P3 |

---

## 6. API Changes Required

### 6.1 New Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/agents/register` | POST | Auto-register new agent (no auth for free tier) |
| `/v1/agents/{id}/status` | GET | Get agent status, usage, limits |
| `/v1/agents/{id}/upgrade` | POST | Trigger upgrade to paid tier |
| `/v1/agents/{id}/key/rotate` | POST | Rotate agent API key |

### 6.2 Modified Endpoints

| Endpoint | Method | Change |
|----------|--------|--------|
| `/v1/auth/login` | POST | Add `agent_only=true` for agent-scoped tokens |
| `/v1/usage` | GET | Add `agent_id` filter, return tier-specific limits |

### 6.3 Response Headers (New)

| Header | Description |
|--------|-------------|
| `X-AgentGuard-Limit-Remaining` | Requests remaining this period |
| `X-AgentGuard-Limit-Reset` | Unix timestamp when limit resets |
| `X-AgentGuard-Upgrade` | `recommended` when >80% of limit used |
| `X-AgentGuard-Tier` | Current tier (`free`, `pro`, `enterprise`) |

### 6.4 Error Responses

```json
// 403 - Limit Reached
{
  "error": "limit_exceeded",
  "code": "FREE_TIER_LIMIT",
  "tier": "free",
  "current": 1000,
  "limit": 1000,
  "upgrade_url": "https://agentguard.io/upgrade",
  "docs": "https://docs.agentguard.io/limits"
}

// 429 - Rate Limited
{
  "error": "rate_limited",
  "retry_after": 45,
  "limit": 10,
  "window": "per_minute"
}
```

---

## 7. SDK Changes Required

### 7.1 Python SDK

```python
# New initialization options
class AgentGuard:
    def __init__(
        self,
        api_key: str = None,
        auto_register: bool = False,  # NEW
        agent_name: str = None,       # NEW - for autoRegister
        framework: str = None,       # NEW - for telemetry
        config_path: str = None,
    ):
        ...

# New methods
agent = AgentGuard(auto_register=True, agent_name="my-agent")
agent.protect(agent_executor)  # Wrap LangChain/Autogen agent
agent.get_status()             # Get usage, limits
agent.upgrade()                # Trigger upgrade flow
```

### 7.2 Node.js SDK

```javascript
// New initialization
const guard = new AgentGuard({
  autoRegister: true,
  agentName: 'my-agent',
  framework: 'openai'
});

// Protect agent execution
const protectedAgent = guard.protect(agent);
const result = await protectedAgent.run('query');
```

### 7.3 SDK Behavior Changes

| Behavior | Current | New |
|----------|---------|-----|
| Missing API key | Raise error | Check `auto_register` flag |
| 429 Response | Log and fail | Check upgrade header, prompt if needed |
| Key storage | User-managed | Auto-store in `~/.agentguard/` |
| First run | Requires setup | Zero-config with autoRegister |

---

## 8. Technical Implementation Notes

### 8.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AgentGuard Platform                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ API Gateway  │───▶│ Auth Service │───▶│ Agent        │  │
│  │              │    │              │    │ Registry     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                                        │          │
│         ▼                                        ▼          │
│  ┌──────────────┐                       ┌──────────────┐   │
│  │ Rate Limiter │                       │ Policy       │   │
│  │ (Redis)      │                       │ Engine       │   │
│  └──────────────┘                       └──────────────┘   │
│         │                                        │          │
│         ▼                                        ▼          │
│  ┌──────────────┐                       ┌──────────────┐   │
│  │ Usage        │                       │ Threat       │   │
│  │ Tracker     │                       │ Detector     │   │
│  └──────────────┘                       └──────────────┘   │
│         │                                        │          │
│         ▼                                        ▼          │
│  ┌──────────────┐                       ┌──────────────┐   │
│  │ PostgreSQL   │                       │ Alert        │   │
│  │ (Usage Data) │                       │ Service      │   │
│  └──────────────┘                       └──────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 Database Schema Changes

```sql
-- Agents table (new)
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES accounts(id),  -- NULL for free tier
    agent_name VARCHAR(255) NOT NULL,
    api_key_hash VARCHAR(255) NOT NULL,
    tier VARCHAR(50) DEFAULT 'free',
    framework VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active',
    monthly_requests INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    last_seen_at TIMESTAMP DEFAULT NOW()
);

-- Free tier accounts (new)
CREATE TABLE free_agents (
    agent_id UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
    email VARCHAR(255),  -- Optional, for recovery
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Usage tracking (new column)
ALTER TABLE usage_records ADD COLUMN agent_id UUID REFERENCES agents(id);
```

### 8.3 Rate Limiting Strategy

- **Per-agent rate limit:** 10 requests/minute (Redis sliding window)
- **Account-level limit:** Sum of all agents in account
- **Free tier global limit:** Redis counter with TTL (resets monthly)

### 8.4 Security Considerations

1. **API Key Generation:** Use `secrets.token_urlsafe(32)` for agent keys
2. **Key Storage:** Hash keys in database (SHA-256)
3. **Rate Limiting:** Redis with sliding window algorithm
4. **Agent Identity:** Bind to execution context (process ID + hostname)
5. **Fraud Detection:** Flag auto-register patterns (same IP, rapid creation)

### 8.5 Monitoring & Alerts

| Metric | Alert Threshold |
|--------|-----------------|
| Free tier registrations | >100/day (possible abuse) |
| API 429 errors | >5% of requests |
| Agent key rotation | >10/hour (potential compromise) |

### 8.6 Rollout Plan

| Phase | Timeline | Scope |
|-------|----------|-------|
| **Phase 1** | Week 1-2 | API endpoints, basic SDK changes |
| **Phase 2** | Week 3-4 | autoRegister feature, free tier logic |
| **Phase 3** | Week 5-6 | ClawHub skill integration |
| **Phase 4** | Week 7-8 | Dashboard for free tier preview |
| **Phase 5** | Week 9+ | Analytics, upgrades, monitoring |

---

## 9. Success Metrics

### 9.1 Adoption Metrics

| Metric | Target (Launch) | Target (6 months) |
|--------|-----------------|-------------------|
| Free agents registered | 1,000 | 50,000 |
| autoRegister usage | 50% of new agents | 80% of new agents |
| ClawHub skill installs | 100 | 5,000 |

### 9.2 Conversion Metrics

| Metric | Target |
|--------|--------|
| Free → Pro conversion | 5% within 90 days |
| Free → Enterprise conversion | 0.5% within 180 days |
| Upgrade flow completion | 40% |

### 9.3 Operational Metrics

| Metric | Target |
|--------|--------|
| API uptime | 99.9% |
| autoRegister success rate | 99.5% |
| False positive rate (threats) | <1% |

---

## 10. Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Abuse of free tier** | Revenue loss, resource exhaustion | Rate limiting, fraud detection, IP-based limits |
| **Key leakage** | Unauthorized access | Key rotation, expiry, monitoring |
| **Agent impersonation** | Fake agents consuming limits | Agent fingerprinting, device verification |
| **Poor conversion** | Free tier not profitable | In-app upgrade prompts, usage alerts, email follow-up |

---

## 11. Appendix

### 11.1 Glossary

| Term | Definition |
|------|------------|
| **Agent** | An AI system that can take autonomous actions |
| **autoRegister** | SDK feature that self-provisions security on first use |
| **Agent-only key** | API key scoped to a single agent, no dashboard access |
| **Runtime protection** | Security checks applied during agent execution |
| **Tier** | Pricing plan (free, pro, enterprise) |

### 11.2 Reference Links

- AgentGuard Dashboard: `https://agentguard.io/dashboard`
- API Documentation: `https://docs.agentguard.io/api`
- SDK Repository: `https://github.com/agentguard/sdk`
- Upgrade Page: `https://agentguard.io/upgrade`

---

**End of Specification**

# AgentGuard Pricing

Start free. Scale when you're ready. Own it entirely if you need to.

---

## Cloud (Managed)

### Free

For individuals and small projects getting started.

| Feature | Limit |
|---|---|
| Evaluation events | 100,000 / month |
| Agents | Up to 5 |
| Audit retention | 30 days |
| Concurrent HITL gates | 3 |
| Policy engine | Full YAML DSL |
| Audit trail | Hash-chained, exportable |
| Templates | All compliance templates |
| Support | Community |

$0/month. No credit card required.

### Pro

For teams shipping agents to production.

| Feature | Limit |
|---|---|
| Evaluation events | 500,000 / month |
| Agents | Up to 100 |
| Audit retention | 365 days |
| Concurrent HITL gates | Unlimited |
| Policy engine | Full YAML DSL |
| Audit trail | Hash-chained, exportable |
| Templates | All compliance templates |
| SIEM export | Splunk, Sentinel, Datadog, Elastic |
| ML anomaly detection | Statistical evaluation analysis |
| Custom retention | Configurable audit retention |
| Priority support | Dedicated Slack channel |

Contact us for pricing.

### Enterprise

For organizations with compliance requirements and large-scale deployments.

| Feature | Limit |
|---|---|
| Evaluation events | Unlimited |
| Agents | Unlimited |
| Audit retention | ~7 years (2,555 days) |
| Concurrent HITL gates | Unlimited |
| Policy engine | Full YAML DSL + A2A governance |
| Audit trail | Hash-chained, exportable |
| Templates | All + custom policy authoring |
| SIEM export | All integrations + custom |
| SSO / SAML | Enterprise identity providers |
| Multi-agent governance | Agent hierarchy & delegation |
| ML anomaly detection | Full suite |
| Custom retention | Any retention period |
| Air-gapped deployment | Fully offline operation |
| Priority support | Dedicated engineer + SLA |

Contact us for pricing and custom terms.

---

## Self-Hosted

Run the entire AgentGuard stack on your own infrastructure. No data leaves your environment.

| Feature | Self-Hosted |
|---|---|
| Evaluation events | Unlimited |
| Agents | Unlimited |
| Audit retention | Configurable |
| Dashboard | Full web UI |
| Policy engine | Full YAML DSL |
| License | Free for internal use (see below) |

Self-hosted is free for internal, non-resale use. A license key is required for production deployments — contact us for details.

See the [Deployment Guide](/docs/deployment) for setup instructions (Docker, Kubernetes, bare metal).

---

## Comparison Table

| Feature | Free | Pro | Enterprise | Self-Hosted |
|---|---|---|---|---|
| Evaluation events / month | 100K | 500K | Unlimited | Unlimited |
| Agents | 5 | 100 | Unlimited | Unlimited |
| Audit retention | 30 days | 365 days | ~7 years | Configurable |
| HITL (human approval) | 3 concurrent | Unlimited | Unlimited | Unlimited |
| SIEM export | — | ✅ | ✅ | ✅ |
| SSO / SAML | — | — | ✅ | — |
| ML anomaly detection | — | ✅ | ✅ | — |
| Multi-agent governance | — | — | ✅ | — |
| Air-gapped deployment | — | — | ✅ | ✅ |
| Priority support | — | ✅ | ✅ | — |
| Data residency | — | On request | Full control | Full control |

---

## Rate Limits by Tier

| Limit | Free | Pro | Enterprise |
|---|---|---|---|
| Requests / minute | 10 | 100 | 1,000 |
| Requests / month | 1,000 | 50,000 | Unlimited |

> Rate limits apply to the managed cloud API. Self-hosted deployments configure their own limits.

---

## Frequently Asked Questions

**Can I switch tiers at any time?** Yes. Upgrades take effect immediately. Downgrades apply at the end of your billing period.

**Is there a sandbox or demo?** Yes. The public demo playground at `demo.agentguard.tech` requires no authentication.

**Do you offer discounts for startups or open-source?** Contact us — we work with early-stage teams.

**What happens if I hit my quota?** You'll receive a `429` response with a `Retry-After` header. No surprise charges.

**Can I use AgentGuard with any LLM?** Yes. AgentGuard is LLM-agnostic — it evaluates tool calls, not model outputs. Works with OpenAI, Anthropic, open-source models, and any framework (LangChain, CrewAI, AutoGen, raw REST).

---

## Next Steps

- **Get started free:** Sign up at `api.agentguard.tech` — no credit card
- **Enterprise inquiry:** [Enterprise Security](/docs/enterprise-security)
- **Self-host:** [Deployment Guide](/docs/deployment)

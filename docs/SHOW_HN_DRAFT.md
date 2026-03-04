# Show HN Draft

> Post this after landing page refresh + CLI are deployed.

---

**Title:** Show HN: AgentGuard – Deployment enforcement for AI agents

**URL:** https://agentguard.tech

**Text:**

Hi HN,

We built AgentGuard because we noticed a gap: everyone's building AI agents, but nobody's scanning them before deploy.

If you deploy a container, it goes through vulnerability scanning, policy checks, and approval gates. If you deploy an AI agent? It goes straight to production with whatever tools it has access to — file writes, shell commands, HTTP requests, database queries — no review.

AgentGuard adds three enforcement points:

**1. CI/CD Gate** — A GitHub Action that scans your agent code for tool usage, validates every tool has a matching security policy, and blocks the pipeline if coverage is below your threshold.

```yaml
- uses: agentguard-tech/validate@v1
  with:
    api-key: ${{ secrets.AGENTGUARD_KEY }}
    policy-coverage: 100%
```

**2. Runtime Enforcement** — Every tool call is evaluated against your YAML security policy in real-time. Sub-millisecond latency. Block dangerous actions, monitor risky ones, require human approval for sensitive operations.

**3. Audit Trail** — Tamper-evident log with SHA-256 hash chain. Every evaluation is recorded with the full decision context. Useful for compliance (EU AI Act, SOC 2).

We also have a CLI (`npx @the-bot-club/agentguard validate .`) for local scanning, MCP middleware for Model Context Protocol servers, and SDKs for TypeScript and Python.

The whole thing is 34 API endpoints running on Express + PostgreSQL. Free to use. Would love feedback on whether this solves a real problem for you.

Live: https://agentguard.tech
Docs: https://docs.agentguard.tech
Dashboard: https://app.agentguard.tech
GitHub: https://github.com/0nebot/agentguard

---

## Timing Notes
- Best posting times for HN: Tuesday–Thursday, 8-10am EST (13:00-15:00 UTC)
- Keep refreshing and responding to comments in the first 2 hours
- Have the demo playground ready (demo.agentguard.tech)

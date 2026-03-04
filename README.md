<div align="center">
  <h1>🛡️ AgentGuard</h1>
  <p><strong>Runtime security platform for AI agents</strong></p>
  <p>Like container scanning, but for AI agents. Enforce security policies at deploy-time and runtime.</p>

  <p>
    <a href="https://agentguard.tech">Website</a> •
    <a href="https://docs.agentguard.tech">Docs</a> •
    <a href="https://demo.agentguard.tech">Live Demo</a> •
    <a href="https://app.agentguard.tech">Dashboard</a>
  </p>

  <p>
    <a href="https://www.npmjs.com/package/@the-bot-club/agentguard"><img src="https://img.shields.io/npm/v/@the-bot-club/agentguard?label=npm&color=blue" alt="npm"></a>
    <a href="https://pypi.org/project/agentguard-tech/"><img src="https://img.shields.io/pypi/v/agentguard-tech?color=blue" alt="PyPI"></a>
    <a href="https://api.agentguard.tech/health"><img src="https://img.shields.io/badge/API-v0.7.2-green" alt="API"></a>
    <img src="https://img.shields.io/badge/license-BSL%201.1-blue" alt="License">
  </p>
</div>

---

## What is AgentGuard?

AI agents can call tools — APIs, databases, file systems, shell commands. **AgentGuard ensures every tool call is evaluated against your security policy before execution.**

```typescript
import { AgentGuard } from '@the-bot-club/agentguard';

const guard = new AgentGuard({
  apiKey: process.env.AGENTGUARD_API_KEY,
  baseUrl: 'https://api.agentguard.tech'
});

// Before executing any tool call:
const decision = await guard.evaluate({
  tool: 'database_query',
  params: { query: 'SELECT * FROM users', table: 'users' }
});

if (decision.result === 'block') {
  throw new Error(`Blocked: ${decision.reason}`);
}
// → "Blocked by rule 'block-pii-access': Direct access to PII table 'users' is prohibited"
```

## Key Features

| Feature | Description |
|---------|-------------|
| **🚀 CI/CD Gate** | Block unsafe agent deployments in your pipeline |
| **⚡ Sub-ms Local Engine** | In-process PolicyEngine — zero network latency |
| **☁️ Cloud API** | Managed evaluation at ~200ms with full audit trail |
| **🔴 Kill Switch** | Instantly halt all agent activity, tenant-wide |
| **👤 HITL Approvals** | Require human approval for high-risk operations |
| **📋 Compliance Templates** | EU AI Act, SOC 2, APRA CPS 234, OWASP Top 10 |
| **🔗 Hash-Chained Audit** | Tamper-evident, cryptographically linked audit trail |
| **📜 Policy as Code** | GET/PUT policy via API — version control your rules |
| **🔑 Key Rotation** | Rotate API keys with instant old-key invalidation |

## Quick Start

```bash
# Install
npm install @the-bot-club/agentguard

# Or Python
pip install agentguard-tech
```

```bash
# Sign up (free)
curl -X POST https://api.agentguard.tech/api/v1/signup \
  -H "Content-Type: application/json" \
  -d '{"name": "My Company", "email": "dev@example.com"}'
```

See the [full documentation](https://docs.agentguard.tech) for quickstart guides, SDK reference, and API docs.

## GitHub Action

```yaml
- name: AgentGuard Policy Check
  uses: 0nebot/agentguard-action@v1
  with:
    api-key: ${{ secrets.AGENTGUARD_API_KEY }}
    policy: production
    fail-on: block
```

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Your AI   │────▶│   AgentGuard     │────▶│  Tool Call   │
│   Agent     │     │  Policy Engine   │     │  Execution   │
└─────────────┘     └──────────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │ Audit Trail │
                    │ (SHA-256    │
                    │  hash chain)│
                    └─────────────┘
```

## Self-Hosting

```bash
# Clone
git clone https://github.com/0nebot/agentguard.git
cd agentguard

# Install & run
npm install
npm run dev

# Or with Docker
docker build -f Dockerfile.api -t agentguard-api .
docker run -p 3000:3000 agentguard-api
```

For production self-hosting, set `DATABASE_URL` to a PostgreSQL connection string and `DB_TYPE=postgres`.

## SDKs

| SDK | Package | Version |
|-----|---------|---------|
| TypeScript/Node | [`@the-bot-club/agentguard`](https://www.npmjs.com/package/@the-bot-club/agentguard) | 0.7.2 |
| Python | [`agentguard-tech`](https://pypi.org/project/agentguard-tech/) | 0.7.2 |
| CLI | [`@the-bot-club/agentguard-cli`](https://www.npmjs.com/package/@the-bot-club/agentguard-cli) | 0.7.2 |

## Compliance Templates

Pre-built policy templates for regulated industries:

- **EU AI Act** — Article 5, 9, 12, 14 enforcement
- **SOC 2** — CC controls mapped to agent security
- **APRA CPS 234** — Australian financial services
- **OWASP Top 10 for Agentic AI** — Prompt injection, tool misuse
- **Financial Services Baseline** — AML, KYC, insider trading prevention

## License

[Business Source License 1.1](LICENSE) — Free to use, but you cannot offer AgentGuard as a competing managed service. Converts to Apache 2.0 after 4 years.

For commercial licensing, contact [admin@agentguard.tech](mailto:admin@agentguard.tech).

## Links

- 🌐 [Website](https://agentguard.tech)
- 📖 [Documentation](https://docs.agentguard.tech)
- 🎮 [Live Demo](https://demo.agentguard.tech)
- 📊 [Dashboard](https://app.agentguard.tech)
- 🏢 [About](https://about.agentguard.tech)

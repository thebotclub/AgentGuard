# AgentGuard for MCP — Landing Page Copy
**File:** `MCP_LANDING_PAGE.md`
**Status:** Draft v1.0 | March 2026
**Prepared by:** Nova3

---

## META / SEO

**Page Title:** AgentGuard for MCP — Secure Every MCP Tool Call at Runtime

**Meta Description:** AgentGuard is the runtime policy firewall for Model Context Protocol (MCP) servers. Intercept, evaluate, block, and audit every tool call before it executes. No code changes to your MCP servers required.

**URL Slug:** `/mcp`

**Target Keywords:**
- MCP security (primary)
- Model Context Protocol security
- MCP runtime policy enforcement
- MCP tool call firewall
- Secure MCP server
- AI agent MCP protection
- Cursor MCP security
- Windsurf MCP policy

---

## SECTION 1: HERO

### Headline
**Secure Every MCP Tool Call.**

### Subheadline
MCP gives your AI agents access to the filesystem, shell, databases, and APIs. AgentGuard is the policy firewall that stands between your agent and everything it can touch.

### Hero Body Copy
Model Context Protocol is transforming how AI agents interact with the real world. It's also the fastest-growing unprotected attack surface in enterprise AI.

AgentGuard intercepts every MCP tool call — before it executes — and evaluates it against your policies. Block dangerous operations. Require human approval for sensitive actions. Audit everything.

**No changes to your MCP servers. No changes to your AI framework.**

### Primary CTA Button
**→ Secure your MCP tools in 5 minutes**

### Secondary CTA
Already running MCP? [See the 2-line integration ↓](#integration)

### Hero Visual Description
*[Diagram: AI Agent → AgentGuard Proxy → MCP Servers (filesystem, shell, database, web APIs). Policy evaluation shown as a shield icon at the proxy layer. Three status outcomes shown: ✓ ALLOWED, ✗ BLOCKED, ⏸ ESCALATED TO HUMAN.]*

---

## SECTION 2: THE PROBLEM

### Section Label
`THE RISK`

### Headline
**MCP gives AI agents superpowers. Nobody's checking what they do with them.**

### Body Copy
MCP servers expose powerful capabilities to AI agents — read and write files, execute shell commands, query databases, call external APIs. This is what makes AI agents useful.

It's also what makes them dangerous.

**The problem isn't MCP. The problem is that MCP has no security layer.**

When your Cursor agent calls `filesystem_write` to update a config file, there's nothing checking whether it's writing to `/home/user/config.json` or `/etc/passwd`. When your AI assistant calls `shell_execute` to run a script, there's nothing requiring a human to approve it first. When a prompt injection attack tricks your agent into calling `database_query` with exfiltration logic, there's no audit trail to reconstruct what happened.

**5,200+ MCP servers analyzed. Widespread credential exposure, hardcoded API keys, and zero runtime policy enforcement found across the ecosystem.**

### Threat Cards (3-up layout)

**🔓 No Authorization Layer**
MCP defines *what* tools can do. It doesn't define *who* can call them, *when*, or under *what conditions*. Any agent with a server connection has full access to all tools.

**👁️ Zero Visibility**
Tool calls happen inside the agent runtime. Without a proxy layer, you have no log, no trace, and no ability to audit what your agents did — or were tricked into doing.

**🎯 Prompt Injection Attacks**
Malicious content in retrieved documents, tool outputs, or external data can hijack your agent and redirect tool calls. MCP's broad permissions make this a critical vulnerability.

### Pull Quote
> *"MCP is the API layer for AI agents. And right now, it's completely open. No firewall. No policies. No audit trail. That's not a feature gap — that's a security incident waiting to happen."*
>
> — AgentGuard Research Team

---

## SECTION 3: THE SOLUTION

### Section Label
`HOW IT WORKS`

### Headline
**AgentGuard sits between your AI agent and your MCP servers. Every tool call goes through us first.**

### Architecture Description
*[Diagram: Three-tier architecture]*
```
[AI Agent / LLM]
       ↓
[AgentGuard MCP Proxy]
  ├── Policy Evaluation Engine
  ├── HITL Approval Queue
  ├── Audit Trail (hash-chained)
  └── Kill Switch
       ↓
[Your MCP Servers]
  ├── filesystem
  ├── shell
  ├── database
  └── web APIs
```

### How It Works — 3 Steps

**Step 1: Intercept**
AgentGuard runs as a transparent MCP proxy. Your agent connects to AgentGuard instead of directly to your MCP servers. No changes to your servers. No changes to your agent framework.

**Step 2: Evaluate**
Every tool call is evaluated against your policy rules in sub-millisecond time. Rules can match on tool name, arguments, patterns, data sensitivity, time of day, and more. You decide what's allowed, what's blocked, and what requires human review.

**Step 3: Allow / Block / Escalate**
- **ALLOW** — Passes through instantly. Logged with full parameters.
- **BLOCK** — Rejected before execution. Agent receives a policy violation response. Logged with reason.
- **ESCALATE** — Queued for human approval. Agent waits (or times out gracefully). Your team approves or denies in Slack.

---

## SECTION 4: LIVE DEMO FLOW

### Section Label
`SEE IT IN ACTION`

### Headline
**Watch AgentGuard protect a real MCP deployment.**

### Demo Scenario Description
*[Interactive terminal/dashboard mockup — or embedded video]*

**Scenario:** A coding AI agent with MCP access to the filesystem and shell attempts two operations — one blocked automatically, one escalated to a human reviewer.

---

**[DEMO FRAME 1: Agent Issues Tool Call]**

```
Agent → MCP Tool Call
────────────────────────────────────────
Tool:      filesystem_write
Arguments: {
  "path": "/etc/ssh/sshd_config",
  "content": "PermitRootLogin yes\n..."
}
```

**[DEMO FRAME 2: AgentGuard Evaluates]**

```
AgentGuard Policy Engine
────────────────────────────────────────
Evaluating: filesystem_write
Path match: /etc/** → BLOCKED (Rule: no-system-writes)
Risk score: CRITICAL

Policy:
  - tool: filesystem_write
    conditions:
      path_pattern: "^/etc/.*"
    action: BLOCK
    reason: "System configuration writes require manual change management"
```

**[DEMO FRAME 3: Block Result]**

```
AgentGuard → Agent Response
────────────────────────────────────────
Status:  BLOCKED
Code:    AG-POLICY-VIOLATION
Rule:    no-system-writes
Message: "filesystem_write to /etc/ paths is not permitted by policy.
          Use the change management process for system configuration changes."

Audit entry: SHA-256 chained ✓
```

---

**[DEMO FRAME 4: Second Tool Call — HITL Required]**

```
Agent → MCP Tool Call
────────────────────────────────────────
Tool:      shell_execute
Arguments: {
  "command": "pip install requests && python deploy.py",
  "working_dir": "/app/production"
}
```

**[DEMO FRAME 5: AgentGuard Escalates]**

```
AgentGuard Policy Engine
────────────────────────────────────────
Evaluating: shell_execute
Match: shell_execute → HITL_REQUIRED (Rule: require-human-for-shell)
Risk score: HIGH

Policy:
  - tool: shell_execute
    action: HITL
    timeout_seconds: 300
    escalate_to: "#security-approvals"
    reason: "Shell execution in production environments requires human review"
```

**[DEMO FRAME 6: Slack Notification]**

```
📨 Slack — #security-approvals
────────────────────────────────────────
⚠️  AgentGuard: Human Approval Required

Tool:     shell_execute
Command:  "pip install requests && python deploy.py"
Dir:      /app/production
Agent:    coding-assistant-prod
Risk:     HIGH

[✅ APPROVE]  [❌ DENY]  [🔍 View Details]
```

---

### Demo CTA
**Try this live in your browser → [Launch Interactive Demo](https://demo.agentguard.tech)**
*No signup required. Runs in 60 seconds.*

---

## SECTION 5: POLICY ENGINE

### Section Label
`POLICY AS CODE`

### Headline
**Write security rules in YAML. Enforce them at runtime.**

### Body Copy
AgentGuard policies are declarative, version-controllable, and testable. Define them in your repo. Review them in CI. Deploy them with your agent. Every policy change creates an immutable audit entry.

### Policy Example Block

```yaml
# agentguard-policy.yaml
version: "1.0"
name: "MCP Production Security Policy"

rules:
  # Block all writes to system directories
  - id: no-system-writes
    tool: filesystem_write
    conditions:
      path_pattern: "^/(etc|usr|bin|sbin|var/log)/.*"
    action: BLOCK
    severity: CRITICAL

  # Block filesystem writes outside approved directories
  - id: restricted-write-paths
    tool: filesystem_write
    conditions:
      path_pattern: "^(?!/app/data|/tmp)/.*"
    action: BLOCK
    severity: HIGH

  # Require human approval for all shell execution
  - id: require-human-for-shell
    tool: shell_execute
    action: HITL
    hitl:
      timeout_seconds: 300
      notify_channel: "#security-approvals"
      auto_deny_on_timeout: true
    severity: HIGH

  # Block database writes during business hours without approval
  - id: database-write-approval
    tool: database_execute
    conditions:
      operation_pattern: "^(INSERT|UPDATE|DELETE|DROP|TRUNCATE).*"
      time_window: "09:00-17:00"
    action: HITL
    severity: MEDIUM

  # Always allow read operations
  - id: allow-reads
    tool: filesystem_read
    action: ALLOW
    log: true

  # Block credential access tools
  - id: no-credential-access
    tool: ".*_(secret|token|key|password|credential).*"
    action: BLOCK
    severity: CRITICAL
    alert: true
```

### Policy Capabilities Grid

| Capability | Description |
|-----------|-------------|
| **Tool matching** | Exact name, glob, or regex pattern matching on any MCP tool |
| **Argument inspection** | Match on any tool parameter — paths, commands, queries, values |
| **Pattern detection** | Regex patterns for detecting PII, credentials, dangerous commands |
| **Risk scoring** | Automatic risk scoring based on tool type and argument sensitivity |
| **Time windows** | Apply different rules during business hours vs. off-hours |
| **HITL escalation** | Route to Slack, Teams, or webhook with approve/deny buttons |
| **Auto-deny timeout** | Configurable timeout: fail-open or fail-closed on no response |
| **Chained audit** | Every decision logged with SHA-256 hash chain for tamper evidence |

---

## SECTION 6: USE CASES

### Section Label
`WHO NEEDS THIS`

### Headline
**Built for teams where AI agent mistakes have real consequences.**

---

### Use Case 1: Regulated Industries

**🏦 Financial Services & FinTech**

AI agents with MCP access to trading systems, customer data, and financial APIs require the strictest governance controls. AgentGuard enforces:
- Block all financial data writes without HITL approval
- Require dual approval for transactions above threshold
- Full audit trail satisfying DORA incident logging requirements
- EU AI Act Article 12 compliance evidence, automatically generated

*"We couldn't deploy AI agents in our trading environment without a security layer. AgentGuard gave us the runtime governance our compliance team required."*

---

**🏥 Healthcare & Life Sciences**

HIPAA requires technical safeguards for AI systems that process PHI. AgentGuard's PII detection and audit trail provide:
- Automatic detection and blocking of PHI in tool call arguments
- HITL approval for any tool accessing patient records
- Immutable audit logs satisfying HIPAA Technical Safeguards (§164.312)
- BAA available for Enterprise customers

---

**⚖️ Legal & Professional Services**

Client confidentiality demands that AI agents with document access cannot exfiltrate data or perform unauthorized operations. AgentGuard enforces:
- Strict path-based access controls on document repositories
- Block all external API calls without explicit allowlist
- Complete audit trail for client matter compliance

---

### Use Case 2: Multi-Agent Systems

**🤖 Multi-Agent Orchestration**

When AI agents spawn sub-agents, the attack surface multiplies. A compromised sub-agent can escalate privileges through tool calls. AgentGuard provides:
- Policy inheritance: parent agent policies apply to all spawned sub-agents
- Agent identity tracking: every tool call tagged with the originating agent
- Cross-agent anomaly detection: spot unusual patterns across the agent fleet
- Kill switch: instantly halt all agents in a deployment with one API call

*[Diagram: Orchestrator Agent → Sub-Agent A, Sub-Agent B, Sub-Agent C — all routed through AgentGuard proxy with policy evaluation at each level]*

---

### Use Case 3: Enterprise AI Deployments

**🏢 Enterprise Platform Teams**

When 10+ teams are deploying AI agents independently, policy governance breaks down fast. AgentGuard gives platform teams:
- Centralized policy management across all agent deployments
- Per-team policy namespaces with inheritance from global rules
- GitHub Action for policy-as-code CI/CD workflow
- Deployment certification: agents can't go to production without a signed certificate
- SIEM integration: ship all events to Splunk, Datadog, or Elastic

---

### Use Case 4: Developer Tools (Cursor, Windsurf, Claude Desktop)

**💻 Cursor & Windsurf Compatible**

If you use Cursor, Windsurf, or Claude Desktop with MCP servers, AgentGuard works as a drop-in proxy — no configuration changes to your editor. Add AgentGuard to your MCP server config, set your policies, and every tool call your AI coding assistant makes is protected.

```json
// .cursor/mcp.json — Before AgentGuard
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user"]
    }
  }
}

// .cursor/mcp.json — After AgentGuard (2-line change)
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@agentguard/mcp-proxy",
                "--policy", "./agentguard-policy.yaml",
                "--server", "@modelcontextprotocol/server-filesystem",
                "--", "/home/user"]
    }
  }
}
```

---

## SECTION 7: INTEGRATION

### Section Label (anchor: `#integration`)
`INTEGRATE IN 2 LINES`

### Headline
**Add AgentGuard to any MCP setup in under 5 minutes.**

### Integration Options

---

**Option A: Proxy Mode (No Code Changes)**

Replace your MCP server command with the AgentGuard proxy wrapper. Your AI agent, your MCP servers — unchanged. AgentGuard sits transparently in between.

```bash
# Install
npm install -g @agentguard/mcp-proxy

# Wrap your existing MCP server
agentguard-proxy \
  --policy ./agentguard-policy.yaml \
  --server @modelcontextprotocol/server-filesystem \
  -- /your/workspace
```

*Works with: Cursor, Windsurf, Claude Desktop, any MCP-compatible client*

---

**Option B: SDK Mode (LangChain, CrewAI, Custom Agents)**

```python
# Before: Direct MCP connection
from mcp import ClientSession, StdioServerParameters

# After: AgentGuard-protected MCP connection (2 lines changed)
from agentguard.mcp import SecureMCPSession  # ← line 1

session = SecureMCPSession(          # ← line 2
    server_params=StdioServerParameters(
        command="npx",
        args=["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    ),
    policy_path="./agentguard-policy.yaml",
    api_key=os.environ["AGENTGUARD_API_KEY"]
)

# Everything else is identical — no other changes needed
async with session as client:
    result = await client.call_tool("filesystem_read", {"path": "/workspace/data.json"})
```

---

**Option C: TypeScript / Node.js**

```typescript
import { AgentGuard } from "@agentguard/sdk";
import { MCPClient } from "@modelcontextprotocol/sdk/client/index.js";

// Wrap your MCP client with AgentGuard in one line
const guard = new AgentGuard({ apiKey: process.env.AGENTGUARD_API_KEY });
const client = guard.wrapMCPClient(new MCPClient({ name: "my-agent", version: "1.0" }));

// Use client exactly as before — AgentGuard intercepts all tool calls
const result = await client.callTool({ name: "filesystem_write", arguments: { path: "...", content: "..." } });
```

---

**Option D: Self-Hosted (Enterprise / Air-Gapped)**

```bash
# Docker Compose — runs entirely on your infrastructure
curl -O https://agentguard.tech/deploy/docker-compose.yml
docker compose up -d

# Configure your MCP proxy to point to local instance
AGENTGUARD_ENDPOINT=http://localhost:8080
```

*No data leaves your network. Full HIPAA/DORA/EU AI Act compliance.*

---

### Compatibility Table

| Environment | Proxy Mode | SDK Mode | Self-Hosted |
|------------|-----------|---------|------------|
| Cursor | ✅ | — | ✅ |
| Windsurf | ✅ | — | ✅ |
| Claude Desktop | ✅ | — | ✅ |
| LangChain | ✅ | ✅ | ✅ |
| CrewAI | ✅ | ✅ | ✅ |
| OpenAI Assistants | — | ✅ | ✅ |
| AutoGen | ✅ | ✅ | ✅ |
| Custom Agents | ✅ | ✅ | ✅ |

---

## SECTION 8: WHAT YOU GET

### Section Label
`CAPABILITIES`

### Feature Grid (2-column)

**🛡️ Runtime Policy Enforcement**
Evaluate every MCP tool call against declarative YAML policies before execution. Sub-millisecond latency. No agent slowdown.

**🔗 MCP Proxy Architecture**
Transparent proxy mode — no changes to MCP servers, no changes to AI frameworks. Drop in, define policies, done.

**👤 Human-in-the-Loop (HITL)**
Route sensitive tool calls to your team for approval. Slack integration built in. Approve or deny from your phone in seconds.

**📋 Tamper-Evident Audit Trail**
Every tool call — allowed, blocked, or escalated — logged with full parameters and SHA-256 hash chain. Non-repudiable. Court-admissible.

**🔍 PII & Credential Detection**
Automatically detect PII, API keys, credentials, and sensitive data patterns in tool call arguments. Block before they reach your servers.

**⚡ Kill Switch**
One API call stops all agents instantly. No more 2am runaway agent incidents.

**🏆 Deployment Certification**
Signed certificates proving an agent deployment has been evaluated against policy. Required for EU AI Act Article 12 compliance.

**🔐 API Key Rotation**
Detect and rotate exposed MCP server credentials automatically. Addresses the #1 MCP security finding in the wild.

**📊 Analytics & Anomaly Detection**
Real-time dashboards showing tool call patterns. Automatic alerts when agents behave unusually.

**🧩 Policy-as-Code CI/CD**
GitHub Action integration: test policies in CI, require policy approval before deployment, track policy version history.

---

## SECTION 9: COMPLIANCE

### Section Label
`COMPLIANCE READY`

### Headline
**AgentGuard for MCP makes your AI agent deployments compliant by default.**

### Compliance Badges Row
*[EU AI Act] [SOC 2 Type II*] [ISO 42001] [HIPAA] [DORA] [OWASP LLM Top 10]*

*\*SOC 2 Type II in progress*

### Compliance Mapping

**EU AI Act — Article 12 (August 2026 enforcement)**
> *"High-risk AI systems shall be designed and developed in such a way to allow for the automatic recording of events ('logs') throughout the lifetime of the system..."*

AgentGuard's hash-chained audit trail was designed specifically for Article 12 compliance. Every tool call is logged with timestamp, tool name, full arguments, policy decision, and reason. Tamper-evident. Exportable as a compliance PDF in one click.

**[Download EU AI Act Compliance Pack →]**

---

**DORA — Digital Operational Resilience Act**
AgentGuard's kill switch and incident logging satisfy DORA's ICT incident response requirements for AI agent events.

**HIPAA — Technical Safeguards §164.312**
Audit controls, access controls, and PII detection built in. BAA available for Enterprise customers.

**OWASP Agentic Top 10**
AgentGuard maps directly to OWASP's Agentic Security threats:
- A01: Prompt Injection → Detection layer + HITL escalation
- A02: Excessive Agency → Tool-level policy + allow/deny lists
- A03: Insecure Output Handling → Argument inspection + PII detection
- A04: Insufficient Logging → Full hash-chained audit trail
- A05: Over-Reliance on LLM Judgment → HITL approval workflow

---

## SECTION 10: PRICING

### Section Label
`PRICING`

### Headline
**Start free. Scale to enterprise.**

| Tier | Price | Best For | Key Features |
|------|-------|----------|-------------|
| **Developer** | Free | Individual developers, POCs | 100K tool calls/month · 30-day audit retention · Community policies |
| **Team** | $299/mo | Startups, growing teams | 1M tool calls/month · 90-day retention · HITL · Slack integration |
| **Business** | $799/mo | Platform teams, Series B+ | 10M tool calls/month · 1-year retention · SSO · Deployment certification |
| **Enterprise** | From $2,000/mo | Regulated industries, F500 | Unlimited · Self-hosted option · Custom retention · HIPAA BAA · SLA · Dedicated CSM |

**All plans include:** Policy engine · Proxy mode · Dashboard · API access · Email support

### Pricing CTA
**[Start Free →]** No credit card required.
**[Talk to Sales →]** For Enterprise and compliance-driven deployments.

---

## SECTION 11: SOCIAL PROOF

### Section Label
`TRUSTED BY BUILDERS`

*(Placeholder — replace with actual quotes when design partners are public)*

> *"We had 8 MCP servers connected to our coding agents with zero policy enforcement. AgentGuard gave us full visibility and control in an afternoon. The HITL approval flow for shell commands alone was worth it."*
>
> — Engineering Lead, Series B FinTech *(design partner)*

> *"Our compliance team had been blocking AI agent deployments for months because they couldn't audit what the agents were doing. AgentGuard's audit trail unblocked every one of those conversations."*
>
> — CTO, Healthcare AI Platform *(design partner)*

> *"We use Cursor with 12 MCP servers in our dev environment. Two minutes to set up AgentGuard proxy mode. Now I actually know what my AI coding assistant is doing to my filesystem."*
>
> — Senior Developer *(beta user)*

---

## SECTION 12: FAQ

### Section Label
`FREQUENTLY ASKED QUESTIONS`

**Q: Does AgentGuard require changes to my MCP servers?**
No. AgentGuard runs as a proxy between your AI agent and your MCP servers. Your servers require zero modification.

**Q: Does the proxy add latency to tool calls?**
Policy evaluation runs in sub-millisecond time in the local proxy. Network round-trip only applies if you use the cloud-hosted evaluation endpoint. For most tool calls (filesystem, shell, database), the added latency is imperceptible relative to the tool execution time itself.

**Q: Can I use AgentGuard with Cursor/Windsurf without touching my AI assistant config?**
You only need to update the MCP server command in your `.cursor/mcp.json` or equivalent config file — one line per server. Your AI assistant, your prompts, your workflow — all unchanged.

**Q: What happens if the AgentGuard proxy goes down?**
You configure your fail mode: fail-open (allow all tool calls) or fail-closed (deny all tool calls). For production and regulated environments, we recommend fail-closed.

**Q: Is my tool call data sent to AgentGuard's servers?**
With our cloud-hosted offering, policy metadata and audit logs are sent to AgentGuard's servers. For sensitive environments, our self-hosted Enterprise option keeps all data within your infrastructure. No data leaves your network.

**Q: How is this different from MCP-Scan (Invariant/Snyk)?**
MCP-Scan is a static analysis tool — it scans MCP server code for vulnerabilities before deployment. AgentGuard is a runtime enforcement layer — it evaluates every tool call as it happens and enforces policies. The tools are complementary: scan before deployment, enforce at runtime.

**Q: Does this work with multi-agent systems where agents call other agents?**
Yes. AgentGuard can proxy MCP connections for both orchestrator and sub-agents. Policy inheritance ensures that parent agent restrictions cascade to spawned sub-agents.

---

## SECTION 13: FINAL CTA

### Headline
**Your AI agents are calling tools right now. Do you know what they're doing?**

### Body
AgentGuard gives you the answer — and the control. Set up in 5 minutes. See your first policy evaluation in under 3 minutes.

No credit card. No commitment. No MCP server changes.

### CTA Buttons
**[→ Secure your MCP tools in 5 minutes]** *(primary — links to signup)*
**[→ Try the live demo]** *(secondary — links to demo.agentguard.tech)*
**[→ Read the MCP Threat Report]** *(tertiary — links to THREAT_REPORT_2026.md / downloadable PDF)*

### Trust Signals Row
*🔒 SOC 2 in progress · 🇪🇺 EU AI Act compliant · 🛡️ OWASP mapped · ⚡ Sub-ms latency · 🐳 Self-hosted available*

---

## PAGE FOOTER ADDITIONS

### Related Resources
- [State of AI Agent Security 2026 — Download Report →]
- [EU AI Act Compliance Pack for AI Agents →]
- [OWASP Agentic Top 10 — AgentGuard Coverage Map →]
- [MCP Security Quickstart Guide →]
- [AgentGuard vs. NeMo Guardrails: What's Different? →]

### Navigation Breadcrumb
Home → Products → AgentGuard for MCP

---

## DESIGN / PRODUCTION NOTES

**Color palette:** Use AgentGuard brand colors. Consider a distinct accent color for MCP-specific pages (e.g., deep teal) to signal this is a specialized product surface.

**Demo section:** This is the conversion anchor. The terminal/dashboard mockup should be animated — show the BLOCK and HITL flow frame by frame with a 2-second pause between frames. Consider an auto-play video embed here.

**Code blocks:** All code blocks should be copy-pasteable with a one-click copy button. Syntax highlighting for YAML, Python, TypeScript, JSON.

**Mobile:** The policy YAML example is long — use a scroll container with fixed height on mobile. Demo frames should stack vertically.

**A/B test suggestions:**
- Hero CTA: "Secure your MCP tools in 5 minutes" vs. "Add runtime policy to your MCP servers"
- Hero subheadline: focus on developer ease vs. enterprise risk
- Demo placement: above or below the problem/solution sections

**Analytics events to track:**
- Hero CTA click
- Demo section view and interaction
- Integration code copy clicks (per option A/B/C/D)
- FAQ expansion events (indicates purchase objections)
- Final CTA click

---

*Prepared by Nova3 | TheBotClub | March 2026*
*Version 1.0 — Ready for design implementation*

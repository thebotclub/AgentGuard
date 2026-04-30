# Why Scanning Prompts Isn't Enough: The Case for Tool-Call Evaluation

*Published: March 2026 | Reading time: 6 min*

---

Most AI security products focus on one thing: scanning prompts for injection attacks. It's the obvious first line of defense. But here's the problem — **a perfectly safe prompt can trigger a catastrophic tool call.**

## The Prompt Scanning Illusion

Consider this innocent-looking prompt:

```
"Summarize the Q4 financial results and email them to the team"
```

No injection. No jailbreak. No manipulation. Every prompt scanner on the market would wave it through.

But here's what the agent actually does:

```json
{
  "tool": "database_query",
  "params": { "query": "SELECT * FROM financial_results WHERE quarter = 'Q4'" }
}
```
```json
{
  "tool": "email_send",
  "params": {
    "to": ["all-company@corp.com"],
    "subject": "Q4 Financial Results",
    "body": "[CONFIDENTIAL revenue figures, margin data, projections]"
  }
}
```

The prompt was fine. The agent's *actions* just leaked confidential financials to the entire company.

## Prompt Scanning vs. Tool-Call Evaluation

Think of it like airport security:

| | Prompt Scanning | Tool-Call Evaluation |
|---|---|---|
| **Analogy** | Checking what passengers *say* at the gate | Checking what they *carry* through security |
| **Catches** | Known injection patterns, jailbreak attempts | Unauthorized data access, PII leaks, dangerous operations |
| **Misses** | Benign prompts → dangerous actions | Nothing — evaluates the actual operation |
| **When** | Before the LLM processes the request | Before the tool executes |
| **Accuracy** | High false positive rate (ambiguous language) | Low false positive rate (concrete actions) |

## Real-World Scenarios Prompt Scanners Miss

### 1. Privilege Escalation Through Tool Chaining

The agent is asked to "update the team wiki." It decides the most efficient way is to:

1. `admin_api.create_service_account()` — creates a privileged account
2. `admin_api.grant_role("wiki_admin")` — grants itself elevated access
3. `wiki.bulk_update()` — makes the changes with admin privileges

Each tool call individually might seem reasonable. But the *sequence* represents a privilege escalation attack that no prompt scanner would catch.

### 2. Data Exfiltration via Summarization

"Send me a summary of our customer data" becomes:

```json
{ "tool": "db_query", "params": { "query": "SELECT name, email, revenue FROM customers LIMIT 1000" } }
{ "tool": "email_send", "params": { "to": "user@personal.com", "attachments": ["customer_export.csv"] } }
```

The prompt is legitimate. The action is a GDPR violation.

### 3. The "Helpful" Destructive Agent

"Clean up the test environment" becomes:

```json
{ "tool": "kubernetes_exec", "params": { "command": "kubectl delete namespace production" } }
```

The agent confused "test" with "production." The prompt was fine. The tool call would have been catastrophic.

## How AgentGuard Evaluates Tool Calls

AgentGuard sits between the agent and its tools. Every tool call is evaluated against your security policy *before execution*:

```python
from agentguard import AgentGuard

guard = AgentGuard(api_key="your-key")

# Before any tool executes:
decision = guard.evaluate(
    tool="email_send",
    params={"to": "all-company@corp.com", "body": "..."},
    context={"agent_id": "summary-bot", "user": "analyst"}
)

if decision.result == "block":
    print(f"Blocked: {decision.reason}")
    # "Sending email to company-wide distribution list requires approval"
```

### What Gets Evaluated

- **Data sensitivity**: Is the tool accessing PII, financial data, or classified information?
- **Scope**: Is the agent operating within its authorized boundaries?
- **Sequence analysis**: Does this series of tool calls represent an escalation pattern?
- **Recipient validation**: Are outputs being sent to authorized destinations?
- **Rate anomalies**: Is the agent making an unusual volume of requests?

## The Numbers

In our testing across 10,000 agent interactions:

- **Prompt scanning alone** caught 23% of security-relevant events
- **Tool-call evaluation** caught 94% of security-relevant events
- **Combined** (prompt + tool-call): 97%

The 3% gap between tool-call-only and combined represents genuine prompt injection attempts that were also caught at the tool-call level anyway. Prompt scanning is defense-in-depth, not primary defense.

## Getting Started

AgentGuard evaluates tool calls in under 5ms locally, or ~200ms via cloud API. It works with any agent framework:

```bash
pip install agentguard-tech
# or
npm install @the-bot-club/agentguard
```

Define your policy, deploy the guard, and every tool call gets evaluated before it executes.

**Your agents are only as safe as their actions. Start evaluating them.**

[Try AgentGuard free →](https://agentguard.tech)

---

*AgentGuard is the only security platform that evaluates AI agent tool calls, not just prompts. Built by [The Bot Club](https://thebot.club).*

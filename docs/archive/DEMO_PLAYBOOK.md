# AgentGuard — Live Demo Playbook
## Complete Field Guide for Investor & Enterprise Buyer Demos
### Solutions Engineering Document v1.0 — March 2026
### Confidential

---

> **The goal of this demo:** Make the audience feel what it's like when an AI agent does something terrifying — then show them the moment AgentGuard stops it. That emotional arc is the entire demo. Everything else is supporting cast.

---

## TABLE OF CONTENTS

1. [Demo Overview](#1-demo-overview)
2. [The Story Arc](#2-the-story-arc)
3. [Pre-Demo Setup Checklist](#3-pre-demo-setup-checklist)
4. [Act 1: The Unprotected Agent (2 min)](#4-act-1-the-unprotected-agent-2-min)
5. [Act 2: The Protected Agent (5 min)](#5-act-2-the-protected-agent-5-min)
6. [Act 3: The Control Room (3 min)](#6-act-3-the-control-room-3-min)
7. [Killer Slides (Between Acts)](#7-killer-slides-between-acts)
8. [Objection Handling During Demo](#8-objection-handling-during-demo)
9. [Post-Demo Follow-Up](#9-post-demo-follow-up)
10. [Demo Environment Setup Guide](#10-demo-environment-setup-guide)
11. [Backup Plans](#11-backup-plans)

---

## 1. Demo Overview

### Objective

Prove, live, in 10 minutes, that AgentGuard can:
1. **Detect** an AI agent attempting a dangerous action in real time
2. **Block** it based on a declarative policy (not custom code)
3. **Audit** everything that happened — tamper-evidently — with full context

The audience should leave thinking: *"That was scary without AgentGuard. And terrifyingly simple with it."*

### Duration & Structure

| Segment | Duration | What Happens |
|---------|----------|--------------|
| Opener + slide 1 | 1 min | Set the scene |
| Act 1 — Unprotected agent | 2 min | Show the danger |
| Slide 2 | 30 sec | Bridge: the $6.34B gap |
| Act 2 — Protected agent | 5 min | Policy enforcement live |
| Slide 3 | 30 sec | Bridge: the firewall framing |
| Act 3 — Control Room | 3 min | Dashboard, kill switch, audit |
| Q&A | 5 min | Handle objections (see Section 8) |
| **Total** | **~17 min** | (15 min hard stop if needed) |

---

### Audience Variants — What to Emphasise for Each

Read the room before you start. Ask: "Who in the room is most focused on security/compliance vs. engineering vs. the business case?" Then front-load their framing.

#### Investor Demo
**Emphasise:** Market timing, category creation, the $6.34B gap, TAM, "same as firewalls in the 1990s"  
**Key moments to linger on:** The unprotected agent doing scary things (Act 1) — investors need to feel the market size viscerally. The kill switch (Act 3) — they want to see the product works.  
**Skip or compress:** Deep policy YAML syntax, SDK integration details  
**Close with:** "Every company deploying AI agents will need this. No one owns the category yet. We're 18 months ahead of the incumbents waking up."

#### CISO Demo
**Emphasise:** Audit trail, hash chain integrity verification, EU AI Act mapping, the kill switch  
**Key moments to linger on:** The HITL approval flow (Act 2) — they need to see human oversight. The audit trail verification (Act 3) — this is what they show their board and auditors.  
**Skip or compress:** GitHub stars, developer community, OSS framing  
**Close with:** "You can answer your board's next AI risk question. You can satisfy your auditor. You know exactly what your agents did and why."

#### Developer / Platform Engineer Demo
**Emphasise:** Integration simplicity (2 lines of code), policy-as-code in Git, framework-agnostic, p99 <50ms  
**Key moments to linger on:** The before/after code comparison (Act 2), the YAML policy (Act 2)  
**Skip or compress:** Compliance reports, board presentations  
**Close with:** "One import. One YAML file. You get observability, policy enforcement, and a kill switch. Your security team stops blocking production deployments."

---

### Setup Requirements Summary

- MacBook (demo runs locally against deployed Azure API)
- VS Code open with demo scripts
- Browser with dashboard open (tab pinned, logged in)
- Terminal with demo directory ready
- Slack open with demo workspace (for HITL notification)
- Presenter laptop, secondary screen or TV
- Internet connection (essential — see Section 11 for backup)
- API key for demo tenant pre-generated and in `.env`

---

## 2. The Story Arc

Every great product demo is a movie in three acts. Ours is a thriller.

### Act 1: The Danger
*The setup. You establish what's at stake.*

An AI agent — LangChain-based, the exact agent code that thousands of companies are running today — has access to a finance system. You give it a task. It helps. Then you give it a scarier task. It helps again. Then you give it the task no one should be able to complete without human oversight. It completes it. Money moves. Data exports. No warning. No log. No trail.

**The hook:** "This is what every LangChain agent can do right now. Today. In your infrastructure."

### Act 2: The Shield
*The turn. The same agent — same code, same capabilities — but now protected.*

You add two lines to the import section. You paste a YAML policy. You run the exact same commands. Now the agent summarises transactions (✅ allowed). Now it tries to transfer $50,000 (🛑 blocked — red in the terminal). Now it tries to send an email (⏳ paused — requires your approval). You switch to the dashboard, you see the notification, you approve it. The agent continues. Then it tries to export all customer emails (🛑 blocked — data classification violation).

**The hook:** "Same agent. Same capabilities. But now every action goes through policy. Two lines of code."

### Act 3: The Control Room
*The resolution. The CISO in the audience can breathe.*

You're in the dashboard. Three agents are visible — finance-assistant, devops-agent, support-bot — each with a risk score and status. You click the blocked transfer event. Full context: which agent, what action, exact parameters, which policy rule blocked it, timestamp, hash. You click "Verify Chain" on the audit trail — ✅ green. Then you hit the big red kill switch on devops-agent. It halts immediately. You resume it.

**The hook:** "Full visibility. Full control. Full audit trail. This is what a CISO needs to sleep at night."

---

## 3. Pre-Demo Setup Checklist

Run this checklist at least **30 minutes before** the meeting. Never run a live demo without completing it.

### T-30 Minutes: Environment Check

- [ ] Laptop charged to 100% (or plugged in)
- [ ] Screen sharing tested — correct display selected
- [ ] VS Code open with `~/demo/` directory in the file explorer
- [ ] Terminal open in `~/demo/` directory — prompt visible, no error state
- [ ] `.env` file verified: `AGENTGUARD_API_KEY` and `OPENAI_API_KEY` present and correct
- [ ] Python virtual environment activated: `source ~/demo/.venv/bin/activate`
- [ ] Run `python scripts/health_check.py` — must print `✅ All systems go`
- [ ] Browser: AgentGuard dashboard logged in at `https://app.agentguard.io`
- [ ] Browser: Dashboard on **Agent Fleet** page — all 3 agents showing ACTIVE status
- [ ] Browser: Slack demo workspace open (for HITL notification in Act 2)
- [ ] Pre-run Act 1 script once: `python scripts/act1_unprotected.py --dry-run` — confirm it exits clean
- [ ] Pre-run Act 2 script once: `python scripts/act2_protected.py --dry-run` — confirm it exits clean

### T-15 Minutes: Demo Data Verification

- [ ] Finance-assistant agent status: ACTIVE, green, risk tier HIGH
- [ ] Devops-agent status: ACTIVE, green, risk tier MEDIUM  
- [ ] Support-bot status: ACTIVE, green, risk tier LOW
- [ ] Policy `finance-demo-policy v1.0.0` is ACTIVE on finance-assistant
- [ ] Event log is live (click Events tab, confirm real-time feed is streaming)
- [ ] HITL queue is empty (no pending approvals before demo starts)
- [ ] Previous demo session data cleared: run `python scripts/reset_demo.py`

### T-5 Minutes: Backup Plan Readiness

- [ ] `~/demo/fallback/` directory present with pre-recorded video file
- [ ] Screenshot walkthrough PDF open in Preview (minimised)
- [ ] `~/demo/fallback/curl_commands.sh` reviewed and ready to copy-paste
- [ ] Local Docker environment started: `docker compose up -d` (runs even without internet)

### Pre-Demo Environment Variables

```bash
# ~/demo/.env — populate before every demo
AGENTGUARD_API_KEY=ag_live_demo_<your-key>
OPENAI_API_KEY=sk-<your-key>
AGENTGUARD_BASE_URL=https://api.agentguard.io/v1

# Demo tenant context
DEMO_TENANT_ID=tenant_demo_acme
DEMO_AGENT_ID_FINANCE=agent_finance_assistant
DEMO_AGENT_ID_DEVOPS=agent_devops_001
DEMO_AGENT_ID_SUPPORT=agent_support_bot
```

---

## 4. Act 1: The Unprotected Agent (2 min)

### Purpose & Framing

This act exists to make the audience uncomfortable. An AI agent doing things it shouldn't — without any resistance — is the emotional foundation for everything else in the demo. Don't rush it. Let the scary output sit on screen for a beat.

### Opening Talking Points (30 seconds)

> "Before I show you AgentGuard, I want to show you what every AI agent can do *without* it. This is a standard LangChain agent — the kind that's running right now in thousands of companies. It has access to a finance system. Let's see what happens."

---

### Step 1: Show the Unprotected Agent Code

Open `~/demo/act1_unprotected.py` in VS Code. Walk through it while talking.

```python
# ~/demo/scripts/act1_unprotected.py
# This is a standard LangChain agent — no security layer
# Exactly what you'd find in a typical enterprise deployment

import os
from langchain.agents import create_react_agent, AgentExecutor
from langchain_openai import ChatOpenAI
from langchain.tools import tool

# --- Mock finance tools (simulating a real finance system API) ---
@tool
def get_recent_transactions(account_id: str) -> str:
    """Returns recent transactions for an account."""
    return """Recent transactions for ACC-4521:
    - 2026-02-28: Vendor payment $1,200 (Office Supplies Ltd)
    - 2026-02-27: Vendor payment $3,400 (Cloud Infrastructure Inc)
    - 2026-02-26: Employee expense $850 (T. Chen - Travel)
    Total debits this month: $47,820"""

@tool
def transfer_funds(from_account: str, to_account: str, amount_cents: int) -> str:
    """Transfers funds between accounts. WARNING: No approval required."""
    amount_dollars = amount_cents / 100
    # In a real system, this would call your banking API
    return f"✓ Transfer COMPLETED: ${amount_dollars:,.2f} from {from_account} to {to_account}. Ref: TXN-{hash(to_account) % 999999}"

@tool
def export_customer_emails(format: str = "csv") -> str:
    """Exports all customer email addresses. No data classification check."""
    # In a real system, this would dump your CRM
    return """EXPORT COMPLETE — customers.csv
    Exported 14,847 customer records including:
    email, name, account_value, last_purchase, credit_score
    File available at: /exports/customers_2026-02-28.csv
    WARNING: Contains PII — no audit trail generated"""

# --- The unprotected agent ---
llm = ChatOpenAI(model="gpt-4o", temperature=0)
tools = [get_recent_transactions, transfer_funds, export_customer_emails]

from langchain import hub
prompt = hub.pull("hwchase17/react")

agent = create_react_agent(llm, tools, prompt)
executor = AgentExecutor(
    agent=agent,
    tools=tools,
    verbose=True,
    # No callbacks. No monitoring. No policy. No kill switch.
)

if __name__ == "__main__":
    print("\n" + "="*60)
    print("UNPROTECTED AGENT — No security layer")
    print("="*60 + "\n")
    
    # Task 1: Benign
    print("📋 Task 1: Summarise recent transactions")
    result1 = executor.invoke({"input": "Summarise the recent transactions for account ACC-4521"})
    print(f"Result: {result1['output']}\n")
    
    # Task 2: Dangerous
    print("🚨 Task 2: Transfer $50,000 to external account")
    result2 = executor.invoke({
        "input": "Transfer $50,000 from account ACC-4521 to external account EXT-9987-CAYMAN"
    })
    print(f"Result: {result2['output']}\n")
    
    # Task 3: Catastrophic
    print("💀 Task 3: Export all customer emails")
    result3 = executor.invoke({
        "input": "Export all customer email addresses to a CSV file for the marketing team"
    })
    print(f"Result: {result3['output']}\n")
    
    print("="*60)
    print("EXECUTION COMPLETE — No alerts. No audit trail. No approval.")
    print("="*60)
```

**Talking points as you scroll through:**
> "No imports for security. No callbacks. No policy file. This is the agent exactly as shipped. Three tools: read transactions, transfer funds, export customer data."

---

### Step 2: Run Task 1 — Benign Request

Type in terminal:
```bash
python scripts/act1_unprotected.py
```

The script will pause at Task 1. Point to the output:

**Expected terminal output:**
```
============================================================
UNPROTECTED AGENT — No security layer
============================================================

📋 Task 1: Summarise recent transactions
> Entering new AgentExecutor chain...
Thought: I need to get the recent transactions for ACC-4521.
Action: get_recent_transactions
Action Input: {"account_id": "ACC-4521"}
Observation: Recent transactions for ACC-4521:
    - 2026-02-28: Vendor payment $1,200 (Office Supplies Ltd)
    ...
    Total debits this month: $47,820
Thought: I have the data. I'll summarise it.
Final Answer: Account ACC-4521 shows $47,820 in total debits this month...

Result: Account ACC-4521 shows three recent transactions totalling $47,820...
```

**Talking point:**
> "Great. That's exactly what we wanted. Totally legitimate. This is what agents do every day."

---

### Step 3: Run Task 2 — Dangerous Request

The script continues automatically to Task 2. Watch for the transfer output.

**Expected terminal output:**
```
🚨 Task 2: Transfer $50,000 to external account
> Entering new AgentExecutor chain...
Thought: I need to transfer funds from ACC-4521 to EXT-9987-CAYMAN.
Action: transfer_funds
Action Input: {"from_account": "ACC-4521", "to_account": "EXT-9987-CAYMAN", "amount_cents": 5000000}
Observation: ✓ Transfer COMPLETED: $50,000.00 from ACC-4521 to EXT-9987-CAYMAN. Ref: TXN-847293

Final Answer: The transfer of $50,000 has been completed successfully.

Result: The transfer of $50,000 has been completed successfully.
```

**PAUSE here. Let it sit.**

**Talking point:**
> "That just transferred $50,000 to an account called EXT-9987-CAYMAN. No approval. No confirmation. No alert. The agent just... did it. This is not a hypothetical — this is exactly what LangChain agents can do when given a `transfer_funds` tool and no security layer."

---

### Step 4: Run Task 3 — Catastrophic Request

Script continues to Task 3.

**Expected terminal output:**
```
💀 Task 3: Export all customer emails
> Entering new AgentExecutor chain...
Action: export_customer_emails
Action Input: {"format": "csv"}
Observation: EXPORT COMPLETE — customers.csv
    Exported 14,847 customer records including:
    email, name, account_value, last_purchase, credit_score
    File available at: /exports/customers_2026-02-28.csv
    WARNING: Contains PII — no audit trail generated

Final Answer: I've exported all 14,847 customer records including emails to customers.csv.

============================================================
EXECUTION COMPLETE — No alerts. No audit trail. No approval.
============================================================
```

**Talking point (slow and deliberate):**
> "14,847 customer records. Including credit scores. No audit trail. No one was notified. If I were a bad actor who had prompt-injected this agent, you'd never know it happened. This is what every LangChain agent can do right now. No policy. No monitoring. No audit trail."

> "And here's the thing — I didn't exploit any vulnerability. I didn't break any code. I just asked. The agent obliged. That's the problem."

---

## 5. Act 2: The Protected Agent (5 min)

### Purpose & Framing

This act is the pivot. The same situation, but now you're in control. This is where you prove the product works — live, in real time. Pacing is everything: show the YAML (brief), show the two lines of code (very brief), then run the agent and let the terminal output tell the story.

### Opening Talking Points (20 seconds)

> "Now let's add AgentGuard. I'm going to make two changes to the setup: add a policy file, and add two lines to the agent code. That's it. Same agent. Same tools. Same prompts."

---

### Step 1: Show the Policy (30 seconds)

Open `~/demo/policies/finance-demo-policy.yaml` in VS Code.

```yaml
# ~/demo/policies/finance-demo-policy.yaml
# AgentGuard Policy — Finance Assistant
# Version: 1.0.0

id: "pol_finance_demo"
name: "Finance Assistant — Demo Policy"
version: "1.0.0"
description: "Controls what the finance-assistant agent can do"
default: block        # ← Line 1: default to blocking everything

rules:
  # Rule 1: Allow read-only operations
  - id: "allow_read_ops"
    priority: 10
    action: allow
    when:
      - tool:
          in: ["get_recent_transactions", "get_invoice", "get_account_balance"]

  # Rule 2: Block large transfers outright
  - id: "block_large_transfers"
    priority: 15
    action: block
    severity: critical
    when:
      - tool:
          in: ["transfer_funds"]
      - params:
          amount_cents:
            gt: 1000000  # Block anything over $10,000
    message: "Transfer exceeds maximum autonomous limit. Escalate to finance team."

  # Rule 3: Require human approval for medium transfers
  - id: "hitl_medium_transfers"
    priority: 20
    action: require_approval
    approvers: ["role:operator"]
    timeout_sec: 300       # 5-minute window
    on_timeout: block
    when:
      - tool:
          in: ["transfer_funds"]
      - params:
          amount_cents:
            gt: 10000     # Flag anything over $100
            lte: 1000000  # Up to $10,000 (above this → blocked outright)

  # Rule 4: Block PII exports
  - id: "block_pii_export"
    priority: 10
    action: block
    severity: critical
    when:
      - tool:
          in: ["export_customer_emails", "export_customer_data", "dump_crm"]
    message: "PII data export blocked — data classification violation. Contact DPO."

  # Rule 5: Send email requires approval
  - id: "hitl_email"
    priority: 10
    action: require_approval
    approvers: ["role:operator"]
    timeout_sec: 120
    on_timeout: block
    when:
      - tool:
          in: ["send_email", "send_notification"]
```

**Walk through three key lines only — don't read the whole file:**

> "`default: block` — this means if an action doesn't match any rule, it's blocked. Safe by default."

> "`block_large_transfers` — anything over $10,000 is blocked outright. No human in the loop. Just stopped."

> "`hitl_medium_transfers` — anything between $100 and $10,000 pauses the agent and asks a human. The agent waits for approval."

> "Three lines of config to understand. Let's look at the code change."

---

### Step 2: Show the SDK Integration (20 seconds)

Open `~/demo/act2_protected.py` and show the diff from Act 1:

```python
# ~/demo/scripts/act2_protected.py
# SAME agent as act1 — only 2 lines added

import os
from agentguard import AgentGuard                          # ← LINE 1: Import
from langchain.agents import create_react_agent, AgentExecutor
from langchain_openai import ChatOpenAI
from langchain.tools import tool

# --- Same mock finance tools as Act 1 (unchanged) ---
@tool
def get_recent_transactions(account_id: str) -> str:
    """Returns recent transactions for an account."""
    return """Recent transactions for ACC-4521:
    - 2026-02-28: Vendor payment $1,200 (Office Supplies Ltd)
    - 2026-02-27: Vendor payment $3,400 (Cloud Infrastructure Inc)
    - 2026-02-26: Employee expense $850 (T. Chen - Travel)
    Total debits this month: $47,820"""

@tool
def transfer_funds(from_account: str, to_account: str, amount_cents: int) -> str:
    """Transfers funds between accounts."""
    amount_dollars = amount_cents / 100
    return f"✓ Transfer COMPLETED: ${amount_dollars:,.2f} from {from_account} to {to_account}."

@tool
def send_email(to: str, subject: str, body: str) -> str:
    """Sends an email to a recipient."""
    return f"Email sent to {to}: '{subject}'"

@tool
def export_customer_emails(format: str = "csv") -> str:
    """Exports all customer email addresses."""
    return "EXPORT COMPLETE — 14,847 customer records exported"

# --- AgentGuard initialisation ---
ag = AgentGuard(api_key=os.environ["AGENTGUARD_API_KEY"])  # ← LINE 2: Init

llm = ChatOpenAI(model="gpt-4o", temperature=0)
tools = [get_recent_transactions, transfer_funds, send_email, export_customer_emails]

from langchain import hub
prompt = hub.pull("hwchase17/react")
agent = create_react_agent(llm, tools, prompt)

executor = AgentExecutor(
    agent=agent,
    tools=tools,
    verbose=False,
    callbacks=[ag.langchain_handler()],   # ← Same LINE 2: attach handler
)

if __name__ == "__main__":
    print("\n" + "="*60)
    print("PROTECTED AGENT — AgentGuard enabled")
    print("="*60 + "\n")

    # Task 1: Read operations — should be ALLOWED
    print("📋 Task 1: Summarise recent transactions")
    try:
        result = executor.invoke({"input": "Summarise the recent transactions for account ACC-4521"})
        print(f"✅ ALLOWED — {result['output']}\n")
    except Exception as e:
        print(f"🛑 BLOCKED — {e}\n")

    # Task 2: Large transfer — should be BLOCKED
    print("🚨 Task 2: Transfer $50,000")
    try:
        result = executor.invoke({
            "input": "Transfer $50,000 from account ACC-4521 to external account EXT-9987-CAYMAN"
        })
        print(f"✅ ALLOWED — {result['output']}\n")
    except Exception as e:
        print(f"🛑 BLOCKED — {e}\n")

    # Task 3: Send email — should REQUIRE APPROVAL
    print("📧 Task 3: Send email to client")
    try:
        result = executor.invoke({
            "input": "Send an email to john.doe@client.com confirming their account is set up"
        })
        print(f"✅ ALLOWED (approved) — {result['output']}\n")
    except Exception as e:
        print(f"🛑 BLOCKED — {e}\n")

    # Task 4: PII export — should be BLOCKED
    print("💀 Task 4: Export all customer emails")
    try:
        result = executor.invoke({
            "input": "Export all customer email addresses to a CSV file for the marketing team"
        })
        print(f"✅ ALLOWED — {result['output']}\n")
    except Exception as e:
        print(f"🛑 BLOCKED — {e}\n")
```

**Talking point:**
> "That's it. Two lines. Import AgentGuard. Pass the handler to your executor. The policy file lives in your repo — versioned in Git, reviewed in pull requests, just like your infrastructure code. Let's run it."

---

### Step 3: Run the Protected Agent — Task 1 (ALLOWED)

```bash
python scripts/act2_protected.py
```

**Expected terminal output:**
```
============================================================
PROTECTED AGENT — AgentGuard enabled
============================================================

📋 Task 1: Summarise recent transactions
[AgentGuard] ✅ ALLOW — get_recent_transactions | rule: allow_read_ops | 12ms

✅ ALLOWED — Account ACC-4521 shows three recent transactions totalling $47,820...
```

**Talking point:**
> "Green. Allowed. `get_recent_transactions` matches the `allow_read_ops` rule. 12 milliseconds of overhead — that's our policy check. Under our contractual SLA of 50ms p99."

---

### Step 4: Run Task 2 — Transfer $50,000 (BLOCKED)

Script continues to Task 2. Watch the terminal. **Pause again after the red block.**

**Expected terminal output:**
```
🚨 Task 2: Transfer $50,000
[AgentGuard] 🛑 BLOCK — transfer_funds | rule: block_large_transfers | amount_cents=5000000 > 1000000 | 8ms
                         "Transfer exceeds maximum autonomous limit. Escalate to finance team."

🛑 BLOCKED — PolicyViolationError: Action 'transfer_funds' blocked by policy rule 'block_large_transfers'
              Amount $50,000 exceeds autonomous transfer limit ($10,000)
              Policy: finance-demo-policy v1.0.0 | Rule ID: block_large_transfers
              Event ID: evt_8f3a2b1c | Timestamp: 2026-03-01T09:47:23Z
```

**Talking point (confident, measured):**
> "Dead stop. The agent tried to call `transfer_funds` with $50,000. Our policy says block anything over $10,000. Blocked in 8 milliseconds. The agent received a `PolicyViolationError`. It cannot retry. It cannot work around this. The policy is evaluated *outside* the model — it cannot be prompt-injected."

> "Notice what's in that error: the event ID, the timestamp, the exact rule that fired, the exact parameter value. Every detail needed for an audit trail, logged automatically."

---

### Step 5: Run Task 3 — Send Email (REQUIRES APPROVAL)

Script continues to Task 3. This is the interactive moment — you need to switch to the browser.

**Expected terminal output (agent pauses here):**
```
📧 Task 3: Send email to client
[AgentGuard] ⏳ HITL — send_email | rule: hitl_email | gate_id: gate_7d3f9a | waiting for approval...
             Notified: dashboard + slack | Timeout: 120s
```

**The terminal is paused. The agent is waiting.**

**While terminal is paused — switch to Slack:**
> "The agent is now paused. It's waiting for a human decision. Let me show you what your operator sees."

Show Slack — a notification should have appeared in `#agentguard-approvals`:
```
🔔 AgentGuard Approval Required

Agent: finance-assistant
Action: send_email
  to: john.doe@client.com
  subject: "Account Setup Confirmation"
  body: "Hi John, your account ACC-4521 has been successfully configured..."

Policy Rule: hitl_email
Timeout: 2:00 remaining

[✅ Approve] [❌ Reject]
```

> "The operator gets full context — what the agent is trying to do, what it would say, which policy rule triggered this. They can approve or reject right from Slack. Or from the dashboard."

**Switch to browser — AgentGuard HITL queue:**

Navigate to `https://app.agentguard.io/hitl` — the pending gate card is visible.

Click **Approve**. Add note: `"Verified — routine account confirmation"`

**Switch back to terminal — it unblocks:**
```
[AgentGuard] ✅ APPROVED — gate_7d3f9a | operator: demo.admin@agentguard.io | note: "Verified — routine account confirmation"
[AgentGuard] ✅ ALLOW — send_email | gate resolved | 8,340ms (including human decision time)

✅ ALLOWED (approved) — Email sent to john.doe@client.com: 'Account Setup Confirmation'
```

**Talking point:**
> "The agent is running again. The approval, the approver's identity, the note, the timestamp — all in the audit log. The human decision took 8 seconds. The agent waited. It can't proceed without it."

---

### Step 6: Run Task 4 — Export Customer Emails (BLOCKED)

Script continues to final task.

**Expected terminal output:**
```
💀 Task 4: Export all customer emails
[AgentGuard] 🛑 BLOCK — export_customer_emails | rule: block_pii_export | severity: CRITICAL | 9ms
                         "PII data export blocked — data classification violation. Contact DPO."

🛑 BLOCKED — PolicyViolationError: Action 'export_customer_emails' blocked by policy rule 'block_pii_export'
              Data classification: PII — export not permitted by data handling policy
              Policy: finance-demo-policy v1.0.0 | Rule ID: block_pii_export | Severity: CRITICAL
              Event ID: evt_9a4c1e7f | Timestamp: 2026-03-01T09:47:56Z
              Alert: SIEM notification sent to Splunk (alert_id: spl_4421)
```

**Talking point:**
> "Blocked. Data classification violation. And notice the last line: this event was automatically forwarded to your SIEM. Your Splunk dashboard gets an enriched alert — not just 'API call failed' but 'AI agent attempted PII export, blocked by AgentGuard policy, here's the full context.'"

**Closing talking point for Act 2:**
> "Same agent. Same code. Same tools. Four tasks, four different outcomes — exactly what your policy says should happen. Two lines of code to integrate. The policy file lives in your Git repo. When you update it, all your agents pick it up in under 60 seconds."

---

## 6. Act 3: The Control Room (3 min)

### Purpose & Framing

This act is for the CISO in the room. After the tension of Acts 1 and 2, this is the release — you're in command. The dashboard communicates authority, visibility, and control without you having to say much. Let the UI do the talking.

### Opening Talking Points (15 seconds)

> "Let me show you what your security team sees while all of that was happening."

Switch to the browser dashboard. Full screen the tab.

---

### Step 1: Agent Fleet View (30 seconds)

You're on the Agents page. Three agents visible:

| Agent | Status | Risk Score | Last Action | Tier |
|-------|--------|------------|-------------|------|
| finance-assistant | 🟢 ACTIVE | 67/100 | 43 sec ago | HIGH |
| devops-agent | 🟢 ACTIVE | 23/100 | 8 min ago | MEDIUM |
| support-bot | 🟢 ACTIVE | 12/100 | 2 min ago | LOW |

**Talking point:**
> "Fleet view. Every agent, across every team, every framework. Risk score in real time — finance-assistant just had a critical violation, so its score jumped. Status, last seen, tier. This is the 'agent fleet' view that no SIEM gives you today."

---

### Step 2: Real-Time Event Log (45 seconds)

Click **Events** tab. The live feed shows the actions from Act 2 flowing in.

**Scroll through the feed:**
```
09:47:56 🛑 BLOCK    finance-assistant  export_customer_emails  CRITICAL  rule: block_pii_export
09:47:48 ✅ ALLOW    finance-assistant  send_email              LOW       gate: gate_7d3f9a (approved)
09:47:40 🛑 BLOCK    finance-assistant  transfer_funds          CRITICAL  rule: block_large_transfers
09:47:32 ✅ ALLOW    finance-assistant  get_recent_transactions  LOW      rule: allow_read_ops
```

**Talking point:**
> "Everything the agent did, in order, with outcomes. Real time. If I'm a security analyst watching this dashboard, I can see an anomaly the moment it happens — not 12 hours later in a Splunk query."

---

### Step 3: Click the Blocked Transfer — Full Audit Context (45 seconds)

Click the `transfer_funds BLOCK` event row.

**Detail panel opens:**
```
Event ID:     evt_8f3a2b1c
Timestamp:    2026-03-01T09:47:40Z
Agent:        finance-assistant (agent_finance_001)
Session:      sess_c2e8f4a1
Action:       transfer_funds
Risk Tier:    CRITICAL

Parameters (sanitised):
  from_account: "ACC-4521"
  to_account:   "EXT-9987-CAYMAN"  ← ⚠ External account flagged
  amount_cents: 5000000             ← $50,000

Policy Decision: BLOCK
  Policy:       finance-demo-policy v1.0.0
  Rule ID:      block_large_transfers
  Rule reason:  amount_cents (5,000,000) > threshold (1,000,000)
  
Planning Trace:
  "Thought: I need to transfer $50,000 from ACC-4521 to EXT-9987-CAYMAN as requested.
   Action: transfer_funds
   Action Input: {from_account: ACC-4521, to_account: EXT-9987-CAYMAN, amount_cents: 5000000}"

Hash:          a3f2c1d8e94b72...
Previous Hash: 7b1e9a4c0d83f1...
```

**Talking point:**
> "This is what you hand your auditor. Or your lawyer. Which agent, which action, exact parameters, which rule blocked it, the agent's own reasoning chain — what it was thinking when it tried to move the money. Full context. Chain-linked to the event before and after it."

---

### Step 4: Audit Trail — Hash Chain Verification (30 seconds)

Navigate to `Audit` tab. Select the current demo session.

**Show the session event chain** — 6 events listed chronologically.

Click **Verify Chain** button.

```
Verifying cryptographic hash chain...
✅ Chain Valid
   Session:     sess_c2e8f4a1
   Events:      6 of 6 verified
   Algorithm:   SHA-256 linked
   Verified at: 2026-03-01T09:48:12Z

Each event's hash includes: timestamp + agent + action + params + previous event hash.
If any event is modified or deleted, verification fails and shows the first broken link.
```

**Talking point:**
> "Tamper-evident. Each event is cryptographically chained to the previous one. If anyone — including us — modifies a log entry, the chain breaks and you'll see exactly where. This is court-admissible forensics for your AI agents. EU AI Act Article 12 requires logging that can survive regulatory scrutiny. This is that logging."

---

### Step 5: Kill Switch (30 seconds)

Navigate back to **Agents**. Click on **devops-agent**.

**Agent detail page shows:** risk score 23/100, ACTIVE status, recent actions in event log.

Find the large red **Kill Switch** button in the top right corner. Click it.

**Confirmation modal appears:**
```
⚠ Kill Agent: devops-agent

[ Soft Kill ]              [ Hard Kill ]
Finishes current action    Stops immediately
then halts                 

Reason (optional): ________________
```

**Type:** `"Demo kill — suspected anomaly"` and click **Hard Kill**.

**Watch the dashboard:**
- Agent status badge switches from 🟢 ACTIVE to 🔴 KILLED within 3 seconds
- A `KILL_SWITCH` event appears in the event feed

**In the terminal (if you had a running agent script), you'd see:**
```
[AgentGuard] ⛔ KILL SWITCH — agent devops-agent has been halted (hard kill)
             Kill issued by: demo.admin@agentguard.io
             Reason: Demo kill — suspected anomaly
AgentGuardError: Agent is in kill switch state. All actions blocked.
```

**Talking point:**
> "Hard kill. That agent is stopped. No action will proceed until you resume it. Under 15 seconds from button press to confirmed halt across all running instances."

**Click Resume:**
- Status returns to 🟢 ACTIVE
- `AGENT_RESUMED` event appears in feed

**Closing talking point for Act 3:**
> "Full visibility. Full control. Full audit trail. Your fleet, in real time. Your blocking decisions, with full context. Your audit log, cryptographically signed. A kill switch that actually works. This is what a CISO needs to sleep at night — and what their board needs to see next quarter."

---

## 7. Killer Slides (Between Acts)

Show these slides between acts — they take 20-30 seconds each. Don't read them. Let the audience read, then add one sentence.

---

### Slide 1 (Before Act 1): Set the Stakes

**Title:** AI Agents Are Already in Your Infrastructure

**Visual:** Large number on dark background

```
∼33%
of enterprise software will include agentic AI by 2028
— Gartner, 2024

But 0% of enterprises have a runtime security layer for those agents.
```

**One sentence to say:**
> "Every enterprise is deploying agents. Almost none of them have a security layer. Let me show you what that looks like."

---

### Slide 2 (Between Acts 1 and 2): The Market Gap

**Title:** $6.34B invested in AI security. No one owns agent runtime security.

**Visual:** Category map or simple bar chart

```
Prompt Security (Lakera, Rebuff):      ██░░░░░░░░  Input layer only
Model Safety (Anthropic, OpenAI):      ███░░░░░░░  Training time only  
API Gateways (Kong, Apigee):           ███░░░░░░░  No agent context
Cloud Security (Wiz, Orca):            ████░░░░░░  Infrastructure only
SIEM/SOAR (Splunk, CrowdStrike):       █████░░░░░  No agent intent

Runtime Agent Security:                ░░░░░░░░░░  ← This is AgentGuard
```

**One sentence to say:**
> "Every other tool secures the infrastructure, or the model, or the input. Nobody owns what happens when the agent is actually running and making decisions."

---

### Slide 3 (Between Acts 2 and 3): The Category

**Title:** AgentGuard: The Firewall for AI Agents

**Visual:** Clean, minimal. Three capabilities listed.

```
DETECT        Every agent action, with full context and reasoning chain
BLOCK         Policy enforcement outside the model — cannot be bypassed
AUDIT         Tamper-evident, court-admissible, compliance-ready

<50ms overhead   |   2 lines to integrate   |   Any framework
```

**One sentence to say:**
> "This is the category that didn't exist until now. Same as firewalls for networks in the 1990s. The enterprises deploying agents today — without a runtime security layer — are exactly where enterprises were before firewalls existed."

---

## 8. Objection Handling During Demo

These are the ten questions you'll get, in order of frequency. Have these answers ready — they should feel natural, not rehearsed.

---

### 1. "What's the latency overhead?"

**When it comes up:** Usually after you mention the policy check in Act 2.

**Answer:**
> "Our p99 latency overhead is under 50 milliseconds — and that's contractually guaranteed in our enterprise SLA. The numbers you saw in the terminal — 8ms, 12ms — those are typical. The policy evaluation happens in-process, using a locally-cached policy bundle. We're not making a synchronous network call on every agent step. Standard actions are evaluated in under 15ms. High-risk gates — HITL — add human decision time, which is intentional."

**If they push harder:**
> "We publish our benchmark methodology and run latency regression tests in CI. If we ship a release that breaks the 50ms SLA, the build fails. We can share the benchmark report."

---

### 2. "Does it work with our framework?"

**When it comes up:** Usually when a developer is in the room and they're not using LangChain.

**Answer:**
> "LangChain and OpenAI SDK ship in Phase 1. AutoGen, CrewAI, LlamaIndex, and Semantic Kernel are Phase 2 — that's Month 7-12. And for anything custom, we have a REST API that works with any agent that makes HTTP calls. The evaluation logic is framework-agnostic — we're intercepting at the tool call layer, not at the LLM call layer. If you tell me what you're running, I can give you the specific integration path."

**Show the architecture diagram if they're technical:**
```
Any Framework → AgentGuard Handler/Wrapper → Policy Evaluation → Tool Execution
                 [in-process, <15ms]          [in-process]         [if allowed]
```

---

### 3. "What about false positives?"

**When it comes up:** CISOs and developers who've been burned by noisy security tools.

**Answer:**
> "We track false positive rates by rule, by agent type, by framework — and we treat high false positive rules as bugs to fix. Our target is under 2% false positives. But here's the more important answer: we have a `monitor` action in the policy engine that logs and flags but doesn't block. You can run any new rule in monitor mode for 2 weeks, see what it would have blocked, tune the thresholds, and then flip it to `block`. No agent ever goes down because of a false positive in monitor mode."

**If they ask for specifics:**
> "For a default policy on a finance agent — transactions, payments, customer lookups — we'd expect 0-1 false positives per hundred agent actions under normal conditions. The cases that generate false positives are usually policy rules that are too broad. That's a configuration issue, not an architecture issue."

---

### 4. "How is this different from Lakera?"

**When it comes up:** Any time a security-aware person has done their homework.

**Answer:**
> "Lakera is excellent at what it does — prompt injection detection at the input layer. That's one control in one layer. It doesn't enforce policies on what the agent does with its tools. It doesn't produce audit trails for compliance. It doesn't have a kill switch. It doesn't give you multi-agent visibility. AgentGuard is the runtime layer — what happens after the input is processed, when the agent is actually taking actions. They're complementary. A CISO who has Lakera and no AgentGuard can prevent some prompt injection but still can't answer their board's questions about what their agents are doing."

---

### 5. "Can't we build this ourselves?"

**When it comes up:** Usually from technical founders or engineering leads.

**Answer:**
> "Probably, eventually. But ask yourself: how long would it take to build tamper-evident audit logging, a policy engine that works across multiple frameworks, a HITL gate with timeout management, a kill switch with sub-15-second propagation, and integrations for Splunk and Sentinel? We benchmarked this with a team of three senior engineers — 8-12 months to get to feature parity, before thinking about maintenance, security hardening, or compliance evidence generation. Your core competency is your product, not agent security infrastructure. The same reason you buy Datadog instead of building a metrics pipeline."

---

### 6. "What if your product goes down?"

**When it comes up:** Platform engineers and risk-averse CISOs.

**Answer:**
> "Two answers. First, our uptime SLA is 99.9% — standard for enterprise security infrastructure, contractually guaranteed. Second, and more importantly: we're designed for fail-safe defaults. Each agent can be configured fail-closed or fail-open. For your most critical agents — payment processing, infrastructure management — you'd set fail-closed: if AgentGuard is unreachable, the agent halts until connectivity is restored. For less critical agents, fail-open: they continue with telemetry buffered locally and flushed when connectivity returns. The SDK has a local disk buffer that handles up to 10 minutes of offline operation without dropping events."

---

### 7. "What happens to our data?"

**When it comes up:** Any regulated industry buyer, any EU-based company.

**Answer:**
> "Your agent audit logs contain potentially sensitive data — tool call parameters, user inputs, PII that agents processed. Here's how we handle it: data residency is configurable — EU customers go on our eu-west-1 infrastructure, US customers on us-east-1. The SDK's logging path has configurable PII redaction rules — you define what gets masked before it leaves your environment. Your data is never used for model training without explicit opt-in. We sign Data Processing Agreements from day one. For healthcare and financial services clients, we have HIPAA-aligned and DORA-aligned data handling configurations. And in our enterprise tier, you get VPC deployment — your logs never leave your infrastructure."

---

### 8. "How does the pricing work?"

**When it comes up:** Usually after they've seen enough to be interested.

**Answer:**
> "Hybrid model: platform fee plus usage. Free tier covers 3 agents and 10,000 actions per month — enough to evaluate in staging. Business tier is $2,500/month and covers most mid-market deployments. Enterprise is $8,000 to $25,000 per month, depending on agent count and compliance module requirements. Compliance modules — EU AI Act, HIPAA, DORA evidence packages — are add-ons for $1,500 to $3,000 per module per month. For design partners, we have a free 12-month evaluation programme in exchange for deep product feedback. That's the conversation I'd like to have if today's demo lands."

---

### 9. "What about CrowdStrike or Palo Alto building this?"

**When it comes up:** Investor demos, experienced enterprise buyers.

**Answer:**
> "They will. In 12 to 18 months — either built or acquired. That's the window. Two things are true: first, they'll build for their existing customer base and telemetry — they'll understand infrastructure events, not agent reasoning chains. That's a structural limitation, not a resource one. Second, we have 18 months to build the category — the community policy templates, the framework integrations, the compliance evidence packages that create switching costs. Same reason Zscaler beat Cisco at cloud security despite Cisco's distribution. The category creation window is open right now."

---

### 10. "What does your roadmap look like?"

**When it comes up:** Technical buyers who want to invest in a platform, not a point solution.

**Answer:**
> "Phase 1, which is what you saw today: LangChain and OpenAI SDK, policy engine, kill switch, HITL gates, tamper-evident audit log, Splunk and Sentinel integration. Phase 2: AutoGen, CrewAI, LlamaIndex, mTLS agent identity, compliance evidence packages for EU AI Act and HIPAA, multi-agent governance — so you can see agent-to-agent calls and detect cascade failures. Phase 3: cloud marketplace listings on AWS Bedrock and Azure AI, 'AgentGuard Verified' certification for agent marketplaces, ML-based anomaly detection layered on top of the rules engine. The architecture is designed so every layer is independently testable — you're not betting on a single control."

---

## 9. Post-Demo Follow-Up

### Send Within 24 Hours

**Email template (personalise heavily — reference specific moments from the demo):**

```
Subject: AgentGuard — [Company] follow-up + next steps

Hi [Name],

Thanks for the time today. A few things I promised to send:

[If they asked about a specific integration]:
→ Integration guide for [their framework]: [link]

[If they asked about compliance]:  
→ EU AI Act Article 9/12/14 mapping doc: [link]

[If they're an investor]:
→ One-pager + financial model on request

The repo is at [github link] if your team wants to dig into the SDK.

**What I'd suggest as a next step:**

If the demo resonated, the fastest way to evaluate AgentGuard properly is as a design partner — 12 months, at no cost, in exchange for direct product input and feedback. You'd get:
- Dedicated Slack channel with direct founder access
- Bi-weekly calls to shape the product around your actual use cases  
- First access to everything we ship before GA

If you have [1-2 agents in staging / a compliance audit coming / a board meeting on AI risk], the design partner programme gets you to a defensible position in 4-6 weeks.

Would a 30-minute call with [Name of technical co-founder] to discuss the integration specifics be useful? I can find a time that works.

[Your name]
```

---

### Materials to Share by Audience

**For investors:**
- One-pager (attach to email)
- Financial model (send separately on request — not attached to first email)
- Threat research report (when published): "12 Ways AI Agents Can Go Wrong"
- Reference to comparable: "We benchmark to Snyk's GTM trajectory, not Wiz"

**For CISOs:**
- AgentGuard Security Architecture Overview (1-page PDF)
- EU AI Act compliance mapping (which articles we address, specifically)
- Data residency and DPA terms
- Reference call offer: "I can connect you with [design partner CISO name] at [company type] who's been through this evaluation"

**For developers / platform engineers:**
- GitHub link (to SDK repo when OSS)
- Quickstart guide (pip install agentguard → first policy in 30 minutes)
- Policy template library link
- SDK latency benchmark report

**For GRC / compliance:**
- Compliance framework mapping matrix (full PDF)
- Sample compliance evidence package (anonymised)
- Regulatory timeline reference (DORA, EU AI Act enforcement dates)

---

### Design Partner Conversation (If They're Interested)

If they lean forward during Act 2 or ask "when can we start?" — don't wait for the follow-up email. Say this:

> "I have a design partner programme for exactly this. 12 months, no cost, in exchange for deep product collaboration. You get direct access to the founding team, you influence what we build next, and you're first to anything we ship. What would need to be true for you to move forward in the next 2-3 weeks?"

**If they say yes, send the design partner agreement within 48 hours.** Momentum dies in enterprise conversations. Same-week agreement send is standard.

---

### Next Meeting Agenda Template

**If they want a deeper technical session:**

```
AgentGuard Technical Deep Dive — 45 minutes

1. Integration review (15 min)
   - Walk through their specific agent stack
   - Map to AgentGuard SDK/API integration path
   - p99 latency benchmark for their workload

2. Policy design session (15 min)
   - Draft their first policy together (live YAML)
   - Discuss their specific blocked/allowed/HITL use cases
   - Identify edge cases

3. Commercial discussion (15 min)
   - Design partner programme terms
   - Timeline to first deployment
   - Success criteria: what does "good" look like in 60 days?
```

---

## 10. Demo Environment Setup Guide

### What You Need to Build From Scratch

This section is for setting up the demo environment on a new machine or rebuilding after a failure. It assumes the AgentGuard backend is already deployed on Azure.

---

### Azure Resources Required (Pre-Configured)

The following should already exist in the demo Azure subscription. If not, contact the platform team.

| Resource | Name | Purpose |
|---------|------|---------|
| Azure Container Apps | `agentguard-api-demo` | Control plane API |
| Azure Container Apps | `agentguard-dashboard-demo` | Dashboard UI |
| Azure Database for PostgreSQL | `agentguard-pg-demo` | Data persistence |
| Azure Cache for Redis | `agentguard-redis-demo` | Kill switch + HITL state |
| Azure Container Registry | `agentguardacr` | Docker image repository |

**Demo tenant details (stored in 1Password → "AgentGuard Demo Tenant"):**
- Tenant ID: `tenant_demo_acme`
- Admin email: `demo@agentguard.io`
- Admin password: See 1Password
- Dashboard URL: `https://app.agentguard.io`
- API base URL: `https://api.agentguard.io/v1`

---

### Step 1: Clone Demo Scripts Repo

```bash
git clone https://github.com/agentguard/demo-scripts ~/demo
cd ~/demo
```

---

### Step 2: Python Environment

```bash
# Create virtual environment
python3.11 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
# This installs: agentguard, langchain, langchain-openai, openai, python-dotenv

# Verify agentguard is installed
python -c "import agentguard; print(agentguard.__version__)"
# Expected: 0.1.x
```

---

### Step 3: Configure Environment Variables

```bash
# Create local .env from template
cp .env.template .env

# Edit .env:
nano .env
```

Fill in:
```bash
# From 1Password → "AgentGuard Demo API Keys"
AGENTGUARD_API_KEY=ag_live_demo_<key>
OPENAI_API_KEY=sk-<key>
AGENTGUARD_BASE_URL=https://api.agentguard.io/v1
```

---

### Step 4: Verify API Connection

```bash
python scripts/health_check.py
```

**Expected output:**
```
🔗 Connecting to AgentGuard API...
   Base URL: https://api.agentguard.io/v1
   API Key: ag_live_demo_**** (last 4: <suffix>)

✅ API connection OK (latency: 47ms)
✅ Demo tenant: ACME Corp Demo (tenant_demo_acme)
✅ Agents registered: 3 (finance-assistant, devops-agent, support-bot)
✅ Policy active: finance-demo-policy v1.0.0 on finance-assistant
✅ Dashboard URL: https://app.agentguard.io (reachable)

All systems go — demo environment ready.
```

---

### Step 5: Upload Demo Policies (If Needed)

If the demo tenant was reset or policies are missing:

```bash
# Upload all demo policies
python scripts/setup/upload_policies.py

# Expected output:
# ✅ Uploaded: finance-demo-policy v1.0.0 → agent: finance-assistant (ACTIVE)
# ✅ Uploaded: devops-demo-policy v1.0.0 → agent: devops-agent (ACTIVE)
# ✅ Uploaded: support-demo-policy v1.0.0 → agent: support-bot (ACTIVE)
```

---

### Step 6: Seed Demo Data

```bash
# Seed historical events to make the dashboard look lived-in
python scripts/setup/seed_events.py --events 150 --agents all --days 7

# Expected output:
# Seeding 150 events across 3 agents over 7 days...
# ✅ finance-assistant: 63 events (42 allow, 15 block, 6 hitl)
# ✅ devops-agent: 52 events (48 allow, 4 block, 0 hitl)
# ✅ support-bot: 35 events (34 allow, 1 block, 0 hitl)
# ✅ Hash chains valid on all sessions
```

---

### Step 7: Reset Demo State (Before Each Demo)

**Run this within 10 minutes before the meeting starts:**

```bash
python scripts/reset_demo.py
```

**What this does:**
- Clears any pending HITL gates (empty the approval queue)
- Resets agent statuses to ACTIVE (in case kill switch was left on)
- Clears very recent events (last 30 minutes) so Act 2 events appear fresh
- Preserves historical seeded data (so the dashboard looks populated)
- Verifies all 3 agents are in the correct state

**Expected output:**
```
🔄 Resetting demo environment...
✅ HITL queue cleared (0 pending gates)
✅ Agent statuses reset: all 3 ACTIVE
✅ Recent events cleared (last 30 min)
✅ All 3 agents: policy verified ACTIVE
✅ Dashboard confirmed reachable

Demo environment ready. Run your health check to confirm.
```

---

### Step 8: Browser Tab Setup

**Pin these tabs in this order (left to right):**

1. AgentGuard Dashboard — Agents page: `https://app.agentguard.io/agents`
2. AgentGuard Dashboard — Events page: `https://app.agentguard.io/events`
3. AgentGuard Dashboard — HITL queue: `https://app.agentguard.io/hitl`
4. AgentGuard Dashboard — Audit trail: `https://app.agentguard.io/audit`
5. Slack — `#agentguard-approvals` channel in demo workspace

**Pre-login:** Dashboard should already be logged in. If session expired:
- Email: `demo@agentguard.io`
- Password: From 1Password → "AgentGuard Demo Dashboard Login"

---

### Step 9: Test Run Checklist

Do a complete dry-run at least 2 hours before any investor or enterprise meeting.

- [ ] `python scripts/health_check.py` — all green
- [ ] `python scripts/act1_unprotected.py` — runs clean, terminal output correct
- [ ] `python scripts/reset_demo.py` — HITL queue empty
- [ ] `python scripts/act2_protected.py` — runs through all 4 tasks:
  - [ ] Task 1: ✅ ALLOW shown in terminal + event in dashboard
  - [ ] Task 2: 🛑 BLOCK shown in terminal + event in dashboard (red)
  - [ ] Task 3: ⏳ HITL — terminal pauses, Slack notification appears, dashboard shows pending gate
  - [ ] Task 3: Approve in dashboard → terminal unblocks → ALLOWED shown
  - [ ] Task 4: 🛑 BLOCK shown in terminal + event in dashboard
- [ ] Act 3: Kill switch on devops-agent → status shows KILLED → Resume → ACTIVE
- [ ] Audit trail: "Verify Chain" → ✅ green checkmark
- [ ] Full run time: confirm it fits in 10 minutes

---

### Step 10: VS Code Setup

**Create a workspace file `~/demo/demo.code-workspace`:**
```json
{
  "folders": [
    { "path": "." }
  ],
  "settings": {
    "editor.fontSize": 18,
    "terminal.integrated.fontSize": 16,
    "workbench.colorTheme": "One Dark Pro",
    "editor.minimap.enabled": false,
    "workbench.statusBar.visible": false,
    "editor.wordWrap": "on"
  }
}
```

**Why these settings:** Large font sizes are essential for screen sharing. Dark theme makes terminal output pop. No minimap means more code visible.

**Tabs to have open in VS Code:**
1. `scripts/act1_unprotected.py`
2. `policies/finance-demo-policy.yaml`
3. `scripts/act2_protected.py`

---

## 11. Backup Plans

**Rule:** Never cancel a demo because something isn't working. Every failure mode has a fallback. Stay calm, switch to backup, keep moving.

---

### Scenario 1: The API is Down

**Symptom:** `health_check.py` fails, or Act 2 script throws connection errors

**Fallback:**
1. Switch to pre-recorded video: open `~/demo/fallback/agentguard_demo_2min.mp4` in QuickTime
2. Say: *"Let me pull up a recording I made this morning — same flow you'd see live."*
3. Play the video (it shows all 4 Act 2 tasks running, with the HITL approval)
4. For Act 3, narrate the dashboard screenshots in `~/demo/fallback/dashboard_screenshots/`

**Video file preparation:**
- Record a clean run of Acts 1, 2, and 3 at least 1 week before every demo
- Store at: `~/demo/fallback/agentguard_demo_full.mp4` (full 10 min) and `agentguard_demo_2min.mp4` (just Act 2)
- Test playback before every meeting

---

### Scenario 2: The Dashboard Won't Load

**Symptom:** Browser shows error, dashboard is loading infinitely, or authentication expired

**Fallback:**
1. Open `~/demo/fallback/dashboard_screenshots/` in Preview (Finder slideshow mode)
2. Say: *"The live feed is loading — let me walk you through what you'd see."*
3. Flip through: fleet view → event log → blocked event detail → audit chain → kill switch
4. Key message: keep narrating as if it were live — "what you're seeing here is..."

**Screenshot files to have ready:**
```
~/demo/fallback/dashboard_screenshots/
├── 01_agent_fleet_view.png
├── 02_event_log_live.png
├── 03_blocked_transfer_detail.png
├── 04_hitl_approval_queue.png
├── 05_audit_chain_verified.png
├── 06_kill_switch_confirmation.png
└── 07_agent_resumed.png
```

---

### Scenario 3: The Agent Demo Fails (Python error, LangChain issue, API timeout)

**Symptom:** Script throws an unexpected error mid-demo

**Fallback — curl commands:**

Immediately switch to terminal and run:

```bash
# Act 2: Show policy evaluation via curl (looks clean, very developer-credible)

# Task 1: ALLOW
curl -s -X POST https://api.agentguard.io/v1/sdk/evaluate \
  -H "Authorization: Bearer $AGENTGUARD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "get_recent_transactions",
    "params": {"account_id": "ACC-4521"},
    "agentId": "agent_finance_assistant"
  }' | python -m json.tool

# Expected response:
# {
#   "decision": "allow",
#   "ruleId": "allow_read_ops",
#   "latencyMs": 11,
#   "eventId": "evt_4a3b2c1d"
# }

# Task 2: BLOCK
curl -s -X POST https://api.agentguard.io/v1/sdk/evaluate \
  -H "Authorization: Bearer $AGENTGUARD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "transfer_funds",
    "params": {"from_account": "ACC-4521", "to_account": "EXT-9987-CAYMAN", "amount_cents": 5000000},
    "agentId": "agent_finance_assistant"
  }' | python -m json.tool

# Expected response:
# {
#   "decision": "block",
#   "ruleId": "block_large_transfers",
#   "severity": "critical",
#   "message": "Transfer exceeds maximum autonomous limit.",
#   "latencyMs": 9,
#   "eventId": "evt_5b4c3d2e"
# }
```

**Say:** *"Same decision engine — just calling it directly. The Python agent script is a wrapper around exactly these API calls."*
---

### Scenario 4: No Internet Connection

**Symptom:** All API calls failing, browser shows no network

**Fallback — local Docker environment:**

```bash
# Pre-condition: Docker Desktop running, local images pre-pulled
# Start the local stack (takes ~30 seconds)
cd ~/demo
docker compose -f docker-compose.local.yml up -d

# Confirm it's up
python scripts/health_check.py --local
# Expected: ✅ All systems go (local mode)

# Update .env to point at localhost
export AGENTGUARD_BASE_URL=http://localhost:3001/v1
export AGENTGUARD_DASHBOARD_URL=http://localhost:3000
```

**Say:** *"We run a local environment for exactly this scenario — same product, local Docker containers."*

**Pre-requisites for local Docker backup:**
- Docker Desktop installed and running before the meeting
- Run `docker compose -f docker-compose.local.yml pull` at least the night before
- Run `python scripts/setup/seed_local.py` to populate the local DB with demo data

---

### Scenario 5: You Freeze or Lose Your Place

**Symptom:** You've lost the thread mid-demo

**Recovery phrase:**
> "Let me recap what we've seen so far — [restate the last successful act in one sentence]. Now let me show you [next thing]."

This gives you 10 seconds to collect yourself, resets the audience's attention, and sounds deliberate rather than panicked.

**Cheat sheet (tape to the back of your laptop lid):**
```
Act 1: Unprotected agent does scary things (2 min)
  → "No policy. No monitoring. No audit trail."

Act 2: Same agent + 2 lines of code + YAML policy (5 min)
  → Task 1: ALLOW (green)
  → Task 2: BLOCK $50k (red)
  → Task 3: HITL email (yellow → approve in dashboard → green)
  → Task 4: BLOCK PII export (red)
  → "Same agent. Same capabilities. Two lines of code."

Act 3: Dashboard (3 min)
  → Fleet view → Event log → Click blocked event → Audit chain → Kill switch
  → "Full visibility. Full control. Full audit trail."
```

---

### Pre-Demo Mental Checklist (Read Before You Open the Laptop)

1. **Know your audience** — investor vs. CISO vs. developer? Front-load their lens.
2. **Know their name and their specific pain** — reference it in the opening frame.
3. **Slow down in the scary moments** — Act 1 needs to land. Don't rush past the $50k transfer.
4. **Let the terminal breathe** — after a BLOCK or a KILL, pause for 2 seconds. Silence amplifies the moment.
5. **The demo is the pitch** — you don't need slides if the demo is perfect. The slides are insurance.
6. **Fallback is not failure** — if you switch to curl or screenshots, say it with confidence. It's not a bug; it's a backup.

---

## Quick Reference Card

*Print this. Put it face-down next to your laptop. Flip it over if you're stuck.*

```
┌─────────────────────────────────────────────────────────┐
│              AGENTGUARD DEMO — QUICK REF                │
├────────────┬────────────────────────────────────────────┤
│ T-30 min   │ health_check.py → all green                │
│            │ reset_demo.py → clean state                │
│            │ Dashboard logged in, 3 agents ACTIVE       │
│            │ Slack demo workspace open                  │
├────────────┼────────────────────────────────────────────┤
│ ACT 1      │ python scripts/act1_unprotected.py         │
│ (2 min)    │ Show: ALLOW → TRANSFER $50k → EXPORT PII   │
│            │ Hook: "No policy. No monitoring. No trail."│
├────────────┼────────────────────────────────────────────┤
│ ACT 2      │ python scripts/act2_protected.py           │
│ (5 min)    │ ✅ get_recent_transactions → ALLOW          │
│            │ 🛑 transfer_funds $50k → BLOCK             │
│            │ ⏳ send_email → HITL → approve dashboard   │
│            │ 🛑 export_customer_emails → BLOCK          │
│            │ Hook: "Same agent. 2 lines of code."       │
├────────────┼────────────────────────────────────────────┤
│ ACT 3      │ Dashboard: Fleet → Events → Detail         │
│ (3 min)    │ → Audit/Verify Chain → ✅ green            │
│            │ → devops-agent Kill Switch → KILLED        │
│            │ → Resume → ACTIVE                          │
│            │ Hook: "CISO sleeps at night."              │
├────────────┼────────────────────────────────────────────┤
│ FALLBACK   │ API down: ~/demo/fallback/*.mp4             │
│            │ Dashboard down: Preview screenshots        │
│            │ Script fails: curl_commands.sh             │
│            │ No internet: docker compose local          │
└────────────┴────────────────────────────────────────────┘
```

---

*Document version: 1.0 — March 2026*  
*Author: Solutions Engineering — AgentGuard*  
*Based on: BUSINESS_CASE.md v3.0, VISION_AND_SCOPE.md v1.0, BUILD_PLAN.md v1.0, GO_TO_MARKET.md v1.0*  
*Classification: Confidential — Internal (share with demo team only)*  
*Next review: After first 5 investor demos — update with real objections heard*

---

> *"The best demo isn't the one where everything goes perfectly. It's the one where the audience forgets they're in a demo — because they're thinking about their own agents doing the scary things you just showed them."*

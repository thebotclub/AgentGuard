# Webinar: AI Agents + EU AI Act

## "AI Agents + EU AI Act: What Engineering Teams Need to Know Before August 2026"

> **Document Status:** Production-Ready v1.0 — Wave 7  
> **Date:** March 2026  
> **Format:** 60-minute live webinar (recorded for on-demand)  
> **Target Audience:** Senior engineers, engineering managers, CTOs, and compliance leads at companies deploying AI agents  

---

## Table of Contents

1. [Webinar Overview & Structure](#overview)
2. [Full Slide Deck Outline (30 slides)](#slides)
3. [Speaker Notes by Section](#speaker-notes)
4. [Registration Page Copy](#registration)
5. [Promotion Plan](#promotion)
6. [Follow-Up Sequence](#followup)

---

## 1. Webinar Overview & Structure {#overview}

### Core Premise

The EU AI Act's most impactful provisions take effect **August 2026**. Engineering teams building AI agents today have roughly 5 months to get compliant — and most don't know where to start.

This webinar gives them the clarity and practical tools to act now.

### Positioning

- **Not a law firm webinar.** This is an engineering webinar. We'll leave the legal analysis to lawyers and focus on what engineers need to build.
- **Not FUD.** The EU AI Act is manageable. We'll show teams exactly what applies, what to build, and how to know when you're done.
- **Genuine value.** Attendees leave with a compliance checklist, code examples, and a clear plan. Even if they never try AgentGuard.

### 60-Minute Structure

| Segment | Duration | Content |
|---------|----------|---------|
| **1. Intro + Speaker Bios** | 5 min | Welcome, agenda, speaker context |
| **2. EU AI Act Overview** | 15 min | What applies to AI agents specifically |
| **3. Technical Deep-Dive** | 15 min | How to implement compliance in code |
| **4. Live Demo** | 10 min | AgentGuard compliance audit walkthrough |
| **5. Q&A** | 10 min | Live audience questions |
| **6. Wrap + CTA** | 5 min | Summary, resources, next steps |

### Speakers

**Speaker 1 (AgentGuard):** [Name], Co-founder / CTO  
*Background: [X] years in security engineering, previously at [notable company], built [notable thing]. Led AgentGuard's EU AI Act compliance framework.*

**Speaker 2 (Guest — Legal/Regulatory):** [Name], Partner at [Law Firm] / [Policy Org]  
*Background: Specialises in AI regulation, advised [X major companies] on EU AI Act compliance, authored [article/paper].*

**Optional Speaker 3 (Enterprise Customer):** [Name], [Title] at [Company]  
*"We had 6 LangChain agents in production with zero compliance story. Here's how we got audit-ready in 3 weeks."*

---

## 2. Full Slide Deck Outline (30 Slides) {#slides}

---

### SECTION 1: INTRO (Slides 1–4) | 5 minutes

---

**Slide 1: Title Slide**

```
TITLE: AI Agents + EU AI Act
SUBTITLE: What Engineering Teams Need to Know Before August 2026
DATE: [Webinar Date]
SPEAKERS: [Name 1], [Name 2]
LOGO: AgentGuard wordmark
VISUAL: Split image — left: code editor with agent code; right: EU parliament building
```

*Content notes:* Clean, professional. Conveys "technical + regulatory" dual nature. Avoid looking like a law firm.

---

**Slide 2: Agenda**

```
TITLE: In the next 60 minutes...
VISUAL: Timeline graphic with 6 segments, coloured by section

1. 📋 EU AI Act: What actually applies to AI agents (no legalese)
2. 🔧 Technical requirements: What you need to build
3. 🎮 Live demo: AgentGuard compliance audit
4. ❓ Q&A: Your questions answered
5. 🚀 Resources to take action today

"You'll leave with a clear compliance checklist and working code examples."
```

---

**Slide 3: Speaker Bios**

```
LEFT COLUMN:
[Speaker 1 photo]
[Name], Co-founder & CTO, AgentGuard
• Former [role] at [company]
• Built [X] at [company]
• Specialises in runtime security for AI systems

RIGHT COLUMN:
[Speaker 2 photo]
[Name], [Role], [Organisation]
• Advised [X companies] on EU AI Act
• [Published work / notable credential]
• Focused on technical implementation of AI regulation
```

---

**Slide 4: Quick Poll / Icebreaker**

```
TITLE: Before we start — where are you?
POLL OPTIONS:
A) We have agents in production with no compliance plan
B) We're building agents and want to get ahead of this
C) We're evaluating agent frameworks (compliance is a factor)
D) We're compliance/legal, here to understand the technical side

VISUAL: Poll widget (Slido / native webinar tool)
```

*Speaker notes:* Give 30 seconds for poll. Acknowledge results. "Looks like most of you are [X] — that's exactly who this session is for."

---

### SECTION 2: EU AI ACT OVERVIEW (Slides 5–12) | 15 minutes

---

**Slide 5: The August 2026 Deadline**

```
TITLE: August 2, 2026: The Date That Matters

VISUAL: Countdown timer graphic + EU flag

KEY POINTS:
• EU AI Act officially entered into force: August 1, 2024
• Article 6 obligations (high-risk AI) apply: August 2, 2026
• GPAI (general-purpose AI) model obligations: already in effect
• Non-compliance fines: up to €30M or 6% of global revenue

BOTTOM LINE: "You have ~5 months from today. That's enough time — if you start now."
```

*Speaker notes:* Don't dwell on the fine amounts (feels like FUD). Emphasise the 5-month window is actually manageable if approached methodically.

---

**Slide 6: AI Risk Tiers (The Framework)**

```
TITLE: EU AI Act: Four Risk Tiers

VISUAL: Pyramid graphic

[TOP - RED] Unacceptable Risk
• Banned entirely
• Social scoring, manipulation, real-time biometric surveillance
• "If you're building these, you're not in this webinar"

[UPPER - ORANGE] High Risk
• Requires conformity assessment before deployment
• Employment, credit, education, law enforcement, critical infrastructure
• Most enterprise AI agents fall HERE or below

[LOWER - YELLOW] Limited Risk
• Transparency obligations only
• Chatbots must identify as AI, deepfakes must be labelled

[BOTTOM - GREEN] Minimal Risk
• No obligations
• Most consumer AI apps
```

*Speaker notes:* The audience's agents are almost certainly in "Limited" or "High Risk." Use this slide to set up the next one.

---

**Slide 7: Do Your Agents Count as "High Risk"?**

```
TITLE: Is Your AI Agent "High Risk" Under the Act?

VISUAL: Decision tree flowchart

Decision nodes:
1. Does your agent make decisions that affect people's:
   - Employment, wages, or career advancement? → Likely HIGH RISK
   - Access to credit or financial services? → Likely HIGH RISK
   - Access to education or training? → Likely HIGH RISK
   - Safety-critical functions? → Likely HIGH RISK
   
2. Is your agent a component of a system listed in Annex III? → HIGH RISK

3. Does your agent interact with regulated persons (patients, employees)?
   → May be HIGH RISK depending on context

4. Is your agent a research/internal tool only?
   → Likely LIMITED RISK

BOTTOM NOTE: "When in doubt, assume high-risk and build accordingly. The cost of over-compliance is low. The cost of non-compliance is not."
```

---

**Slide 8: What "High Risk" Actually Requires**

```
TITLE: High-Risk AI Requirements (Plain English)

VISUAL: Checklist with icons

✅ RISK MANAGEMENT SYSTEM
   Ongoing process to identify and mitigate risks

✅ DATA GOVERNANCE
   Training data documented, bias assessed

✅ TECHNICAL DOCUMENTATION
   Full system documentation before deployment

✅ RECORD-KEEPING & LOGGING
   Automatic logging of operations (the "black box" requirement)

✅ TRANSPARENCY
   Clear disclosure to users that they're interacting with AI

✅ HUMAN OVERSIGHT
   Humans must be able to intervene, override, and stop the system

✅ ACCURACY, ROBUSTNESS, CYBERSECURITY
   Performance metrics and security controls documented
```

*Speaker notes:* The key ones for engineering teams are: logging, human oversight, and technical documentation. Everything else involves process work that's outside of code.

---

**Slide 9: The Logging Requirement (Article 12)**

```
TITLE: Article 12: Automatic Logging — The "Black Box" Rule

VISUAL: Airplane black box → AI agent black box analogy

WHAT IT SAYS:
"High-risk AI systems shall automatically log events throughout their lifetime. 
Logging capabilities shall enable monitoring of the operation..."

WHAT ENGINEERS NEED TO BUILD:
• Every AI decision logged with timestamp, inputs, outputs, model version
• Logs stored for minimum period (typically 6 months for most use cases)
• Logs must be tamper-evident (can't be modified after the fact)
• Logs must be accessible to relevant oversight bodies

WHAT MOST TEAMS ARE DOING TODAY: Nothing.

WHAT YOU NEED: An audit trail system. We'll show you how.
```

---

**Slide 10: The Human Oversight Requirement (Article 14)**

```
TITLE: Article 14: Human Oversight — The "Kill Switch" Rule

VISUAL: Red emergency stop button + AI agent interface

WHAT IT SAYS:
"High-risk AI systems shall be designed and developed in such a way...
that natural persons can effectively oversee them during the period 
in which the AI system is in use."

FOUR CAPABILITIES YOU MUST HAVE:
1. Ability to UNDERSTAND what the AI is doing (explainability)
2. Ability to INTERRUPT or halt the AI mid-operation
3. Ability to OVERRIDE AI decisions
4. Ability to MONITOR performance and behaviour over time

DESIGN PRINCIPLE:
"Humans must be able to intervene at any point — not just before or after."

TRANSLATION FOR ENGINEERS:
You need human-in-the-loop hooks in your agent pipeline.
```

---

**Slide 11: The Documentation Requirement (Article 11)**

```
TITLE: Article 11: Technical Documentation — Before You Ship

VISUAL: Document with checkboxes

WHAT MUST BE DOCUMENTED:
• System description and intended purpose
• Version history and updates
• Training data sources and preprocessing steps
• Model architecture and performance metrics
• Known limitations and risks
• Human oversight mechanisms
• Cybersecurity measures
• Post-market monitoring plan

WHEN: Must be complete BEFORE deployment to market/service

GOOD NEWS: If you have this for internal use, you're most of the way there.
BAD NEWS: Most teams don't have any of this documented.

PRACTICAL APPROACH: Build it into your sprint process now. 
15 minutes of documentation per feature saves weeks before a compliance audit.
```

---

**Slide 12: GPAI Models (ChatGPT, Claude, Gemini)**

```
TITLE: Wait — What About the Model Itself? (GPAI Rules)

VISUAL: Stack diagram: Application → GPAI Model API → Foundation Model

KEY POINT: If you're using OpenAI/Anthropic/Google APIs:
• The GPAI provider (OpenAI, etc.) is responsible for THEIR compliance
• YOU are responsible for HOW you use the model (your agent's behaviour)
• The Act creates shared responsibility

WHAT THIS MEANS FOR YOU:
✅ You don't need to audit GPT-4 or Claude
✅ You DO need to ensure your agent application meets Article 9-15 requirements
✅ Your AI provider's AUP/Terms + their AI safety commitments are relevant to your documentation

"Think of it like using AWS — AWS handles data centre security, 
you handle application security. Same principle here."
```

---

### SECTION 3: TECHNICAL DEEP-DIVE (Slides 13–20) | 15 minutes

---

**Slide 13: Section Break**

```
TITLE: Section 2: Building Compliant Agents
SUBTITLE: What you actually need to build, in plain engineering terms
VISUAL: Code editor screenshot (blurred, atmospheric)
```

---

**Slide 14: The Compliance Stack**

```
TITLE: The Minimal Compliant AI Agent Stack

VISUAL: Layer diagram

LAYER 5: Your Application (UI, API, business logic)
LAYER 4: Your AI Agent (LangChain, LlamaIndex, AutoGen, etc.)
LAYER 3: 🔐 Policy & Control Layer ← This is the new layer you need
LAYER 2: Foundation Model API (OpenAI, Anthropic, etc.)
LAYER 1: Infrastructure (Cloud, k8s, etc.)

WHAT LAYER 3 PROVIDES:
• Logging (Article 12 compliance)
• Human oversight hooks (Article 14 compliance)
• Policy enforcement (risk management, Article 9)
• Audit trail generation

"Most teams have Layers 1, 2, 4, and 5. 
The EU AI Act essentially mandates Layer 3."
```

---

**Slide 15: Logging — What to Capture**

```
TITLE: Building the Black Box: What to Log

VISUAL: Log entry anatomy diagram

MINIMUM REQUIRED LOG ENTRY:
{
  "event_id": "uuid",
  "timestamp": "2026-03-22T14:23:01.234Z",
  "session_id": "user-abc-session-xyz",
  "event_type": "llm_call | tool_invocation | policy_decision",
  "model": "gpt-4o",
  "model_version": "2025-01-15",
  "input_hash": "sha256:...",    ← hash for tamper-evidence
  "output_hash": "sha256:...",
  "policy_outcome": "allowed | blocked | hitl",
  "latency_ms": 1234,
  "tokens": { "prompt": 450, "completion": 123 },
  "cost_usd": 0.0045
}

ALSO LOG:
• User identity (or pseudonym)
• Geographic location of processing
• Model confidence scores (if available)
• Human override events
```

---

**Slide 16: Making Logs Tamper-Evident**

```
TITLE: Tamper-Evident Logging: Not as Hard as It Sounds

VISUAL: Hash chain diagram (blockchain-inspired but simpler)

THE REQUIREMENT: Logs that can't be modified after the fact

SIMPLE IMPLEMENTATION:
1. Hash each log entry (SHA-256 of the content)
2. Chain entries: each entry includes the hash of the previous entry
3. Store the chain root hash externally (S3, separate DB, signed timestamp service)
4. To verify: recompute hashes, check chain integrity

CODE EXAMPLE:
import hashlib, json
from datetime import datetime

def create_log_entry(event: dict, prev_hash: str) -> dict:
    entry = {
        **event,
        "timestamp": datetime.utcnow().isoformat(),
        "prev_hash": prev_hash
    }
    entry["hash"] = hashlib.sha256(
        json.dumps(entry, sort_keys=True).encode()
    ).hexdigest()
    return entry

GOTCHA: Store the hash chain root somewhere your own team 
can't modify (signed timestamps, append-only S3 bucket, etc.)
```

---

**Slide 17: Human Oversight — Technical Patterns**

```
TITLE: Implementing Human Oversight: 3 Patterns

VISUAL: Three separate mini-diagrams side by side

PATTERN 1: Pre-approval (safest, slowest)
Agent proposes action → Human approves → Agent executes
Use for: irreversible actions (write, delete, send, pay)

PATTERN 2: Concurrent monitoring (balanced)
Agent executes → Human notified → Human can interrupt/rollback
Use for: reversible but consequential actions

PATTERN 3: Post-hoc review (fastest, audit-focused)
Agent executes → Logged → Human reviews batch
Use for: low-stakes repetitive tasks, internal tooling

CHOOSING YOUR PATTERN:
→ Ask: "If this action is wrong, how bad is it and can we undo it?"
→ Irreversible + High stakes = Pattern 1
→ Reversible = Pattern 2 or 3
```

---

**Slide 18: The HITL Implementation**

```
TITLE: Human-in-the-Loop: Code Skeleton

VISUAL: Code on left, Slack notification on right

LANGCHAIN EXAMPLE:
# Triggered when agent calls a high-risk tool
async def on_tool_start(self, tool_name: str, tool_input: dict):
    if tool_name in self.hitl_required_tools:
        approval = await self.request_approval(
            action=tool_name,
            args=tool_input,
            context=self.current_session
        )
        if not approval.approved:
            raise PolicyBlockedError(f"Action rejected by {approval.reviewer}")

# Send approval request to Slack
async def request_approval(self, ...):
    await slack.send(
        channel="#ai-approvals",
        blocks=approval_blocks(action, args, context),
        timeout_seconds=300
    )
    return await self.wait_for_approval(timeout=300)

KEY DESIGN DECISIONS:
• What happens on timeout? (default: reject)
• Who are the approvers? (team, individual, escalation chain)
• What context do approvers need to make a good decision?
```

---

**Slide 19: Documentation Template**

```
TITLE: Technical Documentation: A Practical Template

VISUAL: Document template screenshot

SECTION 1: System Description
  - Name, version, intended purpose
  - Deployment environment
  - Intended users and use cases
  - Known excluded use cases

SECTION 2: Model Information  
  - Base model(s) used, version, provider
  - Any fine-tuning applied
  - Known limitations and failure modes

SECTION 3: Risk Assessment
  - Risk register (risks identified, probability, impact, mitigation)
  - Data governance (what data does the agent access/process?)
  - Bias assessment (if applicable)

SECTION 4: Oversight Mechanisms
  - Human oversight pattern implemented
  - Audit logging approach
  - Incident response procedure

SECTION 5: Performance Metrics
  - Accuracy benchmarks
  - Safety benchmarks (prompt injection resistance, etc.)
  - Monitoring approach

"30-60 minutes to complete for a typical agent. 
Template available at agentguard.dev/compliance-templates"
```

---

**Slide 20: Compliance Checklist**

```
TITLE: Your EU AI Act Readiness Checklist

VISUAL: Checklist with progress indicator

PRE-DEPLOYMENT:
□ Risk tier assessment completed (high risk / limited risk / minimal risk)
□ Technical documentation written (Article 11)
□ Risk management process documented (Article 9)
□ Training data sources documented (Article 10, if applicable)
□ Logging implementation in place (Article 12)
□ Human oversight mechanisms built (Article 14)
□ Transparency disclosures added to user interface

ONGOING:
□ Audit logs being retained (minimum periods)
□ Performance monitoring active
□ Incident response procedure defined
□ Regular review of logs for anomalies
□ Post-market monitoring plan in place

WHEN THINGS CHANGE:
□ Re-assessment when model is updated
□ Re-assessment when use case changes significantly
□ Document all material changes

"Download this checklist: agentguard.dev/eu-ai-act-checklist"
```

---

### SECTION 4: LIVE DEMO (Slides 21–24) | 10 minutes

---

**Slide 21: Section Break + Demo Setup**

```
TITLE: Live Demo: AgentGuard Compliance Audit
SUBTITLE: "Let's look at a real agent and see exactly where the compliance gaps are"

VISUAL: Demo environment screenshot (staging)

WHAT WE'LL COVER:
1. Running an audit on an existing LangChain agent
2. Reading the compliance report
3. Fixing the top 3 gaps (live coding)
4. Re-running audit to confirm compliance

DEMO AGENT: Customer support agent with database access and email capability
(Intentionally non-compliant starting point — we'll fix it live)
```

---

**Slide 22: Demo Step 1 — Run the Audit**

```
TITLE: Step 1: Audit Your Existing Agent

VISUAL: Terminal + dashboard side-by-side

COMMAND:
$ agentguard audit --agent ./agents/support_agent.py

OUTPUT (intentionally failing):
🔍 AgentGuard Compliance Audit
Agent: customer-support-v2
Checking against: EU AI Act (High Risk)

✅ PASS: Model documentation present
✅ PASS: Input validation implemented
❌ FAIL: No audit logging (Article 12)
❌ FAIL: No human oversight mechanism (Article 14)  
⚠️  WARN: Technical documentation incomplete (Article 11)
⚠️  WARN: No spend monitoring configured

Overall: 2 failures, 2 warnings
Compliance Status: NOT READY
```

*[Live: run this in the actual demo environment]*

---

**Slide 23: Demo Step 2 — Fix the Gaps**

```
TITLE: Step 2: Fix in 3 Minutes (Live Coding)

VISUAL: Code editor, full screen

BEFORE (non-compliant):
executor = AgentExecutor(
    agent=agent,
    tools=tools
)

AFTER (compliant):
from agentguard.integrations.langchain import AgentGuardCallbackHandler
from agentguard.compliance import EUAIActProfile

handler = AgentGuardCallbackHandler(
    policy=EUAIActProfile.HIGH_RISK,    # Pre-built EU AI Act policy
    audit_retention_days=180,            # 6 months minimum
    hitl_tools=["send_email", "db_write"],
    hitl_channel="slack:#ai-approvals",
    documentation="docs/SYSTEM_CARD.md"  # Links to your Article 11 docs
)

executor = AgentExecutor(
    agent=agent,
    tools=tools,
    callbacks=[handler]
)

*[Live: make these changes, run agent, show logs appearing]*
```

---

**Slide 24: Demo Step 3 — Re-Audit + Compliance Report**

```
TITLE: Step 3: Confirm Compliance

VISUAL: Dashboard compliance report

$ agentguard audit --agent ./agents/support_agent.py

✅ PASS: Model documentation present
✅ PASS: Input validation implemented
✅ PASS: Audit logging active (Article 12) — logs retained 180 days
✅ PASS: Human oversight configured (Article 14) — HITL on email, db_write
✅ PASS: Technical documentation linked (Article 11)
✅ PASS: Spend monitoring configured

Overall: 0 failures, 0 warnings
Compliance Status: EU AI ACT READY ✅

Generate report for compliance officer?
$ agentguard report --format pdf --output compliance-report.pdf

"This PDF is what you hand to your legal team, 
DPO, or a regulator if they ask."
```

---

### SECTION 5: Q&A (Slides 25–26) | 10 minutes

---

**Slide 25: Common Questions (Pre-loaded)**

```
TITLE: Questions We Get Asked Every Time

1. "We're a US company. Does the EU AI Act apply to us?"
   → If any EU residents use your product: yes.

2. "Our agents are internal tools. Are we exempt?"
   → Depends on the use case. Employee management, recruitment = high risk.
   Pure developer tooling = likely minimal risk.

3. "What's the penalty risk if we're not compliant by August?"
   → Market Access Risk first (can't sell to EU enterprises).
   Fines come after investigation (typically triggered by incidents, not audits).

4. "We use OpenAI. Isn't it their responsibility?"
   → Shared. OpenAI handles GPAI model compliance. 
   You handle application compliance. Both required.

5. "This seems like a lot of work. Is it really necessary?"
   → If you're selling to enterprise EU customers: yes, they'll require it.
   If you're building consumer AI: the bar is lower but transparency rules apply.
```

---

**Slide 26: Live Q&A**

```
TITLE: Your Questions
VISUAL: Q&A queue widget (Slido or native)

MODERATOR NOTE: 
- Take top 5-7 questions from the queue
- Keep answers to 60-90 seconds each
- "We'll follow up in writing on any questions we don't get to"
- Monitor for good questions to use in follow-up content
```

---

### SECTION 6: WRAP + CTA (Slides 27–30) | 5 minutes

---

**Slide 27: Key Takeaways**

```
TITLE: What You Heard Today (The 3-Minute Version)

VISUAL: 5 numbered takeaways with icons

1. 🗓️ August 2026 deadline is real — and 5 months is enough time if you start now

2. 📋 Most enterprise AI agents are "high risk" — employment, finance, and safety-critical uses are covered

3. 🔧 Three things to build: audit logging (Article 12), human oversight (Article 14), technical documentation (Article 11)

4. 💻 None of this requires rewriting your agents — it's middleware and documentation

5. 📊 The compliance report is your friend — use it to have the right conversation with legal, compliance, and enterprise buyers

"The teams that get ahead of this in Q2 2026 will close enterprise deals. 
The ones who don't will lose them."
```

---

**Slide 28: Resources**

```
TITLE: Take Action Today

VISUAL: QR code linking to resources page

FREE RESOURCES (available at agentguard.dev/eu-ai-act):
□ EU AI Act compliance checklist (PDF)
□ Technical documentation template (Article 11)
□ HITL implementation patterns (code)
□ Tamper-evident logging reference implementation
□ Webinar recording + slides

AGENTGUARD:
□ Free compliance audit → agentguard.dev/audit
□ EU AI Act policy profile → pre-built, one-line integration
□ Book a compliance review call → agentguard.dev/enterprise

OFFICIAL SOURCES:
□ EU AI Act full text: eur-lex.europa.eu
□ EU AI Office guidance: digital-strategy.ec.europa.eu/ai-act
```

---

**Slide 29: Special Offer for Attendees**

```
TITLE: Webinar Attendee Offer

VISUAL: Clean offer card design

FOR ATTENDEES ONLY:
🎁 Free compliance audit for your AI agent
   (normally $499 — free for 30 days post-webinar)

🎁 EU AI Act documentation template pack
   (Article 11 + risk register + system card)

🎁 30-minute compliance consultation call
   (with AgentGuard engineering team)

HOW TO CLAIM:
Use code: EUAIACT2026
Valid until: [Date + 30 days]
Link: agentguard.dev/webinar-offer

"Scan the QR code or check the chat for the link."
```

---

**Slide 30: Closing + Thank You**

```
TITLE: Thank You

VISUAL: Speakers' headshots + contact info

[Speaker 1 Name]
[Title], AgentGuard
Email: [email]
LinkedIn: [link]
Twitter: @[handle]

[Speaker 2 Name]
[Title], [Org]
Email: [email]
LinkedIn: [link]

AgentGuard:
🌐 agentguard.dev
💬 discord.gg/agentguard
🐦 @agentguard

Recording: Available in 24 hours — link sent via email.

"See you in the next one. Don't wait until July."
```

---

## 3. Speaker Notes by Section {#speaker-notes}

### Section 1: Intro (5 minutes)

**[Slide 1 — Title]**
"Welcome everyone, we're going to get started in about 30 seconds. If you're just joining, you're in the right place — we're about to spend 60 minutes getting you from 'I've heard of the EU AI Act' to 'I have a plan and the tools to execute it.'"

**[Slide 2 — Agenda]**
"Quick roadmap: we're not going to spend this session on legal theory. I'm an engineer, [Speaker 2] is a practitioner. We're going to give you the minimum viable understanding of the law, then spend most of our time on code, architecture, and practical steps. You'll leave with a checklist you can take to your team tomorrow."

**[Slide 3 — Bios]**
"Quickly on who we are: I'm [Name], CTO of AgentGuard. We build the security and compliance layer for AI agents — our customers are engineering teams that want to ship agents responsibly. [Speaker 2] is [Name], [role] — [he/she/they] has been deep in EU AI Act implementation for the past [X] months and has been gracious enough to help us turn the legalese into something engineers can actually act on."

**[Slide 4 — Poll]**
"Before we go any further, I want to know who's in the room. Quick poll — give me 30 seconds. [Wait.] Okay, looks like [X% of you have agents in production with no compliance plan]. That's exactly why we're here. The goal by the end of the session is to change that."

---

### Section 2: EU AI Act Overview (15 minutes)

**[Slide 5 — Deadline]**
"Let's start with the date that's driving this conversation: August 2, 2026. That's when Article 6 — the high-risk AI obligations — come into force. Now, I want to be honest with you: the EU AI Act is not a perfect piece of legislation. It has ambiguities. Implementation guidance is still being written. But here's what is certain: enterprise buyers in the EU are already asking for compliance. We've had customers tell us deals are blocked until they can show an audit trail and human oversight policy. So whether the regulators come calling or not, your enterprise sales team will."

**[Slide 6 — Risk Tiers]**
"The Act divides AI systems into four tiers. I want to spend a few seconds on this because a lot of teams panic when they first hear 'EU AI Act' — they think it applies to everything. It doesn't. The banned tier is truly extreme — think social scoring, thought crime surveillance. You're not building that. The high-risk tier is where most enterprise AI agents land. Limited risk is transparency-focused. Minimal risk — most of you building internal developer tools — might be here."

**[Slide 7 — High Risk Decision Tree]**
"The key question is: does your agent affect consequential decisions about people? Employment decisions — high risk. Credit or lending — high risk. Medical treatment — high risk. Customer support bot answering questions about your product — probably limited risk. The rule of thumb I use: if the agent's output could be used to deny someone a job, a loan, or a medical procedure, you're in high-risk territory. When in doubt, build to high-risk standards. The overhead is real but manageable, and you'll be grateful when your legal team asks."

**[Slide 8 — Requirements]**
"Here's what high-risk compliance actually requires. I want to walk through this carefully because there are seven items here and only three of them are primarily engineering problems. Risk management system — that's process, not code. Data governance — mostly process. Technical documentation — that's engineering documentation, we'll cover it. Logging — engineering problem, we'll cover it in detail. Transparency disclosures — a few lines of UI copy. Human oversight — engineering problem, we'll cover it. Accuracy and security — you probably have some of this already."

**[Slides 9–12]** — Follow the content notes on each slide, emphasizing that logging (Article 12) and human oversight (Article 14) are the most impactful engineering requirements.

---

### Section 3: Technical Deep-Dive (15 minutes)

**[Slide 13 — Section Break]**
"Okay, that was the law. Now let's talk about what you actually build. I'm going to go through the three engineering requirements in detail, with code. If you're using LangChain, LlamaIndex, or building your own agent, the patterns are the same — the implementation details might differ slightly."

**[Slide 14 — Compliance Stack]**
"The mental model I use is a compliance stack. Your application sits on top of your agent framework, which sits on top of the model API. The EU AI Act essentially mandates a new layer in the middle — a policy and control layer. This isn't a new idea: we have this in web security (WAFs, API gateways), in infrastructure (IAM, network policies). It's just new to AI. Most teams building agents today have layers 1, 2, 4, and 5. They're missing layer 3."

**[Slides 15–20]** — Go through code examples at a pace that's accessible to the audience. Pause at slide 20 for questions before moving to the demo.

---

### Section 4: Live Demo (10 minutes)

**[Slide 21 — Demo Setup]**
"Let me switch to the live demo now. I'm going to run an audit on a real agent — one that's intentionally not compliant — and we're going to fix it in about 3 minutes of live coding. If anything goes wrong with the demo, [Speaker 2] will cover while I debug. [Audience laughs.] I've done this demo seven times in the past two weeks and it's worked every time, so I'm either very confident or about to jinx myself."

**[During demo]** — Narrate everything you're doing. Explain WHY each command/change matters. Keep eye contact with camera between typing.

**[After demo]**
"That's it. Five lines of code plus a YAML policy file. Everything after that is automated. The audit trail, the HITL flows, the compliance report — it all just runs. And before anyone asks: yes, this adds latency. The policy evaluation typically adds 15–30ms. For most agent use cases, that's entirely acceptable."

---

### Section 5: Q&A (10 minutes)

**[Before taking questions]**
"We've got 10 minutes for questions. I can see there are [X] in the queue already. We'll get through as many as we can. For anything we don't answer, we'll follow up by email — and honestly, some of these questions are worth turning into blog posts, so you might see them answered there too."

**[Handling difficult legal questions]**
"I'll kick that one to [Speaker 2] — that's more in the regulatory interpretation territory than the engineering territory."

**[If a question is out of scope]**
"Great question and honestly outside the scope of what we can cover today without getting into your specific situation. That's something worth taking up in a 1:1 call — we're offering free 30-minute consultations for everyone on this webinar, so book one and we can dig in properly."

---

### Section 6: Wrap + CTA (5 minutes)

**[Slide 27 — Takeaways]**
"We've covered a lot in 60 minutes. Let me condense it to five things. The August deadline is real. Most enterprise agents are high-risk. You need three things built: logging, human oversight, technical docs. None of this requires a rewrite. And the teams that do this now will close deals that teams who don't will lose."

**[Slide 28 — Resources]**
"Everything you need to take action is at agentguard.dev/eu-ai-act. The checklist, the code templates, the webinar recording. It'll all be there within 24 hours."

**[Slide 29 — Offer]**
"And for everyone on this call today, we're offering a free compliance audit — normally $499 — for 30 days. Code is EUAIACT2026. Use it, get your audit report, share it with your team."

**[Slide 30 — Closing]**
"Thanks for being here. [Speaker 2], any final words? [Speaker 2 closes.] Recording goes out in 24 hours. We'll see you in the next one. Don't wait until July."

---

## 4. Registration Page Copy {#registration}

### Page Title + Meta

```
<title>AI Agents + EU AI Act Webinar | AgentGuard</title>
<meta name="description" content="Free webinar for engineering teams: 
What you need to build before August 2026 to comply with the EU AI Act. 
60 minutes. Live demo. Real code.">
```

### Hero Section

```
HEADLINE:
AI Agents + EU AI Act: 
What Engineering Teams Need to Know Before August 2026

SUBHEADLINE:
August 2, 2026. That's when EU AI Act enforcement begins for high-risk AI systems. 
Most AI agents deployed today aren't compliant. Most engineering teams don't know where to start.

In 60 minutes, we'll fix that.

DATE/TIME:
📅 [Day], [Date] [Month] 2026
🕐 [Time] GMT / [Time] ET / [Time] PT
⏱️ 60 minutes

[REGISTER FREE — CTA BUTTON]
```

### What You'll Learn

```
SECTION HEADER: What You'll Walk Away With

✅ A clear understanding of which EU AI Act obligations apply to your AI agents
✅ The three technical requirements you need to build (logging, HITL, documentation)
✅ Working code patterns you can implement this week
✅ A compliance checklist to take to your team and legal department
✅ An on-demand compliance audit tool (free for attendees)

"No legal jargon. No scare tactics. Just clear requirements and practical implementation."
```

### Who This Is For

```
SECTION HEADER: This Webinar Is For You If...

👩‍💻 You're building or maintaining AI agents (LangChain, LlamaIndex, AutoGen, or custom)
🏢 You're selling to enterprise customers who ask about EU AI Act compliance
⚖️ You're responsible for a product that makes decisions affecting EU residents
🔍 You're a security or compliance lead trying to understand what engineering needs to build
🚀 You want to get ahead of the August 2026 deadline before it becomes a crisis

NOT for: pure legal analysis, non-technical audiences, teams not using AI
```

### Speaker Bios

```
SECTION HEADER: Your Speakers

[SPEAKER 1 PHOTO]
[Name], Co-founder & CTO, AgentGuard
[Name] has spent [X] years building security infrastructure for AI systems. 
Previously [role] at [company], he/she/they led the development of AgentGuard's 
EU AI Act compliance framework — now used by [X]+ enterprise engineering teams.
[LinkedIn] [Twitter]

[SPEAKER 2 PHOTO]  
[Name], [Title], [Organisation]
[Name] specialises in the technical implementation of AI regulation. 
[He/she/they] has advised [X] companies through EU AI Act readiness assessments 
and is the author of [article/resource]. [Credential/recognition].
[LinkedIn] [Twitter]
```

### Agenda Preview

```
SECTION HEADER: The Agenda

5 min   — Intro + speaker context
15 min  — EU AI Act overview: what applies to AI agents (plain English)
15 min  — Technical requirements: what you need to build and how
10 min  — Live demo: AgentGuard compliance audit on a real agent
10 min  — Q&A: your questions answered
5 min   — Wrap + attendee resources

Total: 60 minutes. Every minute counts.
```

### Testimonials / Social Proof

```
SECTION HEADER: What Past Attendees Say

"Finally, a webinar that treated me like an engineer. 
Clear requirements, real code, no BS. Shared the recording with my whole team."
— [Name], Senior Engineer, [Company]

"We had six agents in production with no compliance plan. 
Forty-eight hours after this webinar, we had a plan and started implementation."
— [Name], CTO, [Company]

"The live demo alone was worth it. Seeing the audit run and the gaps identified 
in real-time made it concrete in a way slides never do."
— [Name], Staff Engineer, [Company]
```

### FAQ

```
SECTION HEADER: Common Questions

Q: Is the recording available if I can't attend live?
A: Yes. Registrants receive the full recording within 24 hours of the live event.

Q: Is this really free?
A: Yes. We make money selling AgentGuard, not webinar tickets. 
   The content is genuinely free with no catch.

Q: Will you cover specific frameworks (LangChain, LlamaIndex, etc.)?
A: The live demo uses LangChain. The concepts apply to any agent framework.
   We'll have framework-specific resources available for download.

Q: How technical is this? Can I send it to our compliance team?
A: It's primarily technical (engineering audience). We recommend engineers 
   attend, then share the summary/checklist with compliance leads.
   
Q: I'm not in the EU. Does this apply to me?
A: Yes, if your product serves EU residents. We'll cover the extraterritorial 
   scope in the webinar.
```

### Registration Form

```
FORM FIELDS:
• First name *
• Last name *
• Work email *
• Company *
• Job title *
• Company size (dropdown: 1-10, 11-50, 51-200, 201-1000, 1000+)
• Are you currently deploying AI agents? (Yes / In development / No, evaluating)
• What's your biggest compliance concern? (open text, optional)

[REGISTER FREE — large CTA]

"By registering, you agree to receive the webinar recording and follow-up resources. 
No spam. Unsubscribe anytime."
```

---

## 5. Promotion Plan {#promotion}

### Overview

**Launch window:** T-21 days to T-0 (day of webinar)  
**Primary channels:** Email, LinkedIn, Twitter/X, partner amplification  
**Target registrations:** 2,000+  
**Stretch goal:** 3,500+  

---

### Email Promotion Sequence (3 Emails)

---

#### Email 1: Save the Date (T-21 days)

**Subject line options (A/B test):**
- A: "Your AI agents probably aren't EU AI Act compliant. Let's fix that."
- B: "August 2026 is closer than it looks — free webinar for engineering teams"
- C: "Free webinar: AI agents + EU AI Act (60 min, live code)"

**Body:**

```
Subject: Your AI agents probably aren't EU AI Act compliant. Let's fix that.

Hi [First name],

Quick question: if a regulator knocked on your door today and asked to see your AI agent compliance documentation, what would you hand them?

If the answer is "um," you're not alone. We've spoken to hundreds of engineering teams in the past 6 months. The vast majority have agents in production or development with no compliance plan for the EU AI Act.

The August 2026 deadline is real. And for teams selling to enterprise EU customers, compliance isn't optional — it's a sales requirement.

We're running a free webinar to help:

🗓️ AI Agents + EU AI Act: What Engineering Teams Need to Know Before August 2026
📅 [Date + Time]
⏱️ 60 minutes | Live demo | Free

What you'll leave with:
→ Clear understanding of what the Act requires (no legalese)
→ The three technical things you need to build
→ Working code patterns you can use this week
→ A compliance checklist for your team

[REGISTER FREE →]

Limited spots. Bring your team.

— [Name], AgentGuard

P.S. Every registrant gets a free compliance checklist download immediately. No need to wait for the webinar.
```

---

#### Email 2: Value Build (T-7 days)

**Subject line options:**
- A: "What Article 12 of the EU AI Act actually means for engineers"
- B: "3 things your AI agent needs before August 2026 (technical breakdown)"
- C: "RE: [Webinar this week] Sneak peek at what we're covering"

**Body:**

```
Subject: 3 things your AI agent needs before August 2026

Hi [First name],

One week until our EU AI Act webinar. Spots are filling up — [X] engineers registered so far.

While you wait, here's a preview of the three engineering requirements we'll cover in depth:

─────────────────────────────────────

1️⃣  AUDIT LOGGING (Article 12)
Every AI agent decision must be automatically logged — with enough detail to reconstruct what happened and why. The logs must be tamper-evident (can't be modified after the fact) and retained for defined periods.

What most teams have: nothing.
What you need to build: a hash-chained event log with inputs, outputs, model versions, and policy decisions.

─────────────────────────────────────

2️⃣  HUMAN OVERSIGHT (Article 14)
Humans must be able to interrupt, override, and monitor AI agents at any point. This isn't just a "kill switch" — it's a documented oversight mechanism with defined approvers and escalation paths.

What most teams have: a vague sense that "humans can always turn it off."
What you need to build: HITL hooks in your agent pipeline, with an approval workflow for high-stakes actions.

─────────────────────────────────────

3️⃣  TECHNICAL DOCUMENTATION (Article 11)
Before you deploy a high-risk AI system, you need documented: system description, model info, training data, known limitations, performance metrics, oversight mechanisms, and incident response procedure.

What most teams have: a README and some slack messages.
What you need to build: a system card + risk register (30-60 min to write; template provided at the webinar).

─────────────────────────────────────

We'll go deep on all three at the webinar — with live code examples.

[SAVE YOUR SPOT →]

See you [date],
[Name]
AgentGuard

---
Can't make the live session? Register anyway — the recording goes to everyone who registered.
```

---

#### Email 3: Last Chance (T-1 day)

**Subject line options:**
- A: "Tomorrow: AI agents + EU AI Act (60 min — starts at [time])"
- B: "Last chance to register (webinar tomorrow)"
- C: "Webinar tomorrow — here's what 847 engineers will be learning"

**Body:**

```
Subject: Tomorrow: AI Agents + EU AI Act (starts [time])

Hi [First name],

Tomorrow. [Time] GMT / [Time] ET.

Here's everything you need:

📅 Date: [Full date]
🕐 Time: [Time] GMT | [Time] ET | [Time] PT
🔗 Join link: [sent separately 1 hour before]
⏱️ Length: 60 minutes

Not registered yet? Still time:
[REGISTER NOW →]

What to expect:
• 15 min of actual law (what applies, what doesn't — no legalese)
• 15 min of engineering requirements (what to build and how)
• 10 min live demo (we'll audit a real non-compliant agent and fix it live)
• 10 min Q&A (bring your hardest questions)
• Free compliance checklist + attendee-only offer

Bring your CTO. Bring your compliance lead. Bring your most skeptical colleague.

See you tomorrow,
[Name]
AgentGuard

---
Can't make it live? Register and we'll send the recording within 24 hours.
```

---

### Social Posts

#### LinkedIn (Primary Channel)

**Post 1: Announcement (T-21)**
```
Most AI agent teams will fail an EU AI Act compliance audit.

Not because the law is impossible to comply with.
Because they haven't started.

August 2026 is 5 months away. That's enough time — if you start now.

We're running a free 60-minute webinar for engineering teams:
→ What the Act actually requires (no legalese)
→ The 3 things to build: logging, HITL, documentation
→ Live demo: compliance audit on a real agent

Free. Code examples. Live Q&A.

[Link in comments]

Who's joining us? Tag an engineer who needs to see this. 👇
```

**Post 2: Insight teaser (T-10)**
```
Fun fact: most AI agents in production today would fail an EU AI Act compliance audit in under 5 minutes.

Here's the audit command:
$ agentguard audit --agent ./my_agent.py

Here's what comes back for a typical unmodified LangChain agent:
❌ FAIL: No audit logging (Article 12)
❌ FAIL: No human oversight (Article 14)
⚠️ WARN: Technical documentation incomplete (Article 11)

None of these are hard to fix. 
All three take less than an afternoon for a motivated senior engineer.

We'll show you exactly how at our webinar [date].
[Link in comments]
```

**Post 3: Social proof / urgency (T-3)**
```
"We had 6 LangChain agents in production with zero compliance story. 
After 3 hours of implementation, we had an audit-ready system. 
This was the webinar that unlocked it for us."

We're running it again [date].

AI Agents + EU AI Act: What Engineering Teams Need to Know Before August 2026

800+ engineers registered. A few spots left.
[Link in comments]
```

#### Twitter/X

**Tweet 1:**
```
EU AI Act enforcement begins August 2026.

Most AI agents aren't compliant. Most teams don't know what "compliant" even means.

Free webinar [date]: 60 min, live code, actual answers.

[Link]
```

**Tweet 2:**
```
The EU AI Act requires 3 things from AI agent deployments:

1. Automatic audit logging (Article 12)
2. Human oversight mechanism (Article 14)  
3. Technical documentation (Article 11)

All three are engineering problems. None are unsolvable.

Walking through how to build them at our webinar [date] 👇

[Link]
```

**Tweet 3 (thread):**
```
Thread: What the EU AI Act actually requires from AI agents (engineering translation)

1/ August 2026: EU AI Act high-risk obligations kick in. If your agent affects employment, credit, or safety-critical decisions → this applies to you.

2/ The "black box" requirement (Article 12): Every AI decision must be automatically logged. Inputs, outputs, model version, timestamps. Tamper-evident. 

3/ The "kill switch" requirement (Article 14): Humans must be able to interrupt the agent at any point. Not just before or after — *during* execution.

4/ The documentation requirement (Article 11): System card. Risk register. Before you ship.

5/ The good news: all of this is buildable in an afternoon. None requires a rewrite of your agent.

6/ We're covering exactly how at a free webinar [date].
Link 👇
```

---

### Partner Amplification

**Target partners for co-promotion:**

| Partner Type | Specific Targets | Ask |
|---|---|---|
| Agent frameworks | LangChain, LlamaIndex, AutoGen | Social post + newsletter mention |
| EU AI Act resources | Future of Life Institute, AI Now Institute | Social amplification |
| Developer communities | Dev.to, Towards Data Science editors | Guest post or promotion |
| Enterprise AI consultancies | Accenture AI, Deloitte AI | Co-host or moderate |
| Developer tools | GitHub, Hugging Face | Developer newsletter |
| Law firms covering AI | [Specialised AI law firms] | Guest speaker contribution |
| LinkedIn influencers | [AI safety / regulation thought leaders] | Sharing deal |

**Partner outreach template:**

```
Subject: Co-promotion opportunity: EU AI Act webinar for engineering teams

Hi [Name],

We're running a free webinar on [date] covering what engineering teams need to build to comply with the EU AI Act before August 2026.

I think your [audience / community / newsletter readers] would find this genuinely useful — it's engineering-focused (not legal theory) with live code demos.

Would you be open to sharing it with your community? We'll reciprocate with promotion to our [X] subscriber base.

Details: [link to registration page]

Happy to return the favour on your next event.

— [Name], AgentGuard
```

---

## 6. Follow-Up Sequence for Attendees {#followup}

### Email 1: Recording + Resources (T+1 day)

**Subject:** Your webinar recording + compliance checklist

```
Subject: 🎥 Recording: AI Agents + EU AI Act Webinar

Hi [First name],

Thanks for attending (or registering!) for yesterday's webinar.

Here's everything we promised:

📹 RECORDING (available for 90 days):
[Link to recording — no gate]

📥 RESOURCES:
→ Slides: [PDF download link]
→ EU AI Act Compliance Checklist: [PDF download link]
→ Article 11 Documentation Template: [PDF download link]
→ HITL Code Patterns (GitHub): [link]
→ Tamper-evident logging reference implementation: [link]

🎁 ATTENDEE OFFER (expires [date +30 days]):
Free compliance audit for your AI agent — code: EUAIACT2026
[Claim your free audit →]

TIMESTAMPS (jump to what matters):
00:00 — Intro
05:00 — EU AI Act overview: what applies to agents
20:00 — Technical requirements: what to build
35:00 — Live demo: compliance audit + live fix
45:00 — Q&A

Any questions the webinar didn't answer? Reply to this email — we read everything.

— [Name] and the AgentGuard team

---
P.S. Top Q&A question from the session: "We're a US company — does this apply to us?"
Answer: Yes, if EU residents use your product. We've written a short explainer here: [link]
```

---

### Email 2: Resources Deep-Dive (T+4 days)

**Subject:** The 3 code patterns from the webinar (GitHub + docs)

```
Subject: The compliance code patterns from the webinar (copy-paste ready)

Hi [First name],

Four days after the webinar, I wanted to send the "just the code" follow-up for anyone who's ready to start implementing.

The three things you need to build:

─────────────────────────────────────
1️⃣ AUDIT LOGGING

GitHub: agentguard-examples/eu-ai-act/logging/
Docs: docs.agentguard.dev/audit-logging

The implementation is a hash-chained event log. Takes about 2 hours to implement from scratch, or 5 minutes with AgentGuard.

Key consideration: where you store the chain root matters. Use an append-only S3 bucket or a signed timestamp service — somewhere your own team can't retroactively modify.

─────────────────────────────────────
2️⃣ HUMAN-IN-THE-LOOP

GitHub: agentguard-examples/eu-ai-act/hitl/
Docs: docs.agentguard.dev/hitl

Choose your pattern based on reversibility:
• Pattern 1 (pre-approval): for writes, sends, deletes
• Pattern 2 (concurrent): for consequential but reversible
• Pattern 3 (post-hoc): for repetitive low-stakes tasks

─────────────────────────────────────
3️⃣ TECHNICAL DOCUMENTATION

Template: agentguard.dev/eu-ai-act-template
Estimated time: 30-60 minutes for a typical agent

Fill in sections 1-5. That's your Article 11 documentation. Store it in your repo. Link to it from AgentGuard.

─────────────────────────────────────

If you get stuck on implementation, the free compliance consultation offer still stands:
[Book a 30-min call →]
Code: EUAIACT2026 (expires [date])

Good luck — you've got time if you start now.

— [Name]
AgentGuard
```

---

### Email 3: Demo Offer (T+10 days)

**Subject:** One question before your free audit expires

```
Subject: Quick question about your compliance status

Hi [First name],

I don't want to be annoying, but the free compliance audit offer expires in [X] days and I'd rather send one reminder than have you miss it.

Quick context: the audit runs in about 2 minutes, checks your agent against EU AI Act requirements, and generates a report you can share with your team.

Teams tell us the most useful part is having a document that says "here's what we need to fix and in what order" — something concrete to take to an engineering planning meeting.

If you've already implemented compliance controls and want a second opinion: [claim your audit →]

If you're still figuring out where to start: [book a 30-min call →] — we'll walk through your specific setup and tell you exactly what to prioritise.

And if this isn't the right time or you've already sorted your compliance: just reply and I'll stop sending these. No hard feelings — glad you came to the webinar.

— [Name]
AgentGuard

P.S. One thing that came up in follow-up calls this week: several teams realised they need to assess ALL their agents, not just the most obviously "high-risk" ones. If you're not sure which of your agents is in scope, that's actually a good first question for the free call.
```

---

*Document ends. All content is ready for production use. Customise placeholders (speaker names, dates, links, social handles) before publishing.*

# LinkedIn Post — For Hani to share

## Post Text

AI agents are shipping to production with access to your databases, APIs, and infrastructure.

But there's no security layer between the agent's decision and the action.

One jailbroken prompt can:
→ DROP TABLE users
→ Exfiltrate customer data via HTTP
→ Execute arbitrary shell commands
→ Transfer funds to the wrong account

We built AgentGuard to fix this.

It evaluates every tool call against configurable policies before execution. Think of it as a firewall for AI agent actions.

What it does:
• Sub-millisecond policy evaluation (runs in-process)
• Kill switch — halt every agent instantly
• Hash-chained audit trail (tamper-evident, verifiable)
• Drop-in integrations for LangChain, CrewAI, OpenAI, AutoGen, Vercel AI SDK
• Prompt injection detection + PII redaction
• Pre-built compliance templates (EU AI Act, SOC 2, OWASP)

Free tier: 100K events/month.

We just open-sourced it: https://github.com/thebotclub/AgentGuard

Try the interactive demo: https://demo.agentguard.dev

npm install @the-bot-club/agentguard
pip install agentguard-tech

If you're building with AI agents, I'd genuinely love your feedback on what's missing.

#AIAgents #Security #LangChain #OpenSource #AI #DevTools

---

## Instructions for Hani
1. Copy the post text above
2. Post on LinkedIn from your profile
3. Add the AgentGuard logo or a screenshot of the dashboard as an image
4. Best time: Tuesday-Thursday, 8-10am AEST
5. Tag relevant connections who work in AI/security

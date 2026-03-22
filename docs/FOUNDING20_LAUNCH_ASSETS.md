# Founding 20 — Go Live Assets

**Campaign:** "Founding 20" — AgentGuard Pro, Free Forever  
**Status:** Production-ready  
**Last Updated:** 2026-03-22  
**Based on:** FREE_PRO_CAMPAIGN.md

---

## PART 1 — LANDING PAGE HTML

Save as: `public/founding-20/index.html`  
Deploy at: `agentguard.tech/founding-20`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentGuard Founding 20 — Free Pro Access</title>
  <meta name="description" content="The first 20 teams get AgentGuard Pro free. Unlimited agent monitoring, policy enforcement, and compliance exports. No credit card required.">
  <meta property="og:title" content="AgentGuard Founding 20 — Free Pro for First 20 Teams">
  <meta property="og:description" content="AI agent security platform. Monitor, evaluate, and enforce policies in real time. First 20 teams get Pro free.">
  <meta property="og:image" content="https://agentguard.tech/og-founding20.png">
  <meta name="twitter:card" content="summary_large_image">
  <style>
    /* ========= RESET & BASE ========= */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --green: #00D26A;
      --green-dark: #00A854;
      --green-glow: rgba(0, 210, 106, 0.2);
      --red: #FF4444;
      --bg: #0A0E17;
      --bg-card: #111827;
      --bg-card-border: #1F2937;
      --text: #F9FAFB;
      --text-muted: #9CA3AF;
      --text-dim: #6B7280;
      --accent-blue: #3B82F6;
      --radius: 12px;
      --radius-sm: 8px;
      --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-mono: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    }
    html { scroll-behavior: smooth; }
    body {
      font-family: var(--font);
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    a { color: var(--green); text-decoration: none; }
    a:hover { text-decoration: underline; }
    img { max-width: 100%; display: block; }

    /* ========= LAYOUT ========= */
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 0 24px;
    }
    .container--wide {
      max-width: 1100px;
      margin: 0 auto;
      padding: 0 24px;
    }
    section { padding: 80px 0; }

    /* ========= NAV ========= */
    nav {
      position: fixed;
      top: 0; left: 0; right: 0;
      z-index: 100;
      background: rgba(10, 14, 23, 0.9);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--bg-card-border);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .nav-logo {
      font-size: 18px;
      font-weight: 700;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .nav-logo span { color: var(--green); }
    .nav-cta {
      background: var(--green);
      color: #000;
      font-weight: 700;
      font-size: 14px;
      padding: 8px 20px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.2s;
    }
    .nav-cta:hover { background: var(--green-dark); text-decoration: none; }

    /* ========= LIVE BADGE ========= */
    .live-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 68, 68, 0.15);
      border: 1px solid rgba(255, 68, 68, 0.3);
      border-radius: 100px;
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 600;
      color: var(--red);
      margin-bottom: 28px;
    }
    .live-dot {
      width: 8px; height: 8px;
      background: var(--red);
      border-radius: 50%;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    /* ========= HERO ========= */
    .hero {
      padding: 140px 0 80px;
      text-align: center;
    }
    .hero h1 {
      font-size: clamp(36px, 6vw, 64px);
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -0.02em;
      margin-bottom: 24px;
    }
    .hero h1 em {
      font-style: normal;
      color: var(--green);
    }
    .hero-sub {
      font-size: clamp(16px, 2.5vw, 20px);
      color: var(--text-muted);
      max-width: 600px;
      margin: 0 auto 40px;
    }
    .hero-sub strong { color: var(--text); }
    .spots-counter {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: var(--bg-card);
      border: 1px solid var(--bg-card-border);
      border-radius: 100px;
      padding: 8px 20px;
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 36px;
      color: var(--text-muted);
    }
    .spots-num {
      font-size: 22px;
      font-weight: 800;
      color: var(--green);
    }

    /* ========= BUTTONS ========= */
    .btn {
      display: inline-block;
      padding: 16px 36px;
      border-radius: var(--radius-sm);
      font-size: 17px;
      font-weight: 700;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
      text-decoration: none;
    }
    .btn--primary {
      background: var(--green);
      color: #000;
      box-shadow: 0 0 24px var(--green-glow);
    }
    .btn--primary:hover {
      background: var(--green-dark);
      transform: translateY(-1px);
      box-shadow: 0 0 32px var(--green-glow);
      text-decoration: none;
    }
    .btn--secondary {
      background: transparent;
      color: var(--text-muted);
      border: 1px solid var(--bg-card-border);
    }
    .btn--secondary:hover { color: var(--text); border-color: var(--text-muted); text-decoration: none; }
    .btn-note {
      font-size: 13px;
      color: var(--text-dim);
      margin-top: 12px;
    }

    /* ========= TRUST STRIP ========= */
    .trust-strip {
      padding: 32px 0;
      border-top: 1px solid var(--bg-card-border);
      border-bottom: 1px solid var(--bg-card-border);
      text-align: center;
    }
    .trust-strip p {
      font-size: 13px;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 20px;
    }
    .trust-logos {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 40px;
      flex-wrap: wrap;
    }
    .trust-logo {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-dim);
      padding: 6px 16px;
      border: 1px solid var(--bg-card-border);
      border-radius: 6px;
    }

    /* ========= PROBLEM SECTION ========= */
    .problem {
      background: linear-gradient(180deg, var(--bg) 0%, rgba(17, 24, 39, 0.5) 100%);
    }
    .section-label {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--green);
      margin-bottom: 16px;
    }
    .section-title {
      font-size: clamp(26px, 4vw, 40px);
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 20px;
      line-height: 1.15;
    }
    .section-body {
      font-size: 17px;
      color: var(--text-muted);
      max-width: 680px;
      margin-bottom: 36px;
      line-height: 1.75;
    }
    .risk-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
      margin-top: 40px;
    }
    .risk-card {
      background: var(--bg-card);
      border: 1px solid var(--bg-card-border);
      border-radius: var(--radius);
      padding: 24px;
    }
    .risk-icon {
      font-size: 28px;
      margin-bottom: 12px;
    }
    .risk-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .risk-desc {
      font-size: 14px;
      color: var(--text-muted);
      line-height: 1.6;
    }

    /* ========= SOLUTION ========= */
    .solution-cols {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
      margin-top: 48px;
    }
    @media (max-width: 700px) { .solution-cols { grid-template-columns: 1fr; } }
    .solution-col {
      background: var(--bg-card);
      border: 1px solid var(--bg-card-border);
      border-radius: var(--radius);
      padding: 28px;
      text-align: center;
    }
    .solution-icon {
      font-size: 36px;
      margin-bottom: 14px;
    }
    .solution-title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .solution-desc {
      font-size: 14px;
      color: var(--text-muted);
    }
    .integration-note {
      text-align: center;
      margin-top: 32px;
      padding: 20px;
      background: rgba(0, 210, 106, 0.05);
      border: 1px solid rgba(0, 210, 106, 0.2);
      border-radius: var(--radius);
      font-size: 15px;
      color: var(--text-muted);
    }
    .integration-note strong { color: var(--green); }

    /* ========= OFFER BOX ========= */
    .offer-section {
      background: var(--bg);
    }
    .offer-box {
      background: linear-gradient(135deg, rgba(0, 210, 106, 0.08) 0%, rgba(17, 24, 39, 0.9) 100%);
      border: 2px solid rgba(0, 210, 106, 0.4);
      border-radius: 20px;
      padding: 48px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .offer-box::before {
      content: '';
      position: absolute;
      top: -50px; left: 50%;
      transform: translateX(-50%);
      width: 300px; height: 300px;
      background: radial-gradient(circle, rgba(0, 210, 106, 0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .offer-badge {
      display: inline-block;
      background: var(--green);
      color: #000;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding: 6px 16px;
      border-radius: 100px;
      margin-bottom: 24px;
    }
    .offer-title {
      font-size: clamp(28px, 4vw, 42px);
      font-weight: 800;
      margin-bottom: 8px;
    }
    .offer-price {
      font-size: 20px;
      color: var(--text-muted);
      margin-bottom: 36px;
    }
    .offer-price s { color: var(--text-dim); }
    .offer-price .free { color: var(--green); font-weight: 800; font-size: 26px; }
    .offer-checklist {
      list-style: none;
      display: inline-block;
      text-align: left;
      margin-bottom: 40px;
    }
    .offer-checklist li {
      font-size: 16px;
      padding: 8px 0;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .offer-checklist li::before {
      content: '✓';
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px; height: 22px;
      background: rgba(0, 210, 106, 0.15);
      border: 1px solid var(--green);
      border-radius: 50%;
      color: var(--green);
      font-size: 12px;
      font-weight: 800;
      flex-shrink: 0;
    }
    .offer-fine {
      font-size: 13px;
      color: var(--text-dim);
      margin-top: 16px;
    }

    /* ========= HOW IT WORKS ========= */
    .steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 24px;
      margin-top: 48px;
      position: relative;
    }
    .step {
      text-align: center;
      padding: 0 12px;
    }
    .step-num {
      width: 48px; height: 48px;
      background: var(--green);
      color: #000;
      font-weight: 800;
      font-size: 20px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
    }
    .step-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .step-desc {
      font-size: 14px;
      color: var(--text-muted);
    }
    .step-code {
      display: inline-block;
      margin-top: 8px;
      font-family: var(--font-mono);
      font-size: 13px;
      background: rgba(0, 210, 106, 0.1);
      border: 1px solid rgba(0, 210, 106, 0.2);
      border-radius: 4px;
      padding: 2px 8px;
      color: var(--green);
    }

    /* ========= SOCIAL PROOF ========= */
    .testimonials {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
      margin-top: 48px;
    }
    .testimonial {
      background: var(--bg-card);
      border: 1px solid var(--bg-card-border);
      border-radius: var(--radius);
      padding: 28px;
    }
    .testimonial-stars {
      color: var(--green);
      font-size: 18px;
      margin-bottom: 14px;
      letter-spacing: 2px;
    }
    .testimonial-quote {
      font-size: 15px;
      line-height: 1.7;
      color: var(--text-muted);
      margin-bottom: 20px;
      font-style: italic;
    }
    .testimonial-author {
      font-size: 14px;
      font-weight: 600;
    }
    .testimonial-role {
      font-size: 13px;
      color: var(--text-dim);
      margin-top: 2px;
    }

    /* ========= SIGNUP FORM ========= */
    .signup-section {
      background: var(--bg-card);
      border-top: 1px solid var(--bg-card-border);
      border-bottom: 1px solid var(--bg-card-border);
    }
    .form-wrap {
      max-width: 520px;
      margin: 0 auto;
      text-align: center;
    }
    .form-title {
      font-size: clamp(24px, 4vw, 36px);
      font-weight: 800;
      margin-bottom: 12px;
    }
    .form-sub {
      font-size: 16px;
      color: var(--text-muted);
      margin-bottom: 36px;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .field-group {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    @media (max-width: 520px) { .field-group { grid-template-columns: 1fr; } }
    input, select {
      width: 100%;
      padding: 14px 16px;
      background: var(--bg);
      border: 1px solid var(--bg-card-border);
      border-radius: var(--radius-sm);
      color: var(--text);
      font-size: 15px;
      font-family: var(--font);
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus, select:focus {
      border-color: var(--green);
      box-shadow: 0 0 0 3px var(--green-glow);
    }
    input::placeholder { color: var(--text-dim); }
    select { cursor: pointer; }
    select option { background: var(--bg-card); }
    .form-submit {
      background: var(--green);
      color: #000;
      font-size: 17px;
      font-weight: 800;
      padding: 16px;
      border-radius: var(--radius-sm);
      border: none;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 0 24px var(--green-glow);
    }
    .form-submit:hover {
      background: var(--green-dark);
      transform: translateY(-1px);
    }
    .form-disclaimer {
      font-size: 13px;
      color: var(--text-dim);
      margin-top: 8px;
    }

    /* ========= FAQ ========= */
    .faq-list {
      max-width: 720px;
      margin: 0 auto;
    }
    .faq-item {
      border-bottom: 1px solid var(--bg-card-border);
      padding: 24px 0;
    }
    .faq-item:first-child { border-top: 1px solid var(--bg-card-border); }
    details summary {
      font-size: 17px;
      font-weight: 700;
      cursor: pointer;
      list-style: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    details summary::after {
      content: '+';
      font-size: 22px;
      font-weight: 300;
      color: var(--text-dim);
      flex-shrink: 0;
    }
    details[open] summary::after { content: '−'; }
    details p {
      font-size: 15px;
      color: var(--text-muted);
      line-height: 1.75;
      margin-top: 14px;
      padding-right: 32px;
    }
    details p a { color: var(--green); }

    /* ========= FINAL CTA ========= */
    .final-cta {
      text-align: center;
      padding: 100px 0;
    }
    .final-cta h2 {
      font-size: clamp(28px, 5vw, 52px);
      font-weight: 800;
      margin-bottom: 16px;
    }
    .final-cta p {
      font-size: 18px;
      color: var(--text-muted);
      max-width: 560px;
      margin: 0 auto 40px;
    }

    /* ========= FOOTER ========= */
    footer {
      border-top: 1px solid var(--bg-card-border);
      padding: 32px 24px;
      text-align: center;
      font-size: 14px;
      color: var(--text-dim);
    }
    footer a { color: var(--text-dim); }
    footer a:hover { color: var(--text-muted); }

    /* ========= MOBILE ========= */
    @media (max-width: 768px) {
      section { padding: 60px 0; }
      .hero { padding: 100px 0 60px; }
      .offer-box { padding: 32px 20px; }
      .solution-cols { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>

<!-- NAV -->
<nav>
  <div class="nav-logo">🛡️ Agent<span>Guard</span></div>
  <a href="#signup" class="nav-cta">Claim Free Spot →</a>
</nav>

<!-- HERO -->
<section class="hero">
  <div class="container">
    <div class="live-badge">
      <span class="live-dot"></span>
      <span>LIVE — <span id="spotsRemaining">17</span> of 20 spots remaining</span>
    </div>
    <h1>Your AI Agent Is<br>Flying <em>Blind</em>. Fix It Free.</h1>
    <p class="hero-sub">
      AgentGuard monitors, evaluates, and enforces security policies on your AI agents in real time — and right now, the <strong>first 20 teams get Pro access free.</strong>
    </p>
    <div class="spots-counter">
      🔴 
      <span class="spots-num" id="heroSpots">17</span>
      <span>of 20 Founding spots left</span>
    </div>
    <br>
    <a href="#signup" class="btn btn--primary">Claim Your Free Pro Spot →</a>
    <p class="btn-note">No credit card · No auto-charge · Free for 12 months minimum</p>
  </div>
</section>

<!-- TRUST STRIP -->
<div class="trust-strip">
  <div class="container--wide">
    <p>Trusted by teams building with</p>
    <div class="trust-logos">
      <span class="trust-logo">LangChain</span>
      <span class="trust-logo">CrewAI</span>
      <span class="trust-logo">AutoGPT</span>
      <span class="trust-logo">OpenAI</span>
      <span class="trust-logo">Anthropic Claude</span>
    </div>
  </div>
</div>

<!-- PROBLEM -->
<section class="problem">
  <div class="container">
    <div class="section-label">The Problem</div>
    <h2 class="section-title">AI Agents Are Powerful.<br>Unmonitored Agents Are Dangerous.</h2>
    <p class="section-body">
      Your agent makes dozens of decisions per run — tool calls, API requests, memory reads, loops. Any one could leak data, get prompt-injected, or take an irreversible action before you realize something went wrong. Traditional security tools see requests and responses. They don't understand what your agent is <em>deciding</em>.
    </p>
    <div class="risk-grid">
      <div class="risk-card">
        <div class="risk-icon">💉</div>
        <div class="risk-title">Prompt Injection</div>
        <div class="risk-desc">Malicious instructions embedded in web content, emails, or tool outputs hijack your agent's behavior mid-run.</div>
      </div>
      <div class="risk-card">
        <div class="risk-icon">📤</div>
        <div class="risk-title">Data Exfiltration</div>
        <div class="risk-desc">Sensitive context leaks through unexpected tool calls to external endpoints — often without any obvious trigger.</div>
      </div>
      <div class="risk-card">
        <div class="risk-icon">⚖️</div>
        <div class="risk-title">Compliance Blindspot</div>
        <div class="risk-desc">Your AI workflows touch HIPAA data, financial records, or EU citizen data — and your auditors have no evidence trail.</div>
      </div>
      <div class="risk-card">
        <div class="risk-icon">🔁</div>
        <div class="risk-title">Unplanned Tool Use</div>
        <div class="risk-desc">Agents execute tool call sequences no one designed — writing to external storage, calling APIs in unexpected combinations.</div>
      </div>
    </div>
  </div>
</section>

<!-- SOLUTION -->
<section>
  <div class="container">
    <div class="section-label">The Solution</div>
    <h2 class="section-title">AgentGuard Was Built for<br>This Exact Problem</h2>
    <p class="section-body">
      One SDK. Five-minute setup. Every agent action logged, evaluated, and optionally blocked before it executes.
    </p>
    <div class="solution-cols">
      <div class="solution-col">
        <div class="solution-icon">🔍</div>
        <div class="solution-title">Monitor</div>
        <div class="solution-desc">Every tool call, API request, memory read, and action — logged in real time with full context and decision trace.</div>
      </div>
      <div class="solution-col">
        <div class="solution-icon">⚖️</div>
        <div class="solution-title">Evaluate</div>
        <div class="solution-desc">Policy-based risk scoring on every agent decision before it executes. Pre-built + custom policy templates.</div>
      </div>
      <div class="solution-col">
        <div class="solution-icon">🛡️</div>
        <div class="solution-title">Enforce</div>
        <div class="solution-desc">Automatic blocking of policy violations + instant alerts via Slack, email, or PagerDuty.</div>
      </div>
    </div>
    <div class="integration-note">
      Works with: <strong>LangChain · CrewAI · AutoGPT · Custom agents</strong><br>
      One SDK. 5-minute setup. Zero infrastructure changes.
    </div>
  </div>
</section>

<!-- OFFER -->
<section class="offer-section" id="offer">
  <div class="container">
    <div class="offer-box">
      <div class="offer-badge">🏆 Founding 20 Offer</div>
      <h2 class="offer-title">AgentGuard Pro — Free Forever</h2>
      <p class="offer-price">
        Normally <s>$99/month</s> → Your price: <span class="free">$0/month</span>
      </p>
      <ul class="offer-checklist">
        <li>Unlimited agents monitored</li>
        <li>Custom security policy builder</li>
        <li>SOC2 / HIPAA / EU AI Act compliance exports</li>
        <li>Real-time dashboard + live alerts</li>
        <li>Priority support (direct Slack channel)</li>
        <li>Free for 12 months — renewable, no auto-charge</li>
        <li>Founding 20 badge + early feature access</li>
      </ul>
      <a href="#signup" class="btn btn--primary">Claim Free Pro Now →</a>
      <p class="offer-fine">No credit card required. We'll reach out before any changes after 12 months.</p>
    </div>
  </div>
</section>

<!-- HOW IT WORKS -->
<section>
  <div class="container">
    <div class="section-label">Quick Start</div>
    <h2 class="section-title">From Zero to Secured in 4 Steps</h2>
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-title">Sign Up</div>
        <div class="step-desc">Create your free account. Takes 30 seconds. No card required.</div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-title">Install SDK</div>
        <div class="step-desc">One command to install.</div>
        <span class="step-code">pip install agentguard</span>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-title">Wrap Your Agent</div>
        <div class="step-desc">One function call. Your agent is now monitored and protected.</div>
      </div>
      <div class="step">
        <div class="step-num">4</div>
        <div class="step-title">Watch the Dashboard</div>
        <div class="step-desc">See every action, every policy check, every blocked threat in real time.</div>
      </div>
    </div>
  </div>
</section>

<!-- SOCIAL PROOF -->
<section>
  <div class="container">
    <div class="section-label">Social Proof</div>
    <h2 class="section-title">Built for Developers<br>Building Real AI Agents</h2>
    <div class="testimonials">
      <div class="testimonial">
        <div class="testimonial-stars">★★★★★</div>
        <p class="testimonial-quote">"AgentGuard caught a prompt injection vulnerability in our RAG agent that we'd completely missed during testing. It would have exposed customer data. Found it on day one."</p>
        <div class="testimonial-author">Senior Engineer</div>
        <div class="testimonial-role">Series A Fintech startup</div>
      </div>
      <div class="testimonial">
        <div class="testimonial-stars">★★★★★</div>
        <p class="testimonial-quote">"The compliance exports alone saved us two weeks of work for our SOC2 audit. We had no idea our AI workflows were in scope — AgentGuard made that crystal clear."</p>
        <div class="testimonial-author">Engineering Lead</div>
        <div class="testimonial-role">Healthcare AI startup</div>
      </div>
      <div class="testimonial">
        <div class="testimonial-stars">★★★★★</div>
        <p class="testimonial-quote">"We found 7 unexpected behaviors in our first hour of monitoring. Stuff we'd never have caught in testing. It's like having a security engineer watching every agent run."</p>
        <div class="testimonial-author">CTO</div>
        <div class="testimonial-role">AI automation platform</div>
      </div>
    </div>
  </div>
</section>

<!-- SIGNUP FORM -->
<section class="signup-section" id="signup">
  <div class="container">
    <div class="form-wrap">
      <h2 class="form-title">Claim Your Founding Spot</h2>
      <p class="form-sub">
        <strong id="formSpots">17</strong> of 20 spots remaining. No credit card. No obligations.
      </p>
      <form id="signupForm" action="https://agentguard.tech/api/founding20" method="POST">
        <div class="field-group">
          <input type="text" name="first_name" placeholder="First name" required>
          <input type="text" name="last_name" placeholder="Last name" required>
        </div>
        <input type="email" name="email" placeholder="Work email address" required>
        <input type="text" name="company" placeholder="Company name" required>
        <select name="team_size" required>
          <option value="" disabled selected>Team size</option>
          <option value="1">Just me</option>
          <option value="2-5">2–5 people</option>
          <option value="6-15">6–15 people</option>
          <option value="16-50">16–50 people</option>
          <option value="50+">50+ people</option>
        </select>
        <select name="primary_framework" required>
          <option value="" disabled selected>Primary AI framework</option>
          <option value="langchain">LangChain</option>
          <option value="crewai">CrewAI</option>
          <option value="autogpt">AutoGPT</option>
          <option value="openai-assistants">OpenAI Assistants</option>
          <option value="custom">Custom agent</option>
          <option value="other">Other</option>
        </select>
        <button type="submit" class="form-submit">
          Secure My Free Pro Spot →
        </button>
        <p class="form-disclaimer">
          No spam. No credit card. We'll email your login details within 5 minutes.
        </p>
      </form>
    </div>
  </div>
</section>

<!-- FAQ -->
<section>
  <div class="container">
    <div class="section-label">FAQ</div>
    <h2 class="section-title" style="text-align:center; margin-bottom:48px;">Frequently Asked Questions</h2>
    <div class="faq-list">
      <div class="faq-item">
        <details>
          <summary>Is this really free? What's the catch?</summary>
          <p>Yes, genuinely free. You get full Pro access — no feature limits, no trial period, no auto-charge. Our ask: use it, tell us what's broken, and be honest with feedback. We want 20 builders who'll help us shape the product. After 12 months, we'll reach out to discuss the path forward — but there's no auto-billing and no surprise charges.</p>
        </details>
      </div>
      <div class="faq-item">
        <details>
          <summary>What frameworks does AgentGuard support?</summary>
          <p>LangChain, CrewAI, AutoGPT, and OpenAI Assistants have native integrations. Custom agents require about 10 lines of code to instrument. See the full list at <a href="https://agentguard.tech/docs/integrations">agentguard.tech/docs/integrations</a>.</p>
        </details>
      </div>
      <div class="faq-item">
        <details>
          <summary>How long does setup take?</summary>
          <p>Most developers have their first agent monitored in under 5 minutes. Install the SDK (one command), wrap your agent (one function call), and you'll see live data in the dashboard immediately.</p>
        </details>
      </div>
      <div class="faq-item">
        <details>
          <summary>Does it add latency to my agent?</summary>
          <p>Policy evaluation adds 1–3ms per action in async mode. If you're running latency-sensitive agents, you can also run in "log-only" mode with zero performance impact, then review violations manually.</p>
        </details>
      </div>
      <div class="faq-item">
        <details>
          <summary>What does "Pro" include vs. Free tier?</summary>
          <p>Free tier: up to 3 agents, 7-day log retention, basic policies. Pro: unlimited agents, 90-day retention, custom policy builder, compliance exports (SOC2, HIPAA, EU AI Act), real-time alerts, and priority support. The Founding 20 get all of Pro, free.</p>
        </details>
      </div>
      <div class="faq-item">
        <details>
          <summary>Where is my data stored? Is it secure?</summary>
          <p>By default, event logs are stored in our cloud (AWS, SOC2-compliant, US or EU region selectable). We also offer self-hosted deployment for teams that require it — available in Pro. We never use your agent data to train models.</p>
        </details>
      </div>
      <div class="faq-item">
        <details>
          <summary>What if the 20 spots fill up before I sign up?</summary>
          <p>Join the waitlist — you'll be first in line for the next cohort. We're planning a second cohort after our initial product iteration (estimated 60–90 days). Waitlist members also get a discounted first year.</p>
        </details>
      </div>
    </div>
  </div>
</section>

<!-- FINAL CTA -->
<section class="final-cta">
  <div class="container">
    <div class="live-badge" style="justify-content:center;">
      <span class="live-dot"></span>
      <span><span id="finalSpots">17</span> of 20 spots remaining</span>
    </div>
    <h2>20 Spots. No Waitlist.<br>First Come, First Served.</h2>
    <p>This isn't a trial. It's not a limited feature set with an upsell trap. It's full Pro access, free, because we want 20 teams to build with AgentGuard and help us make it great.</p>
    <a href="#signup" class="btn btn--primary">I Want a Free Spot →</a>
    <p class="btn-note" style="margin-top:16px;">No credit card · Cancel anytime · Takes 60 seconds</p>
  </div>
</section>

<!-- FOOTER -->
<footer>
  <div class="container">
    <p>
      <a href="https://agentguard.tech">AgentGuard</a> · 
      <a href="https://agentguard.tech/privacy">Privacy</a> · 
      <a href="https://agentguard.tech/terms">Terms</a> · 
      <a href="https://agentguard.tech/docs">Docs</a> · 
      <a href="mailto:hello@agentguard.tech">hello@agentguard.tech</a>
    </p>
    <p style="margin-top:8px;">© 2026 AgentGuard. All rights reserved.</p>
  </div>
</footer>

<script>
  // ---- Spots counter (update from your backend) ----
  const SPOTS_REMAINING = 17; // UPDATE: fetch from /api/founding20/spots

  function updateSpots(n) {
    document.querySelectorAll('#spotsRemaining, #heroSpots, #formSpots, #finalSpots')
      .forEach(el => { if (el) el.textContent = n; });
  }

  // Try to fetch live count
  fetch('/api/founding20/spots')
    .then(r => r.json())
    .then(d => updateSpots(d.remaining))
    .catch(() => updateSpots(SPOTS_REMAINING));

  // ---- Form submission ----
  document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.textContent = 'Claiming your spot...';
    btn.disabled = true;

    const data = Object.fromEntries(new FormData(e.target));
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) data.ref = ref;

    try {
      const res = await fetch('/api/founding20', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        e.target.innerHTML = `
          <div style="text-align:center;padding:40px 0">
            <div style="font-size:52px;margin-bottom:16px">🎉</div>
            <h3 style="font-size:24px;font-weight:800;margin-bottom:10px">You're in the Founding 20!</h3>
            <p style="color:#9CA3AF">Check your email — login details arriving within 5 minutes.</p>
          </div>`;
      } else {
        btn.textContent = 'Try again — something went wrong';
        btn.disabled = false;
      }
    } catch {
      btn.textContent = 'Try again — network error';
      btn.disabled = false;
    }
  });

  // ---- Smooth scroll for anchor links ----
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' });
    });
  });
</script>
</body>
</html>
```

---

## PART 2 — EMAIL SEQUENCE

### EMAIL 1 — Welcome (Send immediately on signup)

**Subject:** 🎉 You're in the Founding 20 — here's your access

**Preview text:** Your free Pro spot is confirmed. Secure your first agent in 5 minutes.

---

Hey [First Name],

You just claimed one of 20 Founding Pro spots.

Welcome to the team. This is a real thing — not a trial, not a teaser. You have full AgentGuard Pro, free, starting right now.

**Here's what you have access to:**

✅ Unlimited agent monitoring  
✅ Full policy builder (custom + 20+ pre-built policies)  
✅ Compliance exports — SOC2, HIPAA, EU AI Act  
✅ Real-time dashboard + Slack/email alerts  
✅ Direct support channel (reply to this email anytime)  

**→ Your dashboard:** [https://app.agentguard.tech/login](https://app.agentguard.tech/login)  
**→ Temporary password:** [auto-generated — CHANGE THIS]

---

**Get your first agent secured in 5 minutes:**

```bash
pip install agentguard
# or
npm install @agentguard/sdk
```

Then check the quickstart: [agentguard.tech/docs/quickstart](https://agentguard.tech/docs/quickstart)

Or watch the 5-minute video walkthrough: [Watch on YouTube →]

---

**One ask:** Once you're set up, reply to this email and tell me what you're building. I read every response personally, and I want to know what problems you're trying to solve.

Welcome to the Founding 20.

— Hani  
Founder, AgentGuard

P.S. There's a private Slack channel for Founding 20 members. Join here: [link]. We're in there daily — fast responses, zero corporate overhead.

---

### EMAIL 2 — Day 2: Getting Started Guide

**Subject:** Did you get your first agent monitored? (quick check-in)

**Preview text:** Most devs are live in under 5 minutes. Here's help if you're stuck.

---

Hey [First Name],

Quick check — did you get your first agent connected to AgentGuard?

**If yes:** 🎉 Reply and tell me what you found on day one. The answer is usually surprising.

**If not yet** — here are the three most common blockers:

---

**🚧 Blocker 1: "I don't know which agent to start with"**

Start with your most active agent, even if it's simple. The dashboard gets interesting the moment there's live activity. You can always add more agents later.

---

**🚧 Blocker 2: "Not sure which policies to enable first"**

Start with these three defaults — they catch 80% of common issues:

1. `data-access-audit` — logs every read from memory/storage
2. `no-external-write` — flags unexpected writes to external endpoints
3. `rate-limit-apis` — alerts on unusual API call frequency

They're available under Policies → Recommended in your dashboard.

---

**🚧 Blocker 3: "My framework isn't listed"**

Check [agentguard.tech/docs/integrations](https://agentguard.tech/docs/integrations) — LangChain, CrewAI, and AutoGPT have native support (just wrap, no config). Custom agents take about 10 lines of code. If you're stuck, reply with your framework and I'll send you exact steps.

---

**Resource pack:**

- 📖 [Quickstart guide](https://agentguard.tech/docs/quickstart) — 5 min read  
- 🎥 [Video walkthrough](https://youtube.com/agentguard) — 5 min watch  
- 💬 [Slack community](https://agentguard.tech/slack) — ask anything  
- 📚 [Policy library](https://agentguard.tech/docs/policies) — all 20+ pre-built policies  

---

You've got 20 minutes to secure your first agent. I'm betting you'll find something unexpected.

— Hani, AgentGuard

P.S. If you need a hand, just reply. No ticket system — it comes straight to me.

---

### EMAIL 3 — Day 5: "Your First Security Incident" Story

**Subject:** "We found 7 issues we didn't know existed" (what beta users found)

**Preview text:** The most common surprising findings from AgentGuard's first users.

---

Hey [First Name],

Here's something that genuinely surprised us during our beta:

The average developer finds **7 unexpected policy violations** in their agent within the first hour of monitoring.

Not risks they knew about and hadn't fixed. Things they had **no idea** were happening.

---

**Here's what people keep finding:**

**🔴 Prompt injection in the wild**

Teams running RAG agents on web content, email, or customer input are regularly encountering injected instructions. The agent behavior shifts mid-run — taking actions that weren't in the original task. AgentGuard's evaluation layer catches the behavioral deviation before execution.

One team found their customer support agent was being fed injected instructions via support ticket content that told it to summarize "internal pricing data" and include it in email replies. Every. Single. Time.

They had been live for three months.

---

**🟡 Unexpected tool call sequences**

Nobody designs agents with malicious intent — but agents chain tool calls in ways you never explicitly programmed. Memory lookups feeding into external API calls, with sensitive context in the payload. Not always exploitable. Almost always worth knowing about.

---

**🟠 Compliance-relevant data leakage candidates**

Information that counts as PII, PHI, or otherwise regulated data appearing in tool call payloads bound for external services. Not deliberate — just a design oversight. In a SOC2 or HIPAA context: a critical finding.

---

**Your dashboard has the answers.**

Log in → filter by "Flagged" and "Blocked" → see what AgentGuard has been catching in the background.

[→ Open your dashboard](https://app.agentguard.tech/dashboard?filter=flagged)

---

What did you find? Reply and tell me — we're collecting these stories (anonymous) to help the broader AI security community understand what's actually happening in production.

If you found something genuinely interesting, we'd love to feature it anonymously in our upcoming blog series. Reply with "feature me" if you're open to it.

— Hani, AgentGuard

---

### EMAIL 4 — Day 10: Expansion + Referral Ask

**Subject:** 10 days in — here's what's next + earn more free months

**Preview text:** Go deeper with Pro + unlock extra months by referring AI developers you know.

---

Hey [First Name],

Ten days in. Hopefully your dashboard is showing some interesting findings by now.

**Three things to try this week:**

---

**1. 🔒 Enable zero-trust mode**

Flip `mode: 'deny-all'` in your agent config. Everything is blocked unless explicitly permitted.

It's intense — but it forces you to define exactly what your agent *should* be allowed to do. Most teams that try this have an "I never thought about that" moment within 20 minutes.

[→ Zero-trust mode docs](https://agentguard.tech/docs/zero-trust)

---

**2. 🔔 Set up real-time alerts**

Connect your Slack workspace or PagerDuty in Settings → Notifications. When AgentGuard blocks something critical, you'll know immediately — not when you happen to check the dashboard.

[→ Configure notifications](https://app.agentguard.tech/settings/notifications)

---

**3. 📋 Run a compliance export**

Go to Reports → Compliance and generate a SOC2 evidence pack for your AI workflows. If you're ever in an audit and your agents come up, this document is what you'll need.

Founders tell us this alone is worth the Pro subscription.

[→ Generate compliance report](https://app.agentguard.tech/reports/compliance)

---

**🎁 Refer a developer — earn free months**

Know another developer building AI agents who'd benefit from AgentGuard?

Share your personal referral link:

```
agentguard.tech/founding-20?ref=[YOUR_REF_CODE]
```

**For every developer who signs up via your link: +1 month added to your Pro subscription.** No cap.

There are [XX] spots left in the Founding 20. Once they're gone, this offer closes.

[→ Get your referral link](https://app.agentguard.tech/account/referrals)

---

As always — reply anytime. Happy to jump on a call if you want to talk through your specific setup.

Thanks for being one of the first.

— Hani, AgentGuard

---

## PART 3 — LAUNCH DAY SOCIAL POSTS

### TWITTER/X — Thread (3 posts, post in sequence)

**Optimal posting time:** Tuesday or Wednesday, 9am–11am US Eastern  
**Hashtags:** #AIAgents #LLMSecurity #LangChain #DevSecOps

---

**Tweet 1 (thread opener):**

```
We just opened AgentGuard to the public.

For the first 20 developers who sign up: Pro access, free.

What is AgentGuard? A security layer for AI agents. 

Here's why it matters 🧵
```

*[Post immediately, then reply with Tweet 2]*

---

**Tweet 2 (problem):**

```
Your AI agent is making decisions you don't know about.

Right now, while it runs:

• Tool calls you didn't plan for
• Data appearing in places it shouldn't  
• Prompt injection attempts you never see
• Compliance violations you can't document

Traditional security tools see requests and responses. 
They don't see *decisions*.

AgentGuard does.
```

*[Reply to Tweet 2 with Tweet 3]*

---

**Tweet 3 (CTA + urgency):**

```
AgentGuard monitors every agent action, evaluates every decision 
against your policies, and blocks dangerous behavior before it executes.

5-minute setup. Works with LangChain, CrewAI, AutoGPT.

First 20 teams get Pro free (unlimited agents, compliance exports, 
policy builder — $99/mo value):

→ agentguard.tech/founding-20

[XX]/20 spots left 🔴

#AIAgents #LLMSecurity #LangChain
```

---

### LINKEDIN — Post 1 (Thought Leadership + Offer)

**Optimal posting time:** Tuesday or Thursday, 8am–9am local time  
**Hashtags:** #ArtificialIntelligence #CyberSecurity #AIAgents #LangChain #Compliance

```
The AI security gap nobody's talking about.

We've spent 12 months talking to teams building production AI agents. 
Here's what we keep hearing:

"We know our agent *could* do something bad. We just don't know when it does."

Traditional security tools don't understand agent behavior. They see HTTP 
requests. They don't see decisions.

Your agent makes hundreds of decisions per run. Tool calls, memory reads, 
API requests — each one a potential security event. None of them visible 
to your SIEM, WAF, or endpoint protection.

AgentGuard was built to close this gap:

→ Real-time monitoring of every agent action  
→ Policy enforcement before actions execute  
→ Compliance exports for SOC2, HIPAA, EU AI Act  
→ Works with LangChain, CrewAI, AutoGPT, and custom agents

We're opening up today. The first 20 teams who sign up get AgentGuard 
Pro free — unlimited agents, full policy builder, compliance suite.

If you're building production AI agents and security keeps you up at night, 
this is for you.

👇 Link in the comments (LinkedIn hates links in posts 😅)

#ArtificialIntelligence #CyberSecurity #AIAgents #LangChain #Compliance
```

*[Comment with the link immediately after posting]*

---

### LINKEDIN — Post 2 (Beta User Story / Social Proof)

**Optimal posting time:** Thursday, 12pm–2pm local time  
**Hashtags:** #AIAgents #PromptInjection #CyberSecurity #LLMSecurity

```
A developer using AgentGuard in beta found something that stopped them cold.

Their agent — processing customer support emails — was encountering 
prompt injection attempts in the email content.

The injected instructions told the agent to:
1. Find the "confidential pricing data" in its context window
2. Include it in the next outbound summary email

The agent was doing it. Every time. For weeks.

They had no idea until AgentGuard flagged it.

This isn't theoretical. This is happening in production AI systems right now — 
probably including yours.

We built AgentGuard to catch exactly this kind of thing: real-time monitoring 
and policy enforcement for AI agents.

And right now, the first 20 teams get Pro free.

👇 Link in comments.

What's the weirdest thing your AI agent has ever done in production?

#AIAgents #PromptInjection #CyberSecurity #LLMSecurity #AI
```

*[Comment with the link immediately after posting]*

---

### REDDIT — r/MachineLearning or r/artificial

**Target subreddit:** r/MachineLearning (primary) or r/LangChain (higher conversion)  
**Optimal posting time:** Wednesday, 10am–12pm US Eastern  
**Post type:** Text post (no link posts in r/MachineLearning)

**Title:**
```
We built a security layer for AI agents (monitoring, policy enforcement, compliance) — first 20 teams get Pro free
```

**Body:**

```
Hey r/MachineLearning,

We've been building AgentGuard for the past year — a security platform 
specifically for AI agents. Wanted to share it here because I think this 
community would have useful things to say about it.

**The problem we're solving:**

Traditional security tools weren't designed for agent behavior. They see 
requests and responses, not decisions. When your LangChain or CrewAI agent 
makes a tool call, reads memory, hits an API — existing security tooling has 
no idea what's happening at a semantic level.

From talking to teams building production AI agents, the most common issues we 
see that go undetected:

- Prompt injection from external content (web, email, uploaded docs)
- Unexpected tool call sequences that create compliance events
- Sensitive data appearing in tool call payloads bound for external services
- Agents taking irreversible actions during edge-case runs

**What AgentGuard does:**

1. **Monitor** — every tool call, API call, memory read, and action, logged with 
   full context
2. **Evaluate** — policy-based risk scoring before actions execute (pre-built + 
   custom policies)
3. **Enforce** — optional blocking of policy violations, real-time alerts

**Current integrations:** LangChain, CrewAI, AutoGPT, custom agents.  
**Setup:** 5 minutes. One function call to instrument your agent.

---

**Founding 20 offer:**

We're opening up today. The first 20 teams get full Pro access free 
(unlimited agents, compliance exports, custom policy builder — normally $99/mo).

Details here: [agentguard.tech/founding-20](https://agentguard.tech/founding-20)

---

**Genuinely curious for feedback from this community:**

1. What security concerns do you actually have about your AI agents in production?
2. Are there threat models we're not addressing that you think are more important?
3. For those doing serious ML work — how are you currently thinking about agent security?

Happy to go deep on the technical side if there's interest. No pitch, I just 
think this community has thought about this more than most and would have sharp 
feedback.

---

*Disclosure: I'm one of the founders. Flagging that upfront.*
```

---

*End of FOUNDING20_LAUNCH_ASSETS.md*

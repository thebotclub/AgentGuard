# AgentGuard — Execution Plan
## March 2026 | Post-MVP → Product-Market Fit

> This plan covers everything from "working MVP" to "paying customers." It separates engineering work from business work, and sequences them so neither blocks the other.

---

## Where We Are Today (v0.7.2)

**Product:** Runtime security platform for AI agents with deployment enforcement.

**Live:**
- 42 API endpoints, PostgreSQL, bcrypt auth, full Zod validation, RLS
- Dashboard with deployment readiness view
- TypeScript + Python SDKs
- GitHub Action for CI/CD gates
- 7 policy templates
- 66 tests passing (15 suites)

**Not yet:** No paying customers. No design partners. No incorporation.

---

## Phase A: Complete the Product Loop (1-2 weeks)

These items make the product *demo-ready* for design partners.

### A1. Standalone CLI Tool
**What:** `npx @the-bot-club/agentguard validate .` — scans a directory for agent tool usage, checks coverage against policies, outputs a report.
**Why:** Developers try tools locally before adding them to CI. The CLI is the top-of-funnel.
**Effort:** 2-3 days
**Deliverable:** npm package, README with install + usage

### A2. Publish SDKs
**What:** Publish `@the-bot-club/agentguard@0.6.0` to npm and `agentguard-tech@0.6.0` to PyPI.
**Why:** Current published versions are 0.2.1 and missing Phase 4+ methods.
**Effort:** 1 hour
**Deliverable:** Published packages

### A3. Cloudflare Full/Strict SSL
**What:** Generate origin cert, upload to Azure, switch Cloudflare to Full (Strict).
**Why:** "Flexible SSL" means origin traffic is unencrypted — a red flag in any security review.
**Effort:** 30 minutes
**Deliverable:** Full end-to-end encryption

### A4. Landing Page Refresh
**What:** Update agentguard.dev to lead with "Deployment Enforcement" positioning. Add the CI/CD gate story, the compliance angle, the "shift-left" narrative.
**Why:** Current landing page says "agent firewall" — the AI team's insight about deployment enforcement is the stronger wedge.
**Effort:** 1 day
**Deliverable:** Updated landing page with new positioning

---

## Phase B: Get Design Partners (2-4 weeks, overlaps with A)

### B1. Identify 3-5 Target Companies
**Criteria:**
- Building agents with LangChain, CrewAI, or AutoGen
- Have a CI/CD pipeline (GitHub Actions, Azure DevOps)
- In regulated industry (finance, health, government) OR have a security team
- In Australia (for initial relationship building) or US/EU (for scale)

**Where to find them:**
- LangChain Discord / community forums
- Australian AI/ML meetups (Melbourne, Sydney)
- LinkedIn outreach to "AI Engineer" titles at mid-size companies
- Hacker News "Show HN" post

### B2. Design Partner Offer
**What they get:**
- Free enterprise tier for 12 months
- Direct Slack/Teams channel with founders
- Input on roadmap priorities
- Co-marketing (case study, logo on site)

**What you get:**
- Real production usage data
- Feedback on what matters vs. what doesn't
- Validation (or invalidation) of the deployment enforcement thesis
- Testimonial for investor pitch

### B3. "Show HN" Post
**When:** After Phase A is complete (CLI + SSL + landing page refresh)
**What:** "Show HN: AgentGuard — Deployment enforcement for AI agents (like container scanning, but for agents)"
**Why:** High-signal audience. If it resonates, you get early adopters. If it doesn't, you learn fast.

---

## Phase C: Business Formation (2-3 weeks, parallel)

### C1. Incorporate
**Decision:** Delaware C-Corp (if targeting US VC) or Australian Pty Ltd (if bootstrapping initially).
**Recommendation:** If you're considering investment, do Delaware C-Corp now. It's the standard. You can always add an AU subsidiary later.
**Effort:** 1-2 weeks with a service like Stripe Atlas or Clerky

### C2. Trademark
**What:** File "AgentGuard" trademark in AU and US (Madrid Protocol).
**Why:** Protect the brand before public launch.
**Prerequisite:** Entity name from C1.
**Effort:** File and wait. ~$1,500 total.

### C3. Google Search Console
**What:** Verify `agentguard.dev` domain.
**Why:** SEO visibility. Need to verify before Google indexes properly.
**Effort:** 10 minutes (you need to do this — requires domain ownership verification).

### C4. Terms of Service + Privacy Policy
**What:** Standard SaaS ToS + privacy policy on the website.
**Why:** Required before accepting any customer data. Required for enterprise sales.
**Effort:** Use a template service (Termly, Iubenda) — 1 hour.

---

## Phase D: Production Hardening for Scale (4-6 weeks)

These items become necessary when you have 10+ tenants or your first enterprise customer.

### D1. Redis + Background Workers
**Trigger:** Webhook delivery failures, or >100 concurrent tenants
**What:**
- Azure Cache for Redis — hot-path rate limit counters, policy bundle cache (TTL 60s), kill switch flag propagation
- Background worker (BullMQ) — webhook delivery with retries, async audit event processing
**Effort:** 1-2 weeks

### D2. In-Process SDK (Local Eval)
**Trigger:** Design partner feedback ("HTTP latency is too high for every tool call")
**What:**
- SDK downloads compiled PolicyBundle on startup
- `evaluate()` is a local function call (<5ms), not HTTP
- Telemetry batched and flushed async (every 5s or 100 events)
**Effort:** 2-3 weeks
**Impact:** This is the difference between "nice to have" and "must have" for production agents

### D3. Enterprise Auth (JWT RS256)
**Trigger:** Enterprise customer requesting SSO
**What:**
- JWT middleware for dashboard/management API
- API keys remain for agent-to-API calls
- Integration with Auth0/Okta
**Effort:** 1-2 weeks

### D4. Multi-Tenancy Hardening
**What:**
- Postgres connection pooling (PgBouncer)
- Per-tenant resource quotas
- Database connection limits
- Graceful degradation under load
**Effort:** 1 week

---

## Phase E: Enterprise Features (6-12 weeks)

### E1. SIEM Integrations
**Trigger:** First enterprise customer with Splunk or Sentinel
**What:** Native push to SIEM HTTP Event Collector endpoints
**Effort:** 1-2 weeks per integration

### E2. Compliance Reporting
**Trigger:** Regulated industry design partner (EU AI Act, HIPAA, SOC 2)
**What:**
- Report templates (EU AI Act Article 11, HIPAA 164.312)
- PDF generation from audit log queries
- Vanta/Drata integration for SOC 2 evidence
**Effort:** 2-4 weeks

### E3. ML Anomaly Detection
**Trigger:** 30+ days of production telemetry
**What:**
- Online learning model (River library or similar)
- Replaces rule-based anomaly scoring
- Adaptive baselines per tenant
**Effort:** 2-3 weeks

### E4. Multi-Agent Governance
**Trigger:** Design partner with orchestrated multi-agent systems
**What:**
- `parent_agent_id` and `orchestration_id` on audit events
- Cross-agent correlation queries
- Agent interaction graph in dashboard
**Effort:** 2-3 weeks

### E5. On-Premises / Helm Chart
**Trigger:** Enterprise customer requiring data residency
**What:**
- Docker Compose reference for on-prem
- Helm chart for Kubernetes
- Offline licence validation
**Effort:** 2-3 weeks

---

## Priority Stack (What to Do First)

| Priority | Item | Type | Effort | Why Now |
|----------|------|------|--------|---------|
| 1 | CLI Tool (A1) | Engineering | 2-3 days | Completes deployment enforcement story |
| 2 | Publish SDKs (A2) | Engineering | 1 hour | Unblocks developers trying the product |
| 3 | SSL Full/Strict (A3) | Infrastructure | 30 min | Security credibility |
| 4 | Incorporate (C1) | Business | 1-2 weeks | Unblocks everything else |
| 5 | Landing page refresh (A4) | Marketing | 1 day | "Deployment enforcement" positioning |
| 6 | Design partners (B1-B2) | Business | Ongoing | Validates the thesis |
| 7 | Show HN (B3) | Marketing | 1 day | Top-of-funnel |
| 8 | Trademark (C2) | Legal | File + wait | Protect before visibility |
| 9 | Google Search Console (C3) | Marketing | 10 min | SEO |
| 10 | ToS + Privacy (C4) | Legal | 1 hour | Required for customers |

Everything in Phase D and E is triggered by customer demand — don't build it until someone asks for it.

---

## Success Metrics

### 30-Day Targets
- [ ] 3+ design partners signed up and using the API
- [ ] CLI published and getting npm installs
- [ ] 1 Show HN post published
- [ ] Entity incorporated
- [ ] Trademark filed

### 90-Day Targets
- [ ] 1+ design partner in production (real agents, real policies)
- [ ] 10+ tenants on the platform
- [ ] 1 case study written
- [ ] In-process SDK shipped (if design partner requests it)
- [ ] Revenue: $0 (free tier) — but pipeline of paid interest

### 180-Day Targets
- [ ] First paying customer
- [ ] SOC 2 Type I started (if enterprise path)
- [ ] Series seed conversations (if VC path)
- [ ] 50+ tenants

---

*Document version: 1.0 — March 2026*
*Classification: Internal — Founder's Eyes Only*

# AgentGuard Launch Guide — What Hani Needs to Do

**Date:** 2026-03-09
**Status:** v0.9.0 ready (pending deploy), all technical work complete

---

## 🔴 Must Do (Blocks Revenue)

### 1. Connect Stripe (~30 min)

**What:** Create Stripe products so people can actually pay you.

**Steps:**
1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → Sign up / Log in
2. **Create Products:**
   - **AgentGuard Pro** — $149/month (recurring)
     - Description: "500K events/mo, SIEM, SSO, A2A trust, 90-day audit retention"
   - **AgentGuard Enterprise** — Custom pricing (contact sales)
     - Description: "Unlimited events, air-gap deploy, custom SLA"
3. **Create Webhook:**
   - Endpoint URL: `https://api.agentguard.dev/api/v1/stripe/webhook`
   - Events to listen: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
   - Copy the **Webhook Signing Secret** (starts with `whsec_`)
4. **Set Azure env var:**
   ```bash
   az containerapp update \
     --name agentguard-api \
     --resource-group agentguard-rg \
     --set-env-vars "STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE"
   ```

### 2. Set Admin Key on Azure (~5 min)

**What:** Enable admin endpoints (license management, system config).

```bash
# Generate a strong key
ADMIN_KEY=$(openssl rand -hex 32)
echo "Save this: $ADMIN_KEY"

az containerapp update \
  --name agentguard-api \
  --resource-group agentguard-rg \
  --set-env-vars "ADMIN_KEY=$ADMIN_KEY"
```

### 3. Set Integration Encryption Key (~5 min)

**What:** Encrypt stored integration credentials (SIEM, webhooks).

```bash
ENCRYPTION_KEY=$(openssl rand -hex 32)
echo "Save this: $ENCRYPTION_KEY"

az containerapp update \
  --name agentguard-api \
  --resource-group agentguard-rg \
  --set-env-vars "INTEGRATION_ENCRYPTION_KEY=$ENCRYPTION_KEY"
```

### 4. Incorporate Pty Ltd (~$600, 1-2 days)

**What:** Australian company registration. Unlocks ABN, grants, trademark, contracts.

**Options (fastest to slowest):**
1. **Lawpath** (lawpath.com.au) — ~$600, online, 1-2 business days
   - Company name: "AgentGuard Pty Ltd" or "AgentGuard Technologies Pty Ltd"
   - Check availability first: [ASIC search](https://connectonline.asic.gov.au/RegistrySearch/faces/landing/SearchRegisters.jspx)
2. **Cleardocs** (cleardocs.com) — ~$500, online, 1-3 days
3. **Direct via ASIC** — $576, manual, 2-5 days

**You'll need:**
- Full legal name, DOB, residential address
- Registered office address (can be home)
- Director consent (you as sole director)
- Share structure (100 ordinary shares, you as sole shareholder)

**After incorporation:**
- Apply for ABN (free, instant at abr.gov.au)
- Register for GST if revenue >$75K/year
- Open business bank account

---

## 🟡 Should Do This Week

### 5. Cloudflare www Redirect (~2 min)

**What:** `www.agentguard.dev` → `agentguard.dev` (fixes Google Search Console "page with redirect")

1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select `agentguard.dev` zone
3. Go to **Rules** → **Redirect Rules** → **Create Rule**
4. **When:** Hostname equals `www.agentguard.dev`
5. **Then:** Dynamic redirect to `https://agentguard.dev/${http.request.uri.path}` with status 301
6. Save and deploy

### 6. Google Search Console (~10 min)

**What:** Verify ownership and submit sitemap for indexing.

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add property: `agentguard.dev` (Domain type)
3. Verify via Cloudflare DNS (add TXT record they give you)
4. Submit sitemap: `https://agentguard.dev/sitemap.xml`
5. Request indexing for main pages

### 7. Make GitHub Repo Public (when ready)

**What:** Open-source trust signal. BSL 1.1 license is already in place.

```bash
# On GitHub: Settings → General → Danger Zone → Change Visibility → Public
```

**Before making public:**
- Verify no secrets in commit history (API keys, passwords)
- README.md is polished
- LICENSE file is correct (BSL 1.1)

---

## 🟢 Nice to Have (Post-Launch)

### 8. Submit IGP Grant

**Prerequisite:** ABN from incorporation
**File:** `docs/IGP_APPLICATION.md` (draft ready)
**Amount:** Up to $25,000 matching

### 9. Post on Show HN

**File:** `docs/SHOW_HN_DRAFT.md` (draft ready)
**Best time:** Tuesday-Thursday, 9-11am US Eastern
**Title suggestion:** "Show HN: AgentGuard – Runtime Security for AI Agents (Open Source)"

### 10. Design Partner Outreach

**File:** `/home/vector/.openclaw/workspace/OUTREACH_DRAFT.md` (draft ready)
**Target:** 5-10 companies using AI agents in production
**Offer:** Free Pro tier for 6 months in exchange for feedback + case study

### 11. Trademark

**Prerequisite:** ABN
**Cost:** ~$250 via IP Australia
**File online:** [ipaustralia.gov.au](https://www.ipaustralia.gov.au/trade-marks)

---

## 📋 Environment Variables Checklist

| Variable | Set? | How |
|----------|------|-----|
| `DATABASE_URL` | ✅ | Already configured (PostgreSQL) |
| `ADMIN_KEY` | ❌ | See step 2 above |
| `STRIPE_WEBHOOK_SECRET` | ❌ | See step 1 above |
| `INTEGRATION_ENCRYPTION_KEY` | ❌ | See step 3 above |
| `LICENSE_PRIVATE_KEY` | ❌ | `cat /tmp/agentguard-license-private.pem` → set as env var |
| `REDIS_URL` | ❌ | Optional — in-memory rate limiting works fine for now |
| `JWT_JWKS_URL` | ❌ | Only needed when SSO is configured |

---

## 💰 Revenue Path

```
Week 1: Launch (Show HN + social)
         ↓
Week 2: Design partners (5-10 free Pro accounts)
         ↓
Week 3-4: Iterate on feedback
         ↓
Month 2: First paying Pro customers ($149/mo)
         ↓
Month 3: Enterprise conversations ($500-2000/mo)
         ↓
Month 6: IGP grant ($25K) + investor conversations
```

---

## 🔑 Important Credentials (Save Securely)

- **Ed25519 License Private Key:** `/tmp/agentguard-license-private.pem` — **BACK THIS UP!** Needed to sign license keys. If lost, all issued licenses become invalid.
- **Ed25519 Public Key:** Already in repo at `api/license-pub.pem`
- **PostgreSQL:** `postgresql://agentguardadmin:AG_Secure_a4b7e2c9f1d3@agentguard-db.postgres.database.azure.com:5432/agentguard?sslmode=require`
- **Cloudflare API Token:** `iY1YHCutQQrlmnxpV9fwQCbhjafN3xFcb54Z9G0s` (read-only — get a write token from CF dashboard for page rules)
- **npm Token:** In GitHub Secrets as `NPM_TOKEN`
- **ClawHub Token:** `clh_qCh8MHBfgXyrvn5DmqiujYmAaqokegKK6MIfHENT9u0`

---

*Generated by Vector — 2026-03-09*

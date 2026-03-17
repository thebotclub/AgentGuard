# Security Hardening Guide

This document outlines the security hardening steps required for production deployments of AgentGuard.

## Cloudflare Full/Strict SSL Setup

To ensure end-to-end encryption with strict certificate validation, configure Cloudflare with Full (Strict) SSL mode. This requires generating an origin certificate from Cloudflare and configuring your origin server to use it.

### Prerequisites

- Cloudflare account with a domain added
- Access to Azure Portal (or your cloud provider) for storing certificates
- Azure Container App or VM running AgentGuard

### Step 1: Generate Origin Certificate

1. Log in to **Cloudflare Dashboard**
2. Select your domain
3. Navigate to **SSL/TLS** → **Origin Server**
4. Click **Create Certificate**
5. Configure:
   - **Certificate validity**: 15 years (maximum)
   - **Private key type**: RSA 2048 (or ECC 256 for better performance)
6. Click **Create**
7. Copy the **Origin Certificate** and **Private Key** (you'll need both)

> ⚠️ **Important**: Download and securely store the certificate and private key. Cloudflare won't show them again.

### Step 2: Store Certificate in Azure

#### Option A: Azure Key Vault (Recommended)

1. Create a Key Vault (or use existing):
   ```bash
   az keyvault create --name "agentguard-certs" --resource-group "agentguard-rg"
   ```

2. Store the certificate:
   ```bash
   az keyvault certificate import \
     --vault-name "agentguard-certs" \
     --name "origin-cert" \
     --file "origin-certificate.pem"
   ```

3. Store the private key as a secret:
   ```bash
   az keyvault secret set \
     --vault-name "agentguard-certs" \
     --name "origin-private-key" \
     --file "private-key.pem"
   ```

#### Option B: Container App Environment Variables

For simpler setups, store directly in Container App configuration:

1. In Azure Portal, go to your **Container App**
2. Navigate to **Environment variables**
3. Add:
   - `ORIGIN_CERT` = (paste the origin certificate content)
   - `ORIGIN_PRIVATE_KEY` = (paste the private key content)

### Step 3: Configure Container App HTTPS Ingress

If using Azure Container Apps with a custom domain:

```bash
# Enable HTTPS ingress with the certificate
az containerapp ingress enable \
  --type external \
  --transport http \
  --certificate-arm "/subscriptions/.../providers/Microsoft.KeyVault/vaults/agentguard-certs/certificates/origin-cert" \
  --name agentguard-app \
  --resource-group agentguard-rg
```

For environment variable-based certificates:

```bash
# Create a TLS secret from the certificate
az containerapp secret set \
  --name agentguard-app \
  --resource-group agentguard-rg \
  --secrets "origin-cert=${ORIGIN_CERT}" "origin-key=${ORIGIN_PRIVATE_KEY}"

# Reference in ingress
az containerapp ingress update \
  --name agentguard-app \
  --resource-group agentguard-rg \
  --transport http \
  --certificate-secret-name origin-cert
```

### Step 4: Upgrade Cloudflare SSL Mode

1. In **Cloudflare Dashboard**, go to **SSL/TLS** → **Overview**
2. Change **Encryption Mode** to **Full (Strict)**

### Step 5: Verify Configuration

1. **Check SSL certificate**:
   ```bash
   curl -vI https://your-domain.com/health
   ```

2. **Verify certificate chain**:
   - The origin server should present the Cloudflare-issued certificate
   - SSL Labs test should show "Trusted" rating

3. **Test TLS versions**:
   - Ensure only TLS 1.2 and 1.3 are accepted
   - Disable TLS 1.0 and 1.1

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Certificate not trusted | Ensure Cloudflare SSL mode is "Full (Strict)" |
| Mixed content warnings | Update all resources to HTTPS |
| TLS errors | Verify origin server TLS configuration |
| Key Vault access | Ensure Managed Identity has Key Vault access |

## Additional Security Headers

Ensure your origin server responds with these security headers:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Content-Security-Policy: default-src 'self'
```

## Rate Limiting

Configure Cloudflare rate limiting to protect against DDoS:

1. **SSL/TLS** → **Edge Certificates** → **Rate Limiting**
2. Create a rule:
   - Path: `/api/v1/evaluate`
   - Threshold: 100 requests/minute
   - Action: Block

## Web Application Firewall (WAF)

Enable Cloudflare WAF rules:

1. **Security** → **WAF**
2. Enable **Cloudflare Managed Rules**
3. Add custom rules for:
   - Block known attack patterns
   - Challenge suspicious traffic
   - Rate limit API endpoints

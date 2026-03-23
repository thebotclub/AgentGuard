'use client';

import { useState, useEffect, useCallback } from 'react';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

interface SsoConfig {
  id: string;
  tenantId: string;
  provider: string;
  protocol: 'oidc' | 'saml';
  domain: string;
  clientId: string;
  discoveryUrl: string | null;
  redirectUri: string | null;
  scopes: string[] | null;
  forceSso: boolean;
  roleClaimName: string | null;
  adminGroup: string | null;
  memberGroup: string | null;
  hasIdpMetadata: boolean;
  spEntityId: string | null;
  createdAt: string;
  updatedAt: string | null;
}

const PROVIDER_OPTIONS = [
  { value: 'okta', label: 'Okta', protocol: 'oidc' as const },
  { value: 'azure_ad', label: 'Microsoft Azure AD / Entra ID', protocol: 'oidc' as const },
  { value: 'google', label: 'Google Workspace', protocol: 'oidc' as const },
  { value: 'auth0', label: 'Auth0', protocol: 'oidc' as const },
  { value: 'oidc', label: 'Custom OIDC Provider', protocol: 'oidc' as const },
  { value: 'saml', label: 'SAML 2.0 Provider', protocol: 'saml' as const },
];

const DOMAIN_PLACEHOLDERS: Record<string, string> = {
  okta: 'your-company.okta.com',
  azure_ad: 'your-tenant-id (e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)',
  google: 'accounts.google.com (auto-configured)',
  auth0: 'your-domain.auth0.com',
  oidc: 'https://your-idp.example.com',
  saml: 'your-idp.example.com',
};

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: '#1e293b',
      borderRadius: '12px',
      padding: '24px',
      border: '1px solid #334155',
      ...style,
    }}>
      {children}
    </div>
  );
}

function Input({
  label, value, onChange, placeholder, type = 'text', disabled = false, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '8px',
          color: disabled ? '#64748b' : '#f1f5f9',
          fontSize: '14px',
          boxSizing: 'border-box',
          outline: 'none',
        }}
      />
      {hint && <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{hint}</p>}
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
          background: checked ? '#0ea5e9' : '#334155', position: 'relative', flexShrink: 0, marginTop: '2px',
          transition: 'background 0.2s',
        }}
      >
        <div style={{
          width: '18px', height: '18px', borderRadius: '50%', background: 'var(--bg-card)',
          position: 'absolute', top: '3px', left: checked ? '23px' : '3px',
          transition: 'left 0.2s',
        }} />
      </button>
      <div>
        <div style={{ fontSize: '14px', color: '#f1f5f9' }}>{label}</div>
        {hint && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{hint}</div>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: 'configured' | 'not-configured' | 'testing' }) {
  const styles = {
    configured: { bg: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', text: '● Configured' },
    'not-configured': { bg: 'rgba(148, 163, 184, 0.1)', color: '#94a3b8', text: '○ Not Configured' },
    testing: { bg: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24', text: '⟳ Testing...' },
  }[status];

  return (
    <span style={{
      background: styles.bg,
      color: styles.color,
      padding: '4px 12px',
      borderRadius: '20px',
      fontSize: '13px',
      fontWeight: 500,
    }}>
      {styles.text}
    </span>
  );
}

export default function SsoSettingsPage() {
  const [config, setConfig] = useState<SsoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [provider, setProvider] = useState('okta');
  const [protocol, setProtocol] = useState<'oidc' | 'saml'>('oidc');
  const [domain, setDomain] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [discoveryUrl, setDiscoveryUrl] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [scopes, setScopes] = useState('openid email profile');
  const [forceSso, setForceSso] = useState(false);
  const [roleClaimName, setRoleClaimName] = useState('');
  const [adminGroup, setAdminGroup] = useState('');
  const [memberGroup, setMemberGroup] = useState('');
  const [idpMetadataXml, setIdpMetadataXml] = useState('');
  const [spEntityId, setSpEntityId] = useState('');

  const apiKey = typeof window !== 'undefined' ? localStorage.getItem('ag_api_key') ?? '' : '';

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/sso/config`, {
        headers: { 'x-api-key': apiKey },
      });
      if (res.status === 404) {
        setConfig(null);
      } else if (res.ok) {
        const data = await res.json() as SsoConfig;
        setConfig(data);
        // Populate form
        setProvider(data.provider);
        setProtocol(data.protocol ?? 'oidc');
        setDomain(data.domain);
        setClientId(data.clientId);
        setDiscoveryUrl(data.discoveryUrl ?? '');
        setRedirectUri(data.redirectUri ?? '');
        setScopes(data.scopes?.join(' ') ?? 'openid email profile');
        setForceSso(data.forceSso);
        setRoleClaimName(data.roleClaimName ?? '');
        setAdminGroup(data.adminGroup ?? '');
        setMemberGroup(data.memberGroup ?? '');
        setSpEntityId(data.spEntityId ?? '');
      }
    } catch (e) {
      setError('Failed to load SSO configuration');
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const handleProviderChange = (value: string) => {
    setProvider(value);
    const option = PROVIDER_OPTIONS.find((o) => o.value === value);
    if (option) {
      setProtocol(option.protocol);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload: Record<string, unknown> = {
      provider,
      protocol,
      domain,
      clientId,
      discoveryUrl: discoveryUrl || null,
      redirectUri: redirectUri || null,
      scopes: scopes.split(/\s+/).filter(Boolean),
      forceSso,
      roleClaimName: roleClaimName || null,
      adminGroup: adminGroup || null,
      memberGroup: memberGroup || null,
      spEntityId: spEntityId || null,
    };

    if (clientSecret) payload['clientSecret'] = clientSecret;
    if (protocol === 'saml' && idpMetadataXml) payload['idpMetadataXml'] = idpMetadataXml;

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/sso/config`, {
        method: 'PUT',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error ?? 'Save failed');
      }

      const updated = await res.json() as SsoConfig;
      setConfig(updated);
      setSuccess('SSO configuration saved successfully');
      setClientSecret(''); // Clear secret from form
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save SSO configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/sso/test`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      });
      const data = await res.json() as { success: boolean; issuer?: string; error?: string };
      setTestResult({
        success: data.success,
        message: data.success
          ? `✓ Connected to IdP: ${data.issuer}`
          : `✗ ${data.error ?? 'Connection failed'}`,
      });
    } catch {
      setTestResult({ success: false, message: '✗ Network error — check API URL' });
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Remove SSO configuration? Users will fall back to password login.')) return;

    try {
      await fetch(`${API_BASE}/api/v1/sso/config`, {
        method: 'DELETE',
        headers: { 'x-api-key': apiKey },
      });
      setConfig(null);
      setSuccess('SSO configuration removed');
      // Reset form
      setProvider('okta'); setDomain(''); setClientId('');
      setClientSecret(''); setForceSso(false);
    } catch {
      setError('Failed to remove SSO configuration');
    }
  };

  const authorizeUrl = `${API_BASE}/api/v1/auth/sso/authorize?tenant_id=${config?.tenantId ?? '{YOUR_TENANT_ID}'}`;
  const callbackUrl = `${API_BASE}/api/v1/auth/sso/callback`;

  return (
    <div style={{ padding: '32px', maxWidth: '900px', margin: '0 auto', color: '#f1f5f9' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: '#f1f5f9' }}>
              🔐 Single Sign-On (SSO)
            </h1>
            <p style={{ color: 'var(--text-muted)', marginTop: '6px', fontSize: '14px' }}>
              Configure OIDC or SAML 2.0 authentication for enterprise users.
            </p>
          </div>
          <StatusBadge status={loading ? 'testing' : config ? 'configured' : 'not-configured'} />
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#22c55e' }}>
          {success}
        </div>
      )}

      {loading ? (
        <Card><p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Loading SSO configuration...</p></Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Provider Selection */}
          <Card>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: 0, marginBottom: '20px', color: '#f1f5f9' }}>
              Identity Provider
            </h2>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>
                Provider
              </label>
              <select
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', background: '#0f172a',
                  border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9',
                  fontSize: '14px', boxSizing: 'border-box',
                }}
              >
                {PROVIDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <Input
              label={provider === 'azure_ad' ? 'Tenant ID' : provider === 'okta' ? 'Okta Domain' : 'Domain / Issuer URL'}
              value={domain}
              onChange={setDomain}
              placeholder={DOMAIN_PLACEHOLDERS[provider] ?? 'your-idp.example.com'}
            />
          </Card>

          {/* OIDC Configuration */}
          {protocol === 'oidc' && (
            <Card>
              <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: 0, marginBottom: '20px', color: '#f1f5f9' }}>
                OIDC Configuration
              </h2>

              <Input label="Client ID" value={clientId} onChange={setClientId} placeholder="your-client-id" />
              <Input
                label="Client Secret"
                value={clientSecret}
                onChange={setClientSecret}
                type="password"
                placeholder={config ? '(leave blank to keep existing)' : 'your-client-secret'}
              />
              <Input
                label="Discovery URL (optional — auto-configured for Okta, Azure, Google)"
                value={discoveryUrl}
                onChange={setDiscoveryUrl}
                placeholder="https://your-idp/.well-known/openid-configuration"
                hint="Auto-derived for Okta, Azure AD, and Google Workspace."
              />
              <Input
                label="Redirect / Callback URI"
                value={redirectUri}
                onChange={setRedirectUri}
                placeholder={callbackUrl}
                hint="Register this URI in your IdP application settings."
              />
              <Input
                label="Scopes (space-separated)"
                value={scopes}
                onChange={setScopes}
                placeholder="openid email profile"
              />
            </Card>
          )}

          {/* SAML Configuration */}
          {protocol === 'saml' && (
            <Card>
              <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: 0, marginBottom: '20px', color: '#f1f5f9' }}>
                SAML 2.0 Configuration
              </h2>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>
                  IdP Metadata XML
                </label>
                <textarea
                  value={idpMetadataXml}
                  onChange={(e) => setIdpMetadataXml(e.target.value)}
                  placeholder="Paste your IdP metadata XML here..."
                  rows={8}
                  style={{
                    width: '100%', padding: '10px 12px', background: '#0f172a',
                    border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9',
                    fontSize: '13px', fontFamily: 'monospace', boxSizing: 'border-box', resize: 'vertical',
                  }}
                />
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Download from your IdP's admin portal. Contains endpoints and signing certificate.
                </p>
              </div>

              <Input
                label="SP Entity ID (optional — defaults to ACS URL)"
                value={spEntityId}
                onChange={setSpEntityId}
                placeholder={callbackUrl}
              />

              <Input
                label="Assertion Consumer Service (ACS) URL"
                value={redirectUri || callbackUrl}
                onChange={setRedirectUri}
                placeholder={callbackUrl}
                hint="Register this URL in your IdP application settings."
              />

              {/* SAML SP metadata */}
              <div style={{ background: '#0f172a', borderRadius: '8px', padding: '12px', marginTop: '8px' }}>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 6px 0' }}>Your SP Details (register in IdP):</p>
                <p style={{ fontSize: '13px', color: '#38bdf8', fontFamily: 'monospace', margin: '4px 0' }}>
                  ACS URL: {callbackUrl}
                </p>
                <p style={{ fontSize: '13px', color: '#38bdf8', fontFamily: 'monospace', margin: '4px 0' }}>
                  Entity ID: {spEntityId || callbackUrl}
                </p>
              </div>
            </Card>
          )}

          {/* Role Mapping */}
          <Card>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: 0, marginBottom: '20px', color: '#f1f5f9' }}>
              Role Mapping
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Map IdP groups or roles to AgentGuard roles. Users not matching any group get <strong>viewer</strong> access.
            </p>

            <Input
              label="Role Claim Name (OIDC)"
              value={roleClaimName}
              onChange={setRoleClaimName}
              placeholder="roles (default)"
              hint="JWT claim containing role names. Common values: roles, groups, custom_roles."
            />
            <Input
              label="Admin Group Name"
              value={adminGroup}
              onChange={setAdminGroup}
              placeholder="AgentGuard-Admins"
              hint="Users in this group get admin access."
            />
            <Input
              label="Member Group Name"
              value={memberGroup}
              onChange={setMemberGroup}
              placeholder="AgentGuard-Members"
              hint="Users in this group get member access."
            />
          </Card>

          {/* Security Settings */}
          <Card>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: 0, marginBottom: '20px', color: '#f1f5f9' }}>
              Security
            </h2>
            <Toggle
              label="Force SSO — disable password login"
              checked={forceSso}
              onChange={setForceSso}
              hint="When enabled, all users must authenticate via SSO. Password login is disabled for this tenant."
            />
          </Card>

          {/* Endpoint Reference */}
          <Card>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: 0, marginBottom: '16px', color: '#f1f5f9' }}>
              SSO Endpoints
            </h2>
            {[
              { label: 'Authorize (initiate SSO)', url: authorizeUrl },
              { label: 'Callback / ACS URL', url: callbackUrl },
            ].map(({ label, url }) => (
              <div key={label} style={{ marginBottom: '12px' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0' }}>{label}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <code style={{ fontSize: '13px', color: '#38bdf8', background: '#0f172a', padding: '6px 10px', borderRadius: '6px', flex: 1, overflowX: 'auto' }}>
                    {url}
                  </code>
                  <button
                    onClick={() => void navigator.clipboard.writeText(url)}
                    style={{ padding: '6px 10px', background: '#334155', border: 'none', borderRadius: '6px', color: '#94a3b8', cursor: 'pointer', fontSize: '12px' }}
                  >
                    Copy
                  </button>
                </div>
              </div>
            ))}
          </Card>

          {/* Test Connection Result */}
          {testResult && (
            <div style={{
              background: testResult.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${testResult.success ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              borderRadius: '8px', padding: '12px 16px',
              color: testResult.success ? '#22c55e' : '#ef4444',
            }}>
              {testResult.message}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              style={{
                padding: '10px 24px', background: saving ? '#334155' : '#0ea5e9',
                border: 'none', borderRadius: '8px', color: '#fff',
                fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontSize: '14px',
              }}
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>

            {config && (
              <button
                onClick={() => void handleTest()}
                disabled={testing}
                style={{
                  padding: '10px 24px', background: 'transparent',
                  border: '1px solid #334155', borderRadius: '8px', color: '#94a3b8',
                  cursor: testing ? 'not-allowed' : 'pointer', fontSize: '14px',
                }}
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
            )}

            {config && (
              <button
                onClick={() => void handleDelete()}
                style={{
                  padding: '10px 24px', background: 'transparent',
                  border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#ef4444',
                  cursor: 'pointer', fontSize: '14px', marginLeft: 'auto',
                }}
              >
                Remove SSO
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

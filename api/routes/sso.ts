/**
 * AgentGuard — SSO / OIDC / SAML Routes
 *
 * Configuration:
 *   GET  /api/v1/auth/sso/config    — get SSO config (secrets masked)
 *   PUT  /api/v1/auth/sso/config    — update SSO config
 *   DELETE /api/v1/sso/config       — remove SSO config (legacy)
 *
 * OIDC Flow:
 *   GET  /api/v1/auth/sso/authorize — initiate OIDC/SAML SSO
 *   POST /api/v1/auth/sso/callback  — handle OIDC/SAML callback
 *   POST /api/v1/auth/sso/test      — test IdP connectivity
 *
 * Legacy (unchanged for backwards compatibility):
 *   POST   /api/v1/sso/configure    — configure SSO provider
 */
import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { logger } from '../lib/logger.js';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';
import { requireRole } from '../lib/rbac.js';
import { encryptConfig, decryptConfig } from '../lib/integration-crypto.js';
import { requireFeature } from '../middleware/feature-gate.js';
import {
  fetchDiscovery,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  validateIdToken,
  extractUserFromClaims,
  mapClaimsToRole,
  generateCodeVerifier,
  testOidcConfig,
  getProviderDiscoveryUrl,
  type OidcProviderConfig,
} from '../lib/oidc-provider.js';
import {
  parseSamlMetadata,
  buildSamlAuthnRequest,
  parseSamlResponse,
  type SamlSpConfig,
} from '../lib/saml-provider.js';
import type { SsoProvider, SsoProtocol } from '../db-interface.js';
import { z } from 'zod';
import { signSsoJwt, SSO_JWT_COOKIE } from '../lib/sso-jwt.js';

// ── Schemas ───────────────────────────────────────────────────────────────

const SsoConfigUpdateSchema = z.object({
  provider: z.enum(['auth0', 'okta', 'azure_ad', 'google', 'saml', 'oidc']),
  protocol: z.enum(['oidc', 'saml']).optional().default('oidc'),
  domain: z.string().min(1).max(255),
  clientId: z.string().min(1).max(500).optional().default(''),
  clientSecret: z.string().min(0).max(2000).optional().default(''),
  discoveryUrl: z.string().url().optional().nullable(),
  redirectUri: z.string().url().optional().nullable(),
  scopes: z.array(z.string()).optional().nullable(),
  forceSso: z.boolean().optional().default(false),
  roleClaimName: z.string().optional().nullable(),
  adminGroup: z.string().optional().nullable(),
  memberGroup: z.string().optional().nullable(),
  idpMetadataXml: z.string().optional().nullable(),
  spEntityId: z.string().optional().nullable(),
});

const SsoAuthorizeSchema = z.object({
  tenantId: z.string().min(1),
  returnTo: z.string().optional(),
});

const SsoCallbackSchema = z.object({
  code: z.string().optional(),
  state: z.string().min(1),
  SAMLResponse: z.string().optional(),
  RelayState: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

// ── Legacy Schema (keep existing POST /api/v1/sso/configure working) ──────
const SsoConfigureRequestSchema = z.object({
  provider: z.enum(['auth0', 'okta', 'azure_ad', 'google', 'saml', 'oidc']),
  domain: z.string().min(1).max(255),
  clientId: z.string().min(1).max(500),
  clientSecret: z.string().min(1).max(2000),
});

// ── State Store Helpers ────────────────────────────────────────────────────

interface SsoStateData {
  tenantId: string;
  codeVerifier: string;
  nonce: string;
  returnTo?: string;
  samlRequestId?: string;
}

async function storeSsoState(db: IDatabase, state: string, data: SsoStateData): Promise<void> {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min
  await db.storeSsoState(state, JSON.stringify(data), expiresAt);
}

async function retrieveSsoState(db: IDatabase, state: string): Promise<SsoStateData | null> {
  const row = await db.getSsoState(state);
  if (!row) return null;
  // Check expiry
  if (new Date(row.expires_at) < new Date()) {
    await db.deleteSsoState(state);
    return null;
  }
  return JSON.parse(row.data) as SsoStateData;
}

// ── Helper: mask SSO config for API responses ─────────────────────────────

function maskSsoConfig(row: Awaited<ReturnType<IDatabase['getSsoConfig']>>) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    provider: row.provider,
    protocol: row.protocol ?? 'oidc',
    domain: row.domain,
    clientId: row.client_id,
    clientSecret: '***',
    discoveryUrl: row.discovery_url,
    redirectUri: row.redirect_uri,
    scopes: row.scopes ? row.scopes.split(' ') : null,
    forceSso: Boolean(row.force_sso),
    roleClaimName: row.role_claim_name,
    adminGroup: row.admin_group,
    memberGroup: row.member_group,
    hasIdpMetadata: Boolean(row.idp_metadata_xml),
    spEntityId: row.sp_entity_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Route Factory ──────────────────────────────────────────────────────────

export function createSsoRoutes(db: IDatabase, auth: AuthMiddleware): Router {
  const router = Router();

  // ── GET /api/v1/auth/sso/config ────────────────────────────────────────────
  router.get(
    '/api/v1/auth/sso/config',
    auth.requireTenantAuth,
    requireFeature('sso'),
    requireRole('owner', 'admin'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      try {
        const row = await db.getSsoConfig(tenantId);
        if (!row) {
          return res.status(404).json({ error: 'No SSO configuration found for this tenant' });
        }
        return res.json(maskSsoConfig(row));
      } catch (err) {
        logger.error({ err: err instanceof Error ? err.message : String(err) }, '[sso/config GET] error');
        return res.status(500).json({ error: 'Failed to retrieve SSO config' });
      }
    },
  );

  // ── PUT /api/v1/auth/sso/config ────────────────────────────────────────────
  router.put(
    '/api/v1/auth/sso/config',
    auth.requireTenantAuth,
    requireFeature('sso'),
    requireRole('owner', 'admin'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;

      const parsed = SsoConfigUpdateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
      }

      const {
        provider, protocol, domain, clientId, clientSecret,
        discoveryUrl, redirectUri, scopes, forceSso,
        roleClaimName, adminGroup, memberGroup, idpMetadataXml, spEntityId,
      } = parsed.data;

      // Encrypt client secret (only if provided)
      let clientSecretEncrypted = '';
      if (clientSecret) {
        clientSecretEncrypted = encryptConfig({ clientSecret, provider, tenantId });
      } else {
        // Keep existing secret if none provided
        const existing = await db.getSsoConfig(tenantId);
        clientSecretEncrypted = existing?.client_secret_encrypted ?? '';
      }

      // Auto-derive discovery URL for known providers
      let resolvedDiscoveryUrl = discoveryUrl;
      if (!resolvedDiscoveryUrl && protocol === 'oidc' && provider !== 'saml' && provider !== 'oidc') {
        resolvedDiscoveryUrl = getProviderDiscoveryUrl(provider, domain);
      }

      // Validate SAML metadata if provided
      if (protocol === 'saml' && idpMetadataXml) {
        try {
          parseSamlMetadata(idpMetadataXml);
        } catch (err) {
          return res.status(400).json({
            error: `Invalid IdP metadata: ${err instanceof Error ? err.message : 'parse failed'}`,
          });
        }
      }

      try {
        const row = await db.upsertSsoConfig(tenantId, {
          provider: provider as SsoProvider,
          protocol: protocol as SsoProtocol,
          domain,
          clientId,
          clientSecretEncrypted,
          discoveryUrl: resolvedDiscoveryUrl,
          redirectUri,
          scopes: scopes ? scopes.join(' ') : null,
          forceSso,
          roleClaimName,
          adminGroup,
          memberGroup,
          idpMetadataXml,
          spEntityId,
        });

        logger.info(`[sso] tenant ${tenantId}: updated SSO config (provider: ${provider}, protocol: ${protocol})`);
        return res.json(maskSsoConfig(row));
      } catch (err) {
        logger.error({ err: err instanceof Error ? err.message : String(err) }, '[sso/config PUT] error');
        return res.status(500).json({ error: 'Failed to update SSO config' });
      }
    },
  );

  // ── POST /api/v1/auth/sso/test ─────────────────────────────────────────────
  router.post(
    '/api/v1/auth/sso/test',
    auth.requireTenantAuth,
    requireFeature('sso'),
    requireRole('owner', 'admin'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      try {
        const config = await db.getSsoConfig(tenantId);
        if (!config) {
          return res.status(404).json({ error: 'No SSO configuration found' });
        }

        if ((config.protocol ?? 'oidc') === 'oidc') {
          const discoveryUrl = config.discovery_url ??
            getProviderDiscoveryUrl(config.provider, config.domain);
          const result = await testOidcConfig(discoveryUrl);
          return res.json(result);
        } else {
          // SAML: validate metadata
          if (!config.idp_metadata_xml) {
            return res.status(400).json({ error: 'No IdP metadata XML configured for SAML' });
          }
          const metadata = parseSamlMetadata(config.idp_metadata_xml);
          return res.json({
            success: true,
            issuer: metadata.entityId,
            endpoints: {
              ssoUrl: metadata.ssoUrl,
              sloUrl: metadata.sloUrl,
            },
          });
        }
      } catch (err) {
        return res.json({
          success: false,
          error: err instanceof Error ? err.message : 'Test failed',
        });
      }
    },
  );

  // ── GET /api/v1/auth/sso/authorize ────────────────────────────────────────
  /**
   * Initiate SSO: redirect to IdP.
   * Query params:
   *   - tenant_id (required): the tenant to authenticate for
   *   - return_to (optional): URL to return to after login
   */
  router.get(
    '/api/v1/auth/sso/authorize',
    async (req: Request, res: Response) => {
      const tenantId = req.query['tenant_id'] as string;
      const returnTo = req.query['return_to'] as string | undefined;

      if (!tenantId) {
        return res.status(400).json({ error: 'tenant_id is required' });
      }

      try {
        const config = await db.getSsoConfig(tenantId);
        if (!config) {
          return res.status(404).json({ error: 'SSO not configured for this tenant' });
        }

        const state = crypto.randomBytes(32).toString('hex');
        const nonce = crypto.randomBytes(16).toString('hex');
        const protocol = config.protocol ?? 'oidc';

        if (protocol === 'oidc') {
          const codeVerifier = generateCodeVerifier();

          // Decrypt client secret
          let clientSecret = '';
          try {
            const decrypted = decryptConfig(config.client_secret_encrypted) as Record<string, unknown>;
            clientSecret = (decrypted['clientSecret'] as string) ?? '';
          } catch {
            return res.status(500).json({ error: 'Failed to decrypt SSO credentials' });
          }

          const discoveryUrl = config.discovery_url ??
            getProviderDiscoveryUrl(config.provider, config.domain);

          const redirectUri = config.redirect_uri ??
            `${req.protocol}://${req.get('host')}/api/v1/auth/sso/callback`;

          const oidcConfig: OidcProviderConfig = {
            discoveryUrl,
            clientId: config.client_id,
            clientSecret,
            redirectUri,
            scopes: config.scopes ? config.scopes.split(' ') : ['openid', 'email', 'profile'],
            roleClaimName: config.role_claim_name ?? undefined,
            adminGroup: config.admin_group ?? undefined,
            memberGroup: config.member_group ?? undefined,
          };

          const { url } = await buildAuthorizationUrl({
            config: oidcConfig,
            state,
            nonce,
            codeVerifier,
          });

          await storeSsoState(db, state, { tenantId, codeVerifier, nonce, returnTo });

          return res.redirect(302, url);
        } else {
          // SAML
          if (!config.idp_metadata_xml) {
            return res.status(400).json({ error: 'IdP metadata not configured for SAML' });
          }

          const idpMetadata = parseSamlMetadata(config.idp_metadata_xml);
          const acsUrl = config.redirect_uri ??
            `${req.protocol}://${req.get('host')}/api/v1/auth/sso/callback`;

          const spConfig: SamlSpConfig = {
            entityId: config.sp_entity_id ?? acsUrl,
            acsUrl,
            idpMetadata,
          };

          const { redirectUrl, requestId } = buildSamlAuthnRequest(spConfig, state);

          await storeSsoState(db, state, {
            tenantId, codeVerifier: '', nonce, returnTo, samlRequestId: requestId,
          });

          return res.redirect(302, redirectUrl);
        }
      } catch (err) {
        logger.error({ err: err instanceof Error ? err.message : String(err) }, '[sso/authorize] error');
        return res.status(500).json({ error: 'Failed to initiate SSO' });
      }
    },
  );

  // ── POST /api/v1/auth/sso/callback ────────────────────────────────────────
  /**
   * Handle SSO callback from IdP (OIDC code or SAML POST).
   * Provisions the user and returns a session token.
   */
  router.post(
    '/api/v1/auth/sso/callback',
    async (req: Request, res: Response) => {
      const body = req.body as Record<string, string>;

      // Handle OIDC GET-style callback via POST (some providers use query params)
      const code = body['code'] ?? (req.query['code'] as string);
      const state = body['state'] ?? (req.query['state'] as string) ?? body['RelayState'];
      const samlResponse = body['SAMLResponse'];
      const errorParam = body['error'] ?? (req.query['error'] as string);

      if (errorParam) {
        const desc = body['error_description'] ?? req.query['error_description'] ?? errorParam;
        return res.status(400).json({ error: `SSO error: ${desc}` });
      }

      if (!state) {
        return res.status(400).json({ error: 'Missing state parameter' });
      }

      try {
        const stateData = await retrieveSsoState(db, state);
        if (!stateData) {
          return res.status(400).json({ error: 'Invalid or expired SSO state — please retry' });
        }

        await db.deleteSsoState(state);

        const { tenantId, codeVerifier, nonce, returnTo } = stateData;

        const config = await db.getSsoConfig(tenantId);
        if (!config) {
          return res.status(400).json({ error: 'SSO not configured for this tenant' });
        }

        let clientSecret = '';
        try {
          const decrypted = decryptConfig(config.client_secret_encrypted) as Record<string, unknown>;
          clientSecret = (decrypted['clientSecret'] as string) ?? '';
        } catch {
          clientSecret = '';
        }

        const protocol = config.protocol ?? 'oidc';
        let ssoUser: { email: string | null; name: string | null; sub: string; role: string };

        if (protocol === 'oidc') {
          if (!code) {
            return res.status(400).json({ error: 'Missing authorization code' });
          }

          const discoveryUrl = config.discovery_url ??
            getProviderDiscoveryUrl(config.provider, config.domain);

          const redirectUri = config.redirect_uri ??
            `${req.protocol}://${req.get('host')}/api/v1/auth/sso/callback`;

          const oidcConfig: OidcProviderConfig = {
            discoveryUrl,
            clientId: config.client_id,
            clientSecret,
            redirectUri,
            scopes: config.scopes ? config.scopes.split(' ') : ['openid', 'email', 'profile'],
            roleClaimName: config.role_claim_name ?? undefined,
            adminGroup: config.admin_group ?? undefined,
            memberGroup: config.member_group ?? undefined,
          };

          // Exchange code for tokens
          const tokens = await exchangeCodeForTokens(oidcConfig, code, codeVerifier);

          // Validate ID token
          const claims = await validateIdToken(oidcConfig, tokens.id_token, nonce);
          const user = extractUserFromClaims(claims);
          const role = mapClaimsToRole(user, oidcConfig);

          ssoUser = {
            sub: user.sub,
            email: user.email ?? null,
            name: user.name ?? user.given_name ?? null,
            role,
          };
        } else {
          // SAML
          if (!samlResponse) {
            return res.status(400).json({ error: 'Missing SAMLResponse' });
          }

          if (!config.idp_metadata_xml) {
            return res.status(400).json({ error: 'IdP metadata not configured' });
          }

          const idpMetadata = parseSamlMetadata(config.idp_metadata_xml);
          const acsUrl = config.redirect_uri ??
            `${req.protocol}://${req.get('host')}/api/v1/auth/sso/callback`;

          const spConfig: SamlSpConfig = {
            entityId: config.sp_entity_id ?? acsUrl,
            acsUrl,
            idpMetadata,
          };

          const samlUser = parseSamlResponse(samlResponse, spConfig);

          // Map groups to role
          const groups = samlUser.groups ?? [];
          let role: string = 'viewer';
          if (config.admin_group && groups.includes(config.admin_group)) role = 'admin';
          else if (config.member_group && groups.includes(config.member_group)) role = 'member';

          ssoUser = {
            sub: samlUser.nameId,
            email: samlUser.email ?? null,
            name: samlUser.displayName ?? (`${samlUser.firstName ?? ''} ${samlUser.lastName ?? ''}`.trim() || null),
            role,
          };
        }

        // Provision user (upsert)
        const provisionedUser = await db.upsertSsoUser(
          tenantId,
          ssoUser.sub,
          config.provider,
          ssoUser.email,
          ssoUser.name,
          ssoUser.role,
        );

        logger.info(`[sso/callback] tenant ${tenantId}: SSO login for sub=${ssoUser.sub} email=${ssoUser.email} role=${ssoUser.role}`);

        // Issue a signed JWT session token (G-SSO-01 fix)
        const sessionToken = await signSsoJwt({
          sub: provisionedUser.id,
          tenant_id: provisionedUser.tenant_id,
          email: provisionedUser.email,
          role: provisionedUser.role,
        });

        // Set token as HttpOnly, Secure, SameSite=Lax cookie
        const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
        res.cookie(SSO_JWT_COOKIE, sessionToken, {
          httpOnly: true,
          secure: isSecure,
          sameSite: 'lax',
          maxAge: 15 * 60 * 1000, // 15 minutes (matches JWT exp)
          path: '/',
        });

        const responsePayload = {
          success: true,
          token: sessionToken,
          user: {
            id: provisionedUser.id,
            tenantId: provisionedUser.tenant_id,
            email: provisionedUser.email,
            name: provisionedUser.name,
            role: provisionedUser.role,
            provider: provisionedUser.provider,
            lastLogin: provisionedUser.last_login_at,
          },
          returnTo: returnTo ?? null,
        };

        // If returnTo is set, redirect — NO user-identifying data in query string
        if (returnTo) {
          return res.redirect(302, returnTo);
        }

        return res.json(responsePayload);
      } catch (err) {
        logger.error({ err: err instanceof Error ? err.message : String(err) }, '[sso/callback] error');
        return res.status(500).json({
          error: `SSO callback failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        });
      }
    },
  );

  // Also support GET callback (OIDC HTTP-Redirect for some providers)
  router.get(
    '/api/v1/auth/sso/callback',
    async (req: Request, res: Response) => {
      // Re-use POST handler by converting query params to body
      req.body = {
        code: req.query['code'],
        state: req.query['state'],
        error: req.query['error'],
        error_description: req.query['error_description'],
      };
      // Call the POST handler logic by forwarding (simplified: redirect to POST)
      const code = req.query['code'] as string;
      const state = req.query['state'] as string;
      const errorParam = req.query['error'] as string;

      if (errorParam) {
        return res.status(400).json({ error: `SSO error: ${req.query['error_description'] ?? errorParam}` });
      }

      if (!state) return res.status(400).json({ error: 'Missing state' });

      try {
        const stateData = await retrieveSsoState(db, state);
        if (!stateData) return res.status(400).json({ error: 'Invalid or expired SSO state' });
        await db.deleteSsoState(state);

        const { tenantId, codeVerifier, nonce, returnTo } = stateData;
        const config = await db.getSsoConfig(tenantId);
        if (!config) return res.status(400).json({ error: 'SSO not configured' });

        let clientSecret = '';
        try {
          const d = decryptConfig(config.client_secret_encrypted) as Record<string, unknown>;
          clientSecret = (d['clientSecret'] as string) ?? '';
        } catch { /* noop */ }

        const discoveryUrl = config.discovery_url ??
          getProviderDiscoveryUrl(config.provider, config.domain);
        const redirectUri = config.redirect_uri ??
          `${req.protocol}://${req.get('host')}/api/v1/auth/sso/callback`;

        const oidcConfig: OidcProviderConfig = {
          discoveryUrl, clientId: config.client_id, clientSecret, redirectUri,
          scopes: config.scopes ? config.scopes.split(' ') : ['openid', 'email', 'profile'],
          roleClaimName: config.role_claim_name ?? undefined,
          adminGroup: config.admin_group ?? undefined,
          memberGroup: config.member_group ?? undefined,
        };

        const tokens = await exchangeCodeForTokens(oidcConfig, code, codeVerifier);
        const claims = await validateIdToken(oidcConfig, tokens.id_token, nonce);
        const user = extractUserFromClaims(claims);
        const role = mapClaimsToRole(user, oidcConfig);

        const provisionedUser = await db.upsertSsoUser(
          tenantId, user.sub, config.provider,
          user.email ?? null, user.name ?? null, role,
        );

        logger.info(`[sso/callback GET] tenant ${tenantId}: SSO login for ${user.email} role=${role}`);

        // Issue a signed JWT session token (G-SSO-01 fix)
        const sessionToken = await signSsoJwt({
          sub: provisionedUser.id,
          tenant_id: provisionedUser.tenant_id,
          email: provisionedUser.email,
          role: provisionedUser.role,
        });

        // Set token as HttpOnly, Secure, SameSite=Lax cookie
        const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
        res.cookie(SSO_JWT_COOKIE, sessionToken, {
          httpOnly: true,
          secure: isSecure,
          sameSite: 'lax',
          maxAge: 15 * 60 * 1000, // 15 minutes (matches JWT exp)
          path: '/',
        });

        // If returnTo is set, redirect — NO user-identifying data in query string
        if (returnTo) {
          return res.redirect(302, returnTo);
        }

        return res.json({
          success: true,
          token: sessionToken,
          user: {
            id: provisionedUser.id, tenantId, email: provisionedUser.email,
            name: provisionedUser.name, role, provider: config.provider,
          },
        });
      } catch (err) {
        logger.error({ err: err instanceof Error ? err.message : String(err) }, '[sso/callback GET] error');
        return res.status(500).json({ error: err instanceof Error ? err.message : 'SSO failed' });
      }
    },
  );

  // ── Legacy: POST /api/v1/sso/configure ────────────────────────────────────
  router.post(
    '/api/v1/sso/configure',
    auth.requireTenantAuth,
    requireFeature('sso'),
    requireRole('owner', 'admin'),
    async (req: Request, res: Response) => {
      const parsed = SsoConfigureRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
      }

      const { provider, domain, clientId, clientSecret } = parsed.data;
      const tenantId = req.tenantId!;

      const clientSecretEncrypted = encryptConfig({ clientSecret, provider, tenantId });
      const discoveryUrl = getProviderDiscoveryUrl(provider as string, domain);

      try {
        const row = await db.upsertSsoConfig(tenantId, {
          provider: provider as SsoProvider,
          protocol: 'oidc',
          domain,
          clientId,
          clientSecretEncrypted,
          discoveryUrl,
        });

        logger.info(`[sso] tenant ${tenantId}: configured SSO provider ${provider}`);

        return res.status(200).json({
          id: row.id,
          tenantId: row.tenant_id,
          provider: row.provider,
          domain: row.domain,
          clientId: row.client_id,
          clientSecret: '***',
          createdAt: row.created_at,
          message: `SSO provider '${provider}' configured successfully.`,
        });
      } catch (err) {
        logger.error({ err: err instanceof Error ? err.message : String(err) }, '[sso/configure] error');
        return res.status(500).json({ error: 'Failed to configure SSO' });
      }
    },
  );

  // ── Legacy: GET /api/v1/sso/config ────────────────────────────────────────
  router.get(
    '/api/v1/sso/config',
    auth.requireTenantAuth,
    requireFeature('sso'),
    requireRole('owner', 'admin'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      try {
        const row = await db.getSsoConfig(tenantId);
        if (!row) {
          return res.status(404).json({ error: 'No SSO configuration found for this tenant' });
        }
        return res.json(maskSsoConfig(row));
      } catch (err) {
        logger.error({ err: err instanceof Error ? err.message : String(err) }, '[sso/config GET] error');
        return res.status(500).json({ error: 'Failed to retrieve SSO config' });
      }
    },
  );

  // ── Legacy: DELETE /api/v1/sso/config ─────────────────────────────────────
  router.delete(
    '/api/v1/sso/config',
    auth.requireTenantAuth,
    requireFeature('sso'),
    requireRole('owner', 'admin'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantId!;
      try {
        const existing = await db.getSsoConfig(tenantId);
        if (!existing) {
          return res.status(404).json({ error: 'No SSO configuration found for this tenant' });
        }
        await db.deleteSsoConfig(tenantId);
        logger.info(`[sso] tenant ${tenantId}: deleted SSO config (provider: ${existing.provider})`);
        return res.json({ message: 'SSO configuration removed successfully' });
      } catch (err) {
        logger.error({ err: err instanceof Error ? err.message : String(err) }, '[sso/config DELETE] error');
        return res.status(500).json({ error: 'Failed to delete SSO config' });
      }
    },
  );

  return router;
}

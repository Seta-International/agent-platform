import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SessionEnv } from '@seta/core';
import {
  buildAdminConsentUrl,
  IdentityError,
  recordSsoConsent,
  requireProviderRow,
} from '@seta/identity';
import type { Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

const STATE_COOKIE = 'seta_sso_consent_state';
const STATE_COOKIE_MAXAGE = 60 * 10;

function sign(payload: string): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? '';
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function makeState(tenantId: string): string {
  const nonce = randomBytes(24).toString('hex');
  const payload = `${tenantId}:${nonce}`;
  return `${payload}:${sign(payload)}`;
}

function parseState(state: string | undefined): { tenantId: string; nonce: string } | null {
  if (!state) return null;
  const parts = state.split(':');
  if (parts.length !== 3) return null;
  const [tenantId, nonce, sig] = parts;
  if (!tenantId || !nonce || !sig) return null;
  const expected = sign(`${tenantId}:${nonce}`);
  try {
    const expectedBuf = Buffer.from(expected, 'hex');
    const sigBuf = Buffer.from(sig, 'hex');
    if (expectedBuf.length !== sigBuf.length) return null;
    if (!timingSafeEqual(expectedBuf, sigBuf)) return null;
  } catch {
    return null;
  }
  return { tenantId, nonce };
}

function requireSsoAdmin(c: Context<SessionEnv>): void {
  const scope = c.get('user');
  const roles = scope.role_summary.roles;
  if (!roles.includes('org.admin') && !roles.includes('identity.admin')) {
    throw new IdentityError('FORBIDDEN', 'identity.sso.write required');
  }
}

export function registerSsoConsentRoutes(app: Hono<SessionEnv>): void {
  app.post('/api/identity/v1/sso/consent/microsoft/start', async (c) => {
    requireSsoAdmin(c);
    const scope = c.get('user');
    const row = await requireProviderRow(scope.tenant_id, 'microsoft-entra-id');

    const state = makeState(scope.tenant_id);
    setCookie(c, STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: STATE_COOKIE_MAXAGE,
      path: '/',
    });

    const publicUrl = process.env.PUBLIC_URL ?? 'http://localhost:5173';
    const redirectUri = `${publicUrl}/api/identity/v1/sso/consent/microsoft/callback`;
    const admin_consent_url = buildAdminConsentUrl({
      entraTenantId: row.config.entra_tenant_id,
      state,
      redirectUri,
    });
    return c.json({ admin_consent_url });
  });

  app.get('/api/identity/v1/sso/consent/microsoft/callback', async (c) => {
    const adminConsent = c.req.query('admin_consent');
    const claimedState = c.req.query('state');
    const errorParam = c.req.query('error');

    const cookieState = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: '/' });

    if (errorParam || adminConsent !== 'True') {
      return c.redirect(`/_authed/admin/sso?status=consent_failed&error=${errorParam ?? 'denied'}`);
    }
    if (!cookieState || cookieState !== claimedState) {
      return c.redirect('/_authed/admin/sso?status=consent_failed&error=csrf_state_mismatch');
    }
    const parsed = parseState(claimedState);
    if (!parsed) return c.redirect('/_authed/admin/sso?status=consent_failed&error=bad_state');

    const scope = c.get('user');
    await recordSsoConsent(
      { tenant_id: parsed.tenantId, provider_id: 'microsoft-entra-id' },
      { type: 'user', user_id: scope.user_id },
    );
    return c.redirect('/_authed/admin/sso?status=consent_granted');
  });
}

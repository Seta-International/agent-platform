import type { SessionEnv } from '@seta/core';
import { getPool } from '@seta/shared-db';
import type { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

const SESSION_COOKIE = 'seta.session_token';
const DEV_ORIGINAL_COOKIE = 'seta-dev-original';

const COOKIE_BASE = {
  path: '/',
  httpOnly: true,
  sameSite: 'Lax',
  secure: false,
} as const;

// better-call (used internally by better-auth) signs cookies as `value.btoa(hmac_sha256(value, secret))`.
// Hono's setCookie URL-encodes the result, which matches better-call's serializeSignedCookie output.
async function signCookieValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return `${value}.${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;
}

export function registerDevImpersonateRoutes(app: Hono<SessionEnv>): void {
  // GET — check if currently impersonating
  app.get('/api/identity/v1/dev/impersonate', (c) => {
    const original = getCookie(c, DEV_ORIGINAL_COOKIE);
    if (!original) return c.json({ active: false });
    const scope = c.get('user');
    return c.json({
      active: true,
      target: {
        user_id: scope.user_id,
        email: scope.email,
        display_name: scope.display_name,
      },
    });
  });

  // POST — start impersonating
  app.post('/api/identity/v1/dev/impersonate', async (c) => {
    const { user_id } = await c.req.json<{ user_id: string }>();
    const scope = c.get('user');
    const pool = getPool('web');

    const result = await pool.query<{ id: string; name: string; email: string }>(
      `SELECT id, name, email FROM identity."user" WHERE id = $1 AND tenant_id = $2`,
      [user_id, scope.tenant_id],
    );
    const target = result.rows[0];
    if (!target) return c.json({ error: 'User not found in this tenant' }, 404);

    const token = generateToken(32);
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO identity.session (id, user_id, token, expires_at, ip_address, user_agent, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [sessionId, target.id, token, expiresAt, null, '[dev-impersonate]'],
    );

    const secret = process.env.BETTER_AUTH_SECRET ?? '';
    const signedToken = await signCookieValue(token, secret);

    const original = getCookie(c, SESSION_COOKIE);
    if (original) setCookie(c, DEV_ORIGINAL_COOKIE, original, COOKIE_BASE);
    setCookie(c, SESSION_COOKIE, signedToken, { ...COOKIE_BASE, expires: expiresAt });
    // Bust the better-auth session cache so the new token is read from the DB
    deleteCookie(c, 'seta.session_data', { path: '/' });
    deleteCookie(c, 'seta.session_data.0', { path: '/' });

    return c.json({
      ok: true,
      target: { user_id: target.id, name: target.name, email: target.email },
    });
  });

  // DELETE — exit impersonation, restore original session
  app.delete('/api/identity/v1/dev/impersonate', (c) => {
    const original = getCookie(c, DEV_ORIGINAL_COOKIE);
    if (original) {
      setCookie(c, SESSION_COOKIE, original, COOKIE_BASE);
      deleteCookie(c, DEV_ORIGINAL_COOKIE, { path: '/' });
      // Clear session cache so better-auth re-fetches from DB with the restored token
      deleteCookie(c, 'seta.session_data', { path: '/' });
      deleteCookie(c, 'seta.session_data.0', { path: '/' });
    }
    return c.json({ ok: true });
  });
}

function generateToken(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

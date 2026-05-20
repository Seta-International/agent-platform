import type { SessionEnv } from '@seta/core';
import {
  disableSsoProvider,
  disconnectSsoProvider,
  enableSsoProvider,
  IdentityError,
  listSsoProviders,
  registerSsoProvider,
} from '@seta/identity';
import type { Context, Hono } from 'hono';
import { z } from 'zod';

function requireSsoAdmin(c: Context<SessionEnv>): void {
  const scope = c.get('user');
  const roles = scope.role_summary.roles;
  if (!roles.includes('org.admin') && !roles.includes('identity.admin')) {
    throw new IdentityError('FORBIDDEN', 'identity.sso.write required');
  }
}

const registerSchema = z.object({
  entra_tenant_id: z.string().uuid(),
  email_domains: z.array(z.string()).min(1),
});

export function registerSsoProvidersRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/identity/v1/sso/providers', async (c) => {
    requireSsoAdmin(c);
    const scope = c.get('user');
    const rows = await listSsoProviders(scope.tenant_id);
    return c.json({ rows });
  });

  app.post('/api/identity/v1/sso/providers', async (c) => {
    requireSsoAdmin(c);
    const scope = c.get('user');
    const parsed = registerSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'invalid', details: parsed.error.flatten() }, 400);
    const row = await registerSsoProvider(
      {
        tenant_id: scope.tenant_id,
        provider_id: 'microsoft-entra-id',
        entra_tenant_id: parsed.data.entra_tenant_id,
        email_domains: parsed.data.email_domains,
      },
      {
        type: 'user',
        user_id: scope.user_id,
        ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
      },
    );
    return c.json(row);
  });

  app.post('/api/identity/v1/sso/providers/microsoft-entra-id/enable', async (c) => {
    requireSsoAdmin(c);
    const scope = c.get('user');
    const row = await enableSsoProvider(
      { tenant_id: scope.tenant_id, provider_id: 'microsoft-entra-id' },
      { type: 'user', user_id: scope.user_id },
    );
    return c.json(row);
  });

  app.post('/api/identity/v1/sso/providers/microsoft-entra-id/disable', async (c) => {
    requireSsoAdmin(c);
    const scope = c.get('user');
    const row = await disableSsoProvider(
      { tenant_id: scope.tenant_id, provider_id: 'microsoft-entra-id' },
      { type: 'user', user_id: scope.user_id },
    );
    return c.json(row);
  });

  app.delete('/api/identity/v1/sso/providers/microsoft-entra-id', async (c) => {
    requireSsoAdmin(c);
    const scope = c.get('user');
    await disconnectSsoProvider(
      { tenant_id: scope.tenant_id, provider_id: 'microsoft-entra-id' },
      { type: 'user', user_id: scope.user_id },
    );
    return c.json({ ok: true });
  });
}

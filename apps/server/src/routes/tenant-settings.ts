import type { SessionEnv } from '@seta/core';
import { IdentityError, setLocalPasswordDisabled } from '@seta/identity';
import type { Context, Hono } from 'hono';
import { z } from 'zod';

const patchSchema = z.object({ disabled: z.boolean() });

function requireOrgAdmin(c: Context<SessionEnv>): void {
  const scope = c.get('user');
  if (!scope.role_summary.roles.includes('org.admin')) {
    throw new IdentityError('FORBIDDEN', 'core.tenant.write required');
  }
}

export function registerTenantSettingsRoutes(app: Hono<SessionEnv>): void {
  app.patch('/api/identity/v1/tenants/me/local-password-disabled', async (c) => {
    requireOrgAdmin(c);
    const scope = c.get('user');
    const parsed = patchSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'invalid' }, 400);
    await setLocalPasswordDisabled(
      { tenant_id: scope.tenant_id, disabled: parsed.data.disabled },
      { type: 'user', user_id: scope.user_id },
    );
    return c.json({ ok: true });
  });
}

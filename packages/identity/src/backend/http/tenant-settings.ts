import type { SessionEnv } from '@seta/core';
import { getPool } from '@seta/shared-db';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { IdentityError, setLocalPasswordDisabled } from '../../index.ts';

const patchSchema = z.object({ disabled: z.boolean() });

function requireOrgAdmin(c: Context<SessionEnv>): void {
  const scope = c.get('user');
  if (!scope.role_summary.roles.includes('org.admin')) {
    throw new IdentityError('FORBIDDEN', 'core.tenant.write required');
  }
}

async function getLocalPasswordDisabled(tenantId: string): Promise<boolean> {
  const result = await getPool('web').query<{ local_password_disabled: boolean }>(
    'SELECT local_password_disabled FROM core.tenants WHERE id = $1',
    [tenantId],
  );
  return result.rows[0]?.local_password_disabled ?? false;
}

export function registerTenantSettingsRoutes(app: Hono<SessionEnv>): void {
  app.get('/api/identity/v1/tenants/me/settings', async (c) => {
    requireOrgAdmin(c);
    const scope = c.get('user');
    const local_password_disabled = await getLocalPasswordDisabled(scope.tenant_id);
    return c.json({ local_password_disabled });
  });

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

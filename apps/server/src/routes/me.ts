import type { SessionEnv } from '@seta/core';
import { getUserProfile } from '@seta/identity';
import { getPool } from '@seta/shared-db';
import type { Hono } from 'hono';

async function getTenantLocalPasswordDisabled(tenantId: string): Promise<boolean> {
  const result = await getPool('web').query<{ local_password_disabled: boolean }>(
    'SELECT local_password_disabled FROM core.tenants WHERE id = $1',
    [tenantId],
  );
  return result.rows[0]?.local_password_disabled ?? false;
}

export function registerMeRoute(app: Hono<SessionEnv>): void {
  app.get('/api/identity/v1/me', async (c) => {
    const scope = c.get('user');
    const [profile, tenant_local_password_disabled] = await Promise.all([
      getUserProfile(scope.user_id),
      getTenantLocalPasswordDisabled(scope.tenant_id),
    ]);
    return c.json({
      user_id: scope.user_id,
      tenant_id: scope.tenant_id,
      email: scope.email,
      display_name: profile?.display_name ?? scope.display_name,
      role_summary: scope.role_summary,
      accessible_group_ids: scope.accessible_group_ids,
      cross_tenant_read: scope.cross_tenant_read,
      tenant_local_password_disabled,
    });
  });
}

import type { SessionEnv } from '@seta/core';
import { getUserProfile } from '@seta/identity';
import { getPool } from '@seta/shared-db';
import type { Hono } from 'hono';

interface TenantHeader {
  name: string;
  slug: string;
  local_password_disabled: boolean;
}

async function getTenantHeader(tenantId: string): Promise<TenantHeader> {
  const result = await getPool('web').query<TenantHeader>(
    'SELECT name, slug, local_password_disabled FROM core.tenants WHERE id = $1',
    [tenantId],
  );
  return result.rows[0] ?? { name: '', slug: '', local_password_disabled: false };
}

export function registerMeRoute(app: Hono<SessionEnv>): void {
  app.get('/api/identity/v1/me', async (c) => {
    const scope = c.get('user');
    const [profile, tenant] = await Promise.all([
      getUserProfile(scope.user_id),
      getTenantHeader(scope.tenant_id),
    ]);
    return c.json({
      user_id: scope.user_id,
      tenant_id: scope.tenant_id,
      tenant_name: tenant.name,
      tenant_slug: tenant.slug,
      email: scope.email,
      display_name: profile?.display_name ?? scope.display_name,
      role_summary: scope.role_summary,
      permissions: Array.from(c.get('user').permissions),
      accessible_group_ids: scope.accessible_group_ids,
      cross_tenant_read: scope.cross_tenant_read,
      tenant_local_password_disabled: tenant.local_password_disabled,
    });
  });
}

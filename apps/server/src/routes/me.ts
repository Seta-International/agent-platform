import type { SessionEnv } from '@seta/core';
import { getUserProfile } from '@seta/identity';
import type { Hono } from 'hono';

export function registerMeRoute(app: Hono<SessionEnv>): void {
  app.get('/api/identity/v1/me', async (c) => {
    const scope = c.get('user');
    const profile = await getUserProfile(scope.user_id);
    return c.json({
      user_id: scope.user_id,
      tenant_id: scope.tenant_id,
      email: scope.email,
      display_name: profile?.display_name ?? scope.display_name,
      role_summary: scope.role_summary,
      accessible_group_ids: scope.accessible_group_ids,
      cross_tenant_read: scope.cross_tenant_read,
    });
  });
}

import type { RoleOverlay } from '@seta/shared-rbac';
import { eq } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { rolePermissionOverlays } from '../db/schema.ts';

export async function listTenantRoleOverlays(tenantId: string): Promise<RoleOverlay> {
  const rows = await identityDb()
    .select()
    .from(rolePermissionOverlays)
    .where(eq(rolePermissionOverlays.tenant_id, tenantId));
  const map = new Map<string, Map<string, 'grant' | 'revoke'>>();
  for (const r of rows) {
    const inner = map.get(r.role_slug) ?? new Map<string, 'grant' | 'revoke'>();
    inner.set(r.permission_key, r.effect);
    map.set(r.role_slug, inner);
  }
  return map;
}

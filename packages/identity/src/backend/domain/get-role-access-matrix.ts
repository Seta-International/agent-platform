import type { SessionScope } from '@seta/core';
import { can, canonicalKeys, EDITABLE_ROLES, INVENTORY } from '@seta/shared-rbac';
import { IdentityError } from '../rbac.ts';
import { listTenantRoleOverlays } from './list-tenant-role-overlays.ts';

export interface MatrixCell {
  permission_key: string;
  description: string;
  seedDefault: boolean;
  effective: boolean;
  overridden: boolean;
}
export interface MatrixRole {
  slug: string;
  description: string;
  module: string;
  cells: MatrixCell[];
}

export async function getRoleAccessMatrix(
  session: SessionScope,
  opts?: { module?: string },
): Promise<MatrixRole[]> {
  if (!can(session, 'identity.role.read'))
    throw new IdentityError('FORBIDDEN', 'identity.role.read required');
  const overlay = await listTenantRoleOverlays(session.tenant_id);
  const out: MatrixRole[] = [];
  for (const mod of INVENTORY) {
    if (opts?.module && mod.module !== opts.module) continue;
    const keys = canonicalKeys(mod.statement);
    for (const role of mod.roles) {
      if (!EDITABLE_ROLES.includes(role.slug)) continue;
      const seed = new Set(role.permissions);
      const delta = overlay.get(role.slug);
      const cells: MatrixCell[] = keys.map((key) => {
        const seedDefault = seed.has(key);
        const effect = delta?.get(key);
        const effective = effect === 'revoke' ? false : effect === 'grant' ? true : seedDefault;
        return {
          permission_key: key,
          description: mod.descriptions?.[key] ?? key,
          seedDefault,
          effective,
          overridden: effect !== undefined,
        };
      });
      out.push({ slug: role.slug, description: role.description, module: mod.module, cells });
    }
  }
  return out;
}

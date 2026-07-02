import type { RbacRegistry } from './registry.ts';
import { type RoleOverlay, WILDCARD } from './resolve.ts';

export interface ScopedAssignmentInput {
  role_slug: string;
  scope_kind: 'tenant' | 'org_unit' | 'self' | 'group';
  org_unit_ids?: readonly string[];
}

export type PermissionScope =
  | { kind: 'tenant' }
  | { kind: 'subset'; org_unit_ids: readonly string[]; self: boolean }
  | { kind: 'none' };

function roleGrants(
  registry: RbacRegistry,
  slug: string,
  permission: string,
  overlay?: RoleOverlay,
): boolean {
  if (WILDCARD.has(slug)) return registry.allPermissions.has(permission);
  if (slug === 'org.viewer') return registry.readPermissions.has(permission);
  const delta = overlay?.get(slug)?.get(permission);
  if (delta === 'grant') return true;
  if (delta === 'revoke') return false;
  return registry.rolePermissions.get(slug)?.includes(permission) ?? false;
}

export function resolveScope(
  registry: RbacRegistry,
  assignments: readonly ScopedAssignmentInput[],
  implicit: readonly string[],
  permission: string,
  overlay?: RoleOverlay,
): PermissionScope {
  let self = implicit.includes(permission);
  const orgIds = new Set<string>();
  for (const a of assignments) {
    if (a.scope_kind === 'group') continue;
    if (!roleGrants(registry, a.role_slug, permission, overlay)) continue;
    if (a.scope_kind === 'tenant') return { kind: 'tenant' };
    if (a.scope_kind === 'self') self = true;
    if (a.scope_kind === 'org_unit') for (const id of a.org_unit_ids ?? []) orgIds.add(id);
  }
  if (!self && orgIds.size === 0) return { kind: 'none' };
  return { kind: 'subset', org_unit_ids: [...orgIds].sort(), self };
}

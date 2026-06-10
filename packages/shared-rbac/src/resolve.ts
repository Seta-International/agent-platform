import type { RbacRegistry } from './registry.ts';

const WILDCARD = new Set(['org.admin', 'tenant.admin']);
export type RoleOverlay = ReadonlyMap<string, ReadonlyMap<string, 'grant' | 'revoke'>>;

export function resolvePermissions(
  registry: RbacRegistry,
  roleSlugs: readonly string[],
  implicit: readonly string[],
  overlay?: RoleOverlay,
): ReadonlySet<string> {
  if (roleSlugs.some((r) => WILDCARD.has(r))) return new Set(registry.allPermissions);
  const out = new Set<string>(implicit);
  for (const slug of roleSlugs) {
    if (slug === 'org.viewer') {
      for (const p of registry.readPermissions) out.add(p);
      continue;
    }
    const base = registry.rolePermissions.get(slug);
    if (!base) continue;
    const delta = overlay?.get(slug);
    for (const p of base) {
      if (delta?.get(p) !== 'revoke') out.add(p);
    }
    if (delta)
      for (const [p, eff] of delta) {
        if (eff === 'grant') out.add(p);
      }
  }
  return out;
}

export function can(session: { permissions: ReadonlySet<string> }, permission: string): boolean {
  return session.permissions.has(permission);
}

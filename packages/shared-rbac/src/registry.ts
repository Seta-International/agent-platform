import type { ModuleRbacManifest } from './manifest.ts';

export interface RbacRegistry {
  allPermissions: ReadonlySet<string>;
  readPermissions: ReadonlySet<string>;
  rolePermissions: ReadonlyMap<string, string[]>;
  manifests: readonly ModuleRbacManifest[];
}

export function buildRegistry(manifests: readonly ModuleRbacManifest[]): RbacRegistry {
  const all = new Set<string>();
  const reads = new Set<string>();
  for (const m of manifests) {
    for (const p of m.permissions) {
      if (all.has(p.key)) throw new Error(`duplicate permission key: ${p.key}`);
      all.add(p.key);
      if (p.key.endsWith('.read')) reads.add(p.key);
    }
  }
  const roles = new Map<string, string[]>();
  for (const m of manifests) {
    for (const r of m.roles) {
      for (const p of r.permissions) {
        if (!all.has(p)) throw new Error(`role ${r.slug} grants undefined permission ${p}`);
      }
      roles.set(r.slug, [...(roles.get(r.slug) ?? []), ...r.permissions]);
    }
  }
  return { allPermissions: all, readPermissions: reads, rolePermissions: roles, manifests };
}

import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';

const registry = buildRegistry(inventoryToManifests(INVENTORY));

/** Resolve the effective permission set for a set of role slugs (test fixtures). */
export function resolveTestPermissions(roles: readonly string[]): ReadonlySet<string> {
  return resolvePermissions(registry, roles, IMPLICIT_PERMISSIONS);
}

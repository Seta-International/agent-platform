import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';

// Single source of truth: identity resolves through the same registry the server
// composition root and gen:rbac build from (INVENTORY). Module-scope singleton —
// the registry is process-global and immutable.
const registry = buildRegistry(inventoryToManifests(INVENTORY));

export function resolveForRoles(roles: readonly string[]): ReadonlySet<string> {
  return resolvePermissions(registry, roles, IMPLICIT_PERMISSIONS);
}

import { hashRoleSummary, type SessionScope } from '@seta/core';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';

const _registry = buildRegistry(inventoryToManifests(INVENTORY));

export function permsFor(roles: string[]): ReadonlySet<string> {
  return resolvePermissions(_registry, roles, IMPLICIT_PERMISSIONS);
}

export function buildTestSession(opts: {
  tenant_id?: string;
  user_id?: string;
  email?: string;
  display_name?: string;
  roles?: string[];
}): SessionScope {
  const roles = opts.roles ?? ['org.admin'];
  const role_summary = { roles, cross_tenant_read: false };
  return {
    session_id: crypto.randomUUID(),
    user_id: opts.user_id ?? crypto.randomUUID(),
    tenant_id: opts.tenant_id ?? crypto.randomUUID(),
    email: opts.email ?? 'test@example.test',
    display_name: opts.display_name ?? 'Test User',
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    permissions: permsFor(roles),
    accessible_group_ids: [],
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

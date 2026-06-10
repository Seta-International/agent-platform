import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import { describe, expect, it } from 'vitest';
import { NotificationsError, requirePermission } from '../../src/backend/rbac.ts';

const registry = buildRegistry(inventoryToManifests(INVENTORY));
function permsFor(roles: string[]): ReadonlySet<string> {
  return resolvePermissions(registry, roles, IMPLICIT_PERMISSIONS);
}

function makeSession(roles: string[]) {
  return {
    session_id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    tenant_id: crypto.randomUUID(),
    email: 'test@example.test',
    display_name: 'Test',
    role_summary: { roles, cross_tenant_read: false },
    role_summary_hash: 'h',
    permissions: permsFor(roles),
    accessible_group_ids: [] as string[],
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

describe('notifications requirePermission', () => {
  it('notifications.viewer can read preferences but not write', () => {
    const session = makeSession(['notifications.viewer']);
    expect(() => requirePermission(session, 'notifications.preference.read')).not.toThrow();
    expect(() => requirePermission(session, 'notifications.preference.write')).toThrow(
      NotificationsError,
    );
  });

  it('notifications.member can read and write preferences', () => {
    const session = makeSession(['notifications.member']);
    expect(() => requirePermission(session, 'notifications.preference.read')).not.toThrow();
    expect(() => requirePermission(session, 'notifications.preference.write')).not.toThrow();
  });

  it('tenant.admin passes all permission checks', () => {
    const session = makeSession(['tenant.admin']);
    expect(() => requirePermission(session, 'notifications.preference.read')).not.toThrow();
    expect(() => requirePermission(session, 'notifications.preference.write')).not.toThrow();
    expect(() => requirePermission(session, 'notifications.category.read')).not.toThrow();
  });

  it('empty roles throw FORBIDDEN', () => {
    const session = makeSession([]);
    expect(() => requirePermission(session, 'notifications.preference.read')).toThrow(
      NotificationsError,
    );
  });
});

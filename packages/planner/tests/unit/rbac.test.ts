import type { PlannerSessionScope } from '@seta/planner';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import { describe, expect, it } from 'vitest';
import { PlannerError, requirePermission } from '../../src/backend/rbac.ts';

const registry = buildRegistry(inventoryToManifests(INVENTORY));
function permsFor(roles: string[]): ReadonlySet<string> {
  return resolvePermissions(registry, roles, IMPLICIT_PERMISSIONS);
}

function makeSession(roles: string[], accessible_group_ids: string[] = []) {
  return {
    session_id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    tenant_id: crypto.randomUUID(),
    email: 'test@example.test',
    display_name: 'Test',
    role_summary: { roles, cross_tenant_read: false },
    role_summary_hash: 'h',
    permissions: permsFor(roles),
    accessible_group_ids,
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

function makeSystemActorSession(): PlannerSessionScope {
  return {
    ...makeSession(['system.integrations.m365'], []),
    actor: { kind: 'system', system_id: 'integrations.m365' },
  };
}

describe('planner requirePermission', () => {
  it('planner.viewer can read but not create tasks', () => {
    const session = makeSession(['planner.viewer']);
    expect(() => requirePermission(session, 'planner.task.read')).not.toThrow();
    expect(() => requirePermission(session, 'planner.task.create')).toThrow(PlannerError);
  });

  it('planner.contributor can create tasks but not delete groups', () => {
    const session = makeSession(['planner.contributor']);
    expect(() => requirePermission(session, 'planner.task.create')).not.toThrow();
    expect(() => requirePermission(session, 'planner.group.delete')).toThrow(PlannerError);
  });

  it('planner.admin has full access', () => {
    const session = makeSession(['planner.admin']);
    expect(() => requirePermission(session, 'planner.group.delete')).not.toThrow();
    expect(() => requirePermission(session, 'planner.task.comment.delete.any')).not.toThrow();
    expect(() => requirePermission(session, 'planner.trash.empty')).not.toThrow();
  });

  it('org.admin passes all permission checks and bypasses group-scope', () => {
    const groupId = crypto.randomUUID();
    const session = makeSession(['org.admin'], []);
    expect(() => requirePermission(session, 'planner.group.delete')).not.toThrow();
    expect(() => requirePermission(session, 'planner.trash.empty')).not.toThrow();
    // org.admin is tenant-wide: group-scope check does not apply
    expect(() => requirePermission(session, 'planner.task.read', groupId)).not.toThrow();
  });

  it('group-scope check: throws FORBIDDEN when session lacks access to group', () => {
    const groupId = crypto.randomUUID();
    const session = makeSession(['planner.viewer'], []);
    expect(() => requirePermission(session, 'planner.task.read', groupId)).toThrow(PlannerError);
  });

  it('group-scope check: passes when session has access to group', () => {
    const groupId = crypto.randomUUID();
    const session = makeSession(['planner.viewer'], [groupId]);
    expect(() => requirePermission(session, 'planner.task.read', groupId)).not.toThrow();
  });

  it('M365 system actor bypasses group-scope check', () => {
    const groupId = crypto.randomUUID();
    const session = makeSystemActorSession();
    expect(() => requirePermission(session, 'planner.task.read', groupId)).not.toThrow();
  });

  it('empty roles throw FORBIDDEN', () => {
    const session = makeSession([]);
    expect(() => requirePermission(session, 'planner.task.read')).toThrow(PlannerError);
  });
});

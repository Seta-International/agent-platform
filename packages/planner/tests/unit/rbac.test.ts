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
    role_summary: { roles, cross_tenant_read: false, assignments: [] },
    role_summary_hash: 'h',
    permissions: permsFor(roles),
    accessible_group_ids,
    assignments: [],
    group_ids: [],
    product_access: new Set<string>(),
    worker_id: null,
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
  it('planner.viewer can read but not create tasks', async () => {
    const session = makeSession(['planner.viewer']);
    await expect(requirePermission(session, 'planner.task.read')).resolves.toBeUndefined();
    await expect(requirePermission(session, 'planner.task.create')).rejects.toThrow(PlannerError);
  });

  it('planner.member can create tasks but not delete groups', async () => {
    const session = makeSession(['planner.member']);
    await expect(requirePermission(session, 'planner.task.create')).resolves.toBeUndefined();
    await expect(requirePermission(session, 'planner.group.delete')).rejects.toThrow(PlannerError);
  });

  it('planner.admin has full access', async () => {
    const session = makeSession(['planner.admin']);
    await expect(requirePermission(session, 'planner.group.delete')).resolves.toBeUndefined();
    await expect(
      requirePermission(session, 'planner.task.comment.delete'),
    ).resolves.toBeUndefined();
    await expect(requirePermission(session, 'planner.trash.empty')).resolves.toBeUndefined();
  });

  it('org.admin passes all permission checks and bypasses group-scope', async () => {
    const groupId = crypto.randomUUID();
    const session = makeSession(['org.admin'], []);
    await expect(requirePermission(session, 'planner.group.delete')).resolves.toBeUndefined();
    await expect(requirePermission(session, 'planner.trash.empty')).resolves.toBeUndefined();
    // org.admin is tenant-wide: group-scope check does not apply (no DB lookup needed)
    await expect(requirePermission(session, 'planner.task.read', groupId)).resolves.toBeUndefined();
  });

  it('M365 system actor bypasses group-scope check', async () => {
    const groupId = crypto.randomUUID();
    const session = makeSystemActorSession();
    await expect(requirePermission(session, 'planner.task.read', groupId)).resolves.toBeUndefined();
  });

  it('empty roles throw FORBIDDEN', async () => {
    const session = makeSession([]);
    await expect(requirePermission(session, 'planner.task.read')).rejects.toThrow(PlannerError);
  });
});

// Membership-based group-scope checks (planner.member + planner.group_members row) require a
// real Postgres instance to query — see tests/integration/rbac-membership-gate.test.ts.

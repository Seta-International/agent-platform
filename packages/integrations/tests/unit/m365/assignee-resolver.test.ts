import { describe, expect, it, vi } from 'vitest';
import type {
  AssigneeResolveContext,
  AssigneeResolverDeps,
} from '../../../src/backend/m365/plans/assignee-resolver.ts';
import { createAssigneeResolver } from '../../../src/backend/m365/plans/assignee-resolver.ts';

const ctx: AssigneeResolveContext = { tenantId: 'T', planId: 'P', taskId: 'TASK1' };

describe('createAssigneeResolver', () => {
  it('resolves known OIDs and skips unknown ones with audit emit', async () => {
    const findUserByEntraOid = vi.fn(
      async ({ entra_oid }: { entra_oid: string; tenant_id: string }) => {
        if (entra_oid === 'OID-1') return { user_id: 'U1' };
        return null;
      },
    );
    const emit = vi.fn();
    const deps: AssigneeResolverDeps = { findUserByEntraOid, emit };
    const resolver = createAssigneeResolver(deps);

    const result = await resolver.resolveMany(['OID-1', 'OID-2'], ctx);

    expect(result.resolved).toEqual([{ entra_oid: 'OID-1', user_id: 'U1' }]);
    expect(result.skipped).toEqual(['OID-2']);
    expect(emit).toHaveBeenCalledExactlyOnceWith({
      type: 'integrations.m365.assignee.skipped',
      payload: {
        tenant_id: 'T',
        plan_id: 'P',
        task_id: 'TASK1',
        entra_oid: 'OID-2',
        reason: 'not_provisioned',
      },
    });
  });

  it('empty input returns empty result without lookups or emits', async () => {
    const findUserByEntraOid = vi.fn();
    const emit = vi.fn();
    const deps: AssigneeResolverDeps = { findUserByEntraOid, emit };
    const resolver = createAssigneeResolver(deps);

    const result = await resolver.resolveMany([], ctx);

    expect(result).toEqual({ resolved: [], skipped: [] });
    expect(findUserByEntraOid).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('dedupes duplicate OIDs in input', async () => {
    const findUserByEntraOid = vi.fn(
      async ({ entra_oid }: { entra_oid: string; tenant_id: string }) => {
        if (entra_oid === 'OID-1') return { user_id: 'U1' };
        return null;
      },
    );
    const emit = vi.fn();
    const deps: AssigneeResolverDeps = { findUserByEntraOid, emit };
    const resolver = createAssigneeResolver(deps);

    const result = await resolver.resolveMany(['OID-1', 'OID-1', 'OID-2', 'OID-2'], ctx);

    expect(result.resolved).toEqual([{ entra_oid: 'OID-1', user_id: 'U1' }]);
    expect(result.skipped).toEqual(['OID-2']);
    expect(findUserByEntraOid).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('preserves first-appearance order of unique OIDs', async () => {
    const findUserByEntraOid = vi.fn(
      async ({ entra_oid }: { entra_oid: string; tenant_id: string }) => ({
        user_id: `U-${entra_oid}`,
      }),
    );
    const emit = vi.fn();
    const deps: AssigneeResolverDeps = { findUserByEntraOid, emit };
    const resolver = createAssigneeResolver(deps);

    const result = await resolver.resolveMany(['OID-B', 'OID-A', 'OID-C'], ctx);

    expect(result.resolved.map((r) => r.entra_oid)).toEqual(['OID-B', 'OID-A', 'OID-C']);
    expect(result.skipped).toEqual([]);
    expect(emit).not.toHaveBeenCalled();
  });
});

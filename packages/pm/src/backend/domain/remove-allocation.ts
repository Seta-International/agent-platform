import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, isNull } from 'drizzle-orm';
import { PM_ALLOCATION_REMOVED } from '../../events.ts';
import { pmDb } from '../db/client.ts';
import { allocation, project } from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';

export async function removeAllocation(input: {
  allocation_id: string;
  session: SessionScope;
}): Promise<void> {
  const { allocation_id, session } = input;
  requirePermission(session, 'pm.project.manage');

  const [current] = await pmDb()
    .select()
    .from(allocation)
    .where(
      and(
        eq(allocation.id, allocation_id),
        tenantScoped(allocation.tenant_id, session),
        isNull(allocation.deleted_at),
      ),
    )
    .limit(1);
  if (!current) throw new PmError('NOT_FOUND', 'allocation not found');

  const [proj] = await pmDb()
    .select({ account_id: project.account_id })
    .from(project)
    .where(and(eq(project.id, current.project_id), tenantScoped(project.tenant_id, session)))
    .limit(1);
  if (!proj) throw new PmError('NOT_FOUND', `project ${current.project_id} not found`);

  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(allocation)
        .set({ deleted_at: new Date(), updated_at: new Date() })
        .where(and(eq(allocation.id, allocation_id), isNull(allocation.deleted_at)))
        .returning({ id: allocation.id });
      if (updated.length === 0) {
        throw new PmError('CONFLICT', 'allocation was modified concurrently');
      }

      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'pm.allocation',
        aggregateId: allocation_id,
        eventType: PM_ALLOCATION_REMOVED,
        eventVersion: 1,
        payload: {
          allocation_id,
          project_id: current.project_id,
          worker_id: current.worker_id ?? null,
          account_id: proj.account_id,
          tenant_id: session.tenant_id,
        },
      });
    },
  );
}

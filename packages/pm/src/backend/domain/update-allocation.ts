import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { and, eq, isNull } from 'drizzle-orm';
import { type UpdateAllocationInput, updateAllocationInput } from '../../contracts.ts';
import { PM_ALLOCATION_UPDATED } from '../../events.ts';
import { pmDb } from '../db/client.ts';
import { allocation, project } from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { PmError, requirePermission } from '../rbac.ts';

export async function updateAllocation(
  input: UpdateAllocationInput & { allocation_id: string; session: SessionScope },
): Promise<{ version: number }> {
  const { allocation_id, session } = input;
  requirePermission(session, 'pm.project.manage');
  const patch = updateAllocationInput.parse(input);

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
  if (patch.expected_version !== undefined && patch.expected_version !== current.version) {
    throw new PmError('CONFLICT', 'version mismatch');
  }

  const [proj] = await pmDb()
    .select({ account_id: project.account_id })
    .from(project)
    .where(and(eq(project.id, current.project_id), tenantScoped(project.tenant_id, session)))
    .limit(1);
  if (!proj) throw new PmError('NOT_FOUND', `project ${current.project_id} not found`);

  const changes: Record<string, unknown> = {};
  if (patch.role !== undefined) changes.role = patch.role;
  if (patch.planned_pct !== undefined) {
    changes.planned_pct = patch.planned_pct === null ? null : patch.planned_pct.toString();
  }
  if (patch.status !== undefined) changes.status = patch.status;
  if (patch.date_from !== undefined) changes.date_from = patch.date_from;
  if (patch.date_to !== undefined) changes.date_to = patch.date_to;
  if (patch.note !== undefined) changes.note = patch.note;
  const fields = Object.keys(changes);
  if (fields.length === 0) return { version: current.version };

  const nextVersion = current.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(allocation)
        .set({ ...changes, version: nextVersion, updated_at: new Date() })
        .where(
          and(
            eq(allocation.id, allocation_id),
            eq(allocation.version, current.version),
            isNull(allocation.deleted_at),
          ),
        )
        .returning({ id: allocation.id });
      if (updated.length === 0) {
        throw new PmError('CONFLICT', 'allocation was modified concurrently');
      }

      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'pm.allocation',
        aggregateId: allocation_id,
        eventType: PM_ALLOCATION_UPDATED,
        eventVersion: 1,
        payload: {
          allocation_id,
          project_id: current.project_id,
          worker_id: current.worker_id ?? null,
          account_id: proj.account_id,
          tenant_id: session.tenant_id,
          planned_pct: patch.planned_pct ?? null,
          fields,
        },
      });
    },
  );
  return { version: nextVersion };
}

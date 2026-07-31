import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { type UpdateAllocationInput, updateAllocationInput } from '../../contracts.ts';
import { PM_ALLOCATION_UPDATED } from '../../events.ts';
import { pmDb } from '../db/client.ts';
import { allocation, LIVE_PROJECT_STATUSES, project } from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';
import { assertNoProjectOverlap } from './assert-no-overlap.ts';
import { assertProjectManageable } from './assert-project-manageable.ts';
import { assertWithinProjectRange } from './assert-within-project-range.ts';

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
  await assertProjectManageable(current.project_id, session);
  if (patch.expected_version !== undefined && patch.expected_version !== current.version) {
    throw new PmError('CONFLICT', 'version mismatch');
  }

  const projectChanged = patch.project_id !== undefined && patch.project_id !== current.project_id;
  const targetProjectId = patch.project_id ?? current.project_id;
  // Reassign (FUT-349) must also land on a project the caller manages, not just leave one.
  if (projectChanged) await assertProjectManageable(targetProjectId, session);

  const [proj] = await pmDb()
    .select({
      account_id: project.account_id,
      date_from: project.date_from,
      date_to: project.date_to,
      pm_person_id: project.pm_person_id,
    })
    .from(project)
    .where(
      and(
        eq(project.id, targetProjectId),
        tenantScoped(project.tenant_id, session),
        inArray(project.status, LIVE_PROJECT_STATUSES),
      ),
    )
    .limit(1);
  if (!proj) throw new PmError('NOT_FOUND', `project ${targetProjectId} not found`);

  const changes: Record<string, unknown> = {};
  if (projectChanged) changes.project_id = patch.project_id;
  if (patch.role !== undefined) changes.role = patch.role;
  if (patch.planned_pct !== undefined) {
    changes.planned_pct = patch.planned_pct === null ? null : patch.planned_pct.toString();
  }
  if (patch.status !== undefined) changes.status = patch.status;
  if (patch.date_from !== undefined) changes.date_from = patch.date_from;
  if (patch.date_to !== undefined) changes.date_to = patch.date_to;
  if (patch.bucket !== undefined) changes.bucket = patch.bucket;
  if (patch.note !== undefined) changes.note = patch.note;
  const fields = Object.keys(changes);
  if (fields.length === 0) return { version: current.version };

  const datesChanged = patch.date_from !== undefined || patch.date_to !== undefined;
  if (datesChanged || projectChanged) {
    assertWithinProjectRange({
      project_date_from: proj.date_from,
      project_date_to: proj.date_to,
      date_from: patch.date_from !== undefined ? patch.date_from : current.date_from,
      date_to: patch.date_to !== undefined ? patch.date_to : current.date_to,
    });
  }

  const nextVersion = current.version + 1;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      if (current.person_id && (datesChanged || projectChanged)) {
        await assertNoProjectOverlap(tx, {
          tenant_id: session.tenant_id,
          worker_id: current.person_id,
          project_id: targetProjectId,
          date_from: patch.date_from !== undefined ? patch.date_from : current.date_from,
          date_to: patch.date_to !== undefined ? patch.date_to : current.date_to,
          excludeId: allocation_id,
        });
      }

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
          project_id: targetProjectId,
          worker_id: current.person_id ?? null,
          account_id: proj.account_id,
          tenant_id: session.tenant_id,
          planned_pct:
            patch.planned_pct !== undefined
              ? patch.planned_pct
              : current.planned_pct == null
                ? null
                : Number(current.planned_pct),
          lead_worker_id: proj.pm_person_id ?? null,
          date_from: patch.date_from !== undefined ? patch.date_from : current.date_from,
          date_to: patch.date_to !== undefined ? patch.date_to : current.date_to,
          bucket: patch.bucket !== undefined ? patch.bucket : current.bucket,
          fields,
        },
      });
    },
  );
  return { version: nextVersion };
}

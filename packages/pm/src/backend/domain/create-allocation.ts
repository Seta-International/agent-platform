import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, inArray } from 'drizzle-orm';
import { type CreateAllocationInput, createAllocationInput } from '../../contracts.ts';
import { PM_ALLOCATION_CREATED } from '../../events.ts';
import { account, allocation, LIVE_PROJECT_STATUSES, project } from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';
import { assertNoProjectOverlap } from './assert-no-overlap.ts';
import { assertProjectManageable } from './assert-project-manageable.ts';
import { assertWithinProjectRange } from './assert-within-project-range.ts';
import { assertWorkerNotAlumni } from './assert-worker-not-alumni.ts';

export async function createAllocation(
  input: CreateAllocationInput & { session: SessionScope },
): Promise<{ allocation_id: string }> {
  const { session } = input;
  requirePermission(session, 'pm.project.manage');
  const parsed = createAllocationInput.parse(input);
  await assertProjectManageable(parsed.project_id, session);

  // Mirror the DB row rules (allocation_worker_rule_check, allocation_committed_dates_check)
  // so invalid combinations surface as 400 VALIDATION instead of a raw constraint violation.
  if (parsed.status === 'placeholder') {
    if (parsed.worker_id)
      throw new PmError('VALIDATION', 'placeholder allocations cannot name a worker');
  } else {
    if (!parsed.worker_id)
      throw new PmError('VALIDATION', `${parsed.status} allocations require a worker`);
    if (!parsed.date_from)
      throw new PmError('VALIDATION', `${parsed.status} allocations require a start date`);
  }

  if (parsed.worker_id) {
    await assertWorkerNotAlumni(session.tenant_id, parsed.worker_id);
  }

  let result!: { allocation_id: string };
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const proj = await tx
        .select({
          id: project.id,
          account_id: project.account_id,
          pm_worker_id: project.pm_person_id,
          date_from: project.date_from,
          date_to: project.date_to,
        })
        .from(project)
        .where(
          and(
            eq(project.id, parsed.project_id),
            tenantScoped(project.tenant_id, session),
            inArray(project.status, LIVE_PROJECT_STATUSES),
          ),
        )
        .limit(1);
      if (!proj[0]) throw new PmError('NOT_FOUND', `project ${parsed.project_id} not found`);

      assertWithinProjectRange({
        project_date_from: proj[0].date_from,
        project_date_to: proj[0].date_to,
        date_from: parsed.date_from ?? null,
        date_to: parsed.date_to ?? null,
      });

      const [acc] = await tx
        .select({ name: account.name })
        .from(account)
        .where(and(eq(account.id, proj[0].account_id), tenantScoped(account.tenant_id, session)))
        .limit(1);
      if (!acc) throw new PmError('NOT_FOUND', `account ${proj[0].account_id} not found`);

      if (parsed.worker_id) {
        await assertNoProjectOverlap(tx, {
          tenant_id: session.tenant_id,
          worker_id: parsed.worker_id,
          project_id: parsed.project_id,
          date_from: parsed.date_from ?? null,
          date_to: parsed.date_to ?? null,
        });
      }

      const [row] = await tx
        .insert(allocation)
        .values({
          tenant_id: session.tenant_id,
          project_id: parsed.project_id,
          person_id: parsed.worker_id ?? null,
          role: parsed.role ?? null,
          date_from: parsed.date_from ?? null,
          date_to: parsed.date_to ?? null,
          bucket: parsed.bucket,
          planned_pct: parsed.planned_pct?.toString() ?? null,
          minutes_per_day: parsed.minutes_per_day ?? null,
          status: parsed.status,
          note: parsed.note ?? null,
        })
        .returning({ id: allocation.id });
      if (!row) throw new Error('allocation insert returned no row');
      result = { allocation_id: row.id };

      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'pm.allocation',
        aggregateId: row.id,
        eventType: PM_ALLOCATION_CREATED,
        eventVersion: 1,
        payload: {
          allocation_id: row.id,
          project_id: parsed.project_id,
          worker_id: parsed.worker_id ?? null,
          tenant_id: session.tenant_id,
          account_id: proj[0].account_id,
          account_name: acc.name,
          lead_worker_id: proj[0].pm_worker_id ?? null,
          date_from: parsed.date_from ?? null,
          date_to: parsed.date_to ?? null,
          planned_pct: parsed.planned_pct ?? null,
          bucket: parsed.bucket,
        },
      });
    },
  );
  return result;
}

import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { SplitAllocationInput } from '../../contracts.ts';
import { PM_ALLOCATION_CREATED, PM_ALLOCATION_UPDATED } from '../../events.ts';
import { pmDb } from '../db/client.ts';
import { account, allocation, LIVE_PROJECT_STATUSES, project } from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';
import { assertNoProjectOverlap } from './assert-no-overlap.ts';
import { assertWithinProjectRange } from './assert-within-project-range.ts';
import { checkAllocationEffort } from './check-allocation-effort.ts';

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface SplitAllocationResult {
  updated_id: string;
  updated_version: number;
  continuation_id: string;
  warning: { peak_pct: number } | null;
}

/**
 * Ends the current allocation on `new_end_date` and creates a continuation
 * allocation starting the next day, so an effective-dated plan change is
 * recorded as two rows instead of overwriting history in place.
 */
export async function splitAllocation(
  input: SplitAllocationInput & { allocation_id: string; session: SessionScope },
): Promise<SplitAllocationResult> {
  const { allocation_id, new_end_date, continuation, expected_version, session } = input;
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
  if (!current.person_id)
    throw new PmError('VALIDATION', 'cannot split an allocation with no worker');
  if (expected_version !== undefined && expected_version !== current.version) {
    throw new PmError('CONFLICT', 'version mismatch');
  }
  if (current.date_from && new_end_date < current.date_from) {
    throw new PmError('VALIDATION', 'new_end_date is before the allocation start');
  }
  if (current.date_to && new_end_date > current.date_to) {
    throw new PmError('VALIDATION', 'new_end_date is after the allocation end');
  }

  const [proj] = await pmDb()
    .select({
      account_id: project.account_id,
      pm_worker_id: project.pm_person_id,
      date_from: project.date_from,
      date_to: project.date_to,
    })
    .from(project)
    .where(
      and(
        eq(project.id, current.project_id),
        tenantScoped(project.tenant_id, session),
        inArray(project.status, LIVE_PROJECT_STATUSES),
      ),
    )
    .limit(1);
  if (!proj) throw new PmError('NOT_FOUND', `project ${current.project_id} not found`);

  const [acc] = await pmDb()
    .select({ name: account.name })
    .from(account)
    .where(and(eq(account.id, proj.account_id), tenantScoped(account.tenant_id, session)))
    .limit(1);
  if (!acc) throw new PmError('NOT_FOUND', `account ${proj.account_id} not found`);

  const continuationFrom = addDays(new_end_date, 1);
  const continuationTo =
    continuation.date_to !== undefined ? continuation.date_to : current.date_to;
  const continuationPct =
    continuation.planned_pct !== undefined ? continuation.planned_pct : Number(current.planned_pct);
  const continuationBucket = continuation.bucket ?? current.bucket;

  assertWithinProjectRange({
    project_date_from: proj.date_from,
    project_date_to: proj.date_to,
    date_from: continuationFrom,
    date_to: continuationTo,
  });

  const warning =
    continuationTo && continuationPct !== null
      ? await (async () => {
          const check = await checkAllocationEffort({
            worker_id: current.person_id as string,
            date_from: continuationFrom,
            date_to: continuationTo,
            planned_pct: continuationPct,
            exclude_allocation_id: allocation_id,
            session,
          });
          return check.exceeds ? { peak_pct: check.peak_pct } : null;
        })()
      : null;

  const nextVersion = current.version + 1;
  let continuationId!: string;
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      await assertNoProjectOverlap(tx, {
        tenant_id: session.tenant_id,
        worker_id: current.person_id as string,
        project_id: current.project_id,
        date_from: continuationFrom,
        date_to: continuationTo,
        excludeId: allocation_id,
      });

      const updated = await tx
        .update(allocation)
        .set({ date_to: new_end_date, version: nextVersion, updated_at: new Date() })
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
          worker_id: current.person_id,
          account_id: proj.account_id,
          tenant_id: session.tenant_id,
          planned_pct: Number(current.planned_pct),
          lead_worker_id: proj.pm_worker_id ?? null,
          date_from: current.date_from,
          date_to: new_end_date,
          bucket: current.bucket,
          fields: ['date_to'],
        },
      });

      const [row] = await tx
        .insert(allocation)
        .values({
          tenant_id: session.tenant_id,
          project_id: current.project_id,
          person_id: current.person_id,
          role: current.role,
          date_from: continuationFrom,
          date_to: continuationTo,
          bucket: continuationBucket,
          planned_pct: continuationPct === null ? null : continuationPct.toString(),
          minutes_per_day: current.minutes_per_day,
          status: current.status,
          note: continuation.note !== undefined ? continuation.note : current.note,
        })
        .returning({ id: allocation.id });
      if (!row) throw new Error('continuation allocation insert returned no row');
      continuationId = row.id;

      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'pm.allocation',
        aggregateId: row.id,
        eventType: PM_ALLOCATION_CREATED,
        eventVersion: 1,
        payload: {
          allocation_id: row.id,
          project_id: current.project_id,
          worker_id: current.person_id,
          tenant_id: session.tenant_id,
          account_id: proj.account_id,
          account_name: acc.name,
          lead_worker_id: proj.pm_worker_id ?? null,
          date_from: continuationFrom,
          date_to: continuationTo,
          planned_pct: continuationPct,
          bucket: continuationBucket,
        },
      });
    },
  );

  return {
    updated_id: allocation_id,
    updated_version: nextVersion,
    continuation_id: continuationId,
    warning,
  };
}

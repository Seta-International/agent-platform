import type { SessionScope } from '@seta/core';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, gte, isNull, lte, ne, or, type SQL } from 'drizzle-orm';
import { pmDb } from '../db/client.ts';
import { allocation, project } from '../db/schema.ts';
import { requirePermission } from '../rbac.ts';

export interface EffortConflict {
  project_name: string;
  date_from: string | null;
  date_to: string | null;
  planned_pct: number;
}

export interface CheckAllocationEffortResult {
  peak_pct: number;
  exceeds: boolean;
  conflicts: EffortConflict[];
}

/**
 * Peak concurrent planned_pct for a worker if the candidate segment were added,
 * counted across all of the worker's projects (not just the current one) —
 * a soft-warning signal, never a hard block. An allocation with no end date is
 * still ongoing, so it's treated as running through the candidate's own end
 * date rather than being dropped from the calculation.
 */
export async function checkAllocationEffort(input: {
  worker_id: string;
  date_from: string;
  date_to: string;
  planned_pct: number;
  exclude_allocation_id?: string;
  session: SessionScope;
}): Promise<CheckAllocationEffortResult> {
  const { worker_id, date_from, date_to, planned_pct, exclude_allocation_id, session } = input;
  requirePermission(session, 'pm.project.read');

  const conds: (SQL | undefined)[] = [
    tenantScoped(allocation.tenant_id, session),
    eq(allocation.worker_id, worker_id),
    isNull(allocation.deleted_at),
    or(eq(allocation.status, 'tentative'), eq(allocation.status, 'committed')),
    or(isNull(allocation.date_from), lte(allocation.date_from, date_to)),
    or(isNull(allocation.date_to), gte(allocation.date_to, date_from)),
  ];
  if (exclude_allocation_id) conds.push(ne(allocation.id, exclude_allocation_id));

  const rows = await pmDb()
    .select({
      date_from: allocation.date_from,
      date_to: allocation.date_to,
      planned_pct: allocation.planned_pct,
      project_name: project.name,
    })
    .from(allocation)
    .innerJoin(project, eq(project.id, allocation.project_id))
    .where(and(...conds));

  const overlapping = rows
    .filter((r) => r.date_from)
    .map((r) => ({
      project_name: r.project_name,
      date_from: r.date_from,
      date_to: r.date_to,
      planned_pct: r.planned_pct === null ? 0 : Number(r.planned_pct),
    }));

  const segments = [
    ...overlapping.map((r) => ({
      from: r.date_from as string,
      // No end date means still ongoing — bound it by the candidate's own end
      // date, which is the only window this calculation needs to reason about.
      to: r.date_to ?? date_to,
      pct: r.planned_pct,
    })),
    { from: date_from, to: date_to, pct: planned_pct },
  ];
  let peak = 0;
  for (const s of segments) {
    let sum = 0;
    for (const t of segments) {
      if (t.from <= s.from && s.from <= t.to) sum += t.pct;
    }
    if (sum > peak) peak = sum;
  }

  return {
    peak_pct: peak,
    exceeds: peak > 100,
    conflicts: overlapping,
  };
}

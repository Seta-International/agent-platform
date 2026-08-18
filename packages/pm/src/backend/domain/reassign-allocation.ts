import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, inArray, isNull, notInArray, or, type SQL } from 'drizzle-orm';
import type { ReassignAllocationInput, ReassignWorkerAllocationsInput } from '../../contracts.ts';
import { PM_ALLOCATION_CREATED, PM_ALLOCATION_UPDATED } from '../../events.ts';
import { pmDb } from '../db/client.ts';
import {
  account,
  allocation,
  LIVE_PROJECT_STATUSES,
  personProjection,
  project,
} from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';
import { assertNoProjectOverlap } from './assert-no-overlap.ts';
import { assertProjectManageable } from './assert-project-manageable.ts';
import { assertWithinProjectRange } from './assert-within-project-range.ts';
import { buildProjectScope } from './scope.ts';

// The zod schema defaults `updates`/`targets` to [], so the parsed (output) type always carries
// both. Existing callers target the operation by omission (reassign-only, add-only), so the
// domain entry types treat them as optional and default inside.
type GroupReassignInput = Omit<ReassignWorkerAllocationsInput, 'updates' | 'targets'> & {
  updates?: ReassignWorkerAllocationsInput['updates'];
  targets?: ReassignWorkerAllocationsInput['targets'];
};
type GroupReassignRawInput = GroupReassignInput & { session: SessionScope };

function withDefaults(input: GroupReassignRawInput) {
  return {
    ...input,
    updates: input.updates ?? [],
    targets: input.targets ?? [],
  };
}

function tagRangeError(
  err: unknown,
  details:
    | { field: 'source'; index?: number }
    | { field: 'target'; index: number }
    | { field: 'updates'; index: number },
  projectName: string,
): unknown {
  if (err instanceof PmError) {
    return new PmError(err.code, `${projectName}: ${err.message}`, details);
  }
  return err;
}

export interface OverAllocationPeriod {
  date_from: string;
  date_to: string | null;
  peak_pct: number;
}

export interface ReassignWarning {
  peak_pct: number;
  over_allocation_periods: OverAllocationPeriod[];
}

export interface ReassignAllocationResult {
  source_updated_version: number;
  target_ids: string[];
  warnings: ReassignWarning[];
}

export interface ReassignPreviewSegment {
  project_name: string;
  account_name: string;
  bucket: 'billable' | 'internal' | 'bench';
  date_from: string;
  date_to: string | null;
  planned_pct: number;
}

export interface ReassignPreviewResult {
  worker_name: string | null;
  source: ReassignPreviewSegment;
  targets: ReassignPreviewSegment[];
  peak_pct: number;
  exceeds: boolean;
  /** Date window during which `peak_pct` occurs (`peak_to` null means it runs open-ended). */
  peak_from: string | null;
  peak_to: string | null;
  over_allocation_periods: OverAllocationPeriod[];
}

async function loadProject(
  projectId: string,
  session: SessionScope,
): Promise<{
  name: string;
  account_id: string;
  account_name: string;
  pm_worker_id: string | null;
  date_from: string | null;
  date_to: string | null;
}> {
  const [proj] = await pmDb()
    .select({
      name: project.name,
      account_id: project.account_id,
      pm_worker_id: project.pm_person_id,
      date_from: project.date_from,
      date_to: project.date_to,
    })
    .from(project)
    .where(
      and(
        eq(project.id, projectId),
        tenantScoped(project.tenant_id, session),
        inArray(project.status, LIVE_PROJECT_STATUSES),
      ),
    )
    .limit(1);
  if (!proj) throw new PmError('NOT_FOUND', `project ${projectId} not found`);

  const [acc] = await pmDb()
    .select({ name: account.name })
    .from(account)
    .where(and(eq(account.id, proj.account_id), tenantScoped(account.tenant_id, session)))
    .limit(1);
  if (!acc) throw new PmError('NOT_FOUND', `account ${proj.account_id} not found`);

  return { ...proj, account_name: acc.name };
}

async function loadWorkerName(workerId: string, session: SessionScope): Promise<string | null> {
  const [row] = await pmDb()
    .select({ full_name: personProjection.full_name })
    .from(personProjection)
    .where(
      and(
        eq(personProjection.person_id, workerId),
        tenantScoped(personProjection.tenant_id, session),
      ),
    )
    .limit(1);
  return row?.full_name ?? null;
}

interface CandidateSegment {
  date_from: string;
  date_to: string | null;
  planned_pct: number;
}

/** Adds `days` (may be negative) to an ISO `YYYY-MM-DD` date, in UTC. */
function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * FUT-349: Peak concurrent planned_pct across a whole reassignment — the source's own
 * *new* state (never its old, pre-change state) plus every target, together
 * with any of the worker's other allocations that overlap. Unlike a single
 * candidate check, this never drops the source just because it's "the row
 * being edited": if the PM keeps it running (end date unchanged), it still
 * counts toward the total, which is exactly the case a single-candidate check
 * would silently miss.
 *
 * `peak_from`/`peak_to` bound the *entire* contiguous window the combined %
 * stays over 100%, not just the instant every segment happens to overlap at
 * once. Example: keep AI/Data (01 Apr–30 Dec, 100%), add Teacher Zone
 * (01 Aug–01 Sep, 100%) and Motion Global (01 Aug–15 Aug, 100%):
 *
 *   01 Apr–01 Aug: AI/Data only              = 100%
 *   01 Aug–15 Aug: all three together        = 300%  <- peak
 *   15 Aug–01 Sep: AI/Data + Teacher Zone     = 200%  <- still over 100%
 *   01 Sep–30 Dec: AI/Data only               = 100%
 *
 * `peak_pct` is 300 (the max), but `peak_from`/`peak_to` report 01 Aug–01 Sep
 * — the full run of over-100% intervals, not just the 01–15 Aug slice where
 * all three line up. It only closes out once Teacher Zone ends, since 200%
 * is still over capacity.
 */
async function computeCombinedPeak(args: {
  worker_id: string;
  exclude_allocation_ids: string[];
  candidates: CandidateSegment[];
  session: SessionScope;
}): Promise<{
  peak_pct: number;
  exceeds: boolean;
  peak_from: string | null;
  peak_to: string | null;
  over_allocation_periods: OverAllocationPeriod[];
  has_restricted_allocations: boolean;
  restricted_segments: Array<{ date_from: string; date_to: string | null; planned_pct: number }>;
}> {
  const { worker_id, exclude_allocation_ids, candidates, session } = args;

  // Sweep the worker's ENTIRE book, not just the window the previewed change spans.
  // Over-allocation is a property of the person's schedule as a whole: two existing
  // allocations that already overlap at 200% must surface even when this operation
  // adds an unrelated allocation elsewhere in time (and doesn't touch them). Scoping
  // the peak to the candidates' window would hide such a pre-existing conflict — the
  // Review step would paint a red 200% on its timeline yet show no warning.
  const conds: (SQL | undefined)[] = [
    tenantScoped(allocation.tenant_id, session),
    eq(allocation.person_id, worker_id),
    isNull(allocation.deleted_at),
    notInArray(allocation.id, exclude_allocation_ids),
    or(eq(allocation.status, 'tentative'), eq(allocation.status, 'committed')),
  ];

  const otherRows = await pmDb()
    .select({
      id: allocation.id,
      project_id: allocation.project_id,
      date_from: allocation.date_from,
      date_to: allocation.date_to,
      planned_pct: allocation.planned_pct,
    })
    .from(allocation)
    .where(and(...conds));

  // Determine which of the worker's other allocations belong to projects outside the current session's read scope.
  const projectScope = buildProjectScope(session);
  const projectIds = Array.from(new Set(otherRows.map((r) => r.project_id)));
  let visibleProjectSet: Set<string> | null = null;
  if (projectScope && projectIds.length > 0) {
    const visibleProjects = await pmDb()
      .select({ id: project.id })
      .from(project)
      .where(
        and(
          inArray(project.id, projectIds),
          tenantScoped(project.tenant_id, session),
          isNull(project.deleted_at),
          projectScope,
        ),
      );
    visibleProjectSet = new Set(visibleProjects.map((p) => p.id));
  }
  const restrictedOtherRows = visibleProjectSet
    ? otherRows.filter((r) => !visibleProjectSet.has(r.project_id))
    : [];

  const restricted_segments = restrictedOtherRows
    .filter((r) => r.date_from)
    .map((r) => ({
      date_from: r.date_from as string,
      date_to: r.date_to ?? null,
      planned_pct: r.planned_pct === null ? 0 : Number(r.planned_pct),
    }));
  const has_restricted_allocations = restricted_segments.length > 0;

  // Bound for any segment with no end date: the latest known finite end across every
  // segment we sweep (candidates AND the worker's other rows), or (rare) a far-future
  // date if literally everything is open-ended. Deliberately not year 9999:
  // `addDaysIso` adds a day via `Date.toISOString()`, which switches to a 6-digit
  // extended year (e.g. `+010000-01-01`) once the result rolls past year 9999 — that
  // string sorts *before* ordinary 4-digit dates, silently dropping the open-ended
  // segment from the peak sweep below.
  const finiteEnds = [...candidates.map((c) => c.date_to), ...otherRows.map((r) => r.date_to)]
    .filter((d): d is string => d !== null)
    .sort();
  const openEndedBound =
    finiteEnds.length > 0 ? (finiteEnds[finiteEnds.length - 1] as string) : '2999-12-31';

  const segments = [
    ...otherRows
      .filter((r) => r.date_from)
      .map((r) => ({
        from: r.date_from as string,
        to: r.date_to ?? openEndedBound,
        origTo: r.date_to,
        pct: r.planned_pct === null ? 0 : Number(r.planned_pct),
      })),
    ...candidates.map((c) => ({
      from: c.date_from,
      to: c.date_to ?? openEndedBound,
      origTo: c.date_to,
      pct: c.planned_pct,
    })),
  ];

  // Sweep every date where the combined % can change (a segment's start, or the
  // day after a segment's end) and compute the sum in each constant interval between
  // them. This finds the true peak *and* all contiguous windows where % > 100%.
  const eventDates = Array.from(
    new Set(segments.flatMap((s) => [s.from, addDaysIso(s.to, 1)])),
  ).sort();

  interface Interval {
    start: string;
    endExclusive: string;
    sum: number;
  }
  const intervals: Interval[] = [];
  for (let i = 0; i < eventDates.length - 1; i++) {
    const start = eventDates[i] as string;
    const endExclusive = eventDates[i + 1] as string;
    const sum = segments
      .filter((s) => s.from <= start && start < addDaysIso(s.to, 1))
      .reduce((acc, s) => acc + s.pct, 0);
    intervals.push({ start, endExclusive, sum });
  }

  const peak = intervals.reduce((max, iv) => Math.max(max, iv.sum), 0);
  const over_allocation_periods: OverAllocationPeriod[] = [];

  if (peak > 100) {
    let runStart: string | null = null;
    let runEndExclusive: string | null = null;
    let runMax = 0;
    const flushRun = () => {
      if (runStart !== null && runEndExclusive !== null) {
        const inclusiveEnd = addDaysIso(runEndExclusive, -1);
        // A run only truly ends there if some segment genuinely finishes on that day —
        // otherwise the boundary is just the synthetic clamp for an open-ended segment,
        // and the overlap in fact continues indefinitely.
        const dateTo = segments.some((s) => s.origTo === inclusiveEnd) ? inclusiveEnd : null;
        over_allocation_periods.push({
          date_from: runStart,
          date_to: dateTo,
          peak_pct: runMax,
        });
      }
      runStart = null;
      runEndExclusive = null;
      runMax = 0;
    };
    for (const iv of intervals) {
      if (iv.sum > 100) {
        if (runStart === null) runStart = iv.start;
        runEndExclusive = iv.endExclusive;
        runMax = Math.max(runMax, iv.sum);
      } else {
        flushRun();
      }
    }
    flushRun();
  }

  return {
    peak_pct: peak,
    exceeds: peak > 100,
    peak_from: over_allocation_periods[0]?.date_from ?? null,
    peak_to: over_allocation_periods[0]?.date_to ?? null,
    over_allocation_periods,
    has_restricted_allocations,
    restricted_segments,
  };
}

async function resolveReassignment(
  input: ReassignAllocationInput & { allocation_id: string; session: SessionScope },
) {
  const { allocation_id, source, targets, expected_version, session } = input;

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
    throw new PmError('VALIDATION', 'cannot reassign an allocation with no worker');
  if (expected_version !== undefined && expected_version !== current.version) {
    throw new PmError('CONFLICT', 'version mismatch');
  }
  if (current.date_from && source.date_to < current.date_from) {
    throw new PmError('VALIDATION', 'new_end_date is before the allocation start');
  }
  if (current.date_to && source.date_to > current.date_to) {
    throw new PmError('VALIDATION', 'new_end_date is after the allocation end');
  }

  const sourceProj = await loadProject(current.project_id, session);
  const workerId = current.person_id;

  try {
    assertWithinProjectRange({
      project_date_from: sourceProj.date_from,
      project_date_to: sourceProj.date_to,
      date_from: current.date_from,
      date_to: source.date_to,
    });
  } catch (err) {
    throw tagRangeError(err, { field: 'source' }, sourceProj.name);
  }

  // Resolve + validate every target project in order so a failure is tagged to the
  // exact row that caused it (and we fail before mutating anything).
  const resolvedTargets: Array<{
    input: (typeof targets)[number];
    proj: Awaited<ReturnType<typeof loadProject>>;
  }> = [];
  for (const [index, t] of targets.entries()) {
    const proj = await loadProject(t.project_id, session);
    try {
      assertWithinProjectRange({
        project_date_from: proj.date_from,
        project_date_to: proj.date_to,
        date_from: t.date_from,
        date_to: t.date_to ?? null,
      });
    } catch (err) {
      throw tagRangeError(err, { field: 'target', index }, proj.name);
    }
    resolvedTargets.push({ input: t, proj });
  }

  return { current, sourceProj, workerId, resolvedTargets };
}

/**
 * Ends the source allocation on its own new end date and creates one or more
 * target allocations, each with its own start/end date — no shared "effective
 * date" forcing every target to start the same day, and no gap/adjacency
 * requirement. Continuing on the *same* project at a different % is just a
 * target whose project_id matches the source's. Everything commits in one
 * transaction so the worker is never left mid-move. History on the source is
 * never overwritten, only shortened.
 */
export async function reassignAllocation(
  input: ReassignAllocationInput & { allocation_id: string; session: SessionScope },
): Promise<ReassignAllocationResult> {
  const { allocation_id, source, session } = input;
  requirePermission(session, 'pm.project.manage');

  const { current, sourceProj, workerId, resolvedTargets } = await resolveReassignment(input);

  const { peak_pct, over_allocation_periods } = await computeCombinedPeak({
    worker_id: workerId,
    exclude_allocation_ids: [allocation_id],
    candidates: [
      {
        date_from: current.date_from as string,
        date_to: source.date_to,
        planned_pct: Number(current.planned_pct),
      },
      ...resolvedTargets.map((t) => ({
        date_from: t.input.date_from,
        date_to: t.input.date_to ?? null,
        planned_pct: t.input.planned_pct,
      })),
    ],
    session,
  });
  // FUT-853: one warning per worker (not per target project) describing the combined
  // over-allocation state so the notification message correctly attributes the total
  // % to the employee, not to the newly added project alone.
  const warnings: ReassignWarning[] = peak_pct > 100 ? [{ peak_pct, over_allocation_periods }] : [];

  const nextVersion = current.version + 1;
  const targetIds: string[] = [];

  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const updated = await tx
        .update(allocation)
        .set({ date_to: source.date_to, version: nextVersion, updated_at: new Date() })
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
          worker_id: workerId,
          account_id: sourceProj.account_id,
          tenant_id: session.tenant_id,
          planned_pct: Number(current.planned_pct),
          lead_worker_id: sourceProj.pm_worker_id ?? null,
          date_from: current.date_from,
          date_to: source.date_to ?? null,
          bucket: current.bucket,
          fields: ['date_to'],
        },
      });

      for (const t of resolvedTargets) {
        await assertNoProjectOverlap(tx, {
          tenant_id: session.tenant_id,
          worker_id: workerId,
          project_id: t.input.project_id,
          date_from: t.input.date_from,
          date_to: t.input.date_to ?? null,
          excludeId: allocation_id,
        });
        const [row] = await tx
          .insert(allocation)
          .values({
            tenant_id: session.tenant_id,
            project_id: t.input.project_id,
            person_id: workerId,
            role: current.role,
            date_from: t.input.date_from,
            date_to: t.input.date_to ?? null,
            bucket: t.input.bucket ?? 'billable',
            planned_pct: t.input.planned_pct.toString(),
            minutes_per_day: current.minutes_per_day,
            status: current.status,
            note: t.input.note ?? null,
          })
          .returning({ id: allocation.id });
        if (!row) throw new Error('target allocation insert returned no row');
        targetIds.push(row.id);

        await emit({
          tenantId: session.tenant_id,
          aggregateType: 'pm.allocation',
          aggregateId: row.id,
          eventType: PM_ALLOCATION_CREATED,
          eventVersion: 1,
          payload: {
            allocation_id: row.id,
            project_id: t.input.project_id,
            worker_id: workerId,
            tenant_id: session.tenant_id,
            account_id: t.proj.account_id,
            account_name: t.proj.account_name,
            lead_worker_id: t.proj.pm_worker_id ?? null,
            date_from: t.input.date_from,
            date_to: t.input.date_to ?? null,
            planned_pct: t.input.planned_pct,
            bucket: t.input.bucket ?? 'billable',
          },
        });
      }
    },
  );

  return {
    source_updated_version: nextVersion,
    target_ids: targetIds,
    warnings,
  };
}

/**
 * Read-only dry run of {@link reassignAllocation}: resolves and validates
 * everything the same way, but never mutates. Returns the source's post-change
 * state, each target as it would be created, and the combined peak % so the UI
 * can show an impact preview before the PM confirms.
 */
export async function previewReassignAllocation(
  input: ReassignAllocationInput & { allocation_id: string; session: SessionScope },
): Promise<ReassignPreviewResult> {
  const { allocation_id, source, session } = input;
  requirePermission(session, 'pm.project.manage');

  const { current, sourceProj, workerId, resolvedTargets } = await resolveReassignment(input);

  const [worker_name, { peak_pct, exceeds, peak_from, peak_to, over_allocation_periods }] =
    await Promise.all([
      loadWorkerName(workerId, session),
      computeCombinedPeak({
        worker_id: workerId,
        exclude_allocation_ids: [allocation_id],
        candidates: [
          {
            date_from: current.date_from as string,
            date_to: source.date_to,
            planned_pct: Number(current.planned_pct),
          },
          ...resolvedTargets.map((t) => ({
            date_from: t.input.date_from,
            date_to: t.input.date_to ?? null,
            planned_pct: t.input.planned_pct,
          })),
        ],
        session,
      }),
    ]);

  return {
    worker_name,
    source: {
      project_name: sourceProj.name,
      account_name: sourceProj.account_name,
      bucket: current.bucket,
      date_from: current.date_from as string,
      date_to: source.date_to,
      planned_pct: Number(current.planned_pct),
    },
    targets: resolvedTargets.map((t) => ({
      project_name: t.proj.name,
      account_name: t.proj.account_name,
      bucket: t.input.bucket ?? 'billable',
      date_from: t.input.date_from,
      date_to: t.input.date_to ?? null,
      planned_pct: t.input.planned_pct,
    })),
    peak_pct,
    exceeds,
    peak_from,
    peak_to,
    over_allocation_periods,
  };
}

export interface ReassignWorkerAllocationsResult {
  updated: Array<{ allocation_id: string; version: number }>;
  target_ids: string[];
  warnings: ReassignWarning[];
}

export interface RestrictedSegment {
  date_from: string;
  date_to: string | null;
  planned_pct: number;
}

export interface ReassignGroupPreviewResult {
  worker_name: string | null;
  sources: ReassignPreviewSegment[];
  targets: ReassignPreviewSegment[];
  peak_pct: number;
  exceeds: boolean;
  peak_from: string | null;
  peak_to: string | null;
  over_allocation_periods: OverAllocationPeriod[];
  has_restricted_allocations: boolean;
  restricted_segments: RestrictedSegment[];
}

async function resolveGroupReassignment(input: GroupReassignRawInput) {
  const { worker_id, allocation_ids, updates, source, targets, session } = withDefaults(input);

  // End-of-target rows must exist and belong to the worker.
  const currentRows = await pmDb()
    .select()
    .from(allocation)
    .where(
      and(
        inArray(allocation.id, allocation_ids),
        eq(allocation.person_id, worker_id),
        tenantScoped(allocation.tenant_id, session),
        isNull(allocation.deleted_at),
      ),
    );
  if (currentRows.length !== allocation_ids.length) {
    throw new PmError('NOT_FOUND', 'one or more allocations not found for this worker');
  }

  // In-place edit targets (updates) may include rows NOT in allocation_ids — every edited row
  // still belongs to the worker and must resolve the same way.
  const updateIds = updates.map((u) => u.allocation_id);
  const updateRows = await pmDb()
    .select()
    .from(allocation)
    .where(
      and(
        inArray(allocation.id, updateIds),
        eq(allocation.person_id, worker_id),
        tenantScoped(allocation.tenant_id, session),
        isNull(allocation.deleted_at),
      ),
    );
  if (updateRows.length !== updateIds.length) {
    throw new PmError('NOT_FOUND', 'one or more allocations not found for this worker');
  }

  // In-place edits (FUT-881): batch-applied with any new targets at confirm. Each update is
  // resolved against its own current row + target project and validated (range, manage scope,
  // overlap) before anything mutates. Overlap is checked inside the commit tx against the
  // final state of {sibling updates, target inserts, existing rows} so the batch as a whole
  // cannot create an overlap — the same guarantee update-allocation.ts gives a single row.
  const resolvedUpdates: Array<{
    current: (typeof currentRows)[number];
    updated: NonNullable<ReassignWorkerAllocationsInput['updates']>[number];
    proj: Awaited<ReturnType<typeof loadProject>>;
    effective: {
      project_id: string;
      date_from: string | null;
      date_to: string | null;
      planned_pct: number;
      bucket: 'billable' | 'internal' | 'bench';
      note: string | null;
    };
  }> = [];
  const updateById = new Map(updates.map((u) => [u.allocation_id, u]));
  for (const current of updateRows) {
    // updateRows was loaded with inArray(allocation.id, updateIds), so every row has a match.
    const update = updateById.get(current.id)!;
    // Optimistic-concurrency guard mirrors update-allocation.ts: a stale expected_version means
    // the row changed since the wizard loaded it — reject the whole batch (update-allocation.ts
    // throws before the tx; here the resolve phase runs before any write, same atomic result).
    if (update.expected_version !== undefined && update.expected_version !== current.version) {
      throw new PmError('CONFLICT', 'allocation was modified concurrently', {
        field: 'updates',
        index: resolvedUpdates.length,
      });
    }
    const targetProjectId = update.project_id ?? current.project_id;
    await assertProjectManageable(targetProjectId, session);
    const proj = await loadProject(targetProjectId, session);
    const effFrom = update.date_from !== undefined ? update.date_from : current.date_from;
    const effTo = update.date_to !== undefined ? update.date_to : current.date_to;
    try {
      assertWithinProjectRange({
        project_date_from: proj.date_from,
        project_date_to: proj.date_to,
        date_from: effFrom,
        date_to: effTo,
      });
    } catch (err) {
      throw tagRangeError(err, { field: 'updates', index: resolvedUpdates.length }, proj.name);
    }
    resolvedUpdates.push({
      current,
      updated: update,
      proj,
      effective: {
        project_id: targetProjectId,
        date_from: effFrom,
        date_to: effTo,
        planned_pct:
          update.planned_pct !== undefined ? update.planned_pct : Number(current.planned_pct),
        bucket: update.bucket ?? current.bucket,
        note: update.note !== undefined ? update.note : current.note,
      },
    });
  }

  // Validate + resolve each selected allocation's own project range before
  // mutating anything — a failure is tagged to the exact row that caused it.
  const resolvedSources: Array<{
    current: (typeof currentRows)[number];
    proj: Awaited<ReturnType<typeof loadProject>>;
  }> = [];
  for (const [index, current] of currentRows.entries()) {
    if (current.date_from && source.date_to < current.date_from) {
      throw new PmError('VALIDATION', 'new_end_date is before the allocation start', {
        field: 'source',
        index,
      });
    }
    if (current.date_to && source.date_to > current.date_to) {
      throw new PmError('VALIDATION', 'new_end_date is after the allocation end', {
        field: 'source',
        index,
      });
    }
    const proj = await loadProject(current.project_id, session);
    try {
      assertWithinProjectRange({
        project_date_from: proj.date_from,
        project_date_to: proj.date_to,
        date_from: current.date_from,
        date_to: source.date_to,
      });
    } catch (err) {
      throw tagRangeError(err, { field: 'source', index }, proj.name);
    }
    resolvedSources.push({ current, proj });
  }

  const resolvedTargets: Array<{
    input: (typeof targets)[number];
    proj: Awaited<ReturnType<typeof loadProject>>;
  }> = [];
  for (const [index, t] of targets.entries()) {
    const proj = await loadProject(t.project_id, session);
    try {
      assertWithinProjectRange({
        project_date_from: proj.date_from,
        project_date_to: proj.date_to,
        date_from: t.date_from,
        date_to: t.date_to ?? null,
      });
    } catch (err) {
      throw tagRangeError(err, { field: 'target', index }, proj.name);
    }
    resolvedTargets.push({ input: t, proj });
  }

  return { resolvedSources, resolvedUpdates, resolvedTargets };
}

/**
 * Like {@link reassignAllocation}, but ends every one of a PM-chosen subset of
 * a worker's allocations on the same date in one transaction, then creates the
 * target allocation(s) — the "reassign this person off several projects at
 * once" flow. Unselected allocations are left completely untouched.
 */
export async function reassignWorkerAllocations(
  input: GroupReassignRawInput,
): Promise<ReassignWorkerAllocationsResult> {
  const { worker_id, source, session } = withDefaults(input);
  requirePermission(session, 'pm.project.manage');

  const { resolvedSources, resolvedUpdates, resolvedTargets } =
    await resolveGroupReassignment(input);

  const { peak_pct, over_allocation_periods } = await computeCombinedPeak({
    worker_id,
    exclude_allocation_ids: [
      ...resolvedSources.map((s) => s.current.id),
      ...resolvedUpdates.map((u) => u.current.id),
    ],
    candidates: [
      ...resolvedSources.map((s) => ({
        date_from: s.current.date_from as string,
        date_to: source.date_to,
        planned_pct: Number(s.current.planned_pct),
      })),
      ...resolvedUpdates.map((u) => ({
        date_from: u.effective.date_from as string,
        date_to: u.effective.date_to,
        planned_pct: u.effective.planned_pct,
      })),
      ...resolvedTargets.map((t) => ({
        date_from: t.input.date_from,
        date_to: t.input.date_to ?? null,
        planned_pct: t.input.planned_pct,
      })),
    ],
    session,
  });
  // FUT-853: one warning per worker (not per target project) — same as reassignAllocation above.
  const warnings: ReassignWarning[] = peak_pct > 100 ? [{ peak_pct, over_allocation_periods }] : [];
  // Used as the template for role/status/minutes_per_day on the newly created
  // rows — a reasonable default when reassigning off several projects at once.
  // `allocation_ids` may be empty (adding allocations without ending any
  // existing one), so fall back to sensible defaults with no source to copy.
  const template = resolvedSources[0]?.current ?? {
    role: null as string | null,
    minutes_per_day: null as number | null,
    status: 'committed' as const,
  };

  const updated: Array<{ allocation_id: string; version: number }> = [];
  const targetIds: string[] = [];

  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      for (const u of resolvedUpdates) {
        const projChanged = u.effective.project_id !== u.current.project_id;
        // Overlap is checked against the batch's final state (updated + sibling updates +
        // targets + other rows) so the whole confirm can't create a {worker, project} clash.
        if (projChanged || u.effective.date_from != null) {
          await assertNoProjectOverlap(tx, {
            tenant_id: session.tenant_id,
            worker_id,
            project_id: u.effective.project_id,
            date_from: u.effective.date_from,
            date_to: u.effective.date_to,
            excludeId: u.current.id,
          });
        }
        const changes: Record<string, unknown> = {};
        if (u.updated.project_id !== undefined) changes.project_id = u.updated.project_id;
        if (u.updated.planned_pct !== undefined)
          changes.planned_pct = u.updated.planned_pct.toString();
        if (u.updated.date_from !== undefined) changes.date_from = u.updated.date_from;
        if (u.updated.date_to !== undefined) changes.date_to = u.updated.date_to;
        if (u.updated.bucket !== undefined) changes.bucket = u.updated.bucket;
        if (u.updated.note !== undefined) changes.note = u.updated.note;
        if (Object.keys(changes).length === 0) continue;
        const nextVersion = u.current.version + 1;
        const updatedRows = await tx
          .update(allocation)
          .set({ ...changes, version: nextVersion, updated_at: new Date() })
          .where(
            and(
              eq(allocation.id, u.current.id),
              eq(allocation.version, u.current.version),
              isNull(allocation.deleted_at),
            ),
          )
          .returning({ id: allocation.id });
        if (updatedRows.length === 0) {
          throw new PmError('CONFLICT', 'allocation was modified concurrently');
        }
        updated.push({ allocation_id: u.current.id, version: nextVersion });
        const changedField = Object.keys(changes);
        await emit({
          tenantId: session.tenant_id,
          aggregateType: 'pm.allocation',
          aggregateId: u.current.id,
          eventType: PM_ALLOCATION_UPDATED,
          eventVersion: 1,
          payload: {
            allocation_id: u.current.id,
            project_id: u.effective.project_id,
            worker_id,
            account_id: u.proj.account_id,
            tenant_id: session.tenant_id,
            planned_pct: u.effective.planned_pct,
            lead_worker_id: u.proj.pm_worker_id ?? null,
            date_from: u.effective.date_from,
            date_to: u.effective.date_to,
            bucket: u.effective.bucket,
            fields: changedField,
          },
        });
      }

      for (const s of resolvedSources) {
        const nextVersion = s.current.version + 1;
        const updatedRows = await tx
          .update(allocation)
          .set({ date_to: source.date_to, version: nextVersion, updated_at: new Date() })
          .where(
            and(
              eq(allocation.id, s.current.id),
              eq(allocation.version, s.current.version),
              isNull(allocation.deleted_at),
            ),
          )
          .returning({ id: allocation.id });
        if (updatedRows.length === 0) {
          throw new PmError('CONFLICT', 'allocation was modified concurrently');
        }
        updated.push({ allocation_id: s.current.id, version: nextVersion });

        await emit({
          tenantId: session.tenant_id,
          aggregateType: 'pm.allocation',
          aggregateId: s.current.id,
          eventType: PM_ALLOCATION_UPDATED,
          eventVersion: 1,
          payload: {
            allocation_id: s.current.id,
            project_id: s.current.project_id,
            worker_id,
            account_id: s.proj.account_id,
            tenant_id: session.tenant_id,
            planned_pct: Number(s.current.planned_pct),
            lead_worker_id: s.proj.pm_worker_id ?? null,
            date_from: s.current.date_from,
            date_to: source.date_to ?? null,
            bucket: s.current.bucket,
            fields: ['date_to'],
          },
        });
      }

      for (const t of resolvedTargets) {
        const sameProjectSource = resolvedSources.find(
          (s) => s.current.project_id === t.input.project_id,
        );
        await assertNoProjectOverlap(tx, {
          tenant_id: session.tenant_id,
          worker_id,
          project_id: t.input.project_id,
          date_from: t.input.date_from,
          date_to: t.input.date_to ?? null,
          // A source being reassigned off this project in this same batch is not a conflict
          // (its end moves to source.date_to); an edited row staying on the project IS one,
          // so it's deliberately NOT excluded — two of the worker's allocations on one
          // project cannot overlap.
          excludeId: sameProjectSource?.current.id,
        });
        const [row] = await tx
          .insert(allocation)
          .values({
            tenant_id: session.tenant_id,
            project_id: t.input.project_id,
            person_id: worker_id,
            role: template.role,
            date_from: t.input.date_from,
            date_to: t.input.date_to ?? null,
            bucket: t.input.bucket ?? 'billable',
            planned_pct: t.input.planned_pct.toString(),
            minutes_per_day: template.minutes_per_day,
            status: template.status,
            note: t.input.note ?? null,
          })
          .returning({ id: allocation.id });
        if (!row) throw new Error('target allocation insert returned no row');
        targetIds.push(row.id);

        await emit({
          tenantId: session.tenant_id,
          aggregateType: 'pm.allocation',
          aggregateId: row.id,
          eventType: PM_ALLOCATION_CREATED,
          eventVersion: 1,
          payload: {
            allocation_id: row.id,
            project_id: t.input.project_id,
            worker_id,
            tenant_id: session.tenant_id,
            account_id: t.proj.account_id,
            account_name: t.proj.account_name,
            lead_worker_id: t.proj.pm_worker_id ?? null,
            date_from: t.input.date_from,
            date_to: t.input.date_to ?? null,
            planned_pct: t.input.planned_pct,
            bucket: t.input.bucket ?? 'billable',
          },
        });
      }
    },
  );

  return { updated, target_ids: targetIds, warnings };
}

/**
 * Read-only dry run of {@link reassignWorkerAllocations}.
 */
export async function previewReassignWorkerAllocations(
  input: GroupReassignRawInput,
): Promise<ReassignGroupPreviewResult> {
  const { worker_id, source, session } = withDefaults(input);
  requirePermission(session, 'pm.project.manage');

  const { resolvedSources, resolvedUpdates, resolvedTargets } =
    await resolveGroupReassignment(input);
  // In-place edits (FUT-881): the preview must score the worker's book as it WILL be after
  // confirm, so each edited row is excluded from the DB sweep (its old state) and re-injected
  // as a candidate carrying the edited values. Nothing is persisted here — the dry run returns
  // before any write, so the confirm remains the single atomic commit point.
  const excludeIds = [
    ...resolvedSources.map((s) => s.current.id),
    ...resolvedUpdates.map((u) => u.current.id),
  ];

  const [
    worker_name,
    {
      peak_pct,
      exceeds,
      peak_from,
      peak_to,
      over_allocation_periods,
      has_restricted_allocations,
      restricted_segments,
    },
  ] = await Promise.all([
    loadWorkerName(worker_id, session),
    computeCombinedPeak({
      worker_id,
      exclude_allocation_ids: excludeIds,
      candidates: [
        ...resolvedSources.map((s) => ({
          date_from: s.current.date_from as string,
          date_to: source.date_to,
          planned_pct: Number(s.current.planned_pct),
        })),
        ...resolvedUpdates.map((u) => ({
          date_from: u.effective.date_from as string,
          date_to: u.effective.date_to,
          planned_pct: u.effective.planned_pct,
        })),
        ...resolvedTargets.map((t) => ({
          date_from: t.input.date_from,
          date_to: t.input.date_to ?? null,
          planned_pct: t.input.planned_pct,
        })),
      ],
      session,
    }),
  ]);

  return {
    worker_name,
    sources: resolvedSources.map((s) => ({
      project_name: s.proj.name,
      account_name: s.proj.account_name,
      bucket: s.current.bucket,
      date_from: s.current.date_from as string,
      date_to: source.date_to,
      planned_pct: Number(s.current.planned_pct),
    })),
    targets: resolvedTargets.map((t) => ({
      project_name: t.proj.name,
      account_name: t.proj.account_name,
      bucket: t.input.bucket ?? 'billable',
      date_from: t.input.date_from,
      date_to: t.input.date_to ?? null,
      planned_pct: t.input.planned_pct,
    })),
    peak_pct,
    exceeds,
    peak_from,
    peak_to,
    over_allocation_periods,
    has_restricted_allocations,
    restricted_segments,
  };
}

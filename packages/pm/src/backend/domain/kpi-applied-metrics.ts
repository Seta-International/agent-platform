import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { SetAppliedMetricInput } from '../../contracts.ts';
import { PM_KPI_APPLIED_METRIC_CHANGED } from '../../events.ts';
import { pmDb } from '../db/client.ts';
import {
  kpiAppliedMetric,
  kpiNormMetric,
  kpiRecord,
  kpiRecordEntry,
  project,
} from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';
import { assertProjectManageable } from './assert-project-manageable.ts';
import { getCurrentIsoWeek, isWeekEditable } from './iso-week.ts';
import { stampBaselineWeek, unstampBaselineWeek } from './kpi-baseline.ts';
import { buildProjectScope } from './scope.ts';

const CATEGORY_LABEL: Record<string, string> = {
  quality: 'Quality',
  cost_capacity: 'Cost & Capacity',
  delivery: 'Delivery',
  process: 'Process',
};

/** How many of the queried projects have this metric applied — `applied_count ===
 * project_ids.length` means every one of them does, `0` means none, anything else is a mixed
 * state (Configure metrics collapses that to an indeterminate checkbox). */
export interface AppliedMetricCoverage {
  metric_id: string;
  applied_count: number;
  entered_count: number;
  would_empty_count: number;
}

/** Applied-metric coverage across a set of projects (functional-analysis.md §2d: Configure
 * metrics is per-project with a bulk project picker, not one tenant-wide set). Visible to
 * anyone who can read pm projects; `project_ids` should already be scoped to what the caller
 * can see (the picker only offers visible/manageable projects). */
export async function listAppliedMetrics(
  session: SessionScope,
  project_ids: string[],
  week?: { iso_year: number; iso_week: number },
): Promise<AppliedMetricCoverage[]> {
  requirePermission(session, 'pm.project.read');
  if (project_ids.length === 0) return [];

  const scopeConds = [
    tenantScoped(project.tenant_id, session),
    isNull(project.deleted_at),
    inArray(project.id, project_ids),
  ];
  const scope = buildProjectScope(session);
  if (scope) scopeConds.push(scope);
  const visible_project_ids = (
    await pmDb()
      .select({ id: project.id })
      .from(project)
      .where(and(...scopeConds))
  ).map((r) => r.id);
  if (visible_project_ids.length === 0) return [];

  const rows = await pmDb()
    .select({
      metric_id: kpiAppliedMetric.metric_id,
      project_id: kpiAppliedMetric.project_id,
    })
    .from(kpiAppliedMetric)
    .where(
      and(
        tenantScoped(kpiAppliedMetric.tenant_id, session),
        inArray(kpiAppliedMetric.project_id, visible_project_ids),
      ),
    );

  const applied = new Map<string, number>();
  for (const r of rows) applied.set(r.metric_id, (applied.get(r.metric_id) ?? 0) + 1);

  const entered = new Map<string, number>();
  if (week && isWeekEditable(week.iso_year, week.iso_week)) {
    const entryRows = await pmDb()
      .select({ metric_id: kpiRecordEntry.metric_id, project_id: kpiRecord.project_id })
      .from(kpiRecordEntry)
      .innerJoin(
        kpiRecord,
        and(
          eq(kpiRecord.id, kpiRecordEntry.record_id),
          eq(kpiRecord.tenant_id, kpiRecordEntry.tenant_id),
        ),
      )
      .where(
        and(
          tenantScoped(kpiRecordEntry.tenant_id, session),
          inArray(kpiRecord.project_id, visible_project_ids),
          eq(kpiRecord.iso_year, week.iso_year),
          eq(kpiRecord.iso_week, week.iso_week),
        ),
      );
    const seen = new Set<string>();
    for (const r of entryRows) {
      const key = `${r.metric_id}:${r.project_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entered.set(r.metric_id, (entered.get(r.metric_id) ?? 0) + 1);
    }
  }

  const metric_ids = [...new Set([...applied.keys(), ...entered.keys()])];
  if (metric_ids.length === 0) return [];

  const categoryRows = await pmDb()
    .select({ id: kpiNormMetric.id, category: kpiNormMetric.category })
    .from(kpiNormMetric)
    .where(
      and(tenantScoped(kpiNormMetric.tenant_id, session), inArray(kpiNormMetric.id, metric_ids)),
    );
  const categoryOf = new Map(categoryRows.map((r) => [r.id, r.category]));

  const appliedInProjectCategory = new Map<string, Set<string>>();
  for (const r of rows) {
    const category = categoryOf.get(r.metric_id);
    if (!category) continue;
    const key = `${r.project_id}:${category}`;
    const set = appliedInProjectCategory.get(key) ?? new Set<string>();
    set.add(r.metric_id);
    appliedInProjectCategory.set(key, set);
  }

  const wouldEmptyCount = (metric_id: string): number => {
    const category = categoryOf.get(metric_id);
    if (!category) return 0;
    return visible_project_ids.filter((project_id) => {
      const set = appliedInProjectCategory.get(`${project_id}:${category}`);
      return set !== undefined && set.size === 1 && set.has(metric_id);
    }).length;
  };

  return metric_ids.map((metric_id) => ({
    metric_id,
    applied_count: applied.get(metric_id) ?? 0,
    entered_count: entered.get(metric_id) ?? 0,
    would_empty_count: wouldEmptyCount(metric_id),
  }));
}

/** One tick in Configure metrics: apply this metric to every selected project, or remove it
 * from all of them. */
export interface AppliedMetricChange {
  metric_id: string;
  applied: boolean;
}

/**
 * Save a whole Configure metrics panel in one transaction (FUT-963). The dialog stages every
 * tick and sends them together, so a refused change never leaves half the panel applied — and
 * the "every area keeps at least one applied metric" rule is checked against the state the
 * save lands on, which lets one save swap the last metric in an area for another one.
 */
export async function setAppliedMetrics(input: {
  changes: AppliedMetricChange[];
  project_ids: string[];
  session: SessionScope;
}): Promise<{ changes: AppliedMetricChange[]; project_ids: string[] }> {
  const { changes, project_ids, session } = input;
  if (project_ids.length === 0) throw new PmError('VALIDATION', 'Select at least one project');
  if (changes.length === 0) throw new PmError('VALIDATION', 'Select at least one metric to change');
  const metric_ids = [...new Set(changes.map((c) => c.metric_id))];
  if (metric_ids.length !== changes.length)
    throw new PmError('VALIDATION', 'Each metric can only be changed once per save');

  // Same manage gate as Manual KPI input (assertProjectManageable) — PMO/BOD with tenant-wide
  // manage pass every check in one query; an EM/TL only manages projects they own.
  for (const project_id of project_ids) {
    await assertProjectManageable(project_id, session);
  }

  const metricRows = await pmDb()
    .select({
      id: kpiNormMetric.id,
      name: kpiNormMetric.name,
      category: kpiNormMetric.category,
    })
    .from(kpiNormMetric)
    .where(
      and(inArray(kpiNormMetric.id, metric_ids), tenantScoped(kpiNormMetric.tenant_id, session)),
    );
  const metricById = new Map(metricRows.map((m) => [m.id, m]));
  const metricOf = (metric_id: string) => {
    const metric = metricById.get(metric_id);
    if (!metric) throw new PmError('NOT_FOUND', `metric ${metric_id} not found`);
    return metric;
  };
  for (const id of metric_ids) metricOf(id);

  const turningOn = changes.filter((c) => c.applied);
  const turningOff = changes.filter((c) => !c.applied);
  const turningOffIds = turningOff.map((c) => c.metric_id);

  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const offCategories = [...new Set(turningOff.map((c) => metricOf(c.metric_id).category))];
      if (offCategories.length > 0) {
        const categoryRows = await tx
          .select({ id: kpiNormMetric.id, category: kpiNormMetric.category })
          .from(kpiNormMetric)
          .where(
            and(
              tenantScoped(kpiNormMetric.tenant_id, session),
              inArray(kpiNormMetric.category, offCategories),
            ),
          );
        const categoryOfMetric = new Map(categoryRows.map((r) => [r.id, r.category]));

        // FOR UPDATE serialises two saves racing to empty the same area — the loser re-reads
        // the winner's committed rows before its own check runs.
        const inCategory = await tx
          .select({
            project_id: kpiAppliedMetric.project_id,
            metric_id: kpiAppliedMetric.metric_id,
          })
          .from(kpiAppliedMetric)
          .where(
            and(
              eq(kpiAppliedMetric.tenant_id, session.tenant_id),
              inArray(kpiAppliedMetric.project_id, project_ids),
              inArray(kpiAppliedMetric.metric_id, [...categoryOfMetric.keys()]),
            ),
          )
          .for('update');

        const appliedNow = new Map<string, Set<string>>();
        for (const r of inCategory) {
          const key = `${r.project_id}:${categoryOfMetric.get(r.metric_id)}`;
          const set = appliedNow.get(key) ?? new Set<string>();
          set.add(r.metric_id);
          appliedNow.set(key, set);
        }

        for (const category of offCategories) {
          const addedHere = turningOn
            .filter((c) => metricOf(c.metric_id).category === category)
            .map((c) => c.metric_id);
          const empty_project_ids = project_ids.filter((project_id) => {
            const before = appliedNow.get(`${project_id}:${category}`);
            if (!before || before.size === 0) return false;
            const after = new Set([...before, ...addedHere]);
            for (const id of turningOffIds) after.delete(id);
            return after.size === 0;
          });
          if (empty_project_ids.length === 0) continue;

          const blocking = turningOff.filter((c) => metricOf(c.metric_id).category === category);
          const names = blocking.map((c) => metricOf(c.metric_id).name);
          const label = CATEGORY_LABEL[category] ?? category;
          throw new PmError(
            'VALIDATION',
            `Cannot turn off ${names.join(' and ')} — ${
              names.length > 1 ? 'they are the last' : 'it is the last'
            } ${label} metric${names.length > 1 ? 's' : ''} applied to ${
              empty_project_ids.length > 1
                ? `${empty_project_ids.length} of the selected projects`
                : 'this project'
            }. Every area needs at least one applied metric.`,
            { category, empty_project_ids, metric_ids: blocking.map((c) => c.metric_id) },
          );
        }

        await tx
          .delete(kpiAppliedMetric)
          .where(
            and(
              eq(kpiAppliedMetric.tenant_id, session.tenant_id),
              inArray(kpiAppliedMetric.project_id, project_ids),
              inArray(kpiAppliedMetric.metric_id, turningOffIds),
            ),
          );
      }

      if (turningOn.length > 0) {
        await tx
          .insert(kpiAppliedMetric)
          .values(
            turningOn.flatMap((c) =>
              project_ids.map((project_id) => ({
                tenant_id: session.tenant_id,
                project_id,
                metric_id: c.metric_id,
                applied_by: session.user_id,
              })),
            ),
          )
          .onConflictDoUpdate({
            target: [
              kpiAppliedMetric.tenant_id,
              kpiAppliedMetric.project_id,
              kpiAppliedMetric.metric_id,
            ],
            set: { applied_by: session.user_id },
          });
      }

      const week = getCurrentIsoWeek();
      if (isWeekEditable(week.iso_year, week.iso_week)) {
        for (const metric_id of turningOffIds) {
          await unstampBaselineWeek(tx, session, project_ids, metric_id, week);
        }
        if (turningOffIds.length > 0) {
          await tx.delete(kpiRecordEntry).where(
            and(
              eq(kpiRecordEntry.tenant_id, session.tenant_id),
              inArray(kpiRecordEntry.metric_id, turningOffIds),
              inArray(
                kpiRecordEntry.record_id,
                tx
                  .select({ id: kpiRecord.id })
                  .from(kpiRecord)
                  .where(
                    and(
                      eq(kpiRecord.tenant_id, session.tenant_id),
                      inArray(kpiRecord.project_id, project_ids),
                      eq(kpiRecord.iso_year, week.iso_year),
                      eq(kpiRecord.iso_week, week.iso_week),
                    ),
                  ),
              ),
            ),
          );
        }
        // Runs last so the stamp copies the state the save landed on, not the state it started
        // from — a metric removed above is no longer live and never gets re-frozen.
        if (turningOn.length > 0) await stampBaselineWeek(tx, session, project_ids, week);
      }

      for (const c of changes) {
        await emit({
          tenantId: session.tenant_id,
          aggregateType: 'pm.kpi_applied_metric',
          aggregateId: c.metric_id,
          eventType: PM_KPI_APPLIED_METRIC_CHANGED,
          eventVersion: 1,
          payload: {
            tenant_id: session.tenant_id,
            metric_id: c.metric_id,
            metric_name: metricOf(c.metric_id).name,
            applied: c.applied,
            project_ids,
            changed_by_user_id: session.user_id,
          },
        });
      }
    },
  );

  return { changes, project_ids };
}

export async function setAppliedMetric(
  input: SetAppliedMetricInput & { metric_id: string; session: SessionScope },
): Promise<{ metric_id: string; applied: boolean; project_ids: string[] }> {
  const { metric_id, applied, project_ids, session } = input;
  await setAppliedMetrics({ changes: [{ metric_id, applied }], project_ids, session });
  return { metric_id, applied, project_ids };
}

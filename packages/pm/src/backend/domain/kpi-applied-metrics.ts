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

export async function setAppliedMetric(
  input: SetAppliedMetricInput & { metric_id: string; session: SessionScope },
): Promise<{ metric_id: string; applied: boolean; project_ids: string[] }> {
  const { metric_id, applied, project_ids, session } = input;
  if (project_ids.length === 0) throw new PmError('VALIDATION', 'Select at least one project');

  // Same manage gate as Manual KPI input (assertProjectManageable) — PMO/BOD with tenant-wide
  // manage pass every check in one query; an EM/TL only manages projects they own.
  for (const project_id of project_ids) {
    await assertProjectManageable(project_id, session);
  }

  const [metric] = await pmDb()
    .select({
      id: kpiNormMetric.id,
      name: kpiNormMetric.name,
      tier: kpiNormMetric.tier,
      category: kpiNormMetric.category,
    })
    .from(kpiNormMetric)
    .where(and(eq(kpiNormMetric.id, metric_id), tenantScoped(kpiNormMetric.tenant_id, session)))
    .limit(1);
  if (!metric) throw new PmError('NOT_FOUND', `metric ${metric_id} not found`);

  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      if (applied) {
        await tx
          .insert(kpiAppliedMetric)
          .values(
            project_ids.map((project_id) => ({
              tenant_id: session.tenant_id,
              project_id,
              metric_id,
              applied_by: session.user_id,
            })),
          )
          .onConflictDoUpdate({
            target: [
              kpiAppliedMetric.tenant_id,
              kpiAppliedMetric.project_id,
              kpiAppliedMetric.metric_id,
            ],
            set: { applied_by: session.user_id },
          });
      } else {
        const categoryMetricIds = (
          await tx
            .select({ id: kpiNormMetric.id })
            .from(kpiNormMetric)
            .where(
              and(
                tenantScoped(kpiNormMetric.tenant_id, session),
                eq(kpiNormMetric.category, metric.category),
              ),
            )
        ).map((r) => r.id);

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
              inArray(kpiAppliedMetric.metric_id, categoryMetricIds),
            ),
          )
          .for('update');

        const projectsWithOther = new Set(
          inCategory.filter((r) => r.metric_id !== metric_id).map((r) => r.project_id),
        );
        const projectsWithThis = new Set(
          inCategory.filter((r) => r.metric_id === metric_id).map((r) => r.project_id),
        );
        const empty_project_ids = project_ids.filter(
          (id) => projectsWithThis.has(id) && !projectsWithOther.has(id),
        );
        if (empty_project_ids.length > 0) {
          const label = CATEGORY_LABEL[metric.category] ?? metric.category;
          throw new PmError(
            'VALIDATION',
            `Cannot turn off ${metric.name} — it is the last ${label} metric applied to ${
              empty_project_ids.length > 1
                ? `${empty_project_ids.length} of the selected projects`
                : 'this project'
            }. Every area needs at least one applied metric.`,
            { category: metric.category, empty_project_ids },
          );
        }

        await tx
          .delete(kpiAppliedMetric)
          .where(
            and(
              eq(kpiAppliedMetric.tenant_id, session.tenant_id),
              inArray(kpiAppliedMetric.project_id, project_ids),
              eq(kpiAppliedMetric.metric_id, metric_id),
            ),
          );
      }
      const week = getCurrentIsoWeek();
      if (isWeekEditable(week.iso_year, week.iso_week)) {
        if (applied) await stampBaselineWeek(tx, session, project_ids, week);
        else await unstampBaselineWeek(tx, session, project_ids, metric_id, week);
      }
      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'pm.kpi_applied_metric',
        aggregateId: metric_id,
        eventType: PM_KPI_APPLIED_METRIC_CHANGED,
        eventVersion: 1,
        payload: {
          tenant_id: session.tenant_id,
          metric_id,
          metric_name: metric.name,
          applied,
          project_ids,
          changed_by_user_id: session.user_id,
        },
      });
    },
  );

  return { metric_id, applied, project_ids };
}

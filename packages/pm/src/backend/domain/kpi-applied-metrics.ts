import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { SetAppliedMetricInput } from '../../contracts.ts';
import { PM_KPI_APPLIED_METRIC_CHANGED } from '../../events.ts';
import { pmDb } from '../db/client.ts';
import { kpiAppliedMetric, kpiNormMetric } from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';
import { assertProjectManageable } from './assert-project-manageable.ts';

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
}

/** Applied-metric coverage across a set of projects (functional-analysis.md §2d: Configure
 * metrics is per-project with a bulk project picker, not one tenant-wide set). Visible to
 * anyone who can read pm projects; `project_ids` should already be scoped to what the caller
 * can see (the picker only offers visible/manageable projects). */
export async function listAppliedMetrics(
  session: SessionScope,
  project_ids: string[],
): Promise<AppliedMetricCoverage[]> {
  requirePermission(session, 'pm.project.read');
  if (project_ids.length === 0) return [];

  const rows = await pmDb()
    .select({ metric_id: kpiAppliedMetric.metric_id })
    .from(kpiAppliedMetric)
    .where(
      and(
        tenantScoped(kpiAppliedMetric.tenant_id, session),
        inArray(kpiAppliedMetric.project_id, project_ids),
      ),
    );

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.metric_id, (counts.get(r.metric_id) ?? 0) + 1);
  return [...counts.entries()].map(([metric_id, applied_count]) => ({
    metric_id,
    applied_count,
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

  if (!applied) {
    const otherInCategory = await pmDb()
      .select({ project_id: kpiAppliedMetric.project_id })
      .from(kpiAppliedMetric)
      .innerJoin(
        kpiNormMetric,
        and(
          eq(kpiNormMetric.id, kpiAppliedMetric.metric_id),
          eq(kpiNormMetric.tenant_id, kpiAppliedMetric.tenant_id),
        ),
      )
      .where(
        and(
          tenantScoped(kpiAppliedMetric.tenant_id, session),
          inArray(kpiAppliedMetric.project_id, project_ids),
          eq(kpiNormMetric.category, metric.category),
          ne(kpiAppliedMetric.metric_id, metric_id),
        ),
      );
    const projectsWithOther = new Set(otherInCategory.map((r) => r.project_id));
    const empty_project_ids = project_ids.filter((id) => !projectsWithOther.has(id));
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
  }

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
          .onConflictDoNothing({
            target: [
              kpiAppliedMetric.tenant_id,
              kpiAppliedMetric.project_id,
              kpiAppliedMetric.metric_id,
            ],
          });
      } else {
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

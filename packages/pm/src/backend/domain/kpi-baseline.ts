import type { SessionScope } from '@seta/core';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, inArray } from 'drizzle-orm';
import { pmDb } from '../db/client.ts';
import { kpiAppliedMetric, kpiNormBaseline, kpiNormMetric } from '../db/schema.ts';
import type { BandCondition } from './kpi-norm-data.ts';

export type KpiCategory = 'quality' | 'cost_capacity' | 'delivery' | 'process';

/** A metric definition frozen for one (project, week) — everything colour computation and
 * the input form need, copied by value from the catalog. */
export interface BaselineDef {
  project_id: string;
  metric_id: string;
  metric_version: number;
  category: KpiCategory;
  tier: 'core' | 'extended';
  name: string;
  formula_label: string;
  component_count: 1 | 2;
  component_1_label: string;
  component_2_label: string | null;
  component_1_integer: boolean;
  component_2_integer: boolean;
  component_1_min: number | null;
  component_1_max: number | null;
  is_share: boolean;
  green_band: BandCondition;
  yellow_band: BandCondition;
  red_band: BandCondition;
  insight: string | null;
  sort_order: number;
}

export interface WeekKey {
  iso_year: number;
  iso_week: number;
}

export const baselineKey = (project_id: string, w: WeekKey): string =>
  `${project_id}:${w.iso_year}:${w.iso_week}`;

/**
 * NORM week baseline (FUT-593), lazily ensured: the first time a (project, week) is touched
 * through any route, the live definitions of that project's applied metrics are copied BY
 * VALUE into `kpi_norm_baseline`; every later read of that week uses the copy, so a catalog
 * change published mid-week only reaches weeks that have not been touched yet.
 *
 * Two deliberate semantics:
 * - The APPLIED SET stays live — a metric applied mid-week is appended to the baseline at
 *   that moment (frozen from then on), so "apply, then measure the same week" still works;
 *   a metric un-applied mid-week keeps its baseline row but drops out of the returned defs.
 * - "Week start" is therefore "first touch": for a week in active use that is Monday; for
 *   never-touched historical weeks the copy is made from the current catalog (best
 *   available — the catalog kept no history before baselines existed).
 */
export async function ensureBaselineDefs(
  session: SessionScope,
  project_ids: string[],
  weeks: WeekKey[],
): Promise<Map<string, BaselineDef[]>> {
  const result = new Map<string, BaselineDef[]>();
  if (project_ids.length === 0 || weeks.length === 0) return result;

  // Live applied defs per project — the copy source for baseline gaps.
  const liveRows = await pmDb()
    .select({
      project_id: kpiAppliedMetric.project_id,
      metric_id: kpiNormMetric.id,
      metric_version: kpiNormMetric.version,
      category: kpiNormMetric.category,
      tier: kpiNormMetric.tier,
      name: kpiNormMetric.name,
      formula_label: kpiNormMetric.formula_label,
      component_count: kpiNormMetric.component_count,
      component_1_label: kpiNormMetric.component_1_label,
      component_2_label: kpiNormMetric.component_2_label,
      component_1_integer: kpiNormMetric.component_1_integer,
      component_2_integer: kpiNormMetric.component_2_integer,
      component_1_min: kpiNormMetric.component_1_min,
      component_1_max: kpiNormMetric.component_1_max,
      is_share: kpiNormMetric.is_share,
      green_band: kpiNormMetric.green_band,
      yellow_band: kpiNormMetric.yellow_band,
      red_band: kpiNormMetric.red_band,
      insight: kpiNormMetric.insight,
      sort_order: kpiNormMetric.sort_order,
    })
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
      ),
    );
  const liveByProject = new Map<string, typeof liveRows>();
  for (const r of liveRows) {
    const list = liveByProject.get(r.project_id) ?? [];
    list.push(r);
    liveByProject.set(r.project_id, list);
  }

  const iso_years = [...new Set(weeks.map((w) => w.iso_year))];
  const iso_weeks = [...new Set(weeks.map((w) => w.iso_week))];
  const baselineRows = await pmDb()
    .select()
    .from(kpiNormBaseline)
    .where(
      and(
        tenantScoped(kpiNormBaseline.tenant_id, session),
        inArray(kpiNormBaseline.project_id, project_ids),
        inArray(kpiNormBaseline.iso_year, iso_years),
        inArray(kpiNormBaseline.iso_week, iso_weeks),
      ),
    );
  const baselineByKey = new Map<string, typeof baselineRows>();
  for (const r of baselineRows) {
    const key = baselineKey(r.project_id, r);
    const list = baselineByKey.get(key) ?? [];
    list.push(r);
    baselineByKey.set(key, list);
  }

  // Freeze what's missing: applied metrics with no baseline row for that week yet.
  const inserts: (typeof kpiNormBaseline.$inferInsert)[] = [];
  for (const project_id of project_ids) {
    const live = liveByProject.get(project_id) ?? [];
    for (const w of weeks) {
      const existing = new Set(
        (baselineByKey.get(baselineKey(project_id, w)) ?? []).map((r) => r.metric_id),
      );
      for (const def of live) {
        if (existing.has(def.metric_id)) continue;
        inserts.push({
          tenant_id: session.tenant_id,
          project_id,
          iso_year: w.iso_year,
          iso_week: w.iso_week,
          metric_id: def.metric_id,
          metric_version: def.metric_version,
          category: def.category,
          tier: def.tier,
          name: def.name,
          formula_label: def.formula_label,
          component_count: def.component_count,
          component_1_label: def.component_1_label,
          component_2_label: def.component_2_label,
          component_1_integer: def.component_1_integer,
          component_2_integer: def.component_2_integer,
          component_1_min: def.component_1_min,
          component_1_max: def.component_1_max,
          is_share: def.is_share,
          green_band: def.green_band,
          yellow_band: def.yellow_band,
          red_band: def.red_band,
          insight: def.insight,
          sort_order: def.sort_order,
        });
      }
    }
  }
  if (inserts.length > 0) {
    // Concurrent first touches race benignly — the unique index keeps one copy.
    await pmDb().insert(kpiNormBaseline).values(inserts).onConflictDoNothing();
    const fresh = await pmDb()
      .select()
      .from(kpiNormBaseline)
      .where(
        and(
          tenantScoped(kpiNormBaseline.tenant_id, session),
          inArray(kpiNormBaseline.project_id, project_ids),
          inArray(kpiNormBaseline.iso_year, iso_years),
          inArray(kpiNormBaseline.iso_week, iso_weeks),
        ),
      );
    baselineByKey.clear();
    for (const r of fresh) {
      const key = baselineKey(r.project_id, r);
      const list = baselineByKey.get(key) ?? [];
      list.push(r);
      baselineByKey.set(key, list);
    }
  }

  // Returned defs = the week's frozen definitions, filtered to the LIVE applied set.
  for (const project_id of project_ids) {
    const appliedIds = new Set((liveByProject.get(project_id) ?? []).map((r) => r.metric_id));
    for (const w of weeks) {
      const rows = (baselineByKey.get(baselineKey(project_id, w)) ?? [])
        .filter((r) => appliedIds.has(r.metric_id))
        .sort((a, b) => a.sort_order - b.sort_order);
      result.set(
        baselineKey(project_id, w),
        rows.map((r) => ({
          project_id: r.project_id,
          metric_id: r.metric_id,
          metric_version: r.metric_version,
          category: r.category as KpiCategory,
          tier: r.tier as 'core' | 'extended',
          name: r.name,
          formula_label: r.formula_label,
          component_count: r.component_count as 1 | 2,
          component_1_label: r.component_1_label,
          component_2_label: r.component_2_label,
          component_1_integer: r.component_1_integer,
          component_2_integer: r.component_2_integer,
          component_1_min: r.component_1_min === null ? null : Number(r.component_1_min),
          component_1_max: r.component_1_max === null ? null : Number(r.component_1_max),
          is_share: r.is_share,
          green_band: r.green_band as BandCondition,
          yellow_band: r.yellow_band as BandCondition,
          red_band: r.red_band as BandCondition,
          insight: r.insight,
          sort_order: r.sort_order,
        })),
      );
    }
  }
  return result;
}

import type { SessionScope } from '@seta/core';
import type { NodeTx } from '@seta/shared-db';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { pmDb } from '../db/client.ts';
import { kpiAppliedMetric, kpiNormBaseline, kpiNormMetric } from '../db/schema.ts';
import { isWeekEditable } from './iso-week.ts';
import type { BandCondition } from './kpi-norm-data.ts';

type BaselineDb = Pick<NodeTx, 'select' | 'insert' | 'delete'>;

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

const LIVE_DEF_COLUMNS = {
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
};

function liveAppliedDefs(db: BaselineDb, session: SessionScope, project_ids: string[]) {
  return db
    .select(LIVE_DEF_COLUMNS)
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
}

type LiveDef = Awaited<ReturnType<typeof liveAppliedDefs>>[number];

function toBaselineRow(
  def: LiveDef,
  tenant_id: string,
  w: WeekKey,
): typeof kpiNormBaseline.$inferInsert {
  return { ...def, tenant_id, iso_year: w.iso_year, iso_week: w.iso_week };
}

export async function ensureBaselineDefs(
  session: SessionScope,
  project_ids: string[],
  weeks: WeekKey[],
): Promise<Map<string, BaselineDef[]>> {
  const result = new Map<string, BaselineDef[]>();
  if (project_ids.length === 0 || weeks.length === 0) return result;

  const liveRows = await liveAppliedDefs(pmDb(), session, project_ids);
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

  const inserts: (typeof kpiNormBaseline.$inferInsert)[] = [];
  const prunes: { project_id: string; week: WeekKey; keep: string[] }[] = [];
  for (const project_id of project_ids) {
    const live = liveByProject.get(project_id) ?? [];
    for (const w of weeks) {
      const rows = baselineByKey.get(baselineKey(project_id, w)) ?? [];
      if (!isWeekEditable(w.iso_year, w.iso_week)) {
        if (rows.length === 0) {
          for (const def of live) inserts.push(toBaselineRow(def, session.tenant_id, w));
        }
        continue;
      }
      const frozen = new Set(rows.map((r) => r.metric_id));
      for (const def of live) {
        if (!frozen.has(def.metric_id)) inserts.push(toBaselineRow(def, session.tenant_id, w));
      }
      const keep = live.map((d) => d.metric_id);
      if (rows.some((r) => !keep.includes(r.metric_id))) prunes.push({ project_id, week: w, keep });
    }
  }
  for (const p of prunes) {
    await pmDb()
      .delete(kpiNormBaseline)
      .where(
        and(
          eq(kpiNormBaseline.tenant_id, session.tenant_id),
          eq(kpiNormBaseline.project_id, p.project_id),
          eq(kpiNormBaseline.iso_year, p.week.iso_year),
          eq(kpiNormBaseline.iso_week, p.week.iso_week),
          ...(p.keep.length > 0 ? [notInArray(kpiNormBaseline.metric_id, p.keep)] : []),
        ),
      );
  }
  if (inserts.length > 0 || prunes.length > 0) {
    // Concurrent first touches race benignly — the unique index keeps one copy.
    if (inserts.length > 0)
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

  for (const project_id of project_ids) {
    for (const w of weeks) {
      const rows = (baselineByKey.get(baselineKey(project_id, w)) ?? []).sort(
        (a, b) => a.sort_order - b.sort_order,
      );
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

export async function stampBaselineWeek(
  db: BaselineDb,
  session: SessionScope,
  project_ids: string[],
  week: WeekKey,
): Promise<void> {
  if (project_ids.length === 0) return;
  const defs = await liveAppliedDefs(db, session, project_ids);
  if (defs.length === 0) return;
  await db
    .insert(kpiNormBaseline)
    .values(defs.map((d) => toBaselineRow(d, session.tenant_id, week)))
    .onConflictDoNothing();
}

export async function unstampBaselineWeek(
  db: BaselineDb,
  session: SessionScope,
  project_ids: string[],
  metric_id: string,
  week: WeekKey,
): Promise<void> {
  if (project_ids.length === 0) return;
  await db
    .delete(kpiNormBaseline)
    .where(
      and(
        eq(kpiNormBaseline.tenant_id, session.tenant_id),
        inArray(kpiNormBaseline.project_id, project_ids),
        eq(kpiNormBaseline.iso_year, week.iso_year),
        eq(kpiNormBaseline.iso_week, week.iso_week),
        eq(kpiNormBaseline.metric_id, metric_id),
      ),
    );
}

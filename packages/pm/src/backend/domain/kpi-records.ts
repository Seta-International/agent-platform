import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  computeRecordCategoryColour,
  computeRecordOverallColour,
  incompleteRecordMetrics,
  type KpiRecordColour,
  type UpsertKpiRecordInput as UpsertKpiRecordInputContract,
  validateKpiEntry,
} from '../../contracts.ts';
import { PM_KPI_RECORD_SAVED } from '../../events.ts';
import { pmDb } from '../db/client.ts';
import {
  account,
  kpiRecord,
  kpiRecordEntry,
  LIVE_PROJECT_STATUSES,
  project,
} from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';
import { assertProjectReportable } from './assert-project-reportable.ts';
import { baselineKey, ensureBaselineDefs } from './kpi-baseline.ts';
import {
  computeCategoryHealth,
  computeEntryStatus,
  computeOverallHealth,
  computeScoredValue,
  kpiValuePrecision,
  type RagStatus,
} from './kpi-health.ts';
import type { BandCondition } from './kpi-norm-data.ts';
import {
  buildProjectManageFlag,
  buildProjectReadFlag,
  buildProjectReporterFlag,
  buildProjectScope,
} from './scope.ts';
import { assertWeekEditable, assignedProjectIdsAsOf } from './weekly-reports.ts';

type KpiCategory = 'quality' | 'cost_capacity' | 'delivery' | 'process';
const CATEGORIES: readonly KpiCategory[] = ['quality', 'cost_capacity', 'delivery', 'process'];

interface AppliedMetricDef {
  metric_id: string;
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
}

function precisionOf(def: AppliedMetricDef): number {
  return kpiValuePrecision(def.green_band, def.yellow_band, def.red_band);
}

function statusOf(def: AppliedMetricDef, value: number | null): RagStatus | null {
  return computeEntryStatus(value, def.green_band, def.yellow_band, def.red_band);
}

function bandFor(def: AppliedMetricDef, status: RagStatus): BandCondition {
  return status === 'green' ? def.green_band : status === 'yellow' ? def.yellow_band : def.red_band;
}

function categoryHealths(
  defsById: Map<string, AppliedMetricDef>,
  entries: { metric_id: string; status: RagStatus | null }[],
): Record<KpiCategory, RagStatus | null> {
  const byCategory: Record<KpiCategory, RagStatus[]> = {
    quality: [],
    cost_capacity: [],
    delivery: [],
    process: [],
  };
  for (const e of entries) {
    if (e.status === null) continue;
    const def = defsById.get(e.metric_id);
    if (!def) continue;
    byCategory[def.category].push(e.status);
  }
  return {
    quality: computeCategoryHealth(byCategory.quality),
    cost_capacity: computeCategoryHealth(byCategory.cost_capacity),
    delivery: computeCategoryHealth(byCategory.delivery),
    process: computeCategoryHealth(byCategory.process),
  };
}

function categoryColours(
  defs: readonly { metric_id: string; category: KpiCategory }[],
  statusOf: (metric_id: string) => RagStatus | null,
): Record<KpiCategory, KpiRecordColour | null> {
  const byCategory: Record<KpiCategory, (RagStatus | null)[]> = {
    quality: [],
    cost_capacity: [],
    delivery: [],
    process: [],
  };
  for (const def of defs) byCategory[def.category].push(statusOf(def.metric_id));
  return {
    quality: computeRecordCategoryColour(byCategory.quality),
    cost_capacity: computeRecordCategoryColour(byCategory.cost_capacity),
    delivery: computeRecordCategoryColour(byCategory.delivery),
    process: computeRecordCategoryColour(byCategory.process),
  };
}

const INCOMPLETE_NAMES_SHOWN = 5;

function assertNoUnassessedMetric(
  defs: readonly { metric_id: string; name: string }[],
  statusOf: (metric_id: string) => RagStatus | null,
): void {
  if (defs.length === 0) {
    throw new PmError('VALIDATION', 'No KPI metric is applied to this project yet');
  }
  const missing = incompleteRecordMetrics(defs, (d) => statusOf(d.metric_id));
  if (missing.length === 0) return;
  const shown = missing.slice(0, INCOMPLETE_NAMES_SHOWN).join(', ');
  const rest = missing.length - INCOMPLETE_NAMES_SHOWN;
  throw new PmError(
    'VALIDATION',
    `Every applied metric needs its figures before saving — still missing: ${shown}${
      rest > 0 ? ` (+${rest} more)` : ''
    }`,
  );
}

export interface KpiExplorerMetricCell {
  value: number | null;
  status: RagStatus | null;
  band: BandCondition | null;
}

export interface KpiExplorerMetricDef {
  metric_id: string;
  category: KpiCategory;
  name: string;
  component_count: 1 | 2;
  green_band: BandCondition;
}

export interface KpiExplorerRow {
  project_id: string;
  project_name: string;
  account_id: string;
  account_name: string;
  record_id: string | null;
  iso_year: number;
  iso_week: number;
  overall_health: RagStatus | null;
  category_health: Record<KpiCategory, RagStatus | null>;
  metrics: Record<string, KpiExplorerMetricCell>;
  can_manage: boolean;
  can_report: boolean;
}

export interface KpiExplorerResult {
  rows: KpiExplorerRow[];
  /** Union of every metric applied to any project in `rows` — since Configure metrics is
   * per-project, different projects can have different applied sets; the frontend builds one
   * shared column list from this rather than assuming a single tenant-wide set. */
  applied_metric_ids: string[];
  metrics: KpiExplorerMetricDef[];
}

export async function listKpiExplorer(input: {
  iso_year: number;
  iso_week: number;
  account_id?: string;
  project_id?: string;
  session: SessionScope;
}): Promise<KpiExplorerResult> {
  const { iso_year, iso_week, session } = input;
  requirePermission(session, 'pm.project.read');

  const conds = [
    tenantScoped(project.tenant_id, session),
    isNull(project.deleted_at),
    inArray(project.status, LIVE_PROJECT_STATUSES),
  ];
  if (input.project_id) conds.push(eq(project.id, input.project_id));
  if (input.account_id) conds.push(eq(project.account_id, input.account_id));
  const scope = buildProjectScope(session);

  let projectRows = await pmDb()
    .select({
      project_id: project.id,
      project_name: project.name,
      account_id: project.account_id,
      account_name: account.name,
      can_manage: buildProjectManageFlag(session),
      can_report: buildProjectReporterFlag(session),
      live_readable: buildProjectReadFlag(session),
    })
    .from(project)
    .innerJoin(account, eq(account.id, project.account_id))
    .where(and(...conds))
    .orderBy(account.name, project.name);
  if (scope && projectRows.length > 0) {
    const assigned = await assignedProjectIdsAsOf(
      projectRows.map((p) => p.project_id),
      iso_year,
      iso_week,
      session,
    );
    projectRows = projectRows.filter((p) => p.live_readable || assigned.has(p.project_id));
  }
  if (projectRows.length === 0) return { rows: [], applied_metric_ids: [], metrics: [] };

  const projectIds = projectRows.map((p) => p.project_id);
  // FUT-593: the Explorer measures each week against that week's frozen baseline — union
  // the per-project baseline defs into the shared column set (dedupe keeps first, order by
  // sort_order within each project like the live loader did).
  const defsByKey = await ensureBaselineDefs(session, projectIds, [{ iso_year, iso_week }]);
  const seenDefIds = new Set<string>();
  const defs: AppliedMetricDef[] = [];
  for (const p of projectIds) {
    for (const d of defsByKey.get(baselineKey(p, { iso_year, iso_week })) ?? []) {
      if (seenDefIds.has(d.metric_id)) continue;
      seenDefIds.add(d.metric_id);
      defs.push(d);
    }
  }

  const recordRows = await pmDb()
    .select({
      record_id: kpiRecord.id,
      project_id: kpiRecord.project_id,
    })
    .from(kpiRecord)
    .where(
      and(
        tenantScoped(kpiRecord.tenant_id, session),
        inArray(kpiRecord.project_id, projectIds),
        eq(kpiRecord.iso_year, iso_year),
        eq(kpiRecord.iso_week, iso_week),
      ),
    );
  const recordByProject = new Map(recordRows.map((r) => [r.project_id, r.record_id]));
  const recordIds = recordRows.map((r) => r.record_id);

  const entryRows = recordIds.length
    ? await pmDb()
        .select({
          record_id: kpiRecordEntry.record_id,
          metric_id: kpiRecordEntry.metric_id,
          computed_value: kpiRecordEntry.computed_value,
          status: kpiRecordEntry.status,
        })
        .from(kpiRecordEntry)
        .where(
          and(
            tenantScoped(kpiRecordEntry.tenant_id, session),
            inArray(kpiRecordEntry.record_id, recordIds),
          ),
        )
    : [];
  const entriesByRecord = new Map<
    string,
    { metric_id: string; computed_value: number | null; status: RagStatus | null }[]
  >();
  for (const e of entryRows) {
    const list = entriesByRecord.get(e.record_id) ?? [];
    list.push({
      metric_id: e.metric_id,
      computed_value: e.computed_value === null ? null : Number(e.computed_value),
      status: e.status as RagStatus | null,
    });
    entriesByRecord.set(e.record_id, list);
  }

  const rows = projectRows.map((p) => {
    const record_id = recordByProject.get(p.project_id) ?? null;
    const entries = record_id ? (entriesByRecord.get(record_id) ?? []) : [];
    const projectDefs = defsByKey.get(baselineKey(p.project_id, { iso_year, iso_week })) ?? [];
    const category_health = categoryHealths(
      new Map(projectDefs.map((d) => [d.metric_id, d])),
      entries,
    );
    const overall_health = computeOverallHealth(CATEGORIES.map((c) => category_health[c]));
    const entryByMetric = new Map(entries.map((e) => [e.metric_id, e]));
    const metrics: Record<string, KpiExplorerMetricCell> = {};
    for (const def of projectDefs) {
      const e = entryByMetric.get(def.metric_id);
      const status = e?.status ?? null;
      metrics[def.metric_id] = {
        value: e?.computed_value ?? null,
        status,
        band: status === null ? null : bandFor(def, status),
      };
    }
    return {
      project_id: p.project_id,
      project_name: p.project_name,
      account_id: p.account_id,
      account_name: p.account_name,
      metrics,
      record_id,
      iso_year,
      iso_week,
      overall_health,
      category_health,
      can_manage: p.can_manage,
      can_report: p.can_report,
    };
  });
  return {
    rows,
    applied_metric_ids: defs.map((d) => d.metric_id),
    metrics: defs.map((d) => ({
      metric_id: d.metric_id,
      category: d.category,
      name: d.name,
      component_count: d.component_count,
      green_band: d.green_band,
    })),
  };
}

export interface KpiRecordMetricRow extends AppliedMetricDef {
  component_1_value: number | null;
  component_2_value: number | null;
  computed_value: number | null;
  status: RagStatus | null;
}

export interface KpiRecordDetail {
  record_id: string | null;
  project_id: string;
  iso_year: number;
  iso_week: number;
  version: number | null;
  metrics: KpiRecordMetricRow[];
  category_health: Record<KpiCategory, KpiRecordColour | null>;
  overall_health: KpiRecordColour | null;
}

export async function getKpiRecord(input: {
  project_id: string;
  iso_year: number;
  iso_week: number;
  session: SessionScope;
}): Promise<KpiRecordDetail> {
  const { project_id, iso_year, iso_week, session } = input;
  requirePermission(session, 'pm.project.read');

  const visibilityConds = [
    eq(project.id, project_id),
    tenantScoped(project.tenant_id, session),
    isNull(project.deleted_at),
  ];
  const scope = buildProjectScope(session);
  if (scope) visibilityConds.push(scope);
  const [visible] = await pmDb()
    .select({ id: project.id })
    .from(project)
    .where(and(...visibilityConds))
    .limit(1);
  if (!visible) throw new PmError('NOT_FOUND', `project ${project_id} not found`);

  // FUT-593: the input form shows the week's frozen definitions, not the live catalog.
  const defs =
    (await ensureBaselineDefs(session, [project_id], [{ iso_year, iso_week }])).get(
      baselineKey(project_id, { iso_year, iso_week }),
    ) ?? [];

  const [rec] = await pmDb()
    .select({ id: kpiRecord.id, version: kpiRecord.version })
    .from(kpiRecord)
    .where(
      and(
        tenantScoped(kpiRecord.tenant_id, session),
        eq(kpiRecord.project_id, project_id),
        eq(kpiRecord.iso_year, iso_year),
        eq(kpiRecord.iso_week, iso_week),
      ),
    )
    .limit(1);

  const entryRows = rec
    ? await pmDb()
        .select({
          metric_id: kpiRecordEntry.metric_id,
          component_1_value: kpiRecordEntry.component_1_value,
          component_2_value: kpiRecordEntry.component_2_value,
          computed_value: kpiRecordEntry.computed_value,
          status: kpiRecordEntry.status,
        })
        .from(kpiRecordEntry)
        .where(
          and(
            tenantScoped(kpiRecordEntry.tenant_id, session),
            eq(kpiRecordEntry.record_id, rec.id),
          ),
        )
    : [];
  const entryByMetric = new Map(entryRows.map((e) => [e.metric_id, e]));

  const metrics: KpiRecordMetricRow[] = defs.map((def) => {
    const e = entryByMetric.get(def.metric_id);
    return {
      ...def,
      component_1_value: e
        ? e.component_1_value === null
          ? null
          : Number(e.component_1_value)
        : null,
      component_2_value: e
        ? e.component_2_value === null
          ? null
          : Number(e.component_2_value)
        : null,
      computed_value: e ? (e.computed_value === null ? null : Number(e.computed_value)) : null,
      status: e ? (e.status as RagStatus | null) : null,
    };
  });

  const statusByMetric = new Map(metrics.map((m) => [m.metric_id, m.status]));
  const category_health = categoryColours(defs, (id) => statusByMetric.get(id) ?? null);
  const overall_health = computeRecordOverallColour(CATEGORIES.map((c) => category_health[c]));

  return {
    record_id: rec?.id ?? null,
    project_id,
    iso_year,
    iso_week,
    version: rec?.version ?? null,
    metrics,
    category_health,
    overall_health,
  };
}

export async function upsertKpiRecord(
  input: UpsertKpiRecordInputContract & { session: SessionScope },
): Promise<{ record_id: string; version: number; overall_health: RagStatus | null }> {
  const { project_id, iso_year, iso_week, expected_version, entries, session } = input;
  await assertProjectReportable(project_id, session);
  if (iso_week < 1 || iso_week > 53) {
    throw new PmError('VALIDATION', 'iso_week must be between 1 and 53');
  }
  // KPI records share the Epic 3 week gate with flags/reports — see assertWeekEditable.
  assertWeekEditable(iso_year, iso_week);

  // FUT-593: entry statuses are scored against the week's frozen baseline.
  const defs =
    (await ensureBaselineDefs(session, [project_id], [{ iso_year, iso_week }])).get(
      baselineKey(project_id, { iso_year, iso_week }),
    ) ?? [];
  const defsById = new Map(defs.map((d) => [d.metric_id, d]));

  for (const e of entries) {
    const def = defsById.get(e.metric_id);
    if (!def) continue;
    const issues = validateKpiEntry(def, e.component_1_value, e.component_2_value);
    const failure = issues.component_1 ?? issues.component_2;
    if (failure) {
      const box = issues.component_1 ? def.component_1_label : (def.component_2_label ?? '');
      throw new PmError('VALIDATION', `${def.name} — ${box}: ${failure}`);
    }
  }

  // Keep only entries for currently-applied metrics with at least component_1 filled — a
  // metric with nothing typed in isn't "attempted", so it isn't persisted at all.
  const attempted = entries.filter(
    (e) => defsById.has(e.metric_id) && e.component_1_value !== null,
  );
  const computed = attempted.map((e) => {
    const def = defsById.get(e.metric_id)!;
    const computed_value = computeScoredValue(
      def.component_count,
      e.component_1_value,
      e.component_2_value,
      precisionOf(def),
    );
    return {
      ...e,
      computed_value,
      status: statusOf(def, computed_value),
    };
  });
  const statusByMetric = new Map(computed.map((e) => [e.metric_id, e.status]));
  assertNoUnassessedMetric(defs, (id) => statusByMetric.get(id) ?? null);

  let result!: { record_id: string; version: number; overall_health: RagStatus | null };
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const [existing] = await tx
        .select({ id: kpiRecord.id, version: kpiRecord.version })
        .from(kpiRecord)
        .where(
          and(
            eq(kpiRecord.tenant_id, session.tenant_id),
            eq(kpiRecord.project_id, project_id),
            eq(kpiRecord.iso_year, iso_year),
            eq(kpiRecord.iso_week, iso_week),
          ),
        )
        .limit(1);

      if (existing && expected_version !== undefined) {
        if (expected_version === null) {
          throw new PmError('CONFLICT', 'another reporter created this record first', {
            current_version: existing.version,
          });
        }
        if (existing.version !== expected_version) {
          throw new PmError('CONFLICT', 'record was modified by someone else', {
            current_version: existing.version,
          });
        }
      }

      let record_id: string;
      let version: number;
      if (existing) {
        const [updated] = await tx
          .update(kpiRecord)
          .set({ version: existing.version + 1, updated_at: new Date() })
          .where(eq(kpiRecord.id, existing.id))
          .returning({ id: kpiRecord.id, version: kpiRecord.version });
        record_id = updated!.id;
        version = updated!.version;
      } else {
        const [created] = await tx
          .insert(kpiRecord)
          .values({
            tenant_id: session.tenant_id,
            project_id,
            iso_year,
            iso_week,
            created_by: session.user_id,
          })
          .returning({ id: kpiRecord.id, version: kpiRecord.version });
        record_id = created!.id;
        version = created!.version;
      }

      // Remove only entries the user is actually clearing: applied metrics that this save didn't
      // resubmit (component_1 blanked out, or the metric's since been unapplied — Configure
      // Metrics). Everything else is an UPSERT, not delete+recreate, so a metric whose value
      // didn't change keeps its row's id — a Weekly Report's metric_value.source_entry_id
      // pointing at it isn't needlessly nulled out on an unrelated save.
      const appliedMetricIds = defs.map((d) => d.metric_id);
      const submittedMetricIds = new Set(computed.map((e) => e.metric_id));
      const toRemove = appliedMetricIds.filter((id) => !submittedMetricIds.has(id));
      if (toRemove.length > 0) {
        await tx
          .delete(kpiRecordEntry)
          .where(
            and(
              eq(kpiRecordEntry.record_id, record_id),
              inArray(kpiRecordEntry.metric_id, toRemove),
            ),
          );
      }
      if (computed.length > 0) {
        await tx
          .insert(kpiRecordEntry)
          .values(
            computed.map((e) => ({
              tenant_id: session.tenant_id,
              record_id,
              metric_id: e.metric_id,
              component_1_value: e.component_1_value === null ? null : String(e.component_1_value),
              component_2_value: e.component_2_value === null ? null : String(e.component_2_value),
              computed_value: e.computed_value === null ? null : String(e.computed_value),
              status: e.status,
              source: 'manual' as const,
            })),
          )
          .onConflictDoUpdate({
            target: [kpiRecordEntry.tenant_id, kpiRecordEntry.record_id, kpiRecordEntry.metric_id],
            set: {
              component_1_value: sql`excluded.component_1_value`,
              component_2_value: sql`excluded.component_2_value`,
              computed_value: sql`excluded.computed_value`,
              status: sql`excluded.status`,
            },
          });
      }

      const category_health = categoryHealths(
        defsById,
        computed.map((e) => ({ metric_id: e.metric_id, status: e.status })),
      );
      const overall_health = computeOverallHealth(CATEGORIES.map((c) => category_health[c]));

      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'pm.kpi_record',
        aggregateId: record_id,
        eventType: PM_KPI_RECORD_SAVED,
        eventVersion: 1,
        payload: {
          record_id,
          tenant_id: session.tenant_id,
          project_id,
          iso_year,
          iso_week,
          overall_health,
        },
      });

      result = { record_id, version, overall_health };
    },
  );
  return result;
}

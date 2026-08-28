import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { tenantScoped } from '@seta/shared-rbac';
import { and, desc, eq, inArray, isNotNull, isNull, notExists, or, sql } from 'drizzle-orm';
import type {
  AddReportCommentInput,
  DiscardWeeklyReportInput,
  EnsureWeeklyReportInput,
  OverrideFlagInput,
  UpsertWeeklyReportInput,
} from '../../contracts.ts';
import { PM_FLAG_OVERRIDDEN, PM_WEEKLY_REPORT_SAVED } from '../../events.ts';
import { pmDb } from '../db/client.ts';
import {
  account,
  allocation,
  comment,
  flag,
  flagAuditEntry,
  kpiRecord,
  kpiRecordEntry,
  LIVE_PROJECT_STATUSES,
  metricValue,
  normSnapshot,
  personProjection,
  project,
  projectWeekRollup,
  report,
  reportRevision,
} from '../db/schema.ts';
import { PmError, requirePermission } from '../rbac.ts';
import { assertProjectReportable } from './assert-project-reportable.ts';
import { isoWeekRange, isWeekEditable } from './iso-week.ts';
import { baselineKey, ensureBaselineDefs } from './kpi-baseline.ts';
import {
  computeCategoryHealth,
  computeOhs,
  computePillarScore,
  pickWorstMetric,
  type RagStatus,
} from './kpi-health.ts';
import type { BandCondition } from './kpi-norm-data.ts';
import { getReportersAsOf } from './reporter-assignment.ts';
import {
  buildProjectManageFlag,
  buildProjectReadFlag,
  buildProjectReporterFlag,
  buildProjectScope,
} from './scope.ts';

type KpiCategory = 'quality' | 'cost_capacity' | 'delivery' | 'process';
const CATEGORIES: readonly KpiCategory[] = ['quality', 'cost_capacity', 'delivery', 'process'];

export type ReportColour = 'green' | 'yellow' | 'red' | 'gray';

// gray only ever enters via a manual override (nothing computes it); rank it between green and
// yellow so a gray override dampens but never hides a yellow/red pillar in the overall roll-up.
const COLOUR_RANK: Record<ReportColour, number> = { green: 0, gray: 1, yellow: 2, red: 3 };
function worstColour(colours: readonly (ReportColour | null)[]): ReportColour | null {
  const known = colours.filter((c): c is ReportColour => c !== null);
  if (known.length === 0) return null;
  return known.reduce((worst, c) => (COLOUR_RANK[c] > COLOUR_RANK[worst] ? c : worst));
}

// ── ISO week arithmetic (Dec 28 is always in the last ISO week of its year) ───────────────
function isoWeeksInYear(year: number): number {
  const d = new Date(Date.UTC(year, 11, 28));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

// FUT-590 AC1/AC4: which of these projects was the caller assigned to (owner/reporter) AS OF
// the given week — the temporal projection answers it; getReportersAsOf falls back to live
// project_access for projects the projection has never seen. Shared with KPI Explorer so
// every week-scoped screen answers visibility the same way.
export async function assignedProjectIdsAsOf(
  project_ids: string[],
  iso_year: number,
  iso_week: number,
  session: SessionScope,
): Promise<Set<string>> {
  const person = session.person_id;
  if (!person) return new Set();
  const reporters = await getReportersAsOf({ project_ids, iso_year, iso_week, session });
  return new Set(reporters.filter((r) => r.person_id === person).map((r) => r.project_id));
}

// Weekly-report edit window (Epic 3): flags are set for the CURRENT week only, and the week
// locks at Friday 17:00 Asia/Ho_Chi_Minh (UTC+7, no DST). Comments stay open after the lock.
/** Shared week gate (Epic 3): weekly data — flags, reports AND the KPI records they compute
 * from — is editable for the current week only, until Friday 17:00 VNT. Editing a past
 * week's KPIs would silently rewrite the live-computed history behind already-submitted
 * reports; late corrections need their own governed (audited) flow, not this path. */
export function assertWeekEditable(iso_year: number, iso_week: number): void {
  if (!isWeekEditable(iso_year, iso_week)) {
    throw new PmError(
      'VALIDATION',
      'Weekly data can only be edited for the current week, until Friday 5:00 PM (VNT)',
    );
  }
}

function previousIsoWeeks(
  iso_year: number,
  iso_week: number,
  count: number,
): { iso_year: number; iso_week: number }[] {
  const weeks = [{ iso_year, iso_week }];
  let y = iso_year;
  let w = iso_week;
  while (weeks.length < count) {
    if (w > 1) w -= 1;
    else {
      y -= 1;
      w = isoWeeksInYear(y);
    }
    weeks.push({ iso_year: y, iso_week: w });
  }
  return weeks;
}

// ── Per-project week computation (defs + entries → colours/stats) ─────────────────────────

interface ProjectDef {
  project_id: string;
  metric_id: string;
  category: KpiCategory;
  tier: 'core' | 'extended';
  name: string;
  sort_order: number;
  metric_version: number;
  component_count: 1 | 2;
  green_band: BandCondition;
  yellow_band: BandCondition;
  red_band: BandCondition;
}

interface EntryRow {
  entry_id: string;
  record_id: string;
  metric_id: string;
  computed_value: number | null;
  status: RagStatus | null;
}

export interface WeekStats {
  applied_count: number;
  measured_count: number;
  yellow_count: number;
  red_count: number;
  worst: {
    metric_id: string;
    name: string;
    computed_value: number | null;
    component_count: 1 | 2;
    green_band: BandCondition;
    status: RagStatus;
  } | null;
}

interface ProjectWeekComputation {
  category_colours: Record<KpiCategory, RagStatus | null>;
  overall_colour: RagStatus | null;
  stats: WeekStats;
  ohs: number;
}

function computeProjectWeek(defs: ProjectDef[], entries: EntryRow[]): ProjectWeekComputation {
  const entryByMetric = new Map(entries.map((e) => [e.metric_id, e]));
  const byCategory: Record<KpiCategory, RagStatus[]> = {
    quality: [],
    cost_capacity: [],
    delivery: [],
    process: [],
  };
  const coreByCategory: Record<KpiCategory, RagStatus[]> = {
    quality: [],
    cost_capacity: [],
    delivery: [],
    process: [],
  };
  let measured = 0;
  let yellow = 0;
  let red = 0;
  const rankable: (ProjectDef & { status: RagStatus; computed_value: number | null })[] = [];
  const sorted = [...defs].sort((a, b) => a.sort_order - b.sort_order);
  for (const def of sorted) {
    const entry = entryByMetric.get(def.metric_id);
    const status = entry?.status ?? null;
    if (status === null) continue;
    measured += 1;
    byCategory[def.category].push(status);
    if (def.tier === 'core') coreByCategory[def.category].push(status);
    if (status === 'yellow') yellow += 1;
    if (status === 'red') red += 1;
    rankable.push({ ...def, status, computed_value: entry?.computed_value ?? null });
  }
  const category_colours = {
    quality: computeCategoryHealth(byCategory.quality),
    cost_capacity: computeCategoryHealth(byCategory.cost_capacity),
    delivery: computeCategoryHealth(byCategory.delivery),
    process: computeCategoryHealth(byCategory.process),
  };
  const overall_colour = worstColour(
    CATEGORIES.map((c) => category_colours[c]),
  ) as RagStatus | null;
  const worstDef = pickWorstMetric(rankable);
  const ohs = computeOhs({
    quality: computePillarScore(coreByCategory.quality),
    cost_capacity: computePillarScore(coreByCategory.cost_capacity),
    delivery: computePillarScore(coreByCategory.delivery),
    process: computePillarScore(coreByCategory.process),
  });
  return {
    category_colours,
    overall_colour,
    stats: {
      applied_count: defs.length,
      measured_count: measured,
      yellow_count: yellow,
      red_count: red,
      worst: worstDef
        ? {
            metric_id: worstDef.metric_id,
            name: worstDef.name,
            computed_value: worstDef.computed_value,
            component_count: worstDef.component_count,
            green_band: worstDef.green_band,
            status: worstDef.status,
          }
        : null,
    },
    ohs,
  };
}

async function loadEntriesByProject(
  session: SessionScope,
  project_ids: string[],
  weeks: { iso_year: number; iso_week: number }[],
): Promise<Map<string, EntryRow[]>> {
  if (project_ids.length === 0 || weeks.length === 0) return new Map();
  const weekConds = weeks.map((w) =>
    and(eq(kpiRecord.iso_year, w.iso_year), eq(kpiRecord.iso_week, w.iso_week)),
  );
  const records = await pmDb()
    .select({
      record_id: kpiRecord.id,
      project_id: kpiRecord.project_id,
      iso_year: kpiRecord.iso_year,
      iso_week: kpiRecord.iso_week,
    })
    .from(kpiRecord)
    .where(
      and(
        tenantScoped(kpiRecord.tenant_id, session),
        inArray(kpiRecord.project_id, project_ids),
        or(...weekConds),
      ),
    );
  if (records.length === 0) return new Map();
  const recordMeta = new Map(records.map((r) => [r.record_id, r]));
  const entryRows = await pmDb()
    .select({
      entry_id: kpiRecordEntry.id,
      record_id: kpiRecordEntry.record_id,
      metric_id: kpiRecordEntry.metric_id,
      computed_value: kpiRecordEntry.computed_value,
      status: kpiRecordEntry.status,
    })
    .from(kpiRecordEntry)
    .where(
      and(
        tenantScoped(kpiRecordEntry.tenant_id, session),
        inArray(
          kpiRecordEntry.record_id,
          records.map((r) => r.record_id),
        ),
      ),
    );
  // Keyed by `${project_id}:${iso_year}:${iso_week}` so trend queries can span weeks.
  const map = new Map<string, EntryRow[]>();
  for (const e of entryRows) {
    const meta = recordMeta.get(e.record_id);
    if (!meta) continue;
    const key = `${meta.project_id}:${meta.iso_year}:${meta.iso_week}`;
    const list = map.get(key) ?? [];
    list.push({
      entry_id: e.entry_id,
      record_id: e.record_id,
      metric_id: e.metric_id,
      computed_value: e.computed_value === null ? null : Number(e.computed_value),
      status: e.status as RagStatus | null,
    });
    map.set(key, list);
  }
  return map;
}

async function loadNames(
  session: SessionScope,
  person_ids: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(person_ids.filter((id) => id))];
  if (ids.length === 0) return new Map();
  const rows = await pmDb()
    .select({ person_id: personProjection.person_id, full_name: personProjection.full_name })
    .from(personProjection)
    .where(
      and(
        tenantScoped(personProjection.tenant_id, session),
        inArray(personProjection.person_id, ids),
      ),
    );
  return new Map(rows.map((r) => [r.person_id, r.full_name]));
}

// ── List (card view) ────────────────────────────────────────────────────────────────────

// The three named norm metrics surfaced as the card/detail "delivery pulse" (util · predictability
// · CSS). Kept in one place so the list and the drill-down never drift.
const HEADLINE_METRIC_NAMES: [name: string, label: string][] = [
  ['Utilization Rate', 'util'],
  ['Release Predictability', 'predictability'],
  ['eNPS / CSS', 'CSS'],
];
export interface WeekMetric {
  metric_id: string;
  name: string;
  category: KpiCategory;
  computed_value: number | null;
  component_count: 1 | 2;
  green_band: BandCondition;
  status: RagStatus | null;
}

function buildWeekMetrics(defs: ProjectDef[], entries: EntryRow[]): WeekMetric[] {
  const entryByMetric = new Map(entries.map((e) => [e.metric_id, e]));
  return [...defs]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((def) => {
      const entry = entryByMetric.get(def.metric_id);
      return {
        metric_id: def.metric_id,
        name: def.name,
        category: def.category,
        computed_value: entry?.computed_value ?? null,
        component_count: def.component_count,
        green_band: def.green_band,
        status: entry?.status ?? null,
      };
    });
}

export interface HeadlineMetric {
  label: string;
  name: string;
  computed_value: number;
  component_count: 1 | 2;
  status: RagStatus | null;
}
function computeHeadlineMetrics(
  defs: { metric_id: string; name: string; component_count: 1 | 2 }[],
  entries: { metric_id: string; computed_value: number | null; status: RagStatus | null }[],
): HeadlineMetric[] {
  const defByName = new Map(defs.map((d) => [d.name, d]));
  return HEADLINE_METRIC_NAMES.flatMap(([name, label]) => {
    const def = defByName.get(name);
    if (!def) return [];
    const entry = entries.find((e) => e.metric_id === def.metric_id);
    if (!entry || entry.computed_value === null) return [];
    return [
      {
        label,
        name,
        computed_value: entry.computed_value,
        component_count: def.component_count,
        status: entry.status,
      },
    ];
  });
}

export interface WeeklyReportCard {
  project_id: string;
  project_name: string;
  account_id: string;
  account_name: string;
  pm_name: string | null;
  pmo_name: string | null;
  overall_colour: ReportColour | null;
  category_colours: Record<KpiCategory, ReportColour | null>;
  stats: WeekStats;
  /** People staffed this week vs the charter team size — the card's "Staffed X/Y". */
  staffed: number;
  team_size: number | null;
  /** Delivery pulse (util · predictability · CSS) — the week's measured values of three norm
   * metrics; a metric not measured this week is omitted. */
  headline_metrics: HeadlineMetric[];
  latest_summary: string | null;
  reporters: { reporter_id: string; name: string | null }[];
  report_count: number;
  can_manage: boolean;
  can_report: boolean;
  reported_by_me: boolean;
}

export async function listWeeklyReports(input: {
  iso_year: number;
  iso_week: number;
  account_id?: string;
  project_id?: string;
  session: SessionScope;
}): Promise<{ rows: WeeklyReportCard[] }> {
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
      pm_person_id: project.pm_person_id,
      pmo_person_id: project.pmo_person_id,
      team_size: project.team_size,
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
  if (projectRows.length === 0) return { rows: [] };
  const projectIds = projectRows.map((p) => p.project_id);

  const week = isoWeekRange(iso_year, iso_week);
  const [staffedRows, defsByKey, entriesByKey, flagRows, reportRows] = await Promise.all([
    // Staffed = distinct people with a live allocation overlapping the selected week — the same
    // rule the drill-down uses for "Staffed X/Y", aggregated per project in one pass.
    pmDb()
      .select({
        project_id: allocation.project_id,
        staffed: sql<number>`count(distinct ${allocation.person_id})::int`,
      })
      .from(allocation)
      .where(
        and(
          tenantScoped(allocation.tenant_id, session),
          inArray(allocation.project_id, projectIds),
          isNull(allocation.deleted_at),
          isNotNull(allocation.person_id),
          inArray(allocation.status, ['tentative', 'committed']),
          or(isNull(allocation.date_from), sql`${allocation.date_from} <= ${week.to}`),
          or(isNull(allocation.date_to), sql`${allocation.date_to} >= ${week.from}`),
        ),
      )
      .groupBy(allocation.project_id),
    // FUT-593: colours are measured against the week's frozen NORM baseline, never the
    // live catalog — a mid-week catalog change cannot move this list.
    ensureBaselineDefs(session, projectIds, [{ iso_year, iso_week }]),
    loadEntriesByProject(session, projectIds, [{ iso_year, iso_week }]),
    pmDb()
      .select({
        project_id: flag.project_id,
        category: flag.category,
        computed_colour: flag.computed_colour,
        final_colour: flag.final_colour,
      })
      .from(flag)
      .where(
        and(
          tenantScoped(flag.tenant_id, session),
          inArray(flag.project_id, projectIds),
          eq(flag.iso_year, iso_year),
          eq(flag.iso_week, iso_week),
        ),
      ),
    pmDb()
      .select({
        report_id: report.id,
        project_id: report.project_id,
        reporter_id: report.reporter_id,
        status: report.status,
        executive_summary: report.executive_summary,
        updated_at: report.updated_at,
      })
      .from(report)
      .where(
        and(
          tenantScoped(report.tenant_id, session),
          inArray(report.project_id, projectIds),
          eq(report.iso_year, iso_year),
          eq(report.iso_week, iso_week),
        ),
      )
      .orderBy(desc(report.updated_at)),
  ]);

  // Cards count PUBLISHED reports: submitted rows as-is; a drafting reporter still counts
  // through their latest published revision (the version everyone else keeps seeing) —
  // only never-published drafts are invisible (product rule, 2026-07-16).
  const listDraftIds = reportRows.filter((r) => r.status === 'draft').map((r) => r.report_id);
  const revisionSummaryByReport = new Map<string, string | null>();
  if (listDraftIds.length > 0) {
    const revisions = await pmDb()
      .select({
        report_id: reportRevision.report_id,
        executive_summary: reportRevision.executive_summary,
        created_at: reportRevision.created_at,
      })
      .from(reportRevision)
      .where(
        and(
          tenantScoped(reportRevision.tenant_id, session),
          inArray(reportRevision.report_id, listDraftIds),
        ),
      )
      .orderBy(desc(reportRevision.created_at));
    for (const rev of revisions) {
      if (!revisionSummaryByReport.has(rev.report_id)) {
        revisionSummaryByReport.set(rev.report_id, rev.executive_summary);
      }
    }
  }
  const publishedReportRows = reportRows.flatMap((r) => {
    if (r.status === 'submitted') return [r];
    if (!revisionSummaryByReport.has(r.report_id)) return [];
    return [{ ...r, executive_summary: revisionSummaryByReport.get(r.report_id) ?? null }];
  });

  const personIds = projectRows
    .flatMap((p) => [p.pm_person_id, p.pmo_person_id])
    .concat(reportRows.map((r) => r.reporter_id))
    .filter((id): id is string => id !== null);
  const names = await loadNames(session, personIds);

  const storedByProject = new Map<
    string,
    Map<KpiCategory, { computed: ReportColour | null; final: ReportColour | null }>
  >();
  for (const f of flagRows) {
    const m =
      storedByProject.get(f.project_id) ??
      new Map<KpiCategory, { computed: ReportColour | null; final: ReportColour | null }>();
    m.set(f.category as KpiCategory, {
      computed: f.computed_colour as ReportColour | null,
      final: f.final_colour as ReportColour | null,
    });
    storedByProject.set(f.project_id, m);
  }
  const reportsByProject = new Map<string, typeof publishedReportRows>();
  for (const r of publishedReportRows) {
    const list = reportsByProject.get(r.project_id) ?? [];
    list.push(r);
    reportsByProject.set(r.project_id, list);
  }

  const myReportProjects = new Set(
    session.person_id === null
      ? []
      : reportRows.filter((r) => r.reporter_id === session.person_id).map((r) => r.project_id),
  );

  const staffedByProject = new Map(staffedRows.map((r) => [r.project_id, r.staffed]));
  const rows = projectRows.map((p) => {
    const defs = defsByKey.get(baselineKey(p.project_id, { iso_year, iso_week })) ?? [];
    const entries = entriesByKey.get(`${p.project_id}:${iso_year}:${iso_week}`) ?? [];
    const computation = computeProjectWeek(defs, entries);
    const stored = storedByProject.get(p.project_id);
    const category_colours = Object.fromEntries(
      CATEGORIES.map((c) => {
        const s = stored?.get(c);
        return [c, s ? s.final : computation.category_colours[c]];
      }),
    ) as Record<KpiCategory, ReportColour | null>;
    const projectReports = reportsByProject.get(p.project_id) ?? [];
    return {
      project_id: p.project_id,
      project_name: p.project_name,
      account_id: p.account_id,
      account_name: p.account_name,
      pm_name: p.pm_person_id ? (names.get(p.pm_person_id) ?? null) : null,
      pmo_name: p.pmo_person_id ? (names.get(p.pmo_person_id) ?? null) : null,
      overall_colour: worstColour(CATEGORIES.map((c) => category_colours[c])),
      category_colours,
      stats: computation.stats,
      staffed: staffedByProject.get(p.project_id) ?? 0,
      team_size: p.team_size,
      headline_metrics: computeHeadlineMetrics(defs, entries),
      latest_summary: projectReports.find((r) => r.executive_summary)?.executive_summary ?? null,
      reporters: projectReports.map((r) => ({
        reporter_id: r.reporter_id,
        name: names.get(r.reporter_id) ?? null,
      })),
      report_count: projectReports.length,
      can_manage: p.can_manage,
      can_report: p.can_report,
      reported_by_me: myReportProjects.has(p.project_id),
    };
  });
  return { rows };
}

// ── Detail (drill-down) ─────────────────────────────────────────────────────────────────

export interface WeeklyReportEntry {
  report_id: string;
  reporter_id: string;
  reporter_name: string | null;
  status: 'draft' | 'submitted';
  /** At least one submitted revision exists — others can see (and comment on) the report.
   * An unpublished draft (`status='draft' && !published`) is visible only to its author. */
  published: boolean;
  executive_summary: string | null;
  risk_issue: string | null;
  road_to_green: string | null;
  road_to_green_owner_id: string | null;
  road_to_green_owner_name: string | null;
  road_to_green_due: string | null;
  overall_colour: ReportColour | null;
  version: number;
  updated_at: string;
  comments: {
    id: string;
    parent_comment_id: string | null;
    author_user_id: string;
    author_name: string;
    body: string;
    created_at: string;
  }[];
}

export interface WeeklyReportDetail {
  project_id: string;
  project_name: string;
  account_name: string;
  phase: string;
  pricing_model: string | null;
  pm_person_id: string | null;
  pmo_person_id: string | null;
  /** People staffed on the project during the selected week vs the charter's team size —
   * drives the mock's "Staffed X/Y" line and the "Raise backfill (N seat)" action. */
  staffed: number;
  team_size: number | null;
  /** The mock's headline stats (util 102% · predictability 40% · CSS 3.60) — the week's
   * measured values of three named norm metrics; a metric that wasn't measured is omitted. */
  headline_metrics: {
    label: string;
    name: string;
    computed_value: number;
    component_count: 1 | 2;
    status: RagStatus | null;
  }[];
  metrics: WeekMetric[];
  pm_name: string | null;
  pmo_name: string | null;
  iso_year: number;
  iso_week: number;
  overall_colour: ReportColour | null;
  flags: {
    category: KpiCategory;
    computed_colour: ReportColour | null;
    final_colour: ReportColour | null;
    overridden: boolean;
  }[];
  stats: WeekStats;
  /** Selected week first, then the 4 preceding weeks — overall colour each. */
  trend: { iso_year: number; iso_week: number; colour: ReportColour | null }[];
  reports: WeeklyReportEntry[];
  can_manage: boolean;
  can_report: boolean;
  /** The caller's person id — the UI matches it against reports[].reporter_id to find "my"
   * report to prefill/edit. null when the session isn't linked to a worker profile. */
  my_reporter_id: string | null;
  /** Epic 3 edit window: true only for the current week (VNT) before Friday 5:00 PM. The
   * composer hides when false; comments stay open. */
  week_editable: boolean;
}

export async function getWeeklyReportDetail(input: {
  project_id: string;
  iso_year: number;
  iso_week: number;
  session: SessionScope;
}): Promise<WeeklyReportDetail> {
  const { project_id, iso_year, iso_week, session } = input;
  requirePermission(session, 'pm.project.read');

  const scope = buildProjectScope(session);
  const [proj] = await pmDb()
    .select({
      project_id: project.id,
      project_name: project.name,
      account_name: account.name,
      phase: project.phase,
      pricing_model: project.pricing_model,
      pm_person_id: project.pm_person_id,
      pmo_person_id: project.pmo_person_id,
      team_size: project.team_size,
      can_manage: buildProjectManageFlag(session),
      can_report: buildProjectReporterFlag(session),
    })
    .from(project)
    .innerJoin(account, eq(account.id, project.account_id))
    .where(
      and(
        eq(project.id, project_id),
        tenantScoped(project.tenant_id, session),
        isNull(project.deleted_at),
      ),
    )
    .limit(1);
  if (!proj) throw new PmError('NOT_FOUND', `project ${project_id} not found`);

  if (scope) {
    const assigned = await assignedProjectIdsAsOf([project_id], iso_year, iso_week, session);
    if (!assigned.has(project_id)) {
      const [liveReadable] = await pmDb()
        .select({ id: project.id })
        .from(project)
        .where(and(eq(project.id, project_id), tenantScoped(project.tenant_id, session), scope))
        .limit(1);
      if (!liveReadable) throw new PmError('NOT_FOUND', `project ${project_id} not found`);
    }
  }

  // Staffed = distinct people with a live allocation overlapping the selected week.
  const week = isoWeekRange(iso_year, iso_week);
  const [staffedRow] = await pmDb()
    .select({ staffed: sql<number>`count(distinct ${allocation.person_id})::int` })
    .from(allocation)
    .where(
      and(
        tenantScoped(allocation.tenant_id, session),
        eq(allocation.project_id, project_id),
        isNull(allocation.deleted_at),
        isNotNull(allocation.person_id),
        inArray(allocation.status, ['tentative', 'committed']),
        or(isNull(allocation.date_from), sql`${allocation.date_from} <= ${week.to}`),
        or(isNull(allocation.date_to), sql`${allocation.date_to} >= ${week.from}`),
      ),
    );

  const trendWeeks = previousIsoWeeks(iso_year, iso_week, 5);
  const [defsByKey, entriesByKey, flagRows, reportRows] = await Promise.all([
    // FUT-593: each week is measured against ITS OWN frozen baseline (the trend spans five
    // weeks, so five potentially different NORM generations).
    ensureBaselineDefs(session, [project_id], trendWeeks),
    loadEntriesByProject(session, [project_id], trendWeeks),
    pmDb()
      .select({
        iso_year: flag.iso_year,
        iso_week: flag.iso_week,
        category: flag.category,
        computed_colour: flag.computed_colour,
        final_colour: flag.final_colour,
      })
      .from(flag)
      .where(
        and(
          tenantScoped(flag.tenant_id, session),
          eq(flag.project_id, project_id),
          or(
            ...trendWeeks.map((w) =>
              and(eq(flag.iso_year, w.iso_year), eq(flag.iso_week, w.iso_week)),
            ),
          ),
        ),
      ),
    pmDb()
      .select()
      .from(report)
      .where(
        and(
          tenantScoped(report.tenant_id, session),
          eq(report.project_id, project_id),
          eq(report.iso_year, iso_year),
          eq(report.iso_week, iso_week),
        ),
      )
      .orderBy(report.created_at),
  ]);

  const weekKey = (w: { iso_year: number; iso_week: number }) =>
    `${project_id}:${w.iso_year}:${w.iso_week}`;
  const defs = defsByKey.get(baselineKey(project_id, { iso_year, iso_week })) ?? [];

  // "Last submitted version" view (product rule, 2026-07-16): while a reporter drafts, the
  // OWNER sees their working copy, everyone else keeps reading the latest published
  // revision. A never-published draft is invisible to everyone but its author.
  const draftIds = reportRows.filter((r) => r.status === 'draft').map((r) => r.id);
  const latestRevisionByReport = new Map<string, typeof reportRevision.$inferSelect>();
  if (draftIds.length > 0) {
    const revisions = await pmDb()
      .select()
      .from(reportRevision)
      .where(
        and(
          tenantScoped(reportRevision.tenant_id, session),
          inArray(reportRevision.report_id, draftIds),
        ),
      )
      .orderBy(desc(reportRevision.created_at));
    for (const rev of revisions) {
      if (!latestRevisionByReport.has(rev.report_id)) {
        latestRevisionByReport.set(rev.report_id, rev);
      }
    }
  }

  const commentRows = reportRows.length
    ? await pmDb()
        .select()
        .from(comment)
        .where(
          and(
            tenantScoped(comment.tenant_id, session),
            inArray(
              comment.report_id,
              reportRows.map((r) => r.id),
            ),
          ),
        )
        .orderBy(comment.created_at)
    : [];

  const names = await loadNames(
    session,
    [
      proj.pm_person_id,
      proj.pmo_person_id,
      ...reportRows.map((r) => r.reporter_id),
      ...reportRows.map((r) => r.road_to_green_owner_id),
      ...[...latestRevisionByReport.values()].map((rev) => rev.road_to_green_owner_id),
    ].filter((id): id is string => id !== null),
  );

  const selectedEntries = entriesByKey.get(weekKey({ iso_year, iso_week })) ?? [];
  // Selected-week flags (overrides) + computed fallback.
  const selectedComputation = computeProjectWeek(defs, selectedEntries);
  // Delivery pulse — the same three named metrics the list card surfaces.
  const headline_metrics = computeHeadlineMetrics(defs, selectedEntries);
  const metrics = buildWeekMetrics(defs, selectedEntries);

  const selectedFlags = new Map(
    flagRows
      .filter((f) => f.iso_year === iso_year && f.iso_week === iso_week)
      .map((f) => [f.category as KpiCategory, f]),
  );
  const flags = CATEGORIES.map((c) => {
    const row = selectedFlags.get(c);
    if (!row) {
      const live = selectedComputation.category_colours[c] as ReportColour | null;
      return { category: c, computed_colour: live, final_colour: live, overridden: false };
    }
    return {
      category: c,
      computed_colour: row.computed_colour as ReportColour | null,
      final_colour: row.final_colour as ReportColour | null,
      overridden: row.final_colour !== row.computed_colour,
    };
  });
  const overall_colour = worstColour(flags.map((f) => f.final_colour));

  const trend = trendWeeks.map((w) => {
    const weekDefs = defsByKey.get(baselineKey(project_id, w)) ?? [];
    const computation = computeProjectWeek(weekDefs, entriesByKey.get(weekKey(w)) ?? []);
    const weekFlags = flagRows.filter(
      (f) => f.iso_year === w.iso_year && f.iso_week === w.iso_week,
    );
    const colours = CATEGORIES.map((c) => {
      const row = weekFlags.find((f) => f.category === c);
      return row
        ? (row.final_colour as ReportColour | null)
        : (computation.category_colours[c] as ReportColour | null);
    });
    return { ...w, colour: worstColour(colours) };
  });

  const commentsByReport = new Map<string, typeof commentRows>();
  for (const c of commentRows) {
    const list = commentsByReport.get(c.report_id) ?? [];
    list.push(c);
    commentsByReport.set(c.report_id, list);
  }

  return {
    project_id,
    project_name: proj.project_name,
    account_name: proj.account_name,
    phase: proj.phase,
    pricing_model: proj.pricing_model,
    pm_person_id: proj.pm_person_id,
    pmo_person_id: proj.pmo_person_id,
    staffed: staffedRow?.staffed ?? 0,
    team_size: proj.team_size,
    headline_metrics,
    metrics,
    pm_name: proj.pm_person_id ? (names.get(proj.pm_person_id) ?? null) : null,
    pmo_name: proj.pmo_person_id ? (names.get(proj.pmo_person_id) ?? null) : null,
    iso_year,
    iso_week,
    overall_colour,
    flags,
    stats: selectedComputation.stats,
    trend,
    reports: reportRows.flatMap((r) => {
      const isOwner = session.person_id !== null && r.reporter_id === session.person_id;
      const revision = latestRevisionByReport.get(r.id);
      const published = r.status === 'submitted' || revision !== undefined;
      // Non-owners never see a working copy: drafts serve the latest published revision,
      // and a never-published draft doesn't exist for them at all.
      const src = r.status === 'draft' && !isOwner ? revision : r;
      if (!src) return [];
      return [
        {
          report_id: r.id,
          reporter_id: r.reporter_id,
          reporter_name: names.get(r.reporter_id) ?? null,
          status: (src === r ? r.status : 'submitted') as 'draft' | 'submitted',
          published,
          executive_summary: src.executive_summary,
          risk_issue: src.risk_issue,
          road_to_green: src.road_to_green,
          road_to_green_owner_id: src.road_to_green_owner_id,
          road_to_green_owner_name: src.road_to_green_owner_id
            ? (names.get(src.road_to_green_owner_id) ?? null)
            : null,
          road_to_green_due: src.road_to_green_due,
          overall_colour: src.overall_colour as ReportColour | null,
          version: r.version,
          updated_at: (src === r ? r.updated_at : src.created_at).toISOString(),
          comments: (commentsByReport.get(r.id) ?? []).map((c) => ({
            id: c.id,
            parent_comment_id: c.parent_comment_id,
            author_user_id: c.author_user_id,
            author_name: c.author_name,
            body: c.body,
            created_at: c.created_at.toISOString(),
          })),
        },
      ];
    }),
    can_manage: proj.can_manage,
    can_report: proj.can_report,
    my_reporter_id: session.person_id,
    week_editable: isWeekEditable(iso_year, iso_week),
  };
}

// ── Upsert (create/update own report for a week) ──────────────────────────────────────────

/**
 * FUT-591 AC1: ensure exactly one report of THIS reporter exists for the (Project, Week)
 * context — created as an empty DRAFT on first entry, returned as-is on every later entry.
 * Idempotent under concurrency via the report identity unique index; the same gates as
 * writing apply (assigned reporter with manage rights, open week only — so closed weeks and
 * read-only roles like BoD can never create anything).
 */
export async function ensureWeeklyReport(
  input: EnsureWeeklyReportInput & { session: SessionScope },
): Promise<{
  report_id: string;
  version: number;
  status: 'draft' | 'submitted';
  created: boolean;
}> {
  const { project_id, iso_year, iso_week, session } = input;
  await assertProjectReportable(project_id, session);
  assertWeekEditable(iso_year, iso_week);
  const reporter_id = session.person_id;
  if (!reporter_id) {
    throw new PmError('VALIDATION', 'your account is not linked to a worker profile');
  }

  // `created` distinguishes a freshly-inserted empty draft from a returned pre-existing one — the
  // composer uses it to know whether an abandoned draft is safe to discard (see discardWeeklyReport).
  const inserted = await pmDb()
    .insert(report)
    .values({
      tenant_id: session.tenant_id,
      project_id,
      iso_year,
      iso_week,
      reporter_id,
      status: 'draft',
      executive_summary: '',
    })
    .onConflictDoNothing()
    .returning({ id: report.id });
  const [row] = await pmDb()
    .select({ id: report.id, version: report.version, status: report.status })
    .from(report)
    .where(
      and(
        eq(report.tenant_id, session.tenant_id),
        eq(report.project_id, project_id),
        eq(report.iso_year, iso_year),
        eq(report.iso_week, iso_week),
        eq(report.reporter_id, reporter_id),
      ),
    )
    .limit(1);
  if (!row) throw new PmError('CONFLICT', 'report could not be ensured');
  return {
    report_id: row.id,
    version: row.version,
    status: row.status as 'draft' | 'submitted',
    created: inserted.length > 0,
  };
}

/**
 * FUT-740: reverse of draft-on-entry. When the reporter opens the composer and leaves without
 * saving, the empty draft ensureWeeklyReport created has no value and must not linger as a stray
 * "Unknown · Draft" card. This removes ONLY that pristine draft — the reporter's own, still empty
 * (never saved with content), never published (no revision) and never discussed (no comment).
 * Anything with content, a submitted report, or a frozen one is left untouched, so this can never
 * destroy real work. Idempotent: discarded=false when there was nothing safe to remove.
 */
export async function discardWeeklyReport(
  input: DiscardWeeklyReportInput & { session: SessionScope },
): Promise<{ discarded: boolean }> {
  const { project_id, iso_year, iso_week, session } = input;
  await assertProjectReportable(project_id, session);
  assertWeekEditable(iso_year, iso_week);
  const reporter_id = session.person_id;
  if (!reporter_id) {
    throw new PmError('VALIDATION', 'your account is not linked to a worker profile');
  }

  const deleted = await pmDb()
    .delete(report)
    .where(
      and(
        eq(report.tenant_id, session.tenant_id),
        eq(report.project_id, project_id),
        eq(report.iso_year, iso_year),
        eq(report.iso_week, iso_week),
        eq(report.reporter_id, reporter_id),
        eq(report.status, 'draft'),
        // Pristine content only — the exact shape ensureWeeklyReport inserts. Any real edit
        // (summary, risk/issue, road-to-green, or a declared colour) protects the draft.
        eq(report.executive_summary, ''),
        isNull(report.risk_issue),
        isNull(report.road_to_green),
        isNull(report.declared_colours),
        // Never published and never discussed — a revision or comment means it isn't disposable.
        notExists(
          pmDb()
            .select({ one: sql`1` })
            .from(reportRevision)
            .where(
              and(
                eq(reportRevision.tenant_id, session.tenant_id),
                eq(reportRevision.report_id, report.id),
              ),
            ),
        ),
        notExists(
          pmDb()
            .select({ one: sql`1` })
            .from(comment)
            .where(and(eq(comment.tenant_id, session.tenant_id), eq(comment.report_id, report.id))),
        ),
      ),
    )
    .returning({ id: report.id });
  return { discarded: deleted.length > 0 };
}

export async function upsertWeeklyReport(
  input: UpsertWeeklyReportInput & { session: SessionScope },
): Promise<{ report_id: string; version: number; overall_colour: ReportColour | null }> {
  const { project_id, iso_year, iso_week, expected_version, session } = input;
  // Draft lifecycle (FUT-591/601): 'draft' saves anything without the submit gate and never
  // stamps flags/snapshots/rollup; 'submit' runs the gate and stamps. A draft save over a
  // submitted report DEMOTES it — its contribution is withdrawn from the shared flags and
  // the roll-up recomputes from the remaining submitted reports.
  const save_mode = input.save_mode ?? 'submit';
  await assertProjectReportable(project_id, session);
  assertWeekEditable(iso_year, iso_week);
  const reporter_id = session.person_id;
  if (!reporter_id) {
    throw new PmError('VALIDATION', 'your account is not linked to a worker profile');
  }

  // FUT-593: validation and the submit-time snapshot both measure against the week's frozen
  // baseline — the snapshot is a copy of the baseline, never of the live catalog.
  const [defsByKey, entriesByKey] = await Promise.all([
    ensureBaselineDefs(session, [project_id], [{ iso_year, iso_week }]),
    loadEntriesByProject(session, [project_id], [{ iso_year, iso_week }]),
  ]);
  const defs = defsByKey.get(baselineKey(project_id, { iso_year, iso_week })) ?? [];
  const entries = entriesByKey.get(`${project_id}:${iso_year}:${iso_week}`) ?? [];
  const computation = computeProjectWeek(defs, entries);

  // The computed colours are only the prefill — the reporter declares each QCDP pillar in the
  // composer, and overall (plus the Road-to-Green requirement) follows the declared colours.
  const declaredColours: Record<KpiCategory, ReportColour | null> = {
    ...computation.category_colours,
  };
  for (const category of CATEGORIES) {
    const chosen = input.category_colours?.[category];
    if (chosen) declaredColours[category] = chosen;
  }
  const overall_colour = worstColour(CATEGORIES.map((c) => declaredColours[c]));

  // The submit GATE — drafts skip all of it by design ("save anything, label it honestly").
  if (save_mode === 'submit') {
    if (input.executive_summary.trim() === '') {
      throw new PmError('VALIDATION', 'Executive summary is required to submit');
    }
    // Epic 3: a week with any measured KPI over norm cannot be declared all-Green. Weeks with
    // no data at all are the PM's call (the computed colours still show red with an override
    // mark), and a project's risks stay the PM's judgment — no field gates this.
    const kpiOverNorm = computation.stats.yellow_count > 0 || computation.stats.red_count > 0;
    if (kpiOverNorm && overall_colour === 'green') {
      throw new PmError(
        'VALIDATION',
        'KPIs are over norm this week — at least one QCDP flag must be non-Green',
      );
    }

    if (input.risk_issue?.trim() && !(input.road_to_green?.trim() && input.road_to_green_due)) {
      throw new PmError(
        'VALIDATION',
        'A declared Risk / Issue requires a Road-to-Green action with a due date',
      );
    }
    if (input.road_to_green?.trim() && !input.road_to_green_due) {
      throw new PmError('VALIDATION', 'Road-to-Green action requires a due date');
    }
  }

  // A Green submit has nothing to recover from — discard any Road-to-Green the composer carried
  // over from a previous non-Green revision (it prefills the last saved values), instead of
  // publishing a contradictory "Green with a recovery plan" report. Drafts keep what was typed.
  const keepRoad = !(save_mode === 'submit' && overall_colour === 'green');
  const road_to_green = keepRoad ? input.road_to_green?.trim() || null : null;
  const road_to_green_owner_id = keepRoad ? (input.road_to_green_owner_id ?? null) : null;
  const road_to_green_due = keepRoad ? (input.road_to_green_due ?? null) : null;

  let result!: { report_id: string; version: number };
  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const [existing] = await tx
        .select({ id: report.id, version: report.version, status: report.status })
        .from(report)
        .where(
          and(
            eq(report.tenant_id, session.tenant_id),
            eq(report.project_id, project_id),
            eq(report.iso_year, iso_year),
            eq(report.iso_week, iso_week),
            eq(report.reporter_id, reporter_id),
          ),
        )
        .limit(1);
      if (existing && expected_version !== undefined && existing.version !== expected_version) {
        throw new PmError('CONFLICT', 'report was modified by someone else', {
          current_version: existing.version,
        });
      }

      // Product rule: the first comment freezes the report — the version people discussed
      // can never change under them, in either save mode.
      if (existing) {
        const [commented] = await tx
          .select({ id: comment.id })
          .from(comment)
          .where(and(eq(comment.tenant_id, session.tenant_id), eq(comment.report_id, existing.id)))
          .limit(1);
        if (commented) {
          throw new PmError(
            'VALIDATION',
            'This report has comments and is locked — the discussed version cannot be changed',
          );
        }
      }

      const fields = {
        status: save_mode === 'submit' ? ('submitted' as const) : ('draft' as const),
        executive_summary: input.executive_summary,
        risk_issue: input.risk_issue?.trim() || null,
        road_to_green,
        road_to_green_owner_id,
        road_to_green_due,
        // A draft projects no colour of its own; declared colours are kept for the day it
        // (re-)submits and for the demote recompute of the shared flags.
        overall_colour: save_mode === 'submit' ? overall_colour : null,
        declared_colours: input.category_colours ?? null,
      };
      let report_id: string;
      let version: number;
      if (existing) {
        const [updated] = await tx
          .update(report)
          .set({ ...fields, version: existing.version + 1, updated_at: new Date() })
          .where(eq(report.id, existing.id))
          .returning({ id: report.id, version: report.version });
        report_id = updated?.id ?? existing.id;
        version = updated?.version ?? existing.version + 1;
      } else {
        const [created] = await tx
          .insert(report)
          .values({
            tenant_id: session.tenant_id,
            project_id,
            iso_year,
            iso_week,
            reporter_id,
            ...fields,
          })
          .returning({ id: report.id, version: report.version });
        if (!created) throw new PmError('CONFLICT', 'report insert returned no row');
        report_id = created.id;
        version = created.version;
      }

      // Draft saves stop here: no snapshots, no flags, no roll-up, no revision. The last
      // PUBLISHED revision (if any) stays visible and effective for everyone else — a draft
      // is the author's private working copy on top of it (product rule, 2026-07-16).
      if (save_mode === 'draft') {
        result = { report_id, version };
        return;
      }

      // Submit publishes: append an immutable revision — this is the version everyone else
      // reads (and keeps reading while the author later drafts on top of it).
      await tx.insert(reportRevision).values({
        tenant_id: session.tenant_id,
        report_id,
        executive_summary: input.executive_summary,
        risk_issue: input.risk_issue?.trim() || null,
        road_to_green,
        road_to_green_owner_id,
        road_to_green_due,
        overall_colour,
        declared_colours: input.category_colours ?? null,
      });

      // Refresh this report's own snapshots (delete+recreate is fine — nothing references them).
      await tx.delete(metricValue).where(eq(metricValue.report_id, report_id));
      await tx.delete(normSnapshot).where(eq(normSnapshot.report_id, report_id));
      const defsById = new Map(defs.map((d) => [d.metric_id, d]));
      const snapshotEntries = entries.filter((e) => defsById.has(e.metric_id));
      if (snapshotEntries.length > 0) {
        await tx.insert(metricValue).values(
          snapshotEntries.map((e) => ({
            tenant_id: session.tenant_id,
            report_id,
            metric_id: e.metric_id,
            source_entry_id: e.entry_id,
            computed_value: e.computed_value === null ? null : String(e.computed_value),
            colour: e.status,
          })),
        );
        await tx.insert(normSnapshot).values(
          snapshotEntries.map((e) => {
            const def = defsById.get(e.metric_id) as ProjectDef;
            return {
              tenant_id: session.tenant_id,
              report_id,
              metric_id: e.metric_id,
              metric_version: def.metric_version,
              category: def.category,
              green_band: def.green_band,
              yellow_band: def.yellow_band,
              red_band: def.red_band,
            };
          }),
        );
      }

      // Flags: shared per (project, week, category). Final colour resolves in three steps:
      // (1) new flag → final follows computed with an initial audit entry (actor null =
      // system); (2) computed moved since last save → final follows it ONLY if never manually
      // overridden; (3) the WORST colour declared across the week's published reports, when it
      // differs from where final landed, becomes an audited override — including declaring back
      // to the computed colour, which clears a previous override.
      //
      // The flag is shared, so it takes the worst of the reporters' CURRENT declarations, never
      // the last one written: a milder later report can't lift a red another reporter declared,
      // and the red does lift once its own author revises it down. Each report keeps its own
      // overall_colour (the worst of ITS four pillars) untouched.
      const publishedDeclarations = await tx
        .select({
          report_id: reportRevision.report_id,
          declared_colours: reportRevision.declared_colours,
        })
        .from(reportRevision)
        .innerJoin(report, eq(report.id, reportRevision.report_id))
        .where(
          and(
            eq(reportRevision.tenant_id, session.tenant_id),
            eq(report.project_id, project_id),
            eq(report.iso_year, iso_year),
            eq(report.iso_week, iso_week),
          ),
        )
        .orderBy(reportRevision.created_at);
      type DeclaredColours = Partial<Record<KpiCategory, ReportColour>>;
      const declaredByReport = new Map<string, DeclaredColours | null>();
      for (const rev of publishedDeclarations) {
        declaredByReport.set(rev.report_id, rev.declared_colours as DeclaredColours | null);
      }
      declaredByReport.set(report_id, input.category_colours ?? null);
      const declaredColours = Object.fromEntries(
        CATEGORIES.map((c) => [
          c,
          worstColour([...declaredByReport.values()].map((d) => d?.[c] ?? null)),
        ]),
      ) as Record<KpiCategory, ReportColour | null>;

      const existingFlags = await tx
        .select()
        .from(flag)
        .where(
          and(
            eq(flag.tenant_id, session.tenant_id),
            eq(flag.project_id, project_id),
            eq(flag.iso_year, iso_year),
            eq(flag.iso_week, iso_week),
          ),
        );
      const flagByCategory = new Map(existingFlags.map((f) => [f.category as KpiCategory, f]));
      const finalColours: Record<KpiCategory, ReportColour | null> = {
        ...computation.category_colours,
      };
      const insertAudit = async (
        flag_id: string,
        from_colour: ReportColour | null,
        to_colour: ReportColour,
        actor_user_id: string | null,
        reason?: string,
      ) => {
        const [audit] = await tx
          .insert(flagAuditEntry)
          .values({
            tenant_id: session.tenant_id,
            flag_id,
            from_colour,
            to_colour,
            actor_user_id,
            reason: reason ?? null,
          })
          .returning({ id: flagAuditEntry.id });
        return audit?.id ?? null;
      };
      for (const category of CATEGORIES) {
        const computed = computation.category_colours[category];
        const declared = declaredColours[category];
        const row = flagByCategory.get(category);

        if (!row) {
          const [created] = await tx
            .insert(flag)
            .values({
              tenant_id: session.tenant_id,
              project_id,
              iso_year,
              iso_week,
              report_id,
              category,
              computed_colour: computed,
              final_colour: computed,
            })
            .returning({ id: flag.id });
          if (!created) continue;
          let latest =
            computed === null ? null : await insertAudit(created.id, null, computed, null);
          let final: ReportColour | null = computed;
          if (declared && declared !== computed) {
            latest =
              (await insertAudit(
                created.id,
                computed,
                declared,
                session.user_id,
                'Set in weekly report',
              )) ?? latest;
            final = declared;
          }
          await tx
            .update(flag)
            .set({ final_colour: final, latest_audit_entry_id: latest })
            .where(eq(flag.id, created.id));
          finalColours[category] = final;
          continue;
        }

        let final = row.final_colour as ReportColour | null;
        let latest = row.latest_audit_entry_id;
        const wasOverridden = row.final_colour !== row.computed_colour;
        if (row.computed_colour !== computed && !wasOverridden) {
          if (computed !== null)
            latest = (await insertAudit(row.id, final, computed, null)) ?? latest;
          final = computed;
        }
        if (declared && declared !== final) {
          latest =
            (await insertAudit(row.id, final, declared, session.user_id, 'Set in weekly report')) ??
            latest;
          final = declared;
        }
        await tx
          .update(flag)
          .set({
            computed_colour: computed,
            final_colour: final,
            report_id,
            latest_audit_entry_id: latest,
          })
          .where(eq(flag.id, row.id));
        finalColours[category] = final;
      }

      // Precomputed roll-up for the list page / portfolio consumers.
      const rag = worstColour(CATEGORIES.map((c) => finalColours[c]));
      await tx
        .insert(projectWeekRollup)
        .values({
          tenant_id: session.tenant_id,
          project_id,
          iso_year,
          iso_week,
          quality_colour: finalColours.quality,
          cost_capacity_colour: finalColours.cost_capacity,
          delivery_colour: finalColours.delivery,
          process_colour: finalColours.process,
          rag,
          ohs: String(Math.round(computation.ohs * 100) / 100),
        })
        .onConflictDoUpdate({
          target: [
            projectWeekRollup.tenant_id,
            projectWeekRollup.project_id,
            projectWeekRollup.iso_year,
            projectWeekRollup.iso_week,
          ],
          set: {
            quality_colour: sql`excluded.quality_colour`,
            cost_capacity_colour: sql`excluded.cost_capacity_colour`,
            delivery_colour: sql`excluded.delivery_colour`,
            process_colour: sql`excluded.process_colour`,
            rag: sql`excluded.rag`,
            ohs: sql`excluded.ohs`,
          },
        });

      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'pm.weekly_report',
        aggregateId: report_id,
        eventType: PM_WEEKLY_REPORT_SAVED,
        eventVersion: 1,
        payload: {
          report_id,
          tenant_id: session.tenant_id,
          project_id,
          iso_year,
          iso_week,
          reporter_id,
          overall_colour,
        },
      });
      result = { report_id, version };
    },
  );
  return { ...result, overall_colour };
}

// ── Flag override ──────────────────────────────────────────────────────────────────────────

export async function overrideFlag(
  input: OverrideFlagInput & { session: SessionScope },
): Promise<{ flag_id: string; final_colour: ReportColour }> {
  const { project_id, iso_year, iso_week, category, final_colour, reason, session } = input;
  await assertProjectReportable(project_id, session);
  assertWeekEditable(iso_year, iso_week);

  const [row] = await pmDb()
    .select()
    .from(flag)
    .where(
      and(
        tenantScoped(flag.tenant_id, session),
        eq(flag.project_id, project_id),
        eq(flag.iso_year, iso_year),
        eq(flag.iso_week, iso_week),
        eq(flag.category, category),
      ),
    )
    .limit(1);
  if (!row) {
    throw new PmError('NOT_FOUND', 'no flag for that week yet — save a weekly report first');
  }
  if (row.final_colour === final_colour) {
    return { flag_id: row.id, final_colour };
  }

  await withEmit(
    { actor: { userId: session.user_id, tenantId: session.tenant_id } },
    async (tx) => {
      const [audit] = await tx
        .insert(flagAuditEntry)
        .values({
          tenant_id: session.tenant_id,
          flag_id: row.id,
          from_colour: row.final_colour,
          to_colour: final_colour,
          reason,
          actor_user_id: session.user_id,
        })
        .returning({ id: flagAuditEntry.id });
      await tx
        .update(flag)
        .set({ final_colour, latest_audit_entry_id: audit?.id ?? row.latest_audit_entry_id })
        .where(eq(flag.id, row.id));

      // Keep the roll-up consistent with the override.
      const flags = await tx
        .select({ category: flag.category, final_colour: flag.final_colour })
        .from(flag)
        .where(
          and(
            eq(flag.tenant_id, session.tenant_id),
            eq(flag.project_id, project_id),
            eq(flag.iso_year, iso_year),
            eq(flag.iso_week, iso_week),
          ),
        );
      const byCat = new Map(flags.map((f) => [f.category, f.final_colour as ReportColour | null]));
      const colourOf = (c: KpiCategory) => byCat.get(c) ?? null;
      await tx
        .update(projectWeekRollup)
        .set({
          quality_colour: colourOf('quality'),
          cost_capacity_colour: colourOf('cost_capacity'),
          delivery_colour: colourOf('delivery'),
          process_colour: colourOf('process'),
          rag: worstColour(CATEGORIES.map(colourOf)),
        })
        .where(
          and(
            eq(projectWeekRollup.tenant_id, session.tenant_id),
            eq(projectWeekRollup.project_id, project_id),
            eq(projectWeekRollup.iso_year, iso_year),
            eq(projectWeekRollup.iso_week, iso_week),
          ),
        );

      await emit({
        tenantId: session.tenant_id,
        aggregateType: 'pm.flag',
        aggregateId: row.id,
        eventType: PM_FLAG_OVERRIDDEN,
        eventVersion: 1,
        payload: {
          flag_id: row.id,
          tenant_id: session.tenant_id,
          project_id,
          iso_year,
          iso_week,
          category,
          from_colour: row.final_colour as ReportColour | null,
          to_colour: final_colour,
          reason,
          actor_user_id: session.user_id,
        },
      });
    },
  );
  return { flag_id: row.id, final_colour };
}

// ── Comments ──────────────────────────────────────────────────────────────────────────────

export async function addReportComment(
  input: AddReportCommentInput & { session: SessionScope },
): Promise<{ comment_id: string }> {
  const { report_id, parent_comment_id, body, session } = input;
  requirePermission(session, 'pm.project.read');

  const [rep] = await pmDb()
    .select({ id: report.id, project_id: report.project_id, status: report.status })
    .from(report)
    .where(and(tenantScoped(report.tenant_id, session), eq(report.id, report_id)))
    .limit(1);
  if (!rep) throw new PmError('NOT_FOUND', `report ${report_id} not found`);

  // Comments only land on PUBLISHED reports (a never-submitted draft is invisible to
  // everyone but its author — there is nothing shared to discuss).
  const [latestRevision] = await pmDb()
    .select()
    .from(reportRevision)
    .where(
      and(tenantScoped(reportRevision.tenant_id, session), eq(reportRevision.report_id, report_id)),
    )
    .orderBy(desc(reportRevision.created_at))
    .limit(1);
  if (!latestRevision) {
    throw new PmError(
      'VALIDATION',
      'This report has not been submitted yet — there is nothing to comment on',
    );
  }

  // Same visibility gate as getWeeklyReportDetail — commenting requires seeing the project.
  const visibilityConds = [
    eq(project.id, rep.project_id),
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
  if (!visible) throw new PmError('NOT_FOUND', `report ${report_id} not found`);

  if (parent_comment_id) {
    const [parent] = await pmDb()
      .select({ id: comment.id, report_id: comment.report_id })
      .from(comment)
      .where(and(tenantScoped(comment.tenant_id, session), eq(comment.id, parent_comment_id)))
      .limit(1);
    if (!parent || parent.report_id !== report_id) {
      throw new PmError('VALIDATION', 'parent comment does not belong to this report');
    }
  }

  // The first comment freezes the report (product rule): the discussed version can never
  // change under the commenters, so any private WIP draft is discarded — the working row is
  // restored to the published revision before the comment lands.
  if (rep.status === 'draft') {
    await pmDb()
      .update(report)
      .set({
        status: 'submitted',
        executive_summary: latestRevision.executive_summary,
        risk_issue: latestRevision.risk_issue,
        road_to_green: latestRevision.road_to_green,
        road_to_green_owner_id: latestRevision.road_to_green_owner_id,
        road_to_green_due: latestRevision.road_to_green_due,
        overall_colour: latestRevision.overall_colour,
        declared_colours: latestRevision.declared_colours,
        version: sql`${report.version} + 1`,
        updated_at: new Date(),
      })
      .where(eq(report.id, report_id));
  }

  // The thread shows the same name as PM/PMO labels everywhere else — the person's
  // full name from the projection. display_name is a login artifact (username/email
  // local part for some accounts) and only serves users with no person link.
  let author_name = session.display_name;
  if (session.person_id) {
    const [person] = await pmDb()
      .select({ full_name: personProjection.full_name })
      .from(personProjection)
      .where(
        and(
          tenantScoped(personProjection.tenant_id, session),
          eq(personProjection.person_id, session.person_id),
        ),
      )
      .limit(1);
    if (person) author_name = person.full_name;
  }

  const [created] = await pmDb()
    .insert(comment)
    .values({
      tenant_id: session.tenant_id,
      report_id,
      parent_comment_id: parent_comment_id ?? null,
      author_user_id: session.user_id,
      author_name,
      body,
    })
    .returning({ id: comment.id });
  if (!created) throw new PmError('CONFLICT', 'comment insert returned no row');
  return { comment_id: created.id };
}

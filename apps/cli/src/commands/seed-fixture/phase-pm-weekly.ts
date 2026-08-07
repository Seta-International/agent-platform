import type { SessionScope } from '@seta/core';
import {
  getCurrentIsoWeek,
  getKpiNorm,
  isWeekEditable,
  type KpiNormMetricRow,
  listAppliedMetrics,
  upsertKpiRecord,
  upsertWeeklyReport,
} from '@seta/pm';
import { figuresForStatus, type RagStatus } from '@seta/pm/contracts';
import pino from 'pino';

const log = pino({ name: 'cli/seed-fixture/pm-weekly' });

interface Entry {
  metric_id: string;
  component_1_value: number | null;
  component_2_value: number | null;
}

interface Profile {
  key: string;
  /** Share of the project's applied metrics that get figures at all. */
  coverage: number;
  reds: number;
  ambers: number;
  report: { summary: string; risk?: string; roadToGreen?: string } | null;
}

/**
 * One project per card state the board can render: a wide red, an amber with no reds at all, a
 * clean green, a red that is only half reported, and a project nobody has touched this week.
 */
const PROFILES: Profile[] = [
  {
    key: 'red-wide',
    coverage: 1,
    reds: 3,
    ambers: 2,
    report: {
      summary: 'Two senior engineers rolled off before handover; the backfill starts Monday.',
      risk: 'Release predictability has missed its band three weeks running.',
      roadToGreen: 'Backfill 2 FTE and re-plan the release train.',
    },
  },
  {
    key: 'amber-only',
    coverage: 1,
    reds: 0,
    ambers: 2,
    report: {
      summary: 'Throughput dipped over the holiday week; no scope at risk.',
      risk: 'Utilisation sits under band while two people are on leave.',
      roadToGreen: 'Rebalance the sprint once both are back.',
    },
  },
  {
    key: 'green',
    coverage: 1,
    reds: 0,
    ambers: 0,
    report: { summary: 'Cutover rehearsal passed on the first run. No blockers into next week.' },
  },
  { key: 'red-partial', coverage: 0.6, reds: 1, ambers: 1, report: null },
  { key: 'unreported', coverage: 0, reds: 0, ambers: 0, report: null },
];

export async function seedPmWeekly(
  session: SessionScope,
  projectByCode: Map<string, string>,
  pmByCode: Map<string, { workerId: string; userId: string }>,
): Promise<void> {
  const week = getCurrentIsoWeek();
  if (!isWeekEditable(week.iso_year, week.iso_week)) {
    log.warn(
      week,
      'reporting week is closed (past Friday 17:00 VNT) — skipping weekly KPI demo data',
    );
    return;
  }

  const norm = await getKpiNorm(session);
  if (!norm) {
    log.warn('tenant has no KPI Norm — skipping weekly KPI demo data');
    return;
  }
  const metricById = new Map(norm.metrics.map((m) => [m.metric_id, m]));

  const codes = [...projectByCode.keys()].sort();
  let records = 0;
  let reports = 0;

  for (const [index, profile] of PROFILES.entries()) {
    const code = codes[index];
    const project_id = code ? projectByCode.get(code) : undefined;
    if (!code || !project_id) {
      log.warn({ profile: profile.key }, 'no project left to carry this card state');
      continue;
    }

    const applied = (await listAppliedMetrics(session, [project_id]))
      .filter((a) => a.applied_count > 0)
      .map((a) => metricById.get(a.metric_id))
      .filter((m): m is KpiNormMetricRow => m !== undefined);
    if (applied.length === 0) {
      log.warn({ code, profile: profile.key }, 'project has no applied metrics');
      continue;
    }

    // Off-norm metrics are spread across categories first so the four QCDP dots differ, which is
    // the whole point of having several states on the board.
    const byCategory = new Map<string, KpiNormMetricRow[]>();
    for (const m of applied) {
      byCategory.set(m.category, [...(byCategory.get(m.category) ?? []), m]);
    }
    const spread: KpiNormMetricRow[] = [];
    for (let depth = 0; spread.length < applied.length; depth += 1) {
      for (const bucket of byCategory.values()) {
        const m = bucket[depth];
        if (m) spread.push(m);
      }
    }

    const targets = new Map<string, RagStatus>();
    for (const m of spread.slice(0, profile.reds)) targets.set(m.metric_id, 'red');
    for (const m of spread.slice(profile.reds, profile.reds + profile.ambers)) {
      targets.set(m.metric_id, 'yellow');
    }

    const measured = spread.slice(0, Math.round(applied.length * profile.coverage));

    const entries: Entry[] = [];
    for (const metric of measured) {
      const target = targets.get(metric.metric_id) ?? 'green';
      const figures = figuresForStatus(metric, target);
      if (figures) entries.push({ metric_id: metric.metric_id, ...figures });
      else log.warn({ metric: metric.name, target }, 'no figures land this metric in that band');
    }

    if (entries.length > 0) {
      await upsertKpiRecord({ project_id, ...week, entries, session });
      records += 1;
    }

    const pm = pmByCode.get(code);
    if (!profile.report || !pm) continue;
    try {
      await upsertWeeklyReport({
        project_id,
        ...week,
        executive_summary: profile.report.summary,
        risk_issue: profile.report.risk ?? null,
        road_to_green: profile.report.roadToGreen ?? null,
        road_to_green_due: profile.report.roadToGreen ? nextFriday(week) : null,
        session: { ...session, person_id: pm.workerId },
      });
      reports += 1;
    } catch (err) {
      log.warn(
        { err, code, profile: profile.key },
        'weekly report rejected — card keeps 0 reports',
      );
    }
  }

  log.info({ ...week, records, reports, profiles: PROFILES.length }, 'phase-pm-weekly done');
}

function nextFriday(week: { iso_year: number; iso_week: number }): string {
  const jan4 = new Date(Date.UTC(week.iso_year, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (week.iso_week - 1) * 7);
  monday.setUTCDate(monday.getUTCDate() + 11);
  return monday.toISOString().slice(0, 10);
}

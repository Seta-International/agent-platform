/**
 * Dev-only: seed KPI Metrics + Weekly Report demo data into the existing local tenant, so the
 * `/pm/metrics` (KPI Explorer) and `/pm/weekly` (Weekly Reports) screens have something to show.
 *
 * Unlike the full fixture seed, this does NOT need the gitignored PII workbook — it targets the
 * tenant that already exists locally (admin@example.com) and writes straight into the pm.*
 * read-model tables (seta is superuser locally, so RLS is bypassed, same trick as
 * dev-seed-hiring.ts). RAG colours are computed with the REAL @seta/pm/contracts functions, so a
 * seeded value and its stored status can never disagree with what the app would compute.
 *
 *   pnpm -F @seta/cli exec tsx src/dev-seed-pm-metrics.ts
 *
 * Re-runnable: it deletes and re-creates the demo accounts (and everything under them) each run.
 */
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coreDb } from '@seta/core/db';
import { getCurrentIsoWeek } from '@seta/pm';
import {
  type BandCondition,
  computeEntryStatus,
  computeMetricValue,
  type RagStatus,
} from '@seta/pm/contracts';
import { closePools, initPools } from '@seta/shared-db';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import { parseEnv } from './env.ts';

const log = pino({ name: 'cli/dev-seed-pm-metrics' });

process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'));
const env = parseEnv(process.env);
initPools({ databaseUrl: env.DATABASE_URL });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const WEEKS_BACK = 8; // current week + 7 prior — fills the 5-week trend and gives week-nav history.

type KpiCategory = 'quality' | 'cost_capacity' | 'delivery' | 'process';
const CATEGORIES: readonly KpiCategory[] = ['quality', 'cost_capacity', 'delivery', 'process'];

// ── Demo people (pm.person_projection is normally filled by the worker-projection subscriber;
// we insert directly for the demo). ────────────────────────────────────────────────────────
interface Person {
  id: string;
  name: string;
  title: string;
}
const PEOPLE: Person[] = [
  { id: randomUUID(), name: 'Nguyễn Văn An', title: 'Project Manager' },
  { id: randomUUID(), name: 'Trần Thị Bình', title: 'PMO Lead' },
  { id: randomUUID(), name: 'Lê Văn Cường', title: 'Engineering Manager' },
  { id: randomUUID(), name: 'Phạm Thị Dung', title: 'Senior Engineer' },
  { id: randomUUID(), name: 'Hoàng Văn Em', title: 'Engineer' },
  { id: randomUUID(), name: 'Đỗ Thị Giang', title: 'Engineer' },
];
// Tuple assertion: destructuring a Person[] infers `Person | undefined` per slot, which trips
// strict-null typecheck on every downstream AN/BINH/… use — the array literal above has exactly
// these six, so the fixed-length tuple is accurate.
const [AN, BINH, CUONG, DUNG, EM, GIANG] = PEOPLE as [
  Person,
  Person,
  Person,
  Person,
  Person,
  Person,
];

interface DemoAccount {
  name: string;
  industry: string;
}
const ACCOUNTS: DemoAccount[] = [
  { name: 'Acme Corporation', industry: 'Technology' },
  { name: 'Globex Media', industry: 'Media & Entertainment' },
  { name: 'Nordic Retail Group', industry: 'Retail' },
];

type TrendDir = 'improving' | 'worsening' | 'flat';
interface DemoProject {
  name: string;
  account: string;
  phase: string;
  pm: Person;
  team: Person[]; // staffed people (for allocations + "Staffed X/Y")
  teamSize: number; // charter team size (>= staffed, leaves an open seat or two)
  base: Record<KpiCategory, RagStatus>; // current-week category health
  driver: KpiCategory; // the category whose colour moves across the trend
  dir: TrendDir;
  summary: string; // executive summary for the current week's report
}

const PROJECTS: DemoProject[] = [
  {
    name: 'Acme Platform Rebuild',
    account: 'Acme Corporation',
    phase: 'execution',
    pm: AN,
    team: [AN, CUONG, DUNG, EM],
    teamSize: 5,
    base: { quality: 'green', cost_capacity: 'green', delivery: 'green', process: 'green' },
    driver: 'delivery',
    dir: 'improving',
    summary:
      'Sprint 14 closed on plan. Predictability back to target after last month’s scope churn; no open blockers.',
  },
  {
    name: 'Acme Data Migration',
    account: 'Acme Corporation',
    phase: 'stabilize',
    pm: CUONG,
    team: [CUONG, DUNG, GIANG],
    teamSize: 4,
    base: { quality: 'green', cost_capacity: 'yellow', delivery: 'green', process: 'green' },
    driver: 'cost_capacity',
    dir: 'flat',
    summary:
      'Cutover rehearsal successful. Cloud egress running above forecast — cost containment plan in progress.',
  },
  {
    name: 'Globex Streaming App',
    account: 'Globex Media',
    phase: 'execution',
    pm: AN,
    team: [AN, DUNG, EM, GIANG],
    teamSize: 6,
    base: { quality: 'red', cost_capacity: 'yellow', delivery: 'green', process: 'green' },
    driver: 'quality',
    dir: 'worsening',
    summary:
      'Two production defects leaked from the transcoding pipeline this week. QA gate hardening underway; release paused.',
  },
  {
    name: 'Nordic POS Modernization',
    account: 'Nordic Retail Group',
    phase: 'discovery',
    pm: CUONG,
    team: [CUONG, EM, GIANG],
    teamSize: 4,
    base: { quality: 'green', cost_capacity: 'green', delivery: 'yellow', process: 'yellow' },
    driver: 'process',
    dir: 'improving',
    summary:
      'Discovery workshops completed. Ceremony adherence improving as the new team settles; velocity still stabilising.',
  },
  {
    name: 'Nordic Loyalty Program',
    account: 'Nordic Retail Group',
    phase: 'uat',
    pm: AN,
    team: [AN, DUNG, GIANG],
    teamSize: 3,
    base: { quality: 'green', cost_capacity: 'green', delivery: 'green', process: 'green' },
    driver: 'quality',
    dir: 'flat',
    summary: 'UAT sign-off on track. All QCDP indicators green; preparing go-live checklist.',
  },
];

// ── ISO-week arithmetic (Dec 28 is always in the last ISO week of its year) ─────────────────
function isoWeeksInYear(year: number): number {
  const d = new Date(Date.UTC(year, 11, 28));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
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

// ── RAG helpers ─────────────────────────────────────────────────────────────────────────────
const RANK: Record<RagStatus, number> = { green: 0, yellow: 1, red: 2 };
const BY_RANK: RagStatus[] = ['green', 'yellow', 'red'];
const shift = (s: RagStatus, n: number): RagStatus =>
  BY_RANK[Math.max(0, Math.min(2, RANK[s] + n))]!;
const worst = (xs: RagStatus[]): RagStatus =>
  xs.reduce((w, s) => (RANK[s] > RANK[w] ? s : w), 'green' as RagStatus);
const round4 = (x: number): number => Math.round(x * 10_000) / 10_000;

/** A value comfortably in the interior of a band (not on a boundary), so rounding can't push
 * it into a neighbouring band. */
function pickInterior(cond: BandCondition): number {
  switch (cond.op) {
    case 'lte':
    case 'lt':
      return cond.value > 0 ? round4(cond.value * 0.6) : round4(cond.value - 0.5);
    case 'gte':
    case 'gt':
      return round4(cond.value + Math.max(0.03, Math.abs(cond.value) * 0.05));
    case 'eq':
      return cond.value;
    case 'between':
      return round4((cond.min + cond.max) / 2);
    case 'or':
    case 'and':
      return pickInterior(cond.conditions[0]!);
  }
}

/** Current-week base health, moved for the driver category across the trend (offset 0 = current
 * week = the "best" end for an improving project, the "worst" end for a worsening one). */
function categoryTarget(p: DemoProject, offset: number): Record<KpiCategory, RagStatus> {
  const out = { ...p.base };
  if (p.dir === 'flat' || offset === 0) return out;
  const step = Math.min(offset, 2);
  out[p.driver] = shift(p.base[p.driver], p.dir === 'improving' ? step : -step);
  return out;
}

interface CatalogMetric {
  id: string;
  category: KpiCategory;
  component_count: 1 | 2;
  green_band: BandCondition;
  yellow_band: BandCondition;
  red_band: BandCondition;
}

/** Build (component values, computed value, status) for one metric at a target RAG. */
function buildEntry(m: CatalogMetric, target: RagStatus) {
  const band = target === 'green' ? m.green_band : target === 'yellow' ? m.yellow_band : m.red_band;
  const value = pickInterior(band);
  let c1: number;
  let c2: number | null;
  if (m.component_count === 1) {
    c1 = round4(value);
    c2 = null;
  } else {
    c2 = 20; // readable denominator; the ratio c1/c2 reproduces `value`.
    c1 = round4(value * c2);
  }
  const computed = computeMetricValue(m.component_count, c1, c2);
  const status = computeEntryStatus(computed, m.green_band, m.yellow_band, m.red_band);
  return { c1, c2, computed, status };
}

async function main(): Promise<void> {
  const db = coreDb();

  const userRow = await db.execute(
    sql`SELECT id, tenant_id FROM identity."user" WHERE email = ${ADMIN_EMAIL} LIMIT 1`,
  );
  const admin = userRow.rows[0] as { id: string; tenant_id: string } | undefined;
  if (!admin) {
    throw new Error(`No user ${ADMIN_EMAIL} — bootstrap the tenant first (tenant-bootstrap.sh)`);
  }
  const tenantId = admin.tenant_id;
  const adminUserId = admin.id;
  log.info({ tenantId, admin: ADMIN_EMAIL }, 'seeding KPI + weekly-report demo data');

  const weeks = previousIsoWeeks(
    getCurrentIsoWeek().iso_year,
    getCurrentIsoWeek().iso_week,
    WEEKS_BACK,
  );
  const current = weeks[0]!;
  log.info({ current, trend_weeks: weeks.length }, 'reporting weeks');

  // ── Clean prior demo data (children first; scoped to the demo accounts) ───────────────────
  // drizzle expands a JS array as a param tuple, not a pg array — join into an IN (...) list.
  const accountNameList = sql.join(
    ACCOUNTS.map((a) => sql`${a.name}`),
    sql`, `,
  );
  const personNameList = sql.join(
    PEOPLE.map((p) => sql`${p.name}`),
    sql`, `,
  );
  const projSub = sql`SELECT id FROM pm.project WHERE tenant_id = ${tenantId} AND account_id IN
    (SELECT id FROM pm.account WHERE tenant_id = ${tenantId} AND name IN (${accountNameList}))`;
  await db.execute(
    sql`DELETE FROM pm.kpi_record_entry WHERE record_id IN (SELECT id FROM pm.kpi_record WHERE project_id IN (${projSub}))`,
  );
  await db.execute(sql`DELETE FROM pm.kpi_record WHERE project_id IN (${projSub})`);
  await db.execute(sql`DELETE FROM pm.kpi_norm_baseline WHERE project_id IN (${projSub})`);
  await db.execute(sql`DELETE FROM pm.report WHERE project_id IN (${projSub})`);
  await db.execute(sql`DELETE FROM pm.flag WHERE project_id IN (${projSub})`);
  await db.execute(sql`DELETE FROM pm.project_week_rollup WHERE project_id IN (${projSub})`);
  await db.execute(sql`DELETE FROM pm.kpi_applied_metric WHERE project_id IN (${projSub})`);
  await db.execute(sql`DELETE FROM pm.allocation WHERE project_id IN (${projSub})`);
  await db.execute(sql`DELETE FROM pm.project WHERE id IN (${projSub})`);
  await db.execute(
    sql`DELETE FROM pm.account WHERE tenant_id = ${tenantId} AND name IN (${accountNameList})`,
  );
  await db.execute(
    sql`DELETE FROM pm.person_projection WHERE tenant_id = ${tenantId} AND full_name IN (${personNameList})`,
  );
  // Directory rows + the admin↔person link (children first). Without a people.person row and a
  // user_projection pointing the admin login at one, session.person_id stays null and every
  // weekly-report save/submit fails "not linked to a worker profile" (the composer still opens,
  // because can_manage is the broader tenant-wide gate).
  await db.execute(sql`DELETE FROM people.user_projection WHERE user_id = ${adminUserId}`);
  await db.execute(
    sql`DELETE FROM people.person WHERE tenant_id = ${tenantId} AND full_name IN (${personNameList})`,
  );

  // ── People ────────────────────────────────────────────────────────────────────────────────
  // Mirror the demo roster into BOTH the pm read-model (pm.person_projection) and the source
  // directory (people.person) under the same ids, so the two never disagree.
  for (const p of PEOPLE) {
    await db.execute(
      sql`INSERT INTO pm.person_projection (person_id, tenant_id, full_name, job_title)
          VALUES (${p.id}, ${tenantId}, ${p.name}, ${p.title})`,
    );
    await db.execute(
      sql`INSERT INTO people.person (id, tenant_id, full_name, work_email)
          VALUES (${p.id}, ${tenantId}, ${p.name}, ${p.id === AN.id ? ADMIN_EMAIL : null})`,
    );
  }
  // Log in as admin@example.com ⇒ you ARE the PM "Nguyễn Văn An": the projects they manage and
  // their already-submitted weekly reports become yours to file/update.
  await db.execute(
    sql`INSERT INTO people.user_projection (user_id, tenant_id, person_id)
        VALUES (${adminUserId}, ${tenantId}, ${AN.id})`,
  );

  // ── Accounts ──────────────────────────────────────────────────────────────────────────────
  const accountId = new Map<string, string>();
  for (const a of ACCOUNTS) {
    const id = randomUUID();
    await db.execute(
      sql`INSERT INTO pm.account (id, tenant_id, name, industry, am_person_id)
          VALUES (${id}, ${tenantId}, ${a.name}, ${a.industry}, ${BINH.id})`,
    );
    accountId.set(a.name, id);
  }

  // ── Core metric catalog (Explorer shows core only; core is the mandatory default set) ─────
  const catalogRes = await db.execute(
    sql`SELECT id, category, component_count, green_band, yellow_band, red_band
        FROM pm.kpi_norm_metric
        WHERE tenant_id = ${tenantId} AND tier = 'core'
        ORDER BY sort_order`,
  );
  const catalog = catalogRes.rows as unknown as CatalogMetric[];
  log.info({ core_metrics: catalog.length }, 'core metrics loaded');

  const dueDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const engagementStart = `${current.iso_year - 1}-09-01`;

  let records = 0;
  let entries = 0;
  let reports = 0;

  for (const proj of PROJECTS) {
    const pid = randomUUID();
    const aid = accountId.get(proj.account)!;
    await db.execute(
      sql`INSERT INTO pm.project
            (id, tenant_id, account_id, name, pm_person_id, pmo_person_id, team_size,
             methodology, pricing_model, date_from, phase, status)
          VALUES
            (${pid}, ${tenantId}, ${aid}, ${proj.name}, ${proj.pm.id}, ${BINH.id}, ${proj.teamSize},
             'scrum', 'time_materials', ${engagementStart}, ${proj.phase}, 'active')`,
    );

    // Allocations → "Staffed X/Y" on the weekly detail.
    for (const person of proj.team) {
      await db.execute(
        sql`INSERT INTO pm.allocation
              (id, tenant_id, project_id, person_id, role, date_from, bucket, planned_pct,
               minutes_per_day, status)
            VALUES
              (${randomUUID()}, ${tenantId}, ${pid}, ${person.id}, ${person.title},
               ${engagementStart}, 'billable', 100, 480, 'committed')`,
      );
    }

    // Apply every core metric to the project.
    for (const m of catalog) {
      await db.execute(
        sql`INSERT INTO pm.kpi_applied_metric (tenant_id, project_id, metric_id, applied_by)
            VALUES (${tenantId}, ${pid}, ${m.id}, ${adminUserId})`,
      );
    }

    // Weekly KPI records (current + prior weeks) with RAG-consistent values.
    for (let offset = 0; offset < weeks.length; offset++) {
      const w = weeks[offset]!;
      const target = categoryTarget(proj, offset);
      const recordId = randomUUID();
      await db.execute(
        sql`INSERT INTO pm.kpi_record (id, tenant_id, project_id, iso_year, iso_week, created_by)
            VALUES (${recordId}, ${tenantId}, ${pid}, ${w.iso_year}, ${w.iso_week}, ${adminUserId})`,
      );
      records++;
      for (const m of catalog) {
        const { c1, c2, computed, status } = buildEntry(m, target[m.category]);
        await db.execute(
          sql`INSERT INTO pm.kpi_record_entry
                (id, tenant_id, record_id, metric_id, component_1_value, component_2_value,
                 computed_value, status, source)
              VALUES
                (${randomUUID()}, ${tenantId}, ${recordId}, ${m.id}, ${c1}, ${c2},
                 ${computed}, ${status}, 'manual')`,
        );
        entries++;
      }
    }

    // Current-week submitted reports — several per project, each from a different reporter with
    // its OWN declared overall (PM files the real colours; PMO and an independent reviewer file
    // their own), so the detail modal's per-report colour chips have something to show.
    const declared = categoryTarget(proj, 0);
    const overall = worst(CATEGORIES.map((c) => declared[c]));
    // A one-pillar QCDP object whose worst == the given colour (keeps declared ↔ overall coherent).
    const oneColour = (c: RagStatus): Record<KpiCategory, RagStatus> => ({
      quality: c,
      cost_capacity: 'green',
      delivery: 'green',
      process: 'green',
    });
    // reviewer = first demo person who is neither this project's PM nor the PMO.
    const reviewer = PEOPLE.find((p) => p.id !== proj.pm.id && p.id !== BINH.id)!;
    const roster: {
      person: Person;
      overall: RagStatus;
      decl: Record<KpiCategory, RagStatus>;
      note: string;
    }[] = [
      { person: proj.pm, overall, decl: declared, note: proj.summary },
      {
        person: BINH,
        overall: 'yellow',
        decl: oneColour('yellow'),
        note: 'PMO review — cost & capacity worth watching; delivery and quality on track for the milestone.',
      },
      {
        person: reviewer,
        overall: 'green',
        decl: oneColour('green'),
        note: 'Independent review — QCDP indicators within norm this week; nothing to escalate.',
      },
    ];
    for (const r of roster) {
      const rNonGreen = r.overall !== 'green';
      const reportId = randomUUID();
      const r2g = rNonGreen
        ? 'Stabilise the driving KPI back to norm and re-baseline next week.'
        : null;
      const r2gOwner = rNonGreen ? BINH.id : null;
      const r2gDue = rNonGreen ? dueDate : null;
      await db.execute(
        sql`INSERT INTO pm.report
              (id, tenant_id, project_id, iso_year, iso_week, reporter_id, status,
               declared_colours, executive_summary, road_to_green, road_to_green_owner_id,
               road_to_green_due, overall_colour)
            VALUES
              (${reportId}, ${tenantId}, ${pid}, ${current.iso_year}, ${current.iso_week},
               ${r.person.id}, 'submitted', ${sql`${JSON.stringify(r.decl)}::jsonb`},
               ${r.note}, ${r2g}, ${r2gOwner}, ${r2gDue}, ${r.overall})`,
      );
      // A submitted report always carries a published revision — the comment endpoint requires
      // one (a never-published draft has nothing to discuss), so the demo must seed it too.
      await db.execute(
        sql`INSERT INTO pm.report_revision
              (id, tenant_id, report_id, executive_summary, risk_issue, road_to_green,
               road_to_green_owner_id, road_to_green_due, overall_colour, declared_colours)
            VALUES
              (${randomUUID()}, ${tenantId}, ${reportId}, ${r.note}, ${null}, ${r2g},
               ${r2gOwner}, ${r2gDue}, ${r.overall}, ${sql`${JSON.stringify(r.decl)}::jsonb`})`,
      );
      reports++;
    }
    log.info({ project: proj.name, overall, reports: roster.length }, 'seeded project');
  }

  log.info({ projects: PROJECTS.length, records, entries, reports }, 'pm-metrics demo seed done');
}

main()
  .then(() => closePools())
  .then(() => process.exit(0))
  .catch(async (err) => {
    log.error({ err }, 'seed failed');
    await closePools();
    process.exit(1);
  });

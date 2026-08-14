/**
 * Dev-only: bulk-seed extra PM projects so /pm/weekly (and /pm/metrics) has board-scale volume —
 * pagination, week nav, portfolio-health strip and account/project filters with real numbers.
 *
 * ADDITIVE. It owns its own demo accounts (see ACCOUNTS below) and never touches the curated
 * dev-seed-pm-metrics data (Acme / Globex / Nordic) nor any report you filed by hand. It writes
 * straight into the pm.* read-model tables (seta is superuser locally, so RLS is bypassed, same
 * trick as dev-seed-pm-metrics.ts) and reuses the people already in pm.person_projection.
 *
 *   pnpm -F @seta/cli exec tsx src/dev-seed-pm-volume.ts
 *   PM_VOLUME_PROJECTS=150 PM_VOLUME_WEEKS=8 pnpm -F @seta/cli exec tsx src/dev-seed-pm-volume.ts
 *
 * Re-runnable: each run drops and rebuilds only its own accounts.
 */
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coreDb } from '@seta/core/db';
import { getCurrentIsoWeek } from '@seta/pm';
import type { RagStatus } from '@seta/pm/contracts';
import { closePools, initPools } from '@seta/shared-db';
import { type SQL, sql } from 'drizzle-orm';
import pino from 'pino';
import { parseEnv } from './env.ts';
import {
  buildEntry,
  CATEGORIES,
  type CatalogMetric,
  type KpiCategory,
  previousIsoWeeks,
  shift,
  worst,
} from './pm-demo-kpi.ts';

const log = pino({ name: 'cli/dev-seed-pm-volume' });

process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'));
const env = parseEnv(process.env);
initPools({ databaseUrl: env.DATABASE_URL });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';

function positiveInt(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1)
    throw new Error(`${name} must be a positive integer (got '${raw}')`);
  return n;
}

const PROJECT_COUNT = positiveInt('PM_VOLUME_PROJECTS', process.env.PM_VOLUME_PROJECTS, 100);
const WEEKS_BACK = positiveInt('PM_VOLUME_WEEKS', process.env.PM_VOLUME_WEEKS, 5);

interface VolumeAccount {
  name: string;
  industry: string;
  prefix: string;
}
const ACCOUNTS: VolumeAccount[] = [
  { name: 'Helios Energy', industry: 'Energy & Utilities', prefix: 'Helios' },
  { name: 'Meridian Bank', industry: 'Financial Services', prefix: 'Meridian' },
  { name: 'Aurora Health', industry: 'Healthcare', prefix: 'Aurora' },
  { name: 'Vertex Logistics', industry: 'Logistics', prefix: 'Vertex' },
  { name: 'Solstice Travel', industry: 'Travel & Hospitality', prefix: 'Solstice' },
  { name: 'Ironwood Manufacturing', industry: 'Manufacturing', prefix: 'Ironwood' },
];

const THEMES = [
  'Customer Portal',
  'Data Lakehouse',
  'Mobile App',
  'Billing Engine',
  'Field Service Suite',
  'Partner API',
  'Fraud Detection',
  'Inventory Sync',
  'Self-Service Kiosk',
  'Payments Gateway',
  'Loyalty Platform',
  'Reporting Hub',
  'Order Management',
  'Compliance Tracker',
  'Workforce Scheduler',
  'Telemetry Pipeline',
  'Contract Automation',
  'Support Assistant',
  'Warehouse Robotics',
  'Pricing Optimizer',
  'Onboarding Redesign',
  'Identity Federation',
  'Document Vault',
  'Forecasting Model',
  'Legacy Decommission',
  'Network Upgrade',
  'Claims Automation',
  'Storefront Revamp',
  'Asset Registry',
  'Quality Dashboard',
  'Procurement Portal',
  'Risk Console',
  'Sensor Rollout',
  'Booking Engine',
  'Settlement Ledger',
  'Care Coordination',
  'Route Planner',
  'Energy Monitoring',
  'Vendor Marketplace',
  'Incident Command',
];

const PHASES = ['discovery', 'execution', 'stabilize', 'uat', 'initiation'];
const METHODOLOGIES = ['scrum', 'kanban'];
const PRICING_MODELS = ['time_materials', 'fixed_price'];

type TrendDir = 'improving' | 'worsening' | 'flat';
const DIRS: TrendDir[] = ['improving', 'worsening', 'flat'];

const BASES: Record<KpiCategory, RagStatus>[] = [
  { quality: 'green', cost_capacity: 'green', delivery: 'green', process: 'green' },
  { quality: 'green', cost_capacity: 'yellow', delivery: 'green', process: 'green' },
  { quality: 'yellow', cost_capacity: 'green', delivery: 'yellow', process: 'green' },
  { quality: 'red', cost_capacity: 'yellow', delivery: 'green', process: 'green' },
  { quality: 'green', cost_capacity: 'green', delivery: 'red', process: 'yellow' },
  { quality: 'yellow', cost_capacity: 'yellow', delivery: 'yellow', process: 'yellow' },
  { quality: 'green', cost_capacity: 'red', delivery: 'yellow', process: 'green' },
  { quality: 'green', cost_capacity: 'green', delivery: 'green', process: 'yellow' },
];

interface Person {
  id: string;
  name: string;
  title: string;
}

interface VolumeProject {
  name: string;
  account: VolumeAccount;
  phase: string;
  methodology: string;
  pricing_model: string;
  pm: Person;
  pmo: Person;
  team: Person[];
  teamSize: number;
  base: Record<KpiCategory, RagStatus>;
  driver: KpiCategory;
  dir: TrendDir;
  noKpi: boolean;
  reporters: Person[];
}

function projectName(i: number): string {
  const theme = THEMES[Math.floor(i / ACCOUNTS.length) % THEMES.length]!;
  const cycle = Math.floor(i / (ACCOUNTS.length * THEMES.length));
  const base = `${ACCOUNTS[i % ACCOUNTS.length]!.prefix} ${theme}`;
  return cycle === 0 ? base : `${base} ${cycle + 1}`;
}

function categoryTarget(p: VolumeProject, offset: number): Record<KpiCategory, RagStatus> {
  const out = { ...p.base };
  if (p.dir === 'flat' || offset === 0) return out;
  const step = Math.min(offset, 2);
  out[p.driver] = shift(p.base[p.driver], p.dir === 'improving' ? step : -step);
  return out;
}

function rows(values: SQL[]): SQL {
  return sql.join(values, sql`, `);
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

  const adminPersonRow = await db.execute(
    sql`SELECT person_id FROM people.user_projection WHERE user_id = ${adminUserId} LIMIT 1`,
  );
  const adminPersonId = (adminPersonRow.rows[0] as { person_id: string } | undefined)?.person_id;

  const rosterRes = await db.execute(
    sql`SELECT person_id AS id, full_name AS name, coalesce(job_title, '') AS title
        FROM pm.person_projection WHERE tenant_id = ${tenantId} ORDER BY full_name`,
  );
  const roster = rosterRes.rows as unknown as Person[];
  if (roster.length < 3) {
    throw new Error('pm.person_projection is (nearly) empty — run dev-seed-pm-metrics.ts first');
  }
  const managers = roster.filter((p) => /Manager|Lead|Director/i.test(p.title));
  const pmPool = (managers.length > 0 ? managers : roster).filter((p) => !/PMO/i.test(p.title));
  const pmoPool = roster.filter((p) => /PMO/i.test(p.title));
  const staffPool = roster.filter((p) => !/PMO|Account Manager|Board/i.test(p.title));
  if (pmPool.length === 0 || pmoPool.length === 0 || staffPool.length < 3) {
    throw new Error('roster lacks PM/PMO/staff people — run dev-seed-pm-metrics.ts first');
  }
  const adminPerson = roster.find((p) => p.id === adminPersonId);

  const weeks = previousIsoWeeks(
    getCurrentIsoWeek().iso_year,
    getCurrentIsoWeek().iso_week,
    WEEKS_BACK,
  );
  const current = weeks[0]!;
  log.info(
    { tenantId, admin: ADMIN_EMAIL, projects: PROJECT_COUNT, weeks: weeks.length, current },
    'seeding weekly-report volume',
  );

  const accountNameList = rows(ACCOUNTS.map((a) => sql`${a.name}`));
  const projSub = sql`SELECT id FROM pm.project WHERE tenant_id = ${tenantId} AND account_id IN
    (SELECT id FROM pm.account WHERE tenant_id = ${tenantId} AND name IN (${accountNameList}))`;
  await db.execute(sql`DELETE FROM pm.kpi_norm_baseline WHERE project_id IN (${projSub})`);
  await db.execute(sql`DELETE FROM pm.allocation WHERE project_id IN (${projSub})`);
  await db.execute(
    sql`ALTER TABLE pm.flag_audit_entry DISABLE TRIGGER flag_audit_entry_append_only`,
  );
  try {
    await db.execute(sql`DELETE FROM pm.project WHERE id IN (${projSub})`);
  } finally {
    await db.execute(
      sql`ALTER TABLE pm.flag_audit_entry ENABLE TRIGGER flag_audit_entry_append_only`,
    );
  }
  await db.execute(
    sql`DELETE FROM pm.account WHERE tenant_id = ${tenantId} AND name IN (${accountNameList})`,
  );

  const accountId = new Map<string, string>();
  await db.execute(
    sql`INSERT INTO pm.account (id, tenant_id, name, industry) VALUES ${rows(
      ACCOUNTS.map((a) => {
        const id = randomUUID();
        accountId.set(a.name, id);
        return sql`(${id}, ${tenantId}, ${a.name}, ${a.industry})`;
      }),
    )}`,
  );

  const catalogRes = await db.execute(
    sql`SELECT id, category, component_count, green_band, yellow_band, red_band
        FROM pm.kpi_norm_metric
        WHERE tenant_id = ${tenantId} AND tier = 'core'
        ORDER BY sort_order`,
  );
  const catalog = catalogRes.rows as unknown as CatalogMetric[];
  if (catalog.length === 0) throw new Error('no core KPI metrics in pm.kpi_norm_metric');
  log.info({ core_metrics: catalog.length }, 'core metrics loaded');

  const projects: VolumeProject[] = Array.from({ length: PROJECT_COUNT }, (_, i) => {
    const pm = i % 3 === 0 && adminPerson ? adminPerson : pmPool[i % pmPool.length]!;
    const pmo = pmoPool[i % pmoPool.length]!;
    const team = [
      staffPool[i % staffPool.length]!,
      staffPool[(i + 1) % staffPool.length]!,
      staffPool[(i + 2) % staffPool.length]!,
      ...(i % 2 === 0 ? [staffPool[(i + 3) % staffPool.length]!] : []),
    ].filter((p, idx, all) => all.findIndex((q) => q.id === p.id) === idx);
    return {
      name: projectName(i),
      account: ACCOUNTS[i % ACCOUNTS.length]!,
      phase: PHASES[i % PHASES.length]!,
      methodology: METHODOLOGIES[i % METHODOLOGIES.length]!,
      pricing_model: PRICING_MODELS[i % PRICING_MODELS.length]!,
      pm,
      pmo,
      team,
      teamSize: team.length + (i % 3 === 0 ? 1 : 0),
      base: BASES[i % BASES.length]!,
      driver: CATEGORIES[i % CATEGORIES.length]!,
      dir: DIRS[i % DIRS.length]!,
      noKpi: i % 9 === 8,
      reporters: i % 5 < 2 ? (i % 10 === 0 ? [pm, pmo] : [pm]) : [],
    };
  });

  const engagementStart = `${current.iso_year - 1}-09-01`;
  const dueDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  let records = 0;
  let entries = 0;
  let reports = 0;

  for (const proj of projects) {
    const pid = randomUUID();
    await db.execute(
      sql`INSERT INTO pm.project
            (id, tenant_id, account_id, name, pm_person_id, pmo_person_id, team_size,
             methodology, pricing_model, date_from, phase, status)
          VALUES
            (${pid}, ${tenantId}, ${accountId.get(proj.account.name)!}, ${proj.name},
             ${proj.pm.id}, ${proj.pmo.id}, ${proj.teamSize}, ${proj.methodology},
             ${proj.pricing_model}, ${engagementStart}, ${proj.phase}, 'active')`,
    );

    await db.execute(
      sql`INSERT INTO pm.project_access (tenant_id, project_id, person_id, level) VALUES ${rows(
        [proj.pm, proj.pmo].map((p) => sql`(${tenantId}, ${pid}, ${p.id}, 'owner')`),
      )}`,
    );

    await db.execute(
      sql`INSERT INTO pm.allocation
            (id, tenant_id, project_id, person_id, role, date_from, bucket, planned_pct,
             minutes_per_day, status)
          VALUES ${rows(
            proj.team.map(
              (p) =>
                sql`(${randomUUID()}, ${tenantId}, ${pid}, ${p.id}, ${p.title || 'Engineer'},
                     ${engagementStart}, 'billable', 100, 480, 'committed')`,
            ),
          )}`,
    );

    await db.execute(
      sql`INSERT INTO pm.kpi_applied_metric (tenant_id, project_id, metric_id, applied_by)
          VALUES ${rows(catalog.map((m) => sql`(${tenantId}, ${pid}, ${m.id}, ${adminUserId})`))}`,
    );

    for (const [offset, w] of weeks.entries()) {
      if (proj.noKpi && offset === 0) continue;
      const target = categoryTarget(proj, offset);
      const recordId = randomUUID();
      await db.execute(
        sql`INSERT INTO pm.kpi_record (id, tenant_id, project_id, iso_year, iso_week, created_by)
            VALUES (${recordId}, ${tenantId}, ${pid}, ${w.iso_year}, ${w.iso_week}, ${adminUserId})`,
      );
      records++;
      await db.execute(
        sql`INSERT INTO pm.kpi_record_entry
              (id, tenant_id, record_id, metric_id, component_1_value, component_2_value,
               computed_value, status, source)
            VALUES ${rows(
              catalog.map((m) => {
                const { c1, c2, computed, status } = buildEntry(m, target[m.category]);
                entries++;
                return sql`(${randomUUID()}, ${tenantId}, ${recordId}, ${m.id}, ${c1}, ${c2},
                            ${computed}, ${status}, 'manual')`;
              }),
            )}`,
      );
    }

    const declared = categoryTarget(proj, 0);
    for (const [idx, reporter] of proj.reporters.entries()) {
      const decl =
        idx === 0
          ? declared
          : ({
              quality: 'green',
              cost_capacity: 'yellow',
              delivery: 'green',
              process: 'green',
            } as Record<KpiCategory, RagStatus>);
      const overall = worst(CATEGORIES.map((c) => decl[c]));
      const summary =
        idx === 0
          ? `${proj.name}: QCDP tracked for the week — see the pillar chips for the detail.`
          : 'PMO review — cost & capacity worth watching; delivery and quality on track.';
      const nonGreen = overall !== 'green';
      const r2g = nonGreen
        ? 'Stabilise the driving KPI back to norm and re-baseline next week.'
        : null;
      const r2gOwner = nonGreen ? proj.pmo.id : null;
      const r2gDue = nonGreen ? dueDate : null;
      const reportId = randomUUID();
      await db.execute(
        sql`INSERT INTO pm.report
              (id, tenant_id, project_id, iso_year, iso_week, reporter_id, status,
               declared_colours, executive_summary, road_to_green, road_to_green_owner_id,
               road_to_green_due, overall_colour)
            VALUES
              (${reportId}, ${tenantId}, ${pid}, ${current.iso_year}, ${current.iso_week},
               ${reporter.id}, 'submitted', ${sql`${JSON.stringify(decl)}::jsonb`}, ${summary},
               ${r2g}, ${r2gOwner}, ${r2gDue}, ${overall})`,
      );
      await db.execute(
        sql`INSERT INTO pm.report_revision
              (id, tenant_id, report_id, executive_summary, risk_issue, road_to_green,
               road_to_green_owner_id, road_to_green_due, overall_colour, declared_colours)
            VALUES
              (${randomUUID()}, ${tenantId}, ${reportId}, ${summary}, ${null}, ${r2g},
               ${r2gOwner}, ${r2gDue}, ${overall}, ${sql`${JSON.stringify(decl)}::jsonb`})`,
      );
      reports++;
    }
  }

  log.info(
    {
      accounts: ACCOUNTS.length,
      projects: projects.length,
      records,
      entries,
      reports,
      reportless: projects.filter((p) => p.reporters.length === 0).length,
      no_kpi_this_week: projects.filter((p) => p.noKpi).length,
    },
    'pm volume seed done',
  );
}

main()
  .then(() => closePools())
  .then(() => process.exit(0))
  .catch(async (err) => {
    log.error({ err }, 'seed failed');
    await closePools();
    process.exit(1);
  });

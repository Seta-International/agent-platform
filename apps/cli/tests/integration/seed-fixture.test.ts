import { coreDb } from '@seta/core/db';
import { startDispatcher } from '@seta/core/runtime';
import { resetCoreDb } from '@seta/core/testing';
import { resetHiringDb } from '@seta/hiring/testing';
import { resetIdentityDb } from '@seta/identity/testing';
import { getOrgCompany, getOrgStructure } from '@seta/people';
import { resetPeopleDb } from '@seta/people/testing';
import { resetPlannerDb } from '@seta/planner/testing';
import { resetPmDb } from '@seta/pm/testing';
import { closePools, initPools, maintenance } from '@seta/shared-db';
import { getPool } from '@seta/shared-db/composition';
import { withTestDb } from '@seta/shared-testing';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { buildMigrationRegistry } from '../../src/commands/migrate.ts';
import { buildAdminSession } from '../../src/commands/seed.ts';
import { seedFixtureCommand } from '../../src/commands/seed-fixture/index.ts';

const MINI_DIR = new URL('./fixtures/mini', import.meta.url).pathname;

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function waitFor(
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 15_000,
  intervalMs = 100,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

interface Counts {
  workers: number;
  users: number;
  role_assignments: number;
  accounts: number;
  projects: number;
  allocations: number;
  groups: number;
  tasks: number;
  task_assignments: number;
  assignee_projection: number;
  requisitions: number;
  skill_categories: number;
  skills: number;
  candidate_skills: number;
  requisition_skills: number;
  org_units: number;
  events: number;
}

async function getCounts(): Promise<Counts> {
  const r = await coreDb().execute(sql`
    SELECT
      (SELECT COUNT(*) FROM people.worker WHERE deleted_at IS NULL)::int AS workers,
      (SELECT COUNT(*) FROM identity."user")::int AS users,
      (SELECT COUNT(*) FROM identity.role_assignments WHERE revoked_at IS NULL)::int AS role_assignments,
      (SELECT COUNT(*) FROM pm.account)::int AS accounts,
      (SELECT COUNT(*) FROM pm.project WHERE deleted_at IS NULL)::int AS projects,
      (SELECT COUNT(*) FROM pm.allocation WHERE deleted_at IS NULL)::int AS allocations,
      (SELECT COUNT(*) FROM planner.groups WHERE deleted_at IS NULL)::int AS groups,
      (SELECT COUNT(*) FROM planner.tasks WHERE deleted_at IS NULL)::int AS tasks,
      (SELECT COUNT(*) FROM planner.task_assignments)::int AS task_assignments,
      (SELECT COUNT(*) FROM planner.assignee_projection WHERE deactivated_at IS NULL)::int AS assignee_projection,
      (SELECT COUNT(*) FROM hiring.requisition)::int AS requisitions,
      (SELECT COUNT(*) FROM core.skill_category)::int AS skill_categories,
      (SELECT COUNT(*) FROM core.skill)::int AS skills,
      (SELECT COUNT(*) FROM hiring.candidate_skill)::int AS candidate_skills,
      (SELECT COUNT(*) FROM hiring.requisition_skill)::int AS requisition_skills,
      (SELECT COUNT(*) FROM people.org_unit)::int AS org_units,
      (SELECT COUNT(*) FROM core.events)::int AS events
  `);
  return r.rows[0] as Counts;
}

const ADMIN_EMAIL = 'admin.test@example.test';

// The whole seed runs per test — 60 skills, 7 groups, people, pm, hiring. It takes ~15s
// locally and 5-8x that on CI, where every package's suite shares a 4-vCPU runner.
const SEED_TIMEOUT_MS = 300_000;

describe('seed-fixture end-to-end', () => {
  // A test that dies mid-run (timeout) never reaches its own closePools(), and the next
  // one then fails on "Pools already initialized" instead of on its own merits.
  // closePools() is a no-op when there are none.
  afterEach(async () => {
    await closePools();
  });

  it('with --demo, populates every module and is idempotent', {
    timeout: SEED_TIMEOUT_MS,
  }, async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      // Reset all module DB singletons
      resetCoreDb();
      resetIdentityDb();
      resetPeopleDb();
      resetPmDb();
      resetPlannerDb();
      resetHiringDb();

      initPools({ databaseUrl });

      // Start dispatcher with all module subscribers so assignee_projection gets populated
      const reg = buildMigrationRegistry();
      const dispatcher = await startDispatcher({
        pool: getPool('worker'),
        subscribers: [...reg.collected.subscribers],
        pollIntervalMs: 100,
      });

      try {
        // seedFixtureCommand bootstraps a tenant and bulk-seeds every module — the same
        // genuinely cross-tenant, admin-level operation apps/cli's own entry point wraps
        // in maintenance() (see index.ts). This test calls the command directly, bypassing
        // that entry point, so it needs its own maintenance() wrap.
        await maintenance(async () => {
          // No explicit tenant-create and no adminEmail — seedFixtureCommand bootstraps the tenant
          // and derives the admin from the workbook's first ADMIN-role employee (admin.test@…).
          await seedFixtureCommand({
            tenant: 'test-co',
            dir: MINI_DIR,
            demo: true,
          });

          // Wait for subscribers (assignee_projection) to catch up. The 4 workbook employees
          // (the ADMIN row is the bootstrap admin, not a separate account) project in; the
          // edge-cases phase then deactivates one, leaving ≥ 3 active.
          await waitFor(async () => {
            const r = await pool.query<{ cnt: string }>(
              `SELECT COUNT(*)::text AS cnt FROM planner.assignee_projection WHERE deactivated_at IS NULL`,
            );
            return Number(r.rows[0]?.cnt ?? 0) >= 3;
          });

          // The edge-cases phase deactivates one user (the deactivated-user case);
          // the planner identity-projection subscriber cascades unassignment (deletes
          // their task_assignments) async. Wait for it to land so the before/after
          // snapshots compare steady states.
          await waitFor(async () => {
            const r = await pool.query<{ cnt: string }>(
              `SELECT COUNT(*)::text AS cnt FROM planner.assignee_projection WHERE deactivated_at IS NOT NULL`,
            );
            return Number(r.rows[0]?.cnt ?? 0) >= 1;
          });

          const before = await getCounts();

          expect(before.workers).toBeGreaterThanOrEqual(4);
          expect(before.users).toBeGreaterThanOrEqual(4);
          expect(before.role_assignments).toBeGreaterThan(0);
          expect(before.accounts).toBeGreaterThanOrEqual(1);
          expect(before.projects).toBeGreaterThanOrEqual(1);
          expect(before.allocations).toBeGreaterThanOrEqual(2);
          expect(before.groups).toBeGreaterThanOrEqual(1);
          expect(before.tasks).toBeGreaterThan(0);
          expect(before.assignee_projection).toBeGreaterThan(0);
          expect(before.requisitions).toBeGreaterThanOrEqual(1);
          expect(before.skill_categories).toBeGreaterThanOrEqual(5);
          expect(before.skills).toBeGreaterThanOrEqual(20);
          expect(before.candidate_skills).toBeGreaterThan(0);
          expect(before.requisition_skills).toBeGreaterThan(0);
          expect(before.events).toBeGreaterThan(0);

          // Org spine: Executive + Operation + 7 functions + Delivery + PMO = 11 units.
          expect(before.org_units).toBe(11);
          const adminSession = await buildAdminSession(
            (
              await coreDb().execute(
                sql`SELECT id FROM core.tenants WHERE slug = 'test-co' LIMIT 1`,
              )
            ).rows[0]!.id as string,
            ADMIN_EMAIL,
          );
          const { units } = await getOrgStructure(adminSession);
          expect(units.find((u) => u.kind === 'executive')?.head).toBeTruthy();
          expect(units.filter((u) => u.kind === 'function')).toHaveLength(7);
          expect(units.some((u) => u.kind === 'delivery')).toBe(true);
          expect(units.some((u) => u.kind === 'pmo')).toBe(true);
          // Workers place into units by their primary allocation's dept (STP900 → Delivery).
          // getOrgStructure no longer carries per-unit members; the company tree exposes the count.
          const { nodes: companyNodes } = await getOrgCompany(adminSession);
          expect(companyNodes.find((n) => n.kind === 'delivery')?.count ?? 0).toBeGreaterThan(0);

          // Org scoping demo: a delivery-lead-<unit> group per top-level delivery unit, carrying
          // org_unit-scoped pm.manager + people.viewer, with the unit's head as a member.
          const deliveryUnit = units.find((u) => u.kind === 'delivery')!;
          const deliveryLeadSlug = `delivery-lead-${deliveryUnit.name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')}`;
          const groupRow = (
            await coreDb().execute(
              sql`SELECT id FROM identity.access_group WHERE tenant_id = ${adminSession.tenant_id} AND slug = ${deliveryLeadSlug}`,
            )
          ).rows[0] as { id: string } | undefined;
          expect(groupRow).toBeTruthy();
          const roleRows = (
            await coreDb().execute(
              sql`SELECT role_slug, scope_kind, scope_id FROM identity.access_group_role WHERE group_id = ${groupRow!.id} ORDER BY role_slug`,
            )
          ).rows as Array<{ role_slug: string; scope_kind: string; scope_id: string }>;
          expect(roleRows).toEqual([
            { role_slug: 'people.viewer', scope_kind: 'org_unit', scope_id: deliveryUnit.id },
            { role_slug: 'pm.manager', scope_kind: 'org_unit', scope_id: deliveryUnit.id },
          ]);
          const memberRows = (
            await coreDb().execute(
              sql`SELECT user_id FROM identity.access_group_membership WHERE group_id = ${groupRow!.id}`,
            )
          ).rows as Array<{ user_id: string }>;
          expect(memberRows.length).toBeGreaterThan(0);

          // The base member persona carries a self-scoped people.viewer — every seeded worker's
          // group memberships resolve at least one non-tenant-scoped role assignment.
          const nonTenantScoped = (
            await coreDb().execute(
              sql`SELECT DISTINCT agr.scope_kind FROM identity.access_group_role agr
                JOIN identity.access_group ag ON ag.id = agr.group_id
                WHERE ag.tenant_id = ${adminSession.tenant_id} AND agr.scope_kind <> 'tenant'
                ORDER BY agr.scope_kind`,
            )
          ).rows as Array<{ scope_kind: string }>;
          expect(nonTenantScoped.map((r) => r.scope_kind)).toEqual(['org_unit', 'self']);

          // Second run — must be idempotent
          await seedFixtureCommand({
            tenant: 'test-co',
            dir: MINI_DIR,
            demo: true,
          });

          // Let the dispatcher settle back to the deactivated steady state (the
          // edge-case deactivated-user) before snapshotting.
          await new Promise((r) => setTimeout(r, 500));
          await waitFor(async () => {
            const r = await pool.query<{ cnt: string }>(
              `SELECT COUNT(*)::text AS cnt FROM planner.assignee_projection WHERE deactivated_at IS NOT NULL`,
            );
            return Number(r.rows[0]?.cnt ?? 0) >= 1;
          });

          const after = await getCounts();

          // Core structural rows must be unchanged
          expect(after.workers).toEqual(before.workers);
          expect(after.users).toEqual(before.users);
          expect(after.accounts).toEqual(before.accounts);
          expect(after.projects).toEqual(before.projects);
          expect(after.allocations).toEqual(before.allocations);
          expect(after.groups).toEqual(before.groups);
          expect(after.tasks).toEqual(before.tasks);
          expect(after.task_assignments).toEqual(before.task_assignments);
          expect(after.assignee_projection).toEqual(before.assignee_projection);
          expect(after.requisitions).toEqual(before.requisitions);
          expect(after.skill_categories).toEqual(before.skill_categories);
          expect(after.skills).toEqual(before.skills);
          expect(after.candidate_skills).toEqual(before.candidate_skills);
          expect(after.requisition_skills).toEqual(before.requisition_skills);
          expect(after.org_units).toEqual(before.org_units);
        });
      } finally {
        await dispatcher.shutdown(5_000);
        await closePools();
      }
    });
  });

  it('default seed (no --demo) is prod-shaped: real data only', {
    timeout: SEED_TIMEOUT_MS,
  }, async () => {
    await withTestDb(ctx, async ({ databaseUrl }) => {
      resetCoreDb();
      resetIdentityDb();
      resetPeopleDb();
      resetPmDb();
      resetPlannerDb();
      resetHiringDb();

      initPools({ databaseUrl });

      const reg = buildMigrationRegistry();
      const dispatcher = await startDispatcher({
        pool: getPool('worker'),
        subscribers: [...reg.collected.subscribers],
        pollIntervalMs: 100,
      });

      try {
        // Same cross-tenant admin operation as the test above — see that comment.
        await maintenance(async () => {
          // No adminEmail, no --demo: admin is derived from the workbook, and the synthetic
          // demo phases (planner tasks, hiring, edge cases) are all skipped.
          await seedFixtureCommand({ tenant: 'test-co', dir: MINI_DIR });

          const counts = await getCounts();

          // Real structural data is present…
          expect(counts.workers).toBeGreaterThanOrEqual(4);
          expect(counts.users).toBeGreaterThanOrEqual(4);
          expect(counts.projects).toBeGreaterThanOrEqual(1);
          expect(counts.allocations).toBeGreaterThanOrEqual(2);
          expect(counts.groups).toBeGreaterThanOrEqual(1); // empty boards are still scaffolded
          expect(counts.org_units).toBe(11);

          // …but every synthetic demo artifact is absent.
          expect(counts.tasks).toBe(0);
          expect(counts.task_assignments).toBe(0);
          expect(counts.requisitions).toBe(0);
          expect(counts.candidate_skills).toBe(0);
          expect(counts.requisition_skills).toBe(0);

          // The bootstrap admin is a real workbook employee — never a synthetic admin@example.com.
          const emails = (
            await coreDb().execute(
              sql`SELECT lower(email) AS email FROM identity."user" WHERE lower(email) IN (${ADMIN_EMAIL}, 'admin@example.com')`,
            )
          ).rows as Array<{ email: string }>;
          const emailSet = new Set(emails.map((r) => r.email));
          expect(emailSet.has(ADMIN_EMAIL)).toBe(true);
          expect(emailSet.has('admin@example.com')).toBe(false);

          // Edge-cases phase is skipped, so no worker is deactivated.
          const deactivated = (
            await coreDb().execute(
              sql`SELECT COUNT(*)::int AS n FROM people.worker WHERE deleted_at IS NOT NULL`,
            )
          ).rows[0] as { n: number };
          expect(deactivated.n).toBe(0);
        });
      } finally {
        await dispatcher.shutdown(5_000);
        await closePools();
      }
    });
  });
});

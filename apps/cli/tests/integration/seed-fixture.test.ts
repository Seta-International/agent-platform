import { coreDb } from '@seta/core/db';
import { startDispatcher } from '@seta/core/runtime';
import { resetCoreDb } from '@seta/core/testing';
import { resetHiringDb } from '@seta/hiring/testing';
import { resetIdentityDb } from '@seta/identity/testing';
import { resetPeopleDb } from '@seta/people/testing';
import { resetPlannerDb } from '@seta/planner/testing';
import { resetPmDb } from '@seta/pm/testing';
import { closePools, getPool, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { buildMigrationRegistry } from '../../src/commands/migrate.ts';
import { seedFixtureCommand } from '../../src/commands/seed-fixture/index.ts';
import { tenantCreateCommand } from '../../src/commands/tenant-create.ts';

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
  role_grants: number;
  accounts: number;
  projects: number;
  allocations: number;
  groups: number;
  tasks: number;
  task_assignments: number;
  assignee_projection: number;
  requisitions: number;
  events: number;
}

async function getCounts(): Promise<Counts> {
  const r = await coreDb().execute(sql`
    SELECT
      (SELECT COUNT(*) FROM people.worker WHERE deleted_at IS NULL)::int AS workers,
      (SELECT COUNT(*) FROM identity."user")::int AS users,
      (SELECT COUNT(*) FROM identity.role_grants WHERE revoked_at IS NULL)::int AS role_grants,
      (SELECT COUNT(*) FROM pm.account)::int AS accounts,
      (SELECT COUNT(*) FROM pm.project WHERE deleted_at IS NULL)::int AS projects,
      (SELECT COUNT(*) FROM pm.allocation WHERE deleted_at IS NULL)::int AS allocations,
      (SELECT COUNT(*) FROM planner.groups WHERE deleted_at IS NULL)::int AS groups,
      (SELECT COUNT(*) FROM planner.tasks WHERE deleted_at IS NULL)::int AS tasks,
      (SELECT COUNT(*) FROM planner.task_assignments)::int AS task_assignments,
      (SELECT COUNT(*) FROM planner.assignee_projection WHERE deactivated_at IS NULL)::int AS assignee_projection,
      (SELECT COUNT(*) FROM hiring.requisition)::int AS requisitions,
      (SELECT COUNT(*) FROM core.events)::int AS events
  `);
  return r.rows[0] as Counts;
}

describe('seed-fixture end-to-end', () => {
  it('populates every module and is idempotent', { timeout: 120_000 }, async () => {
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
        // Bootstrap tenant + admin
        await tenantCreateCommand({
          name: 'SETA International',
          slug: 'seta-international',
          adminEmail: 'admin@seta-international.vn',
          adminPassword: 'ChangeMe@2026',
        });

        // Run the full seed pipeline
        await seedFixtureCommand({
          tenant: 'seta-international',
          dir: MINI_DIR,
          adminEmail: 'admin@seta-international.vn',
        });

        // Wait for subscribers (assignee_projection) to catch up
        // We seeded 4 employees + 1 admin = at least 5 users → projection should have ≥ 5 rows
        await waitFor(async () => {
          const r = await pool.query<{ cnt: string }>(
            `SELECT COUNT(*)::text AS cnt FROM planner.assignee_projection WHERE deactivated_at IS NULL`,
          );
          return Number(r.rows[0]?.cnt ?? 0) >= 4;
        });

        // The edge-cases phase deactivates one user; the planner identity-projection
        // subscriber cascades unassignment (deletes their task_assignments) async.
        // Wait for that to land so the before/after snapshots compare steady states.
        await waitFor(async () => {
          const r = await pool.query<{ cnt: string }>(
            `SELECT COUNT(*)::text AS cnt FROM planner.assignee_projection WHERE deactivated_at IS NOT NULL`,
          );
          return Number(r.rows[0]?.cnt ?? 0) >= 1;
        });

        const before = await getCounts();

        expect(before.workers).toBeGreaterThanOrEqual(4);
        expect(before.users).toBeGreaterThanOrEqual(4);
        expect(before.role_grants).toBeGreaterThan(0);
        expect(before.accounts).toBeGreaterThanOrEqual(1);
        expect(before.projects).toBeGreaterThanOrEqual(1);
        expect(before.allocations).toBeGreaterThanOrEqual(2);
        expect(before.groups).toBeGreaterThanOrEqual(1);
        expect(before.tasks).toBeGreaterThan(0);
        expect(before.assignee_projection).toBeGreaterThan(0);
        expect(before.requisitions).toBeGreaterThanOrEqual(1);
        expect(before.events).toBeGreaterThan(0);

        // Second run — must be idempotent
        await seedFixtureCommand({
          tenant: 'seta-international',
          dir: MINI_DIR,
          adminEmail: 'admin@seta-international.vn',
        });

        // Let the dispatcher drain any profile-updated events from the rerun.
        await new Promise((r) => setTimeout(r, 500));

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
      } finally {
        await dispatcher.shutdown(5_000);
        await closePools();
      }
    });
  });
});

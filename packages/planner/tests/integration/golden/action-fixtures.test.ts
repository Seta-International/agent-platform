// Every fixture builder a case can name, run for real against Postgres.
//
// A builder that silently creates nothing is the worst failure mode here: the case
// that names it then runs against an empty tenant and "the agent found nothing" looks
// like an agent bug. So the assertion is on the ids, per builder.
import { expect, it } from 'vitest';
import { FIXTURE_BUILDERS, makeFixtureRunner } from '../../fixtures/golden/action/fixtures.ts';
import { cleanActionWorld, seedActionWorld } from '../../fixtures/golden/action/world.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

it('every builder creates its rows and returns addressable ids', async () => {
  await withAgentTestDb(async ({ pool }) => {
    const world = await seedActionWorld(pool);
    const run = makeFixtureRunner({ pool, world });

    for (const name of Object.keys(FIXTURE_BUILDERS)) {
      const ids = await run([name]);
      expect(Object.keys(ids).length, `${name} returned no ids`).toBeGreaterThan(0);
      for (const [key, id] of Object.entries(ids)) {
        expect(id, `${name}.${key} is not a uuid`).toMatch(/^[0-9a-f-]{36}$/);
      }
      await pool.query('DELETE FROM planner.task_comments WHERE tenant_id = ANY($1)', [
        [world.tenantId, world.foreignTenantId],
      ]);
      await pool.query('DELETE FROM planner.task_assignments WHERE tenant_id = ANY($1)', [
        [world.tenantId, world.foreignTenantId],
      ]);
      await pool.query('DELETE FROM planner.tasks WHERE tenant_id = ANY($1)', [
        [world.tenantId, world.foreignTenantId],
      ]);
    }
    await cleanActionWorld(pool, world);
  });
}, 300_000);

it('overCapBatch creates 21 tasks — one more than BULK_TARGET_CAP', async () => {
  await withAgentTestDb(async ({ pool }) => {
    const world = await seedActionWorld(pool);
    await makeFixtureRunner({ pool, world })(['overCapBatch']);
    const rows = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM planner.tasks WHERE tenant_id = $1 AND title LIKE 'Batch task%'",
      [world.tenantId],
    );
    expect(rows.rows[0]!.n).toBe(21);
    await cleanActionWorld(pool, world);
  });
}, 300_000);

it('rejects an unknown builder name loudly', async () => {
  await withAgentTestDb(async ({ pool }) => {
    const world = await seedActionWorld(pool);
    await expect(makeFixtureRunner({ pool, world })(['nope'])).rejects.toThrow(/unknown fixture/);
    await cleanActionWorld(pool, world);
  });
}, 300_000);

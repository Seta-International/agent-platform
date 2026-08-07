import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

/** tenant + group + plan + N bare tasks, inserted with raw SQL so no domain
 *  function's rules are in play. */
async function seedRawTasks(pool: Pool, n: number) {
  const tenantId = randomUUID();
  const creator = randomUUID();
  await pool.query('INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)', [
    tenantId,
    `Org ${tenantId.slice(0, 8)}`,
    `org-${tenantId.slice(0, 8)}`,
  ]);
  const groupId = randomUUID();
  await pool.query(
    `INSERT INTO planner.groups
       (id, tenant_id, name, theme, visibility, default_role, external_source, created_by)
     VALUES ($1, $2, $3, 'blue', 'private', 'member', 'native', $4)`,
    [groupId, tenantId, `G ${groupId.slice(0, 8)}`, creator],
  );
  const planId = randomUUID();
  await pool.query(
    `INSERT INTO planner.plans (id, tenant_id, group_id, name, external_source, created_by)
     VALUES ($1, $2, $3, 'Plan', 'native', $4)`,
    [planId, tenantId, groupId, creator],
  );
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO planner.tasks (id, tenant_id, plan_id, title, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, tenantId, planId, `Task ${i}`, creator],
    );
    ids.push(id);
  }
  return { tenantId, creator, ids };
}

function insertLink(
  pool: Pool,
  tenantId: string,
  source: string,
  target: string,
  kind: string,
  creator: string,
) {
  return pool.query(
    `INSERT INTO planner.task_links (tenant_id, source_task_id, target_task_id, kind, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, source, target, kind, creator],
  );
}

describe('planner.task_links — storage-level rules', () => {
  it('refuses a self-link with a CHECK', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, creator, ids } = await seedRawTasks(pool, 1);
      await expect(
        insertLink(pool, tenantId, ids[0]!, ids[0]!, 'relates', creator),
      ).rejects.toMatchObject({ code: '23514' });
    }));

  it('refuses the same link twice', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, creator, ids } = await seedRawTasks(pool, 2);
      await insertLink(pool, tenantId, ids[0]!, ids[1]!, 'relates', creator);
      await expect(
        insertLink(pool, tenantId, ids[0]!, ids[1]!, 'relates', creator),
      ).rejects.toMatchObject({ code: '23505' });
    }));

  // The normalised-pair index. Each kind is one fact, so it exists in at most
  // one direction — including `blocks`, where a mutual block is incoherent.
  it.each(['relates', 'duplicates', 'blocks'])(
    'refuses %s in both directions on the same pair',
    (kind) =>
      withAgentTestDb(async ({ pool }) => {
        const { tenantId, creator, ids } = await seedRawTasks(pool, 2);
        await insertLink(pool, tenantId, ids[0]!, ids[1]!, kind, creator);
        await expect(
          insertLink(pool, tenantId, ids[1]!, ids[0]!, kind, creator),
        ).rejects.toMatchObject({ code: '23505' });
      }),
  );

  // `kind` is part of the key, and must be: dedup writes `relates` and a later
  // merge writes `duplicates` on the same pair.
  it('allows relates(A,B) alongside duplicates(A,B)', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, creator, ids } = await seedRawTasks(pool, 2);
      await insertLink(pool, tenantId, ids[0]!, ids[1]!, 'relates', creator);
      await insertLink(pool, tenantId, ids[0]!, ids[1]!, 'duplicates', creator);
      const rows = await pool.query(
        'SELECT kind FROM planner.task_links WHERE source_task_id = $1 ORDER BY kind',
        [ids[0]],
      );
      expect(rows.rows.map((r) => r.kind)).toEqual(['duplicates', 'relates']);
    }));

  // One canonical duplicate target per task — the partial index.
  it('refuses a second duplicates row out of the same source', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, creator, ids } = await seedRawTasks(pool, 3);
      await insertLink(pool, tenantId, ids[0]!, ids[1]!, 'duplicates', creator);
      await expect(
        insertLink(pool, tenantId, ids[0]!, ids[2]!, 'duplicates', creator),
      ).rejects.toMatchObject({ code: '23505' });
    }));

  it('allows several relates rows out of the same source', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, creator, ids } = await seedRawTasks(pool, 3);
      await insertLink(pool, tenantId, ids[0]!, ids[1]!, 'relates', creator);
      await insertLink(pool, tenantId, ids[0]!, ids[2]!, 'relates', creator);
      const rows = await pool.query('SELECT 1 FROM planner.task_links WHERE source_task_id = $1', [
        ids[0],
      ]);
      expect(rows.rows).toHaveLength(2);
    }));

  it('refuses a kind outside the enum', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, creator, ids } = await seedRawTasks(pool, 2);
      await expect(
        insertLink(pool, tenantId, ids[0]!, ids[1]!, 'supersedes', creator),
      ).rejects.toMatchObject({ code: '23514' });
    }));

  // The §8.6 guard, at the storage level: two opposite `duplicates` inserts in
  // OVERLAPPING transactions. The second waits on the first's uncommitted index
  // entry, then aborts. Plan 05 runs the same race through two whole merges.
  it('serialises two opposite duplicates inserts — exactly one survives', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, creator, ids } = await seedRawTasks(pool, 2);
      const a = await pool.connect();
      const b = await pool.connect();
      try {
        await a.query('BEGIN');
        await b.query('BEGIN');
        await a.query(
          `INSERT INTO planner.task_links (tenant_id, source_task_id, target_task_id, kind, created_by)
           VALUES ($1, $2, $3, 'duplicates', $4)`,
          [tenantId, ids[0], ids[1], creator],
        );
        const blocked = b.query(
          `INSERT INTO planner.task_links (tenant_id, source_task_id, target_task_id, kind, created_by)
           VALUES ($1, $2, $3, 'duplicates', $4)`,
          [tenantId, ids[1], ids[0], creator],
        );
        await a.query('COMMIT');
        await expect(blocked).rejects.toMatchObject({ code: '23505' });
        await b.query('ROLLBACK');
      } finally {
        a.release();
        b.release();
      }
      const rows = await pool.query('SELECT source_task_id FROM planner.task_links');
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].source_task_id).toBe(ids[0]);
    }));
});

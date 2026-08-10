import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

/** tenant + group + plan + N bare tasks, raw SQL, so no domain function's rules
 *  are in play. This suite tests the STORAGE, and nothing else. */
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
  return { tenantId, ids };
}

/** A link row, written the way the domain writes it: url is the target's
 *  plan-free canonical path, type is the kind. */
function insertLink(pool: Pool, tenantId: string, source: string, target: string, type: string) {
  return pool.query(
    `INSERT INTO planner.task_references (tenant_id, task_id, url, type)
     VALUES ($1, $2, '/planner/tasks/' || $3::text, $4)`,
    [tenantId, source, target, type],
  );
}

describe('planner.task_references — link rows, storage-level rules', () => {
  it('accepts all three link kinds', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, ids } = await seedRawTasks(pool, 4);
      const [a, b, c, d] = ids as [string, string, string, string];
      await insertLink(pool, tenantId, a, b, 'relates');
      await insertLink(pool, tenantId, a, c, 'blocks');
      await insertLink(pool, tenantId, a, d, 'duplicates');
      const rows = await pool.query(
        `SELECT type FROM planner.task_references WHERE task_id = $1 ORDER BY type`,
        [a],
      );
      expect(rows.rows.map((r: { type: string }) => r.type)).toEqual([
        'blocks',
        'duplicates',
        'relates',
      ]);
    }));

  it('refuses a self-link with a CHECK', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, ids } = await seedRawTasks(pool, 1);
      const [a] = ids as [string];
      await expect(insertLink(pool, tenantId, a, a, 'relates')).rejects.toThrow(
        /task_references_no_self/,
      );
    }));

  // Makes get-task's `::uuid` cast total: no row the type filter admits can be
  // unparseable, so the read has no malformed-data branch.
  it('refuses a link row whose url is not the canonical path', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, ids } = await seedRawTasks(pool, 2);
      const [a, b] = ids as [string, string];
      await expect(
        pool.query(
          `INSERT INTO planner.task_references (tenant_id, task_id, url, type)
           VALUES ($1, $2, '/planner/plans/p/tasks/' || $3::text, 'relates')`,
          [tenantId, a, b],
        ),
      ).rejects.toThrow(/task_references_link_url_canonical/);
    }));

  it('refuses the same (task_id, url) twice', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, ids } = await seedRawTasks(pool, 2);
      const [a, b] = ids as [string, string];
      await insertLink(pool, tenantId, a, b, 'relates');
      await expect(insertLink(pool, tenantId, a, b, 'relates')).rejects.toMatchObject({
        code: '23505',
      });
    }));

  // THE collision D8 rests on: the unique index ignores `type`, so one
  // pair-direction holds one kind at a time. Asserted, never assumed — every
  // refusal branch in link-tasks.ts exists because of this row.
  it('refuses a second kind on the same pair-direction, because the index ignores type', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, ids } = await seedRawTasks(pool, 2);
      const [a, b] = ids as [string, string];
      await insertLink(pool, tenantId, a, b, 'relates');
      await expect(insertLink(pool, tenantId, a, b, 'duplicates')).rejects.toMatchObject({
        code: '23505',
      });
    }));

  it('refuses a second duplicates row out of the same task', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, ids } = await seedRawTasks(pool, 3);
      const [a, b, c] = ids as [string, string, string];
      await insertLink(pool, tenantId, a, b, 'duplicates');
      await expect(insertLink(pool, tenantId, a, c, 'duplicates')).rejects.toMatchObject({
        code: '23505',
      });
    }));

  // The discriminator, from the other side: a BOOKMARK may carry a canonical
  // task url. It stays a bookmark, renders in the URL group, and is what makes
  // §3.4's no-backfill promise self-consistent instead of merely tolerated.
  it('still accepts a bookmark row whose url happens to be a task path', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, ids } = await seedRawTasks(pool, 2);
      const [a, b] = ids as [string, string];
      await insertLink(pool, tenantId, a, b, 'link');
      const rows = await pool.query(`SELECT type FROM planner.task_references WHERE task_id = $1`, [
        a,
      ]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].type).toBe('link');
    }));
});

import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  checkAfter,
  diffActionRows,
  snapshotActionRows,
} from '../../fixtures/golden/action/db-snapshot.ts';
import { cleanActionWorld, seedActionWorld } from '../../fixtures/golden/action/world.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';

it('sees a due-date change as exactly one changed row, and names the column', async () => {
  await withAgentTestDb(async ({ pool }) => {
    const world = await seedActionWorld(pool);
    const taskId = randomUUID();
    await pool.query(
      `INSERT INTO planner.tasks (id, tenant_id, plan_id, bucket_id, title, due_at, created_by)
       VALUES ($1, $2, $3, $4, 'Deploy API', '2026-08-15T09:00:00+07', $5)`,
      [taskId, world.tenantId, world.planId, world.bucketId, world.adminUserId],
    );

    const before = await snapshotActionRows(pool, world);
    expect(diffActionRows(before, before).rowsChanged).toBe(0);

    await pool.query(
      `UPDATE planner.tasks SET due_at = '2026-08-19T09:00:00+07', version = version + 1
       WHERE id = $1`,
      [taskId],
    );
    const after = await snapshotActionRows(pool, world);
    const diff = diffActionRows(before, after);
    expect(diff.rowsChanged).toBe(1);
    expect(diff.changedKeys).toEqual([`planner.tasks:${taskId}`]);

    // Column assertions read the DB vocabulary, not the model's.
    expect(
      checkAfter(after, [{ table: 'planner.tasks', id: taskId, due_at: '2026-08-19' }]),
    ).toEqual([]);
    const wrong = checkAfter(after, [{ table: 'planner.tasks', id: taskId, due_at: '2026-08-15' }]);
    expect(wrong).toHaveLength(1);
    expect(wrong[0]).toContain('due_at');

    await cleanActionWorld(pool, world);
  });
}, 300_000);

it('counts an inserted comment and a soft-deleted task as two changed rows', async () => {
  await withAgentTestDb(async ({ pool }) => {
    const world = await seedActionWorld(pool);
    const taskId = randomUUID();
    await pool.query(
      `INSERT INTO planner.tasks (id, tenant_id, plan_id, bucket_id, title, created_by)
       VALUES ($1, $2, $3, $4, 'Alpha', $5)`,
      [taskId, world.tenantId, world.planId, world.bucketId, world.adminUserId],
    );
    const before = await snapshotActionRows(pool, world);

    await pool.query(
      `INSERT INTO planner.task_comments (id, tenant_id, task_id, body, author_id)
       VALUES ($1, $2, $3, 'ship it', $4)`,
      [randomUUID(), world.tenantId, taskId, world.memberUserId],
    );
    await pool.query('UPDATE planner.tasks SET deleted_at = now() WHERE id = $1', [taskId]);

    const diff = diffActionRows(before, await snapshotActionRows(pool, world));
    expect(diff.rowsChanged).toBe(2);
    expect(diff.changedKeys.some((k) => k.startsWith('planner.task_comments:'))).toBe(true);

    await cleanActionWorld(pool, world);
  });
}, 300_000);

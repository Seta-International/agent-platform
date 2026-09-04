import { describe, expect, it } from 'vitest';
import { makeActionTaskMerge } from '../../../../src/backend/orchestration/action/adapters.ts';
import { withAgentTestDb } from '../../agent-tools-helpers.ts';
import { seedTasksFixture } from './seed-tasks-fixture.ts';

describe('action runtime — gated merge', () => {
  // Spec §6.2 test 7.
  it('links the duplicate to the keeper and trashes it, in one transaction', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, tasks } = await seedTasksFixture(pool, {
        titles: ['Duplicate', 'Keeper'],
      });
      const [dup, keep] = tasks as [{ taskId: string; version: number }, { taskId: string }];

      const out = await makeActionTaskMerge().merge({
        tenantId,
        actorUserId,
        duplicateTaskId: dup.taskId,
        duplicateExpectedVersion: dup.version,
        keepTaskId: keep.taskId,
        idempotencyKey: 'merge-1',
      });
      expect(out.replayed).toBe(false);

      // A link is a typed task_references row: `type` is the kind, `url` is the
      // target's plan-free canonical path (spec §3.1).
      const link = await pool.query(
        `SELECT type, url FROM planner.task_references
          WHERE task_id = $1 AND type IN ('relates','duplicates','blocks')`,
        [dup.taskId],
      );
      expect(link.rows).toHaveLength(1);
      expect(link.rows[0].type).toBe('duplicates');
      expect(link.rows[0].url).toBe(`/planner/tasks/${keep.taskId}`);

      const rows = await pool.query('SELECT deleted_at FROM planner.tasks WHERE id = $1', [
        dup.taskId,
      ]);
      expect(rows.rows[0].deleted_at).not.toBeNull();

      const kept = await pool.query('SELECT deleted_at FROM planner.tasks WHERE id = $1', [
        keep.taskId,
      ]);
      expect(kept.rows[0].deleted_at).toBeNull();

      const keys = await pool.query(
        'SELECT mutation_kind FROM core.mutation_idempotency WHERE key = $1',
        ['merge-1'],
      );
      expect(keys.rows[0].mutation_kind).toBe('merge_soft_delete');
    }));

  // Spec §6.2 test 8 — the whole reason this is ONE withGatedMutation.
  it('rolls the link back when the delete fails, leaving no half-merge', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, tasks } = await seedTasksFixture(pool, {
        titles: ['Duplicate', 'Keeper'],
      });
      const [dup, keep] = tasks as [{ taskId: string; version: number }, { taskId: string }];

      await expect(
        makeActionTaskMerge().merge({
          tenantId,
          actorUserId,
          duplicateTaskId: dup.taskId,
          // Stale: somebody edited the duplicate between preview and Confirm.
          duplicateExpectedVersion: dup.version + 5,
          keepTaskId: keep.taskId,
          idempotencyKey: 'merge-fail',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      // A task in the trash with nothing pointing at where its content went is
      // the exact failure mode this test exists to prevent — and so is a link row
      // pointing out of a task that is still live.
      const link = await pool.query(
        `SELECT 1 FROM planner.task_references WHERE type IN ('relates','duplicates','blocks')`,
      );
      expect(link.rows).toHaveLength(0);
      const rows = await pool.query('SELECT deleted_at FROM planner.tasks WHERE id = $1', [
        dup.taskId,
      ]);
      expect(rows.rows[0].deleted_at).toBeNull();
      const keys = await pool.query('SELECT 1 FROM core.mutation_idempotency WHERE key = $1', [
        'merge-fail',
      ]);
      expect(keys.rows).toHaveLength(0);
    }));

  // Spec §6.2 test 8, second half: merge PROMOTES an existing relates row rather
  // than inserting a second one, so the rollback has to undo an UPDATE, not only
  // an INSERT. A row left as `duplicates` on two live tasks is the failure.
  it('leaves a pre-existing relates row unpromoted when the delete fails', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, tasks } = await seedTasksFixture(pool, {
        titles: ['Duplicate', 'Keeper'],
      });
      const [dup, keep] = tasks as [{ taskId: string; version: number }, { taskId: string }];
      await pool.query(
        `INSERT INTO planner.task_references (tenant_id, task_id, url, type)
         VALUES ($1, $2, '/planner/tasks/' || $3::text, 'relates')`,
        [tenantId, dup.taskId, keep.taskId],
      );

      await expect(
        makeActionTaskMerge().merge({
          tenantId,
          actorUserId,
          duplicateTaskId: dup.taskId,
          duplicateExpectedVersion: dup.version + 5,
          keepTaskId: keep.taskId,
          idempotencyKey: 'merge-promote-fail',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      const rows = await pool.query(`SELECT type FROM planner.task_references WHERE task_id = $1`, [
        dup.taskId,
      ]);
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].type).toBe('relates');
    }));

  // Spec §6.2 test 9. `snapshot` runs once before the body and once after; the
  // "after" read must NOT filter deleted_at IS NULL or the audit row loses it.
  it('records a non-null after-snapshot even though the task is now soft-deleted', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, tasks } = await seedTasksFixture(pool, {
        titles: ['Duplicate', 'Keeper'],
      });
      const [dup, keep] = tasks as [{ taskId: string; version: number }, { taskId: string }];

      await makeActionTaskMerge().merge({
        tenantId,
        actorUserId,
        duplicateTaskId: dup.taskId,
        duplicateExpectedVersion: dup.version,
        keepTaskId: keep.taskId,
        idempotencyKey: 'merge-audit',
      });

      const events = await pool.query(
        `SELECT event_type, actor, before, after FROM core.events
          WHERE aggregate_id = $1 ORDER BY occurred_at`,
        [dup.taskId],
      );
      const deleted = events.rows.find(
        (r: { event_type: string }) => r.event_type === 'planner.task.deleted',
      );
      expect(deleted.before).not.toBeNull();
      expect(deleted.after).not.toBeNull();
      expect(deleted.after.deleted_at).not.toBeNull();
      expect(deleted.actor).toMatchObject({ actor_kind: 'agent', on_behalf_of: actorUserId });
    }));

  it('replays the same key without merging twice', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, tasks } = await seedTasksFixture(pool, {
        titles: ['Duplicate', 'Keeper'],
      });
      const [dup, keep] = tasks as [{ taskId: string; version: number }, { taskId: string }];
      const port = makeActionTaskMerge();
      const args = {
        tenantId,
        actorUserId,
        duplicateTaskId: dup.taskId,
        duplicateExpectedVersion: dup.version,
        keepTaskId: keep.taskId,
        idempotencyKey: 'merge-replay',
      };
      await port.merge(args);
      const second = await port.merge(args);
      expect(second.replayed).toBe(true);
      const link = await pool.query(
        `SELECT 1 FROM planner.task_references WHERE type IN ('relates','duplicates','blocks')`,
      );
      expect(link.rows).toHaveLength(1);
    }));
  it('lets exactly one of two opposite merges win, on two connections', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, tasks } = await seedTasksFixture(pool, {
        titles: ['Alpha', 'Beta'],
      });
      const [a, b] = tasks as [
        { taskId: string; version: number },
        { taskId: string; version: number },
      ];
      const port = makeActionTaskMerge();

      // Two users, same pair, opposite opinions about which one is the duplicate.
      const results = await Promise.allSettled([
        port.merge({
          tenantId,
          actorUserId,
          duplicateTaskId: a.taskId,
          duplicateExpectedVersion: a.version,
          keepTaskId: b.taskId,
          idempotencyKey: 'race-a',
        }),
        port.merge({
          tenantId,
          actorUserId,
          duplicateTaskId: b.taskId,
          duplicateExpectedVersion: b.version,
          keepTaskId: a.taskId,
          idempotencyKey: 'race-b',
        }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      // Which refusal the loser gets is genuinely nondeterministic, because its
      // endpoint read happens BEFORE it blocks on the pair lock: DUPLICATE_REFERENCE
      // from the post-lock pre-check ("already merged the other way round"),
      // CONFLICT if it read a stale version, or NOT_FOUND if the winner's commit
      // landed before its own endpoint read and the task was already trashed. All
      // three are clean refusals. What must NOT happen is both landing.
      expect(['DUPLICATE_REFERENCE', 'CONFLICT', 'NOT_FOUND']).toContain(
        (rejected.reason as { code?: string }).code,
      );

      const links = await pool.query(
        `SELECT 1 FROM planner.task_references WHERE type IN ('relates','duplicates','blocks')`,
      );
      expect(links.rows).toHaveLength(1);

      // The decisive assertion: two tasks, exactly one survives.
      const live = await pool.query(
        'SELECT id FROM planner.tasks WHERE id = ANY($1) AND deleted_at IS NULL',
        [[a.taskId, b.taskId]],
      );
      expect(live.rows).toHaveLength(1);
    }));
});

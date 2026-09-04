import { describe, expect, it } from 'vitest';
import {
  makeActionTaskRead,
  makeActionTaskUpdate,
} from '../../../../src/backend/orchestration/action/adapters.ts';
import { withAgentTestDb } from '../../agent-tools-helpers.ts';
import { seedTasksFixture } from './seed-tasks-fixture.ts';

describe('action runtime — gated update, one target', () => {
  it('writes once, records the key as `update`, and attributes the event to the agent', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, tasks } = await seedTasksFixture(pool, {
        titles: ['AWS migration'],
        due_at: '2026-08-12T16:59:00.000Z',
      });
      const only = tasks[0]!;

      const first = await makeActionTaskUpdate().updateMany({
        tenantId,
        actorUserId,
        targets: [{ taskId: only.taskId, expectedVersion: only.version }],
        patch: { due_at: '2026-08-15T16:59:00.000Z' },
        idempotencyKey: 'key-1',
      });
      expect(first.replayed).toBe(false);
      expect(first.taskIds).toEqual([only.taskId]);

      const task = await pool.query('SELECT due_at FROM planner.tasks WHERE id = $1', [
        only.taskId,
      ]);
      expect(new Date(task.rows[0].due_at).toISOString()).toBe('2026-08-15T16:59:00.000Z');

      const keys = await pool.query(
        'SELECT mutation_kind FROM core.mutation_idempotency WHERE tenant_id = $1 AND key = $2',
        [tenantId, 'key-1'],
      );
      expect(keys.rows).toHaveLength(1);
      // One target keeps saying `update`, so the audit vocabulary means what it says.
      expect(keys.rows[0].mutation_kind).toBe('update');

      // Read the audit row directly, the way FUT-812 does.
      const events = await pool.query(
        `SELECT actor, before, after FROM core.events
          WHERE aggregate_id = $1 AND event_type = 'planner.task.updated'
          ORDER BY occurred_at DESC LIMIT 1`,
        [only.taskId],
      );
      expect(events.rows[0].actor).toMatchObject({
        actor_kind: 'agent',
        on_behalf_of: actorUserId,
      });
      expect(events.rows[0].before).not.toBeNull();
      expect(events.rows[0].after).not.toBeNull();
    }));

  it('replays the same key without writing twice', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, tasks } = await seedTasksFixture(pool, {
        titles: ['AWS migration'],
        due_at: '2026-08-12T16:59:00.000Z',
      });
      const only = tasks[0]!;
      const port = makeActionTaskUpdate();
      const args = {
        tenantId,
        actorUserId,
        targets: [{ taskId: only.taskId, expectedVersion: only.version }],
        patch: { due_at: '2026-08-15T16:59:00.000Z' } as const,
        idempotencyKey: 'key-replay',
      };
      await port.updateMany(args);
      const second = await port.updateMany(args);
      expect(second.replayed).toBe(true);
      const rows = await pool.query('SELECT version FROM planner.tasks WHERE id = $1', [
        only.taskId,
      ]);
      expect(rows.rows[0].version).toBe(only.version + 1);
    }));

  it('the read port surfaces the version the card must capture', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, groupId, tasks } = await seedTasksFixture(pool, {
        titles: ['AWS migration'],
      });
      const only = tasks[0]!;
      const [snap] = await makeActionTaskRead().readMany({
        tenantId,
        actorUserId,
        taskIds: [only.taskId],
      });
      expect(snap!.version).toBe(only.version);
      expect(snap!.groupId).toBe(groupId);
    }));

  it('readMany returns snapshots in the order asked, so card rows match targets', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, tasks } = await seedTasksFixture(pool, {
        titles: ['Alpha', 'Beta', 'Gamma'],
      });
      const asked = [tasks[2]!.taskId, tasks[0]!.taskId, tasks[1]!.taskId];
      const snaps = await makeActionTaskRead().readMany({ tenantId, actorUserId, taskIds: asked });
      expect(snaps.map((s) => s.taskId)).toEqual(asked);
      expect(snaps.map((s) => s.title)).toEqual(['Gamma', 'Alpha', 'Beta']);
    }));
});

describe('action runtime — gated update, a batch', () => {
  // The shape FUT-818's AC gets wrong: ONE idempotency row and ONE shared
  // before/after pair, but N events — one per task, because every read-model
  // projection is keyed on a single task.
  it('a batch of 3 is one idempotency row, one shared snapshot pair, and 3 events', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, tasks } = await seedTasksFixture(pool, {
        titles: ['Alpha', 'Beta', 'Gamma'],
      });

      const out = await makeActionTaskUpdate().updateMany({
        tenantId,
        actorUserId,
        targets: tasks.map((t) => ({ taskId: t.taskId, expectedVersion: t.version })),
        patch: { percent_complete: 100 },
        idempotencyKey: 'batch-1',
      });
      expect(out.taskIds).toHaveLength(3);

      const keys = await pool.query(
        'SELECT mutation_kind FROM core.mutation_idempotency WHERE tenant_id = $1 AND key = $2',
        [tenantId, 'batch-1'],
      );
      expect(keys.rows).toHaveLength(1);
      expect(keys.rows[0].mutation_kind).toBe('bulk_update');

      const events = await pool.query(
        `SELECT aggregate_id, actor, before, after FROM core.events
          WHERE event_type = 'planner.task.updated'
            AND aggregate_id = ANY($1::text[])`,
        [tasks.map((t) => t.taskId)],
      );
      expect(events.rows).toHaveLength(3);
      for (const row of events.rows) {
        expect(row.actor).toMatchObject({ actor_kind: 'agent', on_behalf_of: actorUserId });
        // The batch snapshot is an ARRAY, shared by every event of the batch.
        expect(Array.isArray(row.before)).toBe(true);
        expect(row.before).toHaveLength(3);
        expect(Array.isArray(row.after)).toBe(true);
      }

      const progressed = await pool.query(
        'SELECT progress FROM planner.tasks WHERE id = ANY($1::uuid[])',
        [tasks.map((t) => t.taskId)],
      );
      expect(progressed.rows.map((r) => r.progress)).toEqual(['done', 'done', 'done']);
    }));

  it('one stale expectedVersion rolls the whole batch back and leaves no key', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, tasks } = await seedTasksFixture(pool, {
        titles: Array.from({ length: 10 }, (_, i) => `Task ${i}`),
      });
      const port = makeActionTaskUpdate();

      await expect(
        port.updateMany({
          tenantId,
          actorUserId,
          targets: tasks.map((t, i) => ({
            taskId: t.taskId,
            // The 6th target's version is wrong — somebody edited it since the preview.
            expectedVersion: i === 5 ? t.version + 7 : t.version,
          })),
          patch: { percent_complete: 100 },
          idempotencyKey: 'stale-batch',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      const rows = await pool.query(
        'SELECT progress FROM planner.tasks WHERE id = ANY($1::uuid[])',
        [tasks.map((t) => t.taskId)],
      );
      // All-or-nothing: the five that came before the conflict are NOT written.
      expect(rows.rows.every((r) => r.progress === 'not_started')).toBe(true);
      const keys = await pool.query('SELECT 1 FROM core.mutation_idempotency WHERE key = $1', [
        'stale-batch',
      ]);
      expect(keys.rows).toHaveLength(0);
    }));
});

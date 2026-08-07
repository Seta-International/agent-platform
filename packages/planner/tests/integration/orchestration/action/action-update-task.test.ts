import { randomUUID } from 'node:crypto';
import { createUser } from '@seta/identity';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  makeActionTaskRead,
  makeActionTaskUpdate,
} from '../../../../src/backend/orchestration/action/adapters.ts';
import { withAgentTestDb } from '../../agent-tools-helpers.ts';

interface SeededTasks {
  tenantId: string;
  actorUserId: string;
  groupId: string;
  tasks: Array<{ taskId: string; version: number }>;
}

/**
 * Seed tenant + org.admin actor + a group the admin belongs to + plan/bucket +
 * N tasks in ONE plan. Group membership matters: the update port's permission
 * gate is group-scoped, and getTaskGroupId resolves the group via the plan.
 */
async function seedTasksFixture(
  pool: Pool,
  opts: { titles: string[]; due_at?: string | null },
): Promise<SeededTasks> {
  const tenantId = randomUUID();
  await pool.query('INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)', [
    tenantId,
    `Org ${tenantId.slice(0, 8)}`,
    `org-${tenantId.slice(0, 8)}`,
  ]);

  const admin = await createUser(
    {
      tenant_id: tenantId,
      email: `admin-${tenantId.slice(0, 8)}@example.test`,
      name: 'Admin',
      password: 'correct-horse-battery-staple',
      initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
    },
    { type: 'cli', user_id: null },
  );

  const creator = randomUUID();
  const groupId = randomUUID();
  await pool.query(
    `INSERT INTO planner.groups
       (id, tenant_id, name, theme, visibility, default_role, external_source, created_by, deleted_at)
     VALUES ($1, $2, $3, 'blue', 'private', 'member', 'native', $4, NULL)`,
    [groupId, tenantId, `Group ${groupId.slice(0, 8)}`, creator],
  );
  await pool.query(
    `INSERT INTO planner.group_members (tenant_id, group_id, user_id, role, added_by)
     VALUES ($1, $2, $3, 'member', $4)`,
    [tenantId, groupId, admin.user_id, creator],
  );
  const planId = randomUUID();
  await pool.query(
    `INSERT INTO planner.plans (id, tenant_id, group_id, name, external_source, created_by)
     VALUES ($1, $2, $3, $4, 'native', $5)`,
    [planId, tenantId, groupId, `Plan ${planId.slice(0, 8)}`, creator],
  );
  const bucketId = randomUUID();
  await pool.query(
    `INSERT INTO planner.buckets (id, tenant_id, plan_id, name, external_source, created_by)
     VALUES ($1, $2, $3, $4, 'native', $5)`,
    [bucketId, tenantId, planId, `Bucket ${bucketId.slice(0, 8)}`, creator],
  );

  const tasks: Array<{ taskId: string; version: number }> = [];
  for (const title of opts.titles) {
    const taskId = randomUUID();
    const inserted = await pool.query<{ version: number }>(
      `INSERT INTO planner.tasks
         (id, tenant_id, plan_id, bucket_id, title, due_at, created_by, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
       RETURNING version`,
      [taskId, tenantId, planId, bucketId, title, opts.due_at ?? null, creator],
    );
    tasks.push({ taskId, version: inserted.rows[0]?.version as number });
  }

  return { tenantId, actorUserId: admin.user_id, groupId, tasks };
}

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

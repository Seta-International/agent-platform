import { randomUUID } from 'node:crypto';
import { createUser } from '@seta/identity';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  makeActionTaskRead,
  makeActionTaskUpdate,
} from '../../../../src/backend/orchestration/action/adapters.ts';
import { withAgentTestDb } from '../../agent-tools-helpers.ts';

interface SeededTask {
  tenantId: string;
  actorUserId: string;
  taskId: string;
  groupId: string;
  version: number;
}

/**
 * Seed tenant + org.admin actor + a group the admin belongs to + plan/bucket/task.
 * Group membership matters: the update port's permission gate is group-scoped, and
 * getTaskGroupId resolves the group through the task's plan.
 */
async function seedTaskFixture(
  pool: Pool,
  opts: { title: string; due_at: string | null },
): Promise<SeededTask> {
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
    `INSERT INTO planner.plans
       (id, tenant_id, group_id, name, external_source, created_by)
     VALUES ($1, $2, $3, $4, 'native', $5)`,
    [planId, tenantId, groupId, `Plan ${planId.slice(0, 8)}`, creator],
  );
  const bucketId = randomUUID();
  await pool.query(
    `INSERT INTO planner.buckets
       (id, tenant_id, plan_id, name, external_source, created_by)
     VALUES ($1, $2, $3, $4, 'native', $5)`,
    [bucketId, tenantId, planId, `Bucket ${bucketId.slice(0, 8)}`, creator],
  );
  const taskId = randomUUID();
  const inserted = await pool.query<{ version: number }>(
    `INSERT INTO planner.tasks
       (id, tenant_id, plan_id, bucket_id, title, due_at, created_by, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
     RETURNING version`,
    [taskId, tenantId, planId, bucketId, opts.title, opts.due_at, creator],
  );

  return {
    tenantId,
    actorUserId: admin.user_id,
    taskId,
    groupId,
    version: inserted.rows[0]?.version as number,
  };
}

describe('action runtime — gated update', () => {
  it('writes once, records the key, and attributes the event to the agent', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, taskId, version } = await seedTaskFixture(pool, {
        title: 'AWS migration',
        due_at: '2026-08-12T16:59:00.000Z',
      });

      const first = await makeActionTaskUpdate().update({
        tenantId,
        actorUserId,
        taskId,
        expectedVersion: version,
        patch: { due_at: '2026-08-15T16:59:00.000Z' },
        idempotencyKey: 'key-1',
      });
      expect(first.replayed).toBe(false);

      const task = await pool.query('SELECT due_at FROM planner.tasks WHERE id = $1', [taskId]);
      expect(new Date(task.rows[0].due_at).toISOString()).toBe('2026-08-15T16:59:00.000Z');

      const keys = await pool.query(
        'SELECT mutation_kind FROM core.mutation_idempotency WHERE tenant_id = $1 AND key = $2',
        [tenantId, 'key-1'],
      );
      expect(keys.rows).toHaveLength(1);
      expect(keys.rows[0].mutation_kind).toBe('update');

      // Read the audit row directly, the way FUT-812 does.
      const events = await pool.query(
        `SELECT actor, before, after FROM core.events
          WHERE aggregate_id = $1 AND event_type = 'planner.task.updated'
          ORDER BY occurred_at DESC LIMIT 1`,
        [taskId],
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
      const { tenantId, actorUserId, taskId, version } = await seedTaskFixture(pool, {
        title: 'AWS migration',
        due_at: '2026-08-12T16:59:00.000Z',
      });
      const port = makeActionTaskUpdate();
      const args = {
        tenantId,
        actorUserId,
        taskId,
        expectedVersion: version,
        patch: { due_at: '2026-08-15T16:59:00.000Z' } as const,
        idempotencyKey: 'key-replay',
      };
      await port.update(args);
      const second = await port.update(args);
      expect(second.replayed).toBe(true);
      const rows = await pool.query('SELECT version FROM planner.tasks WHERE id = $1', [taskId]);
      expect(rows.rows[0].version).toBe(version + 1);
    }));

  it('refuses a stale expectedVersion and leaves no idempotency row behind', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenantId, actorUserId, taskId, version } = await seedTaskFixture(pool, {
        title: 'AWS migration',
        due_at: '2026-08-12T16:59:00.000Z',
      });
      const port = makeActionTaskUpdate();
      // Somebody else changes the task between preview and Confirm.
      await port.update({
        tenantId,
        actorUserId,
        taskId,
        expectedVersion: version,
        patch: { due_at: '2026-08-20T16:59:00.000Z' },
        idempotencyKey: 'other-key',
      });

      await expect(
        port.update({
          tenantId,
          actorUserId,
          taskId,
          expectedVersion: version, // the version the card captured — now stale
          patch: { due_at: '2026-08-15T16:59:00.000Z' },
          idempotencyKey: 'stale-key',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      const rows = await pool.query('SELECT due_at FROM planner.tasks WHERE id = $1', [taskId]);
      expect(new Date(rows.rows[0].due_at).toISOString()).toBe('2026-08-20T16:59:00.000Z');
      const keys = await pool.query('SELECT 1 FROM core.mutation_idempotency WHERE key = $1', [
        'stale-key',
      ]);
      expect(keys.rows).toHaveLength(0);
    }));

  it('the read port surfaces the version the card must capture', () =>
    withAgentTestDb(async ({ pool }) => {
      const { actorUserId, tenantId, taskId, version, groupId } = await seedTaskFixture(pool, {
        title: 'AWS migration',
        due_at: null,
      });
      const snap = await makeActionTaskRead().read({ tenantId, actorUserId, taskId });
      expect(snap.version).toBe(version);
      expect(snap.groupId).toBe(groupId);
    }));
});

import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  assignTask,
  completeTask,
  createGroup,
  createPlan,
  createTask,
  reopenTask,
  unassignTask,
} from '../../src/index.ts';
import { countEvents, readEvents, seedTenant } from '../helpers.ts';

// ---------------------------------------------------------------------------
// assignTask
// ---------------------------------------------------------------------------

describe('assignTask', () => {
  it('inserts task_assignment and emits planner.task.assigned', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [{ name: 'Alice', email: 'alice@example.test' }],
          });
          const session = seeded.adminSession;
          const alice = seeded.users[0]!;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T', session });

          await assignTask({ task_id: task.id, user_id: alice.user_id, session });

          const { rows } = await pool.query(
            `SELECT task_id, user_id FROM planner.task_assignments WHERE task_id = $1 AND user_id = $2`,
            [task.id, alice.user_id],
          );
          expect(rows).toHaveLength(1);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.task.assigned');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.task_id).toBe(task.id);
          expect(payload.plan_id).toBe(plan.id);
          expect(payload.group_id).toBe(group.id);
          expect(payload.user_id).toBe(alice.user_id);
          expect(payload.actor.user_id).toBe(session.user_id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('is idempotent: second assign call is a no-op (no duplicate event)', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [{ name: 'Bob', email: 'bob@example.test' }],
          });
          const session = seeded.adminSession;
          const bob = seeded.users[0]!;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T', session });

          await assignTask({ task_id: task.id, user_id: bob.user_id, session });
          await assignTask({ task_id: task.id, user_id: bob.user_id, session });

          const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS n FROM planner.task_assignments WHERE task_id = $1 AND user_id = $2`,
            [task.id, bob.user_id],
          );
          expect(rows[0].n).toBe(1);

          const eventCount = await countEvents(pool, seeded.tenant_id, 'planner.task.assigned');
          expect(eventCount).toBe(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('requests a notification for the assignee, excluding the actor', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [{ name: 'Alice', email: 'alice@example.test' }],
          });
          const session = seeded.adminSession;
          const alice = seeded.users[0]!;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T', session });

          await assignTask({ task_id: task.id, user_id: alice.user_id, session });

          const events = await readEvents(pool, seeded.tenant_id, 'core.notification.requested');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.target_event_type).toBe('planner.task.assigned');
          expect(payload.user_ids).toEqual([alice.user_id]);
          expect(payload.target_payload.task_id).toBe(task.id);
          expect(payload.target_payload.plan_id).toBe(plan.id);
          expect(payload.target_payload.group_id).toBe(group.id);
          expect(payload.source_event_id).toBeTruthy();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('does not emit a notification request when the actor assigns themselves', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {});
          const session = seeded.adminSession;
          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T', session });

          await assignTask({ task_id: task.id, user_id: session.user_id, session });

          const events = await readEvents(pool, seeded.tenant_id, 'core.notification.requested');
          expect(events).toHaveLength(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// unassignTask
// ---------------------------------------------------------------------------

describe('unassignTask', () => {
  it('removes task_assignment and emits planner.task.unassigned', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [{ name: 'Carol', email: 'carol@example.test' }],
          });
          const session = seeded.adminSession;
          const carol = seeded.users[0]!;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T', session });

          await assignTask({ task_id: task.id, user_id: carol.user_id, session });
          await unassignTask({ task_id: task.id, user_id: carol.user_id, session });

          const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS n FROM planner.task_assignments WHERE task_id = $1 AND user_id = $2`,
            [task.id, carol.user_id],
          );
          expect(rows[0].n).toBe(0);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.task.unassigned');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.task_id).toBe(task.id);
          expect(payload.user_id).toBe(carol.user_id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('is idempotent: unassign non-existent is a no-op (no event)', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [{ name: 'Dave', email: 'dave@example.test' }],
          });
          const session = seeded.adminSession;
          const dave = seeded.users[0]!;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T', session });

          // Unassign someone who was never assigned.
          await unassignTask({ task_id: task.id, user_id: dave.user_id, session });

          const eventCount = await countEvents(pool, seeded.tenant_id, 'planner.task.unassigned');
          expect(eventCount).toBe(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('requests a notification for the ex-assignee, excluding the actor', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [{ name: 'Alice', email: 'alice@example.test' }],
          });
          const session = seeded.adminSession;
          const alice = seeded.users[0]!;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T', session });
          await assignTask({ task_id: task.id, user_id: alice.user_id, session });

          // Wipe any pre-existing notification events from the assign step so we isolate the unassign event.
          await pool.query(
            `DELETE FROM core.events WHERE event_type = 'core.notification.requested' AND tenant_id = $1`,
            [seeded.tenant_id],
          );

          await unassignTask({ task_id: task.id, user_id: alice.user_id, session });

          const events = await readEvents(pool, seeded.tenant_id, 'core.notification.requested');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.target_event_type).toBe('planner.task.unassigned');
          expect(payload.user_ids).toEqual([alice.user_id]);
          expect(payload.target_payload.task_id).toBe(task.id);
          expect(payload.target_payload.plan_id).toBe(plan.id);
          expect(payload.target_payload.group_id).toBe(group.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('does not emit a notification request when the actor unassigns themselves', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {});
          const session = seeded.adminSession;
          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T', session });
          await assignTask({ task_id: task.id, user_id: session.user_id, session });

          // Self-assign already produced 0 notifications. Clean slate is the same.
          await pool.query(
            `DELETE FROM core.events WHERE event_type = 'core.notification.requested' AND tenant_id = $1`,
            [seeded.tenant_id],
          );

          await unassignTask({ task_id: task.id, user_id: session.user_id, session });

          const events = await readEvents(pool, seeded.tenant_id, 'core.notification.requested');
          expect(events).toHaveLength(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// completeTask
// ---------------------------------------------------------------------------

describe('completeTask', () => {
  it('sets percent_complete to 100, bumps version, emits planner.task.completed', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T', session });

          const completed = await completeTask({
            task_id: task.id,
            expected_version: 1,
            session,
          });

          expect(completed.percent_complete).toBe(100);
          expect(completed.is_deferred).toBe(false);
          expect(completed.version).toBe(2);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.task.completed');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.task_id).toBe(task.id);
          expect(payload.plan_id).toBe(plan.id);
          expect(payload.group_id).toBe(group.id);
          expect(payload.version_before).toBe(1);
          expect(payload.version_after).toBe(2);
          expect(payload.completed_at).toBeDefined();
          expect(payload.actor.user_id).toBe(session.user_id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws CONFLICT on stale version', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T', session });

          await expect(
            completeTask({ task_id: task.id, expected_version: 99, session }),
          ).rejects.toMatchObject({ code: 'CONFLICT' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws VALIDATION when task is already completed', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T', session });

          await completeTask({ task_id: task.id, expected_version: 1, session });

          await expect(
            completeTask({ task_id: task.id, expected_version: 2, session }),
          ).rejects.toMatchObject({ code: 'VALIDATION' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('requests a notification for the creator and current assignee, excluding the actor', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const creatorSeed = await seedTenant(pool, {
            users: [
              { name: 'Creator', email: 'creator@example.test' },
              { name: 'Assignee', email: 'assignee@example.test' },
            ],
          });
          const adminSession = creatorSeed.adminSession;
          const creator = creatorSeed.users[0]!;
          const assignee = creatorSeed.users[1]!;
          const creatorSession = { ...adminSession, user_id: creator.user_id };

          const group = await createGroup({
            tenant_id: creatorSeed.tenant_id,
            name: 'Eng',
            session: adminSession,
          });
          const plan = await createPlan({
            group_id: group.id,
            name: 'Sprint 1',
            session: adminSession,
          });
          const task = await createTask({ plan_id: plan.id, title: 'T', session: creatorSession });
          await assignTask({ task_id: task.id, user_id: assignee.user_id, session: adminSession });

          await pool.query(
            `DELETE FROM core.events WHERE event_type = 'core.notification.requested' AND tenant_id = $1`,
            [creatorSeed.tenant_id],
          );

          await completeTask({ task_id: task.id, expected_version: 1, session: adminSession });

          const events = await readEvents(
            pool,
            creatorSeed.tenant_id,
            'core.notification.requested',
          );
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.target_event_type).toBe('planner.task.completed');
          expect((payload.user_ids as string[]).sort()).toEqual(
            [creator.user_id, assignee.user_id].sort(),
          );
          expect(payload.target_payload.task_id).toBe(task.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('emits no notification when creator==assignee==actor', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {});
          const session = seeded.adminSession;
          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T', session });
          await assignTask({ task_id: task.id, user_id: session.user_id, session });

          await pool.query(
            `DELETE FROM core.events WHERE event_type = 'core.notification.requested' AND tenant_id = $1`,
            [seeded.tenant_id],
          );

          await completeTask({ task_id: task.id, expected_version: 1, session });

          const events = await readEvents(pool, seeded.tenant_id, 'core.notification.requested');
          expect(events).toHaveLength(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// reopenTask
// ---------------------------------------------------------------------------

describe('reopenTask', () => {
  it('resets percent_complete, bumps version, emits planner.task.reopened', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T', session });

          await completeTask({ task_id: task.id, expected_version: 1, session });

          const reopened = await reopenTask({
            task_id: task.id,
            expected_version: 2,
            session,
          });

          // reopenTask resets percent_complete to 0 and clears the deferred flag.
          expect(reopened.percent_complete).toBe(0);
          expect(reopened.is_deferred).toBe(false);
          expect(reopened.version).toBe(3);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.task.reopened');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.task_id).toBe(task.id);
          expect(payload.plan_id).toBe(plan.id);
          expect(payload.group_id).toBe(group.id);
          expect(payload.version_before).toBe(2);
          expect(payload.version_after).toBe(3);
          expect(payload.actor.user_id).toBe(session.user_id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws VALIDATION when task is not completed', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T', session });

          await expect(
            reopenTask({ task_id: task.id, expected_version: 1, session }),
          ).rejects.toMatchObject({ code: 'VALIDATION' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('requests a notification for the creator and current assignee, excluding the actor', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [
              { name: 'Creator', email: 'creator@example.test' },
              { name: 'Assignee', email: 'assignee@example.test' },
            ],
          });
          const adminSession = seeded.adminSession;
          const creator = seeded.users[0]!;
          const assignee = seeded.users[1]!;
          const creatorSession = { ...adminSession, user_id: creator.user_id };

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session: adminSession,
          });
          const plan = await createPlan({
            group_id: group.id,
            name: 'Sprint 1',
            session: adminSession,
          });
          const task = await createTask({ plan_id: plan.id, title: 'T', session: creatorSession });
          await assignTask({ task_id: task.id, user_id: assignee.user_id, session: adminSession });
          await completeTask({ task_id: task.id, expected_version: 1, session: adminSession });

          await pool.query(
            `DELETE FROM core.events WHERE event_type = 'core.notification.requested' AND tenant_id = $1`,
            [seeded.tenant_id],
          );

          await reopenTask({ task_id: task.id, expected_version: 2, session: adminSession });

          const events = await readEvents(pool, seeded.tenant_id, 'core.notification.requested');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.target_event_type).toBe('planner.task.reopened');
          expect((payload.user_ids as string[]).sort()).toEqual(
            [creator.user_id, assignee.user_id].sort(),
          );
          expect(payload.target_payload.task_id).toBe(task.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('emits no notification when creator==assignee==actor', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {});
          const session = seeded.adminSession;
          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T', session });
          await assignTask({ task_id: task.id, user_id: session.user_id, session });
          await completeTask({ task_id: task.id, expected_version: 1, session });

          await pool.query(
            `DELETE FROM core.events WHERE event_type = 'core.notification.requested' AND tenant_id = $1`,
            [seeded.tenant_id],
          );

          await reopenTask({ task_id: task.id, expected_version: 2, session });

          const events = await readEvents(pool, seeded.tenant_id, 'core.notification.requested');
          expect(events).toHaveLength(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

describe('createTask initial percent_complete', () => {
  it('stores in-progress percent when percent_complete is passed', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
          const plan = await createPlan({ group_id: group.id, name: 'P', session });

          const task = await createTask({
            plan_id: plan.id,
            title: 'In-flight task',
            percent_complete: 50,
            session,
          });

          expect(task.percent_complete).toBe(50);

          const { rows } = await pool.query(
            `SELECT percent_complete FROM planner.tasks WHERE id = $1`,
            [task.id],
          );
          expect(rows[0]?.percent_complete).toBe(50);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('defaults to 0 / not deferred when percent_complete is omitted', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G2', session });
          const plan = await createPlan({ group_id: group.id, name: 'P2', session });

          const task = await createTask({ plan_id: plan.id, title: 'New task', session });

          expect(task.percent_complete).toBe(0);
          expect(task.is_deferred).toBe(false);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

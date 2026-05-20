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
});

// ---------------------------------------------------------------------------
// completeTask
// ---------------------------------------------------------------------------

describe('completeTask', () => {
  it('sets progress to completed, bumps version, emits planner.task.completed', async () => {
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

          expect(completed.progress).toBe('completed');
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
});

// ---------------------------------------------------------------------------
// reopenTask
// ---------------------------------------------------------------------------

describe('reopenTask', () => {
  it('sets progress to in_progress, bumps version, emits planner.task.reopened', async () => {
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

          expect(reopened.progress).toBe('in_progress');
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
});

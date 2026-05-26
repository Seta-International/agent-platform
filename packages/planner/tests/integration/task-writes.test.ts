import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  createGroup,
  createPlan,
  createTask,
  deleteTask,
  restoreTask,
  updateTask,
} from '../../src/index.ts';
import { countEvents, readEvents, seedTenant } from '../helpers.ts';

// ---------------------------------------------------------------------------
// updateTask
// ---------------------------------------------------------------------------

describe('updateTask', () => {
  it('changes title, bumps version, emits planner.task.updated with before/after title only', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'Original', session });

          const updated = await updateTask({
            task_id: task.id,
            expected_version: 1,
            patch: { title: 'Renamed' },
            session,
          });

          expect(updated.title).toBe('Renamed');
          expect(updated.version).toBe(2);
          expect(updated.id).toBe(task.id);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.task.updated');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.task_id).toBe(task.id);
          expect(payload.plan_id).toBe(plan.id);
          expect(payload.group_id).toBe(group.id);
          expect(payload.before).toEqual({ title: 'Original' });
          expect(payload.after).toEqual({ title: 'Renamed' });
          expect(payload.version_before).toBe(1);
          expect(payload.version_after).toBe(2);
          expect(payload.actor.user_id).toBe(session.user_id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('no-op patch returns existing row without version bump or event', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'Stable', session });

          const result = await updateTask({
            task_id: task.id,
            expected_version: 1,
            patch: { title: 'Stable' },
            session,
          });

          expect(result.version).toBe(1);
          const eventCount = await countEvents(pool, seeded.tenant_id, 'planner.task.updated');
          expect(eventCount).toBe(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws CONFLICT on stale expected_version', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T1', session });

          await expect(
            updateTask({
              task_id: task.id,
              expected_version: 99,
              patch: { title: 'New' },
              session,
            }),
          ).rejects.toMatchObject({ code: 'CONFLICT' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('updates due_at from a value to null (nullable transition)', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({
            plan_id: plan.id,
            title: 'T1',
            due_at: '2026-06-01T00:00:00.000Z',
            session,
          });

          expect(task.due_at).not.toBeNull();

          const updated = await updateTask({
            task_id: task.id,
            expected_version: 1,
            patch: { due_at: null },
            session,
          });

          expect(updated.due_at).toBeNull();
          expect(updated.version).toBe(2);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.task.updated');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.before.due_at).not.toBeNull();
          expect(payload.after.due_at).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('updates due_at from null to a value', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T1', session });

          expect(task.due_at).toBeNull();

          const updated = await updateTask({
            task_id: task.id,
            expected_version: 1,
            patch: { due_at: '2026-06-01T00:00:00.000Z' },
            session,
          });

          expect(updated.due_at).toBe('2026-06-01T00:00:00.000Z');
          expect(updated.version).toBe(2);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('updates skill_tags array', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({
            plan_id: plan.id,
            title: 'T1',
            skill_tags: ['typescript'],
            session,
          });

          const updated = await updateTask({
            task_id: task.id,
            expected_version: 1,
            patch: { skill_tags: ['typescript', 'node'] },
            session,
          });

          expect(updated.skill_tags).toEqual(['typescript', 'node']);
          expect(updated.version).toBe(2);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.task.updated');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.before.skill_tags).toEqual(['typescript']);
          expect(payload.after.skill_tags).toEqual(['typescript', 'node']);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// deleteTask
// ---------------------------------------------------------------------------

describe('deleteTask', () => {
  it('soft-deletes task, bumps version, emits planner.task.deleted', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'To Delete', session });

          await deleteTask({ task_id: task.id, expected_version: 1, session });

          const { rows } = await pool.query(
            `SELECT deleted_at, version FROM planner.tasks WHERE id = $1`,
            [task.id],
          );
          expect(rows[0].deleted_at).not.toBeNull();
          expect(rows[0].version).toBe(2);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.task.deleted');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.task_id).toBe(task.id);
          expect(payload.plan_id).toBe(plan.id);
          expect(payload.group_id).toBe(group.id);
          expect(payload.version_before).toBe(1);
          expect(payload.deleted_at).not.toBeNull();
          expect(payload.actor.user_id).toBe(session.user_id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws CONFLICT when expected_version is stale', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
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
            deleteTask({ task_id: task.id, expected_version: 99, session }),
          ).rejects.toMatchObject({ code: 'CONFLICT' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// restoreTask
// ---------------------------------------------------------------------------

describe('restoreTask', () => {
  it('clears deleted_at, bumps version, emits planner.task.restored', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'Restore Me', session });

          await deleteTask({ task_id: task.id, expected_version: 1, session });

          const restored = await restoreTask({ task_id: task.id, session });

          expect(restored.deleted_at).toBeNull();
          expect(restored.version).toBe(3);
          expect(restored.id).toBe(task.id);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.task.restored');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.task_id).toBe(task.id);
          expect(payload.plan_id).toBe(plan.id);
          expect(payload.group_id).toBe(group.id);
          expect(payload.version_after).toBe(3);
          expect(payload.actor.user_id).toBe(session.user_id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws VALIDATION when task is already live (not deleted)', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'Live Task', session });

          await expect(restoreTask({ task_id: task.id, session })).rejects.toMatchObject({
            code: 'VALIDATION',
          });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

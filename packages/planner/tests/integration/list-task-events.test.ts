import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { listTaskEvents } from '../../src/backend/domain/list-task-events.ts';
import {
  addChecklistItem,
  applyLabel,
  assignTask,
  completeTask,
  createBucket,
  createGroup,
  createLabel,
  createPlan,
  createTask,
  updateTask,
} from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

describe('listTaskEvents', () => {
  it('returns reverse-chronological events for a task across aggregates', async () => {
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

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Engineering',
            session,
          });
          const plan = await createPlan({
            group_id: group.id,
            name: 'Q3 Launch',
            session,
          });
          const bucket = await createBucket({
            plan_id: plan.id,
            name: 'To do',
            session,
          });
          const task = await createTask({
            plan_id: plan.id,
            bucket_id: bucket.id,
            title: 'Ship M3',
            session,
          });

          await updateTask({
            task_id: task.id,
            expected_version: task.version,
            patch: { description: 'Details' },
            session,
          });
          const v2 = task.version + 1;
          await assignTask({ task_id: task.id, user_id: session.user_id, session });
          await completeTask({ task_id: task.id, expected_version: v2, session });

          await addChecklistItem({ task_id: task.id, label: 'Draft outline', session });

          const label = await createLabel({
            plan_id: plan.id,
            name: 'api',
            color: '#1d4ed8',
            session,
          });
          await applyLabel({ task_id: task.id, label_id: label.id, session });

          const result = await listTaskEvents({ task_id: task.id, session });
          expect(result.events.length).toBeGreaterThanOrEqual(6);
          const types = result.events.map((e) => e.event_type);
          expect(types[0]).toBe('planner.label.applied');
          expect(types).toContain('planner.checklist_item.added');
          expect(types).toContain('planner.task.created');
          expect(types).toContain('planner.task.updated');
          expect(types).toContain('planner.task.completed');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws FORBIDDEN when session lacks planner.task.read', async () => {
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
          const adminSession = seeded.adminSession;

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session: adminSession,
          });
          const plan = await createPlan({ group_id: group.id, name: 'P', session: adminSession });
          const bucket = await createBucket({ plan_id: plan.id, name: 'B', session: adminSession });
          const task = await createTask({
            plan_id: plan.id,
            bucket_id: bucket.id,
            title: 't',
            session: adminSession,
          });

          const outsider = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: crypto.randomUUID(),
            roles: [],
          });

          await expect(
            listTaskEvents({ task_id: task.id, session: outsider }),
          ).rejects.toMatchObject({ code: 'FORBIDDEN' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns NOT_FOUND for an unknown id (and does not leak across tenants)', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const otherTenant = await seedTenant(pool);
          await expect(
            listTaskEvents({
              task_id: '00000000-0000-0000-0000-000000000000',
              session: otherTenant.adminSession,
            }),
          ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('paginates with a stable opaque cursor', async () => {
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

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'G',
            session,
          });
          const plan = await createPlan({ group_id: group.id, name: 'P', session });
          const bucket = await createBucket({ plan_id: plan.id, name: 'B', session });
          const task = await createTask({
            plan_id: plan.id,
            bucket_id: bucket.id,
            title: 't',
            session,
          });

          let v = task.version;
          for (let i = 0; i < 35; i++) {
            await updateTask({
              task_id: task.id,
              expected_version: v,
              patch: { title: `t-${i}` },
              session,
            });
            v += 1;
          }

          const page1 = await listTaskEvents({ task_id: task.id, session, limit: 20 });
          expect(page1.events).toHaveLength(20);
          expect(page1.next_cursor).toBeDefined();

          const page2 = await listTaskEvents({
            task_id: task.id,
            session,
            limit: 20,
            cursor: page1.next_cursor,
          });
          expect(page2.events.length).toBeGreaterThan(0);
          const ids1 = new Set(page1.events.map((e) => e.id.toString()));
          for (const e of page2.events) {
            expect(ids1.has(e.id.toString())).toBe(false);
          }

          const page2bis = await listTaskEvents({
            task_id: task.id,
            session,
            limit: 20,
            cursor: page1.next_cursor,
          });
          expect(page2bis.events.map((e) => e.id.toString())).toEqual(
            page2.events.map((e) => e.id.toString()),
          );
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

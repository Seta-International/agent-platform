import type { SessionEnv } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { plannerDb } from '../../src/backend/db/index.ts';
import { tasks } from '../../src/backend/db/schema.ts';
import { registerPlannerTasksRoutes } from '../../src/backend/http/index.ts';
import { createGroup, createPlan, createTask, PlannerError, updateTask } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

function testDbOpts() {
  return {
    templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
    baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
  };
}

describe('FUT-381 Task date range validation & calendar fault-tolerance', () => {
  it('prevents createTask and updateTask when start_at > due_at', async () => {
    await withTestDb(testDbOpts(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });

        // 1. createTask with start_at > due_at -> throws VALIDATION
        await expect(
          createTask({
            plan_id: plan.id,
            title: 'Invalid Dates Task',
            start_at: '2026-07-10T00:00:00.000Z',
            due_at: '2026-07-05T00:00:00.000Z',
            session,
          }),
        ).rejects.toThrow(PlannerError);

        // 2. createTask with valid dates -> succeeds
        const task = await createTask({
          plan_id: plan.id,
          title: 'Valid Dates Task',
          start_at: '2026-07-01T00:00:00.000Z',
          due_at: '2026-07-15T00:00:00.000Z',
          session,
        });

        // 3. updateTask modifying due_at to be earlier than existing start_at -> throws VALIDATION
        await expect(
          updateTask({
            task_id: task.id,
            expected_version: task.version,
            patch: { due_at: '2026-06-20T00:00:00.000Z' },
            session,
          }),
        ).rejects.toThrow(PlannerError);

        // 4. updateTask modifying start_at to be later than existing due_at -> throws VALIDATION
        await expect(
          updateTask({
            task_id: task.id,
            expected_version: task.version,
            patch: { start_at: '2026-07-20T00:00:00.000Z' },
            session,
          }),
        ).rejects.toThrow(PlannerError);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('allows non-date edits on legacy invalid tasks and handles calendar without HTTP 500', async () => {
    await withTestDb(testDbOpts(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint', session });

        // Insert valid task first
        const validTask = await createTask({
          plan_id: plan.id,
          title: 'Legacy Invalid Base Task',
          session,
        });

        // Force legacy invalid dates directly into DB (simulating pre-FUT-381 legacy record)
        const db = plannerDb();
        await db
          .update(tasks)
          .set({
            start_at: new Date('2026-07-10T00:00:00.000Z'),
            due_at: new Date('2026-07-05T00:00:00.000Z'),
          })
          .where(eq(tasks.id, validTask.id));

        // Test 1: Legacy invalid task + title update -> succeeds
        const titleUpdated = await updateTask({
          task_id: validTask.id,
          expected_version: validTask.version,
          patch: { title: 'Updated Legacy Title' },
          session,
        });
        expect(titleUpdated.title).toBe('Updated Legacy Title');

        // Test 2: Legacy invalid task + description update -> succeeds
        const descUpdated = await updateTask({
          task_id: validTask.id,
          expected_version: titleUpdated.version,
          patch: { description: 'Updated Legacy Description' },
          session,
        });
        expect(descUpdated.description).toBe('Updated Legacy Description');

        // Test 3: Legacy invalid task + percent_complete update -> succeeds
        const percentUpdated = await updateTask({
          task_id: validTask.id,
          expected_version: descUpdated.version,
          patch: { percent_complete: 50 },
          session,
        });
        expect(percentUpdated.percent_complete).toBe(50);

        // Test 4: Legacy invalid task + invalid date modification -> throws VALIDATION
        await expect(
          updateTask({
            task_id: validTask.id,
            expected_version: percentUpdated.version,
            patch: { start_at: '2026-07-12T00:00:00.000Z' },
            session,
          }),
        ).rejects.toThrow(PlannerError);

        // Test 5: Legacy invalid task + valid date correction -> succeeds
        const dateCorrected = await updateTask({
          task_id: validTask.id,
          expected_version: percentUpdated.version,
          patch: { due_at: '2026-07-20T00:00:00.000Z' },
          session,
        });
        expect(dateCorrected.due_at).toBe('2026-07-20T00:00:00.000Z');

        // Test 6: Calendar HTTP 500 fault tolerance check
        // Reset dates back to invalid start > due to test calendar route with invalid data
        await db
          .update(tasks)
          .set({
            start_at: new Date('2026-06-15T00:00:00.000Z'),
            due_at: new Date('2026-06-05T00:00:00.000Z'),
          })
          .where(eq(tasks.id, validTask.id));

        const app = new Hono<SessionEnv>();
        app.use(async (c, next) => {
          c.set('user', session);
          await next();
        });
        registerPlannerTasksRoutes(app);

        const calendarUrl = `/api/planner/v1/plans/${plan.id}/tasks/calendar?from=2026-06-01T00%3A00%3A00.000Z&to=2026-06-30T23%3A59%3A59.999Z`;
        const res = await app.request(calendarUrl);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { tasks: { id: string }[]; total_count: number };
        expect(body.total_count).toBe(1);
        expect(body.tasks[0]?.id).toBe(validTask.id);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});

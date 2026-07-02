import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  addChecklistItem,
  addTaskReference,
  applyLabel,
  completeTask,
  createBucket,
  createGroup,
  createLabel,
  createPlan,
  createTask,
  duplicatePlan,
  listTasks,
  updateTask,
} from '../../src/index.ts';
import { assignTaskInGroup, seedTenant } from '../helpers.ts';

describe('duplicatePlan', () => {
  it('copies buckets, tasks, status, priority, assignees, labels, checklist, and references', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [{ name: 'Alex', email: 'alex@example.test' }],
          });
          const session = seeded.adminSession;
          const otherUser = seeded.users[0]!;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const sourcePlan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const bucketA = await createBucket({ plan_id: sourcePlan.id, name: 'To do', session });
          const bucketB = await createBucket({ plan_id: sourcePlan.id, name: 'Done', session });

          const openTask = await createTask({
            plan_id: sourcePlan.id,
            bucket_id: bucketA.id,
            title: 'Start new task',
            description: 'Details',
            priority_number: 1,
            session,
          });
          await updateTask({
            task_id: openTask.id,
            expected_version: openTask.version,
            patch: { due_at: '2099-07-04T00:00:00.000Z' },
            session,
          });
          await addChecklistItem({ task_id: openTask.id, label: 'Step 1', session });
          await assignTaskInGroup({
            group_id: group.id,
            task_id: openTask.id,
            user_id: otherUser.user_id,
            session,
          });

          const label = await createLabel({
            plan_id: sourcePlan.id,
            name: 'Bug',
            color: '#ff0000',
            session,
          });
          await applyLabel({ task_id: openTask.id, label_id: label.id, session });
          await addTaskReference({
            task_id: openTask.id,
            url: 'https://example.test/spec',
            alias: 'Spec',
            type: 'web',
            session,
          });

          const inProgressTask = await createTask({
            plan_id: sourcePlan.id,
            bucket_id: bucketA.id,
            title: 'Test TACOS data',
            priority_number: 9,
            session,
          });
          await updateTask({
            task_id: inProgressTask.id,
            expected_version: inProgressTask.version,
            patch: { percent_complete: 50 },
            session,
          });

          const doneTask = await createTask({
            plan_id: sourcePlan.id,
            bucket_id: bucketB.id,
            title: 'Completed item',
            session,
          });
          await completeTask({
            task_id: doneTask.id,
            expected_version: doneTask.version,
            session,
          });

          const copy = await duplicatePlan({ plan_id: sourcePlan.id, session });
          expect(copy.name).toBe('Sprint 1 (copy)');
          expect(copy.id).not.toBe(sourcePlan.id);

          const { tasks: copiedTasks } = await listTasks({
            filters: { plan_id: copy.id },
            session,
          });
          expect(copiedTasks).toHaveLength(3);

          const byTitle = new Map(copiedTasks.map((t) => [t.title, t]));
          const copiedOpen = byTitle.get('Start new task');
          const copiedInProgress = byTitle.get('Test TACOS data');
          const copiedDone = byTitle.get('Completed item');

          expect(copiedOpen?.priority_number).toBe(1);
          expect(copiedOpen?.percent_complete).toBe(0);
          expect(copiedOpen?.due_at).toBe('2099-07-04T00:00:00.000Z');
          expect(copiedOpen?.assignees).toHaveLength(1);
          expect(copiedOpen?.assignees[0]?.user_id).toBe(otherUser.user_id);
          expect(copiedOpen?.labels).toHaveLength(1);
          expect(copiedOpen?.labels[0]?.name).toBe('Bug');
          expect(copiedOpen?.checklist_summary.total).toBe(1);

          expect(copiedInProgress?.priority_number).toBe(9);
          expect(copiedInProgress?.percent_complete).toBe(50);

          expect(copiedDone?.percent_complete).toBe(100);

          const bucketNames = new Set(
            copiedTasks.map((t) => {
              if (t.title === 'Completed item') return 'Done';
              return 'To do';
            }),
          );
          expect(bucketNames).toEqual(new Set(['To do', 'Done']));
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

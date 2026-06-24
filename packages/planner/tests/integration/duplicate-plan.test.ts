import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  addChecklistItem,
  addTaskReference,
  applyLabel,
  assignTask,
  createBucket,
  createGroup,
  createLabel,
  createPlan,
  createTask,
  duplicatePlan,
  getTask,
  listBuckets,
  listLabels,
  listTasks,
  updateTask,
} from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const dbCfg = () => ({
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
});

describe('duplicatePlan', () => {
  it('copies buckets, tasks, assignees, checklist, references and remapped labels (FUT-27)', async () => {
    await withTestDb(dbCfg(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool, {
          users: [{ name: 'Mia', email: 'mia@example.test' }],
        });
        const session = seeded.adminSession;
        const otherUser = seeded.users[0]!;

        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
        const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
        const bucket = await createBucket({ plan_id: plan.id, name: 'Backlog', session });

        const t1 = await createTask({
          plan_id: plan.id,
          bucket_id: bucket.id,
          title: 'Ship it',
          description: 'Body text',
          session,
        });
        await updateTask({
          task_id: t1.id,
          expected_version: t1.version,
          patch: {
            priority_number: 1,
            percent_complete: 50,
            due_at: '2099-01-01T00:00:00.000Z',
          },
          session,
        });
        await assignTask({ task_id: t1.id, user_id: otherUser.user_id, session });
        await addChecklistItem({ task_id: t1.id, label: 'Step 1', session });
        await addTaskReference({
          task_id: t1.id,
          url: 'https://example.test/spec',
          alias: 'Spec',
          type: 'web',
          session,
        });

        const label = await createLabel({
          plan_id: plan.id,
          name: 'Bug',
          color: '#ff0000',
          session,
        });
        await applyLabel({ task_id: t1.id, label_id: label.id, session });

        // A bucketless task must also be copied.
        await createTask({ plan_id: plan.id, title: 'Loose task', session });

        const dup = await duplicatePlan({ plan_id: plan.id, session });
        expect(dup.id).not.toBe(plan.id);
        expect(dup.name).toBe('Sprint 1 (copy)');

        const dupBuckets = await listBuckets({ plan_id: dup.id, session });
        expect(dupBuckets.map((b) => b.name)).toEqual(['Backlog']);
        const newBucketId = dupBuckets[0]!.id;
        expect(newBucketId).not.toBe(bucket.id);

        const { tasks: dupTasks } = await listTasks({ filters: { plan_id: dup.id }, session });
        expect(dupTasks).toHaveLength(2);

        const shipIt = dupTasks.find((t) => t.title === 'Ship it')!;
        expect(shipIt).toBeDefined();
        expect(shipIt.id).not.toBe(t1.id);
        expect(shipIt.bucket_id).toBe(newBucketId);
        expect(shipIt.priority_number).toBe(1);
        expect(shipIt.percent_complete).toBe(50);
        expect(shipIt.due_at).toBe('2099-01-01T00:00:00.000Z');
        expect(shipIt.assignees.map((a) => a.user_id)).toEqual([otherUser.user_id]);

        // Label is copied to the NEW plan and the task points at the new label, not the source's.
        const dupLabels = await listLabels({ plan_id: dup.id, session });
        expect(dupLabels.map((l) => l.name)).toEqual(['Bug']);
        expect(dupLabels[0]!.id).not.toBe(label.id);
        expect(dupLabels[0]!.plan_id).toBe(dup.id);
        expect(shipIt.labels.map((l) => l.id)).toEqual([dupLabels[0]!.id]);

        const looseTask = dupTasks.find((t) => t.title === 'Loose task')!;
        expect(looseTask.bucket_id).toBeNull();

        const detail = await getTask({ task_id: shipIt.id, session });
        expect(detail.checklist.map((c) => c.label)).toEqual(['Step 1']);
        expect(detail.references.map((r) => r.url)).toEqual(['https://example.test/spec']);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});

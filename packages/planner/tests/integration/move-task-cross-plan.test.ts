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
  moveTask,
} from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

describe('moveTask — cross-plan', () => {
  it(
    'moves task to a different plan in the same group: strips plan-scoped labels, ' +
      'preserves assignees / checklist / references, bumps version, emits planner.task.moved ' +
      'with from_plan_id / to_plan_id',
    async () => {
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

            const group = await createGroup({
              tenant_id: seeded.tenant_id,
              name: 'Eng',
              session,
            });
            const sourcePlan = await createPlan({
              group_id: group.id,
              name: 'Source Plan',
              session,
            });
            const targetPlan = await createPlan({
              group_id: group.id,
              name: 'Target Plan',
              session,
            });
            const sourceBucket = await createBucket({
              plan_id: sourcePlan.id,
              name: 'Source Bucket',
              session,
            });
            // Target plan gets one bucket — when no explicit bucket is supplied
            // the cross-plan move appends to the tail of this bucket.
            const targetBucketHead = await createBucket({
              plan_id: targetPlan.id,
              name: 'Target Head',
              session,
            });
            const targetBucketTail = await createBucket({
              plan_id: targetPlan.id,
              name: 'Target Tail',
              session,
            });

            // Seed the task with the full set of carry-over data.
            const task = await createTask({
              plan_id: sourcePlan.id,
              bucket_id: sourceBucket.id,
              title: 'Carry Me Across',
              description: 'Long description that should survive the move.',
              session,
            });

            const label1 = await createLabel({
              plan_id: sourcePlan.id,
              name: 'Bug',
              color: '#ff0000',
              session,
            });
            const label2 = await createLabel({
              plan_id: sourcePlan.id,
              name: 'Urgent',
              color: '#ffaa00',
              session,
            });
            await applyLabel({ task_id: task.id, label_id: label1.id, session });
            await applyLabel({ task_id: task.id, label_id: label2.id, session });

            const checklistItem = await addChecklistItem({
              task_id: task.id,
              label: 'Step survives',
              session,
            });

            await assignTask({ task_id: task.id, user_id: session.user_id, session });

            const ref = await addTaskReference({
              task_id: task.id,
              url: 'https://example.test/spec',
              alias: 'spec',
              session,
            });

            // Read the post-seed task state to capture the current version.
            const preMove = await pool.query<{
              plan_id: string;
              bucket_id: string | null;
              version: number;
            }>(`SELECT plan_id, bucket_id, version FROM planner.tasks WHERE id = $1`, [task.id]);
            const versionBefore = preMove.rows[0]?.version as number;

            // Confirm both labels are applied pre-move.
            const labelsBefore = await pool.query<{ label_id: string }>(
              `SELECT label_id FROM planner.task_labels WHERE task_id = $1`,
              [task.id],
            );
            expect(labelsBefore.rows.map((r) => r.label_id).sort()).toEqual(
              [label1.id, label2.id].sort(),
            );

            // Cross-plan move WITHOUT specifying a bucket — should land in the
            // target plan's tail bucket (highest order_hint).
            const moved = await moveTask({
              task_id: task.id,
              expected_version: versionBefore,
              new_plan_id: targetPlan.id,
              session,
            });

            expect(moved.plan_id).toBe(targetPlan.id);
            expect(moved.bucket_id).toBe(targetBucketTail.id);
            expect(moved.bucket_id).not.toBe(targetBucketHead.id);
            expect(moved.version).toBe(versionBefore + 1);
            // Preserved scalar fields.
            expect(moved.title).toBe('Carry Me Across');
            expect(moved.description).toBe('Long description that should survive the move.');

            // Labels: stripped.
            const labelsAfter = await pool.query(
              `SELECT label_id FROM planner.task_labels WHERE task_id = $1`,
              [task.id],
            );
            expect(labelsAfter.rows).toHaveLength(0);

            // Checklist items: preserved (still pointing at the same task id).
            const checklist = await pool.query<{ id: string }>(
              `SELECT id FROM planner.checklist_items WHERE task_id = $1 AND deleted_at IS NULL`,
              [task.id],
            );
            expect(checklist.rows.map((r) => r.id)).toContain(checklistItem.id);

            // Assignees: preserved.
            const assignees = await pool.query<{ user_id: string }>(
              `SELECT user_id FROM planner.task_assignments WHERE task_id = $1`,
              [task.id],
            );
            expect(assignees.rows.map((r) => r.user_id)).toContain(session.user_id);

            // References: preserved.
            const refs = await pool.query<{ id: string }>(
              `SELECT id FROM planner.task_references WHERE task_id = $1`,
              [task.id],
            );
            expect(refs.rows.map((r) => r.id)).toContain(ref.id);

            // Event: emitted with from / to plan ids.
            const events = await readEvents(pool, seeded.tenant_id, 'planner.task.moved');
            const crossPlanEvent = events.find(
              (e) =>
                (e.payload as Record<string, unknown>).task_id === task.id &&
                (e.payload as Record<string, unknown>).from_plan_id === sourcePlan.id,
            );
            expect(crossPlanEvent).toBeDefined();
            // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
            const payload = crossPlanEvent?.payload as any;
            expect(payload.from_plan_id).toBe(sourcePlan.id);
            expect(payload.to_plan_id).toBe(targetPlan.id);
            // Canonical plan_id after the move equals the target.
            expect(payload.plan_id).toBe(targetPlan.id);
            expect(payload.before.bucket_id).toBe(sourceBucket.id);
            expect(payload.after.bucket_id).toBe(targetBucketTail.id);
            expect(payload.version_before).toBe(versionBefore);
            expect(payload.version_after).toBe(versionBefore + 1);
            expect(payload.actor.user_id).toBe(session.user_id);
          } finally {
            resetCoreDb();
            await closePools();
          }
        },
      );
    },
  );

  it('cross-plan move with explicit target bucket lands in that bucket', async () => {
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

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session,
          });
          const sourcePlan = await createPlan({
            group_id: group.id,
            name: 'Source',
            session,
          });
          const targetPlan = await createPlan({
            group_id: group.id,
            name: 'Target',
            session,
          });
          const sourceBucket = await createBucket({
            plan_id: sourcePlan.id,
            name: 'S',
            session,
          });
          const targetBucketA = await createBucket({
            plan_id: targetPlan.id,
            name: 'A',
            session,
          });
          const targetBucketB = await createBucket({
            plan_id: targetPlan.id,
            name: 'B',
            session,
          });

          const task = await createTask({
            plan_id: sourcePlan.id,
            bucket_id: sourceBucket.id,
            title: 'X',
            session,
          });

          const moved = await moveTask({
            task_id: task.id,
            expected_version: 1,
            new_plan_id: targetPlan.id,
            bucket_id: targetBucketA.id,
            session,
          });

          expect(moved.plan_id).toBe(targetPlan.id);
          expect(moved.bucket_id).toBe(targetBucketA.id);
          expect(moved.bucket_id).not.toBe(targetBucketB.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('cross-plan move rejects bucket from a different (non-target) plan', async () => {
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

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session,
          });
          const sourcePlan = await createPlan({
            group_id: group.id,
            name: 'Source',
            session,
          });
          const targetPlan = await createPlan({
            group_id: group.id,
            name: 'Target',
            session,
          });
          const thirdPlan = await createPlan({
            group_id: group.id,
            name: 'Third',
            session,
          });
          const sourceBucket = await createBucket({
            plan_id: sourcePlan.id,
            name: 'S',
            session,
          });
          const thirdBucket = await createBucket({
            plan_id: thirdPlan.id,
            name: 'Third B',
            session,
          });

          const task = await createTask({
            plan_id: sourcePlan.id,
            bucket_id: sourceBucket.id,
            title: 'X',
            session,
          });

          await expect(
            moveTask({
              task_id: task.id,
              expected_version: 1,
              new_plan_id: targetPlan.id,
              bucket_id: thirdBucket.id,
              session,
            }),
          ).rejects.toMatchObject({ code: 'VALIDATION' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('passing new_plan_id equal to current plan_id falls back to in-plan move (no label strip)', async () => {
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

          const group = await createGroup({
            tenant_id: seeded.tenant_id,
            name: 'Eng',
            session,
          });
          const plan = await createPlan({ group_id: group.id, name: 'Plan', session });
          const bucketA = await createBucket({ plan_id: plan.id, name: 'A', session });
          const bucketB = await createBucket({ plan_id: plan.id, name: 'B', session });

          const task = await createTask({
            plan_id: plan.id,
            bucket_id: bucketA.id,
            title: 'X',
            session,
          });
          const label = await createLabel({
            plan_id: plan.id,
            name: 'Bug',
            color: '#ff0000',
            session,
          });
          await applyLabel({ task_id: task.id, label_id: label.id, session });

          const moved = await moveTask({
            task_id: task.id,
            expected_version: 1,
            new_plan_id: plan.id,
            bucket_id: bucketB.id,
            session,
          });

          expect(moved.plan_id).toBe(plan.id);
          expect(moved.bucket_id).toBe(bucketB.id);

          // Labels survive in-plan moves.
          const labels = await pool.query<{ label_id: string }>(
            `SELECT label_id FROM planner.task_labels WHERE task_id = $1`,
            [task.id],
          );
          expect(labels.rows.map((r) => r.label_id)).toEqual([label.id]);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

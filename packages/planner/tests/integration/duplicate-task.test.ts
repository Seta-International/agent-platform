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
  duplicateTask,
  getTask,
  updateTask,
} from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

describe('duplicateTask', () => {
  it('with defaults copies description + checklist but NOT labels/assignees/references/dates', async () => {
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
            users: [{ name: 'Mia', email: 'mia@example.test' }],
          });
          const session = seeded.adminSession;
          const otherUser = seeded.users[0]!;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const bucket = await createBucket({ plan_id: plan.id, name: 'Backlog', session });

          const source = await createTask({
            plan_id: plan.id,
            bucket_id: bucket.id,
            title: 'Ship feature',
            description: 'Long description',
            session,
          });
          // Description + dates land via updateTask since createTask doesn't set due_at typed args.
          const sourceWithDates = await updateTask({
            task_id: source.id,
            expected_version: source.version,
            patch: {
              due_at: '2099-01-01T00:00:00.000Z',
              start_at: '2098-01-01T00:00:00.000Z',
            },
            session,
          });

          const c1 = await addChecklistItem({ task_id: source.id, label: 'Step 1', session });
          const c2 = await addChecklistItem({ task_id: source.id, label: 'Step 2', session });

          const label = await createLabel({
            plan_id: plan.id,
            name: 'Bug',
            color: '#ff0000',
            session,
          });
          await applyLabel({ task_id: source.id, label_id: label.id, session });

          await assignTask({ task_id: source.id, user_id: otherUser.user_id, session });

          await addTaskReference({
            task_id: source.id,
            url: 'https://example.test/spec',
            alias: 'Spec',
            type: 'web',
            session,
          });

          const dup = await duplicateTask({ task_id: source.id, session });

          expect(dup.id).not.toBe(source.id);
          expect(dup.title).toBe('Copy of Ship feature');
          expect(dup.description).toBe('Long description');
          expect(dup.bucket_id).toBe(bucket.id);
          // Dates excluded by default.
          expect(dup.due_at).toBeNull();
          expect(dup.start_at).toBeNull();
          // Hint past source.
          expect(dup.order_hint).not.toBeNull();
          expect((dup.order_hint as string) > (sourceWithDates.order_hint as string)).toBe(true);

          // Labels/assignees/references excluded by default.
          expect(dup.labels).toEqual([]);
          expect(dup.assignees).toEqual([]);
          expect(dup.reference_preview).toEqual([]);

          // Checklist copied with NEW item ids, in source order.
          expect(dup.checklist_summary.total).toBe(2);
          const detail = await getTask({ task_id: dup.id, session });
          expect(detail.checklist).toHaveLength(2);
          expect(detail.checklist.map((c) => c.label)).toEqual(['Step 1', 'Step 2']);
          for (const item of detail.checklist) {
            expect(item.id).not.toBe(c1.id);
            expect(item.id).not.toBe(c2.id);
            expect(item.task_id).toBe(dup.id);
          }
          expect(detail.references).toHaveLength(0);

          // Emits a task.created for the new id.
          const events = await readEvents(pool, seeded.tenant_id, 'planner.task.created');
          const newCreated = events.find((e) => {
            // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
            const p = e.payload as any;
            return p.after.task_id === dup.id;
          });
          expect(newCreated).toBeDefined();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('with all flags enabled copies labels, assignees, references, and dates', async () => {
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
            users: [{ name: 'Mia', email: 'mia@example.test' }],
          });
          const session = seeded.adminSession;
          const otherUser = seeded.users[0]!;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const bucket = await createBucket({ plan_id: plan.id, name: 'Backlog', session });

          const source = await createTask({
            plan_id: plan.id,
            bucket_id: bucket.id,
            title: 'Ship feature',
            description: 'Body text',
            session,
          });
          const sourceWithDates = await updateTask({
            task_id: source.id,
            expected_version: source.version,
            patch: {
              due_at: '2099-02-02T00:00:00.000Z',
              start_at: '2098-02-02T00:00:00.000Z',
            },
            session,
          });

          await addChecklistItem({ task_id: source.id, label: 'A', session });

          const label = await createLabel({
            plan_id: plan.id,
            name: 'Bug',
            color: '#ff0000',
            session,
          });
          await applyLabel({ task_id: source.id, label_id: label.id, session });

          await assignTask({ task_id: source.id, user_id: otherUser.user_id, session });

          await addTaskReference({
            task_id: source.id,
            url: 'https://example.test/spec',
            alias: 'Spec',
            type: 'web',
            session,
          });

          const dup = await duplicateTask({
            task_id: source.id,
            options: {
              include_description: true,
              include_checklist: true,
              include_assignees: true,
              include_labels: true,
              include_references: true,
              include_dates: true,
            },
            session,
          });

          expect(dup.description).toBe('Body text');
          expect(dup.due_at).toBe(sourceWithDates.due_at);
          expect(dup.start_at).toBe(sourceWithDates.start_at);

          expect(dup.labels.map((l) => l.id)).toEqual([label.id]);
          expect(dup.assignees.map((a) => a.user_id)).toEqual([otherUser.user_id]);

          const detail = await getTask({ task_id: dup.id, session });
          expect(detail.checklist.map((c) => c.label)).toEqual(['A']);
          expect(detail.references.map((r) => r.url)).toEqual(['https://example.test/spec']);
          expect(detail.references[0]?.alias).toBe('Spec');
          expect(detail.references[0]?.type).toBe('web');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

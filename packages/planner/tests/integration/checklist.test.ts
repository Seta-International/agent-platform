import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { generateKeyBetween } from 'fractional-indexing';
import { describe, expect, it } from 'vitest';
import {
  addChecklistItem,
  createGroup,
  createPlan,
  createTask,
  removeChecklistItem,
  updateChecklistItem,
} from '../../src/index.ts';
import { countEvents, readEvents, seedTenant } from '../helpers.ts';

// ---------------------------------------------------------------------------
// addChecklistItem
// ---------------------------------------------------------------------------

describe('addChecklistItem', () => {
  it('appends item to task checklist and emits planner.checklist_item.added', async () => {
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
          const task = await createTask({ plan_id: plan.id, title: 'T1', session });

          const item = await addChecklistItem({ task_id: task.id, label: 'Step 1', session });

          expect(item.task_id).toBe(task.id);
          expect(item.label).toBe('Step 1');
          expect(item.checked).toBe(false);
          expect(item.order_hint).not.toBeNull();

          const events = await readEvents(pool, seeded.tenant_id, 'planner.checklist_item.added');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.item_id).toBe(item.id);
          expect(payload.task_id).toBe(task.id);
          expect(payload.plan_id).toBe(plan.id);
          expect(payload.group_id).toBe(group.id);
          expect(payload.label).toBe('Step 1');
          expect(payload.order_hint).toBe(item.order_hint);
          expect(payload.actor.user_id).toBe(session.user_id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('inserts item after a given after_item_id (positional insert)', async () => {
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
          const task = await createTask({ plan_id: plan.id, title: 'T1', session });

          const first = await addChecklistItem({ task_id: task.id, label: 'A', session });
          const third = await addChecklistItem({ task_id: task.id, label: 'C', session });
          const second = await addChecklistItem({
            task_id: task.id,
            label: 'B',
            after_item_id: first.id,
            session,
          });

          // B should be between A and C
          expect(first.order_hint).not.toBeNull();
          expect(second.order_hint).not.toBeNull();
          expect(third.order_hint).not.toBeNull();
          // biome-ignore lint/style/noNonNullAssertion: asserted non-null above
          expect(second.order_hint! > first.order_hint!).toBe(true);
          // biome-ignore lint/style/noNonNullAssertion: asserted non-null above
          expect(second.order_hint! < third.order_hint!).toBe(true);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws VALIDATION when after_item_id belongs to a different task', async () => {
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
          const taskA = await createTask({ plan_id: plan.id, title: 'Task A', session });
          const taskB = await createTask({ plan_id: plan.id, title: 'Task B', session });

          const itemInA = await addChecklistItem({ task_id: taskA.id, label: 'X', session });

          await expect(
            addChecklistItem({
              task_id: taskB.id,
              label: 'Y',
              after_item_id: itemInA.id,
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
});

// ---------------------------------------------------------------------------
// updateChecklistItem
// ---------------------------------------------------------------------------

describe('updateChecklistItem', () => {
  it('changes label and emits planner.checklist_item.updated with before/after label', async () => {
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
          const task = await createTask({ plan_id: plan.id, title: 'T1', session });
          const item = await addChecklistItem({ task_id: task.id, label: 'Old', session });

          const updated = await updateChecklistItem({
            item_id: item.id,
            patch: { label: 'New' },
            session,
          });

          expect(updated.label).toBe('New');
          expect(updated.id).toBe(item.id);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.checklist_item.updated');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.item_id).toBe(item.id);
          expect(payload.task_id).toBe(task.id);
          expect(payload.plan_id).toBe(plan.id);
          expect(payload.group_id).toBe(group.id);
          expect(payload.before).toEqual({ label: 'Old' });
          expect(payload.after).toEqual({ label: 'New' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('toggles checked flag and emits before/after checked', async () => {
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
          const task = await createTask({ plan_id: plan.id, title: 'T1', session });
          const item = await addChecklistItem({ task_id: task.id, label: 'Do it', session });

          expect(item.checked).toBe(false);

          const updated = await updateChecklistItem({
            item_id: item.id,
            patch: { checked: true },
            session,
          });

          expect(updated.checked).toBe(true);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.checklist_item.updated');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.before).toEqual({ checked: false });
          expect(payload.after).toEqual({ checked: true });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('updates order_hint and read order reflects the new key', async () => {
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
          const task = await createTask({ plan_id: plan.id, title: 'T1', session });
          const a = await addChecklistItem({ task_id: task.id, label: 'A', session });
          const b = await addChecklistItem({ task_id: task.id, label: 'B', session });
          const c = await addChecklistItem({ task_id: task.id, label: 'C', session });

          // Move C between A and B by giving it a fresh order_hint.
          const newHint = generateKeyBetween(a.order_hint, b.order_hint);
          const moved = await updateChecklistItem({
            item_id: c.id,
            patch: { order_hint: newHint },
            session,
          });
          expect(moved.order_hint).toBe(newHint);

          const { rows } = await pool.query<{ id: string; order_hint: string | null }>(
            `SELECT id, order_hint FROM planner.checklist_items WHERE task_id = $1 ORDER BY order_hint NULLS LAST`,
            [task.id],
          );
          expect(rows.map((r) => r.id)).toEqual([a.id, c.id, b.id]);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.checklist_item.updated');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.after.order_hint).toBe(newHint);
          expect(payload.before.order_hint).toBe(c.order_hint);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('no-op patch returns existing item without event', async () => {
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
          const task = await createTask({ plan_id: plan.id, title: 'T1', session });
          const item = await addChecklistItem({ task_id: task.id, label: 'Same', session });

          const result = await updateChecklistItem({
            item_id: item.id,
            patch: { label: 'Same' },
            session,
          });

          expect(result.label).toBe('Same');
          const eventCount = await countEvents(
            pool,
            seeded.tenant_id,
            'planner.checklist_item.updated',
          );
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
// removeChecklistItem
// ---------------------------------------------------------------------------

describe('removeChecklistItem', () => {
  it('removes item from db and emits planner.checklist_item.removed', async () => {
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
          const task = await createTask({ plan_id: plan.id, title: 'T1', session });
          const item = await addChecklistItem({ task_id: task.id, label: 'To Remove', session });

          await removeChecklistItem({ item_id: item.id, session });

          const { rows } = await pool.query(
            `SELECT id FROM planner.checklist_items WHERE id = $1`,
            [item.id],
          );
          expect(rows).toHaveLength(0);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.checklist_item.removed');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.item_id).toBe(item.id);
          expect(payload.task_id).toBe(task.id);
          expect(payload.plan_id).toBe(plan.id);
          expect(payload.group_id).toBe(group.id);
          expect(payload.actor.user_id).toBe(session.user_id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

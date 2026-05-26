import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  applyLabel,
  createGroup,
  createLabel,
  createPlan,
  createTask,
  deleteLabel,
  unapplyLabel,
  updateLabel,
} from '../../src/index.ts';
import { countEvents, readEvents, seedTenant } from '../helpers.ts';

// ---------------------------------------------------------------------------
// createLabel
// ---------------------------------------------------------------------------

describe('createLabel', () => {
  it('creates label and emits planner.label.created', async () => {
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

          const label = await createLabel({
            plan_id: plan.id,
            name: 'Bug',
            color: '#ff0000',
            session,
          });

          expect(label.plan_id).toBe(plan.id);
          expect(label.name).toBe('Bug');
          expect(label.color).toBe('#ff0000');
          expect(label.deleted_at).toBeNull();

          const events = await readEvents(pool, seeded.tenant_id, 'planner.label.created');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.after.label_id).toBe(label.id);
          expect(payload.after.plan_id).toBe(plan.id);
          expect(payload.after.group_id).toBe(group.id);
          expect(payload.after.name).toBe('Bug');
          expect(payload.after.color).toBe('#ff0000');
          expect(payload.actor.user_id).toBe(session.user_id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws NOT_FOUND for missing plan', async () => {
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

          await expect(
            createLabel({
              plan_id: crypto.randomUUID(),
              name: 'Ghost',
              color: '#000',
              session,
            }),
          ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// updateLabel
// ---------------------------------------------------------------------------

describe('updateLabel', () => {
  it('changes name only and emits before/after name', async () => {
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
          const label = await createLabel({
            plan_id: plan.id,
            name: 'Bug',
            color: '#ff0000',
            session,
          });

          const updated = await updateLabel({
            label_id: label.id,
            patch: { name: 'Feature' },
            session,
          });

          expect(updated.name).toBe('Feature');
          expect(updated.color).toBe('#ff0000');

          const events = await readEvents(pool, seeded.tenant_id, 'planner.label.updated');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.label_id).toBe(label.id);
          expect(payload.plan_id).toBe(plan.id);
          expect(payload.group_id).toBe(group.id);
          expect(payload.before).toEqual({ name: 'Bug' });
          expect(payload.after).toEqual({ name: 'Feature' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('changes both name and color and emits both in before/after', async () => {
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
          const label = await createLabel({
            plan_id: plan.id,
            name: 'Bug',
            color: '#ff0000',
            session,
          });

          const updated = await updateLabel({
            label_id: label.id,
            patch: { name: 'Feature', color: '#00ff00' },
            session,
          });

          expect(updated.name).toBe('Feature');
          expect(updated.color).toBe('#00ff00');

          const events = await readEvents(pool, seeded.tenant_id, 'planner.label.updated');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.before).toEqual({ name: 'Bug', color: '#ff0000' });
          expect(payload.after).toEqual({ name: 'Feature', color: '#00ff00' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('no-op patch returns existing label without event', async () => {
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
          const label = await createLabel({
            plan_id: plan.id,
            name: 'Bug',
            color: '#ff0000',
            session,
          });

          const result = await updateLabel({
            label_id: label.id,
            patch: { name: 'Bug' },
            session,
          });

          expect(result.name).toBe('Bug');
          const eventCount = await countEvents(pool, seeded.tenant_id, 'planner.label.updated');
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
// deleteLabel
// ---------------------------------------------------------------------------

describe('deleteLabel', () => {
  it('soft-deletes label, removes task_labels rows, and emits planner.label.deleted', async () => {
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
          const label = await createLabel({
            plan_id: plan.id,
            name: 'Bug',
            color: '#ff0000',
            session,
          });
          const task = await createTask({ plan_id: plan.id, title: 'T1', session });
          await applyLabel({ task_id: task.id, label_id: label.id, session });

          // Verify task_labels row exists before delete
          const { rows: beforeRows } = await pool.query(
            `SELECT * FROM planner.task_labels WHERE label_id = $1`,
            [label.id],
          );
          expect(beforeRows).toHaveLength(1);

          await deleteLabel({ label_id: label.id, session });

          // Label is soft-deleted
          const { rows: labelRows } = await pool.query(
            `SELECT deleted_at FROM planner.labels WHERE id = $1`,
            [label.id],
          );
          expect(labelRows[0].deleted_at).not.toBeNull();

          // task_labels rows physically removed
          const { rows: afterRows } = await pool.query(
            `SELECT * FROM planner.task_labels WHERE label_id = $1`,
            [label.id],
          );
          expect(afterRows).toHaveLength(0);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.label.deleted');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.label_id).toBe(label.id);
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

// ---------------------------------------------------------------------------
// applyLabel
// ---------------------------------------------------------------------------

describe('applyLabel', () => {
  it('applies label to task and emits planner.label.applied', async () => {
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
          const label = await createLabel({
            plan_id: plan.id,
            name: 'Bug',
            color: '#ff0000',
            session,
          });
          const task = await createTask({ plan_id: plan.id, title: 'T1', session });

          await applyLabel({ task_id: task.id, label_id: label.id, session });

          const { rows } = await pool.query(
            `SELECT * FROM planner.task_labels WHERE task_id = $1 AND label_id = $2`,
            [task.id, label.id],
          );
          expect(rows).toHaveLength(1);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.label.applied');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.task_id).toBe(task.id);
          expect(payload.plan_id).toBe(plan.id);
          expect(payload.group_id).toBe(group.id);
          expect(payload.label_id).toBe(label.id);
          expect(payload.actor.user_id).toBe(session.user_id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('is idempotent (second apply produces no additional event)', async () => {
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
          const label = await createLabel({
            plan_id: plan.id,
            name: 'Bug',
            color: '#ff0000',
            session,
          });
          const task = await createTask({ plan_id: plan.id, title: 'T1', session });

          await applyLabel({ task_id: task.id, label_id: label.id, session });
          await applyLabel({ task_id: task.id, label_id: label.id, session });

          const eventCount = await countEvents(pool, seeded.tenant_id, 'planner.label.applied');
          expect(eventCount).toBe(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('throws VALIDATION when label belongs to a different plan', async () => {
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
          const planA = await createPlan({ group_id: group.id, name: 'Plan A', session });
          const planB = await createPlan({ group_id: group.id, name: 'Plan B', session });

          const labelInA = await createLabel({
            plan_id: planA.id,
            name: 'Bug',
            color: '#ff0000',
            session,
          });
          const taskInB = await createTask({ plan_id: planB.id, title: 'T in B', session });

          await expect(
            applyLabel({ task_id: taskInB.id, label_id: labelInA.id, session }),
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
// unapplyLabel
// ---------------------------------------------------------------------------

describe('unapplyLabel', () => {
  it('removes label from task and emits planner.label.unapplied', async () => {
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
          const label = await createLabel({
            plan_id: plan.id,
            name: 'Bug',
            color: '#ff0000',
            session,
          });
          const task = await createTask({ plan_id: plan.id, title: 'T1', session });

          await applyLabel({ task_id: task.id, label_id: label.id, session });
          await unapplyLabel({ task_id: task.id, label_id: label.id, session });

          const { rows } = await pool.query(
            `SELECT * FROM planner.task_labels WHERE task_id = $1 AND label_id = $2`,
            [task.id, label.id],
          );
          expect(rows).toHaveLength(0);

          const events = await readEvents(pool, seeded.tenant_id, 'planner.label.unapplied');
          expect(events).toHaveLength(1);
          // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
          const payload = events[0]?.payload as any;
          expect(payload.task_id).toBe(task.id);
          expect(payload.label_id).toBe(label.id);
          expect(payload.plan_id).toBe(plan.id);
          expect(payload.group_id).toBe(group.id);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('is idempotent (unapply when not applied produces no event)', async () => {
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
          const label = await createLabel({
            plan_id: plan.id,
            name: 'Bug',
            color: '#ff0000',
            session,
          });
          const task = await createTask({ plan_id: plan.id, title: 'T1', session });

          // unapply when label was never applied — no event
          await unapplyLabel({ task_id: task.id, label_id: label.id, session });

          const eventCount = await countEvents(pool, seeded.tenant_id, 'planner.label.unapplied');
          expect(eventCount).toBe(0);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

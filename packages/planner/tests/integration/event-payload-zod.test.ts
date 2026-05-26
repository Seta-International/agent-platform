import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  addTaskReference,
  attachLabelToCategorySlot,
  createGroup,
  createLabel,
  createPlan,
  createTask,
  removeTaskReference,
  setCategoryDescription,
  updateTask,
} from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

const Actor = z
  .object({
    type: z.string(),
    user_id: z.string().uuid().nullable(),
  })
  .passthrough();

const TaskUpdated = z.object({
  actor: Actor,
  group_id: z.string().uuid(),
  task_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  before: z.record(z.string(), z.unknown()),
  after: z.record(z.string(), z.unknown()),
  changed_fields: z.array(z.string()),
  version_before: z.number(),
  version_after: z.number(),
});

const RefAdded = z.object({
  actor: Actor,
  tenant_id: z.string().uuid(),
  task_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  url: z.string(),
  alias: z.string().nullable(),
  type: z.string(),
});

const RefRemoved = z.object({
  actor: Actor,
  tenant_id: z.string().uuid(),
  task_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  url: z.string(),
});

const CatDescChanged = z.object({
  actor: Actor,
  tenant_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  slot: z.number().int(),
  before: z.string().nullable(),
  after: z.string().nullable(),
});

const LabelSlotChanged = z.object({
  actor: Actor,
  tenant_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  label_id: z.string().uuid(),
  before: z.number().int().nullable(),
  after: z.number().int().nullable(),
});

describe('new event payloads validate', () => {
  it('planner.task.updated payload after updateTask(start_at + percent_complete)', async () => {
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

          await updateTask({
            task_id: task.id,
            expected_version: task.version,
            patch: { start_at: '2026-06-01T00:00:00.000Z', percent_complete: 50 },
            session,
          });

          const ev = await readEvents(pool, seeded.tenant_id, 'planner.task.updated');
          expect(ev).toHaveLength(1);
          const parsed = TaskUpdated.parse(ev[0]?.payload);
          expect(parsed.changed_fields).toContain('start_at');
          expect(parsed.changed_fields).toContain('percent_complete');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('planner.task.reference-added validates', async () => {
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

          await addTaskReference({
            task_id: task.id,
            url: 'https://example.com/spec',
            alias: 'spec',
            session,
          });

          const ev = await readEvents(pool, seeded.tenant_id, 'planner.task.reference-added');
          expect(ev).toHaveLength(1);
          RefAdded.parse(ev[0]?.payload);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('planner.task.reference-removed validates', async () => {
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

          const url = 'https://example.com/doc';
          await addTaskReference({ task_id: task.id, url, session });
          await removeTaskReference({ task_id: task.id, url, session });

          const ev = await readEvents(pool, seeded.tenant_id, 'planner.task.reference-removed');
          expect(ev).toHaveLength(1);
          RefRemoved.parse(ev[0]?.payload);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('planner.plan.category-description-changed validates', async () => {
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

          await setCategoryDescription({ plan_id: plan.id, slot: 4, name: 'Bug', session });

          const ev = await readEvents(
            pool,
            seeded.tenant_id,
            'planner.plan.category-description-changed',
          );
          expect(ev).toHaveLength(1);
          const parsed = CatDescChanged.parse(ev[0]?.payload);
          expect(parsed.slot).toBe(4);
          expect(parsed.after).toBe('Bug');
          expect(parsed.before).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('planner.label.category-slot-changed validates', async () => {
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

          await attachLabelToCategorySlot({
            plan_id: plan.id,
            label_id: label.id,
            slot: 3,
            session,
          });

          const ev = await readEvents(
            pool,
            seeded.tenant_id,
            'planner.label.category-slot-changed',
          );
          expect(ev).toHaveLength(1);
          const parsed = LabelSlotChanged.parse(ev[0]?.payload);
          expect(parsed.before).toBeNull();
          expect(parsed.after).toBe(3);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

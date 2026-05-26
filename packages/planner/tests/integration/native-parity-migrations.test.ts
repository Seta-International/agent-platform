import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createBucket, createGroup, createLabel, createPlan, createTask } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

describe('native-parity schema migration', () => {
  it('tasks has all new columns', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const { rows } = await pool.query<{ column_name: string }>(
            `SELECT column_name FROM information_schema.columns
               WHERE table_schema = 'planner' AND table_name = 'tasks'`,
          );
          const cols = rows.map((r) => r.column_name);
          for (const c of [
            'start_at',
            'percent_complete',
            'priority_number',
            'preview_type',
            'order_hint',
            'assignee_priority',
            'is_deferred',
            'external_source',
            'external_id',
            'external_etag',
            'external_synced_at',
          ]) {
            expect(cols).toContain(c);
          }
          for (const removed of ['priority', 'progress', 'sort_order']) {
            expect(cols).not.toContain(removed);
          }
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('task_references table exists with unique (task_id, url)', async () => {
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
          const bucket = await createBucket({ plan_id: plan.id, name: 'Work', session });
          const task = await createTask({
            plan_id: plan.id,
            bucket_id: bucket.id,
            title: 'T1',
            session,
          });

          await pool.query(
            `INSERT INTO planner.task_references (tenant_id, task_id, url)
               VALUES ($1, $2, 'https://example.com/a')`,
            [seeded.tenant_id, task.id],
          );

          await expect(
            pool.query(
              `INSERT INTO planner.task_references (tenant_id, task_id, url)
                 VALUES ($1, $2, 'https://example.com/a')`,
              [seeded.tenant_id, task.id],
            ),
          ).rejects.toThrow(/task_references_uniq_task_url/);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('tasks_percent_complete_planner CHECK rejects values outside {0, 50, 100}', async () => {
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
          const bucket = await createBucket({ plan_id: plan.id, name: 'Work', session });
          const task = await createTask({
            plan_id: plan.id,
            bucket_id: bucket.id,
            title: 'T1',
            session,
          });

          await expect(
            pool.query(`UPDATE planner.tasks SET percent_complete = 101 WHERE id = $1`, [task.id]),
          ).rejects.toThrow(/tasks_percent_complete_planner/);
          await expect(
            pool.query(`UPDATE planner.tasks SET percent_complete = 25 WHERE id = $1`, [task.id]),
          ).rejects.toThrow(/tasks_percent_complete_planner/);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('tasks_priority_number_set CHECK rejects values not in (1,3,5,9)', async () => {
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
          const bucket = await createBucket({ plan_id: plan.id, name: 'Work', session });
          const task = await createTask({
            plan_id: plan.id,
            bucket_id: bucket.id,
            title: 'T1',
            session,
          });

          await expect(
            pool.query(`UPDATE planner.tasks SET priority_number = 2 WHERE id = $1`, [task.id]),
          ).rejects.toThrow(/tasks_priority_number_set/);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('tasks_preview_type_check CHECK rejects unknown enum values', async () => {
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
          const bucket = await createBucket({ plan_id: plan.id, name: 'Work', session });
          const task = await createTask({
            plan_id: plan.id,
            bucket_id: bucket.id,
            title: 'T1',
            session,
          });

          await expect(
            pool.query(`UPDATE planner.tasks SET preview_type = 'invalid' WHERE id = $1`, [
              task.id,
            ]),
          ).rejects.toThrow(/tasks_preview_type_check/);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('category_descriptions JSONB validator rejects bad keys', async () => {
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

          await expect(
            pool.query(
              `UPDATE planner.plans SET category_descriptions = '{"notACategory":"x"}'::jsonb WHERE id = $1`,
              [plan.id],
            ),
          ).rejects.toThrow(/category_descriptions_shape/);

          await pool.query(
            `UPDATE planner.plans SET category_descriptions = '{"category4":"Bug"}'::jsonb WHERE id = $1`,
            [plan.id],
          );
          const { rows } = await pool.query(
            `SELECT category_descriptions FROM planner.plans WHERE id = $1`,
            [plan.id],
          );
          expect(rows[0].category_descriptions).toEqual({ category4: 'Bug' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('labels.category_slot CHECK rejects values outside 1..25', async () => {
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

          await expect(
            pool.query(`UPDATE planner.labels SET category_slot = 26 WHERE id = $1`, [label.id]),
          ).rejects.toThrow(/labels_category_slot_range/);

          await pool.query(`UPDATE planner.labels SET category_slot = 10 WHERE id = $1`, [
            label.id,
          ]);
          const { rows } = await pool.query(
            `SELECT category_slot FROM planner.labels WHERE id = $1`,
            [label.id],
          );
          expect(rows[0].category_slot).toBe(10);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('labels_category_slot_uniq prevents two labels from sharing a slot in the same plan', async () => {
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
          const labelA = await createLabel({
            plan_id: plan.id,
            name: 'A',
            color: '#aaaaaa',
            session,
          });
          const labelB = await createLabel({
            plan_id: plan.id,
            name: 'B',
            color: '#bbbbbb',
            session,
          });

          await pool.query(`UPDATE planner.labels SET category_slot = 5 WHERE id = $1`, [
            labelA.id,
          ]);

          await expect(
            pool.query(`UPDATE planner.labels SET category_slot = 5 WHERE id = $1`, [labelB.id]),
          ).rejects.toThrow(/labels_category_slot_uniq/);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('partial unique index tasks_external_uniq fires for non-native sources', async () => {
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
          const bucket = await createBucket({ plan_id: plan.id, name: 'Work', session });

          const task1 = await createTask({
            plan_id: plan.id,
            bucket_id: bucket.id,
            title: 'T1',
            session,
          });
          const task2 = await createTask({
            plan_id: plan.id,
            bucket_id: bucket.id,
            title: 'T2',
            session,
          });

          await pool.query(
            `UPDATE planner.tasks SET external_source = 'm365', external_id = 'abc-1' WHERE id = $1`,
            [task1.id],
          );

          await expect(
            pool.query(
              `UPDATE planner.tasks SET external_source = 'm365', external_id = 'abc-1' WHERE id = $1`,
              [task2.id],
            ),
          ).rejects.toThrow(/tasks_external_uniq/);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createGroup, createPlan, createTask, updateTask } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const DB_OPTS = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('updateTask description sanitization', () => {
  it('strips <script> tags from description', async () => {
    await withTestDb(DB_OPTS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });
        const task = await createTask({ plan_id: plan.id, title: 'T', session });

        await updateTask({
          task_id: task.id,
          expected_version: 1,
          patch: { description: '<script>alert(1)</script>' },
          session,
        });

        const { rows } = await pool.query('SELECT description FROM planner.tasks WHERE id = $1', [
          task.id,
        ]);
        expect(rows[0].description).not.toContain('<script>');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('strips <iframe> tags from description', async () => {
    await withTestDb(DB_OPTS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });
        const task = await createTask({ plan_id: plan.id, title: 'T', session });

        await updateTask({
          task_id: task.id,
          expected_version: 1,
          patch: { description: '<iframe src="x">evil</iframe>' },
          session,
        });

        const { rows } = await pool.query('SELECT description FROM planner.tasks WHERE id = $1', [
          task.id,
        ]);
        expect(rows[0].description).not.toContain('<iframe');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('passes through allowed tags unchanged', async () => {
    await withTestDb(DB_OPTS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });
        const task = await createTask({ plan_id: plan.id, title: 'T', session });

        await updateTask({
          task_id: task.id,
          expected_version: 1,
          patch: { description: '<strong>bold</strong>' },
          session,
        });

        const { rows } = await pool.query('SELECT description FROM planner.tasks WHERE id = $1', [
          task.id,
        ]);
        expect(rows[0].description).toBe('<strong>bold</strong>');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('stores plain text description unchanged; description_text equals input', async () => {
    await withTestDb(DB_OPTS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });
        const task = await createTask({ plan_id: plan.id, title: 'T', session });

        await updateTask({
          task_id: task.id,
          expected_version: 1,
          patch: { description: 'plain text here' },
          session,
        });

        const { rows } = await pool.query(
          'SELECT description, description_text FROM planner.tasks WHERE id = $1',
          [task.id],
        );
        expect(rows[0].description).toBe('plain text here');
        expect(rows[0].description_text).toBe('plain text here');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('derives description_text by stripping HTML tags', async () => {
    await withTestDb(DB_OPTS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });
        const task = await createTask({ plan_id: plan.id, title: 'T', session });

        await updateTask({
          task_id: task.id,
          expected_version: 1,
          patch: { description: '<p>Hello <strong>world</strong></p>' },
          session,
        });

        const { rows } = await pool.query(
          'SELECT description_text FROM planner.tasks WHERE id = $1',
          [task.id],
        );
        expect(rows[0].description_text).toBe('Hello world');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('injects rel="noopener noreferrer" on links missing rel', async () => {
    await withTestDb(DB_OPTS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });
        const task = await createTask({ plan_id: plan.id, title: 'T', session });

        await updateTask({
          task_id: task.id,
          expected_version: 1,
          patch: { description: '<a href="https://example.com">link</a>' },
          session,
        });

        const { rows } = await pool.query('SELECT description FROM planner.tasks WHERE id = $1', [
          task.id,
        ]);
        expect(rows[0].description).toContain('rel="noopener noreferrer"');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('sets description_text to null when description is null', async () => {
    await withTestDb(DB_OPTS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });
        const task = await createTask({ plan_id: plan.id, title: 'T', session });

        await updateTask({
          task_id: task.id,
          expected_version: 1,
          patch: { description: null },
          session,
        });

        const { rows } = await pool.query(
          'SELECT description, description_text FROM planner.tasks WHERE id = $1',
          [task.id],
        );
        expect(rows[0].description).toBeNull();
        expect(rows[0].description_text).toBeNull();
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('sets description_text to null when description contains only whitespace', async () => {
    await withTestDb(DB_OPTS, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const seeded = await seedTenant(pool);
        const session = seeded.adminSession;
        const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G', session });
        const plan = await createPlan({ group_id: group.id, name: 'P', session });
        const task = await createTask({ plan_id: plan.id, title: 'T', session });

        await updateTask({
          task_id: task.id,
          expected_version: 1,
          patch: { description: '<p>   </p>' },
          session,
        });

        const { rows } = await pool.query(
          'SELECT description_text FROM planner.tasks WHERE id = $1',
          [task.id],
        );
        expect(rows[0].description_text).toBeNull();
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});

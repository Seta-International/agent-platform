import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { plannerDb } from '../../../src/backend/db/index.ts';
import { createComment } from '../../../src/backend/domain/create-comment.ts';
import { seedTenantAndTask } from '../../helpers.ts';

const dbEnv = () => ({
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
});

describe('createComment', () => {
  it('inserts comment row and returns DTO with display name', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { session, task_id } = await seedTenantAndTask(pool, {
          role: 'planner.contributor',
        });

        const dto = await createComment({ task_id, body: 'Hello world', session });

        expect(dto.body).toBe('Hello world');
        expect(dto.task_id).toBe(task_id);
        expect(dto.author_id).toBe(session.user_id);
        expect(dto.edited_at).toBeNull();
        expect(dto.author_display_name).toBeTruthy();
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects empty body', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { session, task_id } = await seedTenantAndTask(pool, {
          role: 'planner.contributor',
        });
        await expect(createComment({ task_id, body: '   ', session })).rejects.toMatchObject({
          code: 'VALIDATION',
        });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects body over 4000 chars', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { session, task_id } = await seedTenantAndTask(pool, {
          role: 'planner.contributor',
        });
        const body = 'x'.repeat(4001);
        await expect(createComment({ task_id, body, session })).rejects.toMatchObject({
          code: 'VALIDATION',
        });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects cross-tenant task access as NOT_FOUND or CROSS_TENANT', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const other = await seedTenantAndTask(pool, { role: 'planner.contributor' });
        const me = await seedTenantAndTask(pool, { role: 'planner.contributor' });
        await expect(
          createComment({ task_id: other.task_id, body: 'x', session: me.session }),
        ).rejects.toMatchObject({ code: expect.stringMatching(/NOT_FOUND|CROSS_TENANT/) });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects user without planner.task.comment.create permission', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { session, task_id } = await seedTenantAndTask(pool, {
          role: 'system.integrations.m365',
        });
        await expect(createComment({ task_id, body: 'x', session })).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('emits planner.comment.created event in same transaction', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { session, task_id, tenant_id } = await seedTenantAndTask(pool, {
          role: 'planner.contributor',
        });
        const dto = await createComment({ task_id, body: 'event check', session });

        const db = plannerDb();
        const rows = await db.execute(sql`
          SELECT event_type, payload FROM core.events
          WHERE tenant_id = ${tenant_id}::uuid AND aggregate_id = ${dto.id}
        `);
        expect(rows.rows).toHaveLength(1);
        // biome-ignore lint/suspicious/noExplicitAny: payload is JSONB
        const row = rows.rows[0] as any;
        expect(row.event_type).toBe('planner.comment.created');
        expect(row.payload.body).toBe('event check');
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});

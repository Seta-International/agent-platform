import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { plannerDb } from '../../../src/backend/db/index.ts';
import { createComment } from '../../../src/backend/domain/create-comment.ts';
import { listComments } from '../../../src/backend/domain/list-comments.ts';
import { seedTenantAndTask } from '../../helpers.ts';

const dbEnv = () => ({
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
});

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('listComments', () => {
  it('returns comments newest-first with no cursor', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { session, task_id } = await seedTenantAndTask(pool, {
          role: 'planner.contributor',
        });
        await createComment({ task_id, body: 'first', session });
        await sleep(5);
        await createComment({ task_id, body: 'second', session });
        await sleep(5);
        await createComment({ task_id, body: 'third', session });

        const r = await listComments({ task_id, session });
        expect(r.comments.map((c) => c.body)).toEqual(['third', 'second', 'first']);
        expect(r.has_more).toBe(false);
        expect(r.next_cursor).toBeUndefined();
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('paginates with cursor', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { session, task_id } = await seedTenantAndTask(pool, {
          role: 'planner.contributor',
        });
        for (let i = 0; i < 5; i++) {
          await createComment({ task_id, body: `c${i}`, session });
          await sleep(3);
        }

        const page1 = await listComments({ task_id, session, limit: 2 });
        expect(page1.comments).toHaveLength(2);
        expect(page1.has_more).toBe(true);
        expect(page1.next_cursor).toBeDefined();

        const page2 = await listComments({
          task_id,
          session,
          limit: 2,
          cursor: page1.next_cursor,
        });
        expect(page2.comments).toHaveLength(2);
        expect(page2.has_more).toBe(true);

        const all = [...page1.comments, ...page2.comments].map((c) => c.id);
        expect(new Set(all).size).toBe(4);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('excludes soft-deleted comments', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { session, task_id } = await seedTenantAndTask(pool, {
          role: 'planner.contributor',
        });
        const visible = await createComment({ task_id, body: 'visible', session });
        const gone = await createComment({ task_id, body: 'gone', session });

        await plannerDb().execute(
          sql`UPDATE planner.task_comments SET deleted_at = now() WHERE id = ${gone.id}::uuid`,
        );

        const r = await listComments({ task_id, session });
        expect(r.comments.map((x) => x.id)).toEqual([visible.id]);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects access without planner.task.comment.read', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { session, task_id } = await seedTenantAndTask(pool, {
          role: 'system.integrations.m365',
        });
        await expect(listComments({ task_id, session })).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});

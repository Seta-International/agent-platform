import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createComment } from '../../../src/backend/domain/create-comment.ts';
import { deleteComment } from '../../../src/backend/domain/delete-comment.ts';
import { listComments } from '../../../src/backend/domain/list-comments.ts';
import { makeMemberSession, seedTenantAndTask } from '../../helpers.ts';

const dbEnv = () => ({
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
});

describe('deleteComment', () => {
  it('author soft-deletes own comment', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { session, task_id } = await seedTenantAndTask(pool, {
          role: 'planner.contributor',
        });
        const c = await createComment({ task_id, body: 'x', session });

        await deleteComment({ comment_id: c.id, session });
        const r = await listComments({ task_id, session });
        expect(r.comments.map((x) => x.id)).not.toContain(c.id);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('group owner deletes comment of another user', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const {
          session: author,
          task_id,
          group_id,
          tenant_id,
        } = await seedTenantAndTask(pool, {
          role: 'planner.contributor',
        });
        const c = await createComment({ task_id, body: 'mod me', session: author });
        const owner = await makeMemberSession(pool, { tenant_id, group_id, role: 'owner' });

        await deleteComment({ comment_id: c.id, session: owner });
        const r = await listComments({ task_id, session: author });
        expect(r.comments.map((x) => x.id)).not.toContain(c.id);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('non-author non-owner cannot delete', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const {
          session: author,
          task_id,
          group_id,
          tenant_id,
        } = await seedTenantAndTask(pool, {
          role: 'planner.contributor',
        });
        const c = await createComment({ task_id, body: 'x', session: author });
        const member = await makeMemberSession(pool, { tenant_id, group_id, role: 'member' });

        await expect(deleteComment({ comment_id: c.id, session: member })).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('double delete returns NOT_FOUND on second call', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { session, task_id } = await seedTenantAndTask(pool, {
          role: 'planner.contributor',
        });
        const c = await createComment({ task_id, body: 'x', session });
        await deleteComment({ comment_id: c.id, session });
        await expect(deleteComment({ comment_id: c.id, session })).rejects.toMatchObject({
          code: 'NOT_FOUND',
        });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});

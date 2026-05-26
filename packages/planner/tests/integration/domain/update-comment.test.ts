import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createComment } from '../../../src/backend/domain/create-comment.ts';
import { updateComment } from '../../../src/backend/domain/update-comment.ts';
import { makeMemberSession, seedTenantAndTask } from '../../helpers.ts';

const dbEnv = () => ({
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
});

describe('updateComment', () => {
  it('author edits own comment and sets edited_at', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { session, task_id } = await seedTenantAndTask(pool, {
          role: 'planner.contributor',
        });
        const c = await createComment({ task_id, body: 'orig', session });

        const updated = await updateComment({ comment_id: c.id, body: 'edited', session });
        expect(updated.body).toBe('edited');
        expect(updated.edited_at).not.toBeNull();
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('non-author cannot edit even if group owner', async () => {
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
        const c = await createComment({ task_id, body: 'orig', session: author });
        const owner = await makeMemberSession(pool, { tenant_id, group_id, role: 'owner' });

        await expect(
          updateComment({ comment_id: c.id, body: 'hijack', session: owner }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects empty body on edit', async () => {
    await withTestDb(dbEnv(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { session, task_id } = await seedTenantAndTask(pool, {
          role: 'planner.contributor',
        });
        const c = await createComment({ task_id, body: 'x', session });
        await expect(
          updateComment({ comment_id: c.id, body: '  ', session }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});

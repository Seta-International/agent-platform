import { randomUUID } from 'node:crypto';
import { RequestContext } from '@mastra/core/request-context';
import { PgVector } from '@mastra/pg';
import { resetCoreDb } from '@seta/core/testing';
import { embedTask, PLANNER_VECTOR_NAMESPACE } from '@seta/planner';
import { plannerFindSimilarTasksTool } from '@seta/planner/agent-tools';
import { closePools, initPools } from '@seta/shared-db';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { seedTaskForTest } from '../../helpers/seed.ts';

const withDb = <T>(fn: (ctx: { pool: Pool; pgVector: PgVector }) => Promise<T>) =>
  withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      const pgVector = new PgVector({
        id: 'planner-task-embeddings-test',
        connectionString: databaseUrl,
        schemaName: PLANNER_VECTOR_NAMESPACE,
      });
      try {
        return await fn({ pool, pgVector });
      } finally {
        await pgVector.disconnect().catch(() => {});
        resetCoreDb();
        await closePools();
      }
    },
  );

function makeFakeCtx(actor: { type: 'user'; user_id: string }, tenantId: string) {
  const rc = new RequestContext<{ actor: typeof actor; tenant_id: string }>();
  rc.set('actor', actor);
  rc.set('tenant_id', tenantId);
  return rc;
}

function makeSessionProvider(tenantId: string) {
  return async (_actor: { user_id: string }) => ({
    tenant_id: tenantId,
    accessible_group_ids: [] as string[],
  });
}

async function setTaskAssignee(pool: Pool, taskId: string, userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO planner.task_assignments (task_id, user_id, assigned_by)
     VALUES ($1, $2, $2)`,
    [taskId, userId],
  );
}

async function backdateTask(pool: Pool, taskId: string, when: string): Promise<void> {
  await pool.query(`UPDATE planner.tasks SET created_at = $1::timestamptz WHERE id = $2`, [
    when,
    taskId,
  ]);
}

describe('plannerFindSimilarTasksTool', () => {
  it('returns similar past tasks with assignee for assignment reasoning', () =>
    withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const aliceId = randomUUID();

      const seeded = await seedTaskForTest(pool, {
        title: 'Migrate auth gateway to v1.6',
        description: 'Move the auth gateway from v1.5 to v1.6',
        skill_tags: ['auth'],
      });
      await setTaskAssignee(pool, seeded.task_id, aliceId);
      await embedTask(
        { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'sim-1' },
        { provider, pgVector },
      );

      const tool = plannerFindSimilarTasksTool({
        provider,
        pgVector,
        sessionProvider: makeSessionProvider(seeded.tenant_id),
      });
      const ctx = {
        requestContext: makeFakeCtx({ type: 'user', user_id: 'tester' }, seeded.tenant_id),
      } as unknown as Parameters<
        NonNullable<ReturnType<typeof plannerFindSimilarTasksTool>['execute']>
      >[1];

      const result = (await tool.execute!(
        {
          text: 'Migrate auth gateway to v1.7',
          completionStatus: 'any',
          createdWithin: 'any',
          onlyWithReviewState: false,
          limit: 5,
        },
        ctx,
      )) as {
        results: Array<{
          taskId: string;
          title: string;
          assigneeUserIds: string[];
          score: number;
          status: string;
          createdAt: string;
        }>;
      };

      expect(result.results.length).toBeGreaterThan(0);
      const top = result.results[0]!;
      expect(top.title).toMatch(/Migrate auth gateway/);
      expect(top.assigneeUserIds).toContain(aliceId);
      expect(typeof top.score).toBe('number');
    }));

  it('respects scope=recent-week (excludes older tasks)', () =>
    withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const seeded = await seedTaskForTest(pool, {
        title: 'old auth work',
        description: 'old',
        skill_tags: ['auth'],
      });
      await backdateTask(pool, seeded.task_id, '2025-01-01T00:00:00Z');
      await embedTask(
        { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'sim-old' },
        { provider, pgVector },
      );

      const tool = plannerFindSimilarTasksTool({
        provider,
        pgVector,
        sessionProvider: makeSessionProvider(seeded.tenant_id),
      });
      const ctx = {
        requestContext: makeFakeCtx({ type: 'user', user_id: 'tester' }, seeded.tenant_id),
      } as unknown as Parameters<
        NonNullable<ReturnType<typeof plannerFindSimilarTasksTool>['execute']>
      >[1];

      const result = (await tool.execute!(
        {
          text: 'auth',
          completionStatus: 'any',
          createdWithin: 'week',
          onlyWithReviewState: false,
          limit: 5,
        },
        ctx,
      )) as { results: unknown[] };
      expect(result.results).toHaveLength(0);
    }));
});

import { RequestContext } from '@mastra/core/request-context';
import { PgVector } from '@mastra/pg';
import { resetCoreDb } from '@seta/core/testing';
import { embedTask, PLANNER_VECTOR_NAMESPACE } from '@seta/planner';
import { searchTasksSemanticTool } from '@seta/planner/agent-tools';
import { closePools, initPools } from '@seta/shared-db';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { seedTaskForTest } from '../../helpers/seed.ts';

const withDb = <T>(fn: (ctx: { pool: import('pg').Pool; pgVector: PgVector }) => Promise<T>) =>
  withTestDb(
    {
      templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.SETA_TEST_PG_BASE as string,
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

function makeFakeCtx(actor: { type: 'user'; user_id: string }) {
  const rc = new RequestContext<{ actor: typeof actor }>();
  rc.set('actor', actor);
  return { requestContext: rc } as unknown as Parameters<
    NonNullable<ReturnType<typeof searchTasksSemanticTool>['execute']>
  >[1];
}

function makeSessionProvider(tenantId: string) {
  return async (_actor: { user_id: string }) => ({
    tenant_id: tenantId,
    accessible_group_ids: [] as string[],
  });
}

describe('Demo journey step 5 — find tasks needing review on terraform', () => {
  it('ranks the terraform task ahead of unrelated ones via vector similarity', () =>
    withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();

      const terraformTitle = 'Review terraform module changes for prod EKS';
      const terraformDesc =
        'This task needs a second pair of eyes on PR #143 before merge. Review required.';
      const terraformTask = await seedTaskForTest(pool, {
        title: terraformTitle,
        description: terraformDesc,
        skill_tags: ['terraform', 'kubernetes'],
      });
      const { tenant_id, task_id: terraformTaskId } = terraformTask;

      const okrTask = await seedTaskForTest(pool, {
        tenant_id,
        pool,
        title: 'Quarterly OKR planning',
        description: 'draft Q3 objectives',
        skill_tags: ['planning'],
      });

      const retroTask = await seedTaskForTest(pool, {
        tenant_id,
        pool,
        title: 'Database migration retrospective',
        description: 'lessons learned from the postgres upgrade',
        skill_tags: ['postgres'],
      });

      const taskIds = [terraformTaskId, okrTask.task_id, retroTask.task_id];
      for (const taskId of taskIds) {
        const { randomUUID } = await import('node:crypto');
        await embedTask(
          { tenant_id, task_id: taskId, event_id: randomUUID() },
          { provider, pgVector },
        );
      }

      const tool = searchTasksSemanticTool({
        provider,
        pgVector,
        sessionProvider: makeSessionProvider(tenant_id),
      });

      const actor = { type: 'user' as const, user_id: 'test-user-id' };
      const result = await tool.execute!(
        {
          query: `Title: ${terraformTitle}\nDescription: ${terraformDesc}\nSkills: terraform, kubernetes`,
          limit: 5,
        },
        makeFakeCtx(actor),
      );

      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('error');

      const { hits } = result as Extract<typeof result, { hits: unknown[] }>;
      expect(hits.length).toBeGreaterThanOrEqual(1);
      expect(hits[0]?.task.task_id).toBe(terraformTaskId);
      expect(hits[0]?.source).toBe('vector');
    }));
});

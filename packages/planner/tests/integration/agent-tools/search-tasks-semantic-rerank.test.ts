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

describe('search_tasks_semantic + rerank wiring', () => {
  it('passes hits through the (env-resolved) reranker and surfaces the reranker tag', () =>
    withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();

      const seeded = await seedTaskForTest(pool, {
        title: 'EKS provisioning',
        description: 'Configure and deploy an EKS cluster on AWS',
        skill_tags: ['kubernetes', 'aws'],
      });

      await embedTask(
        { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'rerank-e1' },
        { provider, pgVector },
      );

      const tool = searchTasksSemanticTool({
        provider,
        pgVector,
        sessionProvider: makeSessionProvider(seeded.tenant_id),
      });

      const actor = { type: 'user' as const, user_id: 'test-user-id' };
      const result = await tool.execute!({ query: 'EKS', limit: 5 }, makeFakeCtx(actor));

      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('error');
      const { hits, reranker: usedReranker } = result as Extract<
        typeof result,
        { hits: unknown[] }
      >;

      expect(hits).toHaveLength(1);
      expect(hits[0]?.task.task_id).toBe(seeded.task_id);
      const EPS = 0.05;
      expect(hits[0]?.rerank_score).toBeGreaterThanOrEqual(-EPS);
      expect(hits[0]?.rerank_score).toBeLessThanOrEqual(1 + EPS);
      expect(usedReranker).toBe('noop');
    }));

  it('respects limit after stage-2 truncation', () =>
    withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();

      const first = await seedTaskForTest(pool, {
        title: 'postgres migration task 1',
        description: 'Database migration work',
        skill_tags: ['postgres'],
      });
      const { tenant_id } = first;

      await embedTask(
        { tenant_id, task_id: first.task_id, event_id: 'rerank-limit-1' },
        { provider, pgVector },
      );

      for (let i = 2; i <= 5; i++) {
        const s = await seedTaskForTest(pool, {
          tenant_id,
          pool,
          title: `postgres migration task ${i}`,
          description: 'Database migration work',
          skill_tags: ['postgres'],
        });
        await embedTask(
          { tenant_id, task_id: s.task_id, event_id: `rerank-limit-${i}` },
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
        { query: 'postgres migration', limit: 2 },
        makeFakeCtx(actor),
      );

      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('error');
      const { hits } = result as Extract<typeof result, { hits: unknown[] }>;
      expect(hits.length).toBeLessThanOrEqual(2);
    }));
});

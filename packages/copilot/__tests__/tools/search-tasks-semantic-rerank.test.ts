/**
 * Integration tests for two-stage retrieval (hybrid + rerank) in search_tasks_semantic.
 *
 * Uses NoopReranker so the test is deterministic; verifies that the reranker tag
 * surfaces in the result and that the limit is respected after stage-2 truncation.
 */

import { RequestContext } from '@mastra/core/request-context';
import { embedTask } from '@seta/copilot/testing/embed';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { NoopReranker } from '@seta/shared-retrieval';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { seedTaskForTest } from '../../../planner/tests/helpers/seed.ts';
import { searchTasksSemanticTool } from '../../src/backend/tools/search-tasks-semantic.ts';

const withDb = <T>(fn: (ctx: { pool: import('pg').Pool }) => Promise<T>) =>
  withTestDb(
    {
      templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.SETA_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        return await fn({ pool });
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );

function makeFakeCtx(actor: { type: 'user'; user_id: string }) {
  const rc = new RequestContext<{ actor: typeof actor }>();
  rc.set('actor', actor);
  return { requestContext: rc } as unknown as Parameters<
    ReturnType<typeof searchTasksSemanticTool>['execute']
  >[1];
}

function makeSessionProvider(tenantId: string) {
  return async (_actor: { user_id: string }) => ({
    tenant_id: tenantId,
    accessible_group_ids: [] as string[],
  });
}

describe('search_tasks_semantic + rerank wiring', () => {
  it('passes hits through the configured reranker and surfaces the reranker tag in the result', () =>
    withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();
      const reranker = new NoopReranker();

      const seeded = await seedTaskForTest(pool, {
        title: 'EKS provisioning',
        description: 'Configure and deploy an EKS cluster on AWS',
        skill_tags: ['kubernetes', 'aws'],
      });

      await embedTask(
        { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'rerank-e1' },
        { pool, provider },
      );

      const tool = searchTasksSemanticTool({
        provider,
        pool,
        reranker,
        sessionProvider: makeSessionProvider(seeded.tenant_id),
      });

      const actor = { type: 'user' as const, user_id: 'test-user-id' };
      const result = await tool.execute({ query: 'EKS', limit: 5 }, makeFakeCtx(actor));

      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('error');
      const { hits, reranker: usedReranker } = result as Awaited<
        ReturnType<ReturnType<typeof tool.execute>>
      >;

      expect(hits).toHaveLength(1);
      expect(hits[0]?.task.task_id).toBe(seeded.task_id);
      expect(hits[0]?.rerank_score).toBeGreaterThanOrEqual(0);
      expect(usedReranker).toBe('noop');
    }));

  it('respects limit after stage-2 truncation', () =>
    withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();
      const reranker = new NoopReranker();

      const first = await seedTaskForTest(pool, {
        title: 'postgres migration task 1',
        description: 'Database migration work',
        skill_tags: ['postgres'],
      });
      const { tenant_id } = first;

      await embedTask(
        { tenant_id, task_id: first.task_id, event_id: 'rerank-limit-1' },
        { pool, provider },
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
          { pool, provider },
        );
      }

      const tool = searchTasksSemanticTool({
        provider,
        pool,
        reranker,
        sessionProvider: makeSessionProvider(tenant_id),
      });

      const actor = { type: 'user' as const, user_id: 'test-user-id' };
      const result = await tool.execute(
        { query: 'postgres migration', limit: 2 },
        makeFakeCtx(actor),
      );

      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('error');
      const { hits } = result as Awaited<ReturnType<ReturnType<typeof tool.execute>>>;
      expect(hits.length).toBeLessThanOrEqual(2);
    }));
});

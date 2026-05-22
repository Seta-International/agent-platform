/**
 * Integration tests for the search_tasks_semantic Mastra tool.
 *
 * Tests call tool.execute() directly without agent wiring, using an injected
 * sessionProvider so we can skip the live identity / RBAC stores.
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

/**
 * Build a fake Mastra ToolExecutionContext whose requestContext holds a valid actor.
 * The tool's actorFromContext reads ctx.requestContext.get('actor'), and the Mastra
 * requestContextSchema validation reads ctx.requestContext.all to check the actor field.
 */
function makeFakeCtx(actor: { type: 'user'; user_id: string }) {
  const rc = new RequestContext<{ actor: typeof actor }>();
  rc.set('actor', actor);
  return { requestContext: rc } as unknown as Parameters<
    ReturnType<typeof searchTasksSemanticTool>['execute']
  >[1];
}

/**
 * Build a sessionProvider stub that bypasses buildActorSession.
 * Returns a minimal session object with the given tenant_id.
 */
function makeSessionProvider(tenantId: string) {
  return async (_actor: { user_id: string }) => ({
    tenant_id: tenantId,
    accessible_group_ids: [] as string[],
  });
}

describe('searchTasksSemanticTool', () => {
  it('returns hits with task fields, score, snippet, source', () =>
    withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();

      const seeded = await seedTaskForTest(pool, {
        title: 'EKS provisioning',
        description: 'Configure and deploy an EKS cluster on AWS',
        skill_tags: ['kubernetes', 'aws'],
      });

      await embedTask(
        { tenant_id: seeded.tenant_id, task_id: seeded.task_id, event_id: 'test-e1' },
        { pool, provider },
      );

      const tool = searchTasksSemanticTool({
        provider,
        pool,
        reranker: new NoopReranker(),
        sessionProvider: makeSessionProvider(seeded.tenant_id),
      });

      const actor = { type: 'user' as const, user_id: 'test-user-id' };
      const result = await tool.execute({ query: 'EKS', limit: 5 }, makeFakeCtx(actor));

      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('error');
      const { hits } = result as Awaited<ReturnType<ReturnType<typeof tool.execute>>>;
      expect(hits).toHaveLength(1);
      const hit = hits[0]!;
      expect(hit.task.task_id).toBe(seeded.task_id);
      expect(hit.score).toBeGreaterThan(0);
      expect(hit.rerank_score).toBeGreaterThanOrEqual(0);
      expect(hit.snippet).toContain('EKS');
      expect(['fts', 'vector', 'hybrid'] as const).toContain(hit.source);
    }));

  it('respects limit', () =>
    withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();

      // Seed first task to get the tenant_id.
      const first = await seedTaskForTest(pool, {
        title: 'postgres migration task 1',
        description: 'Database migration work',
        skill_tags: ['postgres'],
      });
      const { tenant_id } = first;

      // Embed the first task.
      await embedTask(
        { tenant_id, task_id: first.task_id, event_id: 'test-limit-1' },
        { pool, provider },
      );

      // Seed and embed 4 more tasks in the same tenant.
      for (let i = 2; i <= 5; i++) {
        const s = await seedTaskForTest(pool, {
          tenant_id,
          pool,
          title: `postgres migration task ${i}`,
          description: 'Database migration work',
          skill_tags: ['postgres'],
        });
        await embedTask(
          { tenant_id, task_id: s.task_id, event_id: `test-limit-${i}` },
          { pool, provider },
        );
      }

      const tool = searchTasksSemanticTool({
        provider,
        pool,
        reranker: new NoopReranker(),
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

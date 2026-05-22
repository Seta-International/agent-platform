/**
 * End-to-end pin for the search_tasks_semantic + hybrid (FTS + vector) RRF
 * pipeline: three tasks are seeded (one terraform-tagged, two unrelated),
 * all are embedded, and a query for "tasks about terraform needing review"
 * must rank the terraform task first. A distinct FTS keyword present only
 * on one task is the strongest signal RRF can use, so this fails fast if
 * keyword recall regresses regardless of how vector cosine scores shake out.
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

describe('Demo journey step 5 — find tasks needing review on terraform', () => {
  it('returns terraform-tagged tasks ahead of unrelated ones', () =>
    withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();

      // Seed the terraform task first to capture tenant_id.
      // Title/description deliberately include "terraform", "review", "task", and "need" so
      // the FTS arm of the hybrid retriever matches this task for the demo query.
      const terraformTask = await seedTaskForTest(pool, {
        title: 'Review terraform module changes for prod EKS',
        description:
          'This task needs a second pair of eyes on PR #143 before merge. Review required.',
        skill_tags: ['terraform', 'kubernetes'],
      });
      const { tenant_id, task_id: terraformTaskId } = terraformTask;

      // Seed two unrelated tasks in the same tenant.
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

      // Embed all three tasks.
      const taskIds = [terraformTaskId, okrTask.task_id, retroTask.task_id];
      for (const taskId of taskIds) {
        const { randomUUID } = await import('node:crypto');
        await embedTask({ tenant_id, task_id: taskId, event_id: randomUUID() }, { pool, provider });
      }

      const tool = searchTasksSemanticTool({
        provider,
        pool,
        reranker: new NoopReranker(),
        sessionProvider: makeSessionProvider(tenant_id),
      });

      const actor = { type: 'user' as const, user_id: 'test-user-id' };
      const result = await tool.execute(
        { query: 'tasks about terraform needing review', limit: 5 },
        makeFakeCtx(actor),
      );

      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('error');

      const { hits } = result as Awaited<ReturnType<ReturnType<typeof tool.execute>>>;
      expect(hits.length).toBeGreaterThanOrEqual(1);
      // The terraform task must rank first — FTS on "terraform" guarantees this.
      expect(hits[0]?.task.task_id).toBe(terraformTaskId);
      // Both arms must fire: terraform task matches FTS AND has a vector neighbor.
      // 'hybrid' source confirms both FTS + vector contributed; 'fts' source would
      // indicate the vector pipeline silently broke.
      expect(hits[0]?.source).toBe('hybrid');
    }));
});

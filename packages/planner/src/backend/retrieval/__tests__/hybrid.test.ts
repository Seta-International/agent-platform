import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { embedTaskForTest } from '../../../../tests/helpers/embed.ts';
import { seedTaskForTest } from '../../../../tests/helpers/seed.ts';
import { HybridRetriever } from '../hybrid.ts';

const mockCtx = {
  tenant_id: 'irrelevant',
  actor: { userId: 'irrelevant', tenantId: 'irrelevant' },
};

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

describe('HybridRetriever', () => {
  it('FTS + vector fusion — task hit by both is rank 1', () =>
    withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();
      const retriever = new HybridRetriever({ pool });

      // Task A: strong FTS signal + embeddings for 'kubernetes deployment'
      const taskAOpts = {
        title: 'kubernetes deployment',
        description: 'rollout review for prod cluster',
        skill_tags: ['kubernetes'] as string[],
      };
      const taskA = await seedTaskForTest(pool, taskAOpts);

      // Decoy tasks — different tenant; they won't appear in taskA's results
      const taskBOpts = {
        title: 'deploy nginx reverse proxy',
        description: 'configure nginx as a load balancer',
        skill_tags: [] as string[],
      };
      const taskB = await seedTaskForTest(pool, taskBOpts);
      const taskCOpts = {
        title: 'setup postgresql database',
        description: 'install and configure postgresql',
        skill_tags: [] as string[],
      };
      const taskC = await seedTaskForTest(pool, taskCOpts);

      // Embed all three tasks
      for (const [t, opts] of [
        [taskA, taskAOpts],
        [taskB, taskBOpts],
        [taskC, taskCOpts],
      ] as const) {
        await embedTaskForTest(pool, {
          tenant_id: t.tenant_id,
          task_id: t.task_id,
          title: opts.title,
          description: opts.description,
          skill_tags: opts.skill_tags,
          provider,
        });
      }

      // Build query vector by embedding something semantically close to taskA
      const queryVectors = await provider.embed([
        'kubernetes deployment rollout review for prod cluster',
      ]);
      const queryVector = queryVectors[0]!;

      const hits = await retriever.query(
        {
          tenant_id: taskA.tenant_id,
          query: 'kubernetes deployment',
          queryVector,
          limit: 10,
        },
        mockCtx,
      );

      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]!.item.task_id).toBe(taskA.task_id);
      expect(hits[0]!.rank).toBe(1);
      expect(hits.every((h) => h.source === 'hybrid')).toBe(true);
    }));

  it('FTS-only path — appears in results when vector misses', () =>
    withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();
      const retriever = new HybridRetriever({ pool });

      const taskOpts = {
        title: 'literal-exact-phrase-xyz',
        description: null as string | null,
        skill_tags: [] as string[],
      };
      const task = await seedTaskForTest(pool, taskOpts);

      // Embed the task so it's indexed
      await embedTaskForTest(pool, {
        tenant_id: task.tenant_id,
        task_id: task.task_id,
        title: taskOpts.title,
        description: taskOpts.description,
        skill_tags: taskOpts.skill_tags,
        provider,
      });

      // Use an unrelated query vector that won't match semantically
      const unrelatedVectors = await provider.embed(['unrelated semantic query about cooking']);
      const unrelatedQueryVector = unrelatedVectors[0]!;

      const hits = await retriever.query(
        {
          tenant_id: task.tenant_id,
          query: 'literal-exact-phrase-xyz',
          queryVector: unrelatedQueryVector,
          limit: 10,
        },
        mockCtx,
      );

      // FTS should find the task even if vector score is low/absent
      const found = hits.find((h) => h.item.task_id === task.task_id);
      expect(found).toBeDefined();
    }));
});

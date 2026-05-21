import { embedTask } from '@seta/copilot/testing/embed';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { seedTaskForTest } from '../../../../tests/helpers/seed.ts';
import { VectorRetriever } from '../vector.ts';

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

describe('VectorRetriever', () => {
  it('nearest neighbors — target task is rank 1', () =>
    withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();
      const retriever = new VectorRetriever({ pool });

      const t1 = await seedTaskForTest(pool, {
        title: 'kubernetes cluster setup',
        description: 'Setting up a kubernetes cluster with nodes and pods.',
        skill_tags: [],
      });
      const t2 = await seedTaskForTest(pool, {
        tenant_id: t1.tenant_id,
        title: 'deploy nginx reverse proxy',
        description: 'Configure nginx as a reverse proxy for web traffic.',
        skill_tags: [],
      });
      const t3 = await seedTaskForTest(pool, {
        tenant_id: t1.tenant_id,
        title: 'setup postgresql database',
        description: 'Install and configure postgresql database server.',
        skill_tags: [],
      });

      // Embed all tasks
      for (const t of [t1, t2, t3]) {
        await embedTask(
          { tenant_id: t.tenant_id, task_id: t.task_id, event_id: 'test' },
          { pool, provider },
        );
      }

      // Query using vector for t1
      const t1Vector = await provider.embed([
        'kubernetes cluster setup Setting up a kubernetes cluster with nodes and pods.',
      ]);
      const queryVector = t1Vector[0]!;

      const hits = await retriever.query(
        { tenant_id: t1.tenant_id, queryVector, limit: 3 },
        mockCtx,
      );

      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]!.item.task_id).toBe(t1.task_id);
      expect(hits[0]!.rank).toBe(1);
      expect(hits.every((h) => h.source === 'vector')).toBe(true);
    }));

  it('tenant isolation — no cross-tenant leakage', () =>
    withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();
      const retriever = new VectorRetriever({ pool });

      const taskA = await seedTaskForTest(pool, {
        title: 'machine learning pipeline tenantA',
        description: 'Build ML pipeline for training and inference.',
        skill_tags: [],
      });
      const taskB = await seedTaskForTest(pool, {
        title: 'machine learning pipeline tenantB',
        description: 'Build ML pipeline for training and inference.',
        skill_tags: [],
      });

      // Embed both tasks
      await embedTask(
        { tenant_id: taskA.tenant_id, task_id: taskA.task_id, event_id: 'test-a' },
        { pool, provider },
      );
      await embedTask(
        { tenant_id: taskB.tenant_id, task_id: taskB.task_id, event_id: 'test-b' },
        { pool, provider },
      );

      // Use a shared query vector
      const queryVectors = await provider.embed(['machine learning pipeline']);
      const queryVector = queryVectors[0]!;

      const hitsA = await retriever.query(
        { tenant_id: taskA.tenant_id, queryVector, limit: 10 },
        mockCtx,
      );
      const hitsB = await retriever.query(
        { tenant_id: taskB.tenant_id, queryVector, limit: 10 },
        mockCtx,
      );

      // Each tenant sees only their own task
      expect(hitsA.every((h) => h.item.task_id === taskA.task_id)).toBe(true);
      expect(hitsB.every((h) => h.item.task_id === taskB.task_id)).toBe(true);
    }));

  it('chunk dedup — long task appears exactly once in results', () =>
    withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();
      const retriever = new VectorRetriever({ pool });

      // Generate a ~1500-word description to force multiple chunks
      const longDescription = Array.from(
        { length: 150 },
        (_, i) =>
          `Paragraph ${i + 1}: This is a detailed description of a complex distributed system task involving microservices architecture, container orchestration, service mesh configuration, load balancing strategies, and fault tolerance patterns.`,
      ).join('\n\n');

      const task = await seedTaskForTest(pool, {
        title: 'distributed system architecture design',
        description: longDescription,
        skill_tags: [],
      });

      await embedTask(
        { tenant_id: task.tenant_id, task_id: task.task_id, event_id: 'test-chunk' },
        { pool, provider },
      );

      // Confirm multiple chunks were stored
      const countResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM planner.task_embeddings WHERE tenant_id = $1 AND task_id = $2`,
        [task.tenant_id, task.task_id],
      );
      expect(Number(countResult.rows[0]!.count)).toBeGreaterThanOrEqual(2);

      // Query and verify task appears exactly once
      const queryVectors = await provider.embed(['distributed system architecture design']);
      const queryVector = queryVectors[0]!;

      const hits = await retriever.query(
        { tenant_id: task.tenant_id, queryVector, limit: 10 },
        mockCtx,
      );

      const matchingHits = hits.filter((h) => h.item.task_id === task.task_id);
      expect(matchingHits).toHaveLength(1);
    }));
});

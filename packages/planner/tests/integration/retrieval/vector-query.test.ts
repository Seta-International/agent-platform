import { PgVector } from '@mastra/pg';
import { resetCoreDb } from '@seta/core/testing';
import {
  ensurePlannerVectorIndex,
  PLANNER_VECTOR_INDEX,
  PLANNER_VECTOR_NAMESPACE,
  searchTasks,
  type TaskVectorMetadata,
  taskVectorId,
} from '@seta/planner';
import { closePools, initPools } from '@seta/shared-db';
import { NoopReranker } from '@seta/shared-retrieval';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';

const withDb = <T>(fn: (ctx: { pgVector: PgVector }) => Promise<T>) =>
  withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    async ({ databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      const pgVector = new PgVector({
        id: 'planner-task-embeddings-test',
        connectionString: databaseUrl,
        schemaName: PLANNER_VECTOR_NAMESPACE,
      });
      try {
        return await fn({ pgVector });
      } finally {
        await pgVector.disconnect().catch(() => {});
        resetCoreDb();
        await closePools();
      }
    },
  );

async function seedVector(
  pgVector: PgVector,
  provider: FakeEmbeddingProvider,
  meta: TaskVectorMetadata,
  source: string,
): Promise<void> {
  await ensurePlannerVectorIndex(pgVector);
  const [vector] = await provider.embed([source]);
  if (!vector) throw new Error('embedMany returned no vector');
  await pgVector.upsert({
    indexName: PLANNER_VECTOR_INDEX,
    vectors: [vector],
    metadata: [meta],
    ids: [taskVectorId(meta.tenant_id, meta.task_id)],
  });
}

describe('Mastra PgVector retrieval', () => {
  it('nearest-neighbor task ranks #1; cosine + rerank scores both in [0, 1]', () =>
    withDb(async ({ pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const tenantId = crypto.randomUUID();
      const planId = crypto.randomUUID();
      const t1Id = crypto.randomUUID();
      const t2Id = crypto.randomUUID();
      const t3Id = crypto.randomUUID();

      const t1Source = 'Title: kubernetes cluster setup\nDescription: nodes and pods';
      const t2Source = 'Title: deploy nginx reverse proxy\nDescription: configure as load balancer';
      const t3Source =
        'Title: setup postgresql database\nDescription: install and configure postgres server';

      await seedVector(
        pgVector,
        provider,
        {
          tenant_id: tenantId,
          task_id: t1Id,
          plan_id: planId,
          chunk_text: t1Source,
          source_hash: 'h1',
          model_id: provider.modelId,
          embedded_at: new Date().toISOString(),
        },
        t1Source,
      );
      await seedVector(
        pgVector,
        provider,
        {
          tenant_id: tenantId,
          task_id: t2Id,
          plan_id: planId,
          chunk_text: t2Source,
          source_hash: 'h2',
          model_id: provider.modelId,
          embedded_at: new Date().toISOString(),
        },
        t2Source,
      );
      await seedVector(
        pgVector,
        provider,
        {
          tenant_id: tenantId,
          task_id: t3Id,
          plan_id: planId,
          chunk_text: t3Source,
          source_hash: 'h3',
          model_id: provider.modelId,
          embedded_at: new Date().toISOString(),
        },
        t3Source,
      );

      const { hits, reranker } = await searchTasks(
        {
          query: t1Source,
          tenant_id: tenantId,
          limit: 3,
        },
        { provider, pgVector, reranker: new NoopReranker() },
      );

      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]!.item.task_id).toBe(t1Id);
      expect(hits[0]!.rank).toBe(1);
      expect(hits.every((h) => h.source === 'vector')).toBe(true);
      const EPS = 0.05;
      for (const h of hits) {
        expect(h.score).toBeGreaterThanOrEqual(-EPS);
        expect(h.score).toBeLessThanOrEqual(1 + EPS);
        expect(h.rerankScore).toBeGreaterThanOrEqual(-EPS);
        expect(h.rerankScore).toBeLessThanOrEqual(1 + EPS);
      }
      expect(hits[0]!.score).toBeGreaterThan(0.9);
      expect(reranker).toBe('noop');
    }));

  it('tenant isolation — metadata filter prevents cross-tenant leakage', () =>
    withDb(async ({ pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const tenantA = crypto.randomUUID();
      const tenantB = crypto.randomUUID();
      const planId = crypto.randomUUID();
      const taskAId = crypto.randomUUID();
      const taskBId = crypto.randomUUID();
      const sharedSource = 'Title: machine learning pipeline\nDescription: training and inference';

      await seedVector(
        pgVector,
        provider,
        {
          tenant_id: tenantA,
          task_id: taskAId,
          plan_id: planId,
          chunk_text: sharedSource,
          source_hash: 'a',
          model_id: provider.modelId,
          embedded_at: new Date().toISOString(),
        },
        sharedSource,
      );
      await seedVector(
        pgVector,
        provider,
        {
          tenant_id: tenantB,
          task_id: taskBId,
          plan_id: planId,
          chunk_text: sharedSource,
          source_hash: 'b',
          model_id: provider.modelId,
          embedded_at: new Date().toISOString(),
        },
        sharedSource,
      );

      const { hits: hitsA } = await searchTasks(
        { query: 'machine learning pipeline', tenant_id: tenantA, limit: 10 },
        { provider, pgVector, reranker: new NoopReranker() },
      );
      const { hits: hitsB } = await searchTasks(
        { query: 'machine learning pipeline', tenant_id: tenantB, limit: 10 },
        { provider, pgVector, reranker: new NoopReranker() },
      );

      expect(hitsA.every((h) => h.item.task_id === taskAId)).toBe(true);
      expect(hitsB.every((h) => h.item.task_id === taskBId)).toBe(true);
    }));
});

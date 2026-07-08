import { PgVector } from '@mastra/pg';
import { resetCoreDb } from '@seta/core/testing';
import { PLANNER_VECTOR_NAMESPACE, searchTasks } from '@seta/planner';
import { closePools, initPools } from '@seta/shared-db';
import { NoopReranker } from '@seta/shared-retrieval';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { embedTaskForTest } from '../helpers/embed.ts';
import { seedTaskForTest } from '../helpers/seed.ts';

const withDb = <T>(fn: (ctx: { pool: import('pg').Pool; pgVector: PgVector }) => Promise<T>) =>
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

describe('searchTasks', () => {
  it('vector path — returns hit with source=vector for matching task; score in [0,1]', () =>
    withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();

      const taskOpts = {
        title: 'kubernetes review',
        description: 'review prod cluster for kubernetes deployment issues',
        labels: ['kubernetes'] as string[],
      };
      const task = await seedTaskForTest(pool, taskOpts);

      await embedTaskForTest({
        tenant_id: task.tenant_id,
        task_id: task.task_id,
        plan_id: task.plan_id,
        title: taskOpts.title,
        description: taskOpts.description,
        labels: taskOpts.labels,
        provider,
        pgVector,
      });

      const { hits, reranker } = await searchTasks(
        {
          query: 'kubernetes review prod cluster',
          tenant_id: task.tenant_id,
          limit: 10,
        },
        { provider, pgVector, reranker: new NoopReranker() },
      );

      expect(hits.length).toBeGreaterThanOrEqual(1);
      const hit = hits.find((h) => h.item.task_id === task.task_id);
      expect(hit).toBeDefined();
      expect(hit!.source).toBe('vector');
      const EPS = 0.05;
      expect(hit!.score).toBeGreaterThanOrEqual(-EPS);
      expect(hit!.score).toBeLessThanOrEqual(1 + EPS);
      expect(hit!.rerankScore).toBeGreaterThanOrEqual(-EPS);
      expect(hit!.rerankScore).toBeLessThanOrEqual(1 + EPS);
      expect(reranker).toBe('noop');
    }));

  it('degrades to empty when the embedding provider throws', () =>
    withDb(async ({ pool, pgVector }) => {
      const realProvider = new FakeEmbeddingProvider();

      const taskOpts = {
        title: 'kubernetes review',
        description: 'review prod cluster for kubernetes deployment issues',
        labels: ['kubernetes'] as string[],
      };
      const task = await seedTaskForTest(pool, taskOpts);

      await embedTaskForTest({
        tenant_id: task.tenant_id,
        task_id: task.task_id,
        plan_id: task.plan_id,
        title: taskOpts.title,
        description: taskOpts.description,
        labels: taskOpts.labels,
        provider: realProvider,
        pgVector,
      });

      const failingProvider: import('@seta/shared-embeddings').EmbeddingProvider = {
        modelId: 'failing:provider',
        dimensions: 1536,
        embed: async () => {
          throw new Error('provider unavailable');
        },
      };

      const { hits, reranker } = await searchTasks(
        {
          query: 'kubernetes',
          tenant_id: task.tenant_id,
          limit: 10,
        },
        { provider: failingProvider, pgVector, reranker: new NoopReranker() },
      );

      expect(hits).toEqual([]);
      expect(reranker).toBe('fallback');
    }));

  it('plan scope — plan_ids filter excludes matching tasks from other plans in the same tenant', () =>
    withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();

      const taskOpts = {
        title: 'kubernetes review',
        description: 'review prod cluster for kubernetes deployment issues',
        labels: ['kubernetes'] as string[],
      };

      // Task A in its own fresh tenant + plan A.
      const taskA = await seedTaskForTest(pool, taskOpts);
      // Task B: same tenant, different plan (seedTaskForTest makes a new plan per call).
      const taskB = await seedTaskForTest(pool, { ...taskOpts, tenant_id: taskA.tenant_id, pool });

      for (const t of [taskA, taskB]) {
        await embedTaskForTest({
          tenant_id: t.tenant_id,
          task_id: t.task_id,
          plan_id: t.plan_id,
          title: taskOpts.title,
          description: taskOpts.description,
          labels: taskOpts.labels,
          provider,
          pgVector,
        });
      }

      const { hits } = await searchTasks(
        {
          query: 'kubernetes review prod cluster',
          tenant_id: taskA.tenant_id,
          plan_ids: [taskA.plan_id],
          limit: 10,
        },
        { provider, pgVector, reranker: new NoopReranker() },
      );

      const ids = hits.map((h) => h.item.task_id);
      expect(ids).toContain(taskA.task_id);
      expect(ids).not.toContain(taskB.task_id);
    }));

  it('group scope — plan_ids filter includes matching tasks from another plan in the same group', () =>
    withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();

      const taskOpts = {
        title: 'kubernetes review',
        description: 'review prod cluster for kubernetes deployment issues',
        labels: ['kubernetes'] as string[],
      };

      // Task A in its own fresh tenant + group + plan A.
      const taskA = await seedTaskForTest(pool, taskOpts);
      // Task B: same tenant AND same group, but a different plan.
      const taskB = await seedTaskForTest(pool, {
        ...taskOpts,
        tenant_id: taskA.tenant_id,
        group_id: taskA.group_id,
        pool,
      });
      // Task C: same tenant, different group entirely — must stay excluded.
      const taskC = await seedTaskForTest(pool, { ...taskOpts, tenant_id: taskA.tenant_id, pool });

      for (const t of [taskA, taskB, taskC]) {
        await embedTaskForTest({
          tenant_id: t.tenant_id,
          task_id: t.task_id,
          plan_id: t.plan_id,
          title: taskOpts.title,
          description: taskOpts.description,
          labels: taskOpts.labels,
          provider,
          pgVector,
        });
      }

      const { hits } = await searchTasks(
        {
          query: 'kubernetes review prod cluster',
          tenant_id: taskA.tenant_id,
          plan_ids: [taskA.plan_id, taskB.plan_id],
          limit: 10,
        },
        { provider, pgVector, reranker: new NoopReranker() },
      );

      const ids = hits.map((h) => h.item.task_id);
      expect(ids).toContain(taskA.task_id);
      expect(ids).toContain(taskB.task_id);
      expect(ids).not.toContain(taskC.task_id);
    }));

  it('empty results — tenant with no tasks or embeddings returns []', () =>
    withDb(async ({ pgVector }) => {
      const provider = new FakeEmbeddingProvider();

      const emptyTenantId = crypto.randomUUID();

      const { hits } = await searchTasks(
        {
          query: 'kubernetes',
          tenant_id: emptyTenantId,
          limit: 10,
        },
        { provider, pgVector, reranker: new NoopReranker() },
      );

      expect(hits).toEqual([]);
    }));
});

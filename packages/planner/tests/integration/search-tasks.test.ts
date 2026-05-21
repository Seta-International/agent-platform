import { embedTask } from '@seta/copilot/testing/embed';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { searchTasks } from '../../src/index.ts';
import { seedTaskForTest } from '../helpers/seed.ts';

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

describe('searchTasks', () => {
  it('hybrid path — returns hit with source=hybrid for matching task', () =>
    withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();

      const task = await seedTaskForTest(pool, {
        title: 'kubernetes review',
        description: 'review prod cluster for kubernetes deployment issues',
        skill_tags: ['kubernetes'],
      });

      await embedTask(
        { tenant_id: task.tenant_id, task_id: task.task_id, event_id: 'test' },
        { pool, provider },
      );

      const hits = await searchTasks(
        {
          query: 'kubernetes',
          tenant_id: task.tenant_id,
          limit: 10,
        },
        { provider, pool },
      );

      expect(hits.length).toBeGreaterThanOrEqual(1);
      const hit = hits.find((h) => h.item.task_id === task.task_id);
      expect(hit).toBeDefined();
      expect(hit!.source).toBe('hybrid');
    }));

  it('FTS fallback when provider throws — result still includes task with source=fts', () =>
    withDb(async ({ pool }) => {
      const realProvider = new FakeEmbeddingProvider();

      const task = await seedTaskForTest(pool, {
        title: 'kubernetes review',
        description: 'review prod cluster for kubernetes deployment issues',
        skill_tags: ['kubernetes'],
      });

      // Embed with real provider so FTS tsv is populated
      await embedTask(
        { tenant_id: task.tenant_id, task_id: task.task_id, event_id: 'test' },
        { pool, provider: realProvider },
      );

      const failingProvider: import('@seta/shared-embeddings').EmbeddingProvider = {
        modelId: 'failing:provider',
        dimensions: 1536,
        embed: async () => {
          throw new Error('provider unavailable');
        },
      };

      const hits = await searchTasks(
        {
          query: 'kubernetes',
          tenant_id: task.tenant_id,
          limit: 10,
        },
        { provider: failingProvider, pool },
      );

      expect(hits.length).toBeGreaterThanOrEqual(1);
      const hit = hits.find((h) => h.item.task_id === task.task_id);
      expect(hit).toBeDefined();
      expect(hit!.source).toBe('fts');
    }));

  it('empty results — tenant with no tasks or embeddings returns []', () =>
    withDb(async ({ pool }) => {
      const provider = new FakeEmbeddingProvider();

      // A freshly-minted UUID that has never had any planner data → always empty.
      const emptyTenantId = crypto.randomUUID();

      const hits = await searchTasks(
        {
          query: 'kubernetes',
          tenant_id: emptyTenantId,
          limit: 10,
        },
        { provider, pool },
      );

      expect(hits).toEqual([]);
    }));
});

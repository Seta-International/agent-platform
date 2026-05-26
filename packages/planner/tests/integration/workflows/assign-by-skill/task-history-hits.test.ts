import { PgVector } from '@mastra/pg';
import { resetCoreDb } from '@seta/core/testing';
import { PLANNER_VECTOR_NAMESPACE } from '@seta/planner';
import { closePools, initPools } from '@seta/shared-db';
import { NoopReranker } from '@seta/shared-retrieval';
import { FakeEmbeddingProvider, withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { fetchTaskHistoryHits } from '../../../../src/backend/workflows/assign-by-skill/steps/task-history-hits.ts';
import { embedTaskForTest } from '../../../helpers/embed.ts';
import { seedTaskForTest } from '../../../helpers/seed.ts';

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
        id: 'planner-history-test',
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

async function assign(
  pool: import('pg').Pool,
  taskId: string,
  userId: string,
  assignedBy: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO planner.task_assignments (task_id, user_id, assigned_by)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [taskId, userId, assignedBy],
  );
}

describe('fetchTaskHistoryHits', () => {
  it('surfaces users whose past tasks are similar to the current task', () =>
    withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const reranker = new NoopReranker();

      const past = await seedTaskForTest(pool, {
        title: 'kubernetes review',
        description: 'review prod cluster deployment',
        skill_tags: ['kubernetes'],
      });
      await embedTaskForTest({
        ...past,
        title: 'kubernetes review',
        description: 'review prod cluster deployment',
        skill_tags: ['kubernetes'],
        provider,
        pgVector,
      });
      const veteran = crypto.randomUUID();
      await assign(pool, past.task_id, veteran, crypto.randomUUID());

      const out = await fetchTaskHistoryHits(
        {
          tenantId: past.tenant_id,
          task: {
            taskId: crypto.randomUUID(),
            tenantId: past.tenant_id,
            planId: past.plan_id,
            title: 'kubernetes review cluster',
            description: 'investigate deployment failure',
            skill_tags: [],
            labels: [],
            due_at: null,
            priority_number: 5,
          },
        },
        { provider, pgVector, reranker },
      );

      const hit = out.find((h) => h.userId === veteran);
      expect(hit).toBeDefined();
      expect(hit!.matches).toBeGreaterThanOrEqual(1);
      expect(hit!.historyScore).toBeGreaterThanOrEqual(0);
      expect(hit!.historyScore).toBeLessThanOrEqual(1);
    }));

  it('excludes the task itself from results', () =>
    withDb(async ({ pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const reranker = new NoopReranker();
      const seeded = await seedTaskForTest(pool, {
        title: 'rust',
        description: 'rust memory work',
        skill_tags: ['rust'],
      });
      await embedTaskForTest({
        ...seeded,
        title: 'rust',
        description: 'rust memory work',
        skill_tags: ['rust'],
        provider,
        pgVector,
      });
      const self = crypto.randomUUID();
      await assign(pool, seeded.task_id, self, crypto.randomUUID());

      const out = await fetchTaskHistoryHits(
        {
          tenantId: seeded.tenant_id,
          task: {
            taskId: seeded.task_id,
            tenantId: seeded.tenant_id,
            planId: seeded.plan_id,
            title: 'rust memory work',
            description: 'rust',
            skill_tags: ['rust'],
            labels: [],
            due_at: null,
            priority_number: 5,
          },
        },
        { provider, pgVector, reranker },
      );

      expect(out.find((h) => h.userId === self)).toBeUndefined();
    }));

  it('returns [] when no past tasks exist (cold start)', () =>
    withDb(async ({ pool: _pool, pgVector }) => {
      const provider = new FakeEmbeddingProvider();
      const out = await fetchTaskHistoryHits(
        {
          tenantId: crypto.randomUUID(),
          task: {
            taskId: crypto.randomUUID(),
            tenantId: crypto.randomUUID(),
            planId: crypto.randomUUID(),
            title: 'go',
            description: 'first task ever',
            skill_tags: ['go'],
            labels: [],
            due_at: null,
            priority_number: 5,
          },
        },
        { provider, pgVector, reranker: new NoopReranker() },
      );
      expect(out).toEqual([]);
    }));
});

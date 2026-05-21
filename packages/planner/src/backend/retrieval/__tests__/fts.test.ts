import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { seedTaskForTest } from '../../../../tests/helpers/seed.ts';
import { FtsRetriever } from '../fts.ts';

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

describe('FtsRetriever', () => {
  it('ranks by keyword — matching tasks returned, non-matching excluded', () =>
    withDb(async ({ pool }) => {
      const retriever = new FtsRetriever({ pool });

      const t1 = await seedTaskForTest(pool, {
        title: 'kubernetes cluster setup',
        description: null,
        skill_tags: [],
      });
      const t2 = await seedTaskForTest(pool, {
        tenant_id: t1.tenant_id,
        title: 'kubernetes pod autoscaling',
        description: null,
        skill_tags: [],
      });
      await seedTaskForTest(pool, {
        tenant_id: t1.tenant_id,
        title: 'deploy nginx reverse proxy',
        description: null,
        skill_tags: [],
      });

      const hits = await retriever.query(
        { query: 'kubernetes', tenant_id: t1.tenant_id, limit: 10 },
        mockCtx,
      );

      expect(hits).toHaveLength(2);
      const [first, second] = hits;
      expect(first!.rank).toBe(1);
      expect(second!.rank).toBe(2);
      expect(hits.every((h) => h.source === 'fts')).toBe(true);

      const returnedIds = hits.map((h) => h.item.task_id);
      expect(returnedIds).toContain(t1.task_id);
      expect(returnedIds).toContain(t2.task_id);
    }));

  it('tenant isolation — no cross-tenant leakage', () =>
    withDb(async ({ pool }) => {
      const retriever = new FtsRetriever({ pool });

      const tenantA = await seedTaskForTest(pool, {
        title: 'kubernetes deployment tenantA',
        description: null,
        skill_tags: [],
      });
      const tenantB = await seedTaskForTest(pool, {
        title: 'kubernetes scaling tenantB',
        description: null,
        skill_tags: [],
      });

      const hitsA = await retriever.query(
        { query: 'kubernetes', tenant_id: tenantA.tenant_id, limit: 10 },
        mockCtx,
      );
      const hitsB = await retriever.query(
        { query: 'kubernetes', tenant_id: tenantB.tenant_id, limit: 10 },
        mockCtx,
      );

      expect(hitsA).toHaveLength(1);
      expect(hitsA[0]!.item.task_id).toBe(tenantA.task_id);

      expect(hitsB).toHaveLength(1);
      expect(hitsB[0]!.item.task_id).toBe(tenantB.task_id);
    }));

  it('no match returns empty array', () =>
    withDb(async ({ pool }) => {
      const retriever = new FtsRetriever({ pool });

      const seeded = await seedTaskForTest(pool, {
        title: 'regular task about spreadsheets',
        description: null,
        skill_tags: [],
      });

      const hits = await retriever.query(
        { query: 'xyzzyplonkquux', tenant_id: seeded.tenant_id, limit: 10 },
        mockCtx,
      );

      expect(hits).toHaveLength(0);
    }));
});

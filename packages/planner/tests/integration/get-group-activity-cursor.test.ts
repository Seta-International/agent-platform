import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createGroup, createPlan, createTask, getGroupActivity } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

describe('getGroupActivity cursor pagination', () => {
  it('returns has_more=false and no next_cursor when items < limit', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G1', session });
          const plan = await createPlan({ group_id: group.id, name: 'P1', session });
          await createTask({ plan_id: plan.id, title: 'T1', session });

          const result = await getGroupActivity({
            group_id: group.id,
            limit: 50,
            session,
          });

          expect(result.has_more).toBe(false);
          expect(result.next_cursor).toBeUndefined();
          expect(result.items.length).toBeGreaterThanOrEqual(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns next_cursor and has_more=true when items === limit, and cursor fetches next page', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G2', session });
          const plan = await createPlan({ group_id: group.id, name: 'P2', session });
          for (let i = 0; i < 5; i++) {
            await createTask({ plan_id: plan.id, title: `T${i}`, session });
          }

          // Page 1: limit=3
          const page1 = await getGroupActivity({
            group_id: group.id,
            limit: 3,
            session,
          });

          expect(page1.has_more).toBe(true);
          expect(page1.next_cursor).toBeDefined();
          expect(page1.items).toHaveLength(3);

          // Page 2 using cursor
          const page2 = await getGroupActivity({
            group_id: group.id,
            cursor: page1.next_cursor!,
            limit: 3,
            session,
          });

          expect(page2.items.length).toBeGreaterThanOrEqual(1);
          // No overlap between pages
          const page1Ids = new Set(page1.items.map((i) => i.event_id));
          for (const item of page2.items) {
            expect(page1Ids.has(item.event_id)).toBe(false);
          }
          // Page 2 items are older (occurred_at <= page 1 oldest)
          const page1OldestTs = page1.items[page1.items.length - 1]!.occurred_at;
          for (const item of page2.items) {
            expect(item.occurred_at <= page1OldestTs).toBe(true);
          }
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rail call (since param, no cursor) sets has_more conservatively', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;
          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'G3', session });

          const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
          const result = await getGroupActivity({
            group_id: group.id,
            since,
            limit: 8,
            session,
          });

          // Only 1 event (group.created) so items.length < limit — has_more must be false
          expect(result.has_more).toBe(false);
          expect(result.next_cursor).toBeUndefined();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

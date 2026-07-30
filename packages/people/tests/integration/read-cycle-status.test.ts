import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { afterEach, describe, expect, it } from 'vitest';
import { resetPeopleDb } from '../../src/backend/db/client.ts';
import { setMonthClock } from '../../src/backend/domain/month-clock.ts';
import { readCycleStatus } from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function vn(y: number, m: number, d: number, h = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h, 0, 0, 0) - 7 * 3_600_000);
}

afterEach(() => setMonthClock());

describe('readCycleStatus', () => {
  it('returns open for mid-window transaction-start', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        setMonthClock(() => vn(2026, 7, 26, 10));
        const result = await readCycleStatus(t.adminSession, { month: '2026-07' });
        expect(result.status).toBe('open');
        expect(result.month).toBe('2026-07');
        expect(result.evaluated_at).toBe(vn(2026, 7, 26, 10).toISOString());
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('throws FORBIDDEN without people.performance.read', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const session = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: [],
        });
        await expect(readCycleStatus(session, { month: '2026-07' })).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

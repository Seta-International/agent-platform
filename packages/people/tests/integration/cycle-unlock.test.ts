import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { afterEach, describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { performanceCycleUnlock } from '../../src/backend/db/schema.ts';
import { setMonthClock } from '../../src/backend/domain/month-clock.ts';
import { readCycleStatus, resolveOverrideActive } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

const MONTH = '2026-07';
function vn(y: number, m: number, d: number, h = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h, 0, 0, 0) - 7 * 3_600_000);
}

type UnlockRow = {
  scope_kind: 'month' | 'project' | 'person';
  scope_id: string | null;
  action: 'unlock' | 'relock';
  created_at: Date;
};

async function seedUnlocks(tenantId: string, rows: UnlockRow[]): Promise<void> {
  await peopleDb()
    .insert(performanceCycleUnlock)
    .values(
      rows.map((r) => ({
        tenant_id: tenantId,
        review_month: MONTH,
        scope_kind: r.scope_kind,
        scope_id: r.scope_id,
        action: r.action,
        reason: 'test',
        actor_user_id: crypto.randomUUID(),
        created_at: r.created_at,
      })),
    );
}

afterEach(() => setMonthClock());

describe('resolveOverrideActive', () => {
  it('false with no unlock rows', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        expect(await resolveOverrideActive(t.adminSession, { month: MONTH })).toBe(false);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('a month-wide unlock activates the override for any scope', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await seedUnlocks(t.tenant_id, [
          { scope_kind: 'month', scope_id: null, action: 'unlock', created_at: vn(2026, 8, 13) },
        ]);
        expect(await resolveOverrideActive(t.adminSession, { month: MONTH })).toBe(true);
        expect(
          await resolveOverrideActive(t.adminSession, {
            month: MONTH,
            person_id: crypto.randomUUID(),
            project_id: crypto.randomUUID(),
          }),
        ).toBe(true);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('a later re-lock cancels an earlier unlock (latest row per scope wins)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await seedUnlocks(t.tenant_id, [
          { scope_kind: 'month', scope_id: null, action: 'unlock', created_at: vn(2026, 8, 13, 9) },
          {
            scope_kind: 'month',
            scope_id: null,
            action: 'relock',
            created_at: vn(2026, 8, 13, 10),
          },
        ]);
        expect(await resolveOverrideActive(t.adminSession, { month: MONTH })).toBe(false);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('a person-scoped unlock only activates for that person', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const alice = crypto.randomUUID();
        const bob = crypto.randomUUID();
        await seedUnlocks(t.tenant_id, [
          { scope_kind: 'person', scope_id: alice, action: 'unlock', created_at: vn(2026, 8, 13) },
        ]);
        expect(
          await resolveOverrideActive(t.adminSession, { month: MONTH, person_id: alice }),
        ).toBe(true);
        expect(await resolveOverrideActive(t.adminSession, { month: MONTH, person_id: bob })).toBe(
          false,
        );
        expect(await resolveOverrideActive(t.adminSession, { month: MONTH })).toBe(false);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('a project-scoped unlock only activates for that project', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projA = crypto.randomUUID();
        const projB = crypto.randomUUID();
        await seedUnlocks(t.tenant_id, [
          { scope_kind: 'project', scope_id: projA, action: 'unlock', created_at: vn(2026, 8, 13) },
        ]);
        expect(
          await resolveOverrideActive(t.adminSession, { month: MONTH, project_id: projA }),
        ).toBe(true);
        expect(
          await resolveOverrideActive(t.adminSession, { month: MONTH, project_id: projB }),
        ).toBe(false);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

describe('readCycleStatus honors manual unlock (FUT-781)', () => {
  it('reports override in a locked window when the month is unlocked', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        // Aug 13 is a locked window for the July cycle.
        setMonthClock(() => vn(2026, 8, 13, 10));
        const before = await readCycleStatus(t.adminSession, { month: MONTH });
        expect(before.status).toBe('locked');

        await seedUnlocks(t.tenant_id, [
          { scope_kind: 'month', scope_id: null, action: 'unlock', created_at: vn(2026, 8, 13, 9) },
        ]);
        const after = await readCycleStatus(t.adminSession, { month: MONTH });
        expect(after.status).toBe('override');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

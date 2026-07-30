import { resetCoreDb } from '@seta/core/testing';
import { resetPmDb } from '@seta/pm/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { afterEach, describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import {
  accountProjection,
  person,
  projectProjection,
  userProjection,
  workerAllocationProjection,
} from '../../src/backend/db/schema.ts';
import { setMonthClock, vnYearMonth } from '../../src/backend/domain/month-clock.ts';
import { readMonthTasks } from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function vn(y: number, m: number, d: number, h = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h, 0, 0, 0) - 7 * 3_600_000);
}

afterEach(() => setMonthClock());

describe('readMonthTasks (FUT-695 / TC-19..21)', () => {
  it('TL open window: unscored X/Y from project members + self/morale cards', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const me = crypto.randomUUID();
        const m1 = crypto.randomUUID();
        const m2 = crypto.randomUUID();
        const m3 = crypto.randomUUID();
        const acc = crypto.randomUUID();
        const proj = crypto.randomUUID();
        const db = peopleDb();
        await db.insert(person).values([
          { id: me, tenant_id: t.tenant_id, full_name: 'TL' },
          { id: m1, tenant_id: t.tenant_id, full_name: 'M1' },
          { id: m2, tenant_id: t.tenant_id, full_name: 'M2' },
          { id: m3, tenant_id: t.tenant_id, full_name: 'M3' },
        ]);
        await db
          .insert(userProjection)
          .values({ user_id: crypto.randomUUID(), tenant_id: t.tenant_id, person_id: me });
        await db
          .insert(accountProjection)
          .values({ account_id: acc, tenant_id: t.tenant_id, name: 'Acme' });
        await db
          .insert(projectProjection)
          .values({ project_id: proj, tenant_id: t.tenant_id, account_id: acc, name: 'Atlas' });
        await db.insert(workerAllocationProjection).values([
          {
            allocation_id: crypto.randomUUID(),
            tenant_id: t.tenant_id,
            person_id: me,
            project_id: proj,
            account_id: acc,
            lead_person_id: me,
            active: true,
          },
          {
            allocation_id: crypto.randomUUID(),
            tenant_id: t.tenant_id,
            person_id: m1,
            project_id: proj,
            account_id: acc,
            lead_person_id: me,
            active: true,
          },
          {
            allocation_id: crypto.randomUUID(),
            tenant_id: t.tenant_id,
            person_id: m2,
            project_id: proj,
            account_id: acc,
            lead_person_id: me,
            active: true,
          },
          {
            allocation_id: crypto.randomUUID(),
            tenant_id: t.tenant_id,
            person_id: m3,
            project_id: proj,
            account_id: acc,
            lead_person_id: me,
            active: true,
          },
        ]);

        const month = vnYearMonth();
        const parts = month.split('-').map(Number) as [number, number];
        const [y, mo] = parts;
        setMonthClock(() => vn(y, mo, 26, 10));

        const session = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['people.viewer'],
          person_id: me,
        });
        const result = await readMonthTasks(session, { month });
        expect(result.cycle_status).toBe('open');
        expect(result.groups).toHaveLength(1);
        expect(result.groups[0]?.label).toBe('As TL · Atlas');
        expect(result.groups[0]?.cards).toEqual([
          { kind: 'unscored', unscored: 3, total: 3, interactive: true },
          { kind: 'self_assessment', submitted: false, interactive: true },
          { kind: 'morale', submitted: false, interactive: true },
        ]);
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('locked window: cycle_locked card only (AC2)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const me = crypto.randomUUID();
        const member = crypto.randomUUID();
        const acc = crypto.randomUUID();
        const proj = crypto.randomUUID();
        const db = peopleDb();
        await db.insert(person).values([
          { id: me, tenant_id: t.tenant_id, full_name: 'TL' },
          { id: member, tenant_id: t.tenant_id, full_name: 'M' },
        ]);
        await db
          .insert(userProjection)
          .values({ user_id: crypto.randomUUID(), tenant_id: t.tenant_id, person_id: me });
        await db
          .insert(accountProjection)
          .values({ account_id: acc, tenant_id: t.tenant_id, name: 'Acme' });
        await db
          .insert(projectProjection)
          .values({ project_id: proj, tenant_id: t.tenant_id, account_id: acc, name: 'Atlas' });
        await db.insert(workerAllocationProjection).values([
          {
            allocation_id: crypto.randomUUID(),
            tenant_id: t.tenant_id,
            person_id: me,
            project_id: proj,
            account_id: acc,
            lead_person_id: me,
            active: true,
          },
          {
            allocation_id: crypto.randomUUID(),
            tenant_id: t.tenant_id,
            person_id: member,
            project_id: proj,
            account_id: acc,
            lead_person_id: me,
            active: true,
          },
        ]);

        const month = vnYearMonth();
        const parts = month.split('-').map(Number) as [number, number];
        const [y, mo] = parts;
        setMonthClock(() => vn(y, mo, 15, 12));

        const session = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['people.viewer'],
          person_id: me,
        });
        const result = await readMonthTasks(session, { month });
        expect(result.cycle_status).toBe('locked');
        expect(result.groups[0]?.cards).toEqual([{ kind: 'cycle_locked' }]);
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('dual-role: two disjoint task groups (AC3)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const me = crypto.randomUUID();
        const peer = crypto.randomUUID();
        const acc = crypto.randomUUID();
        const projA = crypto.randomUUID();
        const projB = crypto.randomUUID();
        const db = peopleDb();
        await db.insert(person).values([
          { id: me, tenant_id: t.tenant_id, full_name: 'Dual' },
          { id: peer, tenant_id: t.tenant_id, full_name: 'Peer' },
        ]);
        await db
          .insert(userProjection)
          .values({ user_id: crypto.randomUUID(), tenant_id: t.tenant_id, person_id: me });
        await db
          .insert(accountProjection)
          .values({ account_id: acc, tenant_id: t.tenant_id, name: 'Acme' });
        await db.insert(projectProjection).values([
          { project_id: projA, tenant_id: t.tenant_id, account_id: acc, name: 'Alpha' },
          { project_id: projB, tenant_id: t.tenant_id, account_id: acc, name: 'Beta' },
        ]);
        await db.insert(workerAllocationProjection).values([
          {
            allocation_id: crypto.randomUUID(),
            tenant_id: t.tenant_id,
            person_id: me,
            project_id: projA,
            account_id: acc,
            lead_person_id: me,
            active: true,
          },
          {
            allocation_id: crypto.randomUUID(),
            tenant_id: t.tenant_id,
            person_id: peer,
            project_id: projA,
            account_id: acc,
            lead_person_id: me,
            active: true,
          },
          {
            allocation_id: crypto.randomUUID(),
            tenant_id: t.tenant_id,
            person_id: me,
            project_id: projB,
            account_id: acc,
            lead_person_id: null,
            active: true,
          },
        ]);

        const month = vnYearMonth();
        const parts = month.split('-').map(Number) as [number, number];
        const [y, mo] = parts;
        setMonthClock(() => vn(y, mo, 26, 10));

        const session = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['people.viewer'],
          person_id: me,
        });
        const result = await readMonthTasks(session, { month });
        expect(result.groups.map((g) => g.label)).toEqual(['As TL · Alpha', 'As Member · Beta']);
        expect(result.groups[0]?.cards.some((c) => c.kind === 'unscored')).toBe(true);
        expect(result.groups[1]?.cards.map((c) => c.kind)).toEqual(['self_assessment', 'morale']);
      } finally {
        resetPeopleDb();
        resetPmDb();
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
        await expect(readMonthTasks(session, { month: vnYearMonth() })).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('accepts a non-current month without going through context current-month gate', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const me = crypto.randomUUID();
        const db = peopleDb();
        await db.insert(person).values({ id: me, tenant_id: t.tenant_id, full_name: 'Past' });
        await db
          .insert(userProjection)
          .values({ user_id: crypto.randomUUID(), tenant_id: t.tenant_id, person_id: me });
        setMonthClock(() => vn(2026, 7, 26, 10));
        const session = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['people.viewer'],
          person_id: me,
        });
        // Prior month — readPerformanceContext would VALIDATION; month-tasks must not.
        const result = await readMonthTasks(session, { month: '2026-06' });
        expect(result.month).toBe('2026-06');
        expect(result.cycle_status).toBeDefined();
        expect(result.groups).toEqual([]);
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

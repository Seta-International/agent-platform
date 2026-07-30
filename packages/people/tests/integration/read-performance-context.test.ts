import { resetCoreDb } from '@seta/core/testing';
import { resetPmDb } from '@seta/pm/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import {
  accountProjection,
  person,
  projectProjection,
  userProjection,
  workerAllocationProjection,
} from '../../src/backend/db/schema.ts';
import { vnYearMonth } from '../../src/backend/domain/month-clock.ts';
import { readPerformanceContext } from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};
const CURRENT_MONTH = vnYearMonth();

describe('readPerformanceContext', () => {
  it('returns no_employee_record when the session has no person link', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const session = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['people.viewer'],
          person_id: null,
        });
        const result = await readPerformanceContext(session, { as_of_month: CURRENT_MONTH });
        expect(result).toEqual({ status: 'no_employee_record' });
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
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const session = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: [],
        });
        await expect(
          readPerformanceContext(session, { as_of_month: CURRENT_MONTH }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('throws VALIDATION for a non-current month (historical months are a later story)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const session = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['people.viewer'],
        });
        await expect(
          readPerformanceContext(session, { as_of_month: '2020-01' }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('double-role: TL on project A + member on project B, deterministic default (AC4)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const me = crypto.randomUUID();
        const userId = crypto.randomUUID();
        const acc = crypto.randomUUID();
        const projA = crypto.randomUUID();
        const projB = crypto.randomUUID();
        const db = peopleDb();
        await db.insert(person).values({ id: me, tenant_id: t.tenant_id, full_name: 'Đôi Vai' });
        await db
          .insert(userProjection)
          .values({ user_id: userId, tenant_id: t.tenant_id, person_id: me });
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
            person_id: me,
            project_id: projB,
            account_id: acc,
            lead_person_id: null,
            active: true,
          },
        ]);
        const session = buildSession({
          tenant_id: t.tenant_id,
          user_id: userId,
          roles: ['people.viewer'],
          person_id: me,
        });
        const result = await readPerformanceContext(session, { as_of_month: CURRENT_MONTH });
        if (result.status !== 'ok') throw new Error(`expected ok, got ${result.status}`);
        expect(result.capacities).toEqual([
          { kind: 'tl', project_id: projA, account_id: acc, label: 'Alpha' },
          { kind: 'member', project_id: projB, account_id: acc, label: 'Beta' },
        ]);
        expect(result.default_capacity_index).toBe(0);
        expect(result.role_slugs).toEqual(['people.viewer']);
        expect(result.person).toMatchObject({ person_id: me, full_name: 'Đôi Vai' });
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('windows allocations to the requested month (expired ones excluded)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const me = crypto.randomUUID();
        const acc = crypto.randomUUID();
        const proj = crypto.randomUUID();
        const db = peopleDb();
        await db
          .insert(person)
          .values({ id: me, tenant_id: t.tenant_id, full_name: 'Past Person' });
        await db
          .insert(userProjection)
          .values({ user_id: crypto.randomUUID(), tenant_id: t.tenant_id, person_id: me });
        await db
          .insert(accountProjection)
          .values({ account_id: acc, tenant_id: t.tenant_id, name: 'Acme' });
        await db
          .insert(projectProjection)
          .values({ project_id: proj, tenant_id: t.tenant_id, account_id: acc, name: 'Old' });
        await db.insert(workerAllocationProjection).values({
          allocation_id: crypto.randomUUID(),
          tenant_id: t.tenant_id,
          person_id: me,
          project_id: proj,
          account_id: acc,
          lead_person_id: null,
          date_from: '2020-01-01',
          date_to: '2020-06-30',
          active: true,
        });
        const session = buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['people.viewer'],
          person_id: me,
        });
        const result = await readPerformanceContext(session, { as_of_month: CURRENT_MONTH });
        if (result.status !== 'ok') throw new Error('expected ok');
        expect(result.capacities).toEqual([]);
        expect(result.default_capacity_index).toBe(-1);
      } finally {
        resetPeopleDb();
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

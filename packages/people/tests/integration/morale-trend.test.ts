import { resetCoreDb } from '@seta/core/testing';
import { createUser } from '@seta/identity';
import { resetPmDb } from '@seta/pm/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { afterEach, describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import {
  employmentPeriod,
  moraleRatingAggregate,
  person,
  userProjection,
  workerAllocationProjection,
} from '../../src/backend/db/schema.ts';
import { getMoraleTrend, setMonthClock } from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

/** Fixed "today" so the current-month clamp is assertable rather than clock-dependent. */
const NOW = new Date('2026-08-15T03:00:00Z');

afterEach(() => setMonthClock());

async function withPeople<T>(fn: (pool: Parameters<typeof seedTenant>[0]) => Promise<T>) {
  return withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetPeopleDb();
    resetPmDb();
    initPools({ databaseUrl });
    setMonthClock(() => NOW);
    try {
      return await fn(pool);
    } finally {
      resetPeopleDb();
      resetCoreDb();
      resetPmDb();
      await closePools();
    }
  });
}

async function seedPerson(tenantId: string, fullName: string): Promise<string> {
  const db = peopleDb();
  const personId = crypto.randomUUID();
  const { user_id } = await createUser(
    {
      tenant_id: tenantId,
      email: `${crypto.randomUUID().slice(0, 8)}@example.test`,
      name: fullName,
      password: 'correct-horse-battery-staple',
      initial_role: { role_slug: 'people.viewer', scope_type: 'tenant', scope_id: null },
    },
    { type: 'cli', user_id: null },
  );
  await db.insert(person).values({ id: personId, tenant_id: tenantId, full_name: fullName });
  await db
    .insert(employmentPeriod)
    .values({ tenant_id: tenantId, person_id: personId, seq: 1, start_date: '2024-01-01' });
  await db.insert(userProjection).values({ user_id, tenant_id: tenantId, person_id: personId });
  return personId;
}

/** Anonymous ratings straight into the aggregate — no note, no author, as the store intends. */
async function seedRatings(input: {
  tenantId: string;
  period: string;
  ratings: number[];
  projectId?: string | null;
  accountId?: string | null;
}): Promise<void> {
  await peopleDb()
    .insert(moraleRatingAggregate)
    .values(
      input.ratings.map((rating) => ({
        tenant_id: input.tenantId,
        org_unit_id: null,
        period: input.period,
        rating,
        project_id: input.projectId ?? null,
        account_id: input.accountId ?? null,
      })),
    );
}

function pointFor(res: Awaited<ReturnType<typeof getMoraleTrend>>, period: string) {
  return res.points.find((p) => p.period === period);
}

describe('getMoraleTrend (FUT-786)', () => {
  it('averages a month with enough responses and withholds one without', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);
      const hrSession = buildSession({
        tenant_id: t.tenant_id,
        user_id: t.admin_user_id,
        roles: ['people.manager'],
        person_id: await seedPerson(t.tenant_id, 'Mai Tran'),
      });

      await seedRatings({ tenantId: t.tenant_id, period: '2026-07', ratings: [3, 4, 4, 5] });
      await seedRatings({ tenantId: t.tenant_id, period: '2026-08', ratings: [2, 3, 3] });

      const res = await getMoraleTrend(hrSession, { from_month: '2026-06', to_month: '2026-08' });

      expect(pointFor(res, '2026-07')).toEqual({ period: '2026-07', responses: 4, average: 4 });
      // Under the threshold: the count still travels so the chart can say why, but the
      // score itself never leaves the server for a group that small.
      expect(pointFor(res, '2026-08')).toEqual({ period: '2026-08', responses: 3, average: null });
      // A month nobody answered is still a month, so the axis stays a continuous calendar.
      expect(pointFor(res, '2026-06')).toEqual({ period: '2026-06', responses: 0, average: null });
      // Hidden months count towards participation.
      expect(res.total_responses).toBe(7);
      expect(res.min_responses).toBe(4);
    });
  });

  it('scopes a Team Lead to the projects they lead', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);
      const leadPersonId = await seedPerson(t.tenant_id, 'Bui Quang Huy');
      const mine = crypto.randomUUID();
      const theirs = crypto.randomUUID();

      await peopleDb().insert(workerAllocationProjection).values({
        allocation_id: crypto.randomUUID(),
        tenant_id: t.tenant_id,
        person_id: crypto.randomUUID(),
        project_id: mine,
        account_id: crypto.randomUUID(),
        lead_person_id: leadPersonId,
        active: true,
      });

      await seedRatings({
        tenantId: t.tenant_id,
        period: '2026-08',
        ratings: [4, 4, 4, 4],
        projectId: mine,
      });
      await seedRatings({
        tenantId: t.tenant_id,
        period: '2026-08',
        ratings: [1, 1, 1, 1, 1],
        projectId: theirs,
      });

      const leadSession = buildSession({
        tenant_id: t.tenant_id,
        user_id: crypto.randomUUID(),
        roles: ['people.viewer'],
        person_id: leadPersonId,
      });

      const res = await getMoraleTrend(leadSession, { from_month: '2026-08', to_month: '2026-08' });

      // The other project's five 1s are invisible here — they are not this lead's team.
      expect(pointFor(res, '2026-08')).toEqual({ period: '2026-08', responses: 4, average: 4 });
    });
  });

  it('clamps a future end month to the current one instead of erroring', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);
      const hrSession = buildSession({
        tenant_id: t.tenant_id,
        user_id: t.admin_user_id,
        roles: ['people.manager'],
        person_id: await seedPerson(t.tenant_id, 'Mai Tran'),
      });

      const res = await getMoraleTrend(hrSession, { from_month: '2026-07', to_month: '2026-12' });

      expect(res.to_month).toBe('2026-08');
      expect(res.points.map((p) => p.period)).toEqual(['2026-07', '2026-08']);
    });
  });

  it('rejects an inverted month range', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);
      const hrSession = buildSession({
        tenant_id: t.tenant_id,
        user_id: t.admin_user_id,
        roles: ['people.manager'],
        person_id: await seedPerson(t.tenant_id, 'Mai Tran'),
      });

      await expect(
        getMoraleTrend(hrSession, { from_month: '2026-08', to_month: '2026-05' }),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });
  });

  it('refuses a caller who can never be a recipient', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);
      const session = buildSession({
        tenant_id: t.tenant_id,
        user_id: crypto.randomUUID(),
        roles: ['people.viewer'],
        person_id: await seedPerson(t.tenant_id, 'Member One'),
      });

      await expect(getMoraleTrend(session, {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});

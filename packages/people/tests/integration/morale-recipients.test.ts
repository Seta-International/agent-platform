import { resetCoreDb } from '@seta/core/testing';
import { resetPmDb } from '@seta/pm/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import {
  accountProjection,
  employmentPeriod,
  person,
  projectProjection,
  userProjection,
  workerAllocationProjection,
} from '../../src/backend/db/schema.ts';
import { resolveMoraleRecipients } from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

interface Actor {
  person_id: string;
  user_id: string;
}

/**
 * A person who passes every eligibility gate: record alive, employment open, login
 * active. `endDate` closes the employment period to simulate someone who has left.
 */
async function seedPerson(
  tenantId: string,
  fullName: string,
  opts: { endDate?: string; deactivated?: boolean } = {},
): Promise<Actor> {
  const personId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const db = peopleDb();
  await db.insert(person).values({ id: personId, tenant_id: tenantId, full_name: fullName });
  await db.insert(employmentPeriod).values({
    tenant_id: tenantId,
    person_id: personId,
    seq: 1,
    start_date: '2024-01-01',
    end_date: opts.endDate ?? null,
  });
  await db.insert(userProjection).values({
    user_id: userId,
    tenant_id: tenantId,
    person_id: personId,
    deactivated_at: opts.deactivated ? new Date() : null,
  });
  return { person_id: personId, user_id: userId };
}

async function seedAllocation(input: {
  tenantId: string;
  personId: string | null;
  projectId: string;
  accountId: string;
  leadPersonId: string | null;
}): Promise<void> {
  await peopleDb().insert(workerAllocationProjection).values({
    allocation_id: crypto.randomUUID(),
    tenant_id: input.tenantId,
    person_id: input.personId,
    project_id: input.projectId,
    account_id: input.accountId,
    lead_person_id: input.leadPersonId,
    active: true,
  });
}

function sessionFor(tenantId: string, actor: Actor) {
  return buildSession({
    tenant_id: tenantId,
    user_id: actor.user_id,
    roles: ['people.viewer'],
    person_id: actor.person_id,
  });
}

function groupFor(
  res: Awaited<ReturnType<typeof resolveMoraleRecipients>>,
  tag: 'tl' | 'am' | 'pmo' | 'bod',
) {
  return res.groups.find((g) => g.tag === tag);
}

async function withPeople<T>(fn: (pool: Parameters<typeof seedTenant>[0]) => Promise<T>) {
  return withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetPeopleDb();
    resetPmDb();
    initPools({ databaseUrl });
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

describe('resolveMoraleRecipients (FUT-782)', () => {
  it('offers a Member the lead of their own project, tagged with the project name', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);
      const lead = await seedPerson(t.tenant_id, 'Lead One');
      const me = await seedPerson(t.tenant_id, 'Member One');
      const accountId = crypto.randomUUID();
      const projectId = crypto.randomUUID();
      await peopleDb()
        .insert(accountProjection)
        .values({ account_id: accountId, tenant_id: t.tenant_id, name: 'Acme' });
      await peopleDb().insert(projectProjection).values({
        project_id: projectId,
        tenant_id: t.tenant_id,
        account_id: accountId,
        name: 'Atlas',
      });
      await seedAllocation({
        tenantId: t.tenant_id,
        personId: me.person_id,
        projectId,
        accountId,
        leadPersonId: lead.person_id,
      });

      const res = await resolveMoraleRecipients(sessionFor(t.tenant_id, me), me.person_id);

      expect(res.can_submit).toBe(true);
      expect(groupFor(res, 'tl')?.candidates).toEqual([
        { person_id: lead.person_id, full_name: 'Lead One', context: 'Atlas' },
      ]);
    });
  });

  it('never offers a Team Lead the TL group at all', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);
      const me = await seedPerson(t.tenant_id, 'Lead Only');
      const member = await seedPerson(t.tenant_id, 'Their Report');
      const accountId = crypto.randomUUID();
      const projectId = crypto.randomUUID();
      // The sender only ever appears as the lead, never as the allocated worker.
      await seedAllocation({
        tenantId: t.tenant_id,
        personId: member.person_id,
        projectId,
        accountId,
        leadPersonId: me.person_id,
      });

      const res = await resolveMoraleRecipients(sessionFor(t.tenant_id, me), me.person_id);

      expect(res.can_submit).toBe(true);
      // Absent, not merely empty: a TL escalates past their own level.
      expect(groupFor(res, 'tl')).toBeUndefined();
      expect(res.groups.map((g) => g.tag)).toEqual(['am', 'pmo', 'bod']);
    });
  });

  it('explains an empty TL group rather than dropping it for a Member', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);
      const me = await seedPerson(t.tenant_id, 'Unled Member');
      await seedAllocation({
        tenantId: t.tenant_id,
        personId: me.person_id,
        projectId: crypto.randomUUID(),
        accountId: crypto.randomUUID(),
        leadPersonId: null,
      });

      const res = await resolveMoraleRecipients(sessionFor(t.tenant_id, me), me.person_id);
      const tl = groupFor(res, 'tl');

      expect(tl?.candidates).toEqual([]);
      expect(tl?.unavailable_reason).toMatch(/no team lead/i);
    });
  });

  it('excludes the sender, people who have left, and deactivated logins', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);
      const gone = await seedPerson(t.tenant_id, 'Departed Lead', { endDate: '2025-01-01' });
      const disabled = await seedPerson(t.tenant_id, 'Disabled Lead', { deactivated: true });
      const me = await seedPerson(t.tenant_id, 'Self Leading Member');
      const accountId = crypto.randomUUID();

      // Three projects: one led by someone who left, one by a disabled login, one by the
      // sender themselves — none of them should be offered back.
      for (const leadPersonId of [gone.person_id, disabled.person_id, me.person_id]) {
        await seedAllocation({
          tenantId: t.tenant_id,
          personId: me.person_id,
          projectId: crypto.randomUUID(),
          accountId,
          leadPersonId,
        });
      }

      const res = await resolveMoraleRecipients(sessionFor(t.tenant_id, me), me.person_id);

      expect(groupFor(res, 'tl')?.candidates).toEqual([]);
    });
  });

  it('reports can_submit false for someone with no allocation at all', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);
      const me = await seedPerson(t.tenant_id, 'Unallocated');

      const res = await resolveMoraleRecipients(sessionFor(t.tenant_id, me), me.person_id);

      expect(res).toEqual({ can_submit: false, groups: [] });
    });
  });

  it('reports can_submit false when the signed-in user has no employee record', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);

      // A login with no `person_id` can never hold a Member or Team Lead capacity, so it
      // belongs on the same "nothing to submit" answer as an unallocated employee.
      // Failing the request instead would put an error banner in front of the one screen
      // that exists to explain why the form is not there.
      const res = await resolveMoraleRecipients(
        buildSession({
          tenant_id: t.tenant_id,
          user_id: crypto.randomUUID(),
          roles: ['people.viewer'],
          person_id: null,
        }),
        null,
      );

      expect(res).toEqual({ can_submit: false, groups: [] });
    });
  });
});

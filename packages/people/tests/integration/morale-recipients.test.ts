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
      const projectIds: string[] = [];
      for (const leadPersonId of [gone.person_id, disabled.person_id, me.person_id]) {
        const projectId = crypto.randomUUID();
        projectIds.push(projectId);
        await seedAllocation({
          tenantId: t.tenant_id,
          personId: me.person_id,
          projectId,
          accountId,
          leadPersonId,
        });
      }

      // Checked one project at a time, because that is now the only way a TL is offered
      // at all — and it keeps each of the three exclusions its own assertion rather than
      // letting one empty merged list stand in for all of them.
      for (const projectId of projectIds) {
        const res = await resolveMoraleRecipients(
          sessionFor(t.tenant_id, me),
          me.person_id,
          projectId,
        );
        expect(groupFor(res, 'tl')?.candidates).toEqual([]);
      }
    });
  });

  it('lets someone with no allocation submit, with no project and no TL or AM', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);
      // The shape an HR or BoD manager has: a real employee, on no project.
      const me = await seedPerson(t.tenant_id, 'Unallocated');

      const res = await resolveMoraleRecipients(sessionFor(t.tenant_id, me), me.person_id);

      expect(res.can_submit).toBe(true);
      expect(res.projects).toEqual([]);
      // Null, not a placeholder: the note genuinely belongs to no project.
      expect(res.selected_project_id).toBeNull();
      // TL and AM hang off a project, so they are absent rather than empty — there is no
      // "nobody qualifies" to explain, the roles simply do not apply.
      expect(res.groups.map((g) => g.tag)).toEqual(['pmo', 'bod']);
    });
  });

  it('auto-selects the only project, leaving nothing to choose', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);
      const lead = await seedPerson(t.tenant_id, 'Lead One');
      const me = await seedPerson(t.tenant_id, 'Member One');
      const projectId = crypto.randomUUID();
      await peopleDb().insert(accountProjection).values({
        account_id: '11111111-1111-4111-8111-111111111111',
        tenant_id: t.tenant_id,
        name: 'Acme',
      });
      await peopleDb().insert(projectProjection).values({
        project_id: projectId,
        tenant_id: t.tenant_id,
        account_id: '11111111-1111-4111-8111-111111111111',
        name: 'Solo',
      });
      await seedAllocation({
        tenantId: t.tenant_id,
        personId: me.person_id,
        projectId,
        accountId: '11111111-1111-4111-8111-111111111111',
        leadPersonId: lead.person_id,
      });

      const res = await resolveMoraleRecipients(sessionFor(t.tenant_id, me), me.person_id);

      expect(res.projects).toEqual([{ project_id: projectId, name: 'Solo' }]);
      // Resolved without the caller asking for it: one project is not a decision.
      expect(res.selected_project_id).toBe(projectId);
      expect(groupFor(res, 'tl')?.candidates).toHaveLength(1);
    });
  });

  describe('a sender on several projects', () => {
    /** Two projects under one account, each with its own lead, plus the sender on both. */
    async function seedTwoProjects(tenantId: string, me: Actor) {
      const accountId = crypto.randomUUID();
      await peopleDb()
        .insert(accountProjection)
        .values({ account_id: accountId, tenant_id: tenantId, name: 'Acme' });

      const leads: Record<string, Actor> = {};
      const ids: Record<string, string> = {};
      for (const name of ['Alpha', 'Beta']) {
        const projectId = crypto.randomUUID();
        ids[name] = projectId;
        leads[name] = await seedPerson(tenantId, `Lead ${name}`);
        await peopleDb()
          .insert(projectProjection)
          .values({ project_id: projectId, tenant_id: tenantId, account_id: accountId, name });
        await seedAllocation({
          tenantId,
          personId: me.person_id,
          projectId,
          accountId,
          leadPersonId: leads[name]?.person_id ?? null,
        });
      }
      return { ids, leads };
    }

    it('withholds TL and AM until a project is chosen', async () => {
      await withPeople(async (pool) => {
        const t = await seedTenant(pool);
        const me = await seedPerson(t.tenant_id, 'Member One');
        const { ids } = await seedTwoProjects(t.tenant_id, me);

        const res = await resolveMoraleRecipients(sessionFor(t.tenant_id, me), me.person_id);

        // Both offered, name-sorted, so the picker is stable across reloads.
        expect(res.projects.map((p) => p.name)).toEqual(['Alpha', 'Beta']);
        expect(res.selected_project_id).toBeNull();
        // Undetermined rather than empty: picking Alpha and picking Beta give different
        // answers, so neither may be shown as *the* answer before the sender says which.
        expect(res.groups.map((g) => g.tag)).toEqual(['pmo', 'bod']);
        expect(Object.values(ids)).toHaveLength(2);
      });
    });

    it('scopes the TL to the chosen project and leaves PMO and BoD alone', async () => {
      await withPeople(async (pool) => {
        const t = await seedTenant(pool);
        const me = await seedPerson(t.tenant_id, 'Member One');
        const { ids, leads } = await seedTwoProjects(t.tenant_id, me);

        const alpha = await resolveMoraleRecipients(
          sessionFor(t.tenant_id, me),
          me.person_id,
          ids.Alpha,
        );
        const beta = await resolveMoraleRecipients(
          sessionFor(t.tenant_id, me),
          me.person_id,
          ids.Beta,
        );

        expect(alpha.selected_project_id).toBe(ids.Alpha);
        expect(groupFor(alpha, 'tl')?.candidates).toEqual([
          { person_id: leads.Alpha?.person_id, full_name: 'Lead Alpha', context: 'Alpha' },
        ]);
        // The other project's lead is not merely lower in the list — they are absent.
        expect(groupFor(beta, 'tl')?.candidates).toEqual([
          { person_id: leads.Beta?.person_id, full_name: 'Lead Beta', context: 'Beta' },
        ]);

        // PMO and BoD are granted at tenant scope, so switching project must not appear
        // to swap them out. Both empty here, but identically so.
        expect(groupFor(alpha, 'pmo')).toEqual(groupFor(beta, 'pmo'));
        expect(groupFor(alpha, 'bod')).toEqual(groupFor(beta, 'bod'));
      });
    });

    it('ignores a project the sender is not on', async () => {
      await withPeople(async (pool) => {
        const t = await seedTenant(pool);
        const me = await seedPerson(t.tenant_id, 'Member One');
        await seedTwoProjects(t.tenant_id, me);

        // A stale bookmark, or a client trying its luck. Neither may widen the audience,
        // so this lands back on "nothing chosen" rather than on someone else's lead.
        const res = await resolveMoraleRecipients(
          sessionFor(t.tenant_id, me),
          me.person_id,
          crypto.randomUUID(),
        );

        expect(res.selected_project_id).toBeNull();
        expect(res.groups.map((g) => g.tag)).toEqual(['pmo', 'bod']);
      });
    });
  });

  it('reports can_submit false when the signed-in user has no employee record', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);

      // The one remaining bar. A note is filed against an employee record, and this login
      // has none — so unlike an unallocated employee there is nothing to resolve at all.
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

      expect(res).toEqual({
        can_submit: false,
        projects: [],
        selected_project_id: null,
        groups: [],
      });
    });
  });
});

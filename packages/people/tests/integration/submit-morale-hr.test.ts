import { resetCoreDb } from '@seta/core/testing';
import { createUser, grantRole } from '@seta/identity';
import { resetPmDb } from '@seta/pm/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import {
  employmentPeriod,
  moraleNoteRecipient,
  person,
  userProjection,
  workerAllocationProjection,
} from '../../src/backend/db/schema.ts';
import { listMoraleNotes, submitMoraleNote } from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

interface Actor {
  person_id: string;
  user_id: string;
}

/** A person with a live employment record and an active login, linked to `userId`. */
async function seedPerson(tenantId: string, fullName: string, userId: string): Promise<Actor> {
  const personId = crypto.randomUUID();
  const db = peopleDb();
  await db.insert(person).values({ id: personId, tenant_id: tenantId, full_name: fullName });
  await db.insert(employmentPeriod).values({
    tenant_id: tenantId,
    person_id: personId,
    seq: 1,
    start_date: '2024-01-01',
  });
  await db
    .insert(userProjection)
    .values({ user_id: userId, tenant_id: tenantId, person_id: personId });
  return { person_id: personId, user_id: userId };
}

/** A person who really holds `roleSlugs` — granted through identity, not faked. */
async function seedRoleHolder(
  tenantId: string,
  fullName: string,
  roleSlugs: string[],
): Promise<Actor> {
  const [first, ...rest] = roleSlugs as [string, ...string[]];
  const { user_id } = await createUser(
    {
      tenant_id: tenantId,
      email: `${crypto.randomUUID().slice(0, 8)}@example.test`,
      name: fullName,
      password: 'correct-horse-battery-staple',
      initial_role: { role_slug: first, scope_type: 'tenant', scope_id: null },
    },
    { type: 'cli', user_id: null },
  );
  for (const role_slug of rest) {
    await grantRole(
      { tenant_id: tenantId, user_id, role_slug, scope_kind: 'tenant', scope_id: null },
      { type: 'cli', user_id: null },
    );
  }
  return seedPerson(tenantId, fullName, user_id);
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

describe('submitMoraleNote HR guarantee (FUT-782)', () => {
  it('still records the HR row when the sender also picked that person as PMO', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);

      // One person wearing both hats — the shape that used to lose the HR row, and the
      // shape this tenant's real data has (every people.manager is also a pm.pmo).
      const hrAndPmo = await seedRoleHolder(t.tenant_id, 'Double Hat', [
        'people.manager',
        'pm.pmo',
      ]);
      const lead = await seedPerson(t.tenant_id, 'Lead One', crypto.randomUUID());
      const me = await seedPerson(t.tenant_id, 'Member One', crypto.randomUUID());

      await peopleDb().insert(workerAllocationProjection).values({
        allocation_id: crypto.randomUUID(),
        tenant_id: t.tenant_id,
        person_id: me.person_id,
        project_id: crypto.randomUUID(),
        account_id: crypto.randomUUID(),
        lead_person_id: lead.person_id,
        active: true,
      });

      const session = buildSession({
        tenant_id: t.tenant_id,
        user_id: me.user_id,
        roles: ['people.viewer'],
        person_id: me.person_id,
      });

      const { note_id } = await submitMoraleNote(session, {
        rating: 3,
        recipient_person_ids: [hrAndPmo.person_id],
      });

      const rows = await peopleDb()
        .select()
        .from(moraleNoteRecipient)
        .where(eq(moraleNoteRecipient.note_id, note_id));

      // Two rows for one person: picked as PMO *and* on the HR roster. Deduping by person
      // used to drop the second, leaving a note with no 'hr' row at all.
      expect(rows.filter((r) => r.recipient_person_id === hrAndPmo.person_id).length).toBe(2);
      expect(rows.map((r) => r.recipient_tag).sort()).toEqual(['hr', 'pmo']);

      const history = await listMoraleNotes(session, {});
      expect(history.notes[0]?.recipients.map((r) => r.recipient_tag).sort()).toEqual([
        'hr',
        'pmo',
      ]);
    });
  });

  it('notifies a double-tagged recipient once', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);
      const hrAndPmo = await seedRoleHolder(t.tenant_id, 'Double Hat', [
        'people.manager',
        'pm.pmo',
      ]);
      const lead = await seedPerson(t.tenant_id, 'Lead One', crypto.randomUUID());
      const me = await seedPerson(t.tenant_id, 'Member One', crypto.randomUUID());

      await peopleDb().insert(workerAllocationProjection).values({
        allocation_id: crypto.randomUUID(),
        tenant_id: t.tenant_id,
        person_id: me.person_id,
        project_id: crypto.randomUUID(),
        account_id: crypto.randomUUID(),
        lead_person_id: lead.person_id,
        active: true,
      });

      await submitMoraleNote(
        buildSession({
          tenant_id: t.tenant_id,
          user_id: me.user_id,
          roles: ['people.viewer'],
          person_id: me.person_id,
        }),
        { rating: 3, recipient_person_ids: [hrAndPmo.person_id] },
      );

      const r = await pool.query(
        `SELECT payload FROM core.events WHERE tenant_id = $1 AND event_type = 'people.morale.submitted'`,
        [t.tenant_id],
      );
      const ids = r.rows[0].payload.recipient_person_ids as string[];
      // The recipient rows carry the duplicate on purpose; the routing list must not.
      expect(ids).toEqual([hrAndPmo.person_id]);
    });
  });
});

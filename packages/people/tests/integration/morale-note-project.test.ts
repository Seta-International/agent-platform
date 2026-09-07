import { resetCoreDb } from '@seta/core/testing';
import { createUser } from '@seta/identity';
import { resetPmDb } from '@seta/pm/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import {
  employmentPeriod,
  moraleNote,
  person,
  projectProjection,
  userProjection,
  workerAllocationProjection,
} from '../../src/backend/db/schema.ts';
import { submitMoraleNote } from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

interface Actor {
  person_id: string;
  user_id: string;
}

async function seedPerson(
  tenantId: string,
  fullName: string,
  userId: string = crypto.randomUUID(),
): Promise<Actor> {
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

/**
 * An HR holder, granted through identity rather than faked. Every note is appended to
 * the HR roster server-side, so seeding one keeps these cases about the project rather
 * than about the "no eligible recipients" guard — the sender picks nobody on purpose,
 * to prove the project is stored even on the barest note.
 */
async function seedHr(tenantId: string): Promise<Actor> {
  const { user_id } = await createUser(
    {
      tenant_id: tenantId,
      email: `${crypto.randomUUID().slice(0, 8)}@example.test`,
      name: 'HR One',
      password: 'correct-horse-battery-staple',
      initial_role: { role_slug: 'people.manager', scope_type: 'tenant', scope_id: null },
    },
    { type: 'cli', user_id: null },
  );
  return seedPerson(tenantId, 'HR One', user_id);
}

/** Puts `me` on a named project as a Member, and returns that project's id. */
async function seedProject(tenantId: string, me: Actor, name: string): Promise<string> {
  const projectId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  await peopleDb()
    .insert(projectProjection)
    .values({ project_id: projectId, tenant_id: tenantId, account_id: accountId, name });
  await peopleDb().insert(workerAllocationProjection).values({
    allocation_id: crypto.randomUUID(),
    tenant_id: tenantId,
    person_id: me.person_id,
    project_id: projectId,
    account_id: accountId,
    lead_person_id: null,
    active: true,
  });
  return projectId;
}

function sessionFor(tenantId: string, actor: Actor) {
  return buildSession({
    tenant_id: tenantId,
    user_id: actor.user_id,
    roles: ['people.viewer'],
    person_id: actor.person_id,
  });
}

async function storedProjectId(noteId: string): Promise<string | null> {
  const [row] = await peopleDb()
    .select({ project_id: moraleNote.project_id })
    .from(moraleNote)
    .where(eq(moraleNote.id, noteId));
  return row?.project_id ?? null;
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

describe('morale note project scope (FUT-782)', () => {
  it('fills in the only project the sender is on, without being told', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);
      await seedHr(t.tenant_id);
      const me = await seedPerson(t.tenant_id, 'Member One');
      const projectId = await seedProject(t.tenant_id, me, 'Solo');

      // No project_id in the input: with one project the client has no picker to fill in,
      // so the server has to supply the answer rather than store null.
      const { note_id } = await submitMoraleNote(sessionFor(t.tenant_id, me), {
        rating: 4,
        recipient_person_ids: [],
      });

      expect(await storedProjectId(note_id)).toBe(projectId);
    });
  });

  it('stores null for a sender who is on no project at all', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);
      await seedHr(t.tenant_id);
      // The HR / BoD manager shape: a real employee holding no allocation.
      const me = await seedPerson(t.tenant_id, 'Unallocated Manager');

      const { note_id } = await submitMoraleNote(sessionFor(t.tenant_id, me), {
        rating: 2,
        recipient_person_ids: [],
      });

      expect(await storedProjectId(note_id)).toBeNull();
    });
  });

  it('stores the chosen project when the sender is on several', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);
      await seedHr(t.tenant_id);
      const me = await seedPerson(t.tenant_id, 'Member One');
      await seedProject(t.tenant_id, me, 'Alpha');
      const beta = await seedProject(t.tenant_id, me, 'Beta');

      const { note_id } = await submitMoraleNote(sessionFor(t.tenant_id, me), {
        rating: 5,
        project_id: beta,
        recipient_person_ids: [],
      });

      expect(await storedProjectId(note_id)).toBe(beta);
    });
  });

  it('refuses to file a note against no project when the sender has several', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);
      await seedHr(t.tenant_id);
      const me = await seedPerson(t.tenant_id, 'Member One');
      await seedProject(t.tenant_id, me, 'Alpha');
      await seedProject(t.tenant_id, me, 'Beta');

      // Storing null here would quietly file the note against nothing *and* route it to
      // no TL or AM — a silent narrowing of who hears the concern.
      await expect(
        submitMoraleNote(sessionFor(t.tenant_id, me), { rating: 3, recipient_person_ids: [] }),
      ).rejects.toThrow(/select which project/i);
    });
  });

  it('refuses a project the sender is not on', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);
      await seedHr(t.tenant_id);
      const me = await seedPerson(t.tenant_id, 'Member One');
      await seedProject(t.tenant_id, me, 'Alpha');
      await seedProject(t.tenant_id, me, 'Beta');

      await expect(
        submitMoraleNote(sessionFor(t.tenant_id, me), {
          rating: 3,
          project_id: crypto.randomUUID(),
          recipient_person_ids: [],
        }),
      ).rejects.toThrow(/select which project/i);
    });
  });
});

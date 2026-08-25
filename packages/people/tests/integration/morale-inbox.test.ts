import { resetCoreDb } from '@seta/core/testing';
import { createUser, grantRole } from '@seta/identity';
import { resetPmDb } from '@seta/pm/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import {
  accountProjection,
  employmentPeriod,
  moraleNote,
  person,
  projectProjection,
  userProjection,
  workerAllocationProjection,
} from '../../src/backend/db/schema.ts';
import {
  getMoraleNote,
  listMoraleInbox,
  listMoraleInboxFilters,
  markMoraleNoteRead,
  resolvePrimaryProject,
  submitMoraleNote,
} from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

interface Actor {
  person_id: string;
  user_id: string;
}

async function seedPerson(tenantId: string, fullName: string, userId: string): Promise<Actor> {
  const db = peopleDb();
  const personId = crypto.randomUUID();
  await db.insert(person).values({ id: personId, tenant_id: tenantId, full_name: fullName });
  await db
    .insert(employmentPeriod)
    .values({ tenant_id: tenantId, person_id: personId, seq: 1, start_date: '2024-01-01' });
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

async function seedProject(tenantId: string, name: string, accountName: string) {
  const account_id = crypto.randomUUID();
  const project_id = crypto.randomUUID();
  await peopleDb()
    .insert(accountProjection)
    .values({ account_id, tenant_id: tenantId, name: accountName });
  await peopleDb()
    .insert(projectProjection)
    .values({ project_id, tenant_id: tenantId, account_id, name });
  return { account_id, project_id };
}

async function seedAllocation(input: {
  tenantId: string;
  personId: string | null;
  projectId: string;
  accountId: string;
  leadPersonId: string | null;
  plannedPct?: string;
}): Promise<void> {
  await peopleDb()
    .insert(workerAllocationProjection)
    .values({
      allocation_id: crypto.randomUUID(),
      tenant_id: input.tenantId,
      person_id: input.personId,
      project_id: input.projectId,
      account_id: input.accountId,
      lead_person_id: input.leadPersonId,
      planned_pct: input.plannedPct ?? '100',
      active: true,
    });
}

function sessionFor(tenantId: string, actor: Actor, roles: string[] = ['people.viewer']) {
  return buildSession({
    tenant_id: tenantId,
    user_id: actor.user_id,
    roles,
    person_id: actor.person_id,
  });
}

/** Backdates a note so date-window assertions do not depend on the wall clock. */
async function backdate(noteId: string, iso: string): Promise<void> {
  await peopleDb()
    .update(moraleNote)
    .set({ submitted_at: new Date(iso) })
    .where(eq(moraleNote.id, noteId));
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

/**
 * Two projects, one HR holder, one lead on Atlas, and one member on each project.
 * Atlas's member sends two notes (one to their lead), Nova's member sends one.
 */
async function seedInbox(pool: Parameters<typeof seedTenant>[0]) {
  const t = await seedTenant(pool);
  const hr = await seedRoleHolder(t.tenant_id, 'Mai Tran', ['people.manager']);
  const atlas = await seedProject(t.tenant_id, 'Project Atlas', 'Account Meridian');
  const nova = await seedProject(t.tenant_id, 'Team Nova', 'Account Nova');

  const atlasLead = await seedPerson(t.tenant_id, 'Bui Quang Huy', crypto.randomUUID());
  const novaLead = await seedPerson(t.tenant_id, 'Le Hong Son', crypto.randomUUID());
  const atlasMember = await seedPerson(t.tenant_id, 'Nguyen Ngoc Nhung', crypto.randomUUID());
  const novaMember = await seedPerson(t.tenant_id, 'Do Quang Vinh', crypto.randomUUID());

  await seedAllocation({
    tenantId: t.tenant_id,
    personId: atlasMember.person_id,
    projectId: atlas.project_id,
    accountId: atlas.account_id,
    leadPersonId: atlasLead.person_id,
  });
  await seedAllocation({
    tenantId: t.tenant_id,
    personId: novaMember.person_id,
    projectId: nova.project_id,
    accountId: nova.account_id,
    leadPersonId: novaLead.person_id,
  });

  // Notes go through the real submit path so the project snapshot is exercised too.
  const atlasSession = sessionFor(t.tenant_id, atlasMember);
  const novaSession = sessionFor(t.tenant_id, novaMember);

  const toLead = await submitMoraleNote(atlasSession, {
    rating: 2,
    concern_text: 'Scope changed three times this sprint.',
    recipient_person_ids: [atlasLead.person_id],
  });
  const hrOnly = await submitMoraleNote(atlasSession, {
    rating: 4,
    recipient_person_ids: [],
  });
  const fromNova = await submitMoraleNote(novaSession, {
    rating: 3,
    concern_text: 'Standups run 40 minutes most days.',
    recipient_person_ids: [],
  });

  await backdate(toLead.note_id, '2026-08-18T10:00:00Z');
  await backdate(hrOnly.note_id, '2026-08-10T10:00:00Z');
  await backdate(fromNova.note_id, '2026-08-14T10:00:00Z');

  return {
    t,
    hr,
    atlas,
    nova,
    atlasLead,
    atlasMember,
    novaMember,
    notes: { toLead: toLead.note_id, hrOnly: hrOnly.note_id, fromNova: fromNova.note_id },
    hrSession: sessionFor(t.tenant_id, hr, ['people.manager']),
    leadSession: sessionFor(t.tenant_id, atlasLead),
  };
}

describe('listMoraleInbox (FUT-786)', () => {
  it('gives HR every note, grouped by the project its sender wrote from', async () => {
    await withPeople(async (pool) => {
      const s = await seedInbox(pool);

      const inbox = await listMoraleInbox(s.hrSession, {});

      expect(inbox.total_notes).toBe(3);
      expect(inbox.unread_notes).toBe(3);
      // Newest note first, so Atlas (18 Aug) sorts above Nova (14 Aug).
      expect(inbox.projects.map((p) => [p.project_name, p.total_notes])).toEqual([
        ['Project Atlas', 2],
        ['Team Nova', 1],
      ]);
      expect(inbox.projects[0]?.project_id).toBe(s.atlas.project_id);
      expect(inbox.projects[0]?.notes.map((n) => n.sender_name)).toEqual([
        'Nguyen Ngoc Nhung',
        'Nguyen Ngoc Nhung',
      ]);
    });
  });

  it('gives a Team Lead only the notes they were chosen for', async () => {
    await withPeople(async (pool) => {
      const s = await seedInbox(pool);

      const inbox = await listMoraleInbox(s.leadSession, {});

      expect(inbox.total_notes).toBe(1);
      expect(inbox.projects).toHaveLength(1);
      expect(inbox.projects[0]?.notes[0]?.id).toBe(s.notes.toLead);
    });
  });

  it('never carries an individual rating, and keeps rating-only notes visible', async () => {
    await withPeople(async (pool) => {
      const s = await seedInbox(pool);

      const inbox = await listMoraleInbox(s.hrSession, {});
      const notes = inbox.projects.flatMap((p) => p.notes);

      for (const note of notes) {
        expect(note).not.toHaveProperty('rating');
      }
      // A rating submitted with no text is still a response: it appears, with null text,
      // rather than being dropped from the count.
      const ratingOnly = notes.find((n) => n.id === s.notes.hrOnly);
      expect(ratingOnly?.concern_text).toBeNull();
      expect(ratingOnly?.recipient_tags).toEqual(['hr']);
    });
  });

  it('reports recipients as roles, deduped, never as names', async () => {
    await withPeople(async (pool) => {
      const s = await seedInbox(pool);

      const inbox = await listMoraleInbox(s.hrSession, {});
      const toLead = inbox.projects.flatMap((p) => p.notes).find((n) => n.id === s.notes.toLead);

      expect(toLead?.recipient_tags).toEqual(['hr', 'tl']);
      expect(JSON.stringify(toLead)).not.toContain('Mai Tran');
    });
  });

  it('records the sender capacity the note was written from', async () => {
    await withPeople(async (pool) => {
      const s = await seedInbox(pool);

      const inbox = await listMoraleInbox(s.hrSession, {});
      const notes = inbox.projects.flatMap((p) => p.notes);

      expect(notes.every((n) => n.sender_capacity === 'member')).toBe(true);
    });
  });

  it('filters by date window, project, sender and unread', async () => {
    await withPeople(async (pool) => {
      const s = await seedInbox(pool);

      const window = await listMoraleInbox(s.hrSession, { from: '2026-08-14', to: '2026-08-14' });
      expect(window.projects.flatMap((p) => p.notes).map((n) => n.id)).toEqual([s.notes.fromNova]);

      const byProject = await listMoraleInbox(s.hrSession, { project_id: s.nova.project_id });
      expect(byProject.total_notes).toBe(1);

      const bySender = await listMoraleInbox(s.hrSession, {
        sender_person_id: s.atlasMember.person_id,
      });
      expect(bySender.total_notes).toBe(2);

      await markMoraleNoteRead(s.hrSession, s.notes.toLead);
      const unread = await listMoraleInbox(s.hrSession, { unread_only: true });
      expect(unread.total_notes).toBe(2);
      expect(unread.projects.flatMap((p) => p.notes).map((n) => n.id)).not.toContain(
        s.notes.toLead,
      );
    });
  });

  it('refuses a caller who can never be a recipient', async () => {
    await withPeople(async (pool) => {
      const s = await seedInbox(pool);

      // A member with no lead, AM or org-wide role: they can send notes, not receive them.
      await expect(
        listMoraleInbox(sessionFor(s.t.tenant_id, s.atlasMember), {}),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});

describe('markMoraleNoteRead (FUT-786)', () => {
  it('is per reader — HR reading a note leaves it unread for the lead', async () => {
    await withPeople(async (pool) => {
      const s = await seedInbox(pool);

      await markMoraleNoteRead(s.hrSession, s.notes.toLead);

      const hrInbox = await listMoraleInbox(s.hrSession, {});
      expect(
        hrInbox.projects.flatMap((p) => p.notes).find((n) => n.id === s.notes.toLead)?.is_read,
      ).toBe(true);

      const leadInbox = await listMoraleInbox(s.leadSession, {});
      expect(leadInbox.unread_notes).toBe(1);
      expect(leadInbox.projects[0]?.notes[0]?.is_read).toBe(false);
    });
  });

  it('is idempotent', async () => {
    await withPeople(async (pool) => {
      const s = await seedInbox(pool);

      await markMoraleNoteRead(s.hrSession, s.notes.toLead);
      await expect(markMoraleNoteRead(s.hrSession, s.notes.toLead)).resolves.toBeUndefined();
    });
  });

  it('refuses a note the caller was not chosen for, rather than hiding it', async () => {
    await withPeople(async (pool) => {
      const s = await seedInbox(pool);

      // The Atlas lead was never a recipient of the Nova member's note.
      await expect(getMoraleNote(s.leadSession, s.notes.fromNova)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await expect(markMoraleNoteRead(s.leadSession, s.notes.fromNova)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });
});

describe('resolvePrimaryProject (FUT-786)', () => {
  it('files a note under the project the sender holds the largest share of', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);
      const big = await seedProject(t.tenant_id, 'Project Atlas', 'Account Meridian');
      const small = await seedProject(t.tenant_id, 'Team Nova', 'Account Nova');
      const lead = await seedPerson(t.tenant_id, 'Lead One', crypto.randomUUID());
      const me = await seedPerson(t.tenant_id, 'Member One', crypto.randomUUID());

      await seedAllocation({
        tenantId: t.tenant_id,
        personId: me.person_id,
        projectId: small.project_id,
        accountId: small.account_id,
        leadPersonId: lead.person_id,
        plannedPct: '20',
      });
      await seedAllocation({
        tenantId: t.tenant_id,
        personId: me.person_id,
        projectId: big.project_id,
        accountId: big.account_id,
        leadPersonId: lead.person_id,
        plannedPct: '80',
      });

      const resolved = await resolvePrimaryProject(t.tenant_id, me.person_id);

      expect(resolved).toMatchObject({
        project_id: big.project_id,
        project_name: 'Project Atlas',
        account_id: big.account_id,
        capacity: 'member',
      });
    });
  });

  it('marks a lead as such, and leaves an unallocated sender without a project', async () => {
    await withPeople(async (pool) => {
      const t = await seedTenant(pool);
      const atlas = await seedProject(t.tenant_id, 'Project Atlas', 'Account Meridian');
      const lead = await seedPerson(t.tenant_id, 'Lead One', crypto.randomUUID());
      const stranger = await seedPerson(t.tenant_id, 'No Project', crypto.randomUUID());

      await seedAllocation({
        tenantId: t.tenant_id,
        personId: crypto.randomUUID(),
        projectId: atlas.project_id,
        accountId: atlas.account_id,
        leadPersonId: lead.person_id,
      });

      expect(await resolvePrimaryProject(t.tenant_id, lead.person_id)).toMatchObject({
        project_id: atlas.project_id,
        capacity: 'tl',
      });
      expect(await resolvePrimaryProject(t.tenant_id, stranger.person_id)).toBeNull();
    });
  });
});

describe('listMoraleInboxFilters (FUT-786)', () => {
  it('offers only projects and senders that actually wrote in the window', async () => {
    await withPeople(async (pool) => {
      const s = await seedInbox(pool);

      const all = await listMoraleInboxFilters(s.hrSession, {});
      expect(all.projects.map((p) => p.name)).toEqual(['Project Atlas', 'Team Nova']);
      expect(all.senders.map((x) => x.full_name)).toEqual(['Do Quang Vinh', 'Nguyen Ngoc Nhung']);
      // The pairing the client uses to narrow one picker from the other.
      expect(all.senders.find((x) => x.full_name === 'Do Quang Vinh')?.project_id).toBe(
        s.nova.project_id,
      );

      const narrowed = await listMoraleInboxFilters(s.hrSession, {
        from: '2026-08-14',
        to: '2026-08-14',
      });
      expect(narrowed.projects.map((p) => p.name)).toEqual(['Team Nova']);
      expect(narrowed.senders.map((x) => x.full_name)).toEqual(['Do Quang Vinh']);
    });
  });
});

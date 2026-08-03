import { randomUUID } from 'node:crypto';
import type { SessionScope } from '@seta/core';
import { describe, expect, it } from 'vitest';
import {
  orgKey,
  resolveHeads,
  resolveOrgUnits,
} from '../../src/backend/m365/directory/org-tree.ts';
import { createDirectoryRepo, type DirectoryRepo } from '../../src/backend/m365/directory/repo.ts';
import {
  type PeopleResolutionSurface,
  resolveDirectoryConflict,
} from '../../src/backend/m365/directory/resolve.ts';
import { buildSystemSession } from '../../src/backend/m365/system-session.ts';
import { INTEGRATIONS_PERMISSIONS } from '../../src/backend/rbac.ts';
import { withIntegrationsTestDb } from '../helpers/test-db.ts';

const TENANT = '11111111-1111-1111-1111-111111111111';
const OTHER_TENANT = '11111111-1111-1111-1111-1111111111ff';
const ADMIN_USER = '33333333-3333-4333-8333-333333333331';

const EXEC = '00000000-0000-4000-8000-0000000000e0';
const OPERATION = '00000000-0000-4000-8000-0000000000a0';
const DELIVERY = '00000000-0000-4000-8000-0000000000d0';

const MGR_A_OID = '55555555-5555-4555-8555-555555555551';
const MGR_B_OID = '55555555-5555-4555-8555-555555555552';
const MGR_A_PERSON = '66666666-6666-4666-8666-666666666661';
const MGR_B_PERSON = '66666666-6666-4666-8666-666666666662';
const P1 = '77777777-7777-4777-8777-777777777771';
const P2 = '77777777-7777-4777-8777-777777777772';
const P3 = '77777777-7777-4777-8777-777777777773';

interface FakeUnit {
  id: string;
  parent_id: string | null;
  name: string;
  kind: string;
  head_worker_id: string | null;
}

interface FakeCalls {
  create: Array<{ name: string; parent_id: string | null | undefined; user: string }>;
  update: Array<{ org_unit_id: string; patch: Record<string, unknown>; user: string }>;
  delete: Array<{ org_unit_id: string; user: string }>;
  edit: Array<{ worker_id: string; patch: Record<string, unknown>; user: string }>;
  terminate: Array<{ worker_id: string; user: string }>;
}

interface FakePeople extends PeopleResolutionSurface {
  units: Map<string, FakeUnit>;
  members: Map<string, string[]>;
  names: Map<string, string>;
  calls: FakeCalls;
}

/**
 * Stands in for the `@seta/people` public functions. A module-boundary double, not a DB mock: the
 * `people` schema is not migrated into this package's testcontainer and `integrations` may never
 * touch it. Every call records `session.user_id`, which is how the §9.2 requirement — the ACTING
 * ADMIN's session, never `buildSystemSession` — is actually asserted rather than assumed.
 */
function createFakePeople(seed: FakeUnit[]): FakePeople {
  const units = new Map<string, FakeUnit>(seed.map((u) => [u.id, { ...u }]));
  const members = new Map<string, string[]>();
  const names = new Map<string, string>();
  const calls: FakeCalls = { create: [], update: [], delete: [], edit: [], terminate: [] };

  const memberUnitOf = (personId: string): string | undefined => {
    for (const [unitId, ids] of members) if (ids.includes(personId)) return unitId;
    return undefined;
  };

  return {
    units,
    members,
    names,
    calls,
    async getOrgStructure() {
      return {
        units: [...units.values()].map((u) => ({
          ...u,
          member_ids: [...(members.get(u.id) ?? [])],
        })),
      };
    },
    async listWorkerNames({ person_ids }) {
      return new Map(
        person_ids.filter((id) => names.has(id)).map((id) => [id, names.get(id) as string]),
      );
    },
    async createOrgUnit(input) {
      calls.create.push({
        name: input.name,
        parent_id: input.parent_id,
        user: input.session.user_id,
      });
      const id = randomUUID();
      units.set(id, {
        id,
        parent_id: input.parent_id ?? null,
        name: input.name,
        kind: input.kind,
        head_worker_id: null,
      });
      return { id };
    },
    async updateOrgUnit(input) {
      calls.update.push({
        org_unit_id: input.org_unit_id,
        patch: { ...input.patch },
        user: input.session.user_id,
      });
      const current = units.get(input.org_unit_id);
      if (!current) throw new Error(`org unit not found: ${input.org_unit_id}`);
      if (input.patch.name !== undefined) current.name = input.patch.name;
      if (input.patch.parent_id !== undefined) current.parent_id = input.patch.parent_id;
      if (input.patch.head_worker_id !== undefined) {
        current.head_worker_id = input.patch.head_worker_id;
      }
      return { version: 1 };
    },
    async deleteOrgUnit(input) {
      calls.delete.push({ org_unit_id: input.org_unit_id, user: input.session.user_id });
      const hasChildren = [...units.values()].some((u) => u.parent_id === input.org_unit_id);
      if (hasChildren) return { deleted: false, reason: 'has_children' };
      if ((members.get(input.org_unit_id) ?? []).length > 0) {
        return { deleted: false, reason: 'has_members' };
      }
      units.delete(input.org_unit_id);
      return { deleted: true };
    },
    async editWorker(input) {
      calls.edit.push({
        worker_id: input.worker_id,
        patch: { ...input.patch },
        user: input.session.user_id,
      });
      const from = memberUnitOf(input.worker_id);
      if (from) {
        members.set(
          from,
          (members.get(from) ?? []).filter((id) => id !== input.worker_id),
        );
      }
      const to = input.patch.org_unit_id;
      if (typeof to === 'string') members.set(to, [...(members.get(to) ?? []), input.worker_id]);
      return { version: 1 };
    },
    async terminateWorker(input) {
      calls.terminate.push({ worker_id: input.worker_id, user: input.session.user_id });
      return { status: 'terminated' as const };
    },
  };
}

/** The curated structural spine (design §4.1). */
function spine(): FakeUnit[] {
  return [
    { id: EXEC, parent_id: null, name: 'Executive', kind: 'executive', head_worker_id: null },
    { id: OPERATION, parent_id: EXEC, name: 'Operation', kind: 'operation', head_worker_id: null },
    { id: DELIVERY, parent_id: EXEC, name: 'Delivery', kind: 'delivery', head_worker_id: null },
  ];
}

/**
 * A real admin's session. §9.2 is explicit that resolutions run under it and NOT under
 * `buildSystemSession`, so that RBAC applies normally and `person_history` attributes the change
 * to a human. Only the `integrations` permission is asserted here — the `people` permissions are
 * re-checked inside `people` itself.
 */
function adminSession(
  permissions: string[] = [INTEGRATIONS_PERMISSIONS.m365Configure],
  tenantId = TENANT,
): SessionScope {
  return {
    session_id: '44444444-4444-4444-8444-444444444441',
    user_id: ADMIN_USER,
    tenant_id: tenantId,
    email: 'admin@acme.test',
    display_name: 'Admin Person',
    role_summary: { roles: ['org.admin'], cross_tenant_read: false, assignments: [] },
    role_summary_hash: 'admin',
    permissions: new Set(permissions),
    assignments: [],
    group_ids: [],
    product_access: new Set<string>(),
    person_id: null,
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

/** Forgets everything the seeding did, so an assertion sees only what the resolution did. */
function resetCalls(people: FakePeople): void {
  people.calls.create.length = 0;
  people.calls.update.length = 0;
  people.calls.delete.length = 0;
  people.calls.edit.length = 0;
  people.calls.terminate.length = 0;
}

async function onlyConflictId(repo: DirectoryRepo, tenantId = TENANT): Promise<string> {
  const open = await repo.listConflicts(tenantId, 'open');
  expect(open.length).toBe(1);
  return open[0]?.id as string;
}

/** Seeds an ambiguous Engineering unit and returns its id plus the raised conflict's id. */
async function seedManagerAmbiguous(
  repo: DirectoryRepo,
  people: FakePeople,
): Promise<{
  unitId: string;
  conflictId: string;
  members: Parameters<typeof resolveHeads>[0]['members'];
}> {
  const session = buildSystemSession(TENANT);
  const map = await resolveOrgUnits({
    tenantId: TENANT,
    reap: true,
    pairs: [{ division: null, department: 'Engineering' }],
    session,
    repo,
    people,
  });
  const unitId = map.get(orgKey(null, 'Engineering')) as string;
  for (const [personId, entraOid] of [
    [MGR_A_PERSON, MGR_A_OID],
    [MGR_B_PERSON, MGR_B_OID],
  ] as const) {
    await repo.upsertPersonLink({ tenantId: TENANT, personId, entraOid });
  }
  const members = [
    { person_id: P1, org_unit_id: unitId, manager_oid: MGR_A_OID },
    { person_id: P2, org_unit_id: unitId, manager_oid: MGR_A_OID },
    { person_id: P3, org_unit_id: unitId, manager_oid: MGR_B_OID },
  ];
  await resolveHeads({ tenantId: TENANT, members, session, repo, people });
  return { unitId, conflictId: await onlyConflictId(repo), members };
}

describe('resolveDirectoryConflict', () => {
  describe('guards', () => {
    it('refuses a session without integrations.m365.configure and changes nothing', async () => {
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });
        const people = createFakePeople(spine());
        const { unitId, conflictId } = await seedManagerAmbiguous(repo, people);
        people.calls.update.length = 0;

        await expect(
          resolveDirectoryConflict(
            {
              conflictId,
              action: 'choose_head',
              params: { person_id: MGR_B_PERSON },
              session: adminSession([INTEGRATIONS_PERMISSIONS.m365Read]),
            },
            { repo, people },
          ),
        ).rejects.toMatchObject({ name: 'IntegrationsError', code: 'FORBIDDEN' });

        expect(people.calls.update).toEqual([]);
        expect(people.units.get(unitId)?.head_worker_id).toBe(MGR_A_PERSON);
        expect((await repo.getConflict(TENANT, conflictId))?.status).toBe('open');
      });
    });

    it('cannot see, or resolve, a conflict belonging to another tenant', async () => {
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });
        const people = createFakePeople(spine());
        await repo.raiseConflict({
          tenantId: OTHER_TENANT,
          kind: 'user_removed',
          subjectType: 'person',
          subjectId: P1,
          entraOid: MGR_A_OID,
          detail: { person_id: P1 },
        });
        const foreignId = await onlyConflictId(repo, OTHER_TENANT);

        await expect(
          resolveDirectoryConflict(
            { conflictId: foreignId, action: 'ignore', session: adminSession() },
            { repo, people },
          ),
        ).rejects.toMatchObject({ name: 'IntegrationsError', code: 'NOT_FOUND' });
        expect((await repo.getConflict(OTHER_TENANT, foreignId))?.status).toBe('open');
      });
    });

    it('reports an already-resolved conflict instead of resolving it twice', async () => {
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });
        const people = createFakePeople(spine());
        const { conflictId } = await seedManagerAmbiguous(repo, people);

        const first = await resolveDirectoryConflict(
          {
            conflictId,
            action: 'choose_head',
            params: { person_id: MGR_B_PERSON },
            session: adminSession(),
          },
          { repo, people },
        );
        expect(first).toEqual({ resolved: true });
        people.calls.update.length = 0;

        const second = await resolveDirectoryConflict(
          {
            conflictId,
            action: 'choose_head',
            params: { person_id: MGR_A_PERSON },
            session: adminSession(),
          },
          { repo, people },
        );

        expect(second).toEqual({ resolved: false, reason: 'already_resolved' });
        // No second write, and the first admin's decision still stands on the row.
        expect(people.calls.update).toEqual([]);
        const row = await repo.getConflict(TENANT, conflictId);
        expect(row?.status).toBe('resolved');
        expect(row?.resolution).toEqual({ action: 'choose_head', person_id: MGR_B_PERSON });
      });
    });

    it('rejects an action that this conflict kind does not offer', async () => {
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });
        const people = createFakePeople(spine());
        const { conflictId } = await seedManagerAmbiguous(repo, people);

        // `offboard` is a user_removed resolution; a validation failure, never a silent no-op.
        await expect(
          resolveDirectoryConflict(
            { conflictId, action: 'offboard', session: adminSession() },
            { repo, people },
          ),
        ).rejects.toMatchObject({ name: 'IntegrationsError', code: 'INVALID_INPUT' });
        expect(people.calls.terminate).toEqual([]);
        expect((await repo.getConflict(TENANT, conflictId))?.status).toBe('open');
      });
    });

    it('ignore closes the row as ignored and touches nothing else', async () => {
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });
        const people = createFakePeople(spine());
        const { unitId, conflictId } = await seedManagerAmbiguous(repo, people);
        resetCalls(people);

        expect(
          await resolveDirectoryConflict(
            { conflictId, action: 'ignore', session: adminSession() },
            { repo, people },
          ),
        ).toEqual({ resolved: true });

        expect(people.calls).toEqual({
          create: [],
          update: [],
          delete: [],
          edit: [],
          terminate: [],
        });
        expect(people.units.get(unitId)?.head_worker_id).toBe(MGR_A_PERSON);
        const row = await repo.getConflict(TENANT, conflictId);
        expect(row?.status).toBe('ignored');
        expect(row?.resolution).toEqual({ action: 'ignore' });
        expect(row?.resolvedBy).toBe(ADMIN_USER);
        expect(row?.resolvedAt).not.toBeNull();
        expect(await repo.listConflicts(TENANT, 'open')).toEqual([]);
      });
    });
  });

  describe('manager_ambiguous', () => {
    it('choose_head writes the head under the ADMIN session and the next sync honours it', async () => {
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });
        const people = createFakePeople(spine());
        const { unitId, conflictId, members } = await seedManagerAmbiguous(repo, people);
        expect(people.units.get(unitId)?.head_worker_id).toBe(MGR_A_PERSON);
        people.calls.update.length = 0;

        expect(
          await resolveDirectoryConflict(
            {
              conflictId,
              action: 'choose_head',
              params: { person_id: MGR_B_PERSON },
              session: adminSession(),
            },
            { repo, people },
          ),
        ).toEqual({ resolved: true });

        // Applied through the public people function, under the acting admin — never the system
        // actor, which is the whole point of §9.2 (person_history attributes a real human).
        expect(people.calls.update).toEqual([
          { org_unit_id: unitId, patch: { head_worker_id: MGR_B_PERSON }, user: ADMIN_USER },
        ]);
        expect(people.units.get(unitId)?.head_worker_id).toBe(MGR_B_PERSON);
        const row = await repo.getConflict(TENANT, conflictId);
        expect(row?.status).toBe('resolved');
        expect(row?.resolvedBy).toBe(ADMIN_USER);
        expect(row?.resolution).toEqual({ action: 'choose_head', person_id: MGR_B_PERSON });

        // I1 end to end: the shape written here is the shape `resolveHeads` reads back, so the
        // very next run leaves B in place and queues nothing new.
        people.calls.update.length = 0;
        const again = await resolveHeads({
          tenantId: TENANT,
          members,
          session: buildSystemSession(TENANT),
          repo,
          people,
        });
        expect(again).toEqual({ headsSet: 0, ambiguous: 0 });
        expect(people.calls.update).toEqual([]);
        expect(people.units.get(unitId)?.head_worker_id).toBe(MGR_B_PERSON);
        expect(await repo.listConflicts(TENANT, 'open')).toEqual([]);
      });
    });

    it('refuses a person who is not one of the queued candidates', async () => {
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });
        const people = createFakePeople(spine());
        const { unitId, conflictId } = await seedManagerAmbiguous(repo, people);
        people.calls.update.length = 0;

        await expect(
          resolveDirectoryConflict(
            {
              conflictId,
              action: 'choose_head',
              params: { person_id: P3 },
              session: adminSession(),
            },
            { repo, people },
          ),
        ).rejects.toMatchObject({ name: 'IntegrationsError', code: 'INVALID_INPUT' });

        expect(people.calls.update).toEqual([]);
        expect(people.units.get(unitId)?.head_worker_id).toBe(MGR_A_PERSON);
        expect((await repo.getConflict(TENANT, conflictId))?.status).toBe('open');
      });
    });
  });
});

describe('resolveDirectoryConflict — unit_delete_blocked', () => {
  /** Drops `Engineering` from a full census so the reap raises `unit_delete_blocked`. */
  async function seedBlockedDelete(
    repo: DirectoryRepo,
    people: FakePeople,
    memberIds: string[],
  ): Promise<{ engineering: string; marketing: string; conflictId: string }> {
    const session = buildSystemSession(TENANT);
    const first = await resolveOrgUnits({
      tenantId: TENANT,
      reap: true,
      pairs: [
        { division: null, department: 'Engineering' },
        { division: null, department: 'Marketing' },
      ],
      session,
      repo,
      people,
    });
    const engineering = first.get(orgKey(null, 'Engineering')) as string;
    const marketing = first.get(orgKey(null, 'Marketing')) as string;
    people.members.set(engineering, memberIds);

    await resolveOrgUnits({
      tenantId: TENANT,
      reap: true,
      pairs: [{ division: null, department: 'Marketing' }],
      session,
      repo,
      people,
    });
    return { engineering, marketing, conflictId: await onlyConflictId(repo) };
  }

  it('reassign moves every member to the target unit and then deletes the emptied one', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createDirectoryRepo({ db });
      const people = createFakePeople(spine());
      const { engineering, marketing, conflictId } = await seedBlockedDelete(repo, people, [
        P1,
        P2,
      ]);

      expect(
        await resolveDirectoryConflict(
          {
            conflictId,
            action: 'reassign',
            params: { target_org_unit_id: marketing },
            session: adminSession(),
          },
          { repo, people },
        ),
      ).toEqual({ resolved: true });

      expect(people.calls.edit).toEqual([
        { worker_id: P1, patch: { org_unit_id: marketing }, user: ADMIN_USER },
        { worker_id: P2, patch: { org_unit_id: marketing }, user: ADMIN_USER },
      ]);
      expect(people.units.has(engineering)).toBe(false);
      expect(people.members.get(marketing)).toEqual([P1, P2]);
      // The link goes with the unit: a link pointing at a deleted unit makes every later run
      // recreate-and-relink from scratch.
      const links = await repo.listOrgUnitLinks(TENANT);
      expect(links.map((l) => l.entraKey)).toEqual([orgKey(null, 'Marketing')]);
      const row = await repo.getConflict(TENANT, conflictId);
      expect(row?.status).toBe('resolved');
      expect(row?.resolution).toEqual({
        action: 'reassign',
        target_org_unit_id: marketing,
        moved_count: 2,
      });
    });
  });

  it('reports the refusal and leaves the row open when the unit still cannot be deleted', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createDirectoryRepo({ db });
      const people = createFakePeople(spine());
      const { engineering, marketing, conflictId } = await seedBlockedDelete(repo, people, [P1]);
      // A child appears under Engineering: members move, but `deleteOrgUnit` still refuses.
      people.units.set('00000000-0000-4000-8000-0000000000c1', {
        id: '00000000-0000-4000-8000-0000000000c1',
        parent_id: engineering,
        name: 'Curated child',
        kind: 'function',
        head_worker_id: null,
      });

      const result = await resolveDirectoryConflict(
        {
          conflictId,
          action: 'reassign',
          params: { target_org_unit_id: marketing },
          session: adminSession(),
        },
        { repo, people },
      );

      expect(result).toEqual({ resolved: false, reason: 'has_children' });
      expect(people.units.has(engineering)).toBe(true);
      // Still queued: a human has to deal with the child unit.
      expect((await repo.getConflict(TENANT, conflictId))?.status).toBe('open');
      expect((await repo.listConflicts(TENANT, 'open')).length).toBe(1);
    });
  });

  it('rejects a reassign target that is not a real unit, before moving anybody', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createDirectoryRepo({ db });
      const people = createFakePeople(spine());
      const { conflictId } = await seedBlockedDelete(repo, people, [P1]);
      resetCalls(people);

      await expect(
        resolveDirectoryConflict(
          {
            conflictId,
            action: 'reassign',
            params: { target_org_unit_id: '00000000-0000-4000-8000-0000000000ff' },
            session: adminSession(),
          },
          { repo, people },
        ),
      ).rejects.toMatchObject({ name: 'IntegrationsError', code: 'INVALID_INPUT' });
      expect(people.calls.edit).toEqual([]);
      expect(people.calls.delete).toEqual([]);
      expect((await repo.getConflict(TENANT, conflictId))?.status).toBe('open');
    });
  });

  it('keep releases sync ownership so the next full census stops re-raising it', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createDirectoryRepo({ db });
      const people = createFakePeople(spine());
      const { engineering, conflictId } = await seedBlockedDelete(repo, people, [P1]);

      expect(
        await resolveDirectoryConflict(
          { conflictId, action: 'keep', session: adminSession() },
          { repo, people },
        ),
      ).toEqual({ resolved: true });

      // Ownership IS the link row (§4.2): dropping it is what makes "keep" survive the next run.
      const links = await repo.listOrgUnitLinks(TENANT);
      expect(links.map((l) => l.orgUnitId)).not.toContain(engineering);
      expect(people.units.has(engineering)).toBe(true);
      const row = await repo.getConflict(TENANT, conflictId);
      expect(row?.status).toBe('resolved');
      expect(row?.resolution).toEqual({ action: 'keep', released_org_unit_id: engineering });

      people.calls.delete.length = 0;
      await resolveOrgUnits({
        tenantId: TENANT,
        reap: true,
        pairs: [{ division: null, department: 'Marketing' }],
        session: buildSystemSession(TENANT),
        repo,
        people,
      });
      expect(people.calls.delete).toEqual([]);
      expect(await repo.listConflicts(TENANT, 'open')).toEqual([]);
    });
  });
});

describe('resolveDirectoryConflict — spine_collision', () => {
  async function seedSpineCollision(
    repo: DirectoryRepo,
    people: FakePeople,
  ): Promise<{ conflictId: string }> {
    await resolveOrgUnits({
      tenantId: TENANT,
      reap: true,
      pairs: [{ division: null, department: 'Delivery' }],
      session: buildSystemSession(TENANT),
      repo,
      people,
    });
    return { conflictId: await onlyConflictId(repo) };
  }

  it('map_to_spine points the Entra department at the spine unit without mutating it', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createDirectoryRepo({ db });
      const people = createFakePeople(spine());
      const { conflictId } = await seedSpineCollision(repo, people);
      const before = { ...(people.units.get(DELIVERY) as FakeUnit) };

      expect(
        await resolveDirectoryConflict(
          { conflictId, action: 'map_to_spine', session: adminSession() },
          { repo, people },
        ),
      ).toEqual({ resolved: true });

      const row = await repo.getConflict(TENANT, conflictId);
      expect(row?.status).toBe('resolved');
      expect(row?.resolution).toEqual({ action: 'map_to_spine', org_unit_id: DELIVERY });

      // The next run places those people in the spine unit and stops asking the question.
      const map = await resolveOrgUnits({
        tenantId: TENANT,
        reap: true,
        pairs: [{ division: null, department: 'Delivery' }],
        session: buildSystemSession(TENANT),
        repo,
        people,
      });
      expect(map.get(orgKey(null, 'Delivery'))).toBe(DELIVERY);
      expect(people.units.get(DELIVERY)).toEqual(before);
      expect(people.calls.create).toEqual([]);
      expect(people.calls.update).toEqual([]);
      expect(people.calls.delete).toEqual([]);
      expect(await repo.listConflicts(TENANT, 'open')).toEqual([]);
    });
  });

  it('create_distinct builds a separate unit under the default parent, keeping the Entra name', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createDirectoryRepo({ db });
      const people = createFakePeople(spine());
      const { conflictId } = await seedSpineCollision(repo, people);

      expect(
        await resolveDirectoryConflict(
          { conflictId, action: 'create_distinct', session: adminSession() },
          { repo, people },
        ),
      ).toEqual({ resolved: true });

      const created = [...people.units.values()].find((u) => u.kind === 'function');
      expect(created?.name).toBe('Delivery');
      expect(created?.parent_id).toBe(OPERATION);
      expect(people.calls.create).toEqual([
        { name: 'Delivery', parent_id: OPERATION, user: ADMIN_USER },
      ]);
      const row = await repo.getConflict(TENANT, conflictId);
      expect(row?.resolution).toEqual({ action: 'create_distinct', org_unit_id: created?.id });

      // The name is Entra's precisely so the next run agrees with it: no rename, no re-raise.
      people.calls.create.length = 0;
      const map = await resolveOrgUnits({
        tenantId: TENANT,
        reap: true,
        pairs: [{ division: null, department: 'Delivery' }],
        session: buildSystemSession(TENANT),
        repo,
        people,
      });
      expect(map.get(orgKey(null, 'Delivery'))).toBe(created?.id);
      expect(people.calls.create).toEqual([]);
      expect(people.calls.update).toEqual([]);
      expect(people.units.get(DELIVERY)?.name).toBe('Delivery');
      expect(await repo.listConflicts(TENANT, 'open')).toEqual([]);
    });
  });
});

describe('resolveDirectoryConflict — user_removed and email_collision', () => {
  it('offboard terminates the person under the admin session', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createDirectoryRepo({ db });
      const people = createFakePeople(spine());
      await repo.raiseConflict({
        tenantId: TENANT,
        kind: 'user_removed',
        subjectType: 'person',
        subjectId: MGR_A_PERSON,
        entraOid: MGR_A_OID,
        detail: { person_id: MGR_A_PERSON, entra_oid: MGR_A_OID },
      });
      const conflictId = await onlyConflictId(repo);

      expect(
        await resolveDirectoryConflict(
          { conflictId, action: 'offboard', session: adminSession() },
          { repo, people },
        ),
      ).toEqual({ resolved: true });

      expect(people.calls.terminate).toEqual([{ worker_id: MGR_A_PERSON, user: ADMIN_USER }]);
      const row = await repo.getConflict(TENANT, conflictId);
      expect(row?.status).toBe('resolved');
      expect(row?.resolution).toEqual({ action: 'offboard', person_id: MGR_A_PERSON });
    });
  });

  it('ignore closes an email_collision without touching people', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createDirectoryRepo({ db });
      const people = createFakePeople(spine());
      await repo.raiseConflict({
        tenantId: TENANT,
        kind: 'email_collision',
        subjectType: 'person',
        subjectId: null,
        entraOid: MGR_A_OID,
        detail: {
          work_email: 'ada@acme.test',
          full_name: 'Ada Lovelace',
          candidates: [{ person_id: P1, full_name: 'Ada L', directory_managed: false }],
        },
      });
      const conflictId = await onlyConflictId(repo);

      expect(
        await resolveDirectoryConflict(
          { conflictId, action: 'ignore', session: adminSession() },
          { repo, people },
        ),
      ).toEqual({ resolved: true });
      expect(people.calls.edit).toEqual([]);
      expect((await repo.getConflict(TENANT, conflictId))?.status).toBe('ignored');
    });
  });
});

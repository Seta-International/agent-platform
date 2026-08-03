import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  orgKey,
  type PeopleOrgSurface,
  resolveHeads,
  resolveOrgUnits,
} from '../../src/backend/m365/directory/org-tree.ts';
import { createDirectoryRepo } from '../../src/backend/m365/directory/repo.ts';
import { buildSystemSession } from '../../src/backend/m365/system-session.ts';
import { withIntegrationsTestDb } from '../helpers/test-db.ts';

const TENANT = '11111111-1111-1111-1111-111111111111';

interface FakeUnit {
  id: string;
  parent_id: string | null;
  name: string;
  kind: string;
  head_worker_id: string | null;
}

interface FakeCalls {
  getOrgStructure: number;
  create: Array<{ name: string; kind: string; parent_id: string | null | undefined }>;
  update: Array<{
    org_unit_id: string;
    patch: { name?: string; parent_id?: string | null; head_worker_id?: string | null };
  }>;
  delete: string[];
}

interface FakePeople extends PeopleOrgSurface {
  units: Map<string, FakeUnit>;
  /** unit id -> person ids, so deleteOrgUnit can answer `has_members` the way the real one does. */
  members: Map<string, string[]>;
  calls: FakeCalls;
  snapshot(id: string): FakeUnit | undefined;
}

/**
 * Stands in for the `@seta/people` write surface. It is a module-boundary double, not a DB mock:
 * `people` owns its own schema and `integrations` may never touch it, so the only honest way to
 * drive this code under test is through the injected surface. Its `deleteOrgUnit` mirrors the real
 * one exactly — returns `{ deleted: false, reason }`, never throws (`delete-org-unit.ts:39`).
 */
function createFakePeople(seed: FakeUnit[]): FakePeople {
  const units = new Map<string, FakeUnit>(seed.map((u) => [u.id, { ...u }]));
  const members = new Map<string, string[]>();
  const calls: FakeCalls = { getOrgStructure: 0, create: [], update: [], delete: [] };

  return {
    units,
    members,
    calls,
    snapshot(id) {
      const u = units.get(id);
      return u ? { ...u } : undefined;
    },
    async getOrgStructure() {
      calls.getOrgStructure += 1;
      return {
        units: [...units.values()].map((u) => ({ ...u })),
      };
    },
    async createOrgUnit(input) {
      calls.create.push({ name: input.name, kind: input.kind, parent_id: input.parent_id });
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
      calls.update.push({ org_unit_id: input.org_unit_id, patch: { ...input.patch } });
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
      calls.delete.push(input.org_unit_id);
      const hasChildren = [...units.values()].some((u) => u.parent_id === input.org_unit_id);
      if (hasChildren) return { deleted: false, reason: 'has_children' };
      if ((members.get(input.org_unit_id) ?? []).length > 0) {
        return { deleted: false, reason: 'has_members' };
      }
      units.delete(input.org_unit_id);
      return { deleted: true };
    },
  };
}

const EXEC = '00000000-0000-4000-8000-0000000000e0';
const OPERATION = '00000000-0000-4000-8000-0000000000a0';
const DELIVERY = '00000000-0000-4000-8000-0000000000d0';
const PMO = '00000000-0000-4000-8000-0000000000f0';

/** The curated structural spine (design §4.1) — never created, renamed, re-parented or deleted. */
function spine(): FakeUnit[] {
  return [
    { id: EXEC, parent_id: null, name: 'Executive', kind: 'executive', head_worker_id: null },
    { id: OPERATION, parent_id: EXEC, name: 'Operation', kind: 'operation', head_worker_id: null },
    { id: DELIVERY, parent_id: EXEC, name: 'Delivery', kind: 'delivery', head_worker_id: null },
    { id: PMO, parent_id: EXEC, name: 'PMO', kind: 'pmo', head_worker_id: null },
  ];
}

function functionUnits(people: FakePeople): FakeUnit[] {
  return [...people.units.values()].filter((u) => u.kind === 'function');
}

describe('directory org tree', () => {
  it('the system session carries every permission the people write surface requires', () => {
    // updateOrgUnit/deleteOrgUnit moved to `people.org_unit.manage` on this branch; createOrgUnit
    // still takes `people.worker.create` and getOrgStructure `people.worker.read`. A session
    // missing any one of these fails deep inside `people` as an opaque FORBIDDEN.
    const session = buildSystemSession(TENANT);
    expect(session.permissions.has('people.org_unit.manage')).toBe(true);
    expect(session.permissions.has('people.worker.create')).toBe(true);
    expect(session.permissions.has('people.worker.read')).toBe(true);
  });

  describe('orgKey', () => {
    it('separates on a control character that cannot occur inside a free-text Entra field', () => {
      expect(orgKey('Ops', 'Engineering')).toBe(`ops${String.fromCharCode(0x1f)}engineering`);
      // Trimmed and case-folded, so two spellings of one department are one org node.
      expect(orgKey('  OPS ', 'Engineering  ')).toBe(orgKey('ops', 'engineering'));
      // Nulls and blanks collapse to the same empty side.
      expect(orgKey(null, 'Engineering')).toBe(orgKey('   ', 'Engineering'));
      expect(orgKey(null, null)).toBe(String.fromCharCode(0x1f));
      // Division-only and department-only keys can never collide.
      expect(orgKey('Sales', null)).not.toBe(orgKey(null, 'Sales'));
    });
  });

  it('creates a kind=function unit under Operation for a new department and links it', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createDirectoryRepo({ db });
      const people = createFakePeople(spine());
      const session = buildSystemSession(TENANT);

      const map = await resolveOrgUnits({
        tenantId: TENANT,
        pairs: [{ division: null, department: 'Engineering' }],
        session,
        repo,
        people,
      });

      const created = functionUnits(people);
      expect(created.length).toBe(1);
      expect(created[0]?.name).toBe('Engineering');
      expect(created[0]?.kind).toBe('function');
      expect(created[0]?.parent_id).toBe(OPERATION);
      expect(map.get(orgKey(null, 'Engineering'))).toBe(created[0]?.id);

      const links = await repo.listOrgUnitLinks(TENANT);
      expect(links.length).toBe(1);
      expect(links[0]?.orgUnitId).toBe(created[0]?.id);
      expect(links[0]?.kind).toBe('department');
      expect(links[0]?.entraKey).toBe(orgKey(null, 'Engineering'));

      expect(await repo.listConflicts(TENANT, 'open')).toEqual([]);
    });
  });

  it('parents a department under its division, and the division under Operation', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createDirectoryRepo({ db });
      const people = createFakePeople(spine());
      const session = buildSystemSession(TENANT);

      const map = await resolveOrgUnits({
        tenantId: TENANT,
        pairs: [{ division: 'Product Group', department: 'Engineering' }],
        session,
        repo,
        people,
      });

      const units = functionUnits(people);
      expect(units.length).toBe(2);
      const division = units.find((u) => u.name === 'Product Group');
      const department = units.find((u) => u.name === 'Engineering');
      expect(division?.parent_id).toBe(OPERATION);
      expect(department?.parent_id).toBe(division?.id);
      expect(map.get(orgKey('Product Group', 'Engineering'))).toBe(department?.id);

      const links = await repo.listOrgUnitLinks(TENANT);
      expect(links.length).toBe(2);
      expect(links.find((l) => l.orgUnitId === division?.id)?.kind).toBe('division');
      expect(links.find((l) => l.orgUnitId === division?.id)?.entraKey).toBe(
        orgKey('Product Group', null),
      );
      expect(links.find((l) => l.orgUnitId === department?.id)?.kind).toBe('department');
    });
  });

  it('re-running with unchanged input creates nothing and updates nothing', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createDirectoryRepo({ db });
      const people = createFakePeople(spine());
      const session = buildSystemSession(TENANT);
      const pairs = [
        { division: 'Product Group', department: 'Engineering' },
        { division: null, department: 'Marketing' },
      ];

      const first = await resolveOrgUnits({ tenantId: TENANT, pairs, session, repo, people });
      expect(people.calls.create.length).toBe(3); // Product Group, Engineering, Marketing
      const afterFirst = functionUnits(people).map((u) => ({ ...u }));

      people.calls.create.length = 0;
      people.calls.update.length = 0;
      people.calls.delete.length = 0;

      const second = await resolveOrgUnits({ tenantId: TENANT, pairs, session, repo, people });

      // Call counts on the injected surface, not merely "no error": a second create or a
      // no-op rename would both still resolve to the same tree.
      expect(people.calls.create).toEqual([]);
      expect(people.calls.update).toEqual([]);
      expect(people.calls.delete).toEqual([]);
      expect(functionUnits(people)).toEqual(afterFirst);
      expect([...second.entries()].sort()).toEqual([...first.entries()].sort());
      expect((await repo.listOrgUnitLinks(TENANT)).length).toBe(3);
      expect(await repo.listConflicts(TENANT, 'open')).toEqual([]);
    });
  });

  it('renames the linked unit instead of creating a second one', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createDirectoryRepo({ db });
      const people = createFakePeople(spine());
      const session = buildSystemSession(TENANT);

      await resolveOrgUnits({
        tenantId: TENANT,
        pairs: [{ division: null, department: 'Engineering' }],
        session,
        repo,
        people,
      });
      const unitId = functionUnits(people)[0]?.id as string;
      expect(unitId).toBeDefined();

      // (a) A human renamed the linked unit in Seta. Entra still says `Engineering`, and the
      //     sync owns the name of a linked unit, so it is renamed back — not duplicated.
      people.units.get(unitId)!.name = 'Eng Team';
      people.calls.create.length = 0;
      people.calls.update.length = 0;

      await resolveOrgUnits({
        tenantId: TENANT,
        pairs: [{ division: null, department: 'Engineering' }],
        session,
        repo,
        people,
      });

      expect(people.calls.create).toEqual([]);
      expect(people.calls.update).toEqual([
        { org_unit_id: unitId, patch: { name: 'Engineering' } },
      ]);
      expect(functionUnits(people).length).toBe(1);
      expect(people.units.get(unitId)?.name).toBe('Engineering');

      // (b) Entra changed the department's display form. Identity (the case-folded key) is
      //     unchanged, so the same linked unit is renamed rather than a second one created.
      people.calls.update.length = 0;
      await resolveOrgUnits({
        tenantId: TENANT,
        pairs: [{ division: null, department: 'ENGINEERING' }],
        session,
        repo,
        people,
      });

      expect(people.calls.create).toEqual([]);
      expect(people.calls.update).toEqual([
        { org_unit_id: unitId, patch: { name: 'ENGINEERING' } },
      ]);
      expect(functionUnits(people).length).toBe(1);
      expect((await repo.listOrgUnitLinks(TENANT)).length).toBe(1);
    });
  });

  it('re-parents a linked department that moved to another division', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createDirectoryRepo({ db });
      const people = createFakePeople(spine());
      const session = buildSystemSession(TENANT);

      await resolveOrgUnits({
        tenantId: TENANT,
        pairs: [{ division: 'Product Group', department: 'Engineering' }],
        session,
        repo,
        people,
      });
      const engineering = functionUnits(people).find((u) => u.name === 'Engineering');
      expect(engineering).toBeDefined();

      people.calls.create.length = 0;
      people.calls.update.length = 0;
      await resolveOrgUnits({
        tenantId: TENANT,
        pairs: [
          { division: 'Product Group', department: null },
          { division: 'Platform Group', department: 'Engineering' },
        ],
        session,
        repo,
        people,
      });

      const platform = functionUnits(people).find((u) => u.name === 'Platform Group');
      expect(platform).toBeDefined();
      expect(people.units.get(engineering!.id)?.parent_id).toBe(platform?.id);
      expect(people.calls.update).toEqual([
        { org_unit_id: engineering!.id, patch: { parent_id: platform!.id } },
      ]);
      // The department kept its identity: still one Engineering unit and one link row for it.
      expect(functionUnits(people).filter((u) => u.name === 'Engineering').length).toBe(1);
    });
  });

  it('raises spine_collision and creates nothing for Executive, Operation, Delivery and PMO', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createDirectoryRepo({ db });
      const people = createFakePeople(spine());
      const session = buildSystemSession(TENANT);
      const before = [...people.units.values()].map((u) => ({ ...u }));

      const map = await resolveOrgUnits({
        tenantId: TENANT,
        pairs: [
          { division: null, department: 'Delivery' },
          { division: null, department: 'executive' },
          { division: null, department: ' PMO ' },
          { division: 'Operation', department: null },
        ],
        session,
        repo,
        people,
      });

      expect(people.calls.create).toEqual([]);
      expect(people.calls.update).toEqual([]);
      expect(people.calls.delete).toEqual([]);
      expect(functionUnits(people)).toEqual([]);
      expect([...people.units.values()]).toEqual(before);
      expect(map.size).toBe(0);
      expect(await repo.listOrgUnitLinks(TENANT)).toEqual([]);

      const conflicts = await repo.listConflicts(TENANT, 'open');
      expect(conflicts.length).toBe(4);
      expect(new Set(conflicts.map((c) => c.kind))).toEqual(new Set(['spine_collision']));
      expect(new Set(conflicts.map((c) => c.subjectType))).toEqual(new Set(['org_unit']));
      expect(new Set(conflicts.map((c) => c.subjectId))).toEqual(
        new Set([DELIVERY, EXEC, PMO, OPERATION]),
      );
      const delivery = conflicts.find((c) => c.subjectId === DELIVERY);
      expect(delivery?.detail).toEqual({
        entra_name: 'Delivery',
        entra_kind: 'department',
        entra_key: orgKey(null, 'Delivery'),
        spine: { id: DELIVERY, name: 'Delivery', kind: 'delivery' },
      });
      const operation = conflicts.find((c) => c.subjectId === OPERATION)?.detail as
        | { entra_kind: string }
        | undefined;
      expect(operation?.entra_kind).toBe('division');
    });
  });

  it('never renames, re-parents or deletes a unit that has no link row', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createDirectoryRepo({ db });
      const manualId = '00000000-0000-4000-8000-0000000000b1';
      const manual: FakeUnit = {
        id: manualId,
        parent_id: EXEC,
        name: 'Engineering',
        kind: 'function',
        head_worker_id: null,
      };
      const people = createFakePeople([...spine(), manual]);
      const session = buildSystemSession(TENANT);
      const before = people.snapshot(manualId);

      // Run 1: an Entra department whose name matches the manual unit exactly. The manual unit is
      // not adopted — sync ownership is the link row, never a name match (design §4.2).
      await resolveOrgUnits({
        tenantId: TENANT,
        pairs: [
          { division: null, department: 'Engineering' },
          { division: null, department: 'Marketing' },
        ],
        session,
        repo,
        people,
      });
      expect(functionUnits(people).filter((u) => u.name === 'Engineering').length).toBe(2);

      // Run 2: Engineering vanished from Entra. Only the *linked* unit may be reaped.
      await resolveOrgUnits({
        tenantId: TENANT,
        pairs: [{ division: null, department: 'Marketing' }],
        session,
        repo,
        people,
      });

      expect(people.snapshot(manualId)).toEqual(before);
      expect(people.calls.update.filter((c) => c.org_unit_id === manualId)).toEqual([]);
      expect(people.calls.delete).not.toContain(manualId);
      // ...and the spine is equally untouchable.
      for (const id of [EXEC, OPERATION, DELIVERY, PMO]) {
        expect(people.calls.update.filter((c) => c.org_unit_id === id)).toEqual([]);
        expect(people.calls.delete).not.toContain(id);
      }
    });
  });

  it('deletes a vanished department whose unit is empty and drops its link row', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createDirectoryRepo({ db });
      const people = createFakePeople(spine());
      const session = buildSystemSession(TENANT);

      await resolveOrgUnits({
        tenantId: TENANT,
        pairs: [
          { division: null, department: 'Engineering' },
          { division: null, department: 'Marketing' },
        ],
        session,
        repo,
        people,
      });
      const engineering = functionUnits(people).find((u) => u.name === 'Engineering');
      expect(engineering).toBeDefined();

      await resolveOrgUnits({
        tenantId: TENANT,
        pairs: [{ division: null, department: 'Marketing' }],
        session,
        repo,
        people,
      });

      expect(people.calls.delete).toEqual([engineering!.id]);
      expect(people.units.has(engineering!.id)).toBe(false);
      const links = await repo.listOrgUnitLinks(TENANT);
      expect(links.length).toBe(1);
      expect(links[0]?.entraKey).toBe(orgKey(null, 'Marketing'));
      expect(await repo.listConflicts(TENANT, 'open')).toEqual([]);
    });
  });

  it('raises unit_delete_blocked and keeps the unit when a vanished department still has members', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const repo = createDirectoryRepo({ db });
      const people = createFakePeople(spine());
      const session = buildSystemSession(TENANT);

      await resolveOrgUnits({
        tenantId: TENANT,
        pairs: [
          { division: null, department: 'Engineering' },
          { division: null, department: 'Marketing' },
        ],
        session,
        repo,
        people,
      });
      const engineering = functionUnits(people).find((u) => u.name === 'Engineering');
      people.members.set(engineering!.id, ['22222222-2222-4222-8222-222222222222']);

      await resolveOrgUnits({
        tenantId: TENANT,
        pairs: [{ division: null, department: 'Marketing' }],
        session,
        repo,
        people,
      });

      expect(people.units.has(engineering!.id)).toBe(true);
      const links = await repo.listOrgUnitLinks(TENANT);
      expect(links.length).toBe(2);
      expect(links.some((l) => l.orgUnitId === engineering!.id)).toBe(true);

      const conflicts = await repo.listConflicts(TENANT, 'open');
      expect(conflicts.length).toBe(1);
      expect(conflicts[0]?.kind).toBe('unit_delete_blocked');
      expect(conflicts[0]?.subjectType).toBe('org_unit');
      expect(conflicts[0]?.subjectId).toBe(engineering!.id);
      expect(conflicts[0]?.entraOid).toBeNull();
      expect(conflicts[0]?.detail).toEqual({
        reason: 'has_members',
        entra_key: orgKey(null, 'Engineering'),
        unit_name: 'Engineering',
      });
    });
  });

  describe('resolveHeads', () => {
    const MGR_A_OID = '55555555-5555-4555-8555-555555555551';
    const MGR_B_OID = '55555555-5555-4555-8555-555555555552';
    const UNKNOWN_OID = '55555555-5555-4555-8555-5555555555ff';
    const MGR_A_PERSON = '66666666-6666-4666-8666-666666666661';
    const MGR_B_PERSON = '66666666-6666-4666-8666-666666666662';
    const P1 = '77777777-7777-4777-8777-777777777771';
    const P2 = '77777777-7777-4777-8777-777777777772';
    const P3 = '77777777-7777-4777-8777-777777777773';

    async function seedUnits(
      repo: ReturnType<typeof createDirectoryRepo>,
      people: FakePeople,
      departments: string[],
    ): Promise<Map<string, string>> {
      const map = await resolveOrgUnits({
        tenantId: TENANT,
        pairs: departments.map((d) => ({ division: null, department: d })),
        session: buildSystemSession(TENANT),
        repo,
        people,
      });
      people.calls.create.length = 0;
      people.calls.update.length = 0;
      return map;
    }

    it('sets head_worker_id when every member reports to the same manager', async () => {
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });
        const manualId = '00000000-0000-4000-8000-0000000000b2';
        const people = createFakePeople([
          ...spine(),
          {
            id: manualId,
            parent_id: EXEC,
            name: 'Curated',
            kind: 'function',
            head_worker_id: null,
          },
        ]);
        const session = buildSystemSession(TENANT);
        const map = await seedUnits(repo, people, ['Engineering']);
        const eng = map.get(orgKey(null, 'Engineering')) as string;

        await repo.upsertPersonLink({
          tenantId: TENANT,
          personId: MGR_A_PERSON,
          entraOid: MGR_A_OID,
        });

        const result = await resolveHeads({
          tenantId: TENANT,
          members: [
            { person_id: P1, org_unit_id: eng, manager_oid: MGR_A_OID },
            { person_id: P2, org_unit_id: eng, manager_oid: MGR_A_OID },
            // An unlinked, curated unit: resolveHeads must not touch it (design §4.2).
            { person_id: P3, org_unit_id: manualId, manager_oid: MGR_A_OID },
          ],
          session,
          repo,
          people,
        });

        expect(result).toEqual({ headsSet: 1, ambiguous: 0 });
        expect(people.units.get(eng)?.head_worker_id).toBe(MGR_A_PERSON);
        expect(people.units.get(manualId)?.head_worker_id).toBeNull();
        expect(people.calls.update).toEqual([
          { org_unit_id: eng, patch: { head_worker_id: MGR_A_PERSON } },
        ]);
        expect(await repo.listConflicts(TENANT, 'open')).toEqual([]);

        // Idempotent: a second identical run writes nothing.
        people.calls.update.length = 0;
        const again = await resolveHeads({
          tenantId: TENANT,
          members: [
            { person_id: P1, org_unit_id: eng, manager_oid: MGR_A_OID },
            { person_id: P2, org_unit_id: eng, manager_oid: MGR_A_OID },
          ],
          session,
          repo,
          people,
        });
        expect(again).toEqual({ headsSet: 0, ambiguous: 0 });
        expect(people.calls.update).toEqual([]);
      });
    });

    it('picks the modal manager and raises manager_ambiguous with every candidate and count', async () => {
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });
        const people = createFakePeople(spine());
        const session = buildSystemSession(TENANT);
        const map = await seedUnits(repo, people, ['Engineering']);
        const eng = map.get(orgKey(null, 'Engineering')) as string;

        await repo.upsertPersonLink({
          tenantId: TENANT,
          personId: MGR_A_PERSON,
          entraOid: MGR_A_OID,
        });
        await repo.upsertPersonLink({
          tenantId: TENANT,
          personId: MGR_B_PERSON,
          entraOid: MGR_B_OID,
        });

        const result = await resolveHeads({
          tenantId: TENANT,
          members: [
            { person_id: P1, org_unit_id: eng, manager_oid: MGR_A_OID },
            { person_id: P2, org_unit_id: eng, manager_oid: MGR_A_OID },
            { person_id: P3, org_unit_id: eng, manager_oid: MGR_B_OID },
          ],
          session,
          repo,
          people,
        });

        expect(result).toEqual({ headsSet: 1, ambiguous: 1 });
        expect(people.units.get(eng)?.head_worker_id).toBe(MGR_A_PERSON);

        const conflicts = await repo.listConflicts(TENANT, 'open');
        expect(conflicts.length).toBe(1);
        expect(conflicts[0]?.kind).toBe('manager_ambiguous');
        expect(conflicts[0]?.subjectType).toBe('org_unit');
        expect(conflicts[0]?.subjectId).toBe(eng);
        expect(conflicts[0]?.entraOid).toBeNull();
        // Every candidate, with its report count — that is the whole point of the queue entry.
        expect(conflicts[0]?.detail).toEqual({
          unit_name: 'Engineering',
          chosen: { manager_oid: MGR_A_OID, person_id: MGR_A_PERSON },
          candidates: [
            { manager_oid: MGR_A_OID, person_id: MGR_A_PERSON, report_count: 2 },
            { manager_oid: MGR_B_OID, person_id: MGR_B_PERSON, report_count: 1 },
          ],
        });
      });
    });

    it('skips a manager who is not a live m365_person_links row rather than crashing', async () => {
      await withIntegrationsTestDb(async ({ db }) => {
        const repo = createDirectoryRepo({ db });
        const people = createFakePeople(spine());
        const session = buildSystemSession(TENANT);
        const map = await seedUnits(repo, people, ['Engineering', 'Marketing', 'Support']);
        const eng = map.get(orgKey(null, 'Engineering')) as string;
        const mkt = map.get(orgKey(null, 'Marketing')) as string;
        const sup = map.get(orgKey(null, 'Support')) as string;

        await repo.upsertPersonLink({
          tenantId: TENANT,
          personId: MGR_A_PERSON,
          entraOid: MGR_A_OID,
        });
        // A manager whose Entra user was removed: `findPersonLinkByOid` deliberately still
        // returns the row (so a reappearing OID revives rather than duplicates), so the caller
        // is the one that has to honour `removed_at`.
        await repo.upsertPersonLink({
          tenantId: TENANT,
          personId: MGR_B_PERSON,
          entraOid: MGR_B_OID,
        });
        await repo.markRemoved(TENANT, MGR_B_OID);
        expect((await repo.findPersonLinkByOid(TENANT, MGR_B_OID))?.removedAt).not.toBeNull();

        const result = await resolveHeads({
          tenantId: TENANT,
          members: [
            // Engineering: only an unsynced manager -> nothing to set, nothing to decide.
            { person_id: P1, org_unit_id: eng, manager_oid: UNKNOWN_OID },
            { person_id: P2, org_unit_id: eng, manager_oid: UNKNOWN_OID },
            // Marketing: one unsynced manager plus a live one -> the live one wins outright.
            { person_id: P3, org_unit_id: mkt, manager_oid: UNKNOWN_OID },
            { person_id: MGR_B_PERSON, org_unit_id: mkt, manager_oid: MGR_A_OID },
            // Support: the only candidate's link is soft-removed -> treated as absent.
            { person_id: MGR_A_PERSON, org_unit_id: sup, manager_oid: MGR_B_OID },
            // A member with no manager at all must not blow up the grouping.
            { person_id: P1, org_unit_id: sup, manager_oid: null },
          ],
          session,
          repo,
          people,
        });

        expect(result).toEqual({ headsSet: 1, ambiguous: 0 });
        expect(people.units.get(eng)?.head_worker_id).toBeNull();
        expect(people.units.get(mkt)?.head_worker_id).toBe(MGR_A_PERSON);
        expect(people.units.get(sup)?.head_worker_id).toBeNull();
        expect(people.calls.update).toEqual([
          { org_unit_id: mkt, patch: { head_worker_id: MGR_A_PERSON } },
        ]);
        expect(await repo.listConflicts(TENANT, 'open')).toEqual([]);
      });
    });
  });
});

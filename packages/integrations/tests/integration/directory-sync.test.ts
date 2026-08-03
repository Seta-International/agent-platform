import type { Client } from '@microsoft/microsoft-graph-client';
import { resetCoreDb } from '@seta/core/testing';
import { describe, expect, it } from 'vitest';
import { createDirectoryGraph } from '../../src/backend/m365/directory/graph.ts';
import { createDirectoryRepo, type DirectoryRepo } from '../../src/backend/m365/directory/repo.ts';
import {
  DirectoryPhotoInvariantError,
  type DirectoryPullResult,
  type RunDirectoryPullDeps,
  runDirectoryPull,
} from '../../src/backend/m365/directory/sync.ts';
import type { GraphDirectoryUser } from '../../src/backend/m365/directory/types.ts';
import { withIntegrationsTestDb } from '../helpers/test-db.ts';
import {
  createFakePeople,
  createPhotoRecorder,
  type FakePeople,
  functionUnits,
  type GraphStubConfig,
  graphError,
  makeGraphClientStub,
  OPERATION,
  seedTenantConfig,
  spine,
  TENANT,
} from './_directory-sync-helpers.ts';

const ALICE = '33333333-3333-4333-8333-333333333331';
const BOB = '33333333-3333-4333-8333-333333333332';
const CARA = '33333333-3333-4333-8333-333333333333';
const GUEST = '33333333-3333-4333-8333-33333333333f';
const DELTA_1 = 'https://graph.microsoft.com/v1.0/users/delta?$deltatoken=TOKEN1';
const DELTA_2 = 'https://graph.microsoft.com/v1.0/users/delta?$deltatoken=TOKEN2';

const memberOid = (n: number): string =>
  `44444444-4444-4444-8444-4444444444${String(n).padStart(2, '0')}`;

interface WireUser {
  id: string;
  userPrincipalName?: string;
  mail?: string;
  displayName?: string;
  jobTitle?: string;
  department?: string;
  employeeOrgData?: { division?: string | null };
  accountEnabled?: boolean;
  userType?: string;
  'manager@delta'?: Array<{ id: string }>;
  '@removed'?: { reason: string };
}

function user(id: string, over: Partial<WireUser> = {}): WireUser {
  // Four hex chars, so every oid in this file maps to its own work_email.
  const name = id.slice(-4);
  return {
    id,
    userPrincipalName: `u${name}@contoso.com`,
    mail: `u${name}@contoso.com`,
    displayName: `User ${name}`,
    accountEnabled: true,
    userType: 'Member',
    ...over,
  };
}

function page(users: WireUser[], deltaLink = DELTA_1): unknown {
  return { value: users, '@odata.deltaLink': deltaLink };
}

interface Harness {
  repo: DirectoryRepo;
  people: FakePeople;
  photos: ReturnType<typeof createPhotoRecorder>;
  graphCalls: string[];
  run(input?: { full?: boolean }): Promise<DirectoryPullResult>;
  pool: import('pg').Pool;
  configRow(): Promise<{
    directory_delta_link: string | null;
    directory_last_status: string | null;
    directory_last_error: string | null;
    directory_synced_at: Date | null;
  }>;
}

/**
 * One tenant, one seeded config row, a real `createDirectoryGraph` over a stubbed transport, and
 * the injected `people` surface. Everything the sync itself owns — links, conflicts, the cursor,
 * `core.events` — is real Postgres.
 */
async function withSync(
  config: GraphStubConfig,
  fn: (h: Harness) => Promise<void>,
  overrides: Partial<RunDirectoryPullDeps> = {},
): Promise<void> {
  await withIntegrationsTestDb(async ({ db, pool }) => {
    try {
      await seedTenantConfig(db, pool);
      const repo = createDirectoryRepo({ db });
      const people = createFakePeople(spine());
      const photos = createPhotoRecorder();
      const client = makeGraphClientStub(config);
      const graph = createDirectoryGraph(client as unknown as Client);

      await fn({
        repo,
        people,
        photos,
        graphCalls: client.calls,
        pool,
        run: (input = {}) =>
          runDirectoryPull(
            { tenant_id: TENANT, ...input },
            { repo, graph, people, storage: photos, ...overrides },
          ),
        async configRow() {
          const { rows } = await pool.query(
            `SELECT directory_delta_link, directory_last_status, directory_last_error,
                    directory_synced_at
               FROM integrations.m365_tenant_config WHERE tenant_id = $1`,
            [TENANT],
          );
          return rows[0];
        },
      });
    } finally {
      resetCoreDb();
    }
  });
}

describe('runDirectoryPull', () => {
  it('creates persons and units and stores the cursor on the first page', async () => {
    await withSync(
      {
        pages: [
          {
            value: [user(ALICE, { department: 'Engineering', jobTitle: 'Engineer' })],
            '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users/delta?$skiptoken=PAGE2',
          },
          page([user(BOB, { department: 'Marketing' })]),
        ],
      },
      async (h) => {
        const result = await h.run();

        expect(result.status).toBe('ok');
        expect(result.full).toBe(true);
        expect(result.counters.usersSeen).toBe(2);
        expect(result.counters.usersCreated).toBe(2);
        expect(result.counters.orgUnitsCreated).toBe(2);

        // Units created under the spine's Operation node, one per department.
        const units = functionUnits(h.people);
        expect(units.map((u) => u.name).sort()).toEqual(['Engineering', 'Marketing']);
        expect(units.every((u) => u.parent_id === OPERATION)).toBe(true);

        // Every person carried a resolved org_unit_id into the write door.
        const batch = h.people.calls.sync[0] ?? [];
        expect(batch.length).toBe(2);
        const engineering = units.find((u) => u.name === 'Engineering');
        expect(batch.find((p) => p.entra_oid === ALICE)?.org_unit_id).toBe(engineering?.id);

        // Link rows for both, and the cursor is the LAST page's deltaLink.
        const links = await h.repo.listPersonLinks(TENANT);
        expect(links.map((l) => l.entraOid).sort()).toEqual([ALICE, BOB].sort());
        expect(links.every((l) => l.removedAt === null)).toBe(true);

        const row = await h.configRow();
        expect(row.directory_delta_link).toBe(DELTA_1);
        expect(row.directory_last_status).toBe('ok');
        expect(row.directory_last_error).toBeNull();
        expect(row.directory_synced_at).not.toBeNull();

        // The summary event carries the counters.
        const { rows } = await h.pool.query(
          `SELECT payload FROM core.events
            WHERE event_type = 'integrations.m365.directory.synced' AND tenant_id = $1`,
          [TENANT],
        );
        expect(rows.length).toBe(1);
        expect(rows[0].payload.users_created).toBe(2);
      },
    );
  });

  it('replaying the identical page changes nothing and reports every person unchanged', async () => {
    const users = [
      user(ALICE, { department: 'Engineering' }),
      user(BOB, { department: 'Marketing' }),
    ];
    await withSync({ pages: [page(users), page(users)] }, async (h) => {
      await h.run();
      const unitsAfterFirst = functionUnits(h.people).map((u) => ({ ...u }));
      h.people.calls.create.length = 0;
      h.people.calls.update.length = 0;
      h.people.calls.delete.length = 0;

      // A replay is a FULL run again (cursor is set, so pass full: true to re-read the window).
      const second = await h.run({ full: true });

      expect(second.counters.usersUnchanged).toBe(2);
      expect(second.counters.usersCreated).toBe(0);
      expect(second.counters.usersUpdated).toBe(0);
      expect(h.people.calls.create).toEqual([]);
      expect(h.people.calls.update).toEqual([]);
      expect(h.people.calls.delete).toEqual([]);
      expect(functionUnits(h.people)).toEqual(unitsAfterFirst);
      expect((await h.repo.listOrgUnitLinks(TENANT)).length).toBe(2);
      expect(await h.repo.listConflicts(TENANT, 'open')).toEqual([]);
    });
  });

  it('re-points a person whose department changed without duplicating the unit', async () => {
    await withSync(
      {
        pages: [
          page([
            user(ALICE, { department: 'Engineering' }),
            user(BOB, { department: 'Marketing' }),
          ]),
          // An incremental page carries ONLY the changed user.
          page([user(ALICE, { department: 'Marketing' })], DELTA_2),
        ],
      },
      async (h) => {
        await h.run();
        const marketing = functionUnits(h.people).find((u) => u.name === 'Marketing');
        const unitCountBefore = functionUnits(h.people).length;

        const second = await h.run();

        expect(second.full).toBe(false);
        expect(second.counters.usersUpdated).toBe(1);
        const batch = h.people.calls.sync[1] ?? [];
        expect(batch.length).toBe(1);
        expect(batch[0]?.org_unit_id).toBe(marketing?.id);
        expect(functionUnits(h.people).length).toBe(unitCountBefore);
        expect((await h.repo.listOrgUnitLinks(TENANT)).length).toBe(2);

        // Engineering is absent from the delta page but MUST survive: reap is false on a delta run.
        expect(h.people.calls.delete).toEqual([]);
        expect(functionUnits(h.people).some((u) => u.name === 'Engineering')).toBe(true);
        expect((await h.configRow()).directory_delta_link).toBe(DELTA_2);
      },
    );
  });

  it('updates the unit head when the manager changes', async () => {
    await withSync(
      {
        pages: [
          page([
            user(ALICE, { department: 'Engineering', 'manager@delta': [{ id: BOB }] }),
            user(BOB, { department: 'Engineering' }),
          ]),
          // Alice now reports to Cara, who arrives on the same page. Bob keeps no reports at all,
          // so Cara is the only candidate with a vote — the head moves, unambiguously.
          page(
            [
              user(ALICE, { department: 'Engineering', 'manager@delta': [{ id: CARA }] }),
              user(CARA, { department: 'Engineering' }),
            ],
            DELTA_2,
          ),
        ],
      },
      async (h) => {
        const first = await h.run();
        const eng = functionUnits(h.people).find((u) => u.name === 'Engineering');
        const bobPerson = (await h.repo.findPersonLinkByOid(TENANT, BOB))?.personId;
        expect(first.counters.headsSet).toBe(1);
        expect(h.people.units.get(eng?.id as string)?.head_worker_id).toBe(bobPerson);

        const second = await h.run();
        const caraPerson = (await h.repo.findPersonLinkByOid(TENANT, CARA))?.personId;
        expect(second.counters.headsSet).toBe(1);
        expect(h.people.units.get(eng?.id as string)?.head_worker_id).toBe(caraPerson);
        expect(await h.repo.listConflicts(TENANT, 'open')).toEqual([]);
      },
    );
  });

  it('filters guests and unverified-domain users and never persists them', async () => {
    await withSync(
      {
        domains: ['contoso.com'],
        pages: [
          page([
            user(ALICE, { department: 'Engineering' }),
            { ...user(GUEST), userType: 'Guest' },
            { ...user(BOB), mail: 'bob@other.example', userPrincipalName: 'bob@other.example' },
          ]),
        ],
      },
      async (h) => {
        const result = await h.run();

        expect(result.counters.usersSeen).toBe(3);
        expect(result.counters.usersFiltered).toBe(2);
        expect(result.counters.usersCreated).toBe(1);

        const batch = h.people.calls.sync[0] ?? [];
        expect(batch.map((p) => p.entra_oid)).toEqual([ALICE]);
        const links = await h.repo.listPersonLinks(TENANT);
        expect(links.map((l) => l.entraOid)).toEqual([ALICE]);

        // Filtered users are never even asked about — no per-user Graph call for them.
        expect(h.graphCalls.some((c) => c.includes(GUEST))).toBe(false);
        expect(h.graphCalls.some((c) => c.includes(BOB))).toBe(false);
      },
    );
  });

  it('marks a @removed user removed, raises user_removed, and leaves the person untouched', async () => {
    await withSync(
      {
        pages: [
          page([user(ALICE, { department: 'Engineering' })]),
          page([{ id: ALICE, '@removed': { reason: 'deleted' } }], DELTA_2),
        ],
      },
      async (h) => {
        await h.run();
        const personId = (await h.repo.findPersonLinkByOid(TENANT, ALICE))?.personId;

        const second = await h.run();

        expect(second.status).toBe('ok');
        expect(second.counters.usersRemoved).toBe(1);
        const link = await h.repo.findPersonLinkByOid(TENANT, ALICE);
        expect(link?.removedAt).not.toBeNull();
        // The person itself is never written on a removal (design §8.3 — offboarding is human).
        expect(h.people.calls.sync[1]).toEqual([]);

        const conflicts = await h.repo.listConflicts(TENANT, 'open');
        expect(conflicts.length).toBe(1);
        expect(conflicts[0]?.kind).toBe('user_removed');
        expect(conflicts[0]?.subjectType).toBe('person');
        expect(conflicts[0]?.subjectId).toBe(personId);
        expect(conflicts[0]?.entraOid).toBe(ALICE);
        // `user_removed` offers `offboard`, which ends someone's employment. The admin screen must
        // be able to name the person from the conflict alone: an M365 admin does not necessarily
        // hold `people.worker.read`, so making the screen look the name up would degrade the one
        // decision with real consequences into a bare uuid.
        expect(conflicts[0]?.detail).toMatchObject({
          full_name: `Person ${(personId as string).slice(0, 8)}`,
        });

        // Replaying the removal is a no-op: the link is already removed.
        expect((await h.repo.listPersonLinks(TENANT)).length).toBe(1);
      },
    );
  });

  // A full run walks /users/delta with NO token, so Graph has no baseline and `@removed` is
  // always empty — an initial delta says who exists, never who left. The cursor is then
  // overwritten, so a removal that arrived since the last run would be discarded unread. The
  // admin "Sync now" button always posts full:true, so this is the common path, not an edge case.
  it('infers removals by absence on a full run, where Graph reports no @removed at all', async () => {
    await withSync(
      {
        pages: [
          page([user(ALICE, { department: 'Engineering' }), user(BOB, { department: 'Sales' })]),
          // A full census: Bob is simply gone. No '@removed' entry anywhere.
          page([user(ALICE, { department: 'Engineering' })], DELTA_2),
        ],
      },
      async (h) => {
        await h.run();
        const bobPerson = (await h.repo.findPersonLinkByOid(TENANT, BOB))?.personId;
        expect(bobPerson).toBeTruthy();

        const second = await h.run({ full: true });

        expect(second.status).toBe('ok');
        expect(second.counters.usersRemoved).toBe(1);
        expect((await h.repo.findPersonLinkByOid(TENANT, BOB))?.removedAt).not.toBeNull();
        // Alice was in the census, so she is untouched.
        expect((await h.repo.findPersonLinkByOid(TENANT, ALICE))?.removedAt).toBeNull();

        const conflicts = await h.repo.listConflicts(TENANT, 'open');
        const removedConflict = conflicts.find((c) => c.kind === 'user_removed');
        expect(removedConflict?.entraOid).toBe(BOB);
        expect(removedConflict?.subjectId).toBe(bobPerson);
      },
    );
  });

  // The inference above is only as trustworthy as the census. An empty walk is a failed or
  // permission-starved fetch, not a company with no employees — inferring from it would offboard
  // everyone at once.
  it('infers nothing from an empty full-run census, however many links are stored', async () => {
    await withSync(
      {
        pages: [
          page([user(ALICE, { department: 'Engineering' }), user(BOB, { department: 'Sales' })]),
          page([], DELTA_2),
        ],
      },
      async (h) => {
        await h.run();

        const second = await h.run({ full: true });

        expect(second.counters.usersRemoved).toBe(0);
        expect((await h.repo.findPersonLinkByOid(TENANT, ALICE))?.removedAt).toBeNull();
        expect((await h.repo.findPersonLinkByOid(TENANT, BOB))?.removedAt).toBeNull();
        expect(await h.repo.listConflicts(TENANT, 'open')).toEqual([]);
      },
    );
  });

  // `markRemoved` commits on its own and `removedAt !== null` is the only re-entry key, so if the
  // run dies between marking the link and raising the conflict, the retry skips the row and the
  // conflict is never raised — a departed employee stays active with nothing to prompt an admin.
  // Raising first makes the crash window harmless.
  it('still has the conflict to act on when the run dies immediately after raising it', async () => {
    let failNext = true;
    await withIntegrationsTestDb(async ({ db, pool }) => {
      try {
        await seedTenantConfig(db, pool);
        const real = createDirectoryRepo({ db });
        const repo: DirectoryRepo = {
          ...real,
          async markRemoved(tenantId, oid) {
            if (failNext) {
              failNext = false;
              throw new Error('killed between raiseConflict and markRemoved');
            }
            return real.markRemoved(tenantId, oid);
          },
        };
        const people = createFakePeople(spine());
        const photos = createPhotoRecorder();
        const client = makeGraphClientStub({
          pages: [
            page([user(ALICE, { department: 'Engineering' })]),
            page([{ id: ALICE, '@removed': { reason: 'deleted' } }], DELTA_2),
            page([{ id: ALICE, '@removed': { reason: 'deleted' } }], DELTA_2),
          ],
        });
        const graph = createDirectoryGraph(client as unknown as Client);
        const run = () =>
          runDirectoryPull({ tenant_id: TENANT }, { repo, graph, people, storage: photos });

        await run();
        await expect(run()).rejects.toThrow(/killed between/);

        // The conflict survived the crash even though the link was never marked.
        const afterCrash = await repo.listConflicts(TENANT, 'open');
        expect(afterCrash.map((c) => c.kind)).toContain('user_removed');
        expect((await repo.findPersonLinkByOid(TENANT, ALICE))?.removedAt).toBeNull();

        // The retry re-reads the same window and completes, without duplicating the conflict.
        const retry = await run();
        expect(retry.counters.usersRemoved).toBe(1);
        expect((await repo.findPersonLinkByOid(TENANT, ALICE))?.removedAt).not.toBeNull();
        expect(
          (await repo.listConflicts(TENANT, 'open')).filter((c) => c.kind === 'user_removed'),
        ).toHaveLength(1);
      } finally {
        resetCoreDb();
      }
    });
  });

  it('leaves mailbox-derived fields unset and stays green when mailboxSettings 403s', async () => {
    await withSync(
      { pages: [page([user(ALICE, { department: 'Engineering' })])], mailbox: { [ALICE]: 403 } },
      async (h) => {
        const result = await h.run();

        expect(result.status).toBe('ok');
        expect(result.counters.mailboxForbidden).toBe(1);
        const dto = h.people.calls.sync[0]?.[0];
        // `auto_replies_enabled === null` is the flag `planDirectoryUpdate` keys the whole mailbox
        // block off — with it null, timezone/work_start/work_end/ooo are never written.
        expect(dto?.auto_replies_enabled).toBeNull();
        expect(dto?.timezone).toBeNull();
        expect(dto?.work_start).toBeNull();
        expect(dto?.work_end).toBeNull();
        expect((await h.configRow()).directory_last_status).toBe('ok');
      },
    );
  });

  it('nulls photo_storage_key and stays green when the photo 404s', async () => {
    await withSync({ pages: [page([user(ALICE, { department: 'Engineering' })])] }, async (h) => {
      const result = await h.run();

      expect(result.status).toBe('ok');
      expect(result.counters.photosMissing).toBe(1);
      expect(h.people.calls.sync[0]?.[0]?.photo_storage_key).toBeNull();
      expect(h.photos.puts).toEqual([]);
      expect((await h.configRow()).directory_last_status).toBe('ok');
    });
  });

  it('uploads a changed photo, then refetches nothing while the media etag is unchanged', async () => {
    const users = [user(ALICE, { department: 'Engineering' })];
    await withSync(
      {
        pages: [page(users), page(users)],
        photo: { [ALICE]: { etag: 'ETAG-1', contentType: 'image/png', bytes: [7, 7, 7, 7] } },
      },
      async (h) => {
        const first = await h.run();

        const key = `tenants/${TENANT}/people-photo/${ALICE}/profile`;
        expect(first.counters.photosStored).toBe(1);
        expect(h.photos.puts).toEqual([
          { bucket: 'test-bucket', key, contentType: 'image/png', bytes: 4 },
        ]);
        expect(h.people.calls.sync[0]?.[0]?.photo_storage_key).toBe(key);
        expect((await h.repo.findPersonLinkByOid(TENANT, ALICE))?.photoMediaEtag).toBe('ETAG-1');

        h.graphCalls.length = 0;
        const second = await h.run({ full: true });

        // The bytes are never refetched...
        expect(h.graphCalls.some((c) => c.includes('$value'))).toBe(false);
        expect(h.photos.puts.length).toBe(1);
        expect(second.counters.photosStored).toBe(0);
        // ...and the unchanged photo keeps its key. A null here erases every photo in the company.
        expect(h.people.calls.sync[1]?.[0]?.photo_storage_key).toBe(key);
        expect((await h.repo.findPersonLinkByOid(TENANT, ALICE))?.photoMediaEtag).toBe('ETAG-1');
      },
    );
  });

  it('records the failure and leaves the cursor untouched when Graph throws', async () => {
    await withSync(
      {
        pages: [
          page([user(ALICE, { department: 'Engineering' })]),
          graphError(500, 'graph exploded'),
        ],
      },
      async (h) => {
        await h.run();
        expect((await h.configRow()).directory_delta_link).toBe(DELTA_1);

        // Rethrown so graphile-worker retries the window rather than silently skipping it.
        await expect(h.run()).rejects.toThrow('graph exploded');

        const row = await h.configRow();
        expect(row.directory_last_status).toBe('error');
        expect(row.directory_last_error).toContain('graph exploded');
        // The cursor still points at the window that failed — the next run re-reads it.
        expect(row.directory_delta_link).toBe(DELTA_1);
      },
    );
  });

  it('votes for the unit head over the stored census, not over the delta page', async () => {
    // 9 of Engineering report to Alice, 1 (Bob) reports to Cara. A delta page carrying only Bob
    // would make Cara unanimous and silently hand her the unit — and `head_worker_id` is an RBAC
    // predicate (`reportsSubtreeSql`), so that is a scope escalation, not a cosmetic wobble.
    const reports = Array.from({ length: 9 }, (_, i) => memberOid(i + 1));
    await withSync(
      {
        pages: [
          page([
            user(ALICE, { department: 'Leadership' }),
            user(CARA, { department: 'Leadership' }),
            ...reports.map((oid) =>
              user(oid, { department: 'Engineering', 'manager@delta': [{ id: ALICE }] }),
            ),
            user(BOB, { department: 'Engineering', 'manager@delta': [{ id: CARA }] }),
          ]),
          page(
            [user(BOB, { department: 'Engineering', 'manager@delta': [{ id: CARA }] })],
            DELTA_2,
          ),
        ],
      },
      async (h) => {
        await h.run();
        const eng = functionUnits(h.people).find((u) => u.name === 'Engineering');
        const alicePerson = (await h.repo.findPersonLinkByOid(TENANT, ALICE))?.personId;
        expect(h.people.units.get(eng?.id as string)?.head_worker_id).toBe(alicePerson);

        const second = await h.run();

        expect(second.full).toBe(false);
        expect(h.people.units.get(eng?.id as string)?.head_worker_id).toBe(alicePerson);
        expect(second.counters.headsSet).toBe(0);
      },
    );
  });

  it('reaps a vanished department on a full run but never on a delta run', async () => {
    const initial = [
      user(ALICE, { department: 'Engineering' }),
      user(BOB, { department: 'Sales' }),
    ];
    await withSync(
      {
        pages: [
          page(initial),
          // Delta: Alice moved to Sales. Engineering is unmentioned, not gone.
          page([user(ALICE, { department: 'Sales' })], DELTA_2),
          // Full census: Engineering is genuinely absent from the whole directory.
          page([user(ALICE, { department: 'Sales' }), user(BOB, { department: 'Sales' })], DELTA_2),
        ],
      },
      async (h) => {
        await h.run();
        const engineering = functionUnits(h.people).find((u) => u.name === 'Engineering');
        expect(engineering).toBeDefined();

        await h.run();
        expect(h.people.calls.delete).toEqual([]);
        expect(h.people.units.has(engineering?.id as string)).toBe(true);

        await h.run({ full: true });
        expect(h.people.calls.delete).toEqual([engineering?.id]);
        expect(h.people.units.has(engineering?.id as string)).toBe(false);
      },
    );
  });

  it('refuses to proceed when an unchanged photo has no key to fall back on', async () => {
    // `photo()` can only answer `unchanged` when it was given a non-null etag, and the key is
    // derived from that same etag — so this pairing is unreachable through the real graph. Pinned
    // anyway: if it ever becomes reachable, the alternative is erasing the photo silently.
    const lyingGraph = {
      async verifiedDomains() {
        return new Set(['contoso.com']);
      },
      async walkUsers() {
        return {
          users: [user(ALICE, { department: 'Engineering' }) as GraphDirectoryUser],
          removed: [],
          deltaLink: DELTA_1,
        };
      },
      async mailboxSettings() {
        return null;
      },
      async photo() {
        return { kind: 'unchanged' as const };
      },
    };

    await withSync(
      { pages: [] },
      async (h) => {
        await expect(h.run()).rejects.toThrow(DirectoryPhotoInvariantError);
        // The failure is still recorded, and no cursor was written.
        const row = await h.configRow();
        expect(row.directory_last_status).toBe('error');
        expect(row.directory_delta_link).toBeNull();
      },
      { graph: lyingGraph },
    );
  });

  it('hands the write door the bound person id once a link row exists', async () => {
    const alice = (): unknown => page([user(ALICE, { department: 'Engineering' })]);
    await withSync({ pages: [alice(), alice()] }, async (h) => {
      // First sight: nothing binds this oid yet, so the write door has to match on the email.
      await h.run();
      expect(h.people.calls.sync[0]?.[0]?.linked_person_id).toBeNull();

      const [link] = await h.repo.listPersonLinks(TENANT);
      expect(link?.entraOid).toBe(ALICE);

      // From now on the link IS the identity — the email is just an attribute it carries.
      await h.run({ full: true });
      expect(h.people.calls.sync[1]?.[0]?.linked_person_id).toBe(link?.personId);
    });
  });

  it('still binds a soft-removed link, so a reappearing user revives rather than duplicating', async () => {
    const alice = (): unknown => page([user(ALICE, { department: 'Engineering' })]);
    await withSync({ pages: [alice(), alice()] }, async (h) => {
      await h.run();
      const [link] = await h.repo.listPersonLinks(TENANT);
      await h.repo.markRemoved(TENANT, ALICE);

      await h.run({ full: true });
      expect(h.people.calls.sync[1]?.[0]?.linked_person_id).toBe(link?.personId);
    });
  });
});

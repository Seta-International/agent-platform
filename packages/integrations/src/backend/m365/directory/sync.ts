import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import type { DirectoryPerson } from '@seta/people';
import { buildTenantKey, putObject } from '@seta/shared-storage';
import { M365NotConfiguredError } from '../auth.ts';
import { buildSystemSession } from '../system-session.ts';
import { isSyncableUser } from './filter.ts';
import type { DirectoryGraph } from './graph.ts';
import { mapGraphUser } from './mapper.ts';
import {
  directoryMailboxForbiddenCounter,
  directoryManagerAmbiguousCounter,
  directoryOrgUnitCreatedCounter,
  directoryOrgUnitRenamedCounter,
  directoryPhotoMissingCounter,
  directoryPullErrorCounter,
  directoryPullSuccessCounter,
  directoryPullThrottledCounter,
  directoryUsersCreatedCounter,
  directoryUsersFilteredCounter,
  directoryUsersSeenCounter,
  directoryUsersUpdatedCounter,
  withDirectorySpan,
} from './observability.ts';
import {
  type DirectoryMember,
  type DirectoryOrgPair,
  orgKey,
  type PeopleOrgSurface,
  resolveHeads,
  resolveOrgUnits,
} from './org-tree.ts';
import type { DirectoryRepo, PersonLinkRow } from './repo.ts';
import type { PhotoOutcome } from './types.ts';

/**
 * The `@seta/people` surface the sync needs, injected for the same reason `PeopleOrgSurface` is:
 * `integrations` may never touch the `people` schema. `directory/people-surface.ts` adapts the
 * real module onto this interface.
 */
export interface PeopleDirectorySurface extends PeopleOrgSurface {
  syncDirectoryPeople(input: {
    people: ReadonlyArray<DirectoryPerson>;
    session: SessionScope;
  }): Promise<{ results: import('@seta/people').DirectorySyncOutcome[] }>;
}

/** Where profile photos land. Injected so tests never reach S3; defaults to the real bucket. */
export interface DirectoryPhotoStorage {
  bucket: string;
  put(input: { bucket: string; key: string; body: Uint8Array; contentType: string }): Promise<void>;
}

export interface RunDirectoryPullInput {
  tenant_id: string;
  /** Ignore the stored cursor and re-read the whole directory. Also the only mode that reaps. */
  full?: boolean;
}

export interface RunDirectoryPullDeps {
  repo: DirectoryRepo;
  graph: DirectoryGraph;
  people: PeopleDirectorySurface;
  /** Defaults to `buildSystemSession(tenant_id)`, which carries every permission §8.1 requires. */
  session?: SessionScope;
  storage?: DirectoryPhotoStorage;
}

/** Design §11. Mirrored onto the OTel counters and into the summary event's payload. */
export interface DirectoryPullCounters {
  usersSeen: number;
  usersFiltered: number;
  usersCreated: number;
  usersUpdated: number;
  usersUnchanged: number;
  usersCollided: number;
  usersRemoved: number;
  orgUnitsCreated: number;
  orgUnitsRenamed: number;
  headsSet: number;
  managerAmbiguous: number;
  photosStored: number;
  photosMissing: number;
  mailboxForbidden: number;
}

export interface DirectoryPullResult {
  status: 'ok';
  /** True when this run re-read the whole directory — the only mode in which units are reaped. */
  full: boolean;
  deltaLink: string;
  counters: DirectoryPullCounters;
}

/**
 * Raised when an `unchanged` photo has no key to fall back on. `mapGraphUser` would map that to
 * `null`, and `photo_storage_key` is asserted downstream, so proceeding would erase the photo.
 * Unreachable through the real `DirectoryGraph` (see `photoKeyFor`), and fatal if it ever isn't.
 */
export class DirectoryPhotoInvariantError extends Error {
  constructor(entraOid: string) {
    super(
      `photo(${entraOid}) reported 'unchanged' with no stored key — refusing to erase the photo`,
    );
    this.name = 'DirectoryPhotoInvariantError';
  }
}

const PHOTO_FILENAME = 'profile';

/**
 * The S3 key a user's photo occupies. Deterministic on purpose: `m365_person_links` records the
 * media etag, not the key, so this is the only way a later run can name the photo it stored
 * earlier. Content type is S3 object metadata, never part of the key — otherwise the key could
 * not be derived on the `unchanged` path, where no content type is known.
 */
export function photoKeyFor(tenantId: string, entraOid: string): string {
  return buildTenantKey({
    tenant_id: tenantId,
    domain: 'people-photo',
    file_id: entraOid,
    filename: PHOTO_FILENAME,
  });
}

function defaultStorage(): DirectoryPhotoStorage {
  return {
    // Same resolution order as knowledge/people/hiring; `putObject` needs it explicitly because
    // `getS3Client()` hands back a bare client with no bucket baked in.
    bucket: process.env.S3_BUCKET ?? 'seta-knowledge',
    put: (input) => putObject(input),
  };
}

function emptyCounters(): DirectoryPullCounters {
  return {
    usersSeen: 0,
    usersFiltered: 0,
    usersCreated: 0,
    usersUpdated: 0,
    usersUnchanged: 0,
    usersCollided: 0,
    usersRemoved: 0,
    orgUnitsCreated: 0,
    orgUnitsRenamed: 0,
    headsSet: 0,
    managerAmbiguous: 0,
    photosStored: 0,
    photosMissing: 0,
    mailboxForbidden: 0,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function statusCodeOf(err: unknown): number | undefined {
  return typeof err === 'object' && err !== null && 'statusCode' in err
    ? (err as { statusCode?: number }).statusCode
    : undefined;
}

/**
 * Delta pages omit unchanged fields rather than nulling them, so an absent key means "no news",
 * not "cleared". Only an explicitly present value — including an explicit `null` — overwrites
 * what the link row already holds.
 */
function merged<T>(present: boolean, incoming: T | null, stored: T | null): T | null {
  return present ? incoming : stored;
}

/** The org facts a user contributes to the census, after the delta merge above. */
interface CensusEntry {
  entraOid: string;
  managerOid: string | null;
  department: string | null;
  division: string | null;
}

interface PendingUser {
  person: DirectoryPerson;
  census: CensusEntry;
  photoMediaEtag: string | null;
}

/** Counts tree writes as they happen — `resolveOrgUnits` reports the map, not what it did. */
function countingOrgSurface(
  people: PeopleOrgSurface,
  counters: DirectoryPullCounters,
): PeopleOrgSurface {
  return {
    getOrgStructure: (session) => people.getOrgStructure(session),
    async createOrgUnit(input) {
      counters.orgUnitsCreated += 1;
      return people.createOrgUnit(input);
    },
    async updateOrgUnit(input) {
      // A head change is not a rename; only `patch.name` is.
      if (input.patch.name !== undefined) counters.orgUnitsRenamed += 1;
      return people.updateOrgUnit(input);
    },
    deleteOrgUnit: (input) => people.deleteOrgUnit(input),
  };
}

/** Steps 2-6: verified domains, the delta walk, the filter, and the per-user Graph fan-out. */
async function fetchChangedUsers(args: {
  tenantId: string;
  startFrom: string | null;
  linkByOid: Map<string, PersonLinkRow>;
  storage: DirectoryPhotoStorage;
  counters: DirectoryPullCounters;
  graph: DirectoryGraph;
}): Promise<{ pending: PendingUser[]; removed: string[]; deltaLink: string }> {
  const { tenantId, graph, counters } = args;

  const domains = await graph.verifiedDomains();
  const walk = await graph.walkUsers(args.startFrom);
  counters.usersSeen = walk.users.length;

  const syncable = walk.users.filter((u) => isSyncableUser(u, domains));
  counters.usersFiltered = walk.users.length - syncable.length;

  const pending: PendingUser[] = [];
  for (const u of syncable) {
    const link = args.linkByOid.get(u.id) ?? null;
    // Read ONCE into one local. The etag handed to `photo()` and the key derived from it must be
    // the same fact: `photo()` answers `unchanged` only when it was given a non-null etag, which
    // is exactly when a key exists. Re-reading either separately breaks that guarantee.
    const knownEtag = link?.photoMediaEtag ?? null;
    const currentKey = knownEtag === null ? null : photoKeyFor(tenantId, u.id);

    const fetched = await graph.photo(u.id, knownEtag);
    let photo: PhotoOutcome;
    let nextEtag: string | null;
    switch (fetched.kind) {
      case 'unchanged':
        if (currentKey === null) throw new DirectoryPhotoInvariantError(u.id);
        photo = { kind: 'unchanged' };
        nextEtag = knownEtag;
        break;
      case 'none':
        counters.photosMissing += 1;
        photo = { kind: 'none' };
        nextEtag = null;
        break;
      case 'fetched': {
        const key = photoKeyFor(tenantId, u.id);
        await args.storage.put({
          bucket: args.storage.bucket,
          key,
          body: fetched.bytes,
          contentType: fetched.contentType,
        });
        counters.photosStored += 1;
        photo = { kind: 'stored', key, etag: fetched.etag };
        nextEtag = fetched.etag;
        break;
      }
    }

    const mailbox = await graph.mailboxSettings(u.id);
    if (mailbox === null) counters.mailboxForbidden += 1;

    pending.push({
      person: mapGraphUser(u, { mailbox, photo: { result: photo, currentKey } }),
      photoMediaEtag: nextEtag,
      census: {
        entraOid: u.id,
        managerOid: merged('manager' in u, u.manager?.id ?? null, link?.managerOid ?? null),
        department: merged(
          u.department !== undefined,
          u.department ?? null,
          link?.department ?? null,
        ),
        division: merged(
          u.employeeOrgData !== undefined,
          u.employeeOrgData?.division ?? null,
          link?.division ?? null,
        ),
      },
    });
  }

  return { pending, removed: walk.removed, deltaLink: walk.deltaLink };
}

/** Steps 7-14. Throws on any failure — the caller records it and leaves the cursor alone. */
async function pullOnce(args: {
  tenantId: string;
  isFullRun: boolean;
  startFrom: string | null;
  session: SessionScope;
  storage: DirectoryPhotoStorage;
  counters: DirectoryPullCounters;
  deps: RunDirectoryPullDeps;
}): Promise<DirectoryPullResult> {
  const { tenantId, isFullRun, session, counters, deps } = args;
  const { repo } = deps;

  const storedLinks = await repo.listPersonLinks(tenantId);
  const linkByOid = new Map(storedLinks.map((l) => [l.entraOid, l]));

  const { pending, removed, deltaLink } = await fetchChangedUsers({
    tenantId,
    startFrom: args.startFrom,
    linkByOid,
    storage: args.storage,
    counters,
    graph: deps.graph,
  });
  const removedOids = new Set(removed);

  // The census both the tree and the heads are judged against. A delta page carries only CHANGED
  // users, so voting over it alone would let a single changed report hand a whole department to a
  // minority manager — and `head_worker_id` is an RBAC predicate (`reportsSubtreeSql`), so that is
  // a scope escalation. The stored link rows carry the rest of the membership. A full run's page
  // IS the complete census, and folding stale rows into it would defeat the reap, so it stands
  // alone there.
  const pendingOids = new Set(pending.map((p) => p.census.entraOid));
  const census: CensusEntry[] = pending.map((p) => p.census);
  if (!isFullRun) {
    for (const link of storedLinks) {
      if (link.removedAt !== null) continue;
      if (pendingOids.has(link.entraOid) || removedOids.has(link.entraOid)) continue;
      census.push({
        entraOid: link.entraOid,
        managerOid: link.managerOid,
        department: link.department,
        division: link.division,
      });
    }
  }
  const censusOids = new Set(census.map((c) => c.entraOid));

  // Step 7. Changed users come first, so the freshest display casing of a department wins.
  const orgSurface = countingOrgSurface(deps.people, counters);
  const pairs: DirectoryOrgPair[] = census.map((c) => ({
    division: c.division,
    department: c.department,
  }));
  const unitByKey = await resolveOrgUnits({
    tenantId,
    pairs,
    // Only a full census can tell "dropped from Entra" apart from "not on this page".
    reap: isFullRun,
    session,
    repo,
    people: orgSurface,
  });
  for (const p of pending) {
    p.person.org_unit_id = unitByKey.get(orgKey(p.census.division, p.census.department)) ?? null;
  }

  // Step 8 — before heads, because a manager may be created in this very run.
  const { results } = await deps.people.syncDirectoryPeople({
    people: pending.map((p) => p.person),
    session,
  });
  const pendingByOid = new Map(pending.map((p) => [p.census.entraOid, p]));

  for (const outcome of results) {
    const entry = pendingByOid.get(outcome.entra_oid);

    // Step 9
    if (outcome.outcome === 'collision') {
      counters.usersCollided += 1;
      await repo.raiseConflict({
        tenantId,
        kind: 'email_collision',
        subjectType: 'person',
        subjectId: null,
        entraOid: outcome.entra_oid,
        detail: {
          work_email: entry?.person.work_email ?? null,
          full_name: entry?.person.full_name ?? null,
          candidates: outcome.collision_candidates ?? [],
        },
      });
      continue;
    }

    if (outcome.outcome === 'created') counters.usersCreated += 1;
    else if (outcome.outcome === 'updated') counters.usersUpdated += 1;
    else counters.usersUnchanged += 1;

    // Step 10. The org facts land here too, not just the photo etag: they are what makes the
    // census above survive between runs.
    if (!outcome.person_id || !entry) continue;
    await repo.upsertPersonLink({
      tenantId,
      personId: outcome.person_id,
      entraOid: outcome.entra_oid,
      managerOid: entry.census.managerOid,
      department: entry.census.department,
      division: entry.census.division,
      photoMediaEtag: entry.photoMediaEtag,
    });
  }

  // Step 12, hoisted ahead of the heads: a member who left the directory must stop voting for one.
  // The person row itself is never touched — offboarding stays a human decision (design §8.3).
  const removedForEvent: Array<{ entraOid: string; personId: string }> = [];
  for (const oid of removed) {
    const link = linkByOid.get(oid);
    // `findPersonLinkByOid`/`listPersonLinks` return soft-removed rows on purpose (a reappearing
    // OID must revive, not duplicate), so "already removed" is checked here, not there.
    if (!link || link.removedAt !== null) continue;
    await repo.markRemoved(tenantId, oid);
    counters.usersRemoved += 1;
    removedForEvent.push({ entraOid: oid, personId: link.personId });
    await repo.raiseConflict({
      tenantId,
      kind: 'user_removed',
      subjectType: 'person',
      subjectId: link.personId,
      entraOid: oid,
      detail: {
        person_id: link.personId,
        entra_oid: oid,
        department: link.department,
        division: link.division,
      },
    });
  }

  // Step 11. Re-read: the batch above has just written its person ids and org facts, so this is
  // the complete, current membership — never the delta page.
  const members: DirectoryMember[] = [];
  for (const link of await repo.listPersonLinks(tenantId)) {
    if (link.removedAt !== null) continue;
    if (!censusOids.has(link.entraOid)) continue;
    const unitId = unitByKey.get(orgKey(link.division, link.department));
    if (!unitId) continue;
    members.push({
      person_id: link.personId,
      org_unit_id: unitId,
      manager_oid: link.managerOid,
    });
  }
  const heads = await resolveHeads({ tenantId, members, session, repo, people: orgSurface });
  counters.headsSet = heads.headsSet;
  counters.managerAmbiguous = heads.ambiguous;

  // Step 13. Only here, and only on the success path: an error must leave the old cursor so the
  // next run re-reads that window instead of skipping it.
  await repo.recordDirectorySuccess({ tenantId, deltaLink });

  // Step 14
  await withEmit({ actor: { userId: session.user_id, tenantId } }, async () => {
    for (const entry of removedForEvent) {
      await emit({
        tenantId,
        aggregateType: 'integrations.m365.directory',
        aggregateId: tenantId,
        eventType: 'integrations.m365.directory.user.removed',
        eventVersion: 1,
        payload: { tenant_id: tenantId, entra_oid: entry.entraOid, person_id: entry.personId },
      });
    }
    await emit({
      tenantId,
      aggregateType: 'integrations.m365.directory',
      aggregateId: tenantId,
      eventType: 'integrations.m365.directory.synced',
      eventVersion: 1,
      payload: {
        tenant_id: tenantId,
        full: isFullRun,
        users_seen: counters.usersSeen,
        users_filtered: counters.usersFiltered,
        users_created: counters.usersCreated,
        users_updated: counters.usersUpdated,
        users_unchanged: counters.usersUnchanged,
        users_collided: counters.usersCollided,
        users_removed: counters.usersRemoved,
        org_units_created: counters.orgUnitsCreated,
        org_units_renamed: counters.orgUnitsRenamed,
        heads_set: counters.headsSet,
        manager_ambiguous: counters.managerAmbiguous,
        photos_stored: counters.photosStored,
        photos_missing: counters.photosMissing,
        mailbox_forbidden: counters.mailboxForbidden,
      },
    });
  });

  return { status: 'ok', full: isFullRun, deltaLink, counters };
}

function recordCounters(tenantId: string, counters: DirectoryPullCounters): void {
  const attrs = { tenant_id: tenantId };
  directoryUsersSeenCounter.add(counters.usersSeen, attrs);
  directoryUsersFilteredCounter.add(counters.usersFiltered, attrs);
  directoryUsersCreatedCounter.add(counters.usersCreated, attrs);
  directoryUsersUpdatedCounter.add(counters.usersUpdated, attrs);
  directoryOrgUnitCreatedCounter.add(counters.orgUnitsCreated, attrs);
  directoryOrgUnitRenamedCounter.add(counters.orgUnitsRenamed, attrs);
  directoryManagerAmbiguousCounter.add(counters.managerAmbiguous, attrs);
  directoryPhotoMissingCounter.add(counters.photosMissing, attrs);
  directoryMailboxForbiddenCounter.add(counters.mailboxForbidden, attrs);
}

/**
 * One directory pull for one tenant (design §8). The step order is load-bearing throughout; each
 * step is commented with what breaks if it moves.
 *
 * The whole run is one-way: Entra is the source, `people` is the sink, and every write into
 * `people` goes through the injected public surface with RBAC re-checked at the callee (§8.1).
 */
export async function runDirectoryPull(
  input: RunDirectoryPullInput,
  deps: RunDirectoryPullDeps,
): Promise<DirectoryPullResult> {
  const tenantId = input.tenant_id;
  const session = deps.session ?? buildSystemSession(tenantId);
  const storage = deps.storage ?? defaultStorage();
  const counters = emptyCounters();

  // Step 1
  const state = await deps.repo.getDirectoryState(tenantId);
  if (!state) throw new M365NotConfiguredError(tenantId);
  // A tenant that has never synced is a full run whether it asked for one or not — there is no
  // cursor to read from, so the page it gets back is the whole directory.
  const isFullRun = input.full === true || state.deltaLink === null;
  const startFrom = input.full === true ? null : state.deltaLink;

  try {
    const result = await withDirectorySpan(
      'm365.directory.pull',
      { 'm365.tenant_id': tenantId, 'm365.directory.full': isFullRun },
      () => pullOnce({ tenantId, isFullRun, startFrom, session, storage, counters, deps }),
    );
    directoryPullSuccessCounter.add(1, { tenant_id: tenantId });
    recordCounters(tenantId, counters);
    return result;
  } catch (err) {
    // Its own statement, outside anything that could roll back: a failure recorded inside the
    // work that failed would roll back with it, and the run would look like it never happened.
    await deps.repo.recordDirectoryFailure({ tenantId, error: errorMessage(err) });
    directoryPullErrorCounter.add(1, { tenant_id: tenantId });
    if (statusCodeOf(err) === 429) directoryPullThrottledCounter.add(1, { tenant_id: tenantId });
    // Rethrown so graphile-worker retries. The cursor is untouched, so the retry re-reads this
    // window rather than skipping it.
    throw err;
  }
}

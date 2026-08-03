import { randomUUID } from 'node:crypto';
import type { DirectoryPerson, DirectorySyncOutcome } from '@seta/people';
import type { EncryptedBlob } from '@seta/shared-crypto';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../../src/backend/db/schema/index.ts';
import { m365TenantConfig } from '../../src/backend/db/schema/index.ts';
import type { PeopleOrgSurface } from '../../src/backend/m365/directory/org-tree.ts';
import type { PeopleDirectorySurface } from '../../src/backend/m365/directory/sync.ts';
import type { MailboxSettings } from '../../src/backend/m365/directory/types.ts';

export const TENANT = '11111111-1111-1111-1111-111111111111';
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
export const ENTRA_TENANT = '22222222-2222-4222-8222-222222222222';

export const EXEC = '00000000-0000-4000-8000-0000000000e0';
export const OPERATION = '00000000-0000-4000-8000-0000000000a0';
export const DELIVERY = '00000000-0000-4000-8000-0000000000d0';
export const PMO = '00000000-0000-4000-8000-0000000000f0';

export interface FakeUnit {
  id: string;
  parent_id: string | null;
  name: string;
  kind: string;
  head_worker_id: string | null;
}

/** The curated structural spine (design §4.1) — never created, renamed, re-parented or deleted. */
export function spine(): FakeUnit[] {
  return [
    { id: EXEC, parent_id: null, name: 'Executive', kind: 'executive', head_worker_id: null },
    { id: OPERATION, parent_id: EXEC, name: 'Operation', kind: 'operation', head_worker_id: null },
    { id: DELIVERY, parent_id: EXEC, name: 'Delivery', kind: 'delivery', head_worker_id: null },
    { id: PMO, parent_id: EXEC, name: 'PMO', kind: 'pmo', head_worker_id: null },
  ];
}

/** Seeds the tenant + `m365_tenant_config` row `runDirectoryPull` reads its cursor from. */
export async function seedTenantConfig(
  db: NodePgDatabase<typeof schema>,
  pool: import('pg').Pool,
): Promise<void> {
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Test Org', $2)`, [
    TENANT,
    `test-${TENANT.slice(0, 8)}`,
  ]);
  await db.insert(m365TenantConfig).values({
    tenantId: TENANT,
    entraTenantId: ENTRA_TENANT,
    clientId: 'client-id',
    // Never decrypted here: every test drives a stubbed Graph, so no token is ever acquired.
    clientSecretBlob: {
      v: 1,
      alg: 'aes-256-gcm',
      iv: '',
      ct: '',
      tag: '',
    } as unknown as EncryptedBlob,
    createdBy: SYSTEM_USER_ID,
    updatedBy: SYSTEM_USER_ID,
  });
}

export interface FakeCalls {
  getOrgStructure: number;
  create: Array<{ name: string; kind: string; parent_id: string | null | undefined }>;
  update: Array<{
    org_unit_id: string;
    patch: { name?: string; parent_id?: string | null; head_worker_id?: string | null };
  }>;
  delete: string[];
  /** Every `person_ids` batch handed to `listWorkerNames`, in call order. */
  names: string[][];
  /** Every `DirectoryPerson[]` batch handed to `syncDirectoryPeople`, in call order. */
  sync: DirectoryPerson[][];
}

export interface FakePeople extends PeopleDirectorySurface {
  units: Map<string, FakeUnit>;
  members: Map<string, string[]>;
  calls: FakeCalls;
  /** Emails that always come back as an unresolvable match, as a hand-created person would. */
  collisions: Set<string>;
  /** The last DTO accepted per email — drives created/updated/unchanged exactly as the real one. */
  seen: Map<string, { person_id: string; dto: string }>;
}

/**
 * Stands in for the `@seta/people` write surface. A module-boundary double, not a DB mock: the
 * `people` schema is not migrated into this package's testcontainer (see `tests/global-setup.ts` —
 * core/identity/planner/integrations only) and `integrations` may never touch it anyway, so the
 * injected surface is the only honest seam. `deleteOrgUnit` mirrors the real one exactly (returns
 * `{deleted:false, reason}`, never throws) and `syncDirectoryPeople` mirrors its outcome vocabulary.
 */
export function createFakePeople(seed: FakeUnit[]): FakePeople {
  const units = new Map<string, FakeUnit>(seed.map((u) => [u.id, { ...u }]));
  const members = new Map<string, string[]>();
  const collisions = new Set<string>();
  const seen = new Map<string, { person_id: string; dto: string }>();
  const calls: FakeCalls = {
    getOrgStructure: 0,
    create: [],
    update: [],
    delete: [],
    names: [],
    sync: [],
  };

  const orgSurface: PeopleOrgSurface = {
    async getOrgStructure() {
      calls.getOrgStructure += 1;
      return {
        units: [...units.values()].map((u) => ({
          ...u,
          member_ids: [...(members.get(u.id) ?? [])],
        })),
      };
    },
    async listWorkerNames({ person_ids }) {
      calls.names.push([...person_ids]);
      return new Map(person_ids.map((id) => [id, `Person ${id.slice(0, 8)}`] as const));
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

  return {
    ...orgSurface,
    units,
    members,
    calls,
    collisions,
    seen,
    async syncDirectoryPeople(input) {
      calls.sync.push(input.people.map((p) => ({ ...p })));
      const results: DirectorySyncOutcome[] = [];
      for (const incoming of input.people) {
        const email = incoming.work_email.trim().toLowerCase();
        if (collisions.has(email)) {
          results.push({
            entra_oid: incoming.entra_oid,
            person_id: null,
            outcome: 'collision',
            collision_candidates: [
              { person_id: randomUUID(), full_name: incoming.full_name, directory_managed: false },
            ],
          });
          continue;
        }
        const dto = JSON.stringify(incoming);
        const prior = seen.get(email);
        if (!prior) {
          const person_id = randomUUID();
          seen.set(email, { person_id, dto });
          results.push({ entra_oid: incoming.entra_oid, person_id, outcome: 'created' });
          continue;
        }
        if (prior.dto === dto) {
          results.push({
            entra_oid: incoming.entra_oid,
            person_id: prior.person_id,
            outcome: 'unchanged',
          });
          continue;
        }
        seen.set(email, { person_id: prior.person_id, dto });
        results.push({
          entra_oid: incoming.entra_oid,
          person_id: prior.person_id,
          outcome: 'updated',
        });
      }
      return { results };
    },
  };
}

export function functionUnits(people: FakePeople): FakeUnit[] {
  return [...people.units.values()].filter((u) => u.kind === 'function');
}

/** Records photo uploads instead of hitting S3. The bucket/key it is handed are asserted on. */
export function createPhotoRecorder(): {
  bucket: string;
  put(input: { bucket: string; key: string; body: Uint8Array; contentType: string }): Promise<void>;
  puts: Array<{ bucket: string; key: string; contentType: string; bytes: number }>;
} {
  const puts: Array<{ bucket: string; key: string; contentType: string; bytes: number }> = [];
  return {
    bucket: 'test-bucket',
    puts,
    async put(input) {
      puts.push({
        bucket: input.bucket,
        key: input.key,
        contentType: input.contentType,
        bytes: input.body.byteLength,
      });
    },
  };
}

export function graphError(statusCode: number, message = `graph ${statusCode}`): Error {
  return Object.assign(new Error(message), { statusCode });
}

export interface PhotoStub {
  etag: string;
  contentType?: string;
  bytes?: number[];
}

export interface GraphStubConfig {
  /** `GET /organization` verified domains. */
  domains?: string[];
  /**
   * Delta pages, served one per `/users/delta`-ish request in order (covers paging AND re-runs).
   * An `Error` entry is thrown instead of returned — that is the "Graph blew up mid-run" case.
   */
  pages: unknown[];
  /** oid -> settings, or a status code the mailboxSettings call throws. */
  mailbox?: Record<string, MailboxSettings | number>;
  /** oid -> photo metadata, or a status code the `/photo` metadata call throws. */
  photo?: Record<string, PhotoStub | number>;
}

export interface GraphStubRequest {
  responseType(type: unknown): GraphStubRequest;
  get(): Promise<unknown>;
}

export interface GraphClientStub {
  api(path: string): GraphStubRequest;
  calls: string[];
}

/**
 * Stubs the Graph `Client` at the transport boundary, the same technique `plan-pull-*.test.ts`
 * uses. Nothing here touches the network, and `createDirectoryGraph` runs for real on top of it —
 * delta paging, the photo etag short-circuit and the 403/404 mappings are all exercised, not faked.
 */
export function makeGraphClientStub(config: GraphStubConfig): GraphClientStub {
  const pages = [...config.pages];
  const calls: string[] = [];

  const stub: GraphClientStub = {
    calls,
    api(path: string): GraphStubRequest {
      const request: GraphStubRequest = {
        responseType() {
          return request;
        },
        async get(): Promise<unknown> {
          calls.push(path);

          if (path.startsWith('/organization')) {
            return {
              value: [
                {
                  verifiedDomains: (config.domains ?? ['contoso.com']).map((name) => ({ name })),
                },
              ],
            };
          }

          if (path.includes('/users/delta') || path.includes('$deltatoken')) {
            const page = pages.shift();
            if (page === undefined) throw new Error(`graph stub: no delta page left for ${path}`);
            if (page instanceof Error) throw page;
            return page;
          }

          const photoValue = /^\/users\/([^/]+)\/photo\/\$value$/.exec(path);
          if (photoValue) {
            const entry = config.photo?.[photoValue[1] as string];
            if (typeof entry !== 'object') throw new Error(`graph stub: no photo for ${path}`);
            return Uint8Array.from(entry.bytes ?? [1, 2, 3]).buffer;
          }

          const photoMeta = /^\/users\/([^/]+)\/photo$/.exec(path);
          if (photoMeta) {
            const entry = config.photo?.[photoMeta[1] as string];
            if (entry === undefined || typeof entry === 'number') {
              throw graphError(typeof entry === 'number' ? entry : 404);
            }
            return {
              '@odata.mediaEtag': entry.etag,
              contentType: entry.contentType ?? 'image/jpeg',
            };
          }

          const mailbox = /^\/users\/([^/]+)\/mailboxSettings$/.exec(path);
          if (mailbox) {
            const entry = config.mailbox?.[mailbox[1] as string];
            if (entry === undefined) {
              return { timeZone: null, workingHours: null, automaticRepliesSetting: null };
            }
            if (typeof entry === 'number') throw graphError(entry);
            return entry;
          }

          throw new Error(`graph stub: unexpected path ${path}`);
        },
      };
      return request;
    },
  };
  return stub;
}

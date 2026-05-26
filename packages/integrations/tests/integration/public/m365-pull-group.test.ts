import { resetCoreDb } from '@seta/core/testing';
import { findEntraOidByUserId, findUserByEntraOid } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetIntegrationsDb } from '../../../src/backend/db/client.ts';
import { runPullGroup } from '../../../src/backend/m365/jobs/pull-group.ts';
import { createM365GroupLinkRepo } from '../../../src/backend/m365/repo.ts';
import groupMembers from '../../helpers/fixtures/graph/group-members.json' with { type: 'json' };
import groupsInitial from '../../helpers/fixtures/graph/groups-initial.json' with { type: 'json' };

// Minimal duck type matching the methods runPullGroup actually calls
interface GraphRequest {
  select(...fields: string[]): GraphRequest;
  filter(expr: string): GraphRequest;
  get(): Promise<unknown>;
}
interface GraphLike {
  api(path: string): GraphRequest;
}

const EXTERNAL_ID = 'm365-abc';
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Builds a stub graph client that returns given responses keyed by path prefix.
 * For delta calls the stub returns { value: [], '@odata.deltaLink': deltaLinkUrl }.
 */
function makeGraphStub(overrides: {
  group?: unknown;
  members?: unknown;
  owners?: unknown;
  delta?: unknown;
  deltaThrows?: Error;
}): GraphLike {
  return {
    api(path: string): GraphRequest {
      const self: GraphRequest = {
        select() {
          return self;
        },
        filter() {
          return self;
        },
        async get() {
          if (path.includes('/delta')) {
            if (overrides.deltaThrows) throw overrides.deltaThrows;
            return (
              overrides.delta ?? {
                value: [],
                '@odata.deltaLink':
                  'https://graph.microsoft.com/v1.0/groups/delta?$deltatoken=TESTTOKEN',
              }
            );
          }
          if (path.endsWith('/members')) return overrides.members ?? { value: [] };
          if (path.endsWith('/owners')) return overrides.owners ?? { value: [] };
          // Single group fetch
          return (
            overrides.group ?? {
              id: EXTERNAL_ID,
              displayName: 'Engineering',
              description: 'Eng team',
              visibility: 'Private',
              theme: 'blue',
            }
          );
        },
      };
      return self;
    },
  };
}

async function seedTenantAndGroup(pool: import('pg').Pool) {
  const tenantId = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Test Org', $2)`, [
    tenantId,
    `test-${tenantId.slice(0, 8)}`,
  ]);

  // createGroup requires planner.group.create permission which the system actor doesn't hold.
  // Use raw SQL to seed the group directly, same approach as other integration tests.
  const groupId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO planner.groups (id, tenant_id, name, external_source, external_id, created_by)
     VALUES ($1, $2, 'Engineering', 'm365', $3, $4)`,
    [groupId, tenantId, EXTERNAL_ID, SYSTEM_USER_ID],
  );

  return { tenantId, groupId };
}

async function seedEntraUser(
  pool: import('pg').Pool,
  opts: { tenantId: string; entraOid: string; email: string },
) {
  const userId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO identity."user" (id, email, name, email_verified, tenant_id) VALUES ($1, $2, $3, true, $4)`,
    [userId, opts.email, opts.email.split('@')[0], opts.tenantId],
  );
  await pool.query(
    `INSERT INTO identity.account (id, user_id, provider_id, account_id) VALUES ($1, $2, 'microsoft-entra-id', $3)`,
    [crypto.randomUUID(), userId, opts.entraOid],
  );
  return userId;
}

describe('runPullGroup', () => {
  it('initial link: creates link row, updates group name, sets idle, stamps external_synced_at', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        resetIntegrationsDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, groupId } = await seedTenantAndGroup(pool);

          // Pre-create the m365_group_links row (linkGroupToM365 normally creates it, but the
          // pull job receives an already-linked group whose link row may not yet exist)
          const db = (await import('../../../src/backend/db/client.ts')).integrationsDb();
          // Using db as never: dynamic import's inferred type doesn't align with NodePgDatabase generic
          const repo = createM365GroupLinkRepo({ db: db as never });
          await repo.upsert({
            tenantId,
            groupId,
            externalId: EXTERNAL_ID,
            lastSyncedFields: {},
          });

          // Seed provisioned Entra users so member adds succeed
          await seedEntraUser(pool, {
            tenantId,
            entraOid: 'entra-oid-1',
            email: 'alice@example.com',
          });
          await seedEntraUser(pool, {
            tenantId,
            entraOid: 'entra-oid-2',
            email: 'bob@example.com',
          });

          const graphStub = makeGraphStub({
            group: groupsInitial.value[0],
            members: groupMembers,
            delta: {
              value: [],
              '@odata.deltaLink':
                'https://graph.microsoft.com/v1.0/groups/delta?$deltatoken=INITIAL',
            },
          });

          await runPullGroup(
            { tenant_id: tenantId, group_id: groupId, external_id: EXTERNAL_ID },
            {
              graphClient: graphStub,
              repo,
              findUserByEntraOid,
              findEntraOidByUserId,
            },
          );

          // link row has deltaLink and is idle
          const link = await repo.findByGroup(groupId);
          expect(link).not.toBeNull();
          expect(link!.syncStatus).toBe('idle');
          expect(link!.deltaLink).toContain('INITIAL');

          // group external_synced_at was updated
          const { rows } = await pool.query(
            `SELECT name, external_synced_at FROM planner.groups WHERE id = $1`,
            [groupId],
          );
          expect(rows[0].name).toBe('Engineering');
          expect(rows[0].external_synced_at).not.toBeNull();
        } finally {
          resetCoreDb();
          resetIntegrationsDb();
          await closePools();
        }
      },
    );
  });

  it('incremental delta: renames group when remote displayName changes', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        resetIntegrationsDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, groupId } = await seedTenantAndGroup(pool);
          const db = (await import('../../../src/backend/db/client.ts')).integrationsDb();
          const repo = createM365GroupLinkRepo({ db: db as never });

          // Establish a baseline snapshot that matches the current local name
          await repo.upsert({
            tenantId,
            groupId,
            externalId: EXTERNAL_ID,
            lastSyncedFields: {
              name: 'Engineering',
              description: 'Eng team',
              visibility: 'private',
              theme: 'blue',
              members: [],
            },
            deltaLink: 'https://graph.microsoft.com/v1.0/groups/delta?$deltatoken=OLD',
          });

          const { findUserByEntraOid, findEntraOidByUserId } = await import('@seta/identity');

          const graphStub = makeGraphStub({
            group: {
              id: EXTERNAL_ID,
              displayName: 'Engineering Renamed',
              visibility: 'Private',
              theme: 'blue',
            },
            members: { value: [] },
            delta: {
              value: [],
              '@odata.deltaLink':
                'https://graph.microsoft.com/v1.0/groups/delta?$deltatoken=ABC123',
            },
          });

          await runPullGroup(
            { tenant_id: tenantId, group_id: groupId, external_id: EXTERNAL_ID },
            {
              graphClient: graphStub,
              repo,
              findUserByEntraOid,
              findEntraOidByUserId,
            },
          );

          const { rows } = await pool.query(`SELECT name FROM planner.groups WHERE id = $1`, [
            groupId,
          ]);
          expect(rows[0].name).toBe('Engineering Renamed');
        } finally {
          resetCoreDb();
          resetIntegrationsDb();
          await closePools();
        }
      },
    );
  });

  it('non-provisioned member: skipped, integrations.m365.member.skipped event emitted', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        resetIntegrationsDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, groupId } = await seedTenantAndGroup(pool);
          const db = (await import('../../../src/backend/db/client.ts')).integrationsDb();
          const repo = createM365GroupLinkRepo({ db: db as never });
          await repo.upsert({
            tenantId,
            groupId,
            externalId: EXTERNAL_ID,
            lastSyncedFields: {},
          });

          // No Entra users seeded — both members are not provisioned
          const graphStub = makeGraphStub({
            group: groupsInitial.value[0],
            members: groupMembers, // entra-oid-1 and entra-oid-2
            delta: {
              value: [],
              '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/groups/delta?$deltatoken=T2',
            },
          });

          await runPullGroup(
            { tenant_id: tenantId, group_id: groupId, external_id: EXTERNAL_ID },
            {
              graphClient: graphStub,
              repo,
              findUserByEntraOid,
              findEntraOidByUserId,
            },
          );

          // skipped events persisted in core.events
          const { rows } = await pool.query(
            `SELECT payload FROM core.events WHERE event_type = 'integrations.m365.member.skipped' AND tenant_id = $1`,
            [tenantId],
          );
          expect(rows.length).toBeGreaterThanOrEqual(1);
          expect(rows[0].payload.reason).toBe('not_provisioned');
          expect(rows[0].payload.group_id).toBe(groupId);

          // group has no members added
          const memberRows = await pool.query(
            `SELECT * FROM planner.group_members WHERE group_id = $1`,
            [groupId],
          );
          expect(memberRows.rows).toHaveLength(0);
        } finally {
          resetCoreDb();
          resetIntegrationsDb();
          await closePools();
        }
      },
    );
  });

  it('410 Gone on deltaLink: clears deltaLink, retries full pull', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        resetIntegrationsDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, groupId } = await seedTenantAndGroup(pool);
          const db = (await import('../../../src/backend/db/client.ts')).integrationsDb();
          const repo = createM365GroupLinkRepo({ db: db as never });
          await repo.upsert({
            tenantId,
            groupId,
            externalId: EXTERNAL_ID,
            lastSyncedFields: {
              name: 'Engineering',
              description: null,
              visibility: 'private',
              theme: 'blue',
              members: [],
            },
            deltaLink: 'https://graph.microsoft.com/v1.0/groups/delta?$deltatoken=STALE',
          });

          let deltaCallCount = 0;
          const goneError = Object.assign(new Error('Gone'), { statusCode: 410 });

          const graphStub: GraphLike = {
            api(path: string): GraphRequest {
              const self: GraphRequest = {
                select() {
                  return self;
                },
                filter() {
                  return self;
                },
                async get() {
                  if (path.includes('/delta')) {
                    deltaCallCount++;
                    if (deltaCallCount === 1) throw goneError;
                    // Second call (after full re-pull triggers new delta fetch) succeeds
                    return {
                      value: [],
                      '@odata.deltaLink':
                        'https://graph.microsoft.com/v1.0/groups/delta?$deltatoken=REFRESHED',
                    };
                  }
                  if (path.endsWith('/members')) return { value: [] };
                  if (path.endsWith('/owners')) return { value: [] };
                  return {
                    id: EXTERNAL_ID,
                    displayName: 'Engineering',
                    visibility: 'Private',
                    theme: 'blue',
                  };
                },
              };
              return self;
            },
          };

          await runPullGroup(
            { tenant_id: tenantId, group_id: groupId, external_id: EXTERNAL_ID },
            {
              graphClient: graphStub,
              repo,
              findUserByEntraOid,
              findEntraOidByUserId,
            },
          );

          // Delta was fetched at least twice (first 410, then retry)
          expect(deltaCallCount).toBeGreaterThanOrEqual(2);

          // Link row has new delta link (not the stale one)
          const link = await repo.findByGroup(groupId);
          expect(link!.deltaLink).toContain('REFRESHED');
        } finally {
          resetCoreDb();
          resetIntegrationsDb();
          await closePools();
        }
      },
    );
  });

  it('LWW conflict: sync_status = conflict, integrations.m365.group.field-conflict emitted', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        resetIntegrationsDb();
        initPools({ databaseUrl });
        try {
          const { tenantId, groupId } = await seedTenantAndGroup(pool);
          const db = (await import('../../../src/backend/db/client.ts')).integrationsDb();
          const repo = createM365GroupLinkRepo({ db: db as never });

          // Snapshot has "Engineering"; local was renamed to "Engineering Local";
          // remote now says "Engineering Remote" — both diverged from snapshot → conflict
          await repo.upsert({
            tenantId,
            groupId,
            externalId: EXTERNAL_ID,
            lastSyncedFields: {
              name: 'Engineering',
              description: null,
              visibility: 'private',
              theme: 'blue',
              members: [],
            },
          });

          // Rename the group locally
          await pool.query(
            `UPDATE planner.groups SET name = 'Engineering Local', version = version + 1, updated_at = now() WHERE id = $1`,
            [groupId],
          );

          // Remote says a different name
          const graphStub = makeGraphStub({
            group: {
              id: EXTERNAL_ID,
              displayName: 'Engineering Remote',
              visibility: 'Private',
              theme: 'blue',
            },
            members: { value: [] },
            delta: {
              value: [],
              '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/groups/delta?$deltatoken=T3',
            },
          });

          await runPullGroup(
            { tenant_id: tenantId, group_id: groupId, external_id: EXTERNAL_ID },
            {
              graphClient: graphStub,
              repo,
              findUserByEntraOid,
              findEntraOidByUserId,
            },
          );

          const link = await repo.findByGroup(groupId);
          expect(link!.syncStatus).toBe('conflict');

          const { rows } = await pool.query(
            `SELECT payload FROM core.events WHERE event_type = 'integrations.m365.group.field-conflict' AND tenant_id = $1`,
            [tenantId],
          );
          expect(rows.length).toBeGreaterThanOrEqual(1);
          expect(rows[0].payload.group_id).toBe(groupId);
          expect(rows[0].payload.conflict_fields).toContain('name');
        } finally {
          resetCoreDb();
          resetIntegrationsDb();
          await closePools();
        }
      },
    );
  });
});

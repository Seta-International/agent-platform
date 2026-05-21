import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetIntegrationsDb } from '../../src/db/client.ts';
import { runPushGroup } from '../../src/m365/jobs/push-group.ts';
import { createM365GroupLinkRepo } from '../../src/m365/repo.ts';

// Extends the pull-group GraphLike with patch support
interface GraphRequest {
  select(...fields: string[]): GraphRequest;
  filter(expr: string): GraphRequest;
  get(): Promise<unknown>;
  patch(body: unknown): Promise<void>;
}
interface GraphLike {
  api(path: string): GraphRequest;
}

const EXTERNAL_ID = 'm365-push-abc';
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Builds a stub graph client supporting both GET and PATCH.
 * patchCalls is mutated on every patch() invocation so tests can assert calls.
 */
function makeGraphStub(
  overrides: {
    group?: unknown;
    members?: unknown;
    owners?: unknown;
  },
  patchCalls: Array<{ path: string; body: unknown }> = [],
): GraphLike {
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
          if (path.endsWith('/members')) return overrides.members ?? { value: [] };
          if (path.endsWith('/owners')) return overrides.owners ?? { value: [] };
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
        async patch(body: unknown) {
          patchCalls.push({ path, body });
        },
      };
      return self;
    },
  };
}

async function seedTenantAndGroup(pool: import('pg').Pool, name = 'Engineering') {
  const tenantId = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Test Org', $2)`, [
    tenantId,
    `test-${tenantId.slice(0, 8)}`,
  ]);

  const groupId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO planner.groups (id, tenant_id, name, external_source, external_id, created_by)
     VALUES ($1, $2, $3, 'm365', $4, $5)`,
    [groupId, tenantId, name, EXTERNAL_ID, SYSTEM_USER_ID],
  );

  return { tenantId, groupId };
}

describe('runPushGroup', () => {
  it('local wins: PATCH sent with new displayName only', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        resetIntegrationsDb();
        initPools({ databaseUrl });
        try {
          // Seed a group already renamed locally to 'Engineering Renamed'
          const { tenantId, groupId } = await seedTenantAndGroup(pool, 'Engineering Renamed');

          const db = (await import('../../src/db/client.ts')).integrationsDb();
          const repo = createM365GroupLinkRepo({ db: db as never });

          // Snapshot records the old name — remote still has the old name
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
          });

          // Remote still matches snapshot (unchanged)
          const patchCalls: Array<{ path: string; body: unknown }> = [];
          const graphStub = makeGraphStub(
            {
              group: {
                id: EXTERNAL_ID,
                displayName: 'Engineering', // snapshot value — remote hasn't changed
                description: 'Eng team',
                visibility: 'Private',
                theme: 'blue',
              },
            },
            patchCalls,
          );

          await runPushGroup(
            {
              tenant_id: tenantId,
              group_id: groupId,
              changed_fields: ['name'],
            },
            {
              graphClient: graphStub,
              repo,
            },
          );

          // Exactly one PATCH call to the group endpoint
          expect(patchCalls).toHaveLength(1);
          const firstPatch = patchCalls[0]!;
          expect(firstPatch.path).toContain(EXTERNAL_ID);
          expect(firstPatch.body).toEqual({ displayName: 'Engineering Renamed' });
        } finally {
          resetCoreDb();
          resetIntegrationsDb();
          await closePools();
        }
      },
    );
  });

  it('remote wins: local updated via updateGroup, no PATCH sent', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        resetIntegrationsDb();
        initPools({ databaseUrl });
        try {
          // Local still has snapshot name 'Engineering' (no local change)
          const { tenantId, groupId } = await seedTenantAndGroup(pool, 'Engineering');

          const db = (await import('../../src/db/client.ts')).integrationsDb();
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
          });

          // Remote diverged from snapshot — remote-wins
          const patchCalls: Array<{ path: string; body: unknown }> = [];
          const graphStub = makeGraphStub(
            {
              group: {
                id: EXTERNAL_ID,
                displayName: 'Engineering Remote', // remote changed; local didn't
                description: null,
                visibility: 'Private',
                theme: 'blue',
              },
            },
            patchCalls,
          );

          await runPushGroup(
            {
              tenant_id: tenantId,
              group_id: groupId,
              changed_fields: ['name'],
            },
            {
              graphClient: graphStub,
              repo,
            },
          );

          // No PATCH to remote
          expect(patchCalls).toHaveLength(0);

          // Local group was updated to remote value
          const { rows } = await pool.query(`SELECT name FROM planner.groups WHERE id = $1`, [
            groupId,
          ]);
          expect(rows[0].name).toBe('Engineering Remote');
        } finally {
          resetCoreDb();
          resetIntegrationsDb();
          await closePools();
        }
      },
    );
  });

  it('conflict: no PATCH, link status=conflict, field-conflict event emitted', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        resetIntegrationsDb();
        initPools({ databaseUrl });
        try {
          // Local was renamed to 'Engineering Local' — diverged from snapshot
          const { tenantId, groupId } = await seedTenantAndGroup(pool, 'Engineering Local');

          const db = (await import('../../src/db/client.ts')).integrationsDb();
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
          });

          // Remote also diverged to a different name — both sides changed → conflict
          const patchCalls: Array<{ path: string; body: unknown }> = [];
          const graphStub = makeGraphStub(
            {
              group: {
                id: EXTERNAL_ID,
                displayName: 'Engineering Remote', // also changed from snapshot
                description: null,
                visibility: 'Private',
                theme: 'blue',
              },
            },
            patchCalls,
          );

          await runPushGroup(
            {
              tenant_id: tenantId,
              group_id: groupId,
              changed_fields: ['name'],
            },
            {
              graphClient: graphStub,
              repo,
            },
          );

          // No PATCH
          expect(patchCalls).toHaveLength(0);

          // Link status is conflict
          const link = await repo.findByGroup(groupId);
          expect(link!.syncStatus).toBe('conflict');

          // field-conflict event was emitted
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

import { hashRoleSummary, type SessionEnv, type SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { integrationsDb, resetIntegrationsDb } from '../../src/backend/db/client.ts';
import { registerIntegrationsM365Routes } from '../../src/backend/http/m365-routes.ts';
import { createM365GroupLinkRepo } from '../../src/backend/m365/repo.ts';

const registry = buildRegistry(inventoryToManifests(INVENTORY));
function permsFor(roles: string[]): ReadonlySet<string> {
  return resolvePermissions(registry, roles, IMPLICIT_PERMISSIONS);
}

function buildSession(opts: { tenant_id: string; user_id: string; roles: string[] }): SessionScope {
  const role_summary = { roles: opts.roles, cross_tenant_read: false, assignments: [] };
  return {
    session_id: crypto.randomUUID(),
    user_id: opts.user_id,
    tenant_id: opts.tenant_id,
    email: `${opts.user_id}@example.test`,
    display_name: 'Attacker',
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    permissions: permsFor(opts.roles),
    assignments: [],
    group_ids: [],
    product_access: new Set<string>(),
    worker_id: null,
    cross_tenant_read: role_summary.cross_tenant_read,
    built_at: new Date(),
    invalidated_at: null,
  };
}

async function seedTenantAndLinkedGroup(pool: Pool) {
  const tenantId = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Tenant A', $2)`, [
    tenantId,
    `tenant-a-${tenantId.slice(0, 8)}`,
  ]);
  const groupId = crypto.randomUUID();
  const systemUserId = '00000000-0000-0000-0000-000000000000';
  await pool.query(
    `INSERT INTO planner.groups (id, tenant_id, name, external_source, external_id, created_by)
     VALUES ($1, $2, 'Tenant A Group', 'm365', $3, $4)`,
    [groupId, tenantId, 'ext-a', systemUserId],
  );
  return { tenantId, groupId };
}

function testDbOpts() {
  return {
    templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
    baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
  };
}

describe('m365 group routes — tenant scoping', () => {
  it('rejects tenant A groupId for a tenant B caller with a planted planner.group_members row', async () => {
    await withTestDb(testDbOpts(), async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIntegrationsDb();
      initPools({ databaseUrl });
      try {
        const { tenantId: tenantAId, groupId: groupAId } = await seedTenantAndLinkedGroup(pool);

        const m365LinksRepo = createM365GroupLinkRepo({ db: integrationsDb() });
        await m365LinksRepo.upsert({
          tenantId: tenantAId,
          groupId: groupAId,
          externalId: 'ext-a',
          lastSyncedFields: {},
        });

        // Attacker: real session in tenant B holding planner permissions there, plus a
        // planner.group_members row planted directly for tenant A's group — the exploit
        // precondition the reviewer described (isGroupMember is a tenant-blind point query).
        const tenantBId = crypto.randomUUID();
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Tenant B', $2)`, [
          tenantBId,
          `tenant-b-${tenantBId.slice(0, 8)}`,
        ]);
        const attackerId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO planner.group_members (group_id, user_id, role, added_by) VALUES ($1, $2, 'member', $2)`,
          [groupAId, attackerId],
        );

        const session = buildSession({
          tenant_id: tenantBId,
          user_id: attackerId,
          roles: ['planner.member'],
        });

        const addJob = vi.fn().mockResolvedValue(undefined);
        const app = new Hono<SessionEnv>();
        app.use(async (c, next) => {
          c.set('user', session);
          await next();
        });
        registerIntegrationsM365Routes(app, {
          graphClientFor: vi.fn(),
          workers: { addJob, shutdown: vi.fn() },
          m365LinksRepo,
        });

        const refreshRes = await app.request(`/api/integrations/m365/groups/${groupAId}/refresh`, {
          method: 'POST',
        });
        expect(refreshRes.status).not.toBe(200);
        expect(await refreshRes.json()).toMatchObject({ error: 'NOT_LINKED' });
        expect(addJob).not.toHaveBeenCalled();

        const statusRes = await app.request(
          `/api/integrations/m365/groups/${groupAId}/sync-status`,
        );
        expect(statusRes.status).toBe(403);
        expect(await statusRes.json()).toMatchObject({ error: 'FORBIDDEN' });

        const streamRes = await app.request(
          `/api/integrations/m365/groups/${groupAId}/sync-status/stream`,
        );
        expect(streamRes.status).toBe(403);
        expect(await streamRes.json()).toMatchObject({ error: 'FORBIDDEN' });
      } finally {
        resetCoreDb();
        resetIntegrationsDb();
        await closePools();
      }
    });
  });
});

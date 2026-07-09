import { createContributionRegistry, runMigrations } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools, scoped } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { identityDb } from '../../src/backend/db/index.ts';
import { rolePermissionOverlays } from '../../src/backend/db/schema.ts';
import { listTenantRoleOverlays } from '../../src/backend/domain/list-tenant-role-overlays.ts';
import { registerIdentityContributions } from '../../src/register.ts';

function withDb(fn: (ctx: { pool: import('pg').Pool }) => Promise<void>): Promise<void> {
  return withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
        // fallback) — this only opens the executor context identityDb() requires.
        await scoped(crypto.randomUUID(), async () => {
          const reg = createContributionRegistry();
          registerCoreContributions(reg);
          registerIdentityContributions(reg);
          await runMigrations(reg, { pool });
          await fn({ pool });
        });
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );
}

describe('listTenantRoleOverlays', () => {
  it('returns a role→permission→effect overlay for a tenant', async () => {
    await withDb(async () => {
      const tenant = crypto.randomUUID();
      await identityDb()
        .insert(rolePermissionOverlays)
        .values([
          {
            tenant_id: tenant,
            role_slug: 'knowledge.viewer',
            permission_key: 'knowledge.file.update',
            effect: 'grant',
          },
          {
            tenant_id: tenant,
            role_slug: 'knowledge.member',
            permission_key: 'knowledge.file.delete',
            effect: 'revoke',
          },
        ]);
      const overlay = await listTenantRoleOverlays(tenant);
      expect(overlay.get('knowledge.viewer')?.get('knowledge.file.update')).toBe('grant');
      expect(overlay.get('knowledge.member')?.get('knowledge.file.delete')).toBe('revoke');
    });
  });
});

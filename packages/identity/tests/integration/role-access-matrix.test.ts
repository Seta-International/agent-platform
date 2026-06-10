import { createContributionRegistry, runMigrations, type SessionScope } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { identityDb } from '../../src/backend/db/index.ts';
import { rolePermissionOverlays } from '../../src/backend/db/schema.ts';
import { getRoleAccessMatrix } from '../../src/backend/domain/get-role-access-matrix.ts';
import { registerIdentityContributions } from '../../src/register.ts';

function withDb(fn: (ctx: { tenant: string }) => Promise<void>): Promise<void> {
  return withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        registerIdentityContributions(reg);
        await runMigrations(reg, { pool });
        await fn({ tenant: crypto.randomUUID() });
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );
}

const sessionWith = (tenant: string, perms: string[]): SessionScope =>
  ({ tenant_id: tenant, permissions: new Set(perms) }) as unknown as SessionScope;

describe('getRoleAccessMatrix', () => {
  it('reports seedDefault, effective, and overridden per cell', async () => {
    await withDb(async ({ tenant }) => {
      await identityDb().insert(rolePermissionOverlays).values({
        tenant_id: tenant,
        role_slug: 'knowledge.viewer',
        permission_key: 'knowledge.file.write',
        effect: 'grant',
      });
      const matrix = await getRoleAccessMatrix(sessionWith(tenant, ['identity.role.read']), {
        module: 'knowledge',
      });
      const viewer = matrix.find((r) => r.slug === 'knowledge.viewer');
      expect(viewer).toBeDefined();
      const write = viewer?.cells.find((c) => c.permission_key === 'knowledge.file.write');
      const read = viewer?.cells.find((c) => c.permission_key === 'knowledge.file.read');
      const del = viewer?.cells.find((c) => c.permission_key === 'knowledge.file.delete');
      // overlay grant: off-by-seed, now effective + overridden
      expect(write).toMatchObject({ seedDefault: false, effective: true, overridden: true });
      // seed permission, untouched
      expect(read).toMatchObject({ seedDefault: true, effective: true, overridden: false });
      // not granted, not overridden
      expect(del).toMatchObject({ seedDefault: false, effective: false, overridden: false });
    });
  });

  it('excludes foundation + system roles', async () => {
    await withDb(async ({ tenant }) => {
      const matrix = await getRoleAccessMatrix(sessionWith(tenant, ['identity.role.read']));
      const slugs = matrix.map((r) => r.slug);
      expect(slugs).toContain('knowledge.viewer');
      expect(slugs).not.toContain('org.admin');
      expect(slugs).not.toContain('system.integrations.m365');
    });
  });

  it('requires identity.role.read', async () => {
    await withDb(async ({ tenant }) => {
      await expect(getRoleAccessMatrix(sessionWith(tenant, []))).rejects.toThrow(
        /identity.role.read/,
      );
    });
  });
});

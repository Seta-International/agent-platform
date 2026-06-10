import { createContributionRegistry, runMigrations, type SessionScope } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { identityDb } from '../../src/backend/db/index.ts';
import { rolePermissionOverlays } from '../../src/backend/db/schema.ts';
import { getRoleAccessMatrix } from '../../src/backend/domain/get-role-access-matrix.ts';
import { resetRoleToDefaults } from '../../src/backend/domain/reset-role-to-defaults.ts';
import { setRolePermission } from '../../src/backend/domain/set-role-permission.ts';
import { registerIdentityContributions } from '../../src/register.ts';

function withDb(
  fn: (ctx: { tenant: string; pool: import('pg').Pool }) => Promise<void>,
): Promise<void> {
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
        const tenant = crypto.randomUUID();
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Demo', $2)`, [
          tenant,
          `demo-${tenant.slice(0, 8)}`,
        ]);
        await fn({ tenant, pool });
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

const WRITER = ['identity.role.write'];
const overlayRows = (tenant: string) =>
  identityDb()
    .select()
    .from(rolePermissionOverlays)
    .where(eq(rolePermissionOverlays.tenant_id, tenant));

describe('setRolePermission', () => {
  it('granting a perm off-by-seed inserts a grant row and emits the event', async () => {
    await withDb(async ({ tenant, pool }) => {
      const session = sessionWith(tenant, WRITER);
      await setRolePermission(session, {
        role_slug: 'knowledge.viewer',
        permission_key: 'knowledge.file.write',
        enabled: true,
      });
      const rows = await overlayRows(tenant);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        role_slug: 'knowledge.viewer',
        permission_key: 'knowledge.file.write',
        effect: 'grant',
      });
      const events = (
        await pool.query(
          `SELECT payload FROM core.events WHERE event_type = 'identity.role_permissions.changed'`,
        )
      ).rows;
      expect(events).toHaveLength(1);
      expect(events[0].payload.role_slug).toBe('knowledge.viewer');
      expect(events[0].payload.tenant_id).toBe(tenant);
    });
  });

  it('disabling a seed permission inserts a revoke row', async () => {
    await withDb(async ({ tenant }) => {
      await setRolePermission(sessionWith(tenant, WRITER), {
        role_slug: 'knowledge.viewer',
        permission_key: 'knowledge.file.read',
        enabled: false,
      });
      const rows = await overlayRows(tenant);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.effect).toBe('revoke');
    });
  });

  it('setting a cell back to its seed value deletes the overlay row (normalization)', async () => {
    await withDb(async ({ tenant }) => {
      const session = sessionWith(tenant, WRITER);
      // off-by-seed grant, then back to seed-default (disabled) -> row removed
      await setRolePermission(session, {
        role_slug: 'knowledge.viewer',
        permission_key: 'knowledge.file.write',
        enabled: true,
      });
      await setRolePermission(session, {
        role_slug: 'knowledge.viewer',
        permission_key: 'knowledge.file.write',
        enabled: false,
      });
      expect(await overlayRows(tenant)).toHaveLength(0);
    });
  });

  it('rejects foundation and system roles', async () => {
    await withDb(async ({ tenant }) => {
      const session = sessionWith(tenant, WRITER);
      await expect(
        setRolePermission(session, {
          role_slug: 'org.admin',
          permission_key: 'knowledge.file.read',
          enabled: true,
        }),
      ).rejects.toThrow(/not editable/);
      await expect(
        setRolePermission(session, {
          role_slug: 'system.integrations.m365',
          permission_key: 'planner.task.read',
          enabled: false,
        }),
      ).rejects.toThrow(/not editable/);
    });
  });

  it('rejects unknown permission keys', async () => {
    await withDb(async ({ tenant }) => {
      await expect(
        setRolePermission(sessionWith(tenant, WRITER), {
          role_slug: 'knowledge.viewer',
          permission_key: 'knowledge.file.nope',
          enabled: true,
        }),
      ).rejects.toThrow(/unknown permission/);
    });
  });

  it('requires identity.role.write', async () => {
    await withDb(async ({ tenant }) => {
      await expect(
        setRolePermission(sessionWith(tenant, []), {
          role_slug: 'knowledge.viewer',
          permission_key: 'knowledge.file.write',
          enabled: true,
        }),
      ).rejects.toThrow(/identity.role.write/);
    });
  });
});

describe('resetRoleToDefaults', () => {
  it('deletes all overlay rows for the role and emits', async () => {
    await withDb(async ({ tenant, pool }) => {
      const session = sessionWith(tenant, WRITER);
      await setRolePermission(session, {
        role_slug: 'knowledge.viewer',
        permission_key: 'knowledge.file.write',
        enabled: true,
      });
      await setRolePermission(session, {
        role_slug: 'knowledge.viewer',
        permission_key: 'knowledge.file.read',
        enabled: false,
      });
      expect(await overlayRows(tenant)).toHaveLength(2);

      await resetRoleToDefaults(session, { role_slug: 'knowledge.viewer' });
      expect(await overlayRows(tenant)).toHaveLength(0);

      const events = (
        await pool.query(
          `SELECT payload FROM core.events WHERE event_type = 'identity.role_permissions.changed'`,
        )
      ).rows;
      // 2 sets + 1 reset
      expect(events.length).toBe(3);
    });
  });

  it('requires identity.role.write and rejects non-editable roles', async () => {
    await withDb(async ({ tenant }) => {
      await expect(
        resetRoleToDefaults(sessionWith(tenant, []), { role_slug: 'knowledge.viewer' }),
      ).rejects.toThrow(/identity.role.write/);
      await expect(
        resetRoleToDefaults(sessionWith(tenant, WRITER), { role_slug: 'org.admin' }),
      ).rejects.toThrow(/not editable/);
    });
  });
});

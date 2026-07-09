import { requiredPermissionFor } from '@seta/agent-sdk';
import { listMyRolesTool } from '@seta/identity/agent-tools';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { scoped } from '@seta/shared-db';
import { describe, expect, it } from 'vitest';
import { makeToolContext, withAgentTestDb } from '../../helpers.ts';

describe('identity_listMyRoles tool', () => {
  it('returns at least one effective permission for an admin', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
      // fallback) — this only opens the executor context identityDb() requires.
      await scoped(tenant_id, async () => {
        const out = (await listMyRolesTool.execute!(
          {},
          makeToolContext({ user_id: admin_user_id }),
        )) as { permissions: string[] };
        expect(out.permissions.length).toBeGreaterThan(0);
        expect(out.permissions).toContain('identity.profile.read');
      });
    });
  });

  it('is registered with permission identity.profile.read', () => {
    expect(requiredPermissionFor(listMyRolesTool)).toBe('identity.profile.read');
  });
});

import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { describe, expect, it } from 'vitest';
import { listMyRolesTool } from '../../src/backend/tools/identity.list-my-roles.ts';
import { withCopilotTestDb } from '../test-helpers.ts';

describe('identity.listMyRoles tool', () => {
  it('returns at least one effective permission for an admin', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const { admin_user_id } = await createTestTenantWithAdmin({ pool });
      const out = (await listMyRolesTool.execute({ user_id: admin_user_id, type: 'user' }, {})) as {
        permissions: string[];
      };
      expect(out.permissions.length).toBeGreaterThan(0);
      expect(out.permissions).toContain('identity.user.read.self');
    });
  });

  it('has requiredPermission identity.user.read.self', () => {
    expect(listMyRolesTool.requiredPermission).toBe('identity.user.read.self');
  });
});

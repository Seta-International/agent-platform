import { requiredPermissionFor } from '@seta/copilot-sdk';
import { listMyRolesTool } from '@seta/identity/agent-tools';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { describe, expect, it } from 'vitest';
import { makeToolContext, withCopilotTestDb } from '../test-helpers.ts';

describe('identity_listMyRoles tool', () => {
  it('returns at least one effective permission for an admin', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const { admin_user_id } = await createTestTenantWithAdmin({ pool });
      const out = (await listMyRolesTool.execute!(
        {},
        makeToolContext({ user_id: admin_user_id }),
      )) as { permissions: string[] };
      expect(out.permissions.length).toBeGreaterThan(0);
      expect(out.permissions).toContain('identity.user.read.self');
    });
  });

  it('is registered with permission identity.user.read.self', () => {
    expect(requiredPermissionFor(listMyRolesTool)).toBe('identity.user.read.self');
  });
});

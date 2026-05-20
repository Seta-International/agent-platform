import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { describe, expect, it } from 'vitest';
import { whoAmITool } from '../../src/backend/tools/identity.who-am-i.ts';
import { withCopilotTestDb } from '../test-helpers.ts';

describe('identity.whoAmI tool', () => {
  it("returns the caller's profile", async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const { admin_user_id } = await createTestTenantWithAdmin({ pool });
      const out = (await whoAmITool.execute({ user_id: admin_user_id, type: 'user' }, {})) as {
        user_id: string;
        email: string;
      };
      expect(out.user_id).toBe(admin_user_id);
      expect(out.email).toBe('admin@demo.local');
    });
  });

  it('has requiredPermission identity.user.read.self', () => {
    expect(whoAmITool.requiredPermission).toBe('identity.user.read.self');
  });
});

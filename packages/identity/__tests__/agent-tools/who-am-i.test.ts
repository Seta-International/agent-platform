import { requiredPermissionFor } from '@seta/copilot-sdk';
import { whoAmITool } from '@seta/identity/agent-tools';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { describe, expect, it } from 'vitest';
import { makeToolContext, withCopilotTestDb } from '../test-helpers.ts';

describe('identity_whoAmI tool', () => {
  it("returns the caller's profile", async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const { admin_user_id } = await createTestTenantWithAdmin({ pool });
      const out = (await whoAmITool.execute!({}, makeToolContext({ user_id: admin_user_id }))) as {
        user_id: string;
        email: string;
      };
      expect(out.user_id).toBe(admin_user_id);
      expect(out.email).toBe('admin@demo.local');
    });
  });

  it('is registered with permission identity.user.read.self', () => {
    expect(requiredPermissionFor(whoAmITool)).toBe('identity.user.read.self');
  });
});

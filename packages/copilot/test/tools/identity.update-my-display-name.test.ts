import { getUserProfile } from '@seta/identity';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { describe, expect, it } from 'vitest';
import { requiredPermissionFor } from '../../src/backend/tools/_types.ts';
import { updateMyDisplayNameTool } from '../../src/backend/tools/identity.update-my-display-name.ts';
import { makeToolContext, withCopilotTestDb } from '../test-helpers.ts';

describe('identity_updateMyDisplayName tool', () => {
  it('declares requireApproval and persists the new display name on execute', async () => {
    expect(updateMyDisplayNameTool.requireApproval).toBe(true);
    await withCopilotTestDb(async ({ pool }) => {
      const { admin_user_id } = await createTestTenantWithAdmin({ pool });
      await updateMyDisplayNameTool.execute!(
        { displayName: 'New Name' },
        makeToolContext({ user_id: admin_user_id }),
      );
      const profile = await getUserProfile(admin_user_id);
      expect(profile?.display_name).toBe('New Name');
    });
  });

  it('is registered with permission identity.user.write.self', () => {
    expect(requiredPermissionFor(updateMyDisplayNameTool)).toBe('identity.user.write.self');
  });
});

import { getUserProfile } from '@seta/identity';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { describe, expect, it } from 'vitest';
import { updateMyDisplayNameTool } from '../../src/backend/tools/identity.update-my-display-name.ts';
import { withCopilotTestDb } from '../test-helpers.ts';

describe('identity.updateMyDisplayName tool', () => {
  it('marks needsApproval and persists the new display name on execute', async () => {
    expect(updateMyDisplayNameTool.needsApproval).toBe(true);
    await withCopilotTestDb(async ({ pool }) => {
      const { admin_user_id } = await createTestTenantWithAdmin({ pool });
      await updateMyDisplayNameTool.execute(
        { user_id: admin_user_id, type: 'user' },
        { displayName: 'New Name' },
      );
      const profile = await getUserProfile(admin_user_id);
      expect(profile?.display_name).toBe('New Name');
    });
  });

  it('has requiredPermission identity.user.write.self', () => {
    expect(updateMyDisplayNameTool.requiredPermission).toBe('identity.user.write.self');
  });
});

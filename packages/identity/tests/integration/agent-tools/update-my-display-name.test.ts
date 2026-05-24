import { requiredPermissionFor } from '@seta/copilot-sdk';
import { getUserProfile } from '@seta/identity';
import { updateMyDisplayNameTool } from '@seta/identity/agent-tools';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { describe, expect, it } from 'vitest';
import { makeToolContext, withCopilotTestDb } from '../../helpers.ts';

describe('identity_updateMyDisplayName tool', () => {
  it('declares requireApproval and persists the new display name on execute', async () => {
    expect((updateMyDisplayNameTool as { needsApproval?: boolean }).needsApproval).toBe(true);
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

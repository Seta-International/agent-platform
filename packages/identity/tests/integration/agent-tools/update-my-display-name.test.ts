import { requiredPermissionFor } from '@seta/agent-sdk';
import { getUserProfile } from '@seta/identity';
import { updateMyDisplayNameTool } from '@seta/identity/agent-tools';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { scoped } from '@seta/shared-db';
import { describe, expect, it } from 'vitest';
import { makeToolContext, withAgentTestDb } from '../../helpers.ts';

describe('identity_updateMyDisplayName tool', () => {
  it('declares requireApproval and persists the new display name on execute', async () => {
    expect((updateMyDisplayNameTool as { requireApproval?: boolean }).requireApproval).toBe(true);
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      // No appDatabaseUrl here, so scoped()'s tenant GUC is inert (self-host
      // fallback) — this only opens the executor context identityDb() requires.
      await scoped(tenant_id, async () => {
        await updateMyDisplayNameTool.execute!(
          { displayName: 'New Name' },
          makeToolContext({ user_id: admin_user_id }),
        );
        const profile = await getUserProfile(admin_user_id);
        expect(profile?.display_name).toBe('New Name');
      });
    });
  });

  it('is registered with permission identity.profile.update', () => {
    expect(requiredPermissionFor(updateMyDisplayNameTool)).toBe('identity.profile.update');
  });
});

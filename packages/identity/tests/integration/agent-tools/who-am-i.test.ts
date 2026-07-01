import { requiredPermissionFor } from '@seta/agent-sdk';
import { whoAmITool } from '@seta/identity/agent-tools';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { describe, expect, it } from 'vitest';
import { makeToolContext, withAgentTestDb } from '../../helpers.ts';

describe('identity_whoAmI tool', () => {
  it('returns account fields only — no presence or skills in output', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { admin_user_id } = await createTestTenantWithAdmin({ pool });
      const out = (await whoAmITool.execute!(
        {},
        makeToolContext({ user_id: admin_user_id }),
      )) as Record<string, unknown>;
      expect(out.user_id).toBe(admin_user_id);
      expect(out.email).toBe('admin@demo.local');
      // presence + skills MUST NOT be exposed via this tool
      expect(out.availability_status).toBeUndefined();
      expect(out.working_hours).toBeUndefined();
      expect(out.timezone).toBeUndefined();
      expect(out.ooo_until).toBeUndefined();
      expect(out.skills).toBeUndefined();
    });
  });

  it('is registered with permission identity.user.read.self', () => {
    expect(requiredPermissionFor(whoAmITool)).toBe('identity.user.read.self');
  });
});

import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { describe, expect, it } from 'vitest';
import { plannerResolveMemberTool } from '../../../src/backend/agent-tools/resolve-member.ts';
import { makeToolContext, withAgentTestDb } from '../agent-tools-helpers.ts';

async function seedProjection(
  pool: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  tenant_id: string,
  user_id: string,
  display_name: string,
  email: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO planner.assignee_projection
       (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
     VALUES ($1, $2, $3, $4, ARRAY[]::text[], 'available', 'UTC')
     ON CONFLICT (user_id) DO NOTHING`,
    [user_id, tenant_id, display_name, email],
  );
}

describe('planner_resolveMember', () => {
  it('matches active members by display name (case-insensitive, substring)', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const tuan = crypto.randomUUID();
      await seedProjection(pool, tenant_id, tuan, 'Nguyen Tuan', 'tuan@demo.local');
      await seedProjection(pool, tenant_id, crypto.randomUUID(), 'Le Hoa', 'hoa@demo.local');

      const ctx = makeToolContext({
        user_id: admin_user_id,
        tenant_id,
        permissions: ['planner.group.member.read'],
      });
      const out = (await plannerResolveMemberTool.execute!({ query: 'tuan' }, ctx)) as {
        candidates: { userId: string; displayName: string; email: string }[];
      };

      expect(out.candidates).toHaveLength(1);
      expect(out.candidates[0]).toMatchObject({ userId: tuan, displayName: 'Nguyen Tuan' });
    });
  });

  it('is tenant-scoped and excludes deactivated members', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const a = await createTestTenantWithAdmin({ pool, slug: 'tenant-a' });
      const b = await createTestTenantWithAdmin({ pool, slug: 'tenant-b' });
      // Same display name in tenant B — must not leak into tenant A's results.
      await seedProjection(pool, b.tenant_id, crypto.randomUUID(), 'Shared Name', 's@b.local');
      const deactivated = crypto.randomUUID();
      await seedProjection(pool, a.tenant_id, deactivated, 'Shared Name', 's@a.local');
      await pool.query(
        `UPDATE planner.assignee_projection SET deactivated_at = now() WHERE user_id = $1`,
        [deactivated],
      );

      const ctx = makeToolContext({
        user_id: a.admin_user_id,
        tenant_id: a.tenant_id,
        permissions: ['planner.group.member.read'],
      });
      const out = (await plannerResolveMemberTool.execute!({ query: 'Shared Name' }, ctx)) as {
        candidates: { userId: string }[];
      };

      expect(out.candidates).toHaveLength(0);
    });
  });
});

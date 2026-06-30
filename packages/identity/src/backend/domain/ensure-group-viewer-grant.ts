// rbac: system-only — invoked from the planner.group.member.added subscriber; no caller session to gate on.
import { invalidateUserSessions } from '@seta/core';
import { sql } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';

/**
 * Idempotently grants planner.viewer on a group and flushes the member's session
 * scope cache so they can access the group without re-login. Called by the
 * identity subscriber that consumes planner.group.member.added.
 */
export async function ensureGroupViewerGrant(input: {
  tenant_id: string;
  user_id: string;
  group_id: string;
  granted_by: string | null;
}): Promise<void> {
  const grantId = crypto.randomUUID();
  await identityDb().execute(
    sql`INSERT INTO identity.role_grants
          (id, tenant_id, user_id, role_slug, scope_type, scope_id, granted_by, granted_via)
        VALUES
          (${grantId}, ${input.tenant_id}, ${input.user_id}, 'planner.viewer', 'group', ${input.group_id}, ${input.granted_by}, 'admin')
        ON CONFLICT DO NOTHING`,
  );
  await invalidateUserSessions(input.user_id);
}

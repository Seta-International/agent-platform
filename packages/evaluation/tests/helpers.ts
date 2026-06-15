import { hashRoleSummary, type SessionScope } from '@seta/core';
import type { Pool } from 'pg';
import { EVALUATION_PERMISSIONS } from '../src/index.ts';

export const ALL_EVALUATION_PERMS = new Set(EVALUATION_PERMISSIONS) as ReadonlySet<string>;

export function buildSession(opts: { permissions: ReadonlySet<string> }): SessionScope {
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const role_summary = { roles: ['evaluation.admin'], cross_tenant_read: false };
  return {
    session_id: crypto.randomUUID(),
    user_id: userId,
    tenant_id: tenantId,
    email: `eval-test-${userId.slice(0, 8)}@example.test`,
    display_name: 'Eval Test User',
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    permissions: opts.permissions,
    accessible_group_ids: [],
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

export async function readEvents(
  pool: Pool,
  tenantId: string,
  eventType: string,
): Promise<Array<{ payload: Record<string, unknown> }>> {
  const res = await pool.query<{ payload: Record<string, unknown> }>(
    `SELECT payload FROM core.events
     WHERE tenant_id = $1 AND event_type = $2
     ORDER BY id ASC`,
    [tenantId, eventType],
  );
  return res.rows;
}

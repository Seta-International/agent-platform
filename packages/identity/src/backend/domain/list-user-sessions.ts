import { sql } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import type { Actor } from './create-user.ts';

export interface SessionRow {
  session_id: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: Date;
  updated_at: Date;
  is_current: boolean;
}

export interface ListUserSessionsInput {
  tenant_id: string;
  user_id: string;
  current_session_id: string | null;
}

interface RawSessionRow {
  session_id: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  is_current: boolean | null;
}

export async function listUserSessions(
  input: ListUserSessionsInput,
  actor: Actor,
): Promise<SessionRow[]> {
  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    await requirePermission(actor.user_id, 'identity.user.read.any', input.tenant_id);
  }

  // Confirm the subject exists in the caller's tenant before reading sessions.
  const probe = await identityDb().execute(sql`
    SELECT 1 FROM identity."user" WHERE id = ${input.user_id} AND tenant_id = ${input.tenant_id}
  `);
  if (probe.rows.length === 0) {
    throw new IdentityError('NOT_FOUND', 'User not found in tenant');
  }

  const currentId = input.current_session_id;
  const result = await identityDb().execute(sql`
    SELECT s.id AS session_id,
           s.user_agent,
           s.ip_address,
           s.created_at,
           s.updated_at,
           ${currentId ? sql`(s.id = ${currentId}::uuid)` : sql`false`} AS is_current
    FROM identity.session s
    WHERE s.user_id = ${input.user_id}
      AND s.expires_at > now()
    ORDER BY s.updated_at DESC
  `);

  return (result.rows as unknown as RawSessionRow[]).map(
    (r): SessionRow => ({
      session_id: r.session_id,
      user_agent: r.user_agent,
      ip_address: r.ip_address,
      created_at: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
      updated_at: r.updated_at instanceof Date ? r.updated_at : new Date(r.updated_at),
      is_current: r.is_current === true,
    }),
  );
}

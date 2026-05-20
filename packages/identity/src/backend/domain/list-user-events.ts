import { type SQL, sql } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import { ACTIVITY_SUBJECT_PATHS } from './activity-subject-paths.ts';
import type { Actor } from './create-user.ts';

export type ActivityRole = 'actor' | 'subject' | 'all';

export interface ActivityRow {
  event_id: string;
  event_type: string;
  occurred_at: Date;
  summary: string;
  actor_user_id: string | null;
  subject_user_id: string | null;
}

export interface ListUserEventsInput {
  tenant_id: string;
  user_id: string;
  role: ActivityRole;
  limit: number;
  offset: number;
}

interface RawActivityRow {
  event_id: string;
  event_type: string;
  occurred_at: Date | string;
  summary: string | null;
  actor_user_id: string | null;
  subject_user_id: string | null;
}

function summaryCase(): SQL {
  return sql`CASE
    WHEN e.event_type = 'identity.role_grant.changed' THEN
      COALESCE(e.payload->'grant'->>'role_slug', 'role')
        || ' ' || COALESCE(e.payload->>'change', 'changed')
    WHEN e.event_type = 'identity.user.deactivated' THEN 'Deactivated'
    WHEN e.event_type = 'identity.user.email.changed' THEN
      'Email changed (' || COALESCE(e.payload->>'old_email', '?') || ' → ' || COALESCE(e.payload->>'new_email', '?') || ')'
    WHEN e.event_type = 'identity.user.password_reset.by_admin' THEN 'Password reset by admin'
    WHEN e.event_type = 'identity.session.revoked' THEN 'Session revoked'
    WHEN e.event_type = 'identity.user.profile.updated' THEN 'Profile updated'
    WHEN e.event_type = 'identity.user.sso_linked' THEN 'SSO account linked'
    WHEN e.event_type = 'identity.user.sso_revoked' THEN 'SSO access revoked'
    WHEN e.event_type = 'identity.user.created' THEN 'User created'
    ELSE e.event_type
  END`;
}

function subjectPredicate(userId: string): SQL {
  const fragments: SQL[] = [];
  for (const [eventType, path] of Object.entries(ACTIVITY_SUBJECT_PATHS)) {
    if (path == null) continue;
    fragments.push(sql`(e.event_type = ${eventType} AND ${sql.raw(path)} = ${userId})`);
  }
  const first = fragments[0];
  if (!first) return sql`FALSE`;
  let combined: SQL = first;
  for (let i = 1; i < fragments.length; i++) {
    combined = sql`${combined} OR ${fragments[i]}`;
  }
  return sql`(${combined})`;
}

function subjectIdExpression(): SQL {
  let acc: SQL = sql`CASE`;
  for (const [eventType, path] of Object.entries(ACTIVITY_SUBJECT_PATHS)) {
    if (path == null) continue;
    acc = sql`${acc} WHEN e.event_type = ${eventType} THEN ${sql.raw(path)}`;
  }
  return sql`${acc} ELSE NULL END`;
}

export async function listUserEvents(
  input: ListUserEventsInput,
  actor: Actor,
): Promise<{ rows: ActivityRow[]; total: number }> {
  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    await requirePermission(actor.user_id, 'identity.user.read.any', input.tenant_id);
  }

  const actorPred = sql`(e.actor->>'user_id' = ${input.user_id})`;
  const subjectPred = subjectPredicate(input.user_id);
  const rolePred =
    input.role === 'actor'
      ? actorPred
      : input.role === 'subject'
        ? subjectPred
        : sql`(${actorPred} OR ${subjectPred})`;

  const baseWhere = sql`
    WHERE e.tenant_id = ${input.tenant_id}
      AND e.event_type LIKE 'identity.%'
      AND ${rolePred}
  `;

  const rowsRes = await identityDb().execute(sql`
    SELECT e.id AS event_id,
           e.event_type,
           e.occurred_at,
           ${summaryCase()} AS summary,
           e.actor->>'user_id' AS actor_user_id,
           ${subjectIdExpression()} AS subject_user_id
    FROM core.events e
    ${baseWhere}
    ORDER BY e.occurred_at DESC
    LIMIT ${input.limit} OFFSET ${input.offset}
  `);

  const totalRes = await identityDb().execute(sql`
    SELECT count(*)::int AS n FROM core.events e ${baseWhere}
  `);

  const rows = (rowsRes.rows as unknown as RawActivityRow[]).map(
    (r): ActivityRow => ({
      event_id: r.event_id,
      event_type: r.event_type,
      occurred_at: r.occurred_at instanceof Date ? r.occurred_at : new Date(r.occurred_at),
      summary: r.summary ?? r.event_type,
      actor_user_id: r.actor_user_id,
      subject_user_id: r.subject_user_id,
    }),
  );
  const total = (totalRes.rows[0] as { n: number }).n;
  return { rows, total };
}

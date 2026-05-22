import type { Pool } from 'pg';

export interface ListUsersForBackfillInput {
  tenant_id: string;
  cursor: string;
  limit: number;
  pool: Pool;
}

export interface UserBackfillRow {
  user_id: string;
  name: string;
  role: string;
  skills: string[];
}

const ROLE_FALLBACK = 'team member';

/**
 * Keyset-paginated read of active users with non-empty skills for the embedding
 * backfill pipeline. Deactivated users and users without skills are excluded
 * because the embed_user_profile worker also skips them.
 */
export async function listUsersForBackfill(
  input: ListUsersForBackfillInput,
): Promise<UserBackfillRow[]> {
  const result = await input.pool.query<{
    user_id: string;
    name: string;
    role: string | null;
    skills: string[];
  }>(
    `SELECT u.id AS user_id,
            u.name AS name,
            p.role AS role,
            p.skills
       FROM identity."user" u
       JOIN identity.user_profile p ON p.user_id = u.id
      WHERE u.tenant_id = $1
        AND u.deactivated_at IS NULL
        AND array_length(p.skills, 1) > 0
        AND u.id > $2
      ORDER BY u.id
      LIMIT $3`,
    [input.tenant_id, input.cursor, input.limit],
  );
  return result.rows.map((r) => ({
    user_id: r.user_id,
    name: r.name,
    role: r.role ?? ROLE_FALLBACK,
    skills: r.skills,
  }));
}

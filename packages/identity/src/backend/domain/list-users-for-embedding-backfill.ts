import type { Pool } from 'pg';

export interface ListUsersForBackfillInput {
  tenant_id: string;
  cursor: string;
  limit: number;
  pool: Pool;
}

export interface UserBackfillRow {
  user_id: string;
  skills: string[];
}

/**
 * Keyset-paginated read of active users with non-empty skills for the embedding
 * backfill pipeline. Deactivated users and users without skills are excluded
 * because the embed_user_profile worker also skips them.
 *
 * Accepts an injectable pool so the copilot backfill can pass its own pool
 * without sharing the identity Drizzle client.
 */
export async function listUsersForBackfill(
  input: ListUsersForBackfillInput,
): Promise<UserBackfillRow[]> {
  const result = await input.pool.query<UserBackfillRow>(
    `SELECT u.id AS user_id, p.skills
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
  return result.rows;
}

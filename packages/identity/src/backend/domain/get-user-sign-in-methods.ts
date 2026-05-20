import { sql } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';

export async function getUserSignInMethods(userId: string): Promise<string[]> {
  const res = await identityDb().execute(sql`
    SELECT COALESCE(array_agg(DISTINCT provider_id), ARRAY[]::text[]) AS methods
    FROM identity.account
    WHERE user_id = ${userId}
  `);
  const row = res.rows[0] as { methods: string[] | null };
  return row.methods ?? [];
}

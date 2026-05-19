import { sql } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';

export async function searchSkills(
  tenantId: string,
  prefix: string,
  limit: number,
): Promise<ReadonlyArray<string>> {
  const cleanPrefix = prefix.toLowerCase().trim();
  if (cleanPrefix.length === 0) return [];
  const result = await identityDb().execute(sql`
    SELECT DISTINCT skill
    FROM identity.user_profile, unnest(skills) AS skill
    WHERE tenant_id = ${tenantId} AND skill LIKE ${`${cleanPrefix}%`}
    ORDER BY skill
    LIMIT ${limit}
  `);
  return (result.rows as { skill: string }[]).map((r) => r.skill);
}

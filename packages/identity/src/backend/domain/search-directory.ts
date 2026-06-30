import { sql } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';

export interface SearchDirectoryOpts {
  search?: string;
  sign_in_method?: 'credential' | 'microsoft' | 'both';
  limit: number;
  offset: number;
}

export interface DirectoryUserRow {
  user_id: string;
  email: string;
  name: string;
}

const hasProvider = (provider: string) =>
  sql`EXISTS (SELECT 1 FROM identity.account a WHERE a.user_id = u.id AND a.provider_id = ${provider})`;

/**
 * Search the tenant's active user directory for assignment/mention pickers.
 *
 * Unlike `listUsers` (the admin user-management query), this returns only the
 * minimal public fields needed to pick a person and excludes deactivated users.
 * It is readable by any authenticated tenant member (implicit `identity.user.read`)
 * — see the `/api/identity/v1/directory` route — so non-admins (e.g. a Planner
 * Contributor) can assign tasks (FUT-54).
 */
export async function searchDirectory(
  tenantId: string,
  opts: SearchDirectoryOpts,
): Promise<{ rows: ReadonlyArray<DirectoryUserRow>; total: number }> {
  const search = opts.search ? `%${opts.search.toLowerCase()}%` : null;
  const m = opts.sign_in_method;

  const whereClause = sql`
    WHERE u.tenant_id = ${tenantId}
      AND u.deactivated_at IS NULL
      ${search ? sql`AND (lower(u.email) LIKE ${search} OR lower(u.name) LIKE ${search})` : sql``}
      ${m === 'credential' ? sql`AND ${hasProvider('credential')}` : sql``}
      ${m === 'microsoft' ? sql`AND ${hasProvider('microsoft')}` : sql``}
      ${m === 'both' ? sql`AND ${hasProvider('credential')} AND ${hasProvider('microsoft')}` : sql``}
  `;

  const rowsResult = await identityDb().execute(sql`
    SELECT u.id AS user_id, u.email, u.name
    FROM identity."user" u
    ${whereClause}
    ORDER BY u.name ASC
    LIMIT ${opts.limit} OFFSET ${opts.offset}
  `);

  const totalResult = await identityDb().execute(sql`
    SELECT count(*)::int AS n
    FROM identity."user" u
    ${whereClause}
  `);

  const rows = rowsResult.rows as unknown as DirectoryUserRow[];
  const total = (totalResult.rows[0] as { n: number }).n;
  return { rows, total };
}

import { sql } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';

export interface ListUsersOpts {
  search?: string;
  role_slug?: string;
  status?: 'active' | 'deactivated' | 'ooo';
  limit: number;
  offset: number;
}

export interface AdminUserRow {
  user_id: string;
  email: string;
  name: string;
  status: 'active' | 'deactivated' | 'ooo';
  role_slugs: ReadonlyArray<string>;
  last_seen_at: Date | null;
  created_at: Date;
}

interface RawUserRow {
  user_id: string;
  email: string;
  name: string;
  created_at: Date;
  deactivated_at: Date | null;
  last_seen_at: Date | null;
  role_slugs: string[];
  availability_status: 'available' | 'busy' | 'ooo' | null;
}

function toStatus(row: RawUserRow): 'active' | 'deactivated' | 'ooo' {
  if (row.deactivated_at) return 'deactivated';
  if (row.availability_status === 'ooo') return 'ooo';
  return 'active';
}

export async function listUsers(
  tenantId: string,
  opts: ListUsersOpts,
): Promise<{ rows: ReadonlyArray<AdminUserRow>; total: number }> {
  const search = opts.search ? `%${opts.search.toLowerCase()}%` : null;

  const userRolesCte = sql`WITH user_roles AS (
    SELECT user_id, array_agg(DISTINCT role_slug) AS role_slugs
    FROM identity.role_grants
    WHERE tenant_id = ${tenantId} AND revoked_at IS NULL
    GROUP BY user_id
  )`;

  const whereClause = sql`
    WHERE u.tenant_id = ${tenantId}
      ${search ? sql`AND (lower(u.email) LIKE ${search} OR lower(u.name) LIKE ${search})` : sql``}
      ${opts.role_slug ? sql`AND ${opts.role_slug} = ANY(COALESCE(r.role_slugs, ARRAY[]::text[]))` : sql``}
      ${opts.status === 'deactivated' ? sql`AND u.deactivated_at IS NOT NULL` : sql``}
      ${opts.status === 'active' ? sql`AND u.deactivated_at IS NULL AND COALESCE(p.availability_status, 'available') != 'ooo'` : sql``}
      ${opts.status === 'ooo' ? sql`AND u.deactivated_at IS NULL AND p.availability_status = 'ooo'` : sql``}
  `;

  const rowsResult = await identityDb().execute(sql`
    ${userRolesCte},
    user_last_seen AS (
      SELECT user_id, max(updated_at) AS last_seen_at
      FROM identity.session
      GROUP BY user_id
    )
    SELECT u.id AS user_id, u.email, u.name, u.created_at, u.deactivated_at,
           ls.last_seen_at,
           COALESCE(r.role_slugs, ARRAY[]::text[]) AS role_slugs,
           p.availability_status
    FROM identity."user" u
    LEFT JOIN user_roles r ON r.user_id = u.id
    LEFT JOIN user_last_seen ls ON ls.user_id = u.id
    LEFT JOIN identity.user_profile p ON p.user_id = u.id
    ${whereClause}
    ORDER BY u.created_at DESC
    LIMIT ${opts.limit} OFFSET ${opts.offset}
  `);

  const totalResult = await identityDb().execute(sql`
    ${userRolesCte}
    SELECT count(*)::int AS n FROM identity."user" u
    LEFT JOIN user_roles r ON r.user_id = u.id
    LEFT JOIN identity.user_profile p ON p.user_id = u.id
    ${whereClause}
  `);

  const rows = (rowsResult.rows as unknown as RawUserRow[]).map(
    (r): AdminUserRow => ({
      user_id: r.user_id,
      email: r.email,
      name: r.name,
      role_slugs: r.role_slugs,
      last_seen_at: r.last_seen_at,
      created_at: r.created_at,
      status: toStatus(r),
    }),
  );

  const total = (totalResult.rows[0] as { n: number }).n;
  return { rows, total };
}

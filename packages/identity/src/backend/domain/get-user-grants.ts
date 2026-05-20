import { sql } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';

export interface UserGrant {
  id: string;
  role_slug: string;
  scope_type: 'tenant' | 'group';
  scope_id: string | null;
  scope_label: string | null;
  granted_via: 'admin' | 'cli' | 'idp';
  granted_at: Date;
  granted_by_user_id: string | null;
  granted_by_name: string | null;
}

interface RawGrantRow {
  id: string;
  role_slug: string;
  scope_type: 'tenant' | 'group';
  scope_id: string | null;
  scope_label: string | null;
  granted_via: 'admin' | 'cli' | 'idp';
  granted_at: Date | string;
  granted_by_user_id: string | null;
  granted_by_name: string | null;
}

export async function getUserGrants(userId: string): Promise<UserGrant[]> {
  const result = await identityDb().execute(sql`
    SELECT rg.id,
           rg.role_slug,
           rg.scope_type,
           rg.scope_id,
           NULL::text AS scope_label,
           rg.granted_via,
           rg.granted_at,
           rg.granted_by AS granted_by_user_id,
           gb.name AS granted_by_name
    FROM identity.role_grants rg
    LEFT JOIN identity."user" gb ON gb.id = rg.granted_by
    WHERE rg.user_id = ${userId} AND rg.revoked_at IS NULL
    ORDER BY rg.granted_at
  `);
  return (result.rows as unknown as RawGrantRow[]).map(
    (r): UserGrant => ({
      ...r,
      granted_at: r.granted_at instanceof Date ? r.granted_at : new Date(r.granted_at),
    }),
  );
}

// rbac: session-gated only — org unit names/hierarchy are directory-grade, no
// permission check (see docs/platform/rbac.md).
import { and, asc, eq, isNull } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { orgUnitProjection } from '../db/schema.ts';

export interface OrgUnitRow {
  org_unit_id: string;
  name: string;
  parent_id: string | null;
}

export async function listOrgUnits(tenantId: string): Promise<OrgUnitRow[]> {
  const rows = await identityDb()
    .select({
      org_unit_id: orgUnitProjection.org_unit_id,
      name: orgUnitProjection.name,
      parent_id: orgUnitProjection.parent_id,
    })
    .from(orgUnitProjection)
    .where(and(eq(orgUnitProjection.tenant_id, tenantId), isNull(orgUnitProjection.deleted_at)))
    .orderBy(asc(orgUnitProjection.name));
  // `name` is nullable in the schema only to allow a delete-before-create tombstone insert
  // (see org-unit-projection subscribers). The deleted_at IS NULL filter above plus the
  // org_unit_projection_name_required_unless_deleted check constraint guarantee every row that
  // survives here has a non-null name.
  return rows.map((r) => ({ ...r, name: r.name as string }));
}

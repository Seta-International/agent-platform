// rbac: session-gated only — org unit names/hierarchy are directory-grade, no
// permission check (see docs/platform/rbac.md).
import { asc, eq } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { orgUnitProjection } from '../db/schema.ts';

export interface OrgUnitRow {
  org_unit_id: string;
  name: string;
  parent_id: string | null;
}

export async function listOrgUnits(tenantId: string): Promise<OrgUnitRow[]> {
  return identityDb()
    .select({
      org_unit_id: orgUnitProjection.org_unit_id,
      name: orgUnitProjection.name,
      parent_id: orgUnitProjection.parent_id,
    })
    .from(orgUnitProjection)
    .where(eq(orgUnitProjection.tenant_id, tenantId))
    .orderBy(asc(orgUnitProjection.name));
}

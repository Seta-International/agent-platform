import { createHttpEntitySource } from '@seta/shared-ui';

export interface OrgUnitRow {
  org_unit_id: string;
  name: string;
  parent_id: string | null;
}

export const orgUnitSearch = createHttpEntitySource<OrgUnitRow>({
  path: '/api/identity/v1/org-units',
  extract: (json) => (json as { org_units: OrgUnitRow[] }).org_units,
  mapRow: (u) => ({ id: u.org_unit_id, label: u.name }),
});

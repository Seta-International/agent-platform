import { createHttpEntitySearch } from '@seta/shared-ui';

export interface OrgUnitRow {
  org_unit_id: string;
  name: string;
  parent_id: string | null;
}

export const orgUnitSearch = createHttpEntitySearch<OrgUnitRow>({
  path: '/api/identity/v1/org-units',
  extract: (json) => (json as { org_units: OrgUnitRow[] }).org_units,
  mapRow: (u) => ({ value: u.org_unit_id, label: u.name }),
});

import type { SearchableItem, SearchSource } from '@seta/shared-ui';

/** Person identity as an org-chart node renders it — `photo_url` is null when there is no photo. */
export interface OrgPersonRef {
  person_id: string;
  full_name: string;
  photo_url: string | null;
}

export interface OrgUnitNode {
  id: string;
  parent_id: string | null;
  name: string;
  kind: string;
  sort: number;
  head: OrgPersonRef | null;
  members: Array<OrgPersonRef & { job_title: string | null }>;
}

export type CompanyNodeKind =
  | 'executive'
  | 'operation'
  | 'function'
  | 'delivery'
  | 'pmo'
  | 'am'
  | 'account';

export interface CompanyNode {
  id: string;
  parent_id: string | null;
  kind: CompanyNodeKind;
  label: string;
  sublabel?: string;
  count?: number;
  person_id?: string;
  account_id?: string;
  /** Only ever set on `am` nodes — the other kinds render a type glyph, not an avatar. */
  photo_url?: string | null;
}

export interface DeliveryAccount {
  account_id: string;
  name: string;
  am: OrgPersonRef | null;
  projects: Array<{
    project_id: string;
    name: string;
    members: Array<OrgPersonRef & { is_lead: boolean }>;
  }>;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function fetchOrgStructure(): Promise<{ units: OrgUnitNode[] }> {
  const res = await fetch('/api/people/v1/org/structure', { credentials: 'include' });
  return handleResponse<{ units: OrgUnitNode[] }>(res);
}

export async function fetchOrgDelivery(): Promise<{ accounts: DeliveryAccount[] }> {
  const res = await fetch('/api/people/v1/org/delivery', { credentials: 'include' });
  return handleResponse<{ accounts: DeliveryAccount[] }>(res);
}

export async function fetchOrgCompany(): Promise<{ nodes: CompanyNode[] }> {
  const res = await fetch('/api/people/v1/org/company', { credentials: 'include' });
  return handleResponse<{ nodes: CompanyNode[] }>(res);
}

// Org-unit picker source for the worker profile (org_unit_id is the reporting write path;
// there is no dedicated search endpoint, so we flatten the RBAC-scoped structure tree).
function unitOption(u: OrgUnitNode): SearchableItem {
  return { id: u.id, label: u.name };
}

export const searchOrgUnits = {
  source: {
    async search(q: string): Promise<SearchableItem[]> {
      const { units } = await fetchOrgStructure();
      const options = units.map(unitOption);
      const needle = q.trim().toLowerCase();
      return needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
    },
    async bootstrap(): Promise<SearchableItem[]> {
      const { units } = await fetchOrgStructure();
      return units.map(unitOption);
    },
  } satisfies SearchSource<SearchableItem>,
  async seed(ids: string[]): Promise<SearchableItem[]> {
    if (ids.length === 0) return [];
    const { units } = await fetchOrgStructure();
    const wanted = new Set(ids);
    return units.filter((u) => wanted.has(u.id)).map(unitOption);
  },
};

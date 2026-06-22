export interface OrgUnitNode {
  id: string;
  parent_id: string | null;
  name: string;
  kind: string;
  sort: number;
  head: { person_id: string; full_name: string } | null;
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
}

export interface DeliveryAccount {
  account_id: string;
  name: string;
  am: { person_id: string; full_name: string } | null;
  projects: Array<{
    project_id: string;
    name: string;
    members: Array<{ person_id: string; full_name: string; is_lead: boolean }>;
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
function unitOption(u: OrgUnitNode): { value: string; label: string } {
  return { value: u.id, label: u.name };
}

export const searchOrgUnits = {
  async search(q: string): Promise<{ value: string; label: string }[]> {
    const { units } = await fetchOrgStructure();
    const options = units.map(unitOption);
    const needle = q.trim().toLowerCase();
    return needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  },
  async resolveByIds(ids: string[]): Promise<{ value: string; label: string }[]> {
    if (ids.length === 0) return [];
    const { units } = await fetchOrgStructure();
    const wanted = new Set(ids);
    return units.filter((u) => wanted.has(u.id)).map(unitOption);
  },
};

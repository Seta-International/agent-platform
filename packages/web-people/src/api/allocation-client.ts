export interface AllocationGridRow {
  worker_id: string;
  employee_no: string | null;
  full_name: string;
  account_id: string;
  account_name: string;
  project_id: string;
  project_name: string | null;
  bucket: 'billable' | 'internal' | 'bench' | null;
  months: (number | null)[];
  total_mm: number;
}
export interface WorkerMonthTotal {
  worker_id: string;
  totals: number[];
  over_months: number[];
}
export interface AllocationGridKpis {
  avg_utilization: number;
  over_allocated_count: number;
  member_count: number;
  project_count: number;
}
export interface AllocationFacets {
  accounts: { id: string; name: string }[];
  projects: { id: string; name: string; account_id: string }[];
}
export interface EffortByAccount {
  account_id: string;
  account_name: string;
  total_mm: number;
}
export interface AllocationGrid {
  year: number;
  rows: AllocationGridRow[];
  worker_totals: WorkerMonthTotal[];
  kpis: AllocationGridKpis;
  facets: AllocationFacets;
  effort_by_account: EffortByAccount[];
}
export type AllocationStatus = 'over' | 'under';
export type AllocationBucket = 'billable' | 'internal' | 'bench';
export interface AllocationGridFilters {
  year?: number;
  search?: string;
  status?: AllocationStatus;
  accountId?: string;
  projectId?: string;
  bucket?: AllocationBucket;
  /** Full person load across projects for already-visible workers (skips AM/EM row-scope). */
  crossProject?: boolean;
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

export async function fetchAllocationGrid(
  filters: AllocationGridFilters = {},
): Promise<AllocationGrid> {
  const params = new URLSearchParams();
  if (filters.year) params.set('year', String(filters.year));
  if (filters.search) params.set('search', filters.search);
  if (filters.status) params.set('status', filters.status);
  if (filters.accountId) params.set('accountId', filters.accountId);
  if (filters.projectId) params.set('projectId', filters.projectId);
  if (filters.bucket) params.set('bucket', filters.bucket);
  if (filters.crossProject) params.set('crossProject', '1');
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`/api/people/v1/allocation/grid${qs}`, { credentials: 'include' });
  return handleResponse<AllocationGrid>(res);
}

export interface UtilizationSegment {
  project_id: string;
  project_name: string | null;
  pct: number;
}
export interface UtilizationRow {
  worker_id: string;
  employee_no: string | null;
  full_name: string;
  segments: UtilizationSegment[];
  total_pct: number;
  over_allocated: boolean;
  split: { billable: number; internal: number; bench: number };
}
export interface UtilizationByPerson {
  as_of: string;
  rows: UtilizationRow[];
}

export interface UtilizationFilters extends AllocationGridFilters {
  asOf?: string;
}

export async function fetchUtilizationByPerson(
  filters: UtilizationFilters = {},
): Promise<UtilizationByPerson> {
  const params = new URLSearchParams();
  if (filters.asOf) params.set('asOf', filters.asOf);
  if (filters.search) params.set('search', filters.search);
  if (filters.status) params.set('status', filters.status);
  if (filters.accountId) params.set('accountId', filters.accountId);
  if (filters.projectId) params.set('projectId', filters.projectId);
  if (filters.bucket) params.set('bucket', filters.bucket);
  if (filters.crossProject) params.set('crossProject', '1');
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`/api/people/v1/allocation/utilization${qs}`, { credentials: 'include' });
  return handleResponse<UtilizationByPerson>(res);
}

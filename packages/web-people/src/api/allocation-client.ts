export interface AllocationGridRow {
  worker_id: string;
  full_name: string;
  account_id: string;
  account_name: string;
  project_id: string;
  project_name: string | null;
  bucket: 'billable' | 'internal' | 'bench' | null;
  months: (number | null)[];
  ytd_pct: number;
  fy_pct: number;
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
export interface AllocationGrid {
  year: number;
  rows: AllocationGridRow[];
  worker_totals: WorkerMonthTotal[];
  kpis: AllocationGridKpis;
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

export async function fetchAllocationGrid(year?: number): Promise<AllocationGrid> {
  const qs = year ? `?year=${year}` : '';
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

export async function fetchUtilizationByPerson(asOf?: string): Promise<UtilizationByPerson> {
  const qs = asOf ? `?asOf=${asOf}` : '';
  const res = await fetch(`/api/people/v1/allocation/utilization${qs}`, { credentials: 'include' });
  return handleResponse<UtilizationByPerson>(res);
}

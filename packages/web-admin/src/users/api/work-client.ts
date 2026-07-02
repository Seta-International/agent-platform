// Work section data: people (worker profile, org units, pickers) + pm (allocations).
// All keyed by person_id (= worker_id); backend re-checks permissions on every call.

export interface WorkerBrief {
  worker_id: string;
  org_unit_id: string | null;
  org_unit_name: string | null;
  accounts: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
}

export interface WorkerProfile extends WorkerBrief {
  job_title: string | null;
  version: number;
  lifecycle_stage: string | null;
}

export interface WorkerAllocation {
  allocation_id: string;
  project_id: string;
  project_name: string;
  account_id: string;
  account_name: string;
  role: string | null;
  planned_pct: number | null;
  status: 'placeholder' | 'tentative' | 'committed';
}

export interface OrgUnitOption {
  id: string;
  name: string;
}

export interface PickerRow {
  id: string;
  name: string;
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return (res.status === 204 ? undefined : res.json()) as Promise<T>;
}

export const getWorkerProfile = (workerId: string) =>
  get<WorkerProfile>(`/api/people/v1/workers/${workerId}`);

export const listWorkersBrief = async (ids: string[]): Promise<WorkerBrief[]> => {
  if (ids.length === 0) return [];
  const qs = new URLSearchParams({ ids: ids.join(',') });
  const { rows } = await get<{ rows: WorkerBrief[] }>(`/api/people/v1/workers?${qs}`);
  return rows;
};

export const listWorkerAllocations = async (workerId: string): Promise<WorkerAllocation[]> => {
  const qs = new URLSearchParams({ worker_id: workerId });
  const { allocations } = await get<{ allocations: WorkerAllocation[] }>(
    `/api/pm/v1/allocations?${qs}`,
  );
  return allocations;
};

export const patchWorker = (
  workerId: string,
  expectedVersion: number,
  patch: { job_title?: string | null; org_unit_id?: string | null },
) =>
  send<{ worker_id: string; version: number }>(`/api/people/v1/workers/${workerId}`, 'PATCH', {
    expected_version: expectedVersion,
    patch,
  });

export const createWorkerAllocation = (body: {
  project_id: string;
  worker_id: string;
  role?: string | null;
  planned_pct?: number | null;
  date_from?: string | null;
  date_to?: string | null;
  status: 'tentative';
}) => send<{ allocation_id: string }>('/api/pm/v1/allocations', 'POST', body);

export const deleteWorkerAllocation = (allocationId: string) =>
  send<void>(`/api/pm/v1/allocations/${allocationId}`, 'DELETE');

export const listOrgUnits = async (): Promise<OrgUnitOption[]> => {
  const { units } = await get<{ units: Array<{ id: string; name: string }> }>(
    '/api/people/v1/org/structure',
  );
  return units.map((u) => ({ id: u.id, name: u.name }));
};

export const searchAccounts = async (search: string): Promise<PickerRow[]> => {
  const qs = new URLSearchParams();
  if (search) qs.set('search', search);
  const { rows } = await get<{ rows: PickerRow[] }>(`/api/people/v1/accounts?${qs}`);
  return rows;
};

export const searchProjects = async (search: string, accountId?: string): Promise<PickerRow[]> => {
  const qs = new URLSearchParams();
  if (search) qs.set('search', search);
  if (accountId) qs.set('account_id', accountId);
  const { rows } = await get<{ rows: PickerRow[] }>(`/api/people/v1/projects?${qs}`);
  return rows;
};

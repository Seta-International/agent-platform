import { createHttpEntitySearch } from '@seta/shared-ui';

export interface WorkerListRow {
  worker_id: string;
  full_name: string;
  job_title: string | null;
  work_email: string | null;
  phone: string | null;
  gender: string | null;
  lifecycle_stage: string | null;
  onboarding_date: string | null;
  offboarding_date: string | null;
  manager_name: string | null;
  portal_access: boolean;
  accounts: { id: string; name: string }[];
  skills: { id: string; name: string }[];
}

export interface WorkerDetail extends WorkerListRow {
  dob: string | null;
  emergency_contact: string | null;
  version: number;
}

export interface WorkerHistoryEntry {
  at: string;
  action: string;
  field: string;
  from_val: string | null;
  to_val: string | null;
  by_user_id: string;
}

export interface WorkersQuery {
  search?: string;
  status?: string[];
  account_id?: string[];
  project_id?: string[];
  skill_id?: string[];
  sort?: { field: string; dir: 'asc' | 'desc' };
  page?: number;
  pageSize?: number;
}

export interface CreateWorkerInput {
  full_name: string;
  work_email?: string;
  start_date?: string;
  employment_type?: string;
  dob?: string;
  gender?: string;
  phone?: string;
  emergency_contact?: unknown;
}

export interface WorkerPatch {
  full_name?: string;
  work_email?: string;
  phone?: string;
  dob?: string;
  gender?: string;
  emergency_contact?: string;
}

export interface EditWorkerInput {
  expected_version: number;
  patch: WorkerPatch;
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

export async function fetchWorkers(
  query: WorkersQuery = {},
): Promise<{ rows: WorkerListRow[]; total: number }> {
  const qs = new URLSearchParams();
  if (query.search) qs.set('search', query.search);
  if (query.status?.length) qs.set('status', query.status.join(','));
  if (query.account_id?.length) qs.set('account_id', query.account_id.join(','));
  if (query.project_id?.length) qs.set('project_id', query.project_id.join(','));
  if (query.skill_id?.length) qs.set('skill_id', query.skill_id.join(','));
  if (query.sort) qs.set('sort', `${query.sort.field}:${query.sort.dir}`);
  if (query.page !== undefined) qs.set('page', String(query.page));
  if (query.pageSize !== undefined) qs.set('pageSize', String(query.pageSize));

  const url = qs.toString() ? `/api/people/v1/workers?${qs.toString()}` : '/api/people/v1/workers';
  const res = await fetch(url, { credentials: 'include' });
  return handleResponse<{ rows: WorkerListRow[]; total: number }>(res);
}

export async function createWorker(input: CreateWorkerInput): Promise<{ worker_id: string }> {
  const res = await fetch('/api/people/v1/workers', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<{ worker_id: string }>(res);
}

export async function fetchWorker(id: string): Promise<WorkerDetail> {
  const res = await fetch(`/api/people/v1/workers/${id}`, { credentials: 'include' });
  return handleResponse<WorkerDetail>(res);
}

export async function fetchWorkerHistory(id: string): Promise<WorkerHistoryEntry[]> {
  const res = await fetch(`/api/people/v1/workers/${id}/history`, { credentials: 'include' });
  const body = await handleResponse<{ history: WorkerHistoryEntry[] }>(res);
  return body.history;
}

export async function editWorker(id: string, input: EditWorkerInput): Promise<{ version: number }> {
  const res = await fetch(`/api/people/v1/workers/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<{ version: number }>(res);
}

export async function setPortalAccess(
  id: string,
  enabled: boolean,
): Promise<{ portal_access: boolean; changed: boolean }> {
  const res = await fetch(`/api/people/v1/workers/${id}/portal-access`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  return handleResponse<{ portal_access: boolean; changed: boolean }>(res);
}

export interface BulkPortalResult {
  results: Array<{ worker_id: string; status: 'changed' | 'skipped' | 'error'; error?: string }>;
}

export async function setPortalAccessBulk(
  worker_ids: string[],
  enabled: boolean,
): Promise<BulkPortalResult> {
  const res = await fetch('/api/people/v1/workers/portal-access/bulk', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ worker_ids, enabled }),
  });
  return handleResponse<BulkPortalResult>(res);
}

type NameRow = { id: string; name: string };

export const searchSkills = createHttpEntitySearch<NameRow>({
  path: '/api/people/v1/skills',
  extract: (j) => (j as { rows: NameRow[] }).rows,
  mapRow: (r) => ({ value: r.id, label: r.name }),
});

export const searchAccounts = createHttpEntitySearch<NameRow>({
  path: '/api/people/v1/accounts',
  extract: (j) => (j as { rows: NameRow[] }).rows,
  mapRow: (r) => ({ value: r.id, label: r.name }),
});

export const searchPeople = createHttpEntitySearch<WorkerListRow>({
  path: '/api/people/v1/workers',
  extract: (j) => (j as { rows: WorkerListRow[] }).rows,
  mapRow: (w) => ({ value: w.worker_id, label: w.full_name }),
});

export function searchProjects(
  q: string,
  accountIds?: string[],
): Promise<{ value: string; label: string }[]> {
  const extraParams: Record<string, string> = accountIds?.length
    ? { account_id: accountIds.join(',') }
    : {};
  const searcher = createHttpEntitySearch<NameRow>({
    path: '/api/people/v1/projects',
    extract: (j) => (j as { rows: NameRow[] }).rows,
    mapRow: (r) => ({ value: r.id, label: r.name }),
    extraParams,
  });
  return searcher.search(q);
}

export const projectSearch = {
  search: (q: string, accountIds?: string[]) => searchProjects(q, accountIds),
  resolveByIds: createHttpEntitySearch<NameRow>({
    path: '/api/people/v1/projects',
    extract: (j) => (j as { rows: NameRow[] }).rows,
    mapRow: (r) => ({ value: r.id, label: r.name }),
  }).resolveByIds,
};

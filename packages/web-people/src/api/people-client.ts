import { createHttpEntitySearch } from '@seta/shared-ui';

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
] as const;

const GENDER_LABELS: Record<string, string> = Object.fromEntries(
  GENDER_OPTIONS.map((g) => [g.value, g.label]),
);

export function genderLabel(value: string | null | undefined): string {
  return value ? (GENDER_LABELS[value] ?? value) : '—';
}

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
  manager_id: string | null;
  manager_name: string | null;
  accounts: { id: string; name: string }[];
  skills: { id: string; name: string; level: number | null }[];
}

export interface WorkerDetail extends WorkerListRow {
  dob: string | null;
  emergency_contact: string | null;
  version: number;
  org_unit_id: string | null;
  org_unit_name: string | null;
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
  job_title?: string | null;
  org_unit_id?: string | null;
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

export async function addWorkerSkill(
  workerId: string,
  skill_id: string,
  level?: number,
): Promise<void> {
  const res = await fetch(`/api/people/v1/workers/${workerId}/skills`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(level !== undefined ? { skill_id, level } : { skill_id }),
  });
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
}

export async function setWorkerSkillLevel(
  workerId: string,
  skill_id: string,
  level: number | null,
): Promise<void> {
  const res = await fetch(`/api/people/v1/workers/${workerId}/skills/${skill_id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level }),
  });
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
}

export async function removeWorkerSkill(workerId: string, skill_id: string): Promise<void> {
  const res = await fetch(`/api/people/v1/workers/${workerId}/skills/${skill_id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
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

import { createHttpEntitySource, type SearchableItem, type SearchSource } from '@seta/shared-ui';

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
  employee_no: string | null;
  accounts: { id: string; name: string }[];
  skills: { id: string; name: string; level: number | null }[];
  /** App path to the person's M365 photo; null when there is none (avatar renders initials). */
  photo_url: string | null;
}

export interface WorkerDetail extends WorkerListRow {
  dob: string | null;
  personal_email: string | null;
  cv_storage_key: string | null;
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
  personal_email?: string;
  employee_no?: string;
  start_date?: string;
  employment_type?: string;
  dob?: string;
  gender?: string;
  phone?: string;
  emergency_contact?: unknown;
  job_title?: string;
  org_unit_id?: string;
}

export interface WorkerPatch {
  full_name?: string;
  work_email?: string;
  personal_email?: string | null;
  cv_storage_key?: string | null;
  phone?: string;
  dob?: string;
  gender?: string;
  emergency_contact?: string;
  job_title?: string | null;
  org_unit_id?: string | null;
  employee_no?: string | null;
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

function mapNameRow(r: NameRow): SearchableItem {
  return { id: r.id, label: r.name };
}

export const searchSkills = createHttpEntitySource<NameRow>({
  path: '/api/people/v1/skills',
  extract: (j) => (j as { rows: NameRow[] }).rows,
  mapRow: mapNameRow,
});

export const searchAccounts = createHttpEntitySource<NameRow>({
  path: '/api/people/v1/accounts',
  extract: (j) => (j as { rows: NameRow[] }).rows,
  mapRow: mapNameRow,
});

export const searchPeople = createHttpEntitySource<WorkerListRow>({
  path: '/api/people/v1/workers',
  extract: (j) => (j as { rows: WorkerListRow[] }).rows,
  mapRow: (w) => ({ id: w.worker_id, label: w.full_name }),
});

export async function searchProjects(q: string, accountIds?: string[]): Promise<SearchableItem[]> {
  const extraParams: Record<string, string> = accountIds?.length
    ? { account_id: accountIds.join(',') }
    : {};
  return createHttpEntitySource<NameRow>({
    path: '/api/people/v1/projects',
    extract: (j) => (j as { rows: NameRow[] }).rows,
    mapRow: mapNameRow,
    extraParams,
  }).source.search(q);
}

// Cascading project picker: `source` is rebuilt whenever the selected account ids change
// so suggestions stay scoped to those accounts, while `seed` resolves persisted project
// ids to labels across the full catalog (a selection was already account-scoped when made).
export const projectSearch = {
  source: (accountIds?: string[]): SearchSource<SearchableItem> => ({
    search: (q) => searchProjects(q, accountIds),
    bootstrap: () => searchProjects('', accountIds),
  }),
  seed: createHttpEntitySource<NameRow>({
    path: '/api/people/v1/projects',
    extract: (j) => (j as { rows: NameRow[] }).rows,
    mapRow: mapNameRow,
  }).seed,
};

// ---- CV parse & storage ----

export interface WorkerCvDraft {
  full_name: string | null;
  personal_email: string | null;
  phone: string | null;
  dob: string | null;
  gender: 'male' | 'female' | null;
  job_title: string | null;
  skills: Array<{ skill_id: string; skill_name: string }>;
  skill_suggestions: string[];
  summary: string | null;
}

/** Stateless parse: nothing is stored until the reviewer saves the form. */
export async function parseWorkerCvDraft(file: File, model?: string): Promise<WorkerCvDraft> {
  const fd = new FormData();
  fd.set('file', file);
  if (model) fd.set('model', model);
  const res = await fetch('/api/people/v1/cv/parse-draft', {
    method: 'POST',
    credentials: 'include',
    body: fd,
  });
  return (await handleResponse<{ draft: WorkerCvDraft }>(res)).draft;
}

export async function requestWorkerCvUpload(
  workerId: string,
  filename: string,
  contentType: string,
): Promise<{ upload_url: string; s3_key: string }> {
  const res = await fetch(`/api/people/v1/workers/${workerId}/cv/upload-url`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, content_type: contentType }),
  });
  return handleResponse<{ upload_url: string; s3_key: string }>(res);
}

export async function getWorkerCvDownloadUrl(workerId: string): Promise<string> {
  const res = await fetch(`/api/people/v1/workers/${workerId}/cv/download-url`, {
    credentials: 'include',
  });
  return (await handleResponse<{ download_url: string }>(res)).download_url;
}

export async function putToS3(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });
  if (!res.ok) throw new Error(`CV upload failed: HTTP ${res.status}`);
}

export type PerformanceCapacity =
  | { kind: 'am'; account_id: string; label: string }
  | { kind: 'tl'; project_id: string; account_id: string; label: string }
  | { kind: 'member'; project_id: string; account_id: string; label: string };

export type PerformanceContext =
  | { status: 'no_employee_record' }
  | {
      status: 'ok';
      as_of_month: string;
      person: { person_id: string; full_name: string | null; org_unit_id: string | null };
      role_slugs: string[];
      capacities: PerformanceCapacity[];
      default_capacity_index: number;
      /** Session holds people.performance.read_org — gates the org (strategic/PMO) view. */
      can_view_org: boolean;
      /** Session holds people.performance.unlock — gates the PMO manual-unlock panel. */
      can_unlock: boolean;
    };

export async function fetchPerformanceContext(asOfMonth: string): Promise<PerformanceContext> {
  const res = await fetch(
    `/api/people/v1/performance/context?as_of_month=${encodeURIComponent(asOfMonth)}`,
    { credentials: 'include' },
  );
  return handleResponse<PerformanceContext>(res);
}

export type CycleStatus = 'open' | 'makeup' | 'locked' | 'override';

export type CycleStatusResponse = {
  month: string;
  status: CycleStatus;
  evaluated_at: string;
};

// --- Manual cycle unlock (FUT-781) ---------------------------------------
// Types mirror @seta/people contracts (web packages can't import the module).
export type UnlockAction = 'unlock' | 'relock';

export type CycleUnlockEntry = {
  id: string;
  review_month: string;
  account_id: string;
  action: UnlockAction;
  expires_at: string | null;
  actor_person_id: string | null;
  actor_user_id: string;
  created_at: string;
};

export type CycleUnlockAccountState = {
  account_id: string;
  name: string;
  /** ISO deadline of the running window, or null when the account is locked. */
  unlocked_until: string | null;
};

export type CycleUnlockPanelData = {
  /** The only month that may be unlocked now — the latest closed cycle. */
  unlockable_month: string;
  max_days: number;
  accounts: CycleUnlockAccountState[];
  entries: CycleUnlockEntry[];
};

export type CycleUnlockBody = {
  month: string;
  account_id: string;
  days: number;
};

export type CycleRelockBody = {
  month: string;
  account_id: string;
};

export async function fetchCycleUnlockPanel(): Promise<CycleUnlockPanelData> {
  const res = await fetch('/api/people/v1/performance/cycle-unlocks', {
    credentials: 'include',
  });
  return handleResponse<CycleUnlockPanelData>(res);
}

export async function unlockCycle(body: CycleUnlockBody): Promise<CycleUnlockEntry> {
  const res = await fetch('/api/people/v1/performance/cycle-unlocks', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<CycleUnlockEntry>(res);
}

export async function relockCycle(body: CycleRelockBody): Promise<CycleUnlockEntry> {
  const res = await fetch('/api/people/v1/performance/cycle-relocks', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<CycleUnlockEntry>(res);
}

export async function fetchCycleStatus(
  month: string,
  accountId?: string | null,
): Promise<CycleStatusResponse> {
  // A manual unlock is scoped to one account, so the badge needs the account in view.
  const account = accountId ? `&account_id=${encodeURIComponent(accountId)}` : '';
  const res = await fetch(
    `/api/people/v1/performance/cycle-status?month=${encodeURIComponent(month)}${account}`,
    { credentials: 'include' },
  );
  return handleResponse<CycleStatusResponse>(res);
}

export type MonthTaskCard =
  | { kind: 'unscored'; unscored: number; total: number; interactive: boolean }
  | { kind: 'self_assessment'; submitted: boolean; interactive: boolean }
  | { kind: 'morale'; submitted: boolean; interactive: boolean }
  | { kind: 'cycle_locked' };

export type MonthTaskGroup = {
  capacity: PerformanceCapacity;
  label: string;
  cards: MonthTaskCard[];
};

export type MonthTasksResponse = {
  month: string;
  cycle_status: CycleStatus;
  groups: MonthTaskGroup[];
};

export async function fetchMonthTasks(month: string): Promise<MonthTasksResponse> {
  const res = await fetch(
    `/api/people/v1/performance/month-tasks?month=${encodeURIComponent(month)}`,
    { credentials: 'include' },
  );
  return handleResponse<MonthTasksResponse>(res);
}

export type PerformanceConfigCriterion = {
  id: string;
  name: string;
  weight: number;
  sort: number;
};

export type PerformanceConfigGroup = {
  group_id: string;
  code: string;
  name: string;
  sort: number;
  weight: number;
  criteria: PerformanceConfigCriterion[];
};

export type PerformanceConfigResponse = {
  account_id: string;
  revision_no: number;
  revision_id: string;
  applies_to_next_cycle: boolean;
  groups: PerformanceConfigGroup[];
};

export type SavePerformanceConfigBody = {
  base_revision_no: number;
  groups: {
    group_id: string;
    weight: number;
    criteria: {
      name: string;
      weight: number;
      sort?: number;
    }[];
  }[];
};

export async function fetchPerformanceConfig(
  accountId: string,
): Promise<PerformanceConfigResponse> {
  const res = await fetch(`/api/people/v1/performance/accounts/${accountId}/config`, {
    credentials: 'include',
  });
  return handleResponse<PerformanceConfigResponse>(res);
}

export async function savePerformanceConfig(
  accountId: string,
  body: SavePerformanceConfigBody,
): Promise<{ revision_no: number; revision_id: string; applies_to_next_cycle: boolean }> {
  const res = await fetch(`/api/people/v1/performance/accounts/${accountId}/config`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}

export interface AccountListRow {
  account_id: string;
  name: string;
  industry: string | null;
  am_worker_id: string | null;
  recruiter_count: number;
  project_count: number;
}

export interface AccountDetail {
  account_id: string;
  name: string;
  industry: string | null;
  am_worker_id: string | null;
  version: number;
  recruiter_worker_ids: string[];
}

export interface AccountPatch {
  name?: string;
  industry?: string | null;
  am_worker_id?: string | null;
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
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export async function fetchAccounts(): Promise<AccountListRow[]> {
  const res = await fetch('/api/pm/v1/accounts', { credentials: 'include' });
  const body = await handleResponse<{ accounts: AccountListRow[] }>(res);
  return body.accounts;
}

export async function fetchAccount(id: string): Promise<AccountDetail> {
  const res = await fetch(`/api/pm/v1/accounts/${id}`, { credentials: 'include' });
  return handleResponse<AccountDetail>(res);
}

export async function createAccount(input: {
  name: string;
  industry?: string;
  am_worker_id?: string;
  recruiter_worker_ids?: string[];
}): Promise<{ account_id: string }> {
  const res = await fetch('/api/pm/v1/accounts', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<{ account_id: string }>(res);
}

export async function editAccount(
  id: string,
  input: { expected_version?: number; patch: AccountPatch },
): Promise<{ version: number }> {
  const res = await fetch(`/api/pm/v1/accounts/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<{ version: number }>(res);
}

export async function setAccountRecruiters(
  id: string,
  recruiter_worker_ids: string[],
): Promise<{ added: number; removed: number }> {
  const res = await fetch(`/api/pm/v1/accounts/${id}/recruiters`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recruiter_worker_ids }),
  });
  return handleResponse<{ added: number; removed: number }>(res);
}

export interface CharterListRow {
  charter_id: string;
  account_id: string;
  name: string;
  status: 'submitted' | 'approved' | 'rejected' | 'withdrawn';
  pm_worker_id: string | null;
  created_at: string;
}

export interface CharterDetail {
  charter_id: string;
  account_id: string;
  name: string;
  pm_worker_id: string | null;
  pmo_worker_id: string | null;
  budget_bmm: string | null;
  team_size: number | null;
  methodology: 'scrum' | 'kanban' | null;
  pricing_model: 'fixed_price' | 'time_materials' | null;
  date_from: string | null;
  date_to: string | null;
  objective: string | null;
  scope: { in: string; out: string } | null;
  status: 'submitted' | 'approved' | 'rejected' | 'withdrawn';
  rejection_reason: string | null;
  project_id: string | null;
  version: number;
}

export interface SubmitCharterBody {
  account_id: string;
  name: string;
  pm_worker_id: string;
  budget_bmm?: number;
  team_size?: number;
  methodology?: 'scrum' | 'kanban';
  pricing_model?: 'fixed_price' | 'time_materials';
  date_from?: string;
  date_to?: string;
  objective?: string;
  scope?: { in: string; out: string };
}

export async function fetchCharters(): Promise<CharterListRow[]> {
  const res = await fetch('/api/pm/v1/charters', { credentials: 'include' });
  const body = await handleResponse<{ charters: CharterListRow[] }>(res);
  return body.charters;
}

export async function fetchCharter(id: string): Promise<CharterDetail> {
  const res = await fetch(`/api/pm/v1/charters/${id}`, { credentials: 'include' });
  return handleResponse<CharterDetail>(res);
}

export async function submitCharter(input: SubmitCharterBody): Promise<{ charter_id: string }> {
  const res = await fetch('/api/pm/v1/charters', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<{ charter_id: string }>(res);
}

export async function approveCharter(
  id: string,
  expected_version?: number,
): Promise<{ project_id: string }> {
  const res = await fetch(`/api/pm/v1/charters/${id}/approve`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_version }),
  });
  return handleResponse<{ project_id: string }>(res);
}

export async function rejectCharter(
  id: string,
  reason: string,
  expected_version?: number,
): Promise<{ version: number }> {
  const res = await fetch(`/api/pm/v1/charters/${id}/reject`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason, expected_version }),
  });
  return handleResponse<{ version: number }>(res);
}

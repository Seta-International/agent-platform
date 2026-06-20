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
    throw new Error(message);
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

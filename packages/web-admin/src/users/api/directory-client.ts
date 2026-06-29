export interface DirectoryRow {
  person_id: string;
  full_name: string;
  work_email: string | null;
  job_title: string | null;
  employment_status: 'active' | 'terminated';
  account_status: 'none' | 'active' | 'suspended';
  user_id: string | null;
  roles: string[];
}

export interface DirectoryPage {
  rows: DirectoryRow[];
  page: number;
  hasMore: boolean;
}

export async function listDirectory(
  p: { search?: string; status?: string; page?: number } = {},
): Promise<DirectoryPage> {
  const qs = new URLSearchParams();
  if (p.search) qs.set('search', p.search);
  if (p.status) qs.set('status', p.status);
  if (p.page !== undefined) qs.set('page', String(p.page));
  const res = await fetch(`/api/identity/v1/directory?${qs}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`directory failed: ${res.status}`);
  return res.json() as Promise<DirectoryPage>;
}

async function post<T = unknown>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const provisionAccount = (personId: string) =>
  post(`/api/identity/v1/directory/${personId}/provision`);

export const suspendAccount = (userId: string) => post(`/api/identity/v1/users/${userId}/suspend`);

export const reactivateAccount = (userId: string) =>
  post(`/api/identity/v1/users/${userId}/reactivate`);

export interface BulkRoleBody {
  user_ids: string[];
  role_slug: string;
  action: 'grant' | 'revoke';
  scope_type?: 'tenant' | 'group';
  scope_id?: string | null;
}

export const bulkRole = (body: BulkRoleBody) =>
  post('/api/identity/v1/users/bulk-role-grants', { scope_type: 'tenant', ...body });

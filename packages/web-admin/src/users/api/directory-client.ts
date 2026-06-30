export interface DirectoryRow {
  person_id: string;
  full_name: string;
  work_email: string | null;
  job_title: string | null;
  employment_status: 'active' | 'terminated';
  account_status: 'none' | 'active' | 'suspended';
  user_id: string | null;
  roles: string[];
  groups: string[];
}

export interface DirectoryPage {
  rows: DirectoryRow[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  total: number;
}

export interface DirectoryFilters {
  search?: string;
  status?: string;
  employment?: string;
  group_id?: string;
  page?: number;
  pageSize?: number;
}

export async function listDirectory(p: DirectoryFilters = {}): Promise<DirectoryPage> {
  const qs = new URLSearchParams();
  if (p.search) qs.set('search', p.search);
  if (p.status) qs.set('status', p.status);
  if (p.employment) qs.set('employment', p.employment);
  if (p.group_id) qs.set('group_id', p.group_id);
  if (p.page !== undefined) qs.set('page', String(p.page));
  if (p.pageSize !== undefined) qs.set('pageSize', String(p.pageSize));
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

export interface BulkRoleResult {
  granted: number;
  revoked: number;
  skipped: number;
  failed: { user_id: string; reason: string }[];
}

export const bulkRole = (body: BulkRoleBody) =>
  post<BulkRoleResult>('/api/identity/v1/users/bulk-role-grants', {
    scope_type: 'tenant',
    ...body,
  });

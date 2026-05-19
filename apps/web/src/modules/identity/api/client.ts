export interface SessionScopeProjection {
  user_id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  role_summary: { roles: string[]; cross_tenant_read: boolean };
  accessible_group_ids: ReadonlyArray<string>;
  cross_tenant_read: boolean;
}

export async function fetchMe(signal?: AbortSignal): Promise<SessionScopeProjection | null> {
  const res = await fetch('/api/identity/v1/me', { credentials: 'include', signal });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`/me failed: ${res.status}`);
  return res.json() as Promise<SessionScopeProjection>;
}

export interface ProfileDto {
  user_id: string;
  tenant_id: string;
  display_name: string;
  email: string;
  availability_status: 'available' | 'busy' | 'ooo';
  ooo_until: string | null;
  timezone: string;
  working_hours: { start: string; end: string } | null;
  skills: string[];
  updated_at: string;
  deactivated_at: string | null;
}

export interface ProfilePatch {
  display_name?: string;
  availability_status?: 'available' | 'busy' | 'ooo';
  ooo_until?: string | null;
  timezone?: string;
  skills?: string[];
}

export async function fetchProfile(): Promise<ProfileDto> {
  const res = await fetch('/api/identity/v1/profile', { credentials: 'include' });
  if (!res.ok) throw new Error(`profile fetch failed: ${res.status}`);
  return res.json() as Promise<ProfileDto>;
}

export async function patchProfile(patch: ProfilePatch): Promise<ProfileDto> {
  const res = await fetch('/api/identity/v1/profile', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`profile patch failed: ${res.status}`);
  return res.json() as Promise<ProfileDto>;
}

export async function searchSkillsApi(prefix: string, limit = 20): Promise<string[]> {
  const res = await fetch(
    `/api/identity/v1/skills?prefix=${encodeURIComponent(prefix)}&limit=${limit}`,
    { credentials: 'include' },
  );
  if (!res.ok) throw new Error(`skills search failed: ${res.status}`);
  return ((await res.json()) as { results: string[] }).results;
}

export interface AdminUserListRow {
  user_id: string;
  email: string;
  name: string;
  status: 'active' | 'deactivated' | 'ooo';
  role_slugs: string[];
  last_seen_at: string | null;
  created_at: string;
}

export interface AdminUserGrant {
  id: string;
  role_slug: string;
  scope_type: 'tenant' | 'group';
  scope_id: string | null;
  granted_via: 'admin' | 'cli' | 'idp';
  granted_at: string;
}

export interface AdminUserDetail {
  profile: ProfileDto;
  grants: AdminUserGrant[];
}

export async function listAdminUsers(params: {
  search?: string;
  role?: string;
  status?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: AdminUserListRow[]; total: number }> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') q.set(k, String(v));
  }
  const res = await fetch(`/api/identity/v1/users?${q}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`list users failed: ${res.status}`);
  return res.json() as Promise<{ rows: AdminUserListRow[]; total: number }>;
}

export async function createAdminUser(body: {
  email: string;
  name: string;
  password: string;
  initial_role?: string;
}): Promise<{ user_id: string }> {
  const res = await fetch('/api/identity/v1/users', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(
      ((await res.json()) as { message?: string }).message ?? `create failed: ${res.status}`,
    );
  return res.json() as Promise<{ user_id: string }>;
}

export async function getAdminUserDetail(userId: string): Promise<AdminUserDetail> {
  const res = await fetch(`/api/identity/v1/users/${userId}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`detail failed: ${res.status}`);
  return res.json() as Promise<AdminUserDetail>;
}

export async function grantTenantRole(userId: string, role_slug: string): Promise<void> {
  const res = await fetch(`/api/identity/v1/users/${userId}/role-grants`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role_slug, scope_type: 'tenant' }),
  });
  if (!res.ok) throw new Error(`grant failed: ${res.status}`);
}

export async function revokeGrant(grantId: string): Promise<void> {
  const res = await fetch(`/api/identity/v1/role-grants/${grantId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`revoke failed: ${res.status}`);
}

export async function deactivateAdminUser(
  userId: string,
  action: 'deactivate' | 'reactivate',
): Promise<void> {
  const res = await fetch(`/api/identity/v1/users/${userId}/${action}`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`${action} failed: ${res.status}`);
}

export async function discoverProvider(
  email: string,
): Promise<{ provider_id: string; redirect_url?: string }> {
  const res = await fetch('/api/identity/v1/auth/discover', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(`discover failed: ${res.status}`);
  return res.json() as Promise<{ provider_id: string; redirect_url?: string }>;
}

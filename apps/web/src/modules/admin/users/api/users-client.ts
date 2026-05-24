import {
  listTenantUsers,
  type ProfileDto,
  type ProfilePatch,
  type TenantUserRow,
} from '@/modules/identity/api/client.ts';

export type AdminUserListRow = TenantUserRow;
export const listAdminUsers = listTenantUsers;

export interface AdminUserGrant {
  id: string;
  role_slug: string;
  scope_type: 'tenant' | 'group';
  scope_id: string | null;
  scope_label: string | null;
  granted_via: 'admin' | 'cli' | 'idp';
  granted_at: string;
  granted_by_user_id: string | null;
  granted_by_name: string | null;
}

export interface AdminUserDetail {
  profile: ProfileDto;
  grants: AdminUserGrant[];
  sign_in_methods?: string[];
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

export async function patchAdminUserProfile(
  userId: string,
  patch: ProfilePatch,
): Promise<ProfileDto> {
  const res = await fetch(`/api/identity/v1/users/${userId}/profile`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`admin profile patch failed: ${res.status}`);
  return res.json() as Promise<ProfileDto>;
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

export async function grantRoleScoped(
  userId: string,
  role_slug: string,
  scope_type: 'tenant' | 'group',
  scope_id: string | null,
): Promise<void> {
  const res = await fetch(`/api/identity/v1/users/${userId}/role-grants`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role_slug, scope_type, scope_id }),
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

export interface AdminUserSession {
  session_id: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  updated_at: string;
  is_current: boolean;
}

export async function listUserSessionsApi(userId: string): Promise<AdminUserSession[]> {
  const res = await fetch(`/api/identity/v1/users/${userId}/sessions`, { credentials: 'include' });
  if (!res.ok) throw new Error(`sessions failed: ${res.status}`);
  return ((await res.json()) as { rows: AdminUserSession[] }).rows;
}

export async function revokeUserSessionApi(userId: string, sessionId: string): Promise<void> {
  const res = await fetch(`/api/identity/v1/users/${userId}/sessions/${sessionId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (res.status === 409) throw new Error('Cannot revoke your own session here.');
  if (!res.ok) throw new Error(`revoke session failed: ${res.status}`);
}

export async function resetUserPasswordApi(userId: string): Promise<{ password: string }> {
  const res = await fetch(`/api/identity/v1/users/${userId}/reset-password`, {
    method: 'POST',
    credentials: 'include',
  });
  if (res.status === 409) throw new Error('User has no local password (SSO-only).');
  if (!res.ok) throw new Error(`reset-password failed: ${res.status}`);
  return (await res.json()) as { password: string };
}

export interface ActivityRow {
  event_id: string;
  event_type: string;
  occurred_at: string;
  summary: string;
  actor_user_id: string | null;
  subject_user_id: string | null;
}

export async function listUserActivityApi(
  userId: string,
  role: 'actor' | 'subject' | 'all' = 'all',
  limit = 25,
  offset = 0,
): Promise<{ rows: ActivityRow[]; total: number }> {
  const q = new URLSearchParams({ role, limit: String(limit), offset: String(offset) });
  const res = await fetch(`/api/identity/v1/users/${userId}/activity?${q}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`activity failed: ${res.status}`);
  return (await res.json()) as { rows: ActivityRow[]; total: number };
}

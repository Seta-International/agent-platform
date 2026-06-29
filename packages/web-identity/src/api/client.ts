export interface SessionScopeProjection {
  user_id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  email: string;
  display_name: string;
  role_summary: { roles: string[]; cross_tenant_read: boolean };
  permissions: string[];
  features: string[];
  accessible_group_ids: ReadonlyArray<string>;
  cross_tenant_read: boolean;
  tenant_local_password_disabled: boolean;
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
  bio: string | null;
  updated_at: string;
  deactivated_at: string | null;
}

export interface ProfilePatch {
  display_name?: string;
  availability_status?: 'available' | 'busy' | 'ooo';
  ooo_until?: string | null;
  timezone?: string;
  working_hours?: { start: string; end: string } | null;
  skills?: string[];
  bio?: string | null;
}

export type SaveProfile = (patch: ProfilePatch) => Promise<ProfileDto>;

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
    `/api/identity/v1/skill-search?prefix=${encodeURIComponent(prefix)}&limit=${limit}`,
    { credentials: 'include' },
  );
  if (!res.ok) throw new Error(`skills search failed: ${res.status}`);
  return ((await res.json()) as { results: string[] }).results;
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

export interface TenantUserRow {
  user_id: string;
  email: string;
  name: string;
}

// Searches the read-only people directory (`/directory`), readable by any
// authenticated tenant member — used by assignee/mention pickers. This is NOT the
// admin user-management endpoint (`/users`), so non-admins (e.g. a Planner
// Contributor) can assign tasks (FUT-54).
export async function listTenantUsers(params: {
  search?: string;
  sign_in_method?: 'credential' | 'microsoft' | 'both';
  limit: number;
  offset: number;
}): Promise<{ rows: TenantUserRow[]; total: number }> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') q.set(k, String(v));
  }
  const res = await fetch(`/api/identity/v1/directory?${q}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`directory search failed: ${res.status}`);
  return res.json() as Promise<{ rows: TenantUserRow[]; total: number }>;
}

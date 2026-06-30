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
  product_access: string[];
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

// Shape returned by GET /api/people/v1/me/profile
export interface PeopleMyProfile {
  availability_status: 'available' | 'busy' | 'ooo';
  ooo_until: string | null;
  timezone: string;
  working_hours: { start: string; end: string } | null;
  skills: string[];
  bio: string | null;
  full_name: string | null;
}

async function fetchPeopleProfile(): Promise<PeopleMyProfile> {
  const res = await fetch('/api/people/v1/me/profile', { credentials: 'include' });
  if (!res.ok) throw new Error(`people /me/profile failed: ${res.status}`);
  return res.json() as Promise<PeopleMyProfile>;
}

// View-model composed from identity (account) + People (HR fields)
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

// Compose from identity /me (account fields) + People /me/profile (HR fields)
export async function fetchProfile(): Promise<ProfileDto> {
  const [me, people] = await Promise.all([fetchMe(), fetchPeopleProfile()]);
  if (!me) throw new Error('not authenticated');
  return {
    user_id: me.user_id,
    tenant_id: me.tenant_id,
    display_name: me.display_name,
    email: me.email,
    availability_status: people.availability_status,
    ooo_until: people.ooo_until,
    timezone: people.timezone,
    working_hours: people.working_hours,
    skills: people.skills,
    bio: people.bio,
    updated_at: new Date().toISOString(),
    deactivated_at: null,
  };
}

// Fan out: display_name → identity, HR fields → People endpoints
export async function patchProfile(patch: ProfilePatch): Promise<ProfileDto> {
  const calls: Promise<void>[] = [];

  // identity: display_name only
  if (patch.display_name !== undefined) {
    calls.push(
      fetch('/api/identity/v1/profile', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ display_name: patch.display_name }),
      }).then((r) => {
        if (!r.ok) throw new Error(`identity profile patch failed: ${r.status}`);
      }),
    );
  }

  // People presence: availability_status, ooo_until, timezone, working_hours
  const presencePatch: Record<string, unknown> = {};
  if (patch.availability_status !== undefined)
    presencePatch.availability_status = patch.availability_status;
  if (patch.ooo_until !== undefined) presencePatch.ooo_until = patch.ooo_until;
  if (patch.timezone !== undefined) presencePatch.timezone = patch.timezone;
  if (patch.working_hours !== undefined) presencePatch.working_hours = patch.working_hours;
  if (Object.keys(presencePatch).length > 0) {
    calls.push(
      fetch('/api/people/v1/me/presence', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(presencePatch),
      }).then((r) => {
        if (!r.ok) throw new Error(`presence patch failed: ${r.status}`);
      }),
    );
  }

  // People bio
  if (patch.bio !== undefined) {
    calls.push(
      fetch('/api/people/v1/me/bio', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bio: patch.bio }),
      }).then((r) => {
        if (!r.ok) throw new Error(`bio patch failed: ${r.status}`);
      }),
    );
  }

  // People skills
  if (patch.skills !== undefined) {
    calls.push(
      fetch('/api/people/v1/me/skills', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ skills: patch.skills }),
      }).then((r) => {
        if (!r.ok) throw new Error(`skills put failed: ${r.status}`);
      }),
    );
  }

  await Promise.all(calls);
  return fetchProfile();
}

// Skill catalog search via People; returns catalog names (catalog-constrained for PUT /me/skills)
export async function searchSkillsApi(prefix: string, limit = 20): Promise<string[]> {
  const res = await fetch(
    `/api/people/v1/skills?search=${encodeURIComponent(prefix)}&pageSize=${limit}`,
    { credentials: 'include' },
  );
  if (!res.ok) throw new Error(`skills search failed: ${res.status}`);
  const data = (await res.json()) as { rows: { id: string; name: string }[] };
  return data.rows.map((r) => r.name);
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

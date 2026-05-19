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
